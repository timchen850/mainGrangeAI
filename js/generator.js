// Sections every proposal will have
var sections = [
  'Executive Summary',
  'Statement of Need',
  'Project Description',
  'Goals and Outcomes',
  'Evaluation Plan',
  'Budget Summary',
  'Organization Background'
];

// Put together the instructions we send to the AI
function buildPrompt() {
  var grant = document.getElementById('gen-grant').value;
  var funder = document.getElementById('gen-funder').value;
  var amount = document.getElementById('gen-amount').value;
  var project = document.getElementById('gen-project').value;
  var rfp = document.getElementById('gen-rfp').value;

  var prompt = 'Write a grant proposal for the "' + grant + '" grant from ' + funder + '.\n';
  prompt += 'We are asking for ' + amount + '.\n\n';
  prompt += 'About our organization:\n';
  prompt += 'Name: ' + answers.org_name + '\n';
  prompt += 'Type: ' + answers.entity_type + '\n';
  prompt += 'Mission: ' + answers.mission + '\n';
  prompt += 'Location: ' + answers.primary_location + '\n';
  prompt += 'Who we serve: ' + answers.beneficiaries + '\n';
  prompt += 'Budget: ' + answers.annual_budget + '\n\n';
  prompt += 'The project: ' + project + '\n\n';

  if (rfp != '') {
    prompt += 'The funder gave these instructions:\n' + rfp + '\n\n';
  }

  prompt += 'Use these sections: ' + sections.join(', ') + '.\n';
  prompt += 'Write in plain language. If you are not sure about a fact, write [VERIFY: what to check].';
  return prompt;
}

async function generateProposal() {
  var button = document.getElementById('gen-btn');

  if (document.getElementById('gen-project').value == '') {
    showToast('Please describe the project first.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Writing... (this takes about a minute)';

  var data = await callFunction('generate-proposal', { prompt: buildPrompt() });

  button.disabled = false;
  button.textContent = 'Write my draft';

  if (!data || !data.text) {
    showToast('Something went wrong. Please try again.');
    return;
  }

  showDraft(data.text);
}

// Put the draft on the page and highlight the [VERIFY] parts
function showDraft(text) {
  document.getElementById('gen-output').classList.remove('hidden');

  // stop any html in the text from running
  var safe = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  var highlighted = safe.replace(/\[VERIFY:[^\]]*\]/g, function (match) {
    return '<span class="verify">' + match + '</span>';
  });

  document.getElementById('draft').innerHTML = highlighted;
}

function copyDraft() {
  var text = document.getElementById('draft').innerText;
  navigator.clipboard.writeText(text);
  showToast('Copied!');
}

// Download the draft as a text file
function downloadDraft() {
  var text = document.getElementById('draft').innerText;
  var blob = new Blob([text], { type: 'text/plain' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'proposal.txt';
  link.click();
}

async function saveDraft() {
  var result = await supabase.from('proposals').insert({
    user_id: currentUser.id,
    grant_title: document.getElementById('gen-grant').value,
    content: document.getElementById('draft').innerText
  });

  if (result.error) {
    showToast('Could not save the draft.');
  } else {
    showToast('Draft saved!');
  }
}
