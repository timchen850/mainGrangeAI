import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (email === '' || password === '') {
      setError('Please fill in both boxes.')
      return
    }

    let result
    if (isSignUp) {
      result = await supabase.auth.signUp({ email: email, password: password })
    } else {
      result = await supabase.auth.signInWithPassword({ email: email, password: password })
    }

    if (result.error) {
      setError(result.error.message)
    }
  }

  return (
    <div className="center">
      <div className="card form">
        <h1>Grange AI</h1>
        <h3>{isSignUp ? 'Create an account' : 'Log in'}</h3>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn" onClick={handleSubmit}>Continue</button>
        <p className="error">{error}</p>
        <a href="#" onClick={() => setIsSignUp(!isSignUp)}>
          {isSignUp ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
        </a>
      </div>
    </div>
  )
}
