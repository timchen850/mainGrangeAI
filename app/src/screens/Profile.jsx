import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const focusOptions = ['Education', 'Housing', 'Food Security', 'Health', 'Environment', 'Arts', 'Youth', 'Veterans']

export default function Profile({ user }) {
  const [answers, setAnswers] = useState({ focus_areas: [] })
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    const result = await supabase.from('onboarding_answers').select('answers').eq('user_id', user.id).single()
    if (result.data) setAnswers(result.data.answers)
  }

  // Update one answer
  function update(key, value) {
    setAnswers({ ...answers, [key]: value })
  }

  function toggleFocus(area) {
    let list = answers.focus_areas || []
    if (list.includes(area)) {
      list = list.filter((a) => a !== area)
    } else {
      list = [...list, area]
    }
    update('focus_areas', list)
  }

  async function save() {
    await supabase.from('onboarding_answers').upsert({ user_id: user.id, answers: answers })
    await supabase.from('profiles').upsert({ id: user.id, org_name: answers.org_name })
    setMessage('Saved!')
  }

  return (
    <div>
      <h1>Profile</h1>
      <label>Organization name</label>
      <input value={answers.org_name || ''} onChange={(e) => update('org_name', e.target.value)} />
      <label>EIN</label>
      <input value={answers.ein || ''} onChange={(e) => update('ein', e.target.value)} />
      <label>Mission</label>
      <textarea rows="3" value={answers.mission || ''} onChange={(e) => update('mission', e.target.value)} />
      <label>Location</label>
      <input value={answers.primary_location || ''} onChange={(e) => update('primary_location', e.target.value)} />

      <label>Focus areas</label>
      {focusOptions.map((area) => (
        <label className="option" key={area}>
          <input
            type="checkbox"
            checked={(answers.focus_areas || []).includes(area)}
            onChange={() => toggleFocus(area)}
          />
          {area}
        </label>
      ))}

      <button className="btn" onClick={save}>Save</button>
      <p>{message}</p>
    </div>
  )
}
