// The questions in the survey, split into steps
var steps = [
  {
    title: 'Tell us about your organization',
    fields: [
      { key: 'org_name', label: 'Organization name', type: 'text', required: true },
      { key: 'entity_type', label: 'What kind of organization are you?', type: 'radio', required: true,
        options: ['501(c)(3) nonprofit', 'Other nonprofit', 'Fiscal sponsorship', 'Government / tribal', 'Not a nonprofit', 'Not sure'] },
      { key: 'ein', label: 'EIN (tax ID number)', type: 'text' },
      { key: 'year_founded', label: 'Year founded', type: 'number' }
    ]
  },
  {
    title: 'What do you work on?',
    fields: [
      { key: 'mission', label: 'Mission statement', type: 'textarea', required: true },
      { key: 'focus_areas', label: 'Focus areas', type: 'multi',
        options: ['Education', 'Housing', 'Food Security', 'Health', 'Environment', 'Arts', 'Youth', 'Veterans', 'Workforce', 'Community Development'] },
      { key: 'beneficiaries', label: 'Who do you serve?', type: 'textarea' }
    ]
  },
  {
    title: 'Where do you work?',
    fields: [
      { key: 'geo_focus', label: 'Geographic focus', type: 'radio', required: true,
        options: ['Local', 'Regional', 'Statewide', 'National', 'International'] },
      { key: 'primary_location', label: 'City and state', type: 'text', required: true },
      { key: 'people_served', label: 'People served per year', type: 'number' }
    ]
  },
  {
    title: 'Your size',
    fields: [
      { key: 'annual_budget', label: 'Annual budget', type: 'select', required: true,
        options: ['<$100K', '$100K-$500K', '$500K-$1M', '$1M-$5M', '$5M+'] },
      { key: 'staff_count', label: 'Full time staff', type: 'number' },
      { key: 'applied_before', label: 'Have you applied for grants before?', type: 'radio', options: ['Yes', 'No'] }
    ]
  }
];

var stepNumber = 0;

function startOnboarding() {
  stepNumber = 0;
  showScreen('onboarding');
  drawStep();
}

// Build the HTML for the current step
function drawStep() {
  var step = steps[stepNumber];
  document.getElementById('ob-title').textContent = step.title;
  document.getElementById('ob-step-label').textContent = 'Step ' + (stepNumber + 1) + ' of ' + steps.length;
  document.getElementById('progress-fill').style.width = (stepNumber / steps.length * 100) + '%';

  var html = '';
  for (var i = 0; i < step.fields.length; i++) {
    var field = step.fields[i];
    var value = answers[field.key] || '';
    html += '<label>' + field.label + (field.required ? ' *' : '') + '</label>';

    if (field.type == 'text' || field.type == 'number') {
      html += '<input type="' + field.type + '" id="f-' + field.key + '" value="' + value + '">';
    } else if (field.type == 'textarea') {
      html += '<textarea id="f-' + field.key + '" rows="3">' + value + '</textarea>';
    } else if (field.type == 'select') {
      html += '<select id="f-' + field.key + '"><option value="">Pick one</option>';
      for (var j = 0; j < field.options.length; j++) {
        var selected = value == field.options[j] ? ' selected' : '';
        html += '<option' + selected + '>' + field.options[j] + '</option>';
      }
      html += '</select>';
    } else if (field.type == 'radio' || field.type == 'multi') {
      var inputType = field.type == 'radio' ? 'radio' : 'checkbox';
      for (var j = 0; j < field.options.length; j++) {
        var opt = field.options[j];
        var checked = '';
        if (value == opt || (Array.isArray(value) && value.includes(opt))) checked = ' checked';
        html += '<label class="option"><input type="' + inputType + '" name="f-' + field.key + '" value="' + opt + '"' + checked + '>' + opt + '</label>';
      }
    }
  }
  document.getElementById('ob-fields').innerHTML = html;

  // Change the button text on the last step
  if (stepNumber == steps.length - 1) {
    document.getElementById('ob-next').textContent = 'Finish';
  } else {
    document.getElementById('ob-next').textContent = 'Continue';
  }
}

// Read what the user typed into the current step
function saveStepAnswers() {
  var step = steps[stepNumber];

  for (var i = 0; i < step.fields.length; i++) {
    var field = step.fields[i];

    if (field.type == 'radio') {
      var picked = document.querySelector('input[name="f-' + field.key + '"]:checked');
      answers[field.key] = picked ? picked.value : '';
    } else if (field.type == 'multi') {
      var boxes = document.querySelectorAll('input[name="f-' + field.key + '"]:checked');
      var list = [];
      for (var j = 0; j < boxes.length; j++) {
        list.push(boxes[j].value);
      }
      answers[field.key] = list;
    } else {
      answers[field.key] = document.getElementById('f-' + field.key).value;
    }
  }
}

// Check that required questions are answered
function stepIsValid() {
  var step = steps[stepNumber];
  for (var i = 0; i < step.fields.length; i++) {
    var field = step.fields[i];
    if (field.required && !answers[field.key]) {
      document.getElementById('ob-error').textContent = 'Please answer: ' + field.label;
      return false;
    }
  }
  document.getElementById('ob-error').textContent = '';
  return true;
}

async function nextStep() {
  saveStepAnswers();
  if (!stepIsValid()) return;

  if (stepNumber < steps.length - 1) {
    stepNumber++;
    drawStep();
  } else {
    await finishOnboarding();
  }
}

function prevStep() {
  saveStepAnswers();
  if (stepNumber > 0) {
    stepNumber--;
    drawStep();
  }
}

// Save all the answers to the database
async function finishOnboarding() {
  var result = await supabase.from('onboarding_answers').upsert({
    user_id: currentUser.id,
    answers: answers
  });

  if (result.error) {
    document.getElementById('ob-error').textContent = 'Could not save. Try again.';
    return;
  }

  // Also save the org name on the profile
  await supabase.from('profiles').upsert({
    id: currentUser.id,
    org_name: answers.org_name,
    org_type: answers.entity_type,
    ein: answers.ein
  });

  showToast('Profile saved!');
  showScreen('dashboard');
}
