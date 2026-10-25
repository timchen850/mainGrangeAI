// All grants we found, before filtering
var allGrants = [];

async function loadGrants() {
  document.getElementById('grant-status').textContent = 'Searching Grants.gov...';

  // Our edge function talks to Grants.gov for us
  var data = await callFunction('discover-grants', {
    focus_areas: answers.focus_areas || [],
    mission: answers.mission || ''
  });

  if (!data || !data.grants) {
    document.getElementById('grant-status').textContent = 'Could not load grants right now.';
    return;
  }

  allGrants = [];
  for (var i = 0; i < data.grants.length; i++) {
    var grant = data.grants[i];
    grant.score = calcMatchScore(grant);
    allGrants.push(grant);
  }

  document.getElementById('grant-status').textContent = 'Found ' + allGrants.length + ' grants.';
  filterGrants();
  loadPastAwards();
}

// Give each grant a score from 0 to 99 based on how well it fits
function calcMatchScore(grant) {
  var score = 35;
  var text = (grant.title + ' ' + (grant.description || '')).toLowerCase();

  // Points for each focus area that shows up in the grant
  var focusAreas = answers.focus_areas || [];
  for (var i = 0; i < focusAreas.length; i++) {
    if (text.includes(focusAreas[i].toLowerCase())) {
      score += 14;
    }
  }

  // A few points for words from the mission
  var missionWords = (answers.mission || '').toLowerCase().split(' ');
  var wordPoints = 0;
  for (var i = 0; i < missionWords.length; i++) {
    if (missionWords[i].length > 4 && text.includes(missionWords[i])) {
      wordPoints += 2;
    }
  }
  if (wordPoints > 12) wordPoints = 12;
  score += wordPoints;

  // Lose points if it needs 501(c)(3) and the user isn't one
  if (text.includes('501(c)(3)') && answers.entity_type != '501(c)(3) nonprofit') {
    score -= 20;
  }

  if (score > 99) score = 99;
  if (score < 0) score = 0;
  return score;
}

// Search and sort the list, then draw it
function filterGrants() {
  var search = document.getElementById('search-box').value.toLowerCase();
  var sortBy = document.getElementById('sort-select').value;

  var shown = [];
  for (var i = 0; i < allGrants.length; i++) {
    if (allGrants[i].title.toLowerCase().includes(search)) {
      shown.push(allGrants[i]);
    }
  }

  if (sortBy == 'score') {
    shown.sort(function (a, b) { return b.score - a.score; });
  } else {
    shown.sort(function (a, b) { return new Date(a.close_date) - new Date(b.close_date); });
  }

  drawGrants(shown);
}

function drawGrants(list) {
  var html = '';
  for (var i = 0; i < list.length; i++) {
    var g = list[i];
    var color = 'low';
    if (g.score >= 70) color = 'high';
    else if (g.score >= 45) color = 'mid';

    html += '<div class="grant">';
    html += '<span class="score ' + color + '">' + g.score + '% match</span>';
    html += '<h3>' + g.title + '</h3>';
    html += '<p class="small">' + g.agency + ' | Closes: ' + (g.close_date || 'Not listed') + '</p>';
    html += '<p>Award: ' + formatMoney(g.award_ceiling) + '</p>';
    html += '<button class="btn-outline" onclick="saveGrant(' + i + ')">Save</button> ';
    html += '<button class="btn-outline" onclick="draftForGrant(' + i + ')">Write proposal</button> ';
    html += '<a href="https://www.grants.gov/search-results-detail/' + g.id + '" target="_blank">View on Grants.gov</a>';
    html += '</div>';
  }
  if (html == '') html = '<p>No grants match your search.</p>';
  document.getElementById('grant-list').innerHTML = html;

  // remember which list is on screen so the buttons know which grant
  window.shownGrants = list;
}

async function saveGrant(index) {
  var g = window.shownGrants[index];

  await supabase.from('grants').insert({
    user_id: currentUser.id,
    title: g.title,
    funder: g.agency,
    amount: g.award_ceiling,
    deadline: g.close_date,
    match_score: g.score
  });

  // Add the deadline too so it shows up on the deadlines page
  if (g.close_date) {
    await supabase.from('deadlines').insert({
      user_id: currentUser.id,
      title: g.title,
      due_date: g.close_date,
      done: false
    });
  }

  showToast('Grant saved!');
}

// Open the generator with this grant filled in
function draftForGrant(index) {
  var g = window.shownGrants[index];
  showScreen('generator');
  document.getElementById('gen-grant').value = g.title;
  document.getElementById('gen-funder').value = g.agency;
  document.getElementById('gen-amount').value = g.award_ceiling ? formatMoney(g.award_ceiling) : '';
}

// Show federal awards given to similar groups in the past
async function loadPastAwards() {
  var data = await callFunction('usaspending-search', {
    keywords: answers.focus_areas || [],
    location: answers.primary_location || ''
  });

  var html = '';
  if (data && data.results) {
    for (var i = 0; i < data.results.length; i++) {
      var award = data.results[i];
      html += '<div class="grant">';
      html += '<h3>' + award.recipient + '</h3>';
      html += '<p>' + formatMoney(award.amount) + ' from ' + award.agency + '</p>';
      html += '</div>';
    }
  }
  if (html == '') html = '<p class="small">No past awards found.</p>';
  document.getElementById('past-awards').innerHTML = html;
}
