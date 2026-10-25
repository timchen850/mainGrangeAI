// Finds past federal grants given to similar organizations
import { corsHeaders, sendJson } from '../_shared/helpers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const body = await req.json();
  const keywords = body.keywords || [];
  if (keywords.length === 0) return sendJson({ results: [] });

  const filters: any = {
    award_type_codes: ['02', '03', '04', '05'],
    keywords: keywords,
    time_period: [{ start_date: '2022-01-01', end_date: new Date().toISOString().slice(0, 10) }],
  };

  // if we know their state, only show awards there
  const stateMatch = (body.location || '').match(/\b([A-Z]{2})\b/);
  if (stateMatch) {
    filters.recipient_locations = [{ country: 'USA', state: stateMatch[1] }];
  }

  const response = await fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filters: filters,
      fields: ['Recipient Name', 'Award Amount', 'Awarding Agency'],
      limit: 10,
    }),
  });

  if (!response.ok) return sendJson({ results: [] });
  const data = await response.json();

  const results = [];
  for (const row of data.results) {
    results.push({
      recipient: row['Recipient Name'],
      amount: row['Award Amount'],
      agency: row['Awarding Agency'],
    });
  }

  return sendJson({ results: results });
});
