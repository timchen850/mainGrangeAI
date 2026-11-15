// Grange AI — proposal generator (server-side AI proxy)
//
// Why this lives on the server: the AI API key must NEVER ship to the browser. This Edge Function
// authenticates the user, spends one draft credit against their plan, then calls Gemini (primary)
// with a Groq fallback and ALWAYS streams back in Gemini's SSE shape so the frontend parser is
// unchanged.
//
// Nov 15 2026: this file replaces BOTH earlier versions (supabase/live/generate-proposal.ts, the
// v9 that was running, and the old plan-based draft here). It keeps every live fix (Gemini retries
// on 500/503, thinking off, 20 s start deadlines, the Groq relay that reads through reasoning-only
// chunks, <think> stripping) and closes the review findings:
//   1. Usage is written with the SERVICE ROLE through consume_proposal_credit(): one atomic
//      statement, so a user cannot reset the counter and two tabs cannot both slip under the cap.
//   2. Limits follow the plan the cards promise: Free 2 drafts a month, Starter 15, Pro unlimited.
//      One "Generate" makes up to 3 calls (plan, draft, polish), so a draft is 3 credits.
//   3. The request body is validated: only user-role text parts and a few generationConfig fields
//      pass through, capped in size, so this is not a general-purpose Gemini proxy.
//   4. A short-window rate limit (bump_rate_limit) stops a script from burning the shared quota.
//   5. Dead code removed: the send-email call (no such function is deployed) and the daily cap.
//
// Secrets: GEMINI_API_KEY (required), GROQ_API_KEY (optional fallback).
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// Deploy: supabase functions deploy generate-proposal --no-verify-jwt   (after the Nov 15 migration)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonFor } from '../_shared/cors.ts';
import { bumpRateLimit, rateLimitMessage } from '../_shared/ratelimit.ts';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GROQ_MODEL = 'openai/gpt-oss-120b';   // llama-3.3-70b-versatile was shut down on Aug 16 2026
const GEMINI_RETRY_MS = [1200, 2500];       // waits before the 2nd and 3rd Gemini attempts (500/503 only)
const START_TIMEOUT_MS = 20000;             // how long a provider gets to start its response

// Monthly draft limits per plan, as the plan cards state them (Pro = no cap).
const TIER_DRAFTS: Record<string, number | null> = { free: 2, starter: 15, pro: null };
const CALLS_PER_DRAFT = 3;
// Burst limit regardless of plan: 15 calls (5 drafts' worth) in any 10 minutes.
const BURST_LIMIT = 15, BURST_WINDOW_S = 600;
// Prompt size cap: the full draft prompt (profile + funder call + exemplars + plan) stays well under this.
const MAX_PROMPT_CHARS = 120_000;
const MAX_OUTPUT_TOKENS = 8192;

const geminiChunk = (text: string) =>
  `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// fetch that gives up if the response hasn't started within ms (the body may stream for longer).
async function fetchStart(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); }
  finally { clearTimeout(timer); }
}

/** Accept only the shape the app sends; drop anything else (tools, system instructions, safety
 *  overrides, cached content...). Returns null if the body is not a plain text prompt. */
function sanitizeBody(raw: any): { contents: any[]; generationConfig: Record<string, unknown> } | null {
  if (!raw || !Array.isArray(raw.contents) || !raw.contents.length) return null;
  let total = 0;
  const contents = [];
  for (const c of raw.contents.slice(0, 4)) {
    if (!c || !Array.isArray(c.parts)) return null;
    const parts = [];
    for (const p of c.parts.slice(0, 8)) {
      if (!p || typeof p.text !== 'string') return null;   // no inlineData / fileData / functionCall
      total += p.text.length;
      parts.push({ text: p.text });
    }
    if (!parts.length) return null;
    contents.push({ role: 'user', parts });
  }
  if (total === 0 || total > MAX_PROMPT_CHARS) return null;
  const g = raw.generationConfig || {};
  const temperature = Number.isFinite(+g.temperature) ? Math.min(2, Math.max(0, +g.temperature)) : 0.7;
  const maxOutputTokens = Number.isFinite(+g.maxOutputTokens) ? Math.min(MAX_OUTPUT_TOKENS, Math.max(256, Math.trunc(+g.maxOutputTokens))) : 4096;
  const thinkingBudget = Number.isFinite(+g?.thinkingConfig?.thinkingBudget) ? Math.min(4096, Math.max(0, Math.trunc(+g.thinkingConfig.thinkingBudget))) : 0;
  return { contents, generationConfig: { temperature, maxOutputTokens, thinkingConfig: { thinkingBudget } } };
}

Deno.serve(async (req: Request) => {
  const { cors, json, preflight } = jsonFor(req);
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const sse = (body: BodyInit) => new Response(body, { status: 200, headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });

  // ── 1. Authenticate ─────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  // ── 2. Parse and validate the request before spending anything ──
  let raw: any;
  try { raw = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const body = sanitizeBody(raw);
  if (!body) return json({ error: 'Unsupported request: send a text prompt in contents[].parts[].text.' }, 400);

  // ── 3. Limits: burst (any plan) then the plan's monthly draft credits ──
  const burst = await bumpRateLimit('generate-proposal', user.id, BURST_LIMIT, BURST_WINDOW_S);
  if (!burst.allowed) return json({ error: rateLimitMessage('drafting', burst) }, 429);

  const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: prof } = await sbAdmin.from('profiles').select('tier').eq('user_id', user.id).maybeSingle();
  const tier: string = TIER_DRAFTS[(prof?.tier as string) || ''] !== undefined ? (prof!.tier as string) : 'free';
  const drafts = TIER_DRAFTS[tier];
  const monthlyLimit = drafts === null ? null : drafts * CALLS_PER_DRAFT;

  const today = new Date().toISOString().slice(0, 10);   // the month boundary is UTC; the app shows it in local time
  let credited = false;
  {
    const { data, error } = await sbAdmin.rpc('consume_proposal_credit', { p_user_id: user.id, p_monthly_limit: monthlyLimit, p_today: today });
    if (error) {
      // The migration is not applied yet: say so in the logs and draft anyway rather than block every user.
      console.error('consume_proposal_credit failed (apply migration 20261115)', error.message);
    } else {
      const row = Array.isArray(data) ? data[0] : data;
      if (row && row.allowed === false) {
        const upgrade = tier === 'free' ? ' Upgrade to Starter for 15 drafts a month.' : tier === 'starter' ? ' Upgrade to Pro for unlimited drafts.' : '';
        return json({ error: `Monthly limit reached (${drafts} drafts a month on the ${tier} plan).${upgrade}`, code: 'monthly_limit', tier }, 429);
      }
      credited = true;
    }
  }
  const refund = async () => { if (credited) await sbAdmin.rpc('refund_proposal_credit', { p_user_id: user.id, p_today: today }).catch(() => {}); };

  // ── 4. Primary: Gemini (stream straight through) ───────────────
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (geminiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${geminiKey}`;
    for (let attempt = 0; attempt <= GEMINI_RETRY_MS.length; attempt++) {
      if (attempt > 0) await sleep(GEMINI_RETRY_MS[attempt - 1]);
      try {
        const res = await fetchStart(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, START_TIMEOUT_MS);
        if (res.ok && res.body) return sse(res.body);
        console.error('Gemini failed', res.status, 'attempt', attempt + 1, await res.text().catch(() => ''));
        if (![500, 503].includes(res.status)) break;   // only "high demand" clears in seconds; a 429 quota error doesn't
      } catch (e) { console.error('Gemini threw or timed out', e); break; }   // a stall won't clear in seconds: go to Groq
    }
  }

  // ── 5. Fallback: Groq (translate prompt + re-emit as Gemini SSE) ──
  const groqKey = Deno.env.get('GROQ_API_KEY');
  if (groqKey) {
    try {
      const prompt = body.contents.flatMap((c: any) => c.parts.map((p: any) => p.text)).join('\n');
      const maxOut = Number(body.generationConfig.maxOutputTokens) || 2048;
      const res = await fetchStart('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({ model: GROQ_MODEL, stream: true,
          temperature: body.generationConfig.temperature,
          // gpt-oss reasons before it answers, and those tokens count against this cap: leave room,
          // but stay well inside Groq's free-tier tokens-per-minute limit.
          max_completion_tokens: Math.min(maxOut, 3072) + 1024,
          reasoning_effort: 'low',
          messages: [{ role: 'user', content: prompt }] }),
      }, START_TIMEOUT_MS);
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buf = '';
        let inThink = false;   // drop any <think>…</think> reasoning that arrives inside the answer text
        const stream = new ReadableStream({
          // A pull() that returns without enqueueing is not called again, so keep reading until
          // this pull has passed on some answer text (reasoning-only chunks carry none).
          async pull(ctrl) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) { ctrl.close(); return; }
              buf += decoder.decode(value, { stream: true });
              const lines = buf.split('\n'); buf = lines.pop() ?? '';
              let sent = false;
              for (const line of lines) {
                const t = line.trim();
                if (!t.startsWith('data:')) continue;
                const payload = t.slice(5).trim();
                if (payload === '[DONE]') continue;
                try {
                  let delta: string = JSON.parse(payload)?.choices?.[0]?.delta?.content || '';
                  let out = '';
                  while (delta) {
                    if (inThink) { const i = delta.indexOf('</think>'); if (i < 0) { delta = ''; break; } inThink = false; delta = delta.slice(i + 8); }
                    else { const i = delta.indexOf('<think>'); if (i < 0) { out += delta; delta = ''; } else { out += delta.slice(0, i); inThink = true; delta = delta.slice(i + 7); } }
                  }
                  if (out) { ctrl.enqueue(encoder.encode(geminiChunk(out))); sent = true; }
                } catch { /* keepalive */ }
              }
              if (sent) return;
            }
          },
          cancel() { reader.cancel().catch(() => {}); },
        });
        return sse(stream);
      }
      console.error('Groq failed', res.status, await res.text().catch(() => ''));
    } catch (e) { console.error('Groq threw', e); }
  }

  // ── 6. Both providers unavailable → give the credit back and report ──
  await refund();
  return json({ error: 'The AI writer is unavailable right now. Please try again in a minute.' }, 502);
});
