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

// ── Calc & drawing review agent ───────────────────────────────────────────────
app.post('/api/check-package', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' })

  const { calc, drawing } = req.body
  if (!calc && !drawing) return res.status(400).json({ error: 'No files provided' })

  const SYSTEM = `You are a senior structural engineer conducting a technical review for ARX Engineers Ltd, a Bristol-based structural engineering consultancy. Director: Effiom Esua BEng MSc.

Your role is equivalent to a second engineer peer review. You are reviewing Tedds for Word calculation packages and/or structural drawing packages produced by ARX Engineers.

ARX works to Eurocodes (EN 1990, EN 1991, EN 1993, EN 1995, EN 1996) and British Standards, primarily on residential projects: extensions, loft conversions, internal alterations, new builds.

CALCULATION REVIEW — check for:
1. Load take-downs: Are tributary widths and areas reasonable? Do loads trace logically from roof → floors → beams → columns → foundations?
2. Load values: Are dead loads reasonable for the construction type? (Timber floor ~0.5 kN/m², cavity wall ~4.5 kN/m², concrete tiles pitched roof ~1.4 kN/m²). Flag anything outside normal residential ranges.
3. Load combinations: Are EN 1990 combination factors correct? (1.35Gk + 1.5Qk for strength, with appropriate ψ factors for wind)
4. Code references: Is the correct code being applied for each element type? (EC3 for steel, EC5 for timber, EC6 for masonry)
5. Missing checks: Has bending AND shear AND deflection AND bearing been checked for every member? For steel: classification, LTB if applicable. For timber: service class, load duration, load sharing where claimed.
6. Deflection limits: Do the limits used in individual member checks match those stated on the cover page?
7. Member IDs: Do section sizes in conclusion lines match those in the drawing member schedule?
8. Bearing lengths: Are bearing lengths in calculations consistent with padstone sizes specified?
9. Units: Flag any apparent unit inconsistencies (kN vs kN/m, mm vs m)
10. Inspection items: Flag any members designed "by inspection" without calculation — are these reasonable given the spans and loads involved?
11. Service class: Is the correct service class used? (Exposed external = class 3, internal = class 1 or 2)
12. Material grades: Are the grades consistent throughout (S355 for steel, C24 for structural timber, grade stated for concrete)?

DRAWING REVIEW — check for:
1. Member schedule completeness: Is every member referenced on the plan (B-1, L-5, C-3 etc.) present in the member schedule with a full size specification?
2. Connection schedule completeness: Is every connection reference (CD-x) on the plan covered by either a schedule entry or a detail drawing?
3. Detail coverage: Are there any connection references that say "REFER TO CONSTRUCTION DETAIL SHEET x" where that detail is missing?
4. Padstone positions: Is a padstone specified at every point load bearing? Do padstone sizes (PS-1 through PS-4) seem appropriate for the beam sizes they support?
5. Bearing dimensions: Are steel beam bearings noted on the plan consistent with what the member schedule implies?
6. Timber members: Are floor joist directions clear? Are all trimmer and doubled joist positions shown?
7. Reinforcement: Do cover dimensions shown match the rebar spec table? Are lap lengths noted?
8. General notes consistency: Do material grades in the general notes match the material spec in the calculations?
9. Wall types: Are assumed wall widths (cavity wall widths etc.) consistent between foundation GA and floor GA?
10. Title block: Is the revision number, scale, and drawing reference complete on every sheet?

CROSS-REFERENCE (when both calc and drawing provided):
- Do section sizes in calc conclusion lines match the drawing member schedule?
- Do design spans in calculations match scaled/dimensioned spans on drawings?
- Do bearing lengths assumed in calcs match padstone specifications on drawings?
- Are all calculated members shown on the drawings? Are there members on drawings that appear undesigned?

SEVERITY CLASSIFICATION:
- critical: Would likely cause structural failure or non-compliance with Building Regulations if unresolved
- major: Significant error or omission requiring correction before issue
- minor: Small inconsistency or sub-optimal approach — should be corrected but not critical
- query: Clarification needed — could be intentional but requires confirmation
- pass: Explicit confirmation that a check has been performed and passed correctly

Respond ONLY with valid JSON — no preamble, no markdown:
{
  "projectRef": "string or null",
  "projectTitle": "string or null", 
  "calcBy": "string or null",
  "summary": "2-3 sentence overall assessment of the package quality and main issues",
  "comments": [
    {
      "severity": "critical|major|minor|query|pass",
      "member": "member ID or null e.g. FJ-1, B-3, L-5",
      "clause": "code clause or null e.g. EN1995-1-1 cl.6.1.6",
      "title": "concise issue title under 15 words",
      "detail": "full explanation of the issue with specific values where possible",
      "recommendation": "what action to take, or null if pass"
    }
  ]
}`

  try {
    // ── Build message content ─────────────────────────────────────────────────
    const content = []

    // Calc file
    if (calc) {
      if (calc.type === 'docx') {
        // Extract text from docx via mammoth
        const buffer = Buffer.from(calc.data, 'base64')
        const extracted = await mammoth.extractRawText({ buffer })
        content.push({
          type: 'text',
          text: `CALCULATION PACKAGE — ${calc.filename}\n\n${extracted.value.slice(0, 80000)}` // ~60k tokens limit
        })
      } else if (calc.type === 'images') {
        content.push({ type: 'text', text: `CALCULATION PACKAGE — ${calc.filename} (${calc.pages.length} pages):` })
        // Send up to 15 calc pages to avoid token limits
        const pagesToSend = calc.pages.slice(0, 15)
        for (const page of pagesToSend) {
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: page.data }
          })
        }
        if (calc.pages.length > 15) {
          content.push({ type: 'text', text: `[Note: ${calc.pages.length - 15} additional calculation pages not shown due to size limits]` })
        }
      }
    }

    // Drawing file
    if (drawing) {
      content.push({ type: 'text', text: `\nSTRUCTURAL DRAWINGS — ${drawing.filename} (${drawing.pages.length} pages):` })
      const pagesToSend = drawing.pages.slice(0, 12)
      for (const page of pagesToSend) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: page.data }
        })
      }
      if (drawing.pages.length > 12) {
        content.push({ type: 'text', text: `[Note: ${drawing.pages.length - 12} additional drawing pages not shown due to size limits]` })
      }
    }

    content.push({
      type: 'text',
      text: calc && drawing
        ? 'Please review the calculation package and drawings together. Cross-reference member IDs, section sizes, spans, and bearing lengths between the two. Return the JSON review.'
        : calc
        ? 'Please review this calculation package. Return the JSON review.'
        : 'Please review these structural drawings. Return the JSON review.'
    })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        system: SYSTEM,
        messages: [{ role: 'user', content }],
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
      parsed = {
        projectRef: null, projectTitle: null, calcBy: null,
        summary: 'Review completed but response could not be parsed. Raw output may contain useful information.',
        comments: [{ severity: 'query', member: null, clause: null, title: 'Parse error — see server logs', detail: rawText.slice(0, 500), recommendation: 'Contact support' }]
      }
    }

    res.json(parsed)
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
