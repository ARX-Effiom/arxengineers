import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { generateInvoiceDocx, downloadDocx } from '../lib/invoiceDocx'

const PURPLE = '#5B2D8E'
const PURPLE_DARK = '#3D1F6E'
const PURPLE_LIGHT = '#F3EEF9'

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtMoney(n) {
  return '£' + Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 0 })
}

function ageBucket(due_at, paid) {
  if (paid || !due_at) return null
  const days = Math.floor((new Date() - new Date(due_at)) / 86400000)
  if (days <= 0) return null
  if (days <= 30) return { label: '1–30 days', color: '#D97706', bg: '#FFFBEB' }
  if (days <= 60) return { label: '31–60 days', color: '#EA580C', bg: '#FFF7ED' }
  if (days <= 90) return { label: '61–90 days', color: '#DC2626', bg: '#FEF2F2' }
  return { label: '90+ days', color: '#991B1B', bg: '#FFF1F1' }
}

function lateInterest(amount, due_at) {
  if (!due_at) return 0
  const days = Math.floor((new Date() - new Date(due_at)) / 86400000)
  if (days <= 0) return 0
  // Late Payment of Commercial Debts Act: BoE base rate + 8%
  const rate = 0.08 + 0.0525 // approx base + 8%
  return Math.round(amount * rate * (days / 365) * 100) / 100
}

// ─── Chaser email composer ─────────────────────────────────────────────────────
function ChaserModal({ inv, onClose }) {
  const clientName = inv.projects?.client_name || 'Client'
  const firstName = clientName.split(' ').find(w => !['Mr','Mrs','Ms','Miss','Dr','&','and'].includes(w)) || clientName
  const days = inv.due_at ? Math.floor((new Date() - new Date(inv.due_at)) / 86400000) : 0
  const interest = lateInterest(inv.amount, inv.due_at)

  const draft = `Dear ${firstName},

I hope you are well.

I am writing to follow up on invoice ${inv.type === 'deposit' ? 'INV-DEP' : 'INV-BAL'}-${inv.ref}, issued on ${fmtDate(inv.issued_at)} for ${fmtMoney(inv.amount)}, which was due for payment on ${fmtDate(inv.due_at)}.

This invoice is now ${days} day${days !== 1 ? 's' : ''} overdue. I would be grateful if you could arrange payment at your earliest convenience.

Our bank details are as follows:
Bank: Monzo
Account name: ARX Engineers Ltd
Sort code: 04-00-03
Account number: 81677090

Please note that under The Late Payment of Commercial Debts (Interest) Act 1998, interest may be applied to overdue amounts. If payment has already been made, please disregard this notice.

If you have any queries regarding this invoice, please do not hesitate to get in touch.

Best regards,

Effiom Esua
Director | BEng MSc
ARX Engineers Ltd
effiom@arxengineers.co.uk | www.arxengineers.co.uk
+44 (0)772 229 8882`

  const [body, setBody] = useState(draft)
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(body)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const mailtoLink = `mailto:?subject=Invoice ${inv.type === 'deposit' ? 'INV-DEP' : 'INV-BAL'}-${inv.ref} — Payment Outstanding&body=${encodeURIComponent(body)}`

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#FFF', borderRadius: 12, width: '100%', maxWidth: 600, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: PURPLE_DARK }}>Chase — {inv.ref}</div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
              {fmtMoney(inv.amount)} · {days} days overdue
              {interest > 0 && <span style={{ color: '#DC2626', marginLeft: 8 }}>· Late interest: ~{fmtMoney(interest)}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9CA3AF' }}>✕</button>
        </div>
        <div style={{ padding: '14px 20px', flex: 1, overflowY: 'auto' }}>
          <textarea value={body} onChange={e => setBody(e.target.value)}
            style={{ width: '100%', height: 360, border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, fontSize: 13, lineHeight: 1.6, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '8px 16px', border: '1px solid #E5E7EB', borderRadius: 7, background: '#FFF', fontSize: 13, cursor: 'pointer', color: '#374151' }}>Cancel</button>
          <button onClick={copy}
            style={{ padding: '8px 16px', border: `1px solid ${copied ? '#16A34A' : '#E5E7EB'}`, borderRadius: 7, background: copied ? '#F0FDF4' : '#FFF', color: copied ? '#16A34A' : '#374151', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
            {copied ? '✓ Copied' : 'Copy text'}
          </button>
          <a href={mailtoLink}
            style={{ padding: '8px 16px', background: PURPLE, color: '#FFF', borderRadius: 7, fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            Open in Mail
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── Delete confirm ────────────────────────────────────────────────────────────
function DeleteConfirm({ inv, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ background: '#FFF', borderRadius: 12, width: '100%', maxWidth: 400, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🗑</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#1A1A1A', marginBottom: 8 }}>Delete invoice?</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 6 }}>
          {inv.type === 'deposit' ? 'INV-DEP' : inv.type === 'balance' ? 'INV-BAL' : 'VO'}-{inv.ref}
        </div>
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>
          {fmtMoney(inv.amount)} · {inv.projects?.client_name}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button onClick={onCancel}
            style={{ padding: '9px 20px', border: '1px solid #E5E7EB', borderRadius: 7, background: '#FFF', fontSize: 13, cursor: 'pointer', color: '#374151', fontWeight: 500 }}>Cancel</button>
          <button onClick={onConfirm}
            style={{ padding: '9px 20px', border: 'none', borderRadius: 7, background: '#DC2626', color: '#FFF', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── Paid date badge ───────────────────────────────────────────────────────────
function StatusBadge({ inv }) {
  const overdue = !inv.paid && inv.due_at && new Date(inv.due_at) < new Date()
  const bucket = ageBucket(inv.due_at, inv.paid)

  if (inv.paid) return (
    <div>
      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: '#F0FDF4', color: '#16A34A' }}>PAID</span>
      {inv.paid_at && <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 3 }}>{fmtDate(inv.paid_at)}</div>}
    </div>
  )
  if (bucket) return (
    <div>
      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: bucket.bg, color: bucket.color }}>OVERDUE</span>
      <div style={{ fontSize: 10, color: bucket.color, marginTop: 3, fontWeight: 600 }}>{bucket.label}</div>
    </div>
  )
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: '#F3F4F6', color: '#6B7280' }}>UNPAID</span>
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function Invoices() {
  const [invoices, setInvoices] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ project_id: '', type: 'deposit', amount: '', due_at: '' })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [generatingDocx, setGeneratingDocx] = useState(null)
  const [chaserInv, setChaserInv] = useState(null)
  const [deleteInv, setDeleteInv] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all') // all | unpaid | overdue | paid
  const [showAgedDebt, setShowAgedDebt] = useState(false)

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
    setForm({ project_id: '', type: 'deposit', amount: '', due_at: due.toISOString().split('T')[0] })
    setShowModal(true)
  }

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
    if (inv.type === 'deposit') await supabase.from('projects').update({ deposit_paid: !inv.paid }).eq('id', inv.project_id)
    if (inv.type === 'balance') await supabase.from('projects').update({ balance_paid: !inv.paid }).eq('id', inv.project_id)
    load()
  }

  const handleDelete = async () => {
    if (!deleteInv) return
    const { error } = await supabase.from('invoices').delete().eq('id', deleteInv.id)
    if (error) { showToast('Failed to delete: ' + error.message, 'error') }
    else { showToast('Invoice deleted') }
    setDeleteInv(null)
    load()
  }

  const handleDownload = async (inv) => {
    setGeneratingDocx(inv.id)
    try {
      const { data: proj } = await supabase.from('projects').select('*').eq('ref', inv.ref).single()
      const buffer = await generateInvoiceDocx({
        project: proj || { ref: inv.ref, client_name: inv.projects?.client_name, address_line1: inv.projects?.address_line1 },
        invoiceType: inv.type,
        amount: inv.amount,
        invoiceRef: null,
        dueDate: inv.due_at,
        careOf: null,
      })
      const prefix = inv.type === 'deposit' ? 'INV-DEP' : inv.type === 'balance' ? 'INV-BAL' : 'VO'
      downloadDocx(buffer, `${prefix}-${inv.ref}.docx`)
    } catch (e) {
      showToast('Failed to generate document: ' + e.message, 'error')
    }
    setGeneratingDocx(null)
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const unpaidInvs = invoices.filter(i => !i.paid)
  const overdueInvs = unpaidInvs.filter(i => i.due_at && new Date(i.due_at) < new Date())
  const totalOutstanding = unpaidInvs.reduce((s, i) => s + (i.amount || 0), 0)
  const totalPaid = invoices.filter(i => i.paid).reduce((s, i) => s + (i.amount || 0), 0)
  const totalOverdue = overdueInvs.reduce((s, i) => s + (i.amount || 0), 0)

  // Aged debt buckets
  const agedBuckets = ['1–30 days', '31–60 days', '61–90 days', '90+ days']
  const agedData = agedBuckets.map(label => ({
    label,
    amount: overdueInvs.filter(i => ageBucket(i.due_at, i.paid)?.label === label).reduce((s, i) => s + (i.amount || 0), 0),
    count: overdueInvs.filter(i => ageBucket(i.due_at, i.paid)?.label === label).length,
    color: ['#D97706','#EA580C','#DC2626','#991B1B'][agedBuckets.indexOf(label)],
  }))

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = invoices.filter(i => {
    if (filterStatus === 'unpaid') return !i.paid && !(i.due_at && new Date(i.due_at) < new Date())
    if (filterStatus === 'overdue') return !i.paid && i.due_at && new Date(i.due_at) < new Date()
    if (filterStatus === 'paid') return i.paid
    return true
  })

  const chipStyle = (active) => ({
    padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    border: `1px solid ${active ? PURPLE : '#E5E7EB'}`,
    background: active ? PURPLE_LIGHT : '#FFF',
    color: active ? PURPLE : '#6B7280',
    cursor: 'pointer', transition: 'all 0.1s',
  })

  const typeLabel = (t) => t === 'deposit' ? 'DEPOSIT' : t === 'balance' ? 'BALANCE' : 'VARIATION'
  const typeBg = (t) => t === 'deposit' ? { bg: '#EFF6FF', color: '#2563EB' } : t === 'balance' ? { bg: PURPLE_LIGHT, color: PURPLE } : { bg: '#F0FDF4', color: '#16A34A' }

  return (
    <div style={{ padding: 32 }}>
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          padding: '12px 20px', borderRadius: 8, fontWeight: 600, fontSize: 13,
          background: toast.type === 'error' ? '#DC2626' : '#16A34A', color: '#FFF',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>{toast.msg}</div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: PURPLE_DARK }}>Invoices</h1>
          <p style={{ color: '#9CA3AF', marginTop: 4 }}>
            {unpaidInvs.length} unpaid · {fmtMoney(totalOutstanding)} outstanding
            {overdueInvs.length > 0 && (
              <span style={{ color: '#DC2626', fontWeight: 600, marginLeft: 8 }}>
                · {overdueInvs.length} overdue
              </span>
            )}
          </p>
        </div>
        <button onClick={openNew}
          style={{ padding: '10px 20px', background: PURPLE, color: '#FFF', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          + New Invoice
        </button>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Outstanding', value: fmtMoney(totalOutstanding), color: totalOutstanding > 0 ? '#D97706' : '#16A34A', bg: totalOutstanding > 0 ? '#FFFBEB' : '#F0FDF4', border: totalOutstanding > 0 ? '#FDE68A' : '#BBF7D0' },
          { label: 'Overdue', value: fmtMoney(totalOverdue), color: totalOverdue > 0 ? '#DC2626' : '#9CA3AF', bg: totalOverdue > 0 ? '#FEF2F2' : '#F9FAFB', border: totalOverdue > 0 ? '#FECACA' : '#E5E7EB' },
          { label: 'Paid (total)', value: fmtMoney(totalPaid), color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
          { label: 'All Invoices', value: invoices.length, color: PURPLE, bg: PURPLE_LIGHT, border: '#D8C5F0' },
        ].map(c => (
          <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: c.color, lineHeight: 1 }}>{c.value}</div>
            <div style={{ fontSize: 12, color: c.color, marginTop: 4, fontWeight: 600, opacity: 0.8 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Aged debt panel */}
      {overdueInvs.length > 0 && (
        <div style={{ background: '#FFF', border: '1px solid #FECACA', borderRadius: 10, marginBottom: 16, overflow: 'hidden' }}>
          <button onClick={() => setShowAgedDebt(d => !d)}
            style={{ width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: '#DC2626' }}>
            <span>⚠ Aged Debt — {overdueInvs.length} overdue invoice{overdueInvs.length !== 1 ? 's' : ''}</span>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>{showAgedDebt ? '▲ Hide' : '▼ Show breakdown'}</span>
          </button>
          {showAgedDebt && (
            <div style={{ padding: '0 16px 14px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {agedData.map(b => (
                <div key={b.label} style={{ background: b.amount > 0 ? '#FEF2F2' : '#F9FAFB', border: `1px solid ${b.amount > 0 ? '#FECACA' : '#E5E7EB'}`, borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: b.amount > 0 ? b.color : '#D1D5DB' }}>{fmtMoney(b.amount)}</div>
                  <div style={{ fontSize: 11, color: b.amount > 0 ? b.color : '#9CA3AF', fontWeight: 600, marginTop: 2 }}>{b.label}</div>
                  {b.count > 0 && <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1 }}>{b.count} invoice{b.count !== 1 ? 's' : ''}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['all','All'],['unpaid','Unpaid'],['overdue','Overdue'],['paid','Paid']].map(([k, l]) => (
          <button key={k} style={chipStyle(filterStatus === k)} onClick={() => setFilterStatus(k)}>{l}</button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: 40, color: '#9CA3AF', display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="spinner" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 10, padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>💷</div>
          <div style={{ fontWeight: 600, color: '#374151', marginBottom: 8 }}>No invoices{filterStatus !== 'all' ? ` matching "${filterStatus}"` : ''}</div>
          {filterStatus === 'all' && <button onClick={openNew} style={{ padding: '8px 18px', background: PURPLE, color: '#FFF', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>+ New Invoice</button>}
        </div>
      ) : (
        <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                {['Project', 'Type', 'Amount', 'Issued', 'Due', 'Status', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const overdue = !inv.paid && inv.due_at && new Date(inv.due_at) < new Date()
                const tc = typeBg(inv.type)
                return (
                  <tr key={inv.id} style={{
                    borderBottom: '1px solid #E5E7EB',
                    background: overdue ? '#FFFAFA' : '#FFF',
                    transition: 'background 0.1s',
                  }}>
                    {/* Project */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, color: PURPLE, fontSize: 13 }}>{inv.ref}</div>
                      <div style={{ fontSize: 12, color: '#9CA3AF' }}>{inv.projects?.client_name}</div>
                    </td>
                    {/* Type */}
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: tc.bg, color: tc.color }}>
                        {typeLabel(inv.type)}
                      </span>
                    </td>
                    {/* Amount */}
                    <td style={{ padding: '12px 14px', fontWeight: 800, fontSize: 15, color: '#1A1A1A' }}>
                      {fmtMoney(inv.amount)}
                    </td>
                    {/* Issued */}
                    <td style={{ padding: '12px 14px', color: '#9CA3AF', fontSize: 13 }}>
                      {fmtDate(inv.issued_at)}
                    </td>
                    {/* Due */}
                    <td style={{ padding: '12px 14px', fontSize: 13 }}>
                      <div style={{ color: overdue ? '#DC2626' : '#9CA3AF', fontWeight: overdue ? 700 : 400 }}>
                        {fmtDate(inv.due_at)}
                      </div>
                      {overdue && (
                        <div style={{ fontSize: 10, color: '#DC2626', marginTop: 1 }}>
                          {Math.floor((new Date() - new Date(inv.due_at)) / 86400000)}d overdue
                        </div>
                      )}
                    </td>
                    {/* Status */}
                    <td style={{ padding: '12px 14px' }}>
                      <StatusBadge inv={inv} />
                    </td>
                    {/* Actions */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                        {/* Download */}
                        <button onClick={() => handleDownload(inv)} disabled={generatingDocx === inv.id}
                          style={{ padding: '5px 10px', border: '1px solid #E5E7EB', borderRadius: 6, background: '#FFF', fontSize: 12, cursor: 'pointer', color: '#374151', whiteSpace: 'nowrap' }}
                          title="Download .docx">
                          {generatingDocx === inv.id ? '…' : '⬇ .docx'}
                        </button>
                        {/* Chase (overdue only) */}
                        {overdue && (
                          <button onClick={() => setChaserInv(inv)}
                            style={{ padding: '5px 10px', border: '1px solid #FDE68A', borderRadius: 6, background: '#FFFBEB', fontSize: 12, cursor: 'pointer', color: '#D97706', fontWeight: 600, whiteSpace: 'nowrap' }}
                            title="Draft chaser email">
                            ✉ Chase
                          </button>
                        )}
                        {/* Mark paid / unpaid */}
                        <button onClick={() => togglePaid(inv)}
                          style={{ padding: '5px 10px', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
                            background: inv.paid ? '#F3F4F6' : PURPLE,
                            color: inv.paid ? '#6B7280' : '#FFF',
                          }}>
                          {inv.paid ? 'Mark unpaid' : 'Mark paid'}
                        </button>
                        {/* Delete */}
                        <button onClick={() => setDeleteInv(inv)}
                          style={{ padding: '5px 8px', border: '1px solid #E5E7EB', borderRadius: 6, background: '#FFF', fontSize: 13, cursor: 'pointer', color: '#D1D5DB', lineHeight: 1 }}
                          title="Delete invoice">
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 0 && (
        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8, textAlign: 'right' }}>
          {filtered.length} invoice{filtered.length !== 1 ? 's' : ''} · {fmtMoney(filtered.reduce((s, i) => s + (i.amount || 0), 0))} total
        </div>
      )}

      {/* New invoice modal */}
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
                  {projects.map(p => <option key={p.id} value={p.id}>{p.ref} · {p.client_name}</option>)}
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
                {saving ? 'Creating…' : 'Create Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chaser modal */}
      {chaserInv && <ChaserModal inv={chaserInv} onClose={() => setChaserInv(null)} />}

      {/* Delete confirm */}
      {deleteInv && <DeleteConfirm inv={deleteInv} onConfirm={handleDelete} onCancel={() => setDeleteInv(null)} />}
    </div>
  )
}
