import { supabase } from '../lib/supabase'

const links = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'discovery', label: 'Find Grants' },
  { id: 'grants', label: 'My Grants' },
  { id: 'readiness', label: 'Readiness' },
  { id: 'generator', label: 'Write Proposal' },
  { id: 'chat', label: 'Assistant' },
  { id: 'profile', label: 'Profile' },
  { id: 'pricing', label: 'Plans' },
]

export default function Sidebar({ page, setPage }) {
  return (
    <div className="sidebar">
      <h2 className="logo">Grange AI</h2>
      {links.map((link) => (
        <button
          key={link.id}
          className={page === link.id ? 'side-link active' : 'side-link'}
          onClick={() => setPage(link.id)}
        >
          {link.label}
        </button>
      ))}
      <button className="side-link" onClick={() => supabase.auth.signOut()}>
        Log out
      </button>
    </div>
  )
}
