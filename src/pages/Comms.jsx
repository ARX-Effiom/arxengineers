import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const RECIPIENT_TYPES = [
  { value: 'homeowner', label: 'Homeowner', tone: 'Warm, reassuring, plain English. Avoid jargon. They may be anxious about costs and process.' },
  { value: 'architect', label: 'Architect / Designer', tone: 'Professional, concise, technically precise. Peer-to-peer tone.' },
  { value: 'builder', label: 'Builder / Contractor', tone: 'Direct, practical, action-oriented. Clear on what needs to happen and when.' },
  { value: 'building_control', label: 'Building Control', tone: 'Formal, referenced, compliant. Reference Approved Documents where relevant.' },
  { value: 'solicitor', label: 'Solicitor', tone: 'Measured, factual, precisely scoped to structural matters only.' },
]

const COMMS_TYPES = [
  { value: 'email', label: '✉️ Email Draft', placeholder: 'Describe what the email needs to say, e.g.:\n\nClient has been chasing about when calculations will be ready. We\'re waiting on them sending the architectural drawings. Need to politely explain the delay and ask for the drawings.' },
  { value: 'quote_followup', label: '📋 Quote Follow-up', placeholder: 'Quote ref and any context, e.g.:\n\nSent quote to ARX26021 Lee Griffiths 2 weeks ago for £1,800. Horn Hill Farm project. No response. Want to follow up politely.' },
  { value: 'site_query', label: '🏗️ Site Query Response', placeholder: 'Paste the contractor\'s query, e.g.:\n\nBuilder asking: "The RSJ you\'ve specified is 203x102x23 but the opening is only 2.1m, can we use a smaller section to save cost?"' },
  { value: 'meeting_notes', label: '📝 Meeting Notes → Actions', placeholder: 'Paste rough meeting notes, e.g.:\n\nMet client at site. Discussed removing chimney breast in living room. They want bifold doors at rear. Builder mentioned the existing lintel over kitchen window looks cracked. Agreed to do site visit next week.' },
  { value: 'payment_chase', label: '💷 Payment Chaser', placeholder: 'Invoice details, e.g.:\n\nARX26007 Barry, 15 Cleeve Lawns. Balance invoice of £2,400 sent 3 weeks ago. No payment or response. Second chase.' },
]

const SIGNATURE = `Best regards,

Effiom Esua
Director | BEng MSc
ARX Engineers Ltd
effiom@arxengineers.co.uk | www.arxengineers.co.uk
+44 (0)772 229 8882

Aim For Excellence
---
ARX Engineers Ltd | Registered in England & Wales
Company No. 16198467 | Registered Office: 183 Marksbury Road, Bristol, BS3 5LF`

export default function Comms() {
  const [commsType, setCommsType] = useState('email')
  const [recipientType, setRecipientType] = useState('homeowner')
  const [brief, setBrief] = useState('')
  const [output, setOutput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [apiKey] = useState(() => localStorage.getItem('arx_api_key') || '')
  const [history, setHistory] = useState([])

  const selectedType = COMMS_TYPES.find(t => t.value === commsType)
  const selectedRecipient = RECIPIENT_TYPES.find(r => r.value === recipientType)

  const buildPrompt = () => {
    const typeLabel = selectedType?.label || commsType
    const tone = selectedRecipient?.tone || ''

    let systemPrompt = `You are the AI assistant for ARX Engineers Ltd, a structural engineering consultancy in Bristol. Director: Effiom Esua, BEng MSc.

Tone for this recipient (${selectedRecipient?.label}): ${tone}

Always professional. Never corporate waffle. Be specific rather than generic. Never make up technical details not provided.

Sign off all emails with exactly this signature:
${SIGNATURE}`

    let userPrompt = ''

    if (commsType === 'email') {
      systemPrompt += '\n\nDraft a professional email based on the brief provided. Include a suitable subject line prefixed with "Subject:".'
      userPrompt = brief
    } else if (commsType === 'quote_followup') {
      systemPrompt += '\n\nDraft a polite, professional quote follow-up email. Include subject line prefixed with "Subject:". Keep it brief — 3-4 sentences max. Don\'t be pushy.'
      userPrompt = brief
    } else if (commsType === 'site_query') {
      systemPrompt += '\n\nProvide a clear, technically accurate response to this site query from a contractor. Be direct and practical. If more information is needed before answering definitively, say so clearly.'
      userPrompt = brief
    } else if (commsType === 'meeting_notes') {
      systemPrompt += '\n\nConvert these rough meeting notes into structured minutes with: 1) Summary (2-3 sentences), 2) Key decisions made, 3) Action items with owner (Effiom or Client). Keep it concise.'
      userPrompt = brief
    } else if (commsType === 'payment_chase') {
      systemPrompt += '\n\nDraft a firm but professional payment chaser email. Include subject line prefixed with "Subject:". Reference the Late Payment of Commercial Debts (Interest) Act 1998 if this is a second or third chase. Keep it professional, not aggressive.'
      userPrompt = brief
    }

    return { systemPrompt, userPrompt }
  }

  const handleGenerate = async () => {
    if (!brief.trim()) return setError('Please describe what you need')
    if (!apiKey) return setError('API key required — add it in Quote Generator tab')
    setGenerating(true)
    setError(null)
    setOutput('')

    const { systemPrompt, userPrompt } = buildPrompt()

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || 'API error')
      const text = data.content[0]?.text || ''
      setOutput(text)
      setHistory(prev => [{ type: commsType, recipient: recipientType, brief: brief.slice(0, 80), output: text, date: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)])
    } catch (e) {
      setError(`Failed: ${e.message}`)
    }
    setGenerating(false)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--purple-dark)' }}>Comms</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>AI-drafted emails, site responses, meeting notes and payment chasers</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Left: Input */}
        <div>
          {/* Type selector */}
          <div style={{ marginBottom: 16 }}>
            <label>What do you need?</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {COMMS_TYPES.map(t => (
                <button key={t.value}
                  onClick={() => { setCommsType(t.value); setBrief(''); setOutput('') }}
                  style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500,
                    background: commsType === t.value ? 'var(--purple)' : 'white',
                    color: commsType === t.value ? 'white' : 'var(--text-muted)',
                    border: `1px solid ${commsType === t.value ? 'var(--purple)' : 'var(--border)'}`,
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recipient type - only for email types */}
          {['email', 'quote_followup', 'payment_chase'].includes(commsType) && (
            <div style={{ marginBottom: 16 }}>
              <label>Recipient type</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {RECIPIENT_TYPES.map(r => (
                  <button key={r.value}
                    onClick={() => setRecipientType(r.value)}
                    style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                      background: recipientType === r.value ? 'var(--purple-bg)' : 'white',
                      color: recipientType === r.value ? 'var(--purple)' : 'var(--text-muted)',
                      border: `1px solid ${recipientType === r.value ? 'var(--purple)' : 'var(--border)'}`,
                    }}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Brief */}
          <div style={{ marginBottom: 16 }}>
            <label>Brief</label>
            <textarea
              value={brief}
              onChange={e => setBrief(e.target.value)}
              rows={10}
              placeholder={selectedType?.placeholder}
              style={{ resize: 'vertical' }}
            />
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#DC2626', marginBottom: 16, fontSize: 13 }}>
              {error}
            </div>
          )}

          <button className="btn-primary" style={{ width: '100%', padding: 12 }} onClick={handleGenerate} disabled={generating}>
            {generating ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Generating...</> : '⚡ Generate'}
          </button>
        </div>

        {/* Right: Output */}
        <div>
          {!output && !generating && (
            <div className="card empty-state" style={{ minHeight: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>✉️</div>
              <h3>Draft will appear here</h3>
              <p>Fill in the brief and click Generate</p>
            </div>
          )}

          {generating && (
            <div className="card" style={{ padding: 32, minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <div className="spinner" style={{ width: 32, height: 32 }} />
              <div style={{ color: 'var(--text-muted)' }}>Drafting...</div>
            </div>
          )}

          {output && (
            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--purple)' }}>
                  {selectedType?.label} · {selectedRecipient?.label}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-secondary btn-sm" onClick={handleGenerate}>↻ Regenerate</button>
                  <button className="btn-primary btn-sm" onClick={handleCopy}>
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              <div style={{
                whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7,
                background: '#fafafa', padding: 16, borderRadius: 8,
                border: '1px solid var(--border)', maxHeight: 600, overflowY: 'auto'
              }}>
                {output}
              </div>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Recent</div>
              {history.map((h, i) => (
                <div key={i} className="card" style={{ padding: '10px 14px', marginBottom: 6, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onClick={() => setOutput(h.output)}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{COMMS_TYPES.find(t => t.value === h.type)?.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{h.brief}...</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{h.date}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
