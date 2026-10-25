import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import TopBar from './components/TopBar'
import TabBar from './components/TabBar'
import Auth from './screens/Auth'
import Dashboard from './screens/Dashboard'
import Discovery from './screens/Discovery'
import Generator from './screens/Generator'
import Grants from './screens/Grants'
import Readiness from './screens/Readiness'
import Chat from './screens/Chat'
import Profile from './screens/Profile'

// Titles shown at the top of each screen
const titles = {
  dashboard: 'Home',
  discovery: 'Find Grants',
  grants: 'My Grants',
  readiness: 'Readiness',
  generator: 'Write',
  chat: 'Assistant',
  profile: 'Profile',
}

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState('dashboard')
  const [selectedGrant, setSelectedGrant] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then((result) => {
      if (result.data.session) setUser(result.data.session.user)
      setLoading(false)
    })

    supabase.auth.onAuthStateChange((event, session) => {
      setUser(session ? session.user : null)
    })
  }, [])

  if (loading) return <div className="center">Loading...</div>
  if (!user) return <Auth />

  let screen
  if (page === 'dashboard') screen = <Dashboard user={user} setPage={setPage} />
  else if (page === 'discovery') screen = <Discovery user={user} setPage={setPage} setSelectedGrant={setSelectedGrant} />
  else if (page === 'generator') screen = <Generator user={user} grant={selectedGrant} />
  else if (page === 'grants') screen = <Grants user={user} />
  else if (page === 'readiness') screen = <Readiness user={user} />
  else if (page === 'chat') screen = <Chat />
  else if (page === 'profile') screen = <Profile user={user} />

  return (
    <div className="phone">
      <TopBar title={titles[page]} setPage={setPage} />
      <main className="main">{screen}</main>
      <TabBar page={page} setPage={setPage} />
    </div>
  )
}
