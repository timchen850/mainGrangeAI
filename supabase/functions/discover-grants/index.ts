// Grange AI — discover-grants
// Server-side Grants.gov search2 aggregator. The browser is CORS-blocked from
// calling api.grants.gov directly (every client call silently failed, leaving
// users with only the curated list) — so we proxy it here and, while we're at
// it, fire SEVERAL targeted queries and union them for far higher recall than a
// single jammed-keyword query. Returns raw oppHits (the client maps them) each
// annotated with grangeFocus = the focus area(s) whose query surfaced it.
// DETERMINISTIC (no LLM). Body: { focus_areas[], primary_programs[], mission, tax_exempt_status,
//   include_international? }.
// Auth: own (verify_jwt=false).
//
// Nov 15 2026 (review findings):
//   - Each Grants.gov query is cached for 3 hours (public.grants_gov_cache), so a Discovery run
//     that repeats a profile's queries does not hit Grants.gov up to 8 times again.
//   - Per-user rate limit: 20 runs an hour.
//   - U.S. embassy / State Department "mission" programs are skipped unless the caller asks for
//     them: a youth photography nonprofit in Pennsylvania was shown four embassy programs abroad.
//   - Forecasts that name a fiscal year before the current one are dropped (a "fiscal year 2025
//     program statement" was still listed in November 2026).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonFor } from '../_shared/cors.ts';
import { bumpRateLimit, rateLimitMessage } from '../_shared/ratelimit.ts';

const GOV = 'https://api.grants.gov/v1/api/search2';
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const RATE_LIMIT = 20, RATE_WINDOW_S = 3600;

const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function govQuery(term: string, extra?: Record<string, unknown>): Promise<any[]> {
  const body: Record<string, unknown> = Object.assign({ rows: 60, startRecordNum: 0, oppStatuses: 'forecasted|posted' }, extra || {});
  const t = (term || '').toString().trim().slice(0, 60);
  if (t) body.keyword = t;
  const payload = JSON.stringify(body);
  const key = await sha256(payload);
  // 1. cache (best effort: a missing table just means no caching)
  try {
    const { data } = await sbAdmin.from('grants_gov_cache').select('hits, fetched_at').eq('cache_key', key).maybeSingle();
    if (data && Date.now() - new Date(data.fetched_at).getTime() < CACHE_TTL_MS && Array.isArray(data.hits)) return data.hits;
  } catch (_) { /* no cache */ }
  // 2. live
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(GOV, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: payload, signal: ctrl.signal });
    clearTimeout(to);
    if (!r.ok) return [];
    const d = await r.json();
    const hits = Array.isArray(d?.data?.oppHits) ? d.data.oppHits : [];
    try { await sbAdmin.from('grants_gov_cache').upsert({ cache_key: key, hits, fetched_at: new Date().toISOString() }); } catch (_) { /* no cache */ }
    return hits;
  } catch (_) { return []; }
}

// U.S. missions abroad (Department of State public-diplomacy grants) and other programs whose place
// of performance is outside the country. agencyCode for these is DOS-<post>; the agency name says
// "U.S. Mission to …" or "U.S. Embassy …".
function isInternational(h: any): boolean {
  const code = String(h?.agencyCode || '').toUpperCase();
  const name = String(h?.agency || '');
  return code.startsWith('DOS') || /\bU\.?S\.? (Mission|Embassy|Consulate)\b/i.test(name) || /\bDepartment of State\b/i.test(name);
}
// A forecast whose title names an earlier fiscal year is stale.
function isStaleForecast(h: any, year: number): boolean {
  if (String(h?.oppStatus || '').toLowerCase() !== 'forecasted') return false;
  const m = /\b(?:FY\s?|Fiscal Year\s+)(20\d\d)\b/i.exec(String(h?.title || ''));
  return !!m && Number(m[1]) < year;
}

Deno.serve(async (req: Request) => {
  const { json, preflight } = jsonFor(req);
  if (req.method === 'OPTIONS') return preflight();
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: aerr } = await sb.auth.getUser();
  if (aerr || !user) return json({ error: 'Unauthorized' }, 401);

  const rl = await bumpRateLimit('discover-grants', user.id, RATE_LIMIT, RATE_WINDOW_S);
  if (!rl.allowed) return json({ error: rateLimitMessage('grant searches', rl) }, 429);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const fa = (Array.isArray(body?.focus_areas) ? body.focus_areas : []).map((x: any) => (x || '').toString().trim()).filter(Boolean);
  const programs = (Array.isArray(body?.primary_programs) ? body.primary_programs : []).map((x: any) => (x || '').toString().trim()).filter(Boolean);
  const mission = (body?.mission || '').toString();
  const missionKw = mission.split(/\W+/).filter((w: string) => w.length > 5).slice(0, 3);

  // Entity type decides which eligibility sweeps run. Registered nonprofits (and
  // fiscal sponsees, who apply under a sponsor's exemption) get the 501(c)(3)
  // sweep; everyone else gets the non-nonprofit-friendly sweeps. Everyone always
  // gets the "unrestricted" sweep. Each eligibility sweep tags its hits so the
  // UI can say WHY a grant is shown. Grants.gov applicant-eligibility codes.
  const status = (body?.tax_exempt_status || '').toString().trim().toLowerCase();
  const isNonprofit = ['501c3', '501c4', '501c6', 'fiscal_sponsorship'].includes(status);
  const ELIG: Record<string, string> = {
    '12': '501(c)(3) eligible',
    '13': 'No 501(c)(3) required',
    '21': 'Open to individuals',
    '22': 'Open to for-profits',
    '23': 'Open to small business',
    '25': 'See eligibility',
    '99': 'Open to any applicant',
  };
  const eligCodes = isNonprofit ? ['12', '99'] : ['13', '22', '23', '25', '99'];

  // Up to 6 distinct topical term queries (focus areas carry their focus tag).
  const terms: { k: string; tag: string | null }[] = [];
  const seen = new Set<string>();
  const add = (t: string, tag: string | null) => {
    const k = (t || '').toString().trim(), low = k.toLowerCase();
    if (k.length > 2 && !seen.has(low) && terms.length < 6) { seen.add(low); terms.push({ k, tag }); }
  };
  fa.forEach((f: string) => add(f, f));
  programs.forEach((p: string) => add(p, null));
  missionKw.forEach((m: string) => add(m, null));

  type Hit = { h: any; tag: string | null; elig: string | null };
  const queries: Promise<Hit[]>[] = terms.map(t =>
    govQuery(t.k).then(hits => hits.map(h => ({ h, tag: t.tag, elig: null }))));
  if (!queries.length) queries.push(govQuery('community').then(hits => hits.map(h => ({ h, tag: null, elig: null }))));
  // eligibility sweeps for this entity type — each tags its hits with WHY eligible
  for (const code of eligCodes) {
    queries.push(govQuery('', { eligibilities: code }).then(hits => hits.map(h => ({ h, tag: null, elig: ELIG[code] || null }))));
  }

  const includeInternational = body?.include_international === true;
  const thisYear = new Date().getFullYear();
  const results = await Promise.all(queries);
  const byId: Record<string, any> = {};
  const out: any[] = [];
  let totalRaw = 0, skippedInternational = 0, skippedStale = 0;
  for (const arr of results) {
    for (const { h, tag, elig } of arr) {
      totalRaw++;
      const id = h?.id || h?.number;
      if (!id) continue;
      if (!includeInternational && isInternational(h)) { skippedInternational++; continue; }
      if (isStaleForecast(h, thisYear)) { skippedStale++; continue; }
      if (byId[id]) {
        if (tag && !byId[id].grangeFocus.includes(tag)) byId[id].grangeFocus.push(tag);
        if (elig && !byId[id].eligTags.includes(elig)) byId[id].eligTags.push(elig);
      } else {
        h.grangeFocus = tag ? [tag] : [];
        h.eligTags = elig ? [elig] : [];
        byId[id] = h; out.push(h);
      }
    }
  }

  return json({ ok: true, output: { hits: out.slice(0, 120), distinct: out.length, total_raw: totalRaw, queries: queries.length, entity: isNonprofit ? 'nonprofit' : 'non_nonprofit', skipped_international: skippedInternational, skipped_stale_forecasts: skippedStale } });
});
