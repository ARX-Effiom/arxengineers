import { useState, useRef, useCallback } from 'react'

const PURPLE = '#5B2D8E'
const PURPLE_DARK = '#3D1F6E'
const PURPLE_LIGHT = '#F3EEF9'

// ─── severity config ──────────────────────────────────────────────────────────
const SEVERITY = {
  critical: { label: 'Critical',  color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: '✕' },
  major:    { label: 'Major',     color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA', icon: '⚠' },
  minor:    { label: 'Minor',     color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: '○' },
  query:    { label: 'Query',     color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', icon: '?' },
  pass:     { label: 'Pass',      color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', icon: '✓' },
}

// ─── PDF rasteriser ───────────────────────────────────────────────────────────
async function loadPdfJs() {
  if (window.pdfjsLib) return
  await new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
      resolve()
    }
    s.onerror = reject
    document.head.appendChild(s)
  })
}

async function rasterisePDF(file, onProgress) {
  await loadPdfJs()
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.(`Rasterising page ${i} of ${pdf.numPages}…`)
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1.8 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    pages.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.75), pageNum: i })
  }
  return pages
}

// ─── File reader helpers ──────────────────────────────────────────────────────
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

// Extract selectable text from a PDF — gets member schedules, notes, annotations
async function extractPdfText(file) {
  await loadPdfJs()
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  const pageTexts = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items.map(item => item.str).join(' ')
    if (pageText.trim()) pageTexts.push(`--- Page ${i} ---\n${pageText}`)
  }
  return pageTexts.join('\n\n')
}

// ─── Upload zone ──────────────────────────────────────────────────────────────
function UploadZone({ label, accept, icon, file, onFile, hint }) {
  const [dragging, setDragging] = useState(false)
  const ref = useRef()

  const handle = f => {
    if (f) onFile(f)
  }

  return (
    <div
      onClick={() => !file && ref.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]) }}
      style={{
        border: `2px dashed ${file ? '#16A34A' : dragging ? PURPLE : '#C4B5D9'}`,
        borderRadius: 10, padding: '20px 16px', textAlign: 'center',
        cursor: file ? 'default' : 'pointer',
        background: file ? '#F0FDF4' : dragging ? PURPLE_LIGHT : '#FAFAFA',
        transition: 'all 0.15s', flex: 1,
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 6 }}>{file ? '✅' : icon}</div>
      <div style={{ fontWeight: 600, fontSize: 13, color: file ? '#16A34A' : PURPLE, marginBottom: 3 }}>
        {file ? file.name : label}
      </div>
      <div style={{ fontSize: 11, color: '#9CA3AF' }}>{file ? `${(file.size / 1024).toFixed(0)} KB` : hint}</div>
      {file && (
        <button
          onClick={e => { e.stopPropagation(); onFile(null) }}
          style={{ marginTop: 6, fontSize: 11, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >✕ Remove</button>
      )}
      <input ref={ref} type="file" accept={accept} style={{ display: 'none' }}
        onChange={e => handle(e.target.files[0])} />
    </div>
  )
}

// ─── Comment card ─────────────────────────────────────────────────────────────
function CommentCard({ comment, index }) {
  const [expanded, setExpanded] = useState(comment.severity === 'critical' || comment.severity === 'major')
  const sev = SEVERITY[comment.severity] || SEVERITY.query

  return (
    <div style={{
      border: `1px solid ${sev.border}`, borderRadius: 8,
      background: '#FFF', overflow: 'hidden', marginBottom: 8,
    }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', padding: '10px 14px', background: 'none', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left',
        }}
      >
        <span style={{
          flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
          background: sev.bg, border: `1px solid ${sev.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: sev.color, marginTop: 1,
        }}>{sev.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: sev.bg, color: sev.color }}>
              {sev.label}
            </span>
            {comment.member && (
              <span style={{ fontSize: 11, fontWeight: 600, color: PURPLE, background: PURPLE_LIGHT, padding: '1px 7px', borderRadius: 20 }}>
                {comment.member}
              </span>
            )}
            {comment.clause && (
              <span style={{ fontSize: 11, color: '#9CA3AF' }}>{comment.clause}</span>
            )}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A', marginTop: 4, lineHeight: 1.4 }}>
            {comment.title}
          </div>
        </div>
        <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{ padding: '0 14px 14px 46px', borderTop: `1px solid ${sev.border}`, paddingTop: 10 }}>
          <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: comment.recommendation ? 10 : 0 }}>
            {comment.detail}
          </div>
          {comment.recommendation && (
            <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, padding: '8px 12px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Recommendation
              </div>
              <div style={{ fontSize: 13, color: '#1A1A1A', lineHeight: 1.5 }}>{comment.recommendation}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Summary stats bar ────────────────────────────────────────────────────────
function SummaryBar({ comments }) {
  const counts = Object.keys(SEVERITY).reduce((a, k) => ({ ...a, [k]: 0 }), {})
  comments.forEach(c => { if (counts[c.severity] !== undefined) counts[c.severity]++ })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
      {Object.entries(SEVERITY).map(([k, v]) => (
        <div key={k} style={{ background: v.bg, border: `1px solid ${v.border}`, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: v.color, lineHeight: 1 }}>{counts[k]}</div>
          <div style={{ fontSize: 11, color: v.color, fontWeight: 600, marginTop: 3 }}>{v.label}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Main CalcChecker component ───────────────────────────────────────────────
export default function CalcChecker() {
  const [calcFile, setCalcFile] = useState(null)    // .docx or .pdf
  const [drawingFile, setDrawingFile] = useState(null) // .pdf
  const [status, setStatus] = useState(null) // { type: 'loading'|'error'|'done', msg }
  const [results, setResults] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [generatingPdf, setGeneratingPdf] = useState(false)

  const canRun = calcFile || drawingFile

  const run = async () => {
    setStatus({ type: 'loading', msg: 'Preparing files…' })
    setResults(null)

    try {
      // ── Prepare calc file ──────────────────────────────────────────────────
      let calcPayload = null
      if (calcFile) {
        const isPDF = calcFile.name.endsWith('.pdf')
        const isDocx = calcFile.name.endsWith('.docx') || calcFile.name.endsWith('.doc')
        if (isPDF) {
          setStatus({ type: 'loading', msg: 'Rasterising calculation PDF…' })
          const pages = await rasterisePDF(calcFile, msg => setStatus({ type: 'loading', msg }))
          calcPayload = { type: 'images', pages: pages.map(p => ({ data: p.dataUrl.split(',')[1], pageNum: p.pageNum })), filename: calcFile.name }
        } else if (isDocx) {
          const b64 = await readFileAsBase64(calcFile)
          calcPayload = { type: 'docx', data: b64, filename: calcFile.name }
        }
      }

      // ── Prepare drawing file ───────────────────────────────────────────────
      let drawingPayload = null
      if (drawingFile) {
        // Extract text layer first — reliably gets member schedules regardless of image scale
        setStatus({ type: 'loading', msg: 'Extracting drawing text (member schedules, notes)…' })
        const drawingText = await extractPdfText(drawingFile).catch(() => '')
        // Then rasterise for visual review
        setStatus({ type: 'loading', msg: 'Rasterising drawing PDF…' })
        const pages = await rasterisePDF(drawingFile, msg => setStatus({ type: 'loading', msg }))
        drawingPayload = {
          pages: pages.map(p => ({ data: p.dataUrl.split(',')[1], pageNum: p.pageNum })),
          filename: drawingFile.name,
          textContent: drawingText,
        }
      }

      setStatus({ type: 'loading', msg: 'Sending to review agent…' })

      const res = await fetch('/api/check-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calc: calcPayload, drawing: drawingPayload }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `Server error ${res.status}` }))
        throw new Error(err.error || `Server error ${res.status}`)
      }

      const data = await res.json()
      setResults(data)
      setStatus({ type: 'done', msg: `Review complete — ${data.comments?.length || 0} item${data.comments?.length !== 1 ? 's' : ''} raised` })

    } catch (err) {
      setStatus({ type: 'error', msg: err.message })
    }
  }

  const downloadReport = async () => {
    if (!results) return
    setGeneratingPdf(true)
    try {
      const res = await fetch('/api/check-package/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results, calcFilename: calcFile?.name, drawingFilename: drawingFile?.name }),
      })
      if (!res.ok) throw new Error('Failed to generate report')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ref = results.projectRef || 'ARX'
      a.download = `${ref} - Structural Review Note.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setStatus({ type: 'error', msg: 'Report generation failed: ' + err.message })
    }
    setGeneratingPdf(false)
  }

  const filtered = results?.comments?.filter(c =>
    activeFilter === 'all' || c.severity === activeFilter
  ) || []

  const chipStyle = (active) => ({
    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    border: `1px solid ${active ? PURPLE : '#E5E7EB'}`,
    background: active ? PURPLE_LIGHT : '#FFF',
    color: active ? PURPLE : '#6B7280',
    cursor: 'pointer',
  })

  return (
    <div style={{ padding: 32, fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: PURPLE_DARK, marginBottom: 4 }}>Calculation & Drawing Checker</h1>
        <p style={{ color: '#9CA3AF', fontSize: 14 }}>Upload your Tedds calc package (.docx or .pdf) and/or structural drawings (.pdf) for AI-assisted review</p>
      </div>

      {/* Upload row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <UploadZone
          label="Calculation Package"
          accept=".docx,.doc,.pdf"
          icon="📐"
          hint=".docx or .pdf · Tedds for Word output"
          file={calcFile}
          onFile={setCalcFile}
        />
        <UploadZone
          label="Structural Drawings"
          accept=".pdf"
          icon="📋"
          hint=".pdf · GA, details, reinforcement"
          file={drawingFile}
          onFile={setDrawingFile}
        />
      </div>

      {/* Info note */}
      <div style={{ background: PURPLE_LIGHT, border: `1px solid #D8C5F0`, borderRadius: 8, padding: '10px 14px', fontSize: 12, color: PURPLE_DARK, marginBottom: 16 }}>
        <strong>How it works:</strong> Upload one or both files. The agent reviews calculations for code compliance, unit consistency, missing checks, and load logic. 
        Drawings are checked for member schedule completeness, connection detail coverage, and cross-reference with the calc package when both are provided.
      </div>

      {/* Status */}
      {status && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 8,
          background: status.type === 'error' ? '#FEF2F2' : status.type === 'done' ? '#F0FDF4' : PURPLE_LIGHT,
          color: status.type === 'error' ? '#DC2626' : status.type === 'done' ? '#16A34A' : PURPLE,
          border: `1px solid ${status.type === 'error' ? '#FECACA' : status.type === 'done' ? '#BBF7D0' : '#D8C5F0'}`,
        }}>
          {status.type === 'loading' && <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>}
          {status.type === 'done' && '✓'}
          {status.type === 'error' && '✕'}
          {status.msg}
        </div>
      )}

      {/* Run button */}
      <button
        onClick={run}
        disabled={!canRun || status?.type === 'loading'}
        style={{
          width: '100%', padding: '12px 0', marginBottom: 24,
          background: !canRun || status?.type === 'loading' ? '#C4B5D9' : PURPLE,
          color: '#FFF', border: 'none', borderRadius: 8,
          fontWeight: 700, fontSize: 15, cursor: !canRun || status?.type === 'loading' ? 'not-allowed' : 'pointer',
          transition: 'background 0.15s',
        }}
      >
        {status?.type === 'loading' ? 'Reviewing…' : '🔍 Run Full Package Review'}
      </button>

      {/* Results */}
      {results && (
        <div>
          {/* Project info */}
          {(results.projectRef || results.projectTitle) && (
            <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: PURPLE }}>{results.projectRef}</span>
              {results.projectRef && results.projectTitle && ' · '}
              <span style={{ color: '#374151' }}>{results.projectTitle}</span>
              {results.calcBy && <span style={{ color: '#9CA3AF', marginLeft: 12 }}>Calc by: {results.calcBy}</span>}
            </div>
          )}

          {/* Summary */}
          {results.summary && (
            <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 8, padding: '14px 16px', marginBottom: 16, fontSize: 13, lineHeight: 1.6, color: '#374151' }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Review Summary</div>
              {results.summary}
            </div>
          )}

          {/* Stats */}
          <SummaryBar comments={results.comments || []} />

          {/* Filter chips */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            <button style={chipStyle(activeFilter === 'all')} onClick={() => setActiveFilter('all')}>
              All ({results.comments?.length || 0})
            </button>
            {Object.entries(SEVERITY).filter(([k]) => k !== 'pass').map(([k, v]) => {
              const count = results.comments?.filter(c => c.severity === k).length || 0
              if (!count) return null
              return (
                <button key={k} style={chipStyle(activeFilter === k)} onClick={() => setActiveFilter(k)}>
                  {v.label} ({count})
                </button>
              )
            })}
          </div>

          {/* Comment list */}
          <div>
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>
                No items in this category
              </div>
            ) : (
              filtered.map((c, i) => <CommentCard key={i} comment={c} index={i} />)
            )}
          </div>

          {/* Download */}
          <button
            onClick={downloadReport}
            disabled={generatingPdf}
            style={{
              marginTop: 16, width: '100%', padding: '11px 0',
              background: generatingPdf ? '#E5E7EB' : '#1A1A1A',
              color: generatingPdf ? '#9CA3AF' : '#FFF',
              border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14,
              cursor: generatingPdf ? 'not-allowed' : 'pointer',
            }}
          >
            {generatingPdf ? '⏳ Generating PDF…' : '⬇ Download Review Note (.pdf)'}
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
