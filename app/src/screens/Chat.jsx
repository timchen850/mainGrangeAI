import { useState } from 'react'
import { callFunction } from '../lib/supabase'

export default function Chat() {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hi! Ask me anything about grants.' },
  ])
  const [input, setInput] = useState('')
  const [waiting, setWaiting] = useState(false)

  async function send() {
    if (input.trim() === '') return

    const newList = [...messages, { role: 'user', text: input }]
    setMessages(newList)
    setInput('')
    setWaiting(true)

    const data = await callFunction('ai-chat', { messages: newList })
    const reply = data && data.reply ? data.reply : 'Sorry, something went wrong.'

    setMessages([...newList, { role: 'assistant', text: reply }])
    setWaiting(false)
  }

  return (
    <div>
      <h1>Grant Assistant</h1>
      <div className="chat-box">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'msg user' : 'msg bot'}>{m.text}</div>
        ))}
        {waiting && <div className="msg bot">Thinking...</div>}
      </div>
      <div className="row">
        <input
          value={input}
          placeholder="Ask a question..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send() }}
        />
        <button className="btn" onClick={send}>Send</button>
      </div>
    </div>
  )
}
