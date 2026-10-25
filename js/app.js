// Connect to Supabase (our database and login service)
var supabase = window.supabase.createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.anonKey
);

// The logged in user and their survey answers
var currentUser = null;
var answers = {};

// List of every screen on the page
var screens = [
  'landing', 'login', 'onboarding', 'dashboard', 'discover',
  'readiness', 'generator', 'deadlines', 'chat', 'profile'
];

// Hide all screens and show just one
function showScreen(name) {
  for (var i = 0; i < screens.length; i++) {
    document.getElementById(screens[i]).classList.add('hidden');
  }
  document.getElementById(name).classList.remove('hidden');

  // Load the data for the screen we just opened
  if (name == 'dashboard') loadDashboard();
  if (name == 'discover') loadGrants();
  if (name == 'readiness') loadReadiness();
  if (name == 'deadlines') loadDeadlines();
  if (name == 'profile') loadProfile();
}

// Show a small message in the corner for 3 seconds
function showToast(message) {
  var toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(function () {
    toast.classList.add('hidden');
  }, 3000);
}

// Call one of our Supabase edge functions
async function callFunction(name, body) {
  var result = await supabase.functions.invoke(name, { body: body });
  if (result.error) {
    console.log('Error calling ' + name, result.error);
    return null;
  }
  return result.data;
}

// Turn a date into how many days away it is
function daysUntil(dateString) {
  var today = new Date();
  var due = new Date(dateString);
  var diff = due - today;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// Format a number like 50000 into $50,000
function formatMoney(num) {
  if (!num) return 'Not listed';
  return '$' + Number(num).toLocaleString();
}

// When the page loads, check if someone is already logged in
window.onload = async function () {
  var result = await supabase.auth.getSession();
  var session = result.data.session;

  if (session) {
    currentUser = session.user;
    await afterLogin();
  } else {
    showScreen('landing');
  }
};
