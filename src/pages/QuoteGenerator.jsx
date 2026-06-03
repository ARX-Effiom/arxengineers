import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const SYSTEM_PROMPT = `You are the AI assistant for ARX Engineers Ltd, a structural engineering consultancy in Bristol. 

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

export default function QuoteGenerator() {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [brief, setBrief] = useState('')
  const [generating, setGenerating] = useState(false)
  const [quoteData, setQuoteData] = useState(null)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)


  useEffect(() => {
    supabase.from('projects').select('id, ref, client_name, address_line1, postcode, project_type, description')
      .order('created_at', { ascending: false })
      .then(({ data }) => setProjects(data || []))
  }, [])

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
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: brief }]
        })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || 'API error')

      const text = data.content[0]?.text || ''
      const json = JSON.parse(text)
      setQuoteData(json)
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
      // Also update project fee
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

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--purple-dark)' }}>Quote Generator</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>Describe the project in plain English — Claude generates the scope and fee</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Left: Input */}
        <div>
          {/* Link to project */}
          <div style={{ marginBottom: 16 }}>
            <label>Link to Project (optional)</label>
            <select value={selectedProject || ''} onChange={e => setSelectedProject(e.target.value || null)}>
              <option value="">— select project —</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.ref} · {p.client_name} · {p.address_line1}
                </option>
              ))}
            </select>
          </div>

          {/* Brief */}
          <div style={{ marginBottom: 16 }}>
            <label>Project Brief</label>
            <textarea
              value={brief}
              onChange={e => setBrief(e.target.value)}
              rows={8}
              placeholder={`Describe the project in plain English, e.g.:

Loft conversion with hip-to-gable and rear dormer, plus a single storey rear extension with bifold doors. Two-storey Victorian terrace in Bristol. Client mentioned there's a large oak tree nearby.`}
              style={{ resize: 'vertical' }}
            />
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#DC2626', marginBottom: 16, fontSize: 13 }}>
              {error}
            </div>
          )}

          <button
            className="btn-primary"
            style={{ width: '100%', padding: '12px' }}
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Generating scope...</> : '⚡ Generate Scope & Fee'}
          </button>
        </div>

        {/* Right: Output */}
        <div>
          {!quoteData && !generating && (
            <div className="card empty-state" style={{ minHeight: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>📝</div>
              <h3>Scope will appear here</h3>
              <p>Fill in the brief on the left and click Generate</p>
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
                <button
                  className={saved ? 'btn-secondary' : 'btn-primary'}
                  style={{ width: '100%', padding: 12 }}
                  onClick={handleSaveToProject}
                  disabled={saved}
                >
                  {saved ? '✓ Saved to project' : '💾 Save to Project'}
                </button>
              )}
              {!selectedProject && (
                <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
                  Link to a project above to save this quote
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
