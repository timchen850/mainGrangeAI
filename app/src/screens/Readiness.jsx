import { useState } from 'react'
import { callFunction } from '../lib/supabase'

const items = [
  'EIN (tax ID number)',
  'IRS 501(c)(3) letter',
  'Current year budget',
  'Last year financial statements',
  'List of board members',
  'Most recent Form 990',
  'Active SAM.gov registration',
  'UEI number',
]

export default function Readiness() {
  // load saved checkboxes from the computer
  const [checked, setChecked] = useState(JSON.parse(localStorage.getItem('checklist') || '{}'))
  const [ein, setEin] = useState('')
  const [irsResult, setIrsResult] = useState(null)

  function toggle(item) {
    const copy = { ...checked }
    copy[item] = !copy[item]
    setChecked(copy)
    localStorage.setItem('checklist', JSON.stringify(copy))
  }

  async function checkIRS() {
    const data = await callFunction('irs-verify', { ein: ein })
    setIrsResult(data)
  }

  let doneCount = 0
  for (let i = 0; i < items.length; i++) {
    if (checked[items[i]]) doneCount++
  }
  const percent = Math.round(doneCount / items.length * 100)

  return (
    <div>
      <h1>Readiness</h1>
      <div className="progress"><div className="fill" style={{ width: percent + '%' }}></div></div>
      <p>You are {percent}% ready to apply.</p>

      {items.map((item) => (
        <label className="option" key={item}>
          <input type="checkbox" checked={!!checked[item]} onChange={() => toggle(item)} />
          {item}
        </label>
      ))}

      <h2>Check IRS status</h2>
      <input placeholder="EIN" value={ein} onChange={(e) => setEin(e.target.value)} />
      <button className="btn" onClick={checkIRS}>Check</button>

      {irsResult && irsResult.found && (
        <div className="card">
          <h3>{irsResult.name}</h3>
          <p>{irsResult.city}, {irsResult.state}</p>
          <p>{irsResult.is_501c3 ? 'Confirmed 501(c)(3)' : 'Not a 501(c)(3)'}</p>
        </div>
      )}
      {irsResult && !irsResult.found && <p className="error">EIN not found.</p>}
    </div>
  )
}
