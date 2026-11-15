// Grange AI — per-user rate limits for the Edge Functions.
//
// Why: every AI function shares one Gemini key (and its quota). Before Nov 2026 only drafting had a
// cap, and that cap was written with the user's own session, so a signed-in user could reset it.
// Now every function that spends provider quota or hits a third-party API calls bumpRateLimit()
// with the SERVICE ROLE key. The count lives in public.rate_limits (no user-facing policies), so a
// user cannot read or reset it through the API.
//
// bumpRateLimit(bucket, userId, limit, windowSeconds) → { allowed, count, retryAfter }
// The SQL function (migration 20261115_rate_limits_and_atomic_usage.sql) does one atomic
// INSERT ... ON CONFLICT ... UPDATE, so two tabs at once cannot both slip under the limit.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

let admin: SupabaseClient | null = null;
function adminClient(): SupabaseClient {
  if (!admin) admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  return admin;
}

export type RateResult = { allowed: boolean; count: number; limit: number; retryAfter: number };

export async function bumpRateLimit(bucket: string, userId: string, limit: number, windowSeconds: number): Promise<RateResult> {
  try {
    const { data, error } = await adminClient().rpc('bump_rate_limit', {
      p_user_id: userId, p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: !!row?.allowed,
      count: Number(row?.count ?? 0),
      limit,
      retryAfter: Math.max(1, Number(row?.retry_after_seconds ?? windowSeconds)),
    };
  } catch (e) {
    // If the limiter itself is broken (migration not run yet), log it and let the request through:
    // a missing limit is better than a dead feature. The deploy checklist says to run the migration first.
    console.error('bump_rate_limit failed (is the migration applied?)', e);
    return { allowed: true, count: 0, limit, retryAfter: 0 };
  }
}

/** Plain-language 429 body shared by all functions. */
export function rateLimitMessage(what: string, r: RateResult): string {
  const mins = Math.ceil(r.retryAfter / 60);
  const when = mins <= 1 ? 'in a minute' : mins < 120 ? `in about ${mins} minutes` : `in about ${Math.round(mins / 60)} hours`;
  return `You've reached the limit for ${what} (${r.limit} in this period). Try again ${when}.`;
}
