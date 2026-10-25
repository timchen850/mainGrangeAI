// Every message in the conversation so far
var chatHistory = [];

function addMessage(text, who) {
  var box = document.getElementById('chat-box');
  var div = document.createElement('div');
  div.className = 'msg ' + who;
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

async function sendChat() {
  var input = document.getElementById('chat-input');
  var question = input.value.trim();
  if (question == '') return;

  addMessage(question, 'user');
  chatHistory.push({ role: 'user', text: question });
  input.value = '';

  addMessage('Thinking...', 'bot');

  var data = await callFunction('ai-chat', { messages: chatHistory });

  // remove the "Thinking..." message
  var box = document.getElementById('chat-box');
  box.removeChild(box.lastChild);

  var reply = 'Sorry, I could not answer that right now.';
  if (data && data.reply) {
    reply = data.reply;
  }

  addMessage(reply, 'bot');
  chatHistory.push({ role: 'assistant', text: reply });
}
