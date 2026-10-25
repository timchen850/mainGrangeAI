import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Sidebar from './components/Sidebar'
import Auth from './screens/Auth'
import Dashboard from './screens/Dashboard'
import Discovery from './screens/Discovery'
import Generator from './screens/Generator'
import Grants from './screens/Grants'
import Readiness from './screens/Readiness'
import Chat from './screens/Chat'
import Profile from './screens/Profile'
import Pricing from './screens/Pricing'

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState('dashboard')
  // the grant picked on the Discovery page, used by the Generator
  const [selectedGrant, setSelectedGrant] = useState(null)

  // Check if someone is logged in when the app opens
  useEffect(() => {
    supabase.auth.getSession().then((result) => {
      if (result.data.session) {
        setUser(result.data.session.user)
      }
      setLoading(false)
    })

    // Update when they log in or out
    supabase.auth.onAuthStateChange((event, session) => {
      setUser(session ? session.user : null)
    })
  }, [])

  if (loading) {
    return <div className="center">Loading...</div>
  }

  if (!user) {
    return <Auth />
  }

  // Pick which screen to show
  let screen
  if (page === 'dashboard') screen = <Dashboard user={user} setPage={setPage} />
  else if (page === 'discovery') screen = <Discovery user={user} setPage={setPage} setSelectedGrant={setSelectedGrant} />
  else if (page === 'generator') screen = <Generator user={user} grant={selectedGrant} />
  else if (page === 'grants') screen = <Grants user={user} />
  else if (page === 'readiness') screen = <Readiness user={user} />
  else if (page === 'chat') screen = <Chat />
  else if (page === 'profile') screen = <Profile user={user} />
  else if (page === 'pricing') screen = <Pricing />

  return (
    <div className="layout">
      <Sidebar page={page} setPage={setPage} />
      <main className="main">{screen}</main>
    </div>
  )
}
