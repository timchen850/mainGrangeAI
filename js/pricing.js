var plans = {
  starter: { monthly: 14.99, yearly: 120 },
  pro: { monthly: 35.99, yearly: 300 }
};

var billing = 'monthly';

function setBilling(type) {
  billing = type;
  document.getElementById('monthly-btn').classList.toggle('on', type == 'monthly');
  document.getElementById('yearly-btn').classList.toggle('on', type == 'yearly');

  if (type == 'monthly') {
    document.getElementById('starter-price').textContent = '$' + plans.starter.monthly + ' / month';
    document.getElementById('pro-price').textContent = '$' + plans.pro.monthly + ' / month';
  } else {
    document.getElementById('starter-price').textContent = '$' + plans.starter.yearly + ' / year';
    document.getElementById('pro-price').textContent = '$' + plans.pro.yearly + ' / year';
  }
}

// Send the user to Stripe to pay
async function buyPlan(plan) {
  if (!currentUser) {
    showScreen('login');
    return;
  }

  var data = await callFunction('create-checkout', { plan: plan, billing: billing });
  if (data && data.url) {
    window.location.href = data.url;
  } else {
    showToast('Could not start checkout.');
  }
}
