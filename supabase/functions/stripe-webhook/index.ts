// Stripe calls this after someone pays or cancels
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendJson } from '../_shared/helpers.ts';

Deno.serve(async (req) => {
  const event = await req.json();

  // Use the service key so we can update any user's plan
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const thing = event.data.object;

  if (event.type === 'checkout.session.completed') {
    const userId = thing.metadata.user_id;
    const plan = thing.metadata.plan;
    await supabase.from('profiles').update({ plan: plan, stripe_customer_id: thing.customer }).eq('id', userId);
    console.log('User ' + userId + ' bought ' + plan);
  }

  if (event.type === 'customer.subscription.deleted') {
    await supabase.from('profiles').update({ plan: 'free' }).eq('stripe_customer_id', thing.customer);
    console.log('Subscription cancelled for ' + thing.customer);
  }

  return sendJson({ received: true });
});
