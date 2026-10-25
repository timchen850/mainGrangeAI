// true when the form is in "sign up" mode, false for "log in"
var isSignUp = false;

// Switch between log in and sign up
function toggleSignUp() {
  isSignUp = !isSignUp;

  if (isSignUp) {
    document.getElementById('login-title').textContent = 'Create an account';
    document.getElementById('switch-link').textContent = 'Already have an account? Log in';
  } else {
    document.getElementById('login-title').textContent = 'Log in';
    document.getElementById('switch-link').textContent = "Don't have an account? Sign up";
  }
}

async function handleLogin() {
  var email = document.getElementById('email').value;
  var password = document.getElementById('password').value;
  var errorText = document.getElementById('login-error');

  // Make sure both boxes are filled in
  if (email == '' || password == '') {
    errorText.textContent = 'Please enter your email and password.';
    return;
  }

  if (password.length < 6) {
    errorText.textContent = 'Password must be at least 6 characters.';
    return;
  }

  var result;
  if (isSignUp) {
    result = await supabase.auth.signUp({ email: email, password: password });
  } else {
    result = await supabase.auth.signInWithPassword({ email: email, password: password });
  }

  if (result.error) {
    errorText.textContent = result.error.message;
    return;
  }

  errorText.textContent = '';
  currentUser = result.data.user;
  await afterLogin();
}

async function logInWithGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
}

// Runs after the user logs in
async function afterLogin() {
  document.getElementById('navbar').classList.remove('hidden');

  // Get their survey answers from the database
  var result = await supabase
    .from('onboarding_answers')
    .select('*')
    .eq('user_id', currentUser.id)
    .single();

  if (result.data) {
    answers = result.data.answers;
    showScreen('dashboard');
  } else {
    // New user, send them to the survey
    startOnboarding();
  }
}

async function logOut() {
  await supabase.auth.signOut();
  currentUser = null;
  answers = {};
  document.getElementById('navbar').classList.add('hidden');
  showScreen('landing');
}
