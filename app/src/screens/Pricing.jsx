import { useState } from 'react'
import { callFunction } from '../lib/supabase'

const plans = [
  { id: 'starter', name: 'Starter', monthly: 14.99, yearly: 120, about: 'For small groups applying to a few grants.' },
  { id: 'pro', name: 'Pro', monthly: 35.99, yearly: 300, about: 'For organizations applying all year.' },
]

export default function Pricing() {
  const [billing, setBilling] = useState('monthly')

  async function buy(planId) {
    const data = await callFunction('create-checkout', { plan: planId, billing: billing })
    if (data && data.url) {
      window.open(data.url)
    } else {
      alert('Could not start checkout.')
    }
  }

  return (
    <div>
      <h1>Plans</h1>
      <button className={billing === 'monthly' ? 'btn' : 'btn-outline'} onClick={() => setBilling('monthly')}>Monthly</button>{' '}
      <button className={billing === 'yearly' ? 'btn' : 'btn-outline'} onClick={() => setBilling('yearly')}>Yearly</button>

      <div className="stats">
        {plans.map((plan) => (
          <div className="card" key={plan.id}>
            <h2>{plan.name}</h2>
            <h3>{billing === 'monthly' ? '$' + plan.monthly + ' / month' : '$' + plan.yearly + ' / year'}</h3>
            <p>{plan.about}</p>
            <button className="btn" onClick={() => buy(plan.id)}>Choose {plan.name}</button>
          </div>
        ))}
      </div>
    </div>
  )
}
