import express from 'express'
import cors from 'cors'
import { createServer } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import mammoth from 'mammoth'
import PDFDocument from 'pdfkit'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 4173
const isProd = process.env.NODE_ENV === 'production'

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// ── Anthropic proxy ──────────────────────────────────────────────
app.post('/api/claude', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'API key not configured on server' })

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    })
    const data = await response.json()
    res.status(response.status).json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Drawing analyser ─────────────────────────────────────────────
app.post('/api/analyse-drawings', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'API key not configured on server' })

  const { images, pageLabel } = req.body
  if (!images || !images.length) return res.status(400).json({ error: 'No images provided' })

  const SYSTEM_PROMPT = `You are an experienced structural engineer reviewing architectural drawings for ARX Engineers Ltd.
Your task is to identify and categorise ALL structural elements visible in the drawing.

Categorise each element into exactly one of these four groups:
- existing: Elements clearly shown as existing structure (solid lines, labelled "existing", hatched as existing)
- proposed: New elements to be designed or constructed (dashed lines, "new" labels, shown as additions, cloud markups)
- remove: Elements to be demolished, removed or altered (shown with X marks, "remove" notation, or strike-through)
- retain: Existing elements being kept but modified (labelled "retain", "keep", or shown with amendment marks)

For each element give a concise structural description using clear engineering language. Examples:
- "Existing 225mm solid brick party wall — full height"
- "Proposed steel beam over rear opening (size TBC)"
- "Existing flat roof structure to be removed"
- "Retain existing ground floor slab"

Flag any coordination issues, ambiguities, or items needing engineer attention in the notes array.

Respond ONLY with valid JSON — no preamble, no markdown fences:
{"existing":[],"proposed":[],"remove":[],"retain":[],"notes":[]}`

  try {
    const messageContent = [
      ...images.map(img => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType || 'image/jpeg', data: img.data }
      })),
      { type: 'text', text: `Analyse this drawing (${pageLabel || 'Page'}) and return the element schedule JSON.` }
    ]

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: messageContent }],
      }),
    })

    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'Claude API error' })

    const rawText = data.content?.[0]?.text || ''
    let parsed
    try {
      const clean = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const jsonStart = clean.indexOf('{')
      const jsonEnd = clean.lastIndexOf('}')
      parsed = JSON.parse(clean.slice(jsonStart, jsonEnd + 1))
    } catch {
      parsed = { existing: [], proposed: [], remove: [], retain: [], notes: [`Parse error — raw: ${rawText.slice(0, 200)}`] }
    }
    res.json(parsed)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
// ─── /api/check-package ──────────────────────────────────────────────────────
// Add these endpoints to server.js alongside existing /api/claude and /api/analyse-drawings

// ── Calc & drawing review agent (multi-pass) ──────────────────────────────────
app.post('/api/check-package', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' })

  const { calc, drawing } = req.body
  if (!calc && !drawing) return res.status(400).json({ error: 'No files provided' })

  // ── ARX standard values baked in for calibration ──────────────────────────
  const ARX_STANDARDS = `
ARX ENGINEERS — STANDARD DESIGN VALUES (use these to calibrate your review):

DEFLECTION LIMITS (from ARX cover page template):
- Timber final deflection (1.6Gk + Qk): Span/250, max 14mm
- Timber instantaneous deflection (Gk + Qk): Span/360, max 14mm
- Steel imposed load over brittle finishes: Span/500, max 10mm
- Steel imposed load non-brittle: Span/360, max 15mm
- Steel total (DL + IL): Span/360, max 25mm
- Wind horizontal (brittle): Height/500
- Wind horizontal (non-brittle): Height/300
- Steel vertical fundamental frequency: minimum 4.5 Hz

STANDARD LOAD VALUES:
- Timber floor (with partitions): DL = 0.50 kN/m², IL = 1.50 kN/m², partition = 0.50 kN/m²
- Flat roof (timber, non-accessible): DL = 0.60 kN/m², IL = 0.60 kN/m²
- Cold pitched roof (concrete tiles, storage): DL = 1.45 kN/m², IL = 0.75 kN/m²
- Cavity wall (existing): DL = 4.50 kN/m²
- Cavity wall (new): DL = 4.70 kN/m²

MATERIAL GRADES:
- Steel: S355
- Structural timber joists/beams: C24
- Structural timber studs: C16
- Reinforced concrete: C28/35 (cover page) or C32/35 (rebar spec)
- Mass concrete foundations: Gen 3
- RC ground bearing slab: Gen 3

LOAD COMBINATIONS (EN 1990):
- ULS strength: 1.35Gk + 1.5Qk (+ 0.75×1.5Wk when wind included)
- SLS service: 1.0Gk + 1.0Qk (+ 0.5Wk when wind included)
- ULS wind dominant: 1.35Gk + 1.05Qk + 1.5Wk

MINIMUM BEARINGS:
- Steel beam on masonry: 150mm minimum (full leaf width if no bearing detail shown)
- Timber joist on masonry: 100mm minimum
- Timber joist on steel: 75mm minimum`

  const MEMBER_REVIEW_SYSTEM = `You are a senior structural engineer conducting a peer review for ARX Engineers Ltd. Director: Effiom Esua BEng MSc. You are reviewing individual member calculations from a Tedds for Word calculation package.

${ARX_STANDARDS}

For each member calculation provided, check:
1. LOADS: Are load inputs consistent with the ARX standard values above? Flag any that differ significantly without explanation.
2. LOAD COMBINATIONS: Are EN 1990 combination factors correct?
3. CHECKS COMPLETENESS: Has bending AND shear AND deflection AND bearing all been checked? Flag any missing.
4. DEFLECTION LIMITS: Do the limits used match ARX standards above exactly?
5. PASS/FAIL: Are all checks passing? If a check is close to the limit (utilisation > 0.85) flag as a query.
6. SERVICE CLASS: Is the correct timber service class used?
7. INSPECTION ITEMS: If a member is "designed by inspection", is this reasonable for the span and load?
8. MATERIAL GRADE: Is the correct grade used (S355 steel, C24 timber)?
9. BEARING LENGTHS: Are bearing lengths stated and do they meet minimums?
10. UNITS: Are there any apparent unit errors?

Return ONLY valid JSON, no markdown fences:
{"comments": [{"severity": "critical|major|minor|query|pass", "member": "member ID", "clause": "code clause or null", "title": "concise title", "detail": "specific detail with values", "recommendation": "action or null"}]}`

  const DRAWING_REVIEW_SYSTEM = `You are a senior structural engineer reviewing structural drawings for ARX Engineers Ltd.

${ARX_STANDARDS}

Review the drawings for:
1. MEMBER SCHEDULE: Is every member shown on the plan (B-1, L-5, C-3 etc.) in the member schedule with a full specification?
2. CONNECTIONS: Is every connection reference (CD-x) on the plan covered by a schedule entry or detail?
3. PADSTONES: Is a padstone specified at every point load bearing? Are sizes appropriate?
4. BEARING DIMENSIONS: Are steel beam bearings shown and do they meet 150mm minimum?
5. TIMBER: Are joist directions clear? Are trimmers and doubled joists shown at all openings?
6. NOTES CONSISTENCY: Do material grades in general notes match ARX standards?
7. TITLE BLOCK: Is revision, scale, drawing reference complete on every sheet?
8. WALL DIMENSIONS: Are assumed cavity wall widths consistent throughout?

Return ONLY valid JSON, no markdown fences:
{"comments": [{"severity": "critical|major|minor|query|pass", "member": "member ID or null", "clause": "code clause or null", "title": "concise title", "detail": "specific detail", "recommendation": "action or null"}]}`

  const SYNTHESIS_SYSTEM = `You are a senior structural engineer writing a final review summary for ARX Engineers Ltd.

You have been given the results of a multi-pass review of a structural calculation package and drawings. Synthesise these findings into:
1. A 3-4 sentence overall summary of package quality
2. Any cross-reference issues between calcs and drawings (member IDs, section sizes, spans, bearings)
3. Identify the project ref, title, and calc author from the cover page text provided

Return ONLY valid JSON, no markdown fences:
{"projectRef": "string or null", "projectTitle": "string or null", "calcBy": "string or null", "summary": "3-4 sentence summary"}`

  // ── Helper: single Claude call ─────────────────────────────────────────────
  async function claudeCall(system, content, maxTokens = 4000) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content }],
      }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error?.message || 'Claude API error')
    return data.content?.[0]?.text || ''
  }

  // ── Helper: parse JSON safely ──────────────────────────────────────────────
  function safeParseJSON(text, fallback) {
    try {
      const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const start = clean.indexOf('{')
      const end = clean.lastIndexOf('}')
      if (start === -1 || end === -1) return fallback
      return JSON.parse(clean.slice(start, end + 1))
    } catch {
      return fallback
    }
  }

  // ── Helper: split calc text by member ─────────────────────────────────────
  function splitByMember(text) {
    // Split on lines that look like member headings (all caps, short, followed by content)
    // Patterns: "BEAM B-1", "LINTEL L-5", "FLOOR JOIST FJ-1", "COLUMN C-3", etc.
    const memberPattern = /\n(?=(BEAM|LINTEL|FLOOR JOIST|ROOF JOIST|CEILING JOIST|COLUMN|POST|TRUSS|RAFTER|FOUNDATION|RAFT|SLAB|WALL|MASONRY|PADSTONE|STAIRCASE|TRIMMER|RIDGE|PURLIN|WINDPOST)[^\n]{0,30}\n)/gi
    
    const parts = text.split(memberPattern)
    
    // Group into chunks of reasonable size (~15000 chars each)
    const chunks = []
    let current = ''
    
    for (const part of parts) {
      if (!part) continue
      if (current.length + part.length > 15000 && current.length > 0) {
        chunks.push(current.trim())
        current = part
      } else {
        current += '\n' + part
      }
    }
    if (current.trim()) chunks.push(current.trim())
    
    // Always include first chunk (cover page + loading) regardless
    return chunks.length > 0 ? chunks : [text.slice(0, 15000)]
  }

  try {
    const allComments = []
    let coverText = ''

    // ── PASS 1: Calculation review (chunked by member) ──────────────────────
    if (calc) {
      let calcText = ''

      if (calc.type === 'docx') {
        const buffer = Buffer.from(calc.data, 'base64')
        const extracted = await mammoth.extractRawText({ buffer })
        calcText = extracted.value
        console.log(`Calc text extracted: ${calcText.length} chars, ~${Math.round(calcText.length/500)} pages`)
      } else if (calc.type === 'images') {
        // For PDF calcs, still use image approach but process all pages in groups
        const pageGroups = []
        for (let i = 0; i < calc.pages.length; i += 8) {
          pageGroups.push(calc.pages.slice(i, i + 8))
        }
        for (let g = 0; g < pageGroups.length; g++) {
          const group = pageGroups[g]
          const content = [
            { type: 'text', text: `Calculation pages ${g*8+1}–${g*8+group.length} of ${calc.pages.length} from ${calc.filename}:` },
            ...group.map(p => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.data } })),
            { type: 'text', text: 'Review these calculation pages. Return JSON with comments array.' }
          ]
          const raw = await claudeCall(MEMBER_REVIEW_SYSTEM, content, 3000)
          const result = safeParseJSON(raw, { comments: [] })
          allComments.push(...(result.comments || []))
        }
      }

      // For docx: split and review each chunk
      if (calcText) {
        coverText = calcText.slice(0, 3000) // save cover for synthesis
        const chunks = splitByMember(calcText)
        console.log(`Split into ${chunks.length} chunks for review`)

        // Review chunks in parallel (max 5 at a time to avoid rate limits)
        const batchSize = 5
        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize)
          const batchResults = await Promise.all(batch.map(async (chunk, idx) => {
            const content = `CALCULATION CHUNK ${i + idx + 1} of ${chunks.length} from ${calc.filename}:\n\n${chunk}\n\nReview this section. Return JSON with comments array.`
            const raw = await claudeCall(MEMBER_REVIEW_SYSTEM, content, 3000)
            return safeParseJSON(raw, { comments: [] })
          }))
          for (const result of batchResults) {
            allComments.push(...(result.comments || []))
          }
        }
      }
    }

    // ── PASS 2: Drawing review ───────────────────────────────────────────────
    if (drawing) {
      // Process all drawing pages in groups of 6
      const pageGroups = []
      for (let i = 0; i < drawing.pages.length; i += 6) {
        pageGroups.push(drawing.pages.slice(i, i + 6))
      }

      const drawingResults = await Promise.all(pageGroups.map(async (group, g) => {
        const content = [
          { type: 'text', text: `Drawing sheets ${g*6+1}–${g*6+group.length} of ${drawing.pages.length} from ${drawing.filename}:` },
          ...group.map(p => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.data } })),
          { type: 'text', text: 'Review these drawing sheets. Return JSON with comments array.' }
        ]
        const raw = await claudeCall(DRAWING_REVIEW_SYSTEM, content, 3000)
        return safeParseJSON(raw, { comments: [] })
      }))

      for (const result of drawingResults) {
        allComments.push(...(result.comments || []))
      }
    }

    // ── PASS 3: Synthesis ────────────────────────────────────────────────────
    const synthContent = `
Cover page / project info:
${coverText || 'Not available'}

Total comments raised across all review passes: ${allComments.length}
Critical: ${allComments.filter(c => c.severity === 'critical').length}
Major: ${allComments.filter(c => c.severity === 'major').length}
Minor: ${allComments.filter(c => c.severity === 'minor').length}
Query: ${allComments.filter(c => c.severity === 'query').length}
Pass: ${allComments.filter(c => c.severity === 'pass').length}

Sample of findings:
${allComments.slice(0, 10).map(c => `[${c.severity.toUpperCase()}] ${c.member || ''} — ${c.title}`).join('\n')}

Please extract the project ref, title, calc author, and write a synthesis summary. Return JSON.`

    const synthRaw = await claudeCall(SYNTHESIS_SYSTEM, synthContent, 1000)
    const synthesis = safeParseJSON(synthRaw, {
      projectRef: null, projectTitle: null, calcBy: null,
      summary: `Review complete. ${allComments.length} item(s) identified across ${calc ? 'calculations' : ''}${calc && drawing ? ' and ' : ''}${drawing ? 'drawings' : ''}.`
    })

    // ── Deduplicate comments ─────────────────────────────────────────────────
    const seen = new Set()
    const deduped = allComments.filter(c => {
      const key = `${c.member}|${c.title}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    res.json({
      projectRef: synthesis.projectRef,
      projectTitle: synthesis.projectTitle,
      calcBy: synthesis.calcBy,
      summary: synthesis.summary,
      comments: deduped,
    })

  } catch (err) {
    console.error('/api/check-package error:', err)
    res.status(500).json({ error: err.message })
  }
})


// ── PDF report generator ───────────────────────────────────────────────────────
app.post('/api/check-package/report', async (req, res) => {
  const { results, calcFilename, drawingFilename } = req.body
  if (!results) return res.status(400).json({ error: 'No results provided' })

  try {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks = []
    doc.on('data', c => chunks.push(c))

    const PURPLE_HEX = '#5B2D8E'
    const GREY = '#888888'
    const SEV_COLORS = {
      critical: '#DC2626', major: '#EA580C', minor: '#D97706',
      query: '#2563EB', pass: '#16A34A'
    }

    // ── Header ───────────────────────────────────────────────────────────────
    doc.fontSize(20).fillColor(PURPLE_HEX).font('Helvetica-Bold')
      .text('ARX Engineers Ltd', 50, 50, { align: 'right' })
    doc.fontSize(9).fillColor(GREY).font('Helvetica')
      .text('Structural Review Note', { align: 'right' })

    doc.moveTo(50, 95).lineTo(545, 95).strokeColor(PURPLE_HEX).lineWidth(1.5).stroke()

    doc.fontSize(16).fillColor(PURPLE_HEX).font('Helvetica-Bold').moveDown(0.5)
      .text('STRUCTURAL CALCULATION & DRAWING REVIEW')
    doc.fontSize(10).fillColor('#374151').font('Helvetica').moveDown(0.3)

    if (results.projectRef || results.projectTitle) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1A1A1A')
        .text(`${results.projectRef || ''} ${results.projectTitle || ''}`.trim())
    }

    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    doc.fontSize(9).fillColor(GREY).font('Helvetica')
      .text(`Review date: ${dateStr}`)

    if (calcFilename) doc.text(`Calculations: ${calcFilename}`)
    if (drawingFilename) doc.text(`Drawings: ${drawingFilename}`)
    if (results.calcBy) doc.text(`Prepared by: ${results.calcBy}`)

    doc.moveDown(0.5)
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#CCCCCC').lineWidth(0.5).stroke()
    doc.moveDown(0.5)

    // ── Summary ──────────────────────────────────────────────────────────────
    doc.fontSize(11).font('Helvetica-Bold').fillColor(PURPLE_HEX).text('REVIEW SUMMARY')
    doc.moveDown(0.3)
    doc.fontSize(10).font('Helvetica').fillColor('#374151').text(results.summary || 'See comments below.', { width: 495 })
    doc.moveDown(0.5)

    // ── Stats ────────────────────────────────────────────────────────────────
    const comments = results.comments || []
    const counts = { critical: 0, major: 0, minor: 0, query: 0, pass: 0 }
    comments.forEach(c => { if (counts[c.severity] !== undefined) counts[c.severity]++ })

    doc.fontSize(11).font('Helvetica-Bold').fillColor(PURPLE_HEX).text('SUMMARY OF FINDINGS')
    doc.moveDown(0.3)

    const sevLabels = { critical: 'Critical', major: 'Major', minor: 'Minor', query: 'Query', pass: 'Pass' }
    Object.entries(counts).forEach(([k, v]) => {
      if (v > 0) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor(SEV_COLORS[k])
          .text(`${sevLabels[k]}: `, { continued: true })
        doc.font('Helvetica').fillColor('#374151').text(`${v} item${v !== 1 ? 's' : ''}`)
      }
    })
    doc.moveDown(0.5)
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#CCCCCC').lineWidth(0.5).stroke()
    doc.moveDown(0.5)

    // ── Comments ─────────────────────────────────────────────────────────────
    doc.fontSize(11).font('Helvetica-Bold').fillColor(PURPLE_HEX).text('DETAILED COMMENTS')
    doc.moveDown(0.3)

    const sevOrder = ['critical', 'major', 'minor', 'query', 'pass']
    const sorted = [...comments].sort((a, b) =>
      sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity)
    )

    sorted.forEach((c, i) => {
      if (doc.y > 720) doc.addPage()

      const color = SEV_COLORS[c.severity] || '#374151'
      const label = sevLabels[c.severity] || c.severity

      // Comment number + severity
      doc.fontSize(9).font('Helvetica-Bold').fillColor(color)
        .text(`[${label.toUpperCase()}]`, { continued: true })
      if (c.member) {
        doc.fillColor(PURPLE_HEX).text(` ${c.member}`, { continued: true })
      }
      if (c.clause) {
        doc.fillColor(GREY).font('Helvetica').text(` — ${c.clause}`, { continued: true })
      }
      doc.text('')

      // Title
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#1A1A1A').text(c.title, { width: 495 })
      doc.moveDown(0.2)

      // Detail
      doc.fontSize(9).font('Helvetica').fillColor('#374151').text(c.detail, { width: 495 })

      // Recommendation
      if (c.recommendation) {
        doc.moveDown(0.2)
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151')
          .text('Recommendation: ', { continued: true })
        doc.font('Helvetica').text(c.recommendation, { width: 440 })
      }

      doc.moveDown(0.4)
      if (i < sorted.length - 1) {
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#E5E7EB').lineWidth(0.3).stroke()
        doc.moveDown(0.3)
      }
    })

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.moveDown(1)
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#CCCCCC').lineWidth(0.5).stroke()
    doc.moveDown(0.3)
    doc.fontSize(8).fillColor(GREY).font('Helvetica')
      .text(
        'This review note has been generated with AI assistance and reviewed by ARX Engineers Ltd. ' +
        'It is intended as an internal quality check and does not replace the engineer\'s professional judgement. ' +
        'ARX Engineers Ltd | Company No. 16198467 | www.arxengineers.co.uk',
        { width: 495, align: 'center' }
      )

    doc.end()

    await new Promise(resolve => doc.on('end', resolve))

    const pdfBuffer = Buffer.concat(chunks)
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${results.projectRef || 'ARX'} - Structural Review Note.pdf"`,
      'Content-Length': pdfBuffer.length,
    })
    res.send(pdfBuffer)

  } catch (err) {
    console.error('/api/check-package/report error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Serve built frontend in production ──────────────────────────
if (isProd) {
  const distPath = path.join(__dirname, 'dist')
  app.use(express.static(distPath))
  app.get('*splat', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ARX server running on port ${PORT}`)
})
