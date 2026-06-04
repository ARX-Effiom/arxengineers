import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const PURPLE = '#5B2D8E'
const PURPLE_LIGHT = '#F3EEF9'
const PURPLE_DARK = '#3D1F6E'

const CATEGORIES = {
  general:    { label: 'General',     color: '#6B7280', bg: '#F9FAFB' },
  query:      { label: 'Query',       color: '#2563EB', bg: '#EFF6FF' },
  action:     { label: 'Action',      color: PURPLE,    bg: PURPLE_LIGHT },
  chase:      { label: 'Chase',       color: '#D97706', bg: '#FFFBEB' },
  review:     { label: 'Review',      color: '#0891B2', bg: '#ECFEFF' },
  site_visit: { label: 'Site Visit',  color: '#16A34A', bg: '#F0FDF4' },
}

const PRIORITIES = {
  low:    { label: 'Low',    color: '#9CA3AF', dot: '#D1D5DB' },
  normal: { label: 'Normal', color: '#6B7280', dot: '#9CA3AF' },
  high:   { label: 'High',   color: '#D97706', dot: '#F59E0B' },
  urgent: { label: 'Urgent', color: '#DC2626', dot: '#EF4444' },
}

const STATUSES = {
  open:        { label: 'Open',        color: '#1A1A1A', bg: '#F3F4F6' },
  in_progress: { label: 'In Progress', color: '#D97706', bg: '#FFFBEB' },
  waiting:     { label: 'Waiting',     color: '#2563EB', bg: '#EFF6FF' },
  done:        { label: 'Done',        color: '#16A34A', bg: '#F0FDF4' },
}

const EMPTY_FORM = {
  title: '', detail: '', category: 'general', priority: 'normal',
  status: 'open', due_date: '', project_id: '', project_ref: '',
}

function isOverdue(task) {
  if (!task.due_date || task.status === 'done') return false
  return new Date(task.due_date) < new Date(new Date().toDateString())
}

function isDueToday(task) {
  if (!task.due_date || task.status === 'done') return false
  return task.due_date === new Date().toISOString().slice(0, 10)
}

function formatDate(d) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Tag pill ──────────────────────────────────────────────────────────────────
function Pill({ label, color, bg, size = 11 }) {
  return (
    <span style={{
      fontSize: size, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      color, background: bg, whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

// ─── Task row ──────────────────────────────────────────────────────────────────
function TaskRow({ task, onEdit, onToggleDone, onDelete }) {
  const overdue = isOverdue(task)
  const today = isDueToday(task)
  const isDone = task.status === 'done'
  const cat = CATEGORIES[task.category] || CATEGORIES.general
  const pri = PRIORITIES[task.priority] || PRIORITIES.normal

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '28px 1fr auto',
      gap: 12,
      padding: '12px 16px',
      borderBottom: '1px solid var(--border, #E5E7EB)',
      background: isDone ? '#FAFAFA' : overdue ? '#FFF8F8' : '#FFFFFF',
      alignItems: 'flex-start',
      transition: 'background 0.1s',
    }}>
      {/* Checkbox */}
      <div style={{ paddingTop: 2 }}>
        <button
          onClick={() => onToggleDone(task)}
          style={{
            width: 20, height: 20, borderRadius: 6,
            border: `2px solid ${isDone ? '#16A34A' : overdue ? '#EF4444' : '#D1D5DB'}`,
            background: isDone ? '#16A34A' : '#FFF',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, padding: 0,
          }}
          title={isDone ? 'Reopen' : 'Mark done'}
        >
          {isDone && <span style={{ color: '#FFF', fontSize: 11, lineHeight: 1 }}>✓</span>}
        </button>
      </div>

      {/* Content */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          {/* Priority dot */}
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: pri.dot, display: 'inline-block', flexShrink: 0 }} title={`${pri.label} priority`} />
          {/* Title */}
          <span style={{
            fontWeight: 600, fontSize: 14, color: isDone ? '#9CA3AF' : '#1A1A1A',
            textDecoration: isDone ? 'line-through' : 'none',
          }}>
            {task.title}
          </span>
          {/* Category */}
          <Pill label={cat.label} color={cat.color} bg={cat.bg} />
          {/* Status (non-open) */}
          {task.status !== 'open' && !isDone && (
            <Pill label={STATUSES[task.status]?.label} color={STATUSES[task.status]?.color} bg={STATUSES[task.status]?.bg} />
          )}
        </div>

        {/* Detail */}
        {task.detail && (
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 6, lineHeight: 1.4, paddingLeft: 15 }}>
            {task.detail}
          </div>
        )}

        {/* Meta row */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingLeft: 15, flexWrap: 'wrap' }}>
          {task.project_ref && (
            <span style={{ fontSize: 11, color: PURPLE, fontWeight: 600 }}>📁 {task.project_ref}</span>
          )}
          {task.due_date && (
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: overdue ? '#DC2626' : today ? '#D97706' : '#9CA3AF',
            }}>
              {overdue ? '⚠ Overdue · ' : today ? '⏰ Due today · ' : '📅 '}{formatDate(task.due_date)}
            </span>
          )}
          {isDone && task.completed_at && (
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>
              Completed {formatDate(task.completed_at.slice(0, 10))}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, paddingTop: 2 }}>
        <button onClick={() => onEdit(task)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 14, padding: '2px 4px' }}
          title="Edit">✏</button>
        <button onClick={() => onDelete(task.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', fontSize: 13, padding: '2px 4px' }}
          title="Delete">✕</button>
      </div>
    </div>
  )
}

// ─── Add / Edit modal ──────────────────────────────────────────────────────────
function TaskModal({ task, projects, onSave, onClose }) {
  const [form, setForm] = useState(task ? {
    title: task.title || '',
    detail: task.detail || '',
    category: task.category || 'general',
    priority: task.priority || 'normal',
    status: task.status || 'open',
    due_date: task.due_date || '',
    project_id: task.project_id || '',
    project_ref: task.project_ref || '',
  } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const titleRef = useRef()

  useEffect(() => { setTimeout(() => titleRef.current?.focus(), 50) }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleProjectChange = (id) => {
    const p = projects.find(p => p.id === id)
    set('project_id', id)
    set('project_ref', p?.ref || '')
  }

  const handleSave = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    await onSave(form, task?.id)
    setSaving(false)
  }

  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }
  const labelStyle = { fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }
  const rowStyle = { marginBottom: 14 }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#FFF', borderRadius: 12, width: '100%', maxWidth: 520,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', maxHeight: '90vh',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: PURPLE_DARK }}>{task ? 'Edit Task' : 'New Task'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9CA3AF', lineHeight: 1 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          <div style={rowStyle}>
            <label style={labelStyle}>Task *</label>
            <input ref={titleRef} value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="What needs to be done?" style={inputStyle}
              onKeyDown={e => e.key === 'Enter' && handleSave()} />
          </div>

          <div style={rowStyle}>
            <label style={labelStyle}>Detail / Notes</label>
            <textarea value={form.detail} onChange={e => set('detail', e.target.value)}
              placeholder="Query content, email thread summary, context…"
              rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Category</label>
              <select value={form.category} onChange={e => set('category', e.target.value)} style={inputStyle}>
                {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} style={inputStyle}>
                {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} style={inputStyle}>
                {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={rowStyle}>
            <label style={labelStyle}>Link to Project (optional)</label>
            <select value={form.project_id} onChange={e => handleProjectChange(e.target.value)} style={inputStyle}>
              <option value="">— no project —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.ref} · {p.client_name} · {p.address_line1}</option>)}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '8px 18px', border: '1px solid #D1D5DB', borderRadius: 7, background: '#FFF', fontSize: 13, cursor: 'pointer', color: '#374151' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={!form.title.trim() || saving}
            style={{ padding: '8px 20px', border: 'none', borderRadius: 7, background: form.title.trim() ? PURPLE : '#C4B5D9', color: '#FFF', fontWeight: 600, fontSize: 13, cursor: form.title.trim() ? 'pointer' : 'not-allowed' }}>
            {saving ? 'Saving…' : task ? 'Save Changes' : 'Add Task'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Tasks page ───────────────────────────────────────────────────────────
export default function Tasks() {
  const [tasks, setTasks] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'new' | task object
  const [filterStatus, setFilterStatus] = useState('open')  // 'all' | status key
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterProject, setFilterProject] = useState('all')
  const [search, setSearch] = useState('')
  const [showDone, setShowDone] = useState(false)

  const loadData = async () => {
    setLoading(true)
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('projects').select('id, ref, client_name, address_line1').order('created_at', { ascending: false }),
    ])
    setTasks(t || [])
    setProjects(p || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // ── CRUD ──

  const handleSave = async (form, id) => {
    const payload = {
      title: form.title.trim(),
      detail: form.detail.trim() || null,
      category: form.category,
      priority: form.priority,
      status: form.status,
      due_date: form.due_date || null,
      project_id: form.project_id || null,
      project_ref: form.project_ref || null,
      completed_at: form.status === 'done' ? new Date().toISOString() : null,
    }
    if (id) {
      await supabase.from('tasks').update(payload).eq('id', id)
    } else {
      await supabase.from('tasks').insert(payload)
    }
    setModal(null)
    await loadData()
  }

  const handleToggleDone = async (task) => {
    const isDone = task.status === 'done'
    await supabase.from('tasks').update({
      status: isDone ? 'open' : 'done',
      completed_at: isDone ? null : new Date().toISOString(),
    }).eq('id', task.id)
    await loadData()
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this task?')) return
    await supabase.from('tasks').delete().eq('id', id)
    await loadData()
  }

  // ── Filter + sort ──

  const filtered = tasks.filter(t => {
    if (!showDone && t.status === 'done') return false
    if (filterStatus !== 'all' && filterStatus !== 'done' && t.status !== filterStatus) return false
    if (filterStatus === 'done' && t.status !== 'done') return false
    if (filterCategory !== 'all' && t.category !== filterCategory) return false
    if (filterProject !== 'all' && t.project_id !== filterProject) return false
    if (search) {
      const q = search.toLowerCase()
      if (!t.title.toLowerCase().includes(q) && !(t.detail || '').toLowerCase().includes(q) && !(t.project_ref || '').toLowerCase().includes(q)) return false
    }
    return true
  }).sort((a, b) => {
    // Sort: overdue first, then by priority, then by due date, then created
    const priOrder = { urgent: 0, high: 1, normal: 2, low: 3 }
    if (isOverdue(a) && !isOverdue(b)) return -1
    if (!isOverdue(a) && isOverdue(b)) return 1
    if (isDueToday(a) && !isDueToday(b)) return -1
    if (!isDueToday(a) && isDueToday(b)) return 1
    const pd = (priOrder[a.priority] || 2) - (priOrder[b.priority] || 2)
    if (pd !== 0) return pd
    if (a.due_date && b.due_date) return a.due_date < b.due_date ? -1 : 1
    if (a.due_date) return -1
    if (b.due_date) return 1
    return new Date(b.created_at) - new Date(a.created_at)
  })

  // ── Stats ──
  const open = tasks.filter(t => t.status !== 'done')
  const overdueCount = open.filter(isOverdue).length
  const dueTodayCount = open.filter(isDueToday).length
  const doneCount = tasks.filter(t => t.status === 'done').length

  const chipStyle = (active) => ({
    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    border: `1px solid ${active ? PURPLE : '#E5E7EB'}`,
    background: active ? PURPLE_LIGHT : '#FFF',
    color: active ? PURPLE : '#6B7280',
    cursor: 'pointer', transition: 'all 0.1s',
  })

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: PURPLE_DARK, marginBottom: 4 }}>Tasks</h1>
          <p style={{ color: '#9CA3AF', fontSize: 14 }}>Queries, actions, and follow-ups across all projects</p>
        </div>
        <button onClick={() => setModal('new')}
          style={{ padding: '10px 20px', background: PURPLE, color: '#FFF', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          + New Task
        </button>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Open', value: open.length, color: '#1A1A1A', bg: '#F3F4F6', border: '#E5E7EB' },
          { label: 'Overdue', value: overdueCount, color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
          { label: 'Due Today', value: dueTodayCount, color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
          { label: 'Completed', value: doneCount, color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: s.color, marginTop: 4, fontWeight: 600, opacity: 0.8 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks…"
            style={{ padding: '6px 12px', border: '1px solid #E5E7EB', borderRadius: 20, fontSize: 13, outline: 'none', width: 180 }} />

          <div style={{ width: 1, height: 20, background: '#E5E7EB', margin: '0 4px' }} />

          {/* Status filters */}
          {['all', 'open', 'in_progress', 'waiting'].map(s => (
            <button key={s} style={chipStyle(filterStatus === s)}
              onClick={() => { setFilterStatus(s); if (s !== 'all') setShowDone(false) }}>
              {s === 'all' ? 'All open' : STATUSES[s]?.label}
            </button>
          ))}

          <div style={{ width: 1, height: 20, background: '#E5E7EB', margin: '0 4px' }} />

          {/* Category filters */}
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <button key={k} style={chipStyle(filterCategory === k)}
              onClick={() => setFilterCategory(filterCategory === k ? 'all' : k)}>
              {v.label}
            </button>
          ))}

          <div style={{ marginLeft: 'auto' }}>
            <button style={chipStyle(showDone)}
              onClick={() => setShowDone(d => !d)}>
              {showDone ? '✓ Hiding done' : 'Show done'}
            </button>
          </div>
        </div>

        {/* Project filter */}
        {projects.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
              style={{ padding: '5px 10px', border: '1px solid #E5E7EB', borderRadius: 20, fontSize: 12, color: filterProject !== 'all' ? PURPLE : '#6B7280', fontWeight: filterProject !== 'all' ? 600 : 400 }}>
              <option value="all">All projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.ref} · {p.client_name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Task list */}
      <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
            <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>
              {search || filterCategory !== 'all' || filterProject !== 'all' ? 'No tasks match your filters' : 'No open tasks'}
            </div>
            <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 16 }}>
              {!search && filterCategory === 'all' && filterProject === 'all' ? "You're on top of everything." : 'Try adjusting the filters above.'}
            </div>
            {!search && filterCategory === 'all' && filterProject === 'all' && (
              <button onClick={() => setModal('new')}
                style={{ padding: '8px 18px', background: PURPLE, color: '#FFF', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                + Add a task
              </button>
            )}
          </div>
        )}
        {!loading && filtered.map(task => (
          <TaskRow key={task.id} task={task}
            onEdit={t => setModal(t)}
            onToggleDone={handleToggleDone}
            onDelete={handleDelete} />
        ))}
      </div>

      {/* Result count */}
      {!loading && filtered.length > 0 && (
        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8, textAlign: 'right' }}>
          Showing {filtered.length} task{filtered.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <TaskModal
          task={modal === 'new' ? null : modal}
          projects={projects}
          onSave={handleSave}
          onClose={() => setModal(null)} />
      )}
    </div>
  )
}
