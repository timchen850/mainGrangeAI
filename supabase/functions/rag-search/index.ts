// Finds the pieces of past proposals that are most like the search
import { corsHeaders, sendJson, getSupabase, getUser } from '../_shared/helpers.ts';

const model = new Supabase.ai.Session('gte-small');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const user = await getUser(req);
  if (!user) return sendJson({ error: 'Please log in' }, 401);

  const body = await req.json();
  if (!body.query) return sendJson({ error: 'Missing query' }, 400);

  const embedding = await model.run(body.query, { mean_pool: true, normalize: true });

  const supabase = getSupabase(req);
  const result = await supabase.rpc('match_document_chunks', {
    query_embedding: embedding,
    match_count: body.match_count || 4,
  });

  if (result.error) return sendJson({ error: result.error.message }, 500);
  return sendJson({ matches: result.data });
});
