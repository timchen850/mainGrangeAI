import { useState } from 'react'
import { supabase, callFunction } from '../lib/supabase'

export default function Generator({ user, grant }) {
  const [grantName, setGrantName] = useState(grant ? grant.title : '')
  const [funder, setFunder] = useState(grant ? grant.agency : '')
  const [amount, setAmount] = useState('')
  const [project, setProject] = useState('')
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)

  async function generate() {
    if (project === '') {
      alert('Please describe your project.')
      return
    }

    setLoading(true)

    const result = await supabase.from('onboarding_answers').select('answers').eq('user_id', user.id).single()
    const answers = result.data ? result.data.answers : {}

    let prompt = 'Write a grant proposal for "' + grantName + '" from ' + funder + '.\n'
    prompt += 'Amount requested: ' + amount + '\n'
    prompt += 'Organization: ' + answers.org_name + '\n'
    prompt += 'Mission: ' + answers.mission + '\n'
    prompt += 'Project: ' + project + '\n'
    prompt += 'Include: Executive Summary, Statement of Need, Project Description, Goals, Evaluation, Budget.\n'
    prompt += 'Mark unsure facts with [VERIFY: ...].'

    const data = await callFunction('generate-proposal', { prompt: prompt })
    if (data && data.text) {
      setDraft(data.text)
    } else {
      alert('Something went wrong, try again.')
    }
    setLoading(false)
  }

  async function saveDraft() {
    await supabase.from('proposals').insert({ user_id: user.id, grant_title: grantName, content: draft })
    alert('Draft saved!')
  }

  return (
    <div>
      <h1>Write a Proposal</h1>
      <label>Grant name</label>
      <input value={grantName} onChange={(e) => setGrantName(e.target.value)} />
      <label>Funder</label>
      <input value={funder} onChange={(e) => setFunder(e.target.value)} />
      <label>Amount</label>
      <input value={amount} onChange={(e) => setAmount(e.target.value)} />
      <label>Describe the project</label>
      <textarea rows="5" value={project} onChange={(e) => setProject(e.target.value)} />

      <button className="btn" onClick={generate} disabled={loading}>
        {loading ? 'Writing...' : 'Write my draft'}
      </button>

      {draft !== '' && (
        <div>
          <h2>Your draft</h2>
          <textarea className="draft" rows="25" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button className="btn-outline" onClick={() => navigator.clipboard.writeText(draft)}>Copy</button>{' '}
          <button className="btn-outline" onClick={saveDraft}>Save</button>
        </div>
      )}
    </div>
  )
}
