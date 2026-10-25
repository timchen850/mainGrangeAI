// Starts a Stripe checkout when someone buys a plan
import { corsHeaders, sendJson, getUser } from '../_shared/helpers.ts';

// Stripe price IDs for each plan (from the Stripe dashboard)
const PRICES: any = {
  starter_monthly: Deno.env.get('PRICE_STARTER_MONTHLY'),
  starter_yearly: Deno.env.get('PRICE_STARTER_YEARLY'),
  pro_monthly: Deno.env.get('PRICE_PRO_MONTHLY'),
  pro_yearly: Deno.env.get('PRICE_PRO_YEARLY'),
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const user = await getUser(req);
  if (!user) return sendJson({ error: 'Please log in' }, 401);

  const body = await req.json();
  const priceId = PRICES[body.plan + '_' + body.billing];
  if (!priceId) return sendJson({ error: 'Unknown plan' }, 400);

  const site = req.headers.get('origin') || 'https://grangeai.net';

  // Stripe wants form data, not JSON
  const form = new URLSearchParams();
  form.append('mode', 'subscription');
  form.append('line_items[0][price]', priceId);
  form.append('line_items[0][quantity]', '1');
  form.append('success_url', site + '/?payment=success');
  form.append('cancel_url', site + '/?payment=cancelled');
  form.append('customer_email', user.email || '');
  form.append('metadata[user_id]', user.id);
  form.append('metadata[plan]', body.plan);

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + Deno.env.get('STRIPE_SECRET_KEY'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  const session = await response.json();
  if (!response.ok) return sendJson({ error: 'Stripe error' }, 500);

  return sendJson({ url: session.url });
});
