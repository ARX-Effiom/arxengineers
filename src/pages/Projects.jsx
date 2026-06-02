import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const PROJECT_TYPES = [
  { value: 'loft', label: 'Loft Conversion' },
  { value: 'loft_hip_gable', label: 'Loft – Hip to Gable' },
  { value: 'extension', label: 'Single Storey Extension' },
  { value: 'combined', label: 'Loft + Extension (Combined)' },
  { value: 'internal_alteration', label: 'Internal Alterations' },
  { value: 'newbuild', label: 'New Build' },
  { value: 'other', label: 'Other' },
]

const STATUSES = ['enquiry', 'quoted', 'instructed', 'in_progress', 'complete', 'on_hold']

const EMPTY_FORM = {
  ref: '', client_name: '', address_line1: '', address_line2: '',
  town: '', postcode: '', care_of: '', project_type: 'loft',
  description: '', status: 'enquiry', fee: '', deposit_amount: '',
  balance_amount: '', deposit_paid: false, balance_paid: false,
  site_visits: 0, notes: '',
}

function Toast({ msg, type }) {
  if (!msg) return null
  return <div className={`toast ${type}`}>{msg}</div>
}

export default function Projects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editProject, setEditProject] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const loadProjects = async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
    setProjects(data || [])
    setLoading(false)
  }

  useEffect(() => { loadProjects() }, [])

  // Auto-generate next ref
  const getNextRef = () => {
    const year = new Date().getFullYear().toString().slice(-2)
    const existing = projects.filter(p => p.ref?.startsWith(`ARX${year}`))
    const nums = existing.map(p => parseInt(p.ref.slice(5))).filter(n => !isNaN(n))
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
    return `ARX${year}${String(next).padStart(3, '0')}`
  }

  const openNew = () => {
    setEditProject(null)
    setForm({ ...EMPTY_FORM, ref: getNextRef() })
    setShowModal(true)
  }

  const openEdit = (p) => {
    setEditProject(p)
    setForm({
      ref: p.ref || '', client_name: p.client_name || '',
      address_line1: p.address_line1 || '', address_line2: p.address_line2 || '',
      town: p.town || '', postcode: p.postcode || '', care_of: p.care_of || '',
      project_type: p.project_type || 'loft', description: p.description || '',
      status: p.status || 'enquiry', fee: p.fee || '', deposit_amount: p.deposit_amount || '',
      balance_amount: p.balance_amount || '', deposit_paid: p.deposit_paid || false,
      balance_paid: p.balance_paid || false, site_visits: p.site_visits || 0,
      notes: p.notes || '',
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.client_name.trim()) return showToast('Client name required', 'error')
    setSaving(true)
    const payload = {
      ...form,
      fee: form.fee ? parseFloat(form.fee) : null,
      deposit_amount: form.deposit_amount ? parseFloat(form.deposit_amount) : null,
      balance_amount: form.balance_amount ? parseFloat(form.balance_amount) : null,
      site_visits: parseInt(form.site_visits) || 0,
    }
    let error
    if (editProject) {
      ({ error } = await supabase.from('projects').update(payload).eq('id', editProject.id))
    } else {
      ({ error } = await supabase.from('projects').insert(payload))
    }
    setSaving(false)
    if (error) return showToast(error.message, 'error')
    showToast(editProject ? 'Project updated' : 'Project created')
    setShowModal(false)
    loadProjects()
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this project? This cannot be undone.')) return
    await supabase.from('projects').delete().eq('id', id)
    showToast('Project deleted')
    loadProjects()
  }

  const filtered = projects
    .filter(p => filterStatus === 'all' || p.status === filterStatus)
    .filter(p => {
      if (!search) return true
      const q = search.toLowerCase()
      return p.ref?.toLowerCase().includes(q) || p.client_name?.toLowerCase().includes(q) ||
        p.address_line1?.toLowerCase().includes(q) || p.postcode?.toLowerCase().includes(q)
    })

  const f = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  return (
    <div style={{ padding: 32 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--purple-dark)' }}>Projects</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>{projects.length} total · {projects.filter(p => p.status === 'in_progress').length} in progress</p>
        </div>
        <button className="btn-primary" onClick={openNew}>+ New Project</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input
          placeholder="Search by name, ref, address..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 180 }}>
          <option value="all">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 32 }}>
          <div className="spinner" /> Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <h3>{search || filterStatus !== 'all' ? 'No matching projects' : 'No projects yet'}</h3>
          <p>Create your first project to get started</p>
          {!search && filterStatus === 'all' && (
            <button className="btn-primary" style={{ marginTop: 16 }} onClick={openNew}>+ New Project</button>
          )}
        </div>
      ) : (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['Ref', 'Client', 'Address', 'Type', 'Fee', 'Deposit', 'Status', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--purple)', fontSize: 13 }}>{p.ref}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 600 }}>{p.client_name}</div>
                    {p.care_of && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>C/O {p.care_of}</div>}
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
                    {[p.address_line1, p.town, p.postcode].filter(Boolean).join(', ')}
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
                    {PROJECT_TYPES.find(t => t.value === p.project_type)?.label || p.project_type || '—'}
                  </td>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>{p.fee ? `£${Number(p.fee).toLocaleString()}` : '—'}</td>
                  <td style={{ padding: '12px 14px' }}>
                    {p.deposit_amount ? (
                      <span style={{ color: p.deposit_paid ? 'var(--success)' : 'var(--warning)', fontWeight: 600, fontSize: 13 }}>
                        {p.deposit_paid ? '✓ ' : '⏳ '}£{Number(p.deposit_amount).toLocaleString()}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span className={`badge badge-${p.status}`}>{p.status.replace('_', ' ')}</span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn-ghost btn-sm" onClick={() => openEdit(p)}>Edit</button>
                      <button className="btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(p.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2>{editProject ? `Edit ${editProject.ref}` : 'New Project'}</h2>
              <button className="btn-ghost" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">

              <div className="form-row cols-2">
                <div>
                  <label>Project Ref</label>
                  <input value={form.ref} onChange={f('ref')} placeholder="ARX26001" />
                </div>
                <div>
                  <label>Status</label>
                  <select value={form.status} onChange={f('status')}>
                    {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-row" style={{ marginBottom: 12 }}>
                <div>
                  <label>Client Name *</label>
                  <input value={form.client_name} onChange={f('client_name')} placeholder="Mr & Mrs Smith" />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label>C/O (optional)</label>
                <input value={form.care_of} onChange={f('care_of')} placeholder="Care of name if applicable" />
              </div>

              <div className="form-row" style={{ marginBottom: 12 }}>
                <div>
                  <label>Address Line 1</label>
                  <input value={form.address_line1} onChange={f('address_line1')} placeholder="15 Cleeve Lawns" />
                </div>
              </div>
              <div className="form-row cols-3" style={{ marginBottom: 12 }}>
                <div>
                  <label>Address Line 2</label>
                  <input value={form.address_line2} onChange={f('address_line2')} />
                </div>
                <div>
                  <label>Town</label>
                  <input value={form.town} onChange={f('town')} placeholder="Bristol" />
                </div>
                <div>
                  <label>Postcode</label>
                  <input value={form.postcode} onChange={f('postcode')} placeholder="BS1 2AB" />
                </div>
              </div>

              <div className="form-row cols-2" style={{ marginBottom: 12 }}>
                <div>
                  <label>Project Type</label>
                  <select value={form.project_type} onChange={f('project_type')}>
                    {PROJECT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label>Site Visits</label>
                  <input type="number" value={form.site_visits} onChange={f('site_visits')} min="0" />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label>Project Description</label>
                <textarea value={form.description} onChange={f('description')} rows={2}
                  placeholder="e.g. loft conversion with hip-to-gable and single storey rear extension" />
              </div>

              <div className="form-row cols-3" style={{ marginBottom: 12 }}>
                <div>
                  <label>Total Fee (£)</label>
                  <input type="number" value={form.fee} onChange={f('fee')} placeholder="850" />
                </div>
                <div>
                  <label>Deposit (£)</label>
                  <input type="number" value={form.deposit_amount} onChange={f('deposit_amount')} placeholder="170" />
                </div>
                <div>
                  <label>Balance (£)</label>
                  <input type="number" value={form.balance_amount} onChange={f('balance_amount')} placeholder="680" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', fontSize: 14, fontWeight: 500 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={form.deposit_paid} onChange={f('deposit_paid')} />
                  Deposit paid
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', fontSize: 14, fontWeight: 500 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={form.balance_paid} onChange={f('balance_paid')} />
                  Balance paid
                </label>
              </div>

              <div>
                <label>Notes</label>
                <textarea value={form.notes} onChange={f('notes')} rows={2} placeholder="Any flags, trees, party walls, etc." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving...</> : editProject ? 'Save Changes' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
