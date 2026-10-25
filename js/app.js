const db = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);

let user = null;
let answers = {};

const screens = ['landing', 'login', 'onboarding', 'dashboard', 'discover',
  'readiness', 'generator', 'deadlines', 'chat', 'profile'];

function showScreen(name) {
  screens.forEach(s => document.getElementById(s).classList.add('hidden'));
  document.getElementById(name).classList.remove('hidden');
  window.scrollTo(0, 0);

  if (name == 'dashboard') loadDashboard();
  if (name == 'discover' && allGrants.length == 0) loadGrants();
  if (name == 'readiness') loadReadiness();
  if (name == 'deadlines') loadDeadlines();
  if (name == 'profile') loadProfile();
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el.timer);
  el.timer = setTimeout(() => el.classList.add('hidden'), 3000);
}

async function callFn(name, body) {
  const { data, error } = await db.functions.invoke(name, { body });
  if (error) {
    console.log(name, error);
    return null;
  }
  return data;
}

// "2026-05-01" gets read as UTC and shows up a day early, so add a time
function toDate(str) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) str += 'T00:00:00';
  return new Date(str);
}

function daysUntil(str) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((toDate(str) - today) / 86400000);
}

function money(n) {
  if (!n || isNaN(n)) return 'Not listed';
  return '$' + Number(n).toLocaleString();
}

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.onload = async () => {
  const { data } = await db.auth.getSession();
  if (data.session) {
    user = data.session.user;
    await afterLogin();
  } else {
    showScreen('landing');
  }
};
