import { useState } from 'react'
import './index.css'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import QuoteGenerator from './pages/QuoteGenerator'
import Invoices from './pages/Invoices'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '⬡' },
  { id: 'projects', label: 'Projects', icon: '📁' },
  { id: 'quotes', label: 'Quote Generator', icon: '📝' },
  { id: 'invoices', label: 'Invoices', icon: '💷' },
]

export default function App() {
  const [page, setPage] = useState('dashboard')

  const pages = {
    dashboard: <Dashboard onNavigate={setPage} />,
    projects: <Projects />,
    quotes: <QuoteGenerator />,
    invoices: <Invoices />,
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 220,
        background: 'var(--purple-dark)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        zIndex: 100,
      }}>
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ color: 'white', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' }}>
            ARX Engineers
          </div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Aim For Excellence
          </div>
        </div>
        <nav style={{ padding: '12px 0', flex: 1 }}>
          {NAV.map(item => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 20px',
                background: page === item.id ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: page === item.id ? 'white' : 'rgba(255,255,255,0.6)',
                borderRadius: 0,
                borderLeft: page === item.id ? '3px solid var(--purple-light)' : '3px solid transparent',
                fontSize: 14, fontWeight: page === item.id ? 600 : 400,
                textAlign: 'left', transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
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
