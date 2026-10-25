var myDeadlines = [];

async function loadDeadlines() {
  var result = await supabase
    .from('deadlines')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('due_date');

  myDeadlines = result.data || [];
  drawDeadlines();
}

function drawDeadlines() {
  var html = '';

  for (var i = 0; i < myDeadlines.length; i++) {
    var d = myDeadlines[i];
    var days = daysUntil(d.due_date);
    var label = '';

    if (d.done) label = 'Done';
    else if (days < 0) label = 'Overdue!';
    else if (days == 0) label = 'Due today';
    else label = days + ' days left';

    html += '<li class="card">';
    html += '<b>' + d.title + '</b> - ' + d.due_date + ' (' + label + ') ';
    if (!d.done) {
      html += '<button class="btn-outline" onclick="markDone(' + d.id + ')">Mark done</button>';
    }
    html += ' <button class="btn-outline" onclick="deleteDeadline(' + d.id + ')">Delete</button>';
    html += '</li>';
  }

  if (html == '') html = '<p>No deadlines yet. Save a grant or add one above.</p>';
  document.getElementById('deadline-list').innerHTML = html;
}

async function addDeadline() {
  var title = document.getElementById('dl-title').value;
  var date = document.getElementById('dl-date').value;

  if (title == '' || date == '') {
    showToast('Please fill in both boxes.');
    return;
  }

  await supabase.from('deadlines').insert({
    user_id: currentUser.id,
    title: title,
    due_date: date,
    done: false
  });

  document.getElementById('dl-title').value = '';
  document.getElementById('dl-date').value = '';
  loadDeadlines();
}

async function markDone(id) {
  await supabase.from('deadlines').update({ done: true }).eq('id', id);
  loadDeadlines();
}

async function deleteDeadline(id) {
  if (!confirm('Delete this deadline?')) return;
  await supabase.from('deadlines').delete().eq('id', id);
  loadDeadlines();
}

// Make a calendar file that works with Google Calendar, Outlook, etc.
function downloadCalendar() {
  var ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Grange AI//EN\n';

  for (var i = 0; i < myDeadlines.length; i++) {
    var d = myDeadlines[i];
    if (d.done) continue;
    var day = d.due_date.replace(/-/g, '');
    ics += 'BEGIN:VEVENT\n';
    ics += 'UID:grange-' + d.id + '\n';
    ics += 'DTSTART;VALUE=DATE:' + day + '\n';
    ics += 'SUMMARY:' + d.title + '\n';
    ics += 'END:VEVENT\n';
  }
  ics += 'END:VCALENDAR';

  var blob = new Blob([ics], { type: 'text/calendar' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'grant-deadlines.ics';
  link.click();
}
