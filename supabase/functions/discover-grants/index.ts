// Searches Grants.gov for open grants
// (the browser can't call Grants.gov directly so we do it here)
import { corsHeaders, sendJson } from '../_shared/helpers.ts';

async function searchGrantsGov(keyword: string) {
  const response = await fetch('https://api.grants.gov/v1/api/search2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword: keyword, rows: 25, oppStatuses: 'forecasted|posted' }),
  });

  if (!response.ok) return [];
  const data = await response.json();
  return data.data.oppHits || [];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const body = await req.json();
  let focusAreas = body.focus_areas || [];
  if (focusAreas.length === 0) focusAreas = ['community'];

  // Do one search for each focus area
  const grants: any[] = [];
  const seenIds: string[] = [];

  for (const area of focusAreas) {
    const hits = await searchGrantsGov(area);

    for (const hit of hits) {
      // skip grants we already added
      if (seenIds.includes(hit.id)) continue;
      seenIds.push(hit.id);

      grants.push({
        id: hit.id,
        title: hit.title,
        agency: hit.agency,
        close_date: hit.closeDate,
        status: hit.oppStatus,
        description: area,
      });
    }
  }

  return sendJson({ grants: grants });
});
