// Writes a full grant proposal draft
import { corsHeaders, sendJson, getSupabase, getUser, askAI } from '../_shared/helpers.ts';

// How many drafts each plan can make per day
const DAILY_LIMITS: any = { free: 2, starter: 10, pro: 30 };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const user = await getUser(req);
  if (!user) return sendJson({ error: 'Please log in' }, 401);

  const body = await req.json();
  if (!body.prompt) return sendJson({ error: 'Missing prompt' }, 400);

  const supabase = getSupabase(req);

  // Find out what plan they are on
  const profile = await supabase.from('profiles').select('plan').eq('id', user.id).single();
  const plan = profile.data ? profile.data.plan : 'free';
  const limit = DAILY_LIMITS[plan] || 2;

  // Check how many they already made today
  const today = new Date().toISOString().slice(0, 10);
  const usage = await supabase.from('proposal_usage').select('count').eq('user_id', user.id).eq('day', today).single();
  const usedToday = usage.data ? usage.data.count : 0;

  if (usedToday >= limit) {
    return sendJson({ error: 'You reached your daily limit. Try again tomorrow.' }, 429);
  }

  // Look up their past proposals so the draft sounds like them
  let prompt = body.prompt;
  const pastWriting = await supabase.from('document_chunks').select('content').eq('user_id', user.id).limit(3);
  if (pastWriting.data && pastWriting.data.length > 0) {
    prompt += '\n\nHere is some of their past writing. Try to match the style:\n';
    for (const chunk of pastWriting.data) {
      prompt += chunk.content + '\n---\n';
    }
  }

  try {
    const text = await askAI(prompt);

    // Add one to their usage count
    await supabase.from('proposal_usage').upsert({ user_id: user.id, day: today, count: usedToday + 1 });

    return sendJson({ text: text });
  } catch (err) {
    console.log(err);
    return sendJson({ error: 'Could not write the draft right now.' }, 500);
  }
});
