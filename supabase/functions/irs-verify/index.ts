// Grange AI — irs-verify
// Authoritative, DETERMINISTIC 501(c)(3) / tax-status check (no LLM) against the
// IRS Exempt Organizations Business Master File via the free ProPublica
// Nonprofit Explorer API. The report's rec #4: "authoritative status checks"
// with a verifiable source; NTEE returned as a soft signal, never a hard gate.
// Server-side because ProPublica sends no CORS headers (browser fetch is blocked).
// Body: { ein: string }.  Auth: own check (verify_jwt=false).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonFor } from '../_shared/cors.ts';
import { bumpRateLimit, rateLimitMessage } from '../_shared/ratelimit.ts';


const SUBS: Record<number, string> = {
  3: '501(c)(3) charitable / educational', 4: '501(c)(4) social welfare', 5: '501(c)(5) labor / agricultural',
  6: '501(c)(6) business league', 7: '501(c)(7) social club', 8: '501(c)(8) fraternal beneficiary',
  10: '501(c)(10) fraternal society', 19: '501(c)(19) veterans organization',
};

Deno.serve(async (req: Request) => {
  const { json, preflight } = jsonFor(req);
  if (req.method === 'OPTIONS') return preflight();
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: aerr } = await sb.auth.getUser();
  if (aerr || !user) return json({ error: 'Unauthorized' }, 401);

  const rl = await bumpRateLimit('irs-verify', user.id, 30, 3600);
  if (!rl.allowed) return json({ error: rateLimitMessage('IRS lookups', rl) }, 429);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const ein = (body?.ein || '').toString().replace(/\D/g, '');
  if (ein.length !== 9) return json({ error: 'Enter a valid 9-digit EIN, like 47-1234567.' }, 400);

  let res: Response;
  try {
    res = await fetch(`https://projects.propublica.org/nonprofits/api/v2/organizations/${ein}.json`, { headers: { 'User-Agent': 'GrangeAI/1.0 (grant-readiness check)' } });
  } catch (_) { return json({ error: 'The IRS lookup service is unreachable right now. Try again shortly.' }, 502); }
  // Not in the file is NOT "not tax-exempt": the IRS Business Master File lags new determinations by
  // months, and ProPublica refreshes from it monthly. Say so instead of implying the org has no status.
  const NOT_FOUND_NOTE = 'This EIN is not in the IRS Exempt Organizations file yet. New organizations usually take several months to appear after their determination letter, and a fiscal sponsor’s EIN is different from yours. If you have a determination letter, you are tax-exempt; upload it under Readiness.';
  if (res.status === 404) return json({ ok: true, output: { found: false, ein, note: NOT_FOUND_NOTE } });
  if (!res.ok) return json({ error: 'The IRS lookup service is unavailable right now. Try again shortly.' }, 502);

  const data = await res.json().catch(() => ({}));
  const o = (data && data.organization) || null;
  if (!o || o.subsection_code == null) return json({ ok: true, output: { found: false, ein, note: NOT_FOUND_NOTE } });

  const sub = Number(o.subsection_code);
  const ded = Number(o.deductibility_code);
  const ruling = (o.ruling_date || '').toString();
  const rulingYear = /^(\d{4})/.test(ruling) ? ruling.slice(0, 4) : null;
  return json({ ok: true, output: {
    found: true, ein,
    name: (o.name || '').toString(),
    subsection_code: Number.isFinite(sub) ? sub : null,
    subsection_label: SUBS[sub] || (Number.isFinite(sub) ? `501(c)(${sub})` : 'tax-exempt (subsection unknown)'),
    is_501c3: sub === 3,
    tax_deductible: ded === 1 || ded === 4,
    ntee_code: o.ntee_code || null,
    ruling_date: ruling || null,
    ruling_year: rulingYear,
    city: o.city || null,
    state: o.state || null,
    source_url: `https://projects.propublica.org/nonprofits/organizations/${ein}`,
  } });
});
