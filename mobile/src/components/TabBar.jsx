const tabs = [
  { id: 'dashboard', label: 'Home' },
  { id: 'discovery', label: 'Find' },
  { id: 'grants', label: 'Grants' },
  { id: 'generator', label: 'Write' },
  { id: 'readiness', label: 'Ready' },
  { id: 'chat', label: 'Chat' },
]

export default function TabBar({ page, setPage }) {
  return (
    <div className="tabbar">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={page === tab.id ? 'tab active' : 'tab'}
          onClick={() => setPage(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
