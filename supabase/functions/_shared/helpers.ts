// Code that all the edge functions use
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Lets the website call these functions from the browser
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Send back JSON
export function sendJson(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Make a Supabase client that acts as the logged in user
export function getSupabase(req: Request) {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } }
  );
}

// Get the logged in user, or null
export async function getUser(req: Request) {
  const supabase = getSupabase(req);
  const result = await supabase.auth.getUser();
  return result.data.user;
}

// Ask Google Gemini a question and get text back
export async function askGemini(prompt: string, model = 'gemini-2.5-flash') {
  const key = Deno.env.get('GEMINI_API_KEY');
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
  });

  if (!response.ok) {
    throw new Error('Gemini error: ' + response.status);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

// Backup AI in case Gemini is down
export async function askGroq(prompt: string) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + Deno.env.get('GROQ_API_KEY'),
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error('Groq error: ' + response.status);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Try Gemini first, then Groq
export async function askAI(prompt: string, model?: string) {
  try {
    return await askGemini(prompt, model);
  } catch (err) {
    console.log('Gemini failed, trying Groq', err);
    return await askGroq(prompt);
  }
}
