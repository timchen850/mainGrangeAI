# AI backup fix for ai-chat and ai-worker (Oct 25, 2026)

Groq shut down `llama-3.3-70b-versatile` on August 16, 2026. Every function that fell back to it
has had no working backup since then. When Gemini's free quota runs out (it did on Oct 24 after
about 50 calls), those features stop.

| Function | Status |
|---|---|
| `generate-proposal` (drafting, plan, polish) | Fixed and deployed (v8). Source: `supabase/live/generate-proposal.ts`. |
| `ai-chat` (the assistant) | Fixed on this branch in `supabase/functions/ai-chat/index.ts`, **not deployed**. Needs Tim's OK. |
| `ai-worker` (scorecard, revision, reading a funder's call, match scores) | Andrew's code. Needs the change below, with his OK. |

## ai-chat (ready to deploy)

- Groq model `openai/gpt-oss-120b`, `max_completion_tokens: 1400`, `reasoning_effort: 'low'`.
- Each provider gets 20 s to answer.
- Gemini thinking is off.
- One retry on a Gemini 500/503. A 429 quota error goes straight to Groq.

Tested in Node against fake Gemini and Groq responses. Deploy with `verify_jwt` off, as v7 is.

## ai-worker (for Andrew)

In `supabase/functions/ai-worker/index.ts`:

1. Line 11: change `const GROQ = 'llama-3.3-70b-versatile';` to `'openai/gpt-oss-120b'`.
2. Lines 29 and 48 (the Groq requests): replace `max_tokens` with `max_completion_tokens` and add
   `reasoning_effort: 'low'`. Leave about 1,000 extra tokens, because gpt-oss's reasoning counts
   against that cap.
3. Line 41 (`callText`, `maxOutputTokens: maxTokens`): add `thinkingConfig: { thinkingBudget: 0 }`.
   Otherwise Gemini 2.5 Flash can spend the 1,500-token cap thinking and return an empty revision.
4. Optional: put a 20 s deadline on each `fetch` (see `fetchWithin` in `ai-chat`), so a stalled call
   falls back instead of hanging the job.

Check that Groq's JSON mode (`response_format: json_object`) still works with gpt-oss on the
first run. If it doesn't, drop `response_format` and keep the "Respond ONLY with one valid JSON
object" system message.
