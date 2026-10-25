// Saves a past proposal in small pieces so drafts can match the user's style
import { corsHeaders, sendJson, getSupabase, getUser } from '../_shared/helpers.ts';

// Built in Supabase model that turns text into numbers (an "embedding")
const model = new Supabase.ai.Session('gte-small');

// Cut long text into pieces about 1000 characters long
function splitText(text: string) {
  const pieces = [];
  const size = 1000;
  for (let i = 0; i < text.length; i += size) {
    pieces.push(text.slice(i, i + size));
  }
  return pieces;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const user = await getUser(req);
  if (!user) return sendJson({ error: 'Please log in' }, 401);

  const body = await req.json();
  const text = body.text || '';
  if (text.length < 100) return sendJson({ error: 'Text is too short' }, 400);

  const supabase = getSupabase(req);
  const pieces = splitText(text);

  for (const piece of pieces) {
    const embedding = await model.run(piece, { mean_pool: true, normalize: true });

    await supabase.from('document_chunks').insert({
      user_id: user.id,
      label: body.label || 'Untitled',
      content: piece,
      embedding: embedding,
    });
  }

  return sendJson({ ok: true, pieces: pieces.length });
});
