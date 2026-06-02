import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const CONTACT_TYPES = ['homeowner', 'architect', 'designer', 'builder', 'contractor', 'building_control', 'solicitor', 'referrer', 'other']

const EMPTY_FORM = {
  name: '', company: '', type: 'homeowner', email: '', phone: '',
  address: '', notes: '',
}

export default function Contacts() {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editContact, setEditContact] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = async () => {
    const { data } = await supabase.from('contacts').select('*').order('name')
    setContacts(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openNew = () => {
    setEditContact(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  const openEdit = (c) => {
    setEditContact(c)
    setForm({ name: c.name || '', company: c.company || '', type: c.type || 'homeowner', email: c.email || '', phone: c.phone || '', address: c.address || '', notes: c.notes || '' })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return showToast('Name required', 'error')
    setSaving(true)
    const payload = { ...form }
    let error
    if (editContact) {
      ({ error } = await supabase.from('contacts').update(payload).eq('id', editContact.id))
    } else {
      ({ error } = await supabase.from('contacts').insert(payload))
    }
    setSaving(false)
    if (error) return showToast(error.message, 'error')
    showToast(editContact ? 'Contact updated' : 'Contact added')
    setShowModal(false)
    load()
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this contact?')) return
    await supabase.from('contacts').delete().eq('id', id)
    showToast('Contact deleted')
    load()
  }

  const f = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))

  const filtered = contacts
    .filter(c => filterType === 'all' || c.type === filterType)
    .filter(c => {
      if (!search) return true
      const q = search.toLowerCase()
      return c.name?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
    })

  return (
    <div style={{ padding: 32 }}>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--purple-dark)' }}>Contacts</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>{contacts.length} contacts</p>
        </div>
        <button className="btn-primary" onClick={openNew}>+ Add Contact</button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input placeholder="Search name, company, email..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: 200 }}>
          <option value="all">All types</option>
          {CONTACT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 32, color: 'var(--text-muted)' }}>
          <div className="spinner" /> Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <h3>{search || filterType !== 'all' ? 'No matching contacts' : 'No contacts yet'}</h3>
          <p>Add your first contact to get started</p>
          {!search && filterType === 'all' && <button className="btn-primary" style={{ marginTop: 16 }} onClick={openNew}>+ Add Contact</button>}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filtered.map(c => (
            <div key={c.id} className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                  {c.company && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{c.company}</div>}
                </div>
                <span className="badge tag" style={{ textTransform: 'capitalize', fontSize: 10 }}>{c.type?.replace('_', ' ')}</span>
              </div>
              {c.email && (
                <div style={{ fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: 'var(--text-muted)' }}>✉</span>
                  <a href={`mailto:${c.email}`} style={{ color: 'var(--purple)', textDecoration: 'none' }}>{c.email}</a>
                </div>
              )}
              {c.phone && (
                <div style={{ fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: 'var(--text-muted)' }}>📞</span>
                  <a href={`tel:${c.phone}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>{c.phone}</a>
                </div>
              )}
              {c.address && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>📍 {c.address}</div>
              )}
              {c.notes && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, padding: '6px 10px', background: 'var(--purple-bg)', borderRadius: 6 }}>
                  {c.notes}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                <button className="btn-secondary btn-sm" onClick={() => openEdit(c)}>Edit</button>
                <button className="btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(c.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2>{editContact ? 'Edit Contact' : 'New Contact'}</h2>
              <button className="btn-ghost" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row cols-2" style={{ marginBottom: 12 }}>
                <div><label>Name *</label><input value={form.name} onChange={f('name')} placeholder="Full name" /></div>
                <div><label>Company</label><input value={form.company} onChange={f('company')} placeholder="Company name" /></div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>Type</label>
                <select value={form.type} onChange={f('type')}>
                  {CONTACT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div className="form-row cols-2" style={{ marginBottom: 12 }}>
                <div><label>Email</label><input type="email" value={form.email} onChange={f('email')} placeholder="email@example.com" /></div>
                <div><label>Phone</label><input value={form.phone} onChange={f('phone')} placeholder="+44 7700 000000" /></div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>Address</label>
                <input value={form.address} onChange={f('address')} placeholder="Address" />
              </div>
              <div>
                <label>Notes</label>
                <textarea value={form.notes} onChange={f('notes')} rows={3} placeholder="Any useful notes..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editContact ? 'Save Changes' : 'Add Contact'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
