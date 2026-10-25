// Checks if an EIN belongs to a real 501(c)(3)
// Uses the free ProPublica Nonprofit Explorer API
import { corsHeaders, sendJson, getUser } from '../_shared/helpers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const user = await getUser(req);
  if (!user) return sendJson({ error: 'Please log in' }, 401);

  const body = await req.json();
  const ein = String(body.ein || '').replace(/\D/g, '');

  if (ein.length !== 9) {
    return sendJson({ error: 'EIN must be 9 digits' }, 400);
  }

  const response = await fetch('https://projects.propublica.org/nonprofits/api/v2/organizations/' + ein + '.json');

  if (response.status === 404) {
    return sendJson({ found: false });
  }

  const data = await response.json();
  const org = data.organization;

  return sendJson({
    found: true,
    name: org.name,
    city: org.city,
    state: org.state,
    is_501c3: org.subsection_code === 3,
    status: org.subsection_code === 3 ? '501(c)(3) charity' : '501(c)(' + org.subsection_code + ')',
  });
});
