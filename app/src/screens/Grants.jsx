import { useState, useEffect } from 'react'
import { supabase, formatMoney } from '../lib/supabase'

const statuses = ['saved', 'writing', 'submitted', 'won', 'lost']

export default function Grants({ user }) {
  const [grants, setGrants] = useState([])

  useEffect(() => {
    loadGrants()
  }, [])

  async function loadGrants() {
    const result = await supabase.from('grants').select('*').eq('user_id', user.id).order('deadline')
    setGrants(result.data || [])
  }

  async function changeStatus(id, status) {
    await supabase.from('grants').update({ status: status }).eq('id', id)
    loadGrants()
  }

  async function removeGrant(id) {
    if (!confirm('Remove this grant?')) return
    await supabase.from('grants').delete().eq('id', id)
    loadGrants()
  }

  return (
    <div>
      <h1>My Grants</h1>
      {grants.length === 0 && <p>You haven't saved any grants yet.</p>}

      {grants.map((grant) => (
        <div className="card" key={grant.id}>
          <h3>{grant.title}</h3>
          <p className="small">{grant.funder} | Due {grant.deadline || 'not listed'} | {formatMoney(grant.amount)}</p>
          <select value={grant.status} onChange={(e) => changeStatus(grant.id, e.target.value)}>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn-outline" onClick={() => removeGrant(grant.id)}>Remove</button>
        </div>
      ))}
    </div>
  )
}
