# Grange AI

Grange AI helps small nonprofits and community groups find grants and write proposals,
even if they don't have a grant writer.

Live site: https://grangeai.net

## Features

- **Profile** - a short survey about your organization
- **Find Grants** - searches Grants.gov and gives each grant a match score
- **Readiness** - a checklist of documents funders ask for, an IRS 501(c)(3) check, and SAM.gov reminders
- **Write Proposal** - creates a first draft of a proposal using your profile
- **Deadlines** - keeps track of due dates and exports them to your calendar
- **Assistant** - a chatbot that answers grant questions

## How it's built

- `index.html`, `style.css` and the `js/` folder are the website (plain HTML, CSS and JavaScript)
- `supabase/` is the backend
  - `schema.sql` has the database tables
  - `functions/` has the edge functions that call Grants.gov, the IRS data, USASpending.gov, Stripe and the AI

## Running it

Website:

```
python3 -m http.server 3456
```

Then open http://localhost:3456

## Setup

1. Make a Supabase project and run `supabase/schema.sql` in the SQL editor.
2. Copy `config.example.js` to `config.js` and fill in your Supabase URL and key.
3. Add these secrets to Supabase: `GEMINI_API_KEY`, `GROQ_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the four `PRICE_...` ids from Stripe.
4. Deploy the functions with `supabase functions deploy`.
