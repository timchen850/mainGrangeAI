import { useState, useEffect } from 'react'
import { supabase, daysUntil } from '../lib/supabase'

export default function Dashboard({ user, setPage }) {
  const [grants, setGrants] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [orgName, setOrgName] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const profile = await supabase.from('profiles').select('org_name').eq('id', user.id).single()
    if (profile.data) setOrgName(profile.data.org_name)

    const g = await supabase.from('grants').select('*').eq('user_id', user.id)
    setGrants(g.data || [])

    const d = await supabase.from('deadlines').select('*').eq('user_id', user.id).eq('done', false).order('due_date')
    setDeadlines(d.data || [])
  }

  return (
    <div>
      <h1>Welcome{orgName ? ', ' + orgName : ''}!</h1>

      <div className="stats">
        <div className="card"><h2>{grants.length}</h2><p>Saved grants</p></div>
        <div className="card"><h2>{deadlines.length}</h2><p>Upcoming deadlines</p></div>
      </div>

      <h2>Coming up</h2>
      {deadlines.length === 0 && <p>No deadlines yet.</p>}
      <ul>
        {deadlines.slice(0, 5).map((d) => (
          <li key={d.id}>{d.title} - {daysUntil(d.due_date)} days left</li>
        ))}
      </ul>

      <h2>Quick actions</h2>
      <button className="btn" onClick={() => setPage('discovery')}>Find grants</button>{' '}
      <button className="btn" onClick={() => setPage('generator')}>Write a proposal</button>
    </div>
  )
}
