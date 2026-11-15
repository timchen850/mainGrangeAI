// Grange AI — Stripe webhook handler
// Stripe calls this after a checkout completes or a subscription changes, to set profiles.tier.
//
// DEPLOY WITH JWT VERIFICATION OFF: Stripe does not send a Supabase token, so with verify_jwt on
// every event is rejected at the gateway and nobody is ever upgraded (found in the Nov 2026 review).
//   supabase functions deploy stripe-webhook --no-verify-jwt
// supabase/config.toml also pins this.
//
// Secrets required:
//   STRIPE_SECRET_KEY       — Stripe dashboard → Developers → API keys
//   STRIPE_WEBHOOK_SECRET   — Stripe dashboard → Developers → Webhooks → this endpoint's signing secret
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Nov 2026 fixes: a missing STRIPE_WEBHOOK_SECRET used to skip the signature check entirely, so
// anyone could post a fake checkout.session.completed and make themselves Pro. Now the function
// refuses to run without the secret, and verification uses Stripe's own constructEventAsync
// (timestamp tolerance, constant-time compare). The profile update keys on user_id (the column
// every other function reads), not id.

import Stripe from 'https://esm.sh/stripe@17.7.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

const TIERS = new Set(['free', 'starter', 'pro']);

Deno.serve(async (req) => {
  // Stripe is a server: no browser, no CORS, no preflight.
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  if (!secretKey || !webhookSecret) {
    console.error('stripe-webhook: STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must both be set');
    return json({ error: 'Webhook not configured' }, 503);
  }

  const sigHeader = req.headers.get('stripe-signature');
  if (!sigHeader) return json({ error: 'Missing stripe-signature header' }, 400);

  const stripe = new Stripe(secretKey, { httpClient: Stripe.createFetchHttpClient() });
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sigHeader, webhookSecret, undefined, Stripe.createSubtleCryptoProvider());
  } catch (err) {
    console.error('stripe-webhook: bad signature', err instanceof Error ? err.message : err);
    return json({ error: 'Invalid signature' }, 400);
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  async function setTier(userId: string | undefined, tier: string, why: string) {
    if (!userId || !TIERS.has(tier)) { console.warn('stripe-webhook: skipped', why, { userId, tier }); return; }
    const { error, count } = await supabase.from('profiles').update({ tier }, { count: 'exact' }).eq('user_id', userId);
    if (error) throw new Error(`profiles update failed: ${error.message}`);
    console.log(`stripe-webhook: ${why}: user ${userId} → ${tier} (${count ?? '?'} row)`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        // Only a paid (or $0-due) session upgrades; an unpaid one waits for the invoice.
        if (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') {
          await setTier(s.metadata?.user_id, s.metadata?.tier ?? '', 'checkout completed');
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const active = ['active', 'trialing', 'past_due'].includes(sub.status);
        await setTier(sub.metadata?.user_id, active ? (sub.metadata?.tier ?? '') : 'free', `subscription ${sub.status}`);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await setTier(sub.metadata?.user_id, 'free', 'subscription cancelled');
        break;
      }
      default:
        // Other events are fine to receive; Stripe only needs a 2xx.
        break;
    }
  } catch (err) {
    console.error('stripe-webhook: handler failed', err);
    return json({ error: 'Handler failed' }, 500);   // Stripe retries on 5xx
  }

  return json({ received: true });
});
