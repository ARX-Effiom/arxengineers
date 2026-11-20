import { useState } from 'react'
import './index.css'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import QuoteGenerator from './pages/QuoteGenerator'
import Invoices from './pages/Invoices'
import Comms from './pages/Comms'
import Contacts from './pages/Contacts'
import Referrals from './pages/Referrals'
import Tasks from './pages/Tasks'
import CalcChecker from './pages/CalcChecker'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import Login from './auth/Login'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '⬡' },
  { id: 'projects', label: 'Projects', icon: '📁' },
  { id: 'tasks', label: 'Tasks', icon: '✅' },
  { id: 'calcchecker', label: 'Calc Checker', icon: '🔍' },
  { id: 'quotes', label: 'Quote Generator', icon: '📝' },
  { id: 'invoices', label: 'Invoices', icon: '💷' },
  { id: 'comms', label: 'Comms', icon: '✉️' },
  { id: 'contacts', label: 'Contacts', icon: '👤' },
  { id: 'referrals', label: 'Referrals', icon: '🤝' },
]

// The original app shell, unchanged except for a signed-in footer with sign-out.
function Shell() {
  const { user, signOut } = useAuth()
  const [page, setPage] = useState('dashboard')

  const pages = {
    dashboard: <Dashboard onNavigate={setPage} />,
    projects: <Projects />,
    tasks: <Tasks />,
    calcchecker: <CalcChecker />,
    quotes: <QuoteGenerator />,
    invoices: <Invoices />,
    comms: <Comms />,
    contacts: <Contacts />,
    referrals: <Referrals />,
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 220, background: 'var(--purple-dark)',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 100,
      }}>
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ color: 'white', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' }}>ARX Engineers</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Aim For Excellence</div>
        </div>
        <nav style={{ padding: '12px 0', flex: 1 }}>
          {NAV.map(item => (
            <button key={item.id} onClick={() => setPage(item.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '10px 20px',
              background: page === item.id ? 'rgba(255,255,255,0.15)' : 'transparent',
              color: page === item.id ? 'white' : 'rgba(255,255,255,0.6)',
              borderRadius: 0,
              borderLeft: page === item.id ? '3px solid var(--purple-light)' : '3px solid transparent',
              fontSize: 14, fontWeight: page === item.id ? 600 : 400,
              textAlign: 'left', transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 600, marginBottom: 2, wordBreak: 'break-all' }}>
            {user?.email}
          </div>
          <button
            onClick={() => { if (window.confirm('Sign out of ARX Engineers?')) signOut() }}
            style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
              fontSize: 11, padding: 0, cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Sign out
          </button>
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Effiom Esua · Director</div>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 2 }}>Co. No. 16198467</div>
        </div>
      </aside>
      <main style={{ marginLeft: 220, flex: 1, minHeight: '100vh' }}>
        {pages[page]}
      </main>
    </div>
  )
}

// Gate: show nothing while loading, Login if no session, Shell if signed in.
function Gate() {
  const { loading, session } = useAuth()
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--purple-light, #F3EEF9)',
        color: 'var(--purple-dark, #3D1F6E)',
        fontFamily: 'Arial, sans-serif', fontSize: 14,
      }}>
        Loading…
      </div>
    )
  }
  if (!session) return <Login />
  return <Shell />
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
