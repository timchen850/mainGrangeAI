# Deploy checklist: Nov 15 2026 review fixes

Everything below is in the repo. Nothing here deploys itself: the live Supabase project still runs
the old functions until these steps are done. Do them in this order, after the demo is recorded.

## 1. Database (once)

Run the new migration in the SQL editor (or `supabase db push`):

```
supabase/migrations/20261115_rate_limits_and_atomic_usage.sql
```

It adds `profiles.tier` if missing, `consume_proposal_credit()`, `refund_proposal_credit()`,
`bump_rate_limit()` and the tables `rate_limits` and `grants_gov_cache`, and removes the user's
write access to `proposal_usage`. Until the functions below are deployed, the live
`generate-proposal` keeps working; it just stops counting drafts (its writes are refused and
ignored). Deploy the functions right after.

## 2. Edge Functions

```bash
supabase link --project-ref xewrvmqyzeiziimcmenj
supabase functions deploy generate-proposal --no-verify-jwt
supabase functions deploy ai-chat --no-verify-jwt
supabase functions deploy ai-worker --no-verify-jwt
supabase functions deploy discover-grants --no-verify-jwt
supabase functions deploy grant-detail --no-verify-jwt
supabase functions deploy irs-verify --no-verify-jwt
supabase functions deploy rag-ingest --no-verify-jwt
supabase functions deploy rag-search --no-verify-jwt
supabase functions deploy usaspending-search --no-verify-jwt
supabase functions deploy exemplar-search --no-verify-jwt
supabase functions deploy exemplar-ingest --no-verify-jwt
supabase functions deploy delete-account --no-verify-jwt
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook --no-verify-jwt
```

`supabase/config.toml` carries the same `verify_jwt` settings, so a plain
`supabase functions deploy` (all at once) also works. Every function imports
`supabase/functions/_shared/`, which the CLI bundles automatically.

Then delete the two functions that should not be in production:

```bash
supabase functions delete gemini-test
supabase functions delete exemplar-seed     # one-off seeding tool; re-deploy if you need it again
```

## 3. Secrets

```bash
supabase secrets set EXEMPLAR_ADMIN_EMAILS=you@example.org      # no default any more
supabase secrets set ALLOWED_ORIGINS=https://your-preview.pages.dev   # optional, only for extra origins
```

Already set: `GEMINI_API_KEY`, `GROQ_API_KEY`. Not yet needed: `STRIPE_*`, `PAID_PLANS_OPEN`.

## 4. Verify (5 minutes)

- Sign in, draft once: the draft streams; `select * from proposal_usage` shows the count going up by
  up to 3 per draft; a third draft on the Free plan gets "Monthly limit reached".
- Ask Grange a question; run Discovery (embassy programs gone); run an AI assessment on one card.
- Upload a 15-page document under Past proposals on a Pro test account: one document, many passages.
- Settings: "Download my data" gives a JSON file; "Delete my account" on a throwaway account works.
- `curl -i -X POST https://xewrvmqyzeiziimcmenj.supabase.co/functions/v1/stripe-webhook` returns
  `503 Webhook not configured` (not 401): the gateway no longer blocks Stripe.

## 5. Website (Cloudflare Pages)

Merging to `main` deploys `index.html`, `_headers`, `robots.txt`, `sitemap.xml` and `404.html`.
After the deploy, check `curl -I https://grangeai.net/` shows `content-security-policy`,
`x-frame-options: DENY` and `strict-transport-security`, and that the site still loads with no
console errors (the CSP lists every host the page uses; add any new one there first).

## 6. Not done in code: decisions and accounts (Tim)

| Item | Why | What to do |
|---|---|---|
| Supabase paid plan | Free projects pause; it happened twice. The project was `ACTIVE_HEALTHY` on Nov 15. | Upgrade before judging; then delete `.github/workflows/supabase-keepalive.yml`. Add an uptime monitor (UptimeRobot or Better Stack, free tier) on `https://grangeai.net/` and the REST URL. |
| Gemini billing | On the free tier Google may use prompts (EINs, budgets, past proposals) to improve its products. | Turn on billing for the Gemini key (AI Studio → Billing). See `AI_STRATEGY.md`. Then name Google and Groq as processors on the Privacy page. |
| Stripe | Prices in `create-checkout` now match the cards ($14.99 / $35.99, $120 / $300 a year). Nothing is live. | In Stripe test mode: set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, add the webhook endpoint for `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Set `PAID_PLANS_OPEN=true` and flip `PAID_PLANS_OPEN` in `index.html` only after a full test purchase upgrades a test account. |
| Terms: operator, governing law, contact | The Terms name no legal operator or state, and use a Gmail address. | A lawyer or a parent who can sign: add the operator's name and address, a governing-law state, and a domain mailbox (e.g. `hello@grangeai.net` via Cloudflare Email Routing, free). The age clause now says 13+ with parental permission under 18; confirm it. |
| Exemplar library | Verify that the narratives removed for copyright are gone from `exemplar_chunks`. | `select distinct title, license, source_url from exemplar_chunks;` in the SQL editor. |
| Script integrity | three.js and supabase-js load from jsDelivr with no integrity hash (this environment could not reach jsDelivr to compute them). | Run `curl -s <url> \| openssl dgst -sha384 -binary \| openssl base64 -A` for each URL in `index.html` and add `integrity="sha384-…" crossorigin="anonymous"`. Or self-host the two files. |
| Challenge answers | Question 5 still names Llama 3.3 70B; Question 3 describes the repo's limits. | Replace with the corrected text; both now describe what is deployed once step 2 is done. |
| `fix_plan_security.sql` | Referenced in earlier notes; not in the repo. | If it still exists locally, compare it with migration 20261115 (which covers the plan column and usage policies) before running it. |

## 7. Known gaps left open (not fixed in this pass)

- The landing page and the app are still one 945 KB file (`index.html`). Splitting them is a
  separate project.
- "Word document (.doc)" export is HTML with a .doc name. A real .docx needs a library (docx.js)
  added to the CSP allowlist.
- Readiness/Funder call analysis reads the first 60,000 characters (about 20 pages) of a pasted call
  and now says so in the result; very long NOFOs are still not read in full.
- Overdue grants stay in the pipeline until the user archives them; Deadlines groups them as Overdue.
- Discovery results arrive in two steps (cards, then the funding-history panel), which shifts the
  layout; reserve space for the panel.
- Service area vs. headquarters is one profile field.
- The accessibility items (unnamed buttons, inputs without labels, one h1 per view, 36 px targets)
  need a pass with `qa/a11y.mjs` on a real sign-in; the skip link and inline error lines are done.
