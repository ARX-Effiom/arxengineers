import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Invoices() {
  const [invoices, setInvoices] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ project_id: '', type: 'deposit', amount: '', due_at: '' })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = async () => {
    const [{ data: inv }, { data: proj }] = await Promise.all([
      supabase.from('invoices').select('*, projects(ref, client_name, address_line1)').order('created_at', { ascending: false }),
      supabase.from('projects').select('id, ref, client_name, fee, deposit_amount, balance_amount').order('created_at', { ascending: false }),
    ])
    setInvoices(inv || [])
    setProjects(proj || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openNew = () => {
    const due = new Date()
    due.setDate(due.getDate() + 14)
    setForm({
      project_id: '', type: 'deposit', amount: '',
      due_at: due.toISOString().split('T')[0]
    })
    setShowModal(true)
  }

  // Auto-fill amount when project + type selected
  const handleProjectChange = (projectId) => {
    const p = projects.find(p => p.id === projectId)
    let amount = ''
    if (p) {
      if (form.type === 'deposit') amount = p.deposit_amount || ''
      if (form.type === 'balance') amount = p.balance_amount || ''
    }
    setForm(prev => ({ ...prev, project_id: projectId, amount }))
  }

  const handleTypeChange = (type) => {
    const p = projects.find(p => p.id === form.project_id)
    let amount = form.amount
    if (p) {
      if (type === 'deposit') amount = p.deposit_amount || ''
      if (type === 'balance') amount = p.balance_amount || ''
      if (type === 'variation') amount = ''
    }
    setForm(prev => ({ ...prev, type, amount }))
  }

  const handleSave = async () => {
    if (!form.project_id) return showToast('Select a project', 'error')
    if (!form.amount) return showToast('Amount required', 'error')
    const p = projects.find(p => p.id === form.project_id)
    setSaving(true)

    const { error } = await supabase.from('invoices').insert({
      project_id: form.project_id,
      ref: p?.ref,
      type: form.type,
      amount: parseFloat(form.amount),
      due_at: form.due_at || null,
      issued_at: new Date().toISOString(),
      paid: false,
    })

    setSaving(false)
    if (error) return showToast(error.message, 'error')
    showToast('Invoice created')
    setShowModal(false)
    load()
  }

  const togglePaid = async (inv) => {
    await supabase.from('invoices').update({
      paid: !inv.paid,
      paid_at: !inv.paid ? new Date().toISOString() : null,
    }).eq('id', inv.id)

    // Update project deposit/balance paid status
    if (inv.type === 'deposit') {
      await supabase.from('projects').update({ deposit_paid: !inv.paid }).eq('id', inv.project_id)
    }
    if (inv.type === 'balance') {
      await supabase.from('projects').update({ balance_paid: !inv.paid }).eq('id', inv.project_id)
    }
    load()
  }

  const unpaid = invoices.filter(i => !i.paid)
  const totalOutstanding = unpaid.reduce((s, i) => s + (i.amount || 0), 0)

  return (
    <div style={{ padding: 32 }}>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--purple-dark)' }}>Invoices</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
            {unpaid.length} unpaid · £{totalOutstanding.toLocaleString()} outstanding
          </p>
        </div>
        <button className="btn-primary" onClick={openNew}>+ New Invoice</button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Outstanding', value: `£${totalOutstanding.toLocaleString()}`, color: totalOutstanding > 0 ? 'var(--warning)' : 'var(--success)' },
          { label: 'Paid (total)', value: `£${invoices.filter(i => i.paid).reduce((s, i) => s + (i.amount || 0), 0).toLocaleString()}`, color: 'var(--success)' },
          { label: 'All Invoices', value: invoices.length, color: 'var(--purple)' },
        ].map(c => (
          <div key={c.label} className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 32, color: 'var(--text-muted)' }}>
          <div className="spinner" /> Loading...
        </div>
      ) : invoices.length === 0 ? (
        <div className="card empty-state">
          <h3>No invoices yet</h3>
          <p>Create your first invoice</p>
          <button className="btn-primary" style={{ marginTop: 16 }} onClick={openNew}>+ New Invoice</button>
        </div>
      ) : (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['Project', 'Type', 'Amount', 'Issued', 'Due', 'Status', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const overdue = !inv.paid && inv.due_at && new Date(inv.due_at) < new Date()
                return (
                  <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--purple)', fontSize: 13 }}>{inv.ref}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{inv.projects?.client_name}</div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span className={`badge ${inv.type === 'deposit' ? 'badge-quoted' : inv.type === 'balance' ? 'badge-instructed' : 'badge-enquiry'}`}>
                        {inv.type}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 700, fontSize: 15 }}>£{Number(inv.amount).toLocaleString()}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
                      {inv.issued_at ? new Date(inv.issued_at).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: overdue ? 'var(--danger)' : 'var(--text-muted)', fontWeight: overdue ? 700 : 400 }}>
                      {inv.due_at ? new Date(inv.due_at).toLocaleDateString('en-GB') : '—'}
                      {overdue && ' ⚠'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span className={`badge ${inv.paid ? 'badge-complete' : overdue ? 'badge-on_hold' : 'badge-enquiry'}`}>
                        {inv.paid ? 'Paid' : overdue ? 'Overdue' : 'Unpaid'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <button
                        className={`btn-sm ${inv.paid ? 'btn-ghost' : 'btn-primary'}`}
                        onClick={() => togglePaid(inv)}
                      >
                        {inv.paid ? 'Mark unpaid' : 'Mark paid'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2>New Invoice</h2>
              <button className="btn-ghost" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 14 }}>
                <label>Project</label>
                <select value={form.project_id} onChange={e => handleProjectChange(e.target.value)}>
                  <option value="">— select project —</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.ref} · {p.client_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-row cols-2" style={{ marginBottom: 14 }}>
                <div>
                  <label>Invoice Type</label>
                  <select value={form.type} onChange={e => handleTypeChange(e.target.value)}>
                    <option value="deposit">Deposit</option>
                    <option value="balance">Balance</option>
                    <option value="variation">Variation</option>
                  </select>
                </div>
                <div>
                  <label>Amount (£)</label>
                  <input type="number" value={form.amount} onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))} placeholder="0.00" />
                </div>
              </div>
              <div>
                <label>Due Date</label>
                <input type="date" value={form.due_at} onChange={e => setForm(prev => ({ ...prev, due_at: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Creating...' : 'Create Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
