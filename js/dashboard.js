async function loadDashboard() {
  // Say hi using the organization name
  if (answers.org_name) {
    document.getElementById('greeting').textContent = 'Welcome, ' + answers.org_name + '!';
  }

  // Count saved grants
  var grants = await supabase.from('grants').select('*').eq('user_id', currentUser.id);
  var grantCount = grants.data ? grants.data.length : 0;
  document.getElementById('stat-saved').textContent = grantCount;

  // Count drafts
  var drafts = await supabase.from('proposals').select('*').eq('user_id', currentUser.id);
  var draftCount = drafts.data ? drafts.data.length : 0;
  document.getElementById('stat-drafts').textContent = draftCount;

  // Get deadlines that are not done yet
  var deadlines = await supabase
    .from('deadlines')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('done', false)
    .order('due_date');

  var list = deadlines.data || [];
  document.getElementById('stat-deadlines').textContent = list.length;

  var html = '';
  for (var i = 0; i < list.length && i < 5; i++) {
    html += '<li>' + list[i].title + ' - due in ' + daysUntil(list[i].due_date) + ' days</li>';
  }
  if (html == '') html = '<li>No deadlines yet.</li>';
  document.getElementById('dash-deadlines').innerHTML = html;

  // Readiness percent comes from readiness.js
  document.getElementById('stat-ready').textContent = getReadinessScore() + '%';

  // Suggest what to do next
  var steps = '';
  if (grantCount == 0) steps += '<li><a href="#" onclick="showScreen(\'discover\')">Find your first grant</a></li>';
  if (getReadinessScore() < 100) steps += '<li><a href="#" onclick="showScreen(\'readiness\')">Finish your readiness checklist</a></li>';
  if (draftCount == 0) steps += '<li><a href="#" onclick="showScreen(\'generator\')">Write your first proposal</a></li>';
  if (steps == '') steps = '<li>You are all caught up!</li>';
  document.getElementById('next-steps').innerHTML = steps;
}
