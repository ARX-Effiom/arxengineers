import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { generateQuoteDocx, downloadDocx } from '../lib/quoteDocx'

const PURPLE = '#5B2D8E'
const PURPLE_LIGHT = '#F3EEF9'

// ─── Drawing analyser helpers ──────────────────────────────────────────────────

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
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    pages.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.7), pageNum: i, label: `Page ${i}` })
  }
  return pages
}

const ELEMENT_CATEGORIES = {
  existing: { label: 'Existing',        color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  proposed: { label: 'Proposed New',    color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
  remove:   { label: 'To Remove',       color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  retain:   { label: 'Retain & Modify', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
}

// ─── System prompts ────────────────────────────────────────────────────────────

const SCOPE_SYSTEM_PROMPT = `You are the AI assistant for ARX Engineers Ltd, a structural engineering consultancy in Bristol.

Director: Effiom Esua, BEng MSc

When asked to generate a structural engineering scope and fee proposal, respond with ONLY valid JSON in this exact format:
{
  "projectDescription": "brief description",
  "scopeItems": ["Design of new ...", "..."],
  "siteVisitLine": "No site visits considered in quotation.",
  "suggestedFee": 850,
  "additionalNotes": ["any flags or risks"]
}

Rules:
- Every scope item starts with "Design of new...", "Stability design of...", or "Checking of..."
- Always end with "Working drawings of structural scheme and key details." then "Existing structure, foundations and soil assumed to be competent."
- Fee based on these ranges: loft only £500-800, extension only £500-900, loft+extension combined £1200-1800, complex/multi-storey £2500-4000, simple dormer £450-600
- Add +£350 for NHBC tree foundations, +£1000 for main roof redesign, +£40 per unique steel connection type
- additionalNotes: flag trees, party walls, complex foundations, listed buildings
- siteVisitLine: "No site visits considered in quotation." OR "X site visit(s) included at £Y each."
- ONLY return valid JSON, no other text`

// ─── Drawing Analyser sub-component ───────────────────────────────────────────

function DrawingAnalyser({ onScopeExtracted }) {
  const [pages, setPages] = useState([])
  const [selectedPages, setSelectedPages] = useState(new Set())
  const [isDragging, setIsDragging] = useState(false)
  const [status, setStatus] = useState(null)
  const [results, setResults] = useState(null)
  const [fileName, setFileName] = useState(null)
  const fileInputRef = useRef()

  const processFile = useCallback(async (file) => {
    if (!file) return
    const isPDF = file.type === 'application/pdf' || file.name.endsWith('.pdf')
    const isImage = file.type.startsWith('image/')
    if (!isPDF && !isImage) {
      setStatus({ type: 'error', msg: 'Please upload a PDF or image file.' })
      return
    }
    setResults(null)
    setSelectedPages(new Set())
    setFileName(file.name)

    if (isImage) {
      const reader = new FileReader()
      reader.onload = (e) => {
        setPages([{ dataUrl: e.target.result, pageNum: 1, label: 'Image' }])
        setSelectedPages(new Set([0]))
        setStatus(null)
      }
      reader.readAsDataURL(file)
      return
    }

    setStatus({ type: 'loading', msg: 'Reading PDF…' })
    try {
      const rasterised = await rasterisePDF(file, msg => setStatus({ type: 'loading', msg }))
      setPages(rasterised)
      setSelectedPages(new Set(rasterised.map((_, i) => i)))
      setStatus(null)
    } catch (err) {
      setStatus({ type: 'error', msg: `Failed to read PDF: ${err.message}` })
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    processFile(e.dataTransfer.files[0])
  }, [processFile])

  const analyse = async () => {
    const toAnalyse = pages.filter((_, i) => selectedPages.has(i))
    if (!toAnalyse.length) return
    setStatus({ type: 'loading', msg: `Analysing ${toAnalyse.length} page(s)…` })
    setResults(null)

    try {
      const acc = { existing: [], proposed: [], remove: [], retain: [], notes: [] }
      for (let i = 0; i < toAnalyse.length; i++) {
        setStatus({ type: 'loading', msg: `Analysing page ${i + 1} of ${toAnalyse.length}…` })
        const res = await fetch('/api/analyse-drawings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images: [{ data: toAnalyse[i].dataUrl.split(',')[1], mediaType: 'image/jpeg' }],
            pageLabel: toAnalyse[i].label,
          }),
        })
        if (!res.ok) throw new Error(`Server error: ${res.status}`)
        const data = await res.json()
        ;['existing', 'proposed', 'remove', 'retain', 'notes'].forEach(k => {
          if (data[k]) acc[k].push(...data[k])
        })
      }
      // deduplicate
      Object.keys(acc).forEach(k => {
        acc[k] = [...new Set(acc[k].map(s => s.trim()).filter(Boolean))]
      })
      setResults(acc)
      setStatus({ type: 'done', msg: `Analysis complete — ${toAnalyse.length} page(s) processed` })
    } catch (err) {
      setStatus({ type: 'error', msg: err.message })
    }
  }

  const togglePage = i => setSelectedPages(prev => {
    const next = new Set(prev)
    next.has(i) ? next.delete(i) : next.add(i)
    return next
  })

  const s = {
    dropZone: {
      border: `2px dashed ${isDragging ? PURPLE : '#C4B5D9'}`,
      borderRadius: 10, padding: '40px 24px', textAlign: 'center',
      cursor: 'pointer', background: isDragging ? PURPLE_LIGHT : '#FAFAFA',
      transition: 'all 0.15s',
    },
    statusBar: (type) => ({
      marginTop: 10, padding: '9px 14px', borderRadius: 7, fontSize: 13,
      display: 'flex', alignItems: 'center', gap: 8,
      background: type === 'error' ? '#FEF2F2' : type === 'done' ? '#F0FDF4' : PURPLE_LIGHT,
      color: type === 'error' ? '#DC2626' : type === 'done' ? '#16A34A' : PURPLE,
      border: `1px solid ${type === 'error' ? '#FECACA' : type === 'done' ? '#BBF7D0' : '#D8C5F0'}`,
    }),
    thumb: (selected) => ({
      flexShrink: 0, cursor: 'pointer', width: 72,
      border: `2px solid ${selected ? PURPLE : '#DDD'}`,
      borderRadius: 6, overflow: 'hidden',
      background: selected ? PURPLE_LIGHT : '#F9F9F9',
      transition: 'all 0.1s',
    }),
    analyseBtn: (disabled) => ({
      width: '100%', padding: '10px 0', marginTop: 12,
      background: disabled ? '#C4B5D9' : PURPLE,
      color: '#FFF', border: 'none', borderRadius: 7,
      fontWeight: 600, fontSize: 14,
      cursor: disabled ? 'not-allowed' : 'pointer',
    }),
  }

  return (
    <div style={{ fontSize: 14 }}>
      {/* Drop zone */}
      {!pages.length && (
        <div
          style={s.dropZone}
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div style={{ fontSize: 32, marginBottom: 10 }}>📐</div>
          <div style={{ fontWeight: 600, color: PURPLE, marginBottom: 4 }}>Drop architectural drawings here</div>
          <div style={{ color: '#888', fontSize: 12 }}>PDF or image · multi-page supported</div>
          <input ref={fileInputRef} type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => processFile(e.target.files[0])} />
        </div>
      )}

      {/* Status */}
      {status && (
        <div style={s.statusBar(status.type)}>
          {status.type === 'loading' && <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>}
          {status.type === 'done' && '✓'}
          {status.type === 'error' && '✕'}
          {status.msg}
        </div>
      )}

      {/* Thumbnails */}
      {pages.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: '#555' }}>
              <strong style={{ color: '#1A1A1A' }}>{fileName}</strong>
              {' · '}{pages.length}p · {selectedPages.size} selected
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setSelectedPages(selectedPages.size === pages.length ? new Set() : new Set(pages.map((_, i) => i)))}
                style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #DDD', borderRadius: 4, background: '#FFF', cursor: 'pointer', color: '#555' }}>
                {selectedPages.size === pages.length ? 'Deselect all' : 'Select all'}
              </button>
              <button onClick={() => { setPages([]); setResults(null); setStatus(null); setFileName(null) }}
                style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #DDD', borderRadius: 4, background: '#FFF', cursor: 'pointer', color: '#555' }}>
                Change
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {pages.map((p, i) => (
              <div key={i} style={s.thumb(selectedPages.has(i))} onClick={() => togglePage(i)}>
                <img src={p.dataUrl} alt={p.label} style={{ width: '100%', height: 52, objectFit: 'contain', display: 'block' }} />
                <div style={{ fontSize: 9, textAlign: 'center', padding: '2px 0', color: selectedPages.has(i) ? PURPLE : '#888', fontWeight: selectedPages.has(i) ? 600 : 400 }}>
                  {p.label}
                </div>
              </div>
            ))}
          </div>

          <button style={s.analyseBtn(selectedPages.size === 0 || status?.type === 'loading')}
            disabled={selectedPages.size === 0 || status?.type === 'loading'}
            onClick={analyse}>
            {status?.type === 'loading' ? 'Analysing…' : `Analyse ${selectedPages.size} page${selectedPages.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* Results */}
      {results && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: PURPLE, borderBottom: `2px solid ${PURPLE}`, paddingBottom: 5, marginBottom: 12 }}>
            Element Schedule
          </div>
          {Object.entries(ELEMENT_CATEGORIES).map(([key, cat]) => {
            const items = results[key] || []
            if (!items.length) return null
            return (
              <div key={key} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color }} />
                  <span style={{ fontWeight: 600, fontSize: 12, color: cat.color }}>{cat.label}</span>
                  <span style={{ fontSize: 10, color: cat.color, background: cat.bg, border: `1px solid ${cat.border}`, borderRadius: 10, padding: '1px 6px' }}>
                    {items.length}
                  </span>
                </div>
                <div style={{ background: cat.bg, border: `1px solid ${cat.border}`, borderRadius: 6 }}>
                  {items.map((item, i) => (
                    <div key={i} style={{ padding: '6px 10px', borderBottom: i < items.length - 1 ? `1px solid ${cat.border}` : 'none', fontSize: 12, display: 'flex', gap: 6 }}>
                      <span style={{ color: cat.color, flexShrink: 0 }}>·</span>{item}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {results.notes?.length > 0 && (
            <div style={{ padding: '8px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 11, color: '#92400E', marginBottom: 4 }}>⚠ Notes & Flags</div>
              {results.notes.map((n, i) => (
                <div key={i} style={{ fontSize: 11, color: '#78350F', marginBottom: 2 }}>· {n}</div>
              ))}
            </div>
          )}

          {results.proposed?.length > 0 && (
            <button
              onClick={() => onScopeExtracted(results)}
              style={{ width: '100%', padding: '9px 0', background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              ↑ Use proposed elements to generate scope
            </button>
          )}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ─── Main QuoteGenerator ────────────────────────────────────────────────────────

export default function QuoteGenerator() {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [inputMode, setInputMode] = useState('brief') // 'brief' | 'drawing'
  const [brief, setBrief] = useState('')
  const [generating, setGenerating] = useState(false)
  const [quoteData, setQuoteData] = useState(null)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [generatingDocx, setGeneratingDocx] = useState(false)
  const [includeSiteVisit, setIncludeSiteVisit] = useState(false)
  const [siteVisitFee, setSiteVisitFee] = useState(350)
  const [siteVisitCount, setSiteVisitCount] = useState(1)
  const [includeNHBC, setIncludeNHBC] = useState(false)
  const [hourlyRate, setHourlyRate] = useState(70)
  const [careOf, setCareOf] = useState('')
  const [quoteType, setQuoteType] = useState('design') // 'design' | 'inspection'

  useEffect(() => {
    supabase.from('projects').select('id, ref, client_name, address_line1, postcode, project_type, description')
      .order('created_at', { ascending: false })
      .then(({ data }) => setProjects(data || []))
  }, [])

  // Called when drawing analyser produces results — prefill brief for scope generation
  const handleScopeExtracted = (drawingResults) => {
    const proposed = drawingResults.proposed || []
    const existing = drawingResults.existing || []
    const remove = drawingResults.remove || []
    const lines = []
    if (proposed.length) lines.push(`Proposed new elements:\n${proposed.map(e => `- ${e}`).join('\n')}`)
    if (existing.length) lines.push(`Existing elements:\n${existing.map(e => `- ${e}`).join('\n')}`)
    if (remove.length) lines.push(`Elements to remove:\n${remove.map(e => `- ${e}`).join('\n')}`)
    setBrief(lines.join('\n\n'))
    setInputMode('brief')
    // small delay so user sees the switch
    setTimeout(() => document.querySelector('textarea')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
  }

  const handleGenerate = async () => {
    if (!brief.trim()) return setError('Please describe the project')
    setGenerating(true)
    setError(null)
    setQuoteData(null)
    setSaved(false)

    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          system: SCOPE_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: brief }]
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || 'API error')
      const text = data.content[0]?.text || ''
      const clean = text.replace(/```json\n?/g, '').replace(/```/g, '').trim()
      setQuoteData(JSON.parse(clean))
    } catch (e) {
      setError(`Failed: ${e.message}`)
    }
    setGenerating(false)
  }

  const handleSaveToProject = async () => {
    if (!quoteData || !selectedProject) return
    const p = projects.find(p => p.id === selectedProject)
    const expires = new Date()
    expires.setMonth(expires.getMonth() + 3)
    const { error } = await supabase.from('quotes').insert({
      project_id: selectedProject,
      ref: p?.ref,
      scope_items: quoteData.scopeItems,
      site_visit_line: quoteData.siteVisitLine,
      fee: quoteData.suggestedFee,
      additional_notes: quoteData.additionalNotes,
      issued_at: new Date().toISOString(),
      expires_at: expires.toISOString(),
    })
    if (!error) {
      await supabase.from('projects').update({
        fee: quoteData.suggestedFee,
        deposit_amount: Math.round(quoteData.suggestedFee * 0.2),
        balance_amount: Math.round(quoteData.suggestedFee * 0.8),
        description: quoteData.projectDescription,
        status: 'quoted',
      }).eq('id', selectedProject)
      setSaved(true)
    }
  }

  const handleDownloadQuote = async () => {
    if (!quoteData) return
    setGeneratingDocx(true)
    try {
      const proj = selectedProject
        ? projects.find(p => p.id === selectedProject) || {}
        : { ref: 'ARX', client_name: '', address_line1: '', town: '', postcode: '' }
      const blob = await generateQuoteDocx({
        project: proj, quoteData,
        careOf: careOf || null,
        includeSiteVisit, siteVisitFee: Number(siteVisitFee), siteVisitCount: Number(siteVisitCount),
        includeNHBC, hourlyRate: Number(hourlyRate),
        quoteType,
      })
      const addr = [proj.address_line1, proj.postcode].filter(Boolean).join(' ')
      downloadDocx(blob, `${proj.ref} - ${addr} - ARX Structural Fee Quote.docx`)
    } catch (e) {
      setError('Failed to generate document: ' + e.message)
    }
    setGeneratingDocx(false)
  }

  // ── tab style helper ──
  const tabStyle = (active) => ({
    padding: '7px 16px', border: 'none', borderRadius: 6,
    background: active ? PURPLE : 'transparent',
    color: active ? '#FFF' : 'var(--text-muted)',
    fontWeight: active ? 600 : 400,
    fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
  })

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--purple-dark)' }}>Quote Generator</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>Generate scope and fee from a brief or architectural drawings</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* ── Left: Input ── */}
        <div>
          {/* Project link */}
          <div style={{ marginBottom: 16 }}>
            <label>Link to Project (optional)</label>
            <select value={selectedProject || ''} onChange={e => setSelectedProject(e.target.value || null)}>
              <option value="">— select project —</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.ref} · {p.client_name} · {p.address_line1}</option>
              ))}
            </select>
          </div>

          {/* Input mode tabs */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-secondary, #F5F5F5)', borderRadius: 8, padding: 4, marginBottom: 16 }}>
            <button style={tabStyle(inputMode === 'brief')} onClick={() => setInputMode('brief')}>✏️ Brief</button>
            <button style={tabStyle(inputMode === 'drawing')} onClick={() => setInputMode('drawing')}>📐 Drawing Analysis</button>
          </div>

          {/* Brief input */}
          {inputMode === 'brief' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label>Project Brief</label>
                <textarea
                  value={brief}
                  onChange={e => setBrief(e.target.value)}
                  rows={8}
                  placeholder={`Describe the project in plain English, e.g.:\n\nLoft conversion with hip-to-gable and rear dormer, plus a single storey rear extension with bifold doors. Two-storey Victorian terrace in Bristol. Client mentioned there's a large oak tree nearby.`}
                  style={{ resize: 'vertical' }}
                />
              </div>

              {error && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#DC2626', marginBottom: 16, fontSize: 13 }}>
                  {error}
                </div>
              )}

              <button className="btn-primary" style={{ width: '100%', padding: 12 }} onClick={handleGenerate} disabled={generating}>
                {generating ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Generating scope...</> : '⚡ Generate Scope & Fee'}
              </button>
            </>
          )}

          {/* Drawing analysis input */}
          {inputMode === 'drawing' && (
            <DrawingAnalyser onScopeExtracted={handleScopeExtracted} />
          )}
        </div>

        {/* ── Right: Output ── */}
        <div>
          {!quoteData && !generating && (
            <div className="card empty-state" style={{ minHeight: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>📝</div>
              <h3>Scope will appear here</h3>
              <p>{inputMode === 'drawing' ? 'Analyse a drawing, then click "Use proposed elements"' : 'Fill in the brief on the left and click Generate'}</p>
            </div>
          )}

          {generating && (
            <div className="card" style={{ padding: 32, minHeight: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <div className="spinner" style={{ width: 32, height: 32 }} />
              <div style={{ color: 'var(--text-muted)' }}>Generating scope and fee...</div>
            </div>
          )}

          {quoteData && (
            <div>
              <div className="card" style={{ padding: 24, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700 }}>Proposed Fee</h2>
                    <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--purple)', marginTop: 4 }}>
                      £{quoteData.suggestedFee?.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      Deposit: £{Math.round((quoteData.suggestedFee || 0) * 0.2).toLocaleString()} (20%) · Balance: £{Math.round((quoteData.suggestedFee || 0) * 0.8).toLocaleString()}
                    </div>
                  </div>
                  <button className="btn-ghost btn-sm" onClick={handleGenerate}>↻ Regenerate</button>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Scope of Works
                  </div>
                  <ol style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {quoteData.scopeItems?.map((item, i) => (
                      <li key={i} style={{ fontSize: 14, lineHeight: 1.5 }}>{item}</li>
                    ))}
                  </ol>
                </div>

                <div style={{ background: 'var(--purple-bg)', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: 'var(--purple-dark)', marginBottom: 12 }}>
                  📍 {quoteData.siteVisitLine}
                </div>

                {quoteData.additionalNotes?.length > 0 && (
                  <div style={{ background: '#FFFBEB', borderRadius: 6, padding: '10px 14px', border: '1px solid #FDE68A' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚠ Flags</div>
                    {quoteData.additionalNotes.map((n, i) => (
                      <div key={i} style={{ fontSize: 13, color: '#78350F', marginBottom: 4 }}>• {n}</div>
                    ))}
                  </div>
                )}
              </div>

              {selectedProject && (
                <button className={saved ? 'btn-secondary' : 'btn-primary'} style={{ width: '100%', padding: 12 }} onClick={handleSaveToProject} disabled={saved}>
                  {saved ? '✓ Saved to project' : '💾 Save to Project'}
                </button>
              )}
              {!selectedProject && (
                <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
                  Link to a project above to save this quote
                </div>
              )}

              {/* Quote options */}
              <div className="card" style={{ padding: 16, marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Quote Options</div>

                {/* Quote type */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Quote Type</label>
                  <div style={{ display: 'flex', gap: 4, background: '#F5F5F5', borderRadius: 6, padding: 3 }}>
                    <button style={tabStyle(quoteType === 'design')} onClick={() => setQuoteType('design')}>Design Project</button>
                    <button style={tabStyle(quoteType === 'inspection')} onClick={() => setQuoteType('inspection')}>Inspection Only</button>
                  </div>
                </div>

                {/* C/O */}
                <div style={{ marginBottom: 10 }}>
                  <label style={{ textTransform: 'none', fontSize: 13, fontWeight: 500 }}>C/O (care of)</label>
                  <input value={careOf} onChange={e => setCareOf(e.target.value)} placeholder="Architect / agent name (optional)" style={{ marginTop: 4 }} />
                </div>

                {/* Site visit (design only) */}
                {quoteType === 'design' && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                      <input type="checkbox" style={{ width: 'auto' }} checked={includeSiteVisit} onChange={e => setIncludeSiteVisit(e.target.checked)} />
                      Include site visit(s)
                    </label>
                    {includeSiteVisit && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 11 }}>No. of visits</label>
                          <input type="number" value={siteVisitCount} onChange={e => setSiteVisitCount(e.target.value)} min="1" max="5" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 11 }}>Fee per visit (£)</label>
                          <input type="number" value={siteVisitFee} onChange={e => setSiteVisitFee(e.target.value)} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* NHBC (design only) */}
                {quoteType === 'design' && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', fontSize: 13, fontWeight: 500 }}>
                      <input type="checkbox" style={{ width: 'auto' }} checked={includeNHBC} onChange={e => setIncludeNHBC(e.target.checked)} />
                      NHBC tree foundation design (4.2)
                    </label>
                  </div>
                )}

                {/* Hourly rate */}
                <div>
                  <label style={{ fontSize: 11 }}>Hourly rate (£/hr)</label>
                  <input type="number" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} style={{ maxWidth: 120 }} />
                </div>
              </div>

              <button className="btn-secondary" style={{ width: '100%', padding: 12, marginTop: 8 }} onClick={handleDownloadQuote} disabled={generatingDocx}>
                {generatingDocx ? '⏳ Generating...' : '⬇ Download Quote (.docx)'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
