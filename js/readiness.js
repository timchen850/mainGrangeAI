// Things most funders ask for
var checklistItems = [
  { id: 'ein', text: 'EIN (tax ID number)' },
  { id: 'irs_letter', text: 'IRS 501(c)(3) letter' },
  { id: 'budget', text: 'Current year budget' },
  { id: 'financials', text: 'Last year financial statements' },
  { id: 'board', text: 'List of board members' },
  { id: 'form990', text: 'Most recent Form 990' },
  { id: 'sam', text: 'Active SAM.gov registration' },
  { id: 'uei', text: 'UEI number' }
];

// Which boxes are checked. Saved in the browser.
var checked = JSON.parse(localStorage.getItem('checklist') || '{}');

function loadReadiness() {
  var html = '';
  for (var i = 0; i < checklistItems.length; i++) {
    var item = checklistItems[i];
    var isChecked = checked[item.id] ? 'checked' : '';
    html += '<li><label class="option">';
    html += '<input type="checkbox" ' + isChecked + ' onchange="toggleItem(\'' + item.id + '\')">';
    html += item.text + '</label></li>';
  }
  document.getElementById('checklist').innerHTML = html;

  if (answers.ein) {
    document.getElementById('ein-input').value = answers.ein;
  }

  var samDate = localStorage.getItem('samDate');
  if (samDate) {
    document.getElementById('sam-date').value = samDate;
  }

  updateScore();
  showSamStatus();
}

function toggleItem(id) {
  checked[id] = !checked[id];
  localStorage.setItem('checklist', JSON.stringify(checked));
  updateScore();
}

// Percent of the checklist that is done
function getReadinessScore() {
  var count = 0;
  for (var i = 0; i < checklistItems.length; i++) {
    if (checked[checklistItems[i].id]) count++;
  }
  return Math.round(count / checklistItems.length * 100);
}

function updateScore() {
  var score = getReadinessScore();
  document.getElementById('ready-fill').style.width = score + '%';
  document.getElementById('ready-score').textContent = 'You are ' + score + '% ready.';
}

// Ask our edge function to look up the EIN with the IRS data
async function checkIRS() {
  var ein = document.getElementById('ein-input').value.replace('-', '');
  var box = document.getElementById('irs-result');

  if (ein.length != 9) {
    box.innerHTML = '<p class="error">An EIN has 9 digits.</p>';
    return;
  }

  box.innerHTML = '<p>Checking...</p>';
  var data = await callFunction('irs-verify', { ein: ein });

  if (!data || !data.found) {
    box.innerHTML = '<p class="error">We could not find that EIN in IRS records.</p>';
    return;
  }

  var html = '<div class="card">';
  html += '<h3>' + data.name + '</h3>';
  html += '<p>' + data.city + ', ' + data.state + '</p>';
  html += '<p>Status: ' + data.status + '</p>';
  if (data.is_501c3) {
    html += '<p>Confirmed 501(c)(3)</p>';
    checked['irs_letter'] = true;
    localStorage.setItem('checklist', JSON.stringify(checked));
  } else {
    html += '<p class="error">Not listed as a 501(c)(3).</p>';
  }
  html += '</div>';
  box.innerHTML = html;
  updateScore();
}

function saveSamDate() {
  localStorage.setItem('samDate', document.getElementById('sam-date').value);
  showSamStatus();
}

// Warn the user when SAM.gov is about to run out
function showSamStatus() {
  var date = localStorage.getItem('samDate');
  var text = document.getElementById('sam-status');

  if (!date) {
    text.textContent = 'Enter your expiration date so we can remind you.';
    return;
  }

  var days = daysUntil(date);
  if (days < 0) {
    text.textContent = 'Your registration has expired! Renew it now.';
  } else if (days < 60) {
    text.textContent = 'Expires in ' + days + ' days. Start renewing soon.';
  } else {
    text.textContent = 'Good for ' + days + ' more days.';
  }
}
