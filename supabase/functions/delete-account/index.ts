// Grange AI — delete-account
// The Privacy page promises "you can ask us to delete your account and all its data at any time",
// and until Nov 2026 nothing in the app did it. This deletes the signed-in user from auth.users;
// every user table references auth.users(id) ON DELETE CASCADE (schema.sql / full_backend.sql),
// so profile, answers, grants, proposals, documents, chunks, deadlines, usage and jobs go with it.
// Uploaded files in Storage are removed first (best effort).
//
// Body: { confirm: "DELETE" }  Auth: the user's own token. Deploy with --no-verify-jwt like the rest.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonFor } from '../_shared/cors.ts';
import { bumpRateLimit, rateLimitMessage } from '../_shared/ratelimit.ts';

Deno.serve(async (req: Request) => {
  const { json, preflight } = jsonFor(req);
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: aerr } = await sb.auth.getUser();
  if (aerr || !user) return json({ error: 'Unauthorized' }, 401);

  const rl = await bumpRateLimit('delete-account', user.id, 3, 3600);
  if (!rl.allowed) return json({ error: rateLimitMessage('account deletion', rl) }, 429);

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  if (body?.confirm !== 'DELETE') return json({ error: 'Send { "confirm": "DELETE" } to delete the account.' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Storage objects (best effort; bucket names as created by the app). The prefix is the user's id.
  for (const bucket of ['documents', 'org-photos', 'avatars']) {
    try {
      const { data: files } = await admin.storage.from(bucket).list(user.id, { limit: 1000 });
      if (files?.length) await admin.storage.from(bucket).remove(files.map((f) => `${user.id}/${f.name}`));
    } catch (_) { /* bucket may not exist */ }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error('delete-account failed', error.message);
    return json({ error: 'Could not delete the account right now. Please try again or email us.' }, 500);
  }
  console.log(`delete-account: deleted user ${user.id}`);
  return json({ ok: true });
});
