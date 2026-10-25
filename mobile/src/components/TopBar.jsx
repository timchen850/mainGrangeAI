import { supabase } from '../lib/supabase'

export default function TopBar({ title, setPage }) {
  return (
    <div className="topbar">
      <h2>{title}</h2>
      <div>
        <button className="link" onClick={() => setPage('profile')}>Profile</button>
        <button className="link" onClick={() => supabase.auth.signOut()}>Log out</button>
      </div>
    </div>
  )
}
