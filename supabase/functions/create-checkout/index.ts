// Grange AI — Stripe Checkout session creator
// Called from the Plans screen when a signed-in user picks Starter or Pro.
// Creates a Stripe Checkout session and returns the URL to redirect to.
//
// There is NO free trial: the plan cards say "no card required" for the Free plan, and a paid plan
// is charged at once. Do not add trial_period_days here without changing the Terms and the cards.
//
// Secrets required (set via: supabase secrets set KEY=value):
//   STRIPE_SECRET_KEY   — from Stripe dashboard
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Open paid plans with: supabase secrets set PAID_PLANS_OPEN=true  (until then this returns 503 and
// the app shows "Paid plans aren't open yet").

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonFor } from '../_shared/cors.ts';
import { bumpRateLimit, rateLimitMessage } from '../_shared/ratelimit.ts';

const SITE_URL = 'https://grangeai.net';

// Stripe price lookup keys → created on first use if missing.
// Prices changed 2026-10-24 (Starter $14.99/mo or $120/yr, Pro $35.99/mo or $300/yr). Stripe prices
// can't change amount, so these use new lookup keys (_v2): the old $49/$149 prices stay unused.
// Keep in step with PLANS in index.html (plan screen) and the landing page's pricing section.
const PRICES: Record<string, { amount: number; interval: 'month' | 'year'; nickname: string }> = {
  starter_monthly_v2: { amount: 1499,  interval: 'month', nickname: 'Starter Monthly' },
  starter_annual_v2:  { amount: 12000, interval: 'year',  nickname: 'Starter Yearly'  },
  pro_monthly_v2:     { amount: 3599,  interval: 'month', nickname: 'Pro Monthly'     },
  pro_annual_v2:      { amount: 30000, interval: 'year',  nickname: 'Pro Yearly'      },
};

async function stripe(path: string, body?: Record<string, unknown>, method = 'POST') {
  const key = Deno.env.get('STRIPE_SECRET_KEY')!;
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  if (body) opts.body = new URLSearchParams(body as Record<string, string>).toString();
  const res = await fetch(`https://api.stripe.com/v1${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? JSON.stringify(data));
  return data;
}

async function getOrCreatePrice(lookupKey: string): Promise<string> {
  // Try to find existing price by lookup key
  const list = await stripe(`/prices/search?query=lookup_key:'${lookupKey}'&limit=1`, undefined, 'GET');
  if (list.data?.length) return list.data[0].id;

  // Create product then price
  const cfg = PRICES[lookupKey];
  const product = await stripe('/products', { name: cfg.nickname });
  const price = await stripe('/prices', {
    product: product.id,
    unit_amount: String(cfg.amount),
    currency: 'usd',
    'recurring[interval]': cfg.interval,
    lookup_key: lookupKey,
    transfer_lookup_key: 'true',
  });
  return price.id;
}

Deno.serve(async (req) => {
  const { json, preflight } = jsonFor(req);
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if ((Deno.env.get('PAID_PLANS_OPEN') || '').toLowerCase() !== 'true') {
    return json({ error: 'Paid plans aren’t open yet. You’re on the Free plan for now.', code: 'plans_closed' }, 503);
  }

  try {
    // Auth: require logged-in user
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const rl = await bumpRateLimit('create-checkout', user.id, 10, 3600);
    if (!rl.allowed) return json({ error: rateLimitMessage('starting checkout', rl) }, 429);

    const { tier, billing } = await req.json();
    if (!['starter', 'pro'].includes(tier)) return json({ error: 'Invalid tier' }, 400);
    if (!['monthly', 'annual'].includes(billing)) return json({ error: 'Invalid billing' }, 400);

    const lookupKey = `${tier}_${billing}_v2`;
    const priceId = await getOrCreatePrice(lookupKey);

    // Redirect back to the page that started checkout. Only Grange's own origins are trusted;
    // anything else (or no Origin header) goes to the live site. The old fallback was grangeai.com,
    // a domain Grange does not own.
    const reqOrigin = req.headers.get('origin') ?? '';
    const origin = /^https:\/\/(www\.)?grangeai\.net$|^https:\/\/([a-z0-9-]+\.)?grangeai-prototype\.pages\.dev$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(reqOrigin)
      ? reqOrigin : SITE_URL;

    const session = await stripe('/checkout/sessions', {
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: `${origin}/?payment=success&tier=${tier}`,
      cancel_url: `${origin}/?payment=cancelled`,
      customer_email: user.email!,
      'metadata[user_id]': user.id,
      'metadata[tier]': tier,
      'subscription_data[metadata][user_id]': user.id,
      'subscription_data[metadata][tier]': tier,
      client_reference_id: user.id,
      allow_promotion_codes: 'true',
      'billing_address_collection': 'auto',
    });

    return json({ url: session.url });
  } catch (err) {
    console.error('create-checkout error:', err);
    return json({ error: String(err) }, 500);
  }
});
