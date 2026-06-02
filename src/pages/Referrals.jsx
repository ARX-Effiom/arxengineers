import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Referrals() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase.from('projects').select('ref, client_name, address_line1, town, fee, status, notes')
      .not('notes', 'is', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setProjects(data || [])
        setLoading(false)
      })
  }, [])

  // Extract referrer from notes field
  const getReferrer = (notes) => {
    if (!notes) return null
    const match = notes.match(/Referrer:\s*([^|]+)/i)
    return match ? match[1].trim() : null
  }

  // Build referrer stats
  const referrerMap = {}
  projects.forEach(p => {
    const ref = getReferrer(p.notes)
    if (!ref) return
    if (!referrerMap[ref]) referrerMap[ref] = { name: ref, projects: [], totalFees: 0, statuses: {} }
    referrerMap[ref].projects.push(p)
    referrerMap[ref].totalFees += p.fee || 0
    referrerMap[ref].statuses[p.status] = (referrerMap[ref].statuses[p.status] || 0) + 1
  })

  const referrers = Object.values(referrerMap)
    .sort((a, b) => b.totalFees - a.totalFees)
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()))

  const totalReferredFees = referrers.reduce((s, r) => s + r.totalFees, 0)
  const totalReferredProjects = referrers.reduce((s, r) => s + r.projects.length, 0)

  const getStatusColour = (status) => {
    const map = { complete: 'var(--success)', in_progress: 'var(--info)', enquiry: 'var(--text-muted)', lost: '#dc2626', on_hold: 'var(--warning)' }
    return map[status] || 'var(--text-muted)'
  }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--purple-dark)' }}>Referrals</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>Track who is sending you work and how much they've generated</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--purple)' }}>{referrers.length}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>Referral Sources</div>
        </div>
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--info)' }}>{totalReferredProjects}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>Projects Referred</div>
        </div>
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--success)' }}>£{totalReferredFees.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>Total Fees from Referrals</div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <input placeholder="Search referrer..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 32, color: 'var(--text-muted)' }}>
          <div className="spinner" /> Loading...
        </div>
      ) : referrers.length === 0 ? (
        <div className="card empty-state">
          <h3>No referral data yet</h3>
          <p>Referrers are tracked automatically from project notes</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {referrers.map(r => {
            const completedFees = r.projects.filter(p => p.status === 'complete').reduce((s, p) => s + (p.fee || 0), 0)
            const pct = totalReferredFees > 0 ? Math.round((r.totalFees / totalReferredFees) * 100) : 0
            return (
              <div key={r.name} className="card" style={{ padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{r.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                      {r.projects.length} project{r.projects.length !== 1 ? 's' : ''} · {pct}% of all referral value
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--purple)' }}>£{r.totalFees.toLocaleString()}</div>
                    <div style={{ fontSize: 12, color: 'var(--success)' }}>£{completedFees.toLocaleString()} completed</div>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, marginBottom: 16 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'var(--purple)', borderRadius: 3, transition: 'width 0.3s' }} />
                </div>

                {/* Status breakdown */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                  {Object.entries(r.statuses).map(([status, count]) => (
                    <span key={status} style={{
                      padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: 'var(--purple-bg)', color: getStatusColour(status)
                    }}>
                      {count} {status.replace('_', ' ')}
                    </span>
                  ))}
                </div>

                {/* Project list */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Projects</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {r.projects.map(p => (
                      <div key={p.ref} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, color: 'var(--purple)', minWidth: 80 }}>{p.ref}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{p.client_name} · {[p.address_line1, p.town].filter(Boolean).join(', ')}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontWeight: 600 }}>{p.fee ? `£${Number(p.fee).toLocaleString()}` : '—'}</span>
                          <span className={`badge badge-${p.status}`}>{p.status.replace('_', ' ')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
