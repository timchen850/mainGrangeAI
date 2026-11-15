// Grange AI — shared CORS policy for every Edge Function.
//
// Until Nov 2026 each function answered any origin ('*'). Bearer tokens limited the damage, but a
// page on any domain could still call the API with a stolen token. Now only Grange's own origins
// get a CORS answer. Set ALLOWED_ORIGINS (comma-separated) in Edge Function secrets to add more,
// e.g. a Cloudflare Pages preview URL.
const DEFAULT_ORIGINS = [
  'https://grangeai.net',
  'https://www.grangeai.net',
  'https://grangeai-prototype.pages.dev',   // Cloudflare Pages project (deploy.yml)
  'capacitor://localhost',                  // mobile/ (Capacitor)
  'http://localhost',                       // app/ (Electron) and `python3 -m http.server`
];

function allowed(origin: string | null): string | null {
  if (!origin) return null;
  const extra = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const list = [...DEFAULT_ORIGINS, ...extra];
  if (list.includes(origin)) return origin;
  // any localhost port, for local development
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  // Cloudflare Pages per-deploy previews: https://<hash>.grangeai-prototype.pages.dev
  if (/^https:\/\/[a-z0-9-]+\.grangeai-prototype\.pages\.dev$/.test(origin)) return origin;
  return null;
}

/** CORS headers for this request. An origin that is not allowed gets no Allow-Origin header, so the
 *  browser blocks the response. Server-to-server callers (Stripe, curl) send no Origin and are not
 *  affected by CORS at all. */
export function corsFor(req: Request, extraHeaders = ''): Record<string, string> {
  const origin = allowed(req.headers.get('origin'));
  const h: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey' + (extraHeaders ? ', ' + extraHeaders : ''),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  if (origin) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

/** JSON response helper bound to one request's CORS headers. */
export function jsonFor(req: Request, extraHeaders = '') {
  const cors = corsFor(req, extraHeaders);
  return {
    cors,
    json: (o: unknown, status = 200) =>
      new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } }),
    preflight: () => new Response(null, { status: 204, headers: cors }),
  };
}
