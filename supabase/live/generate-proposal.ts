// Grange AI — proposal generator (server-side AI proxy). THE VERSION RUNNING IN PRODUCTION.
// This is the deployed generate-proposal (v6, read Oct 25 2026) plus these fixes:
//   1. Gemini's short "high demand" errors (500/503) are retried twice before falling back (v7).
//   2. The Groq fallback model: Groq shut down llama-3.3-70b-versatile on Aug 16 2026, so every
//      fallback call failed; it now uses openai/gpt-oss-120b, Groq's recommended replacement (v7).
//   3. Gemini 2.5 Flash's thinking is off unless the caller asks for it: its thinking tokens come
//      out of maxOutputTokens, and with a 2048 cap it could spend all of them and return nothing (v8).
//   4. Deadlines: Gemini and Groq each get 20 s to start answering. A stalled Gemini call goes
//      to Groq instead of hanging until the platform kills the request (v8).
//   5. The Groq relay kept reading only while chunks carried answer text. gpt-oss streams its
//      reasoning first (chunks with no text), so the relay stopped pulling and the stream hung
//      forever ("Mapping out the approach…" for minutes). pull() now reads until it has text (v8).
//   6. A 429 "exceeded your current quota" from Gemini's free tier won't clear in seconds, so it
//      goes straight to Groq; only 500/503 "high demand" errors are retried (v8).
// supabase/functions/generate-proposal/index.ts is the plan-based version for when paid plans
// open; it needs the profiles.tier column, so don't deploy it until then.
// Auth + per-user daily quota + Gemini primary with Groq fallback, always streaming back in
// Gemini's SSE shape so the frontend parser is unchanged.
// Secrets: GEMINI_API_KEY (required), GROQ_API_KEY (optional fallback).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GROQ_MODEL = 'openai/gpt-oss-120b';
const DAILY_LIMIT = 10;
const GEMINI_RETRY_MS = [1200, 2500];   // waits before the 2nd and 3rd Gemini attempts (500/503 only)
const START_TIMEOUT_MS = 20000;         // how long a provider gets to start its response

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await sb.from('proposal_usage').select('id, count')
    .eq('user_id', user.id).eq('used_on', today).maybeSingle();
  const currentCount: number = (usage?.count as number) ?? 0;
  if (currentCount >= DAILY_LIMIT)
    return json({ error: `Daily limit reached (${DAILY_LIMIT} proposals/day). Try again tomorrow.` }, 429);
  let usageId = usage?.id as string | undefined;
  if (usageId) await sb.from('proposal_usage').update({ count: currentCount + 1 }).eq('id', usageId);
  else {
    const { data: ins } = await sb.from('proposal_usage')
      .insert({ user_id: user.id, used_on: today, count: 1 }).select('id').single();
    usageId = ins?.id;
  }
  const refund = async () => { if (usageId) await sb.from('proposal_usage').update({ count: currentCount }).eq('id', usageId); };

  let body: any;
  try { body = await req.json(); } catch { await refund(); return json({ error: 'Invalid JSON body' }, 400); }
  body.generationConfig = { ...(body.generationConfig || {}) };
  if (!body.generationConfig.thinkingConfig) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (geminiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${geminiKey}`;
    for (let attempt = 0; attempt <= GEMINI_RETRY_MS.length; attempt++) {
      if (attempt > 0) await sleep(GEMINI_RETRY_MS[attempt - 1]);
      try {
        const res = await fetchStart(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, START_TIMEOUT_MS);
        if (res.ok && res.body)
          return new Response(res.body, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
        console.error('Gemini failed', res.status, 'attempt', attempt + 1, await res.text().catch(() => ''));
        if (![500, 503].includes(res.status)) break;   // only "high demand" clears in seconds; a 429 quota error doesn't
      } catch (e) { console.error('Gemini threw or timed out', e); break; }   // a stall won't clear in seconds: go to Groq
    }
  }

  const groqKey = Deno.env.get('GROQ_API_KEY');
  if (groqKey) {
    try {
      const prompt = (body?.contents ?? []).flatMap((c: any) => (c?.parts ?? []).map((p: any) => p?.text || '')).join('\n');
      const res = await fetchStart('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({ model: GROQ_MODEL, stream: true,
          temperature: body?.generationConfig?.temperature ?? 0.7,
          // gpt-oss reasons before it answers, and those tokens count against this cap: leave room,
          // but stay well inside Groq's free-tier tokens-per-minute limit.
          max_completion_tokens: Math.min(body?.generationConfig?.maxOutputTokens ?? 2048, 3072) + 1024,
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
        return new Response(stream, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
      }
      console.error('Groq failed', res.status, await res.text().catch(() => ''));
    } catch (e) { console.error('Groq threw', e); }
  }

  await refund();
  return json({ error: 'AI provider unavailable. Set GEMINI_API_KEY (and optionally GROQ_API_KEY) in Edge Function secrets.' }, 502);
});
