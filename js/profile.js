// Nice names for each answer
var labels = {
  org_name: 'Organization',
  entity_type: 'Type',
  ein: 'EIN',
  mission: 'Mission',
  focus_areas: 'Focus areas',
  primary_location: 'Location',
  annual_budget: 'Budget',
  staff_count: 'Staff'
};

function loadProfile() {
  var html = '<div class="card">';
  for (var key in labels) {
    var value = answers[key];
    if (Array.isArray(value)) value = value.join(', ');
    html += '<p><b>' + labels[key] + ':</b> ' + (value || '-') + '</p>';
  }
  html += '</div>';
  document.getElementById('profile-info').innerHTML = html;
}

// Go back through the survey with answers filled in
function editProfile() {
  startOnboarding();
}

// Save a past proposal so the AI can match the writing style
async function uploadPastProposal() {
  var text = document.getElementById('past-text').value;
  var status = document.getElementById('past-status');

  if (text.length < 100) {
    status.textContent = 'Please paste a longer piece of writing.';
    return;
  }

  status.textContent = 'Saving...';
  var data = await callFunction('rag-ingest', { text: text, label: 'Past proposal' });

  if (data && data.ok) {
    status.textContent = 'Saved! Future drafts will use this.';
    document.getElementById('past-text').value = '';
  } else {
    status.textContent = 'Could not save it.';
  }
}
