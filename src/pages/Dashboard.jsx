import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const STATUS_ORDER = ['enquiry', 'quoted', 'instructed', 'in_progress', 'complete', 'on_hold']

export default function Dashboard({ onNavigate }) {
  const [projects, setProjects] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('invoices').select('*'),
    ]).then(([{ data: p }, { data: i }]) => {
      setProjects(p || [])
      setInvoices(i || [])
      setLoading(false)
    })
  }, [])

  const active = projects.filter(p => !['complete', 'on_hold'].includes(p.status))
  const totalFees = projects.reduce((s, p) => s + (p.fee || 0), 0)
  const unpaidInvoices = invoices.filter(i => !i.paid)
  const outstanding = unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0)
  const recentProjects = projects.slice(0, 5)

  const statCards = [
    { label: 'Active Projects', value: active.length, color: 'var(--purple)', icon: '📁' },
    { label: 'Total Projects', value: projects.length, color: 'var(--info)', icon: '📊' },
    { label: 'Total Fees Quoted', value: `£${totalFees.toLocaleString()}`, color: 'var(--success)', icon: '💷' },
    { label: 'Outstanding', value: `£${outstanding.toLocaleString()}`, color: outstanding > 0 ? 'var(--warning)' : 'var(--success)', icon: '⏳' },
  ]

  if (loading) return (
    <div style={{ padding: 32, display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)' }}>
      <div className="spinner" /> Loading...
    </div>
  )

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--purple-dark)' }}>Dashboard</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {statCards.map(card => (
          <div key={card.label} className="card" style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{card.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: card.color }}>{card.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Pipeline */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Project Pipeline</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {STATUS_ORDER.map(status => {
            const count = projects.filter(p => p.status === status).length
            return (
              <div key={status} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: count > 0 ? 'var(--purple)' : 'var(--border)' }}>
                  {count}
                </div>
                <div className={`badge badge-${status}`} style={{ marginTop: 4, display: 'block', textAlign: 'center' }}>
                  {status.replace('_', ' ')}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent projects */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Recent Projects</h2>
          <button className="btn-secondary btn-sm" onClick={() => onNavigate('projects')}>View all</button>
        </div>
        {recentProjects.length === 0 ? (
          <div className="empty-state">
            <h3>No projects yet</h3>
            <p>Add your first project to get started</p>
            <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => onNavigate('projects')}>
              Add Project
            </button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Ref', 'Client', 'Address', 'Type', 'Fee', 'Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentProjects.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--purple)', fontSize: 13 }}>{p.ref}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{p.client_name}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{[p.address_line1, p.town].filter(Boolean).join(', ')}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{p.project_type?.replace('_', ' ') || '—'}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{p.fee ? `£${p.fee.toLocaleString()}` : '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span className={`badge badge-${p.status}`}>{p.status.replace('_', ' ')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
