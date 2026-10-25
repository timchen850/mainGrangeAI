// The in-app grant assistant
import { corsHeaders, sendJson, getSupabase, getUser, askAI } from '../_shared/helpers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const user = await getUser(req);
  if (!user) return sendJson({ error: 'Please log in' }, 401);

  const body = await req.json();
  const messages = body.messages || [];

  // Get the user's profile so the answers are about them
  const supabase = getSupabase(req);
  const profile = await supabase.from('onboarding_answers').select('answers').eq('user_id', user.id).single();
  const answers = profile.data ? profile.data.answers : {};

  // Get their saved grants too
  const grants = await supabase.from('grants').select('title, deadline').eq('user_id', user.id);

  let prompt = 'You are a helpful grant writing assistant for small nonprofits.\n';
  prompt += 'Keep answers short and simple.\n\n';
  prompt += 'The user\'s organization: ' + JSON.stringify(answers) + '\n';
  prompt += 'Their saved grants: ' + JSON.stringify(grants.data || []) + '\n\n';
  prompt += 'Conversation:\n';

  for (const msg of messages) {
    prompt += msg.role + ': ' + msg.text + '\n';
  }
  prompt += 'assistant:';

  try {
    const reply = await askAI(prompt, 'gemini-2.5-flash-lite');
    return sendJson({ reply: reply });
  } catch (err) {
    console.log(err);
    return sendJson({ error: 'The assistant is busy, try again.' }, 500);
  }
});
