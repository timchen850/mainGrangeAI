// Gets the full details for some grants (amount, description, who can apply)
import { corsHeaders, sendJson } from '../_shared/helpers.ts';

// Remove html tags from the description
function stripHtml(text: string) {
  if (!text) return '';
  return text.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const body = await req.json();
  const ids = body.ids || [];
  const details: any[] = [];

  // only look up 10 at a time so it isn't too slow
  for (let i = 0; i < ids.length && i < 10; i++) {
    const response = await fetch('https://api.grants.gov/v1/api/fetchOpportunity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunityId: Number(ids[i]) }),
    });

    if (!response.ok) continue;
    const data = await response.json();
    const synopsis = data.data.synopsis || {};

    details.push({
      id: ids[i],
      description: stripHtml(synopsis.synopsisDesc).slice(0, 1000),
      award_ceiling: synopsis.awardCeiling,
      award_floor: synopsis.awardFloor,
      eligibility: stripHtml(synopsis.applicantEligibilityDesc),
    });
  }

  return sendJson({ details: details });
});
