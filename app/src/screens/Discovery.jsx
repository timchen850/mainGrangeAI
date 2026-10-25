import { useState, useEffect } from 'react'
import { supabase, callFunction, formatMoney } from '../lib/supabase'

export default function Discovery({ user, setPage, setSelectedGrant }) {
  const [grants, setGrants] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [answers, setAnswers] = useState({})

  useEffect(() => {
    loadGrants()
  }, [])

  async function loadGrants() {
    setLoading(true)

    // Get the survey answers so we can score the grants
    const result = await supabase.from('onboarding_answers').select('answers').eq('user_id', user.id).single()
    const myAnswers = result.data ? result.data.answers : {}
    setAnswers(myAnswers)

    const data = await callFunction('discover-grants', { focus_areas: myAnswers.focus_areas || [] })
    if (data && data.grants) {
      const scored = data.grants.map((g) => ({ ...g, score: scoreGrant(g, myAnswers) }))
      scored.sort((a, b) => b.score - a.score)
      setGrants(scored)
    }
    setLoading(false)
  }

  // Simple match score out of 99
  function scoreGrant(grant, myAnswers) {
    let score = 35
    const text = grant.title.toLowerCase()
    const areas = myAnswers.focus_areas || []
    for (let i = 0; i < areas.length; i++) {
      if (text.includes(areas[i].toLowerCase())) score += 14
    }
    if (score > 99) score = 99
    return score
  }

  async function saveGrant(grant) {
    await supabase.from('grants').insert({
      user_id: user.id,
      title: grant.title,
      funder: grant.agency,
      deadline: grant.close_date,
      match_score: grant.score,
    })
    alert('Saved!')
  }

  function writeProposal(grant) {
    setSelectedGrant(grant)
    setPage('generator')
  }

  const shown = grants.filter((g) => g.title.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <h1>Find Grants</h1>
      <input placeholder="Search grants" value={search} onChange={(e) => setSearch(e.target.value)} />
      {loading && <p>Searching Grants.gov...</p>}

      {shown.map((grant) => (
        <div className="card" key={grant.id}>
          <span className="score">{grant.score}%</span>
          <h3>{grant.title}</h3>
          <p className="small">{grant.agency} | Closes {grant.close_date || 'not listed'}</p>
          <p>Award: {formatMoney(grant.award_ceiling)}</p>
          <button className="btn-outline" onClick={() => saveGrant(grant)}>Save</button>{' '}
          <button className="btn-outline" onClick={() => writeProposal(grant)}>Write proposal</button>
        </div>
      ))}
    </div>
  )
}
