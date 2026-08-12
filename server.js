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
app.use(express.json({ limit: '50mb' }))

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

// In-memory job store — POST returns jobId immediately, client polls for status.
// Avoids Railway edge / browser timeouts on long-running (2–3 min) reviews.
const reviewJobs = new Map()

// Cleanup old jobs every 10 min — remove anything older than 1 hour
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000
  for (const [id, job] of reviewJobs) {
    if (job.createdAt < cutoff) reviewJobs.delete(id)
  }
}, 10 * 60 * 1000)

// GET status of an in-flight or completed review job
app.get('/api/check-package/status/:jobId', (req, res) => {
  const job = reviewJobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ status: 'not_found' })
  res.json({
    status: job.status,       // 'pending' | 'complete' | 'error'
    progress: job.progress,   // human-readable progress message
    result: job.result,       // set when status='complete'
    error: job.error,         // set when status='error'
  })
})

// ── Calc & drawing review agent (multi-pass) ──────────────────────────────────
app.post('/api/check-package', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' })

  const { calc, drawing } = req.body
  if (!calc && !drawing) return res.status(400).json({ error: 'No files provided' })

  // Create job and kick off work in background (fire-and-forget)
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  reviewJobs.set(jobId, {
    status: 'pending',
    progress: 'Starting review…',
    createdAt: Date.now(),
    result: null,
    error: null,
  })

  // Debug: log what arrived
  console.log(`check-package received [${jobId}] — calc: ${calc ? calc.type + ' ' + calc.filename : 'none'}, drawing: ${drawing ? drawing.filename + ' pages:' + drawing.pages?.length + ' textLen:' + (drawing.textContent?.length || 0) : 'none'}`)

  // Respond IMMEDIATELY with jobId
  res.json({ jobId })

  // Now do the work in background
  runReviewJob(jobId, apiKey, calc, drawing).catch(err => {
    console.error(`[${jobId}] Unhandled error:`, err)
    const job = reviewJobs.get(jobId)
    if (job) {
      job.status = 'error'
      job.error = err.message || 'Unknown error'
    }
  })
})

// Helper to update job progress from anywhere inside runReviewJob
function updateJobProgress(jobId, msg) {
  const job = reviewJobs.get(jobId)
  if (job && job.status === 'pending') {
    job.progress = msg
    console.log(`[${jobId}] ${msg}`)
  }
}

// The actual review work — extracted so it can run in the background
async function runReviewJob(jobId, apiKey, calc, drawing) {

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

IMPORTANT: For every member referenced on the drawings (B-1, L-5, C-3, FJ-1 etc.), use that exact reference ID in the "member" field of your comments. This allows exact cross-referencing with the calculation package.
When you see a member schedule entry like "B-1: 178x102x19 UB STEEL BEAM", create a pass comment with member="B-1" and detail stating the scheduled size. This builds the drawing member list for cross-referencing.

Return ONLY valid JSON, no markdown fences:
{"comments": [{"severity": "critical|major|minor|query|pass", "member": "exact member ID e.g. B-1 or null", "clause": "code clause or null", "title": "concise title", "detail": "specific detail including scheduled size where relevant", "recommendation": "action or null"}]}`

  const SYNTHESIS_SYSTEM = `You are a senior structural engineer writing a final review summary for ARX Engineers Ltd.
Extract the project reference number (e.g. ARX26059), project title, and calc author from the cover page text.
Write a 3-4 sentence overall assessment of the package quality, main issues found, and overall recommendation.
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

  // ── Helper: extract sections from mammoth HTML using heading tags ────────────
// ── Helper: extract sections from a docx by heading detection ──────────────
// Two-strategy approach for Tedds calc packages:
//   1. Mammoth with an expanded style map that also covers likely Tedds style names
//   2. Regex on raw text keyed off known Tedds/ARX section-header patterns
// Whichever finds more sections (≥ 3) wins. Regex wins ties — it's more reliable
// on Tedds output. If both come up short, fall back to splitByTextPattern.
async function splitDocxByHeadings(base64Data) {
  const buffer = Buffer.from(base64Data, 'base64')

  // Strategy 1: mammoth with expanded style map
const styleMap = [
    // Built-in Word styles
    "p[style-name='Heading 1'] => h1:fresh",
    "p[style-name='Heading 2'] => h2:fresh",
    "p[style-name='Heading 3'] => h3:fresh",
    "p[style-name='heading 1'] => h1:fresh",
    "p[style-name='heading 2'] => h2:fresh",
    "p[style-name='heading 3'] => h3:fresh",
    // Confirmed Tedds paragraph styles — verified from ARX26060 Deploy Logs, 12 Aug 2026
    "p[style-name='Calcreference'] => h1:fresh",
    "p[style-name='Calc Title'] => h1:fresh",
]

  const htmlResult = await mammoth.convertToHtml({ buffer }, { styleMap })
  const html = htmlResult.value
  const textResult = await mammoth.extractRawText({ buffer })
  const fullText = textResult.value

  // Diagnostic: log unmapped styles mammoth encountered — reveals the real Tedds style name
  if (htmlResult.messages?.length) {
    const styleWarnings = htmlResult.messages
      .filter(m => m.type === 'warning' && /style/i.test(m.message))
      .slice(0, 10)
      .map(m => m.message)
    if (styleWarnings.length) {
      console.log('Unmapped styles seen by mammoth (first 10):', styleWarnings)
    }
  }

  // Strategy 1 result: headings from HTML output
  const headingPattern = /<h[1-4][^>]*>(.*?)<\/h[1-4]>/gi
  const htmlHeadings = []
  let match
  while ((match = headingPattern.exec(html)) !== null) {
    const headingText = match[1].replace(/<[^>]+>/g, '').trim()
    if (headingText) htmlHeadings.push(headingText)
  }
  console.log(`Style-map strategy found ${htmlHeadings.length} headings`)

  // Strategy 2: regex on raw text keyed on Tedds/ARX section-header patterns
  const TEDDS_HEADING_RE_GLOBAL = new RegExp([
    // Member type + ref: BEAM B-1, LINTEL L-2, COLUMN C-1, POST P-1, RAFTER R-1
    '^(BEAM|LINTEL|COLUMN|POST|RAFTER|JOIST|WALL|SLAB|PLATE|PIER|STUD|TIE)\\s+[A-Z]+-?\\d+.*$',
    // Frame sections: FRAME 1: BEAM B-3 & COLUMN C-1
    '^FRAME\\s+\\d+\\s*[:.].*$',
    // Bearings: B-1 BEARINGS, L-1 BEARINGS
    '^[A-Z]+-?\\d+\\s+BEARINGS.*$',
    // Named engineering sections
    '^(SKETCH FLOOR PLANS|DESIGN LOADINGS|LOADING SUMMARY|MASONRY SIDE PANEL|MASONRY WALL PANEL)$',
    '^(PAD FOUNDATION|TRENCH FILL FOUNDATION|STRIP FOUNDATION)$',
    '^(STEEL MASONRY SUPPORT|STEEL COLUMN|STEEL BEAM|STEEL CONNECTION)$',
    '^(MOMENT CONNECTION|BEAM SPLICE|BASE PLATE|WELDED CONNECTION|BOLTED CONNECTION)$',
    '^(LATERAL RESTRAINT|BUCKLING CHECK|SHEAR CHECK|DEFLECTION CHECK|POST DESIGN)$',
    // Cover-page keys: CLIENT: TBC, DESCRIPTION: ..., BRIEF: ...
    '^(CLIENT|DESCRIPTION|BRIEF|PROJECT|JOB|SECTION)\\s*[:\\-].*$',
  ].join('|'), 'gm')

  const regexHeadings = []
  let m
  while ((m = TEDDS_HEADING_RE_GLOBAL.exec(fullText)) !== null) {
    regexHeadings.push({ text: m[0].trim(), index: m.index })
  }
  console.log(`Regex strategy found ${regexHeadings.length} headings — first 20:`,
    regexHeadings.slice(0, 20).map(h => h.text))

  // Choose strategy: regex wins if it found ≥ style-map AND ≥ 3. Style-map second. Fallback third.
  let sections = []

  if (regexHeadings.length >= Math.max(htmlHeadings.length, 3)) {
    console.log(`Using REGEX strategy (${regexHeadings.length} headings)`)
    for (let i = 0; i < regexHeadings.length; i++) {
      const start = regexHeadings[i].index
      const end = i + 1 < regexHeadings.length ? regexHeadings[i + 1].index : fullText.length
      const section = fullText.slice(start, end).trim()
      if (section.length > 50) sections.push(section)
    }
  } else if (htmlHeadings.length >= 3) {
    console.log(`Using STYLE-MAP strategy (${htmlHeadings.length} headings)`)
    let cursor = 0
    for (let i = 0; i < htmlHeadings.length; i++) {
      const heading = htmlHeadings[i]
      const nextHeading = htmlHeadings[i + 1]
      const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const headingIdx = fullText.slice(cursor).search(new RegExp(escaped, 'i'))
      if (headingIdx === -1) continue
      const absStart = cursor + headingIdx
      let absEnd = fullText.length
      if (nextHeading) {
        const nextEscaped = nextHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const nextIdx = fullText.slice(absStart + heading.length).search(new RegExp(nextEscaped, 'i'))
        if (nextIdx !== -1) absEnd = absStart + heading.length + nextIdx
      }
      const section = fullText.slice(absStart, absEnd).trim()
      if (section.length > 50) sections.push(section)
      cursor = absEnd
    }
  } else {
    console.log('Both strategies weak — falling back to text-pattern splitter')
    return splitByTextPattern(fullText)
  }

  // Group small consecutive sections into ~12k-char batches for Claude context budget
  const grouped = []
  let current = ''
  for (const section of sections) {
    if (current.length + section.length > 12000 && current.length > 0) {
      grouped.push(current.trim())
      current = section
    } else {
      current += (current ? '\n\n' : '') + section
    }
  }
  if (current.trim()) grouped.push(current.trim())

  console.log(`Split into ${sections.length} sections, grouped into ${grouped.length} batches`)
  return grouped.length > 0 ? grouped : [fullText.slice(0, 15000)]
}

  // ── Fallback: text pattern splitter (for non-headed documents) ─────────────
  function splitByTextPattern(text) {
    // Match ALL-CAPS lines of 3-60 chars that look like section headings
    const parts = text.split(/\n(?=[A-Z][A-Z\s\-:/()0-9]{2,59}\n)/)
    const chunks = []
    let current = ''
    for (const part of parts) {
      if (!part) continue
      if (current.length + part.length > 12000 && current.length > 0) {
        chunks.push(current.trim())
        current = part
      } else {
        current += '\n' + part
      }
    }
    if (current.trim()) chunks.push(current.trim())
    return chunks.length > 0 ? chunks : [text.slice(0, 15000)]
  }

  try {
    const allComments = []
    let coverText = ''
    let calcHeadingChunks = null

    // ── PASS 1: Calculation review (chunked by member) ──────────────────────
    if (calc) {
      let calcText = ''

      if (calc.type === 'docx') {
        const buffer = Buffer.from(calc.data, 'base64')
        const extracted = await mammoth.extractRawText({ buffer })
        calcText = extracted.value
        console.log(`Calc text extracted: ${calcText.length} chars, ~${Math.round(calcText.length/500)} pages`)
        updateJobProgress(jobId, `Calc extracted (${Math.round(calcText.length/500)} pages) — analysing…`)
        // Override with heading-aware split
        calcText = '__USE_HEADING_SPLIT__'
        calcHeadingChunks = await splitDocxByHeadings(calc.data)
        console.log(`Heading-split into ${calcHeadingChunks.length} sections`)
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

      // For docx: use heading-aware chunks
      const chunks = calcHeadingChunks || (calcText ? splitByTextPattern(calcText) : [])
      if (chunks.length > 0) {
        coverText = chunks[0].slice(0, 3000) // cover page is first chunk
        console.log(`Reviewing ${chunks.length} sections`)
        updateJobProgress(jobId, `Reviewing ${chunks.length} calc sections…`)

        const batchSize = 5
        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize)
          const batchResults = await Promise.all(batch.map(async (chunk, idx) => {
            const content = `CALCULATION SECTION ${i + idx + 1} of ${chunks.length} from ${calc.filename}:\n\n${chunk}\n\nReview this section. Return JSON with comments array.`
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
      // Step 2a: If we have extracted text, use it for member schedule extraction first
      if (drawing.textContent && drawing.textContent.trim()) {
        // Diagnostic: dump first slice of drawing text so we can see what actually arrived
        console.log('── DRAWING TEXT PREVIEW (first 2500 chars) ──')
        console.log(drawing.textContent.slice(0, 2500))
        console.log('── END PREVIEW ──')

        const SCHEDULE_EXTRACT_SYSTEM = `You are reviewing structural drawing text extracted from an ARX Engineers Ltd drawing package.

The text was extracted from a Bluebeam-marked PDF via PDF.js annotation extraction, so it may be FRAGMENTED — individual text boxes come out separately and NOT in reading order. You may see something like:

"B-1"
"2No. 47x175mm C24 TIMBERS BOLTED TOGETHER"
"[Annotations]"
"Text — B-2"
"Text — 152x152x23 UC"

Reconstruct the member schedule by pairing member references with their nearby section-size descriptions. Look for ANY token that matches these patterns:
- Beams: B-1, B-2, B-3 ... or B1, B2 ...
- Rafters: R-1, R-2 ...
- Joists: FJ-1, FJ-2, CJ-1, HR-1 ...
- Lintels: L-1, L-2 ...
- Columns/Posts: C-1, C-2, P-1, P-2 ...
- Padstones: PS-1, PS-2 ...
- Connection details: CD-1, CD-2 ...

For each, find the associated section size or spec that appears NEAR it in the text (Bluebeam text boxes for a schedule row often sit adjacent to each other in extraction order even if the reading order is jumbled).

Be GENEROUS — if a reference like "B-1" appears at all in the drawing text, list it with whatever spec you can associate with it (or empty string if nothing found nearby).

Return ONLY valid JSON, no markdown, no code fences:
{"members": [{"ref": "B-1", "scheduledSize": "2No. 47x175mm C24", "type": "timber beam"}], "connections": [{"ref": "CD-1", "description": "..."}], "padstones": [{"ref": "PS-1", "description": "..."}]}`

        const scheduleRaw = await claudeCall(SCHEDULE_EXTRACT_SYSTEM,
          `Extract member schedule from this drawing text (may be fragmented / out of reading order):\n\n${drawing.textContent.slice(0, 50000)}`, 3000)

        console.log('── SCHEDULE EXTRACT RAW RESPONSE (first 1500 chars) ──')
        console.log(scheduleRaw?.slice(0, 1500))
        console.log('── END RAW ──')

        const scheduleData = safeParseJSON(scheduleRaw, { members: [], connections: [], padstones: [] })

        console.log(`Drawing schedule extracted: ${scheduleData.members?.length || 0} members, ${scheduleData.connections?.length || 0} connections, ${scheduleData.padstones?.length || 0} padstones`)
        updateJobProgress(jobId, `Drawing schedule: ${scheduleData.members?.length || 0} members found — cross-referencing…`)
        if (scheduleData.members?.length) {
          console.log('Members found:', scheduleData.members.map(m => m.ref).join(', '))
        }

        // Add pass comments for each drawing schedule member (for cross-referencing)
        for (const m of (scheduleData.members || [])) {
          allComments.push({
            severity: 'pass',
            member: m.ref,
            clause: null,
            title: `Drawing schedule entry confirmed: ${m.ref}`,
            detail: `Member ${m.ref} found in drawing member schedule: ${m.scheduledSize || '(size not identifiable in extracted text)'}`,
            recommendation: null,
            _drawingSize: m.scheduledSize, // internal use for cross-ref
          })
        }
      }

      // Step 2b: Visual review of drawing images
      const pageGroups = []
      for (let i = 0; i < drawing.pages.length; i += 6) {
        pageGroups.push(drawing.pages.slice(i, i + 6))
      }

      const drawingResults = await Promise.all(pageGroups.map(async (group, g) => {
        const content = [
          { type: 'text', text: `Drawing sheets ${g*6+1}–${g*6+group.length} of ${drawing.pages.length} from ${drawing.filename}:` },
          ...group.map(p => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.data } })),
          { type: 'text', text: 'Review these drawing sheets for coordination issues, missing bearings, padstone positions, connection coverage, and title block completeness. Return JSON with comments array.' }
        ]
        const raw = await claudeCall(DRAWING_REVIEW_SYSTEM, content, 3000)
        return safeParseJSON(raw, { comments: [] })
      }))

      for (const result of drawingResults) {
        allComments.push(...(result.comments || []))
      }
    }

    // ── PASS 3: Extract explicit member references from calcs ─────────────────
    const EXTRACT_MEMBERS_SYSTEM = `You are reviewing a structural calculation package for ARX Engineers Ltd.
Extract every explicit member reference ID from the calculations.
Member references follow patterns like: B-1, B-2, C-1, L-1, FJ-1, RJ-1, TR-1, HR-1, CJ-1, P-1, PS-1, CD-1, R-1 etc.
Also extract the designed/adopted section size from the conclusion of each member calc.
Look for conclusion lines like "USE 178x102x19 UB", "ADOPT 47x200 C24 @ 400 c/c", "USE 152x152x37 UC".
Also extract frame groupings e.g. "Frame 1: Beam B-8 & Column C-1" and list each member separately.
Return ONLY valid JSON, no markdown:
{"members": [{"ref": "B-1", "type": "steel beam", "designedSize": "178x102x19 UB", "calcSection": "brief what was checked"}]}`

    let calcMembers = []
    if (calc && calcHeadingChunks && calcHeadingChunks.length > 0) {
      const allCalcText = calcHeadingChunks.join('\n\n---\n\n').slice(0, 60000)
      const extractRaw = await claudeCall(EXTRACT_MEMBERS_SYSTEM,
        `Extract all member references from this calculation package:\n\n${allCalcText}`, 2000)
      const extracted = safeParseJSON(extractRaw, { members: [] })
      calcMembers = extracted.members || []
      console.log(`Extracted ${calcMembers.length} calc members:`, calcMembers.map(m => m.ref))
    }

    // ── PASS 4: Exact cross-reference calcs vs drawings ───────────────────────
    const crossRefComments = []
    if (calc && drawing && calcMembers.length > 0) {
      const XREF_SYSTEM = `You are cross-referencing structural calculations against structural drawings for ARX Engineers Ltd.

You will be given:
1. A list of member references extracted from the calculations with their designed section sizes
2. Member references identified from the drawing review

Rules:
- Match EXACT reference IDs only: B-1 in calcs must match B-1 in drawings. Do not guess.
- If a calc has B-1 designed as 178x102x19 UB but the drawing shows B-1 as 152x89x16 UB, that is a MAJOR discrepancy.
- If a calc member (e.g. C-3) has no corresponding drawing entry, flag as MAJOR — calc member not shown on drawings.
- If a drawing member has no corresponding calc, flag as MAJOR — undesigned member on drawings.
- If a frame grouping in calcs says "Frame 1: B-8 & C-1", check B-8 and C-1 individually.
- Do not invent matches. Only report what you can confirm or flag as missing.

Return ONLY valid JSON, no markdown:
{"comments": [{"severity": "critical|major|minor|query", "member": "exact ref e.g. B-1", "clause": null, "title": "concise title under 12 words", "detail": "state exact calc size and drawing size or note which is missing", "recommendation": "specific action"}]}`

      const drawingMemberRefs = allComments
        .filter(c => c.member && /^[A-Z]{1,3}-?\d/.test(c.member))
        .map(c => c.member)
        .filter((v, i, a) => a.indexOf(v) === i)

      // Build drawing schedule map from pass comments that have _drawingSize
      const drawingSchedule = {}
      allComments
        .filter(c => c._drawingSize && c.member)
        .forEach(c => { drawingSchedule[c.member] = c._drawingSize })

      const xrefContent = `Calc members with designed sizes:
${calcMembers.map(m => `${m.ref}: ${m.designedSize || 'size not found in calc'} (${m.type || 'structural member'})`).join('\n')}

Drawing member schedule (extracted directly from drawing text):
${Object.keys(drawingSchedule).length > 0
  ? Object.entries(drawingSchedule).map(([ref, size]) => `${ref}: ${size}`).join('\n')
  : `No schedule extracted. Member refs seen in drawing review: ${drawingMemberRefs.join(', ') || 'none'}`}

Cross-reference rules:
- Match EXACT reference IDs: B-1 in calcs must match B-1 in drawing schedule
- Compare section sizes exactly: flag any discrepancy between calc designed size and drawing scheduled size
- Flag any calc member with no drawing schedule entry as MAJOR
- Flag any drawing schedule member with no corresponding calc as MAJOR
- Do not invent matches or guess`

      const xrefRaw = await claudeCall(XREF_SYSTEM, xrefContent, 3000)
      const xref = safeParseJSON(xrefRaw, { comments: [] })
      crossRefComments.push(...(xref.comments || []))
      console.log(`Cross-ref raised ${crossRefComments.length} issues`)
      updateJobProgress(jobId, `Cross-referencing complete — synthesising final report…`)
    }

    // ── PASS 5: Synthesis ──────────────────────────────────────────────────────
    const allFinal = [...allComments, ...crossRefComments]
    const synthContent = `Cover page / project info:
${coverText || 'Not available'}

Total comments: ${allFinal.length} — Critical: ${allFinal.filter(c=>c.severity==='critical').length}, Major: ${allFinal.filter(c=>c.severity==='major').length}, Minor: ${allFinal.filter(c=>c.severity==='minor').length}, Query: ${allFinal.filter(c=>c.severity==='query').length}, Pass: ${allFinal.filter(c=>c.severity==='pass').length}
Calc members found: ${calcMembers.map(m=>m.ref).join(', ') || 'none extracted'}
Sample: ${allFinal.slice(0,6).map(c=>`[${c.severity}] ${c.member||''} ${c.title}`).join('; ')}

Extract project ref, title, calc author. Write 3-4 sentence summary. Return JSON:
{"projectRef":"string or null","projectTitle":"string or null","calcBy":"string or null","summary":"3-4 sentences"}`

    const synthRaw = await claudeCall(SYNTHESIS_SYSTEM, synthContent, 1000)
    const synthesis = safeParseJSON(synthRaw, {
      projectRef: null, projectTitle: null, calcBy: null,
      summary: `Review complete. ${allFinal.length} item(s) identified.`
    })

    // ── Deduplicate ────────────────────────────────────────────────────────────
    const seen = new Set()
    const deduped = allFinal.filter(c => {
      const key = `${c.member}|${c.title}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Store result on the job — client polls status endpoint to retrieve it
    const job = reviewJobs.get(jobId)
    if (job) {
      job.status = 'complete'
      job.progress = 'Complete'
      job.result = {
        projectRef: synthesis.projectRef,
        projectTitle: synthesis.projectTitle,
        calcBy: synthesis.calcBy,
        summary: synthesis.summary,
        comments: deduped,
      }
      console.log(`[${jobId}] Review complete — ${deduped.length} comments`)
    }

  } catch (err) {
    console.error(`[${jobId}] /api/check-package error:`, err)
    const job = reviewJobs.get(jobId)
    if (job) {
      job.status = 'error'
      job.error = err.message || 'Unknown error'
    }
  }
}

// (end of runReviewJob function)


// ── PDF report generator ─────────────────────────────────────────────────────
app.post('/api/check-package/report', async (req, res) => {
  const { results, calcFilename, drawingFilename } = req.body
  if (!results) return res.status(400).json({ error: 'No results provided' })

  try {
    const MARGIN = 50
    const PAGE_W = 595
    const CONTENT_W = PAGE_W - MARGIN * 2  // 495
    const PURPLE = '#5B2D8E'
    const GREY = '#6B7280'
    const LIGHT_GREY = '#E5E7EB'
    const SEV = {
      critical: { label: 'CRITICAL', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
      major:    { label: 'MAJOR',    color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA' },
      minor:    { label: 'MINOR',    color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
      query:    { label: 'QUERY',    color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
      pass:     { label: 'PASS',     color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
    }

    const doc = new PDFDocument({ margin: MARGIN, size: 'A4', bufferPages: true })
    const chunks = []
    doc.on('data', c => chunks.push(c))

    // ── helpers ────────────────────────────────────────────────────────────
    const ensureSpace = (needed) => {
      if (doc.y + needed > 780) doc.addPage()
    }

    const hRule = (color = LIGHT_GREY, weight = 0.5) => {
      doc.moveTo(MARGIN, doc.y).lineTo(PAGE_W - MARGIN, doc.y)
        .strokeColor(color).lineWidth(weight).stroke()
      doc.moveDown(0.4)
    }

    const sectionHeading = (text) => {
      doc.moveDown(0.3)
      doc.fontSize(10).font('Helvetica-Bold').fillColor(PURPLE).text(text.toUpperCase(), MARGIN, doc.y, { width: CONTENT_W })
      doc.moveDown(0.2)
      doc.moveTo(MARGIN, doc.y).lineTo(PAGE_W - MARGIN, doc.y).strokeColor(PURPLE).lineWidth(1).stroke()
      doc.moveDown(0.4)
    }

    // ── PAGE HEADER ─────────────────────────────────────────────────────────
    // Purple bar at top
    doc.rect(0, 0, PAGE_W, 36).fill(PURPLE)
    doc.fontSize(14).font('Helvetica-Bold').fillColor('white')
      .text('ARX Engineers Ltd', MARGIN, 11, { width: CONTENT_W / 2 })
    doc.fontSize(9).font('Helvetica').fillColor('rgba(255,255,255,0.7)')
      .text('Structural Review Note', MARGIN, 23, { width: CONTENT_W / 2 })
    doc.fontSize(9).font('Helvetica').fillColor('white')
      .text('Aim For Excellence', MARGIN, 17, { width: CONTENT_W, align: 'right' })

    doc.y = 52

    // Project info block
    const projectLine = [results.projectRef, results.projectTitle].filter(Boolean).join('  —  ')
    if (projectLine) {
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#1A1A1A')
        .text(projectLine, MARGIN, doc.y, { width: CONTENT_W })
      doc.moveDown(0.3)
    }

    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    doc.fontSize(8).font('Helvetica').fillColor(GREY)
    if (results.calcBy) doc.text(`Calc by: ${results.calcBy}     Review date: ${dateStr}`, MARGIN, doc.y, { width: CONTENT_W })
    else doc.text(`Review date: ${dateStr}`, MARGIN, doc.y, { width: CONTENT_W })
    doc.moveDown(0.2)
    if (calcFilename) doc.text(`Calculations: ${calcFilename}`, MARGIN, doc.y, { width: CONTENT_W })
    if (drawingFilename) doc.text(`Drawings: ${drawingFilename}`, MARGIN, doc.y, { width: CONTENT_W })
    doc.moveDown(0.5)
    hRule(LIGHT_GREY, 0.5)

    // ── SUMMARY OF FINDINGS (stat boxes) ────────────────────────────────────
    sectionHeading('Summary of Findings')

    const comments = results.comments || []
    const counts = { critical: 0, major: 0, minor: 0, query: 0, pass: 0 }
    comments.forEach(c => { if (counts[c.severity] !== undefined) counts[c.severity]++ })

    // Draw 5 stat boxes side by side
    const boxW = 89
    const boxH = 44
    const boxGap = 6
    let bx = MARGIN
    const by = doc.y

    Object.entries(SEV).forEach(([key, sev]) => {
      const count = counts[key]
      // Box background
      doc.roundedRect(bx, by, boxW, boxH, 4).fill(sev.bg)
      doc.roundedRect(bx, by, boxW, boxH, 4).stroke(sev.border).lineWidth(0.5)
      // Count
      doc.fontSize(22).font('Helvetica-Bold').fillColor(sev.color)
        .text(String(count), bx + 8, by + 5, { width: boxW - 16, align: 'center' })
      // Label
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(sev.color)
        .text(sev.label, bx + 4, by + 30, { width: boxW - 8, align: 'center' })
      bx += boxW + boxGap
    })

    doc.y = by + boxH + 14

    // ── REVIEW SUMMARY ───────────────────────────────────────────────────────
    if (results.summary) {
      sectionHeading('Review Summary')
      doc.fontSize(9.5).font('Helvetica').fillColor('#374151')
        .text(results.summary, MARGIN, doc.y, { width: CONTENT_W, lineGap: 2 })
      doc.moveDown(0.6)
    }

    // ── DETAILED COMMENTS ────────────────────────────────────────────────────
    sectionHeading('Detailed Comments')

    const sevOrder = ['critical', 'major', 'minor', 'query', 'pass']
    const sorted = [...comments].sort((a, b) =>
      sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity)
    )

    sorted.forEach((c, idx) => {
      const sev = SEV[c.severity] || SEV.query

      // Estimate height needed: header ~20, title ~16, detail ~varies, rec ~varies
      const detailLines = Math.ceil((c.detail || '').length / 90)
      const recLines = c.recommendation ? Math.ceil(c.recommendation.length / 90) : 0
      const estHeight = 20 + 18 + (detailLines * 12) + (recLines ? 12 + recLines * 12 : 0) + 20

      ensureSpace(estHeight)

      const cardTop = doc.y
      const cardX = MARGIN

      // Left severity stripe (4px wide)
      doc.rect(cardX, cardTop, 4, estHeight).fill(sev.color)

      // Card background
      doc.rect(cardX + 4, cardTop, CONTENT_W - 4, estHeight).fill(sev.bg)

      // Header row: severity badge + member + clause
      let headerY = cardTop + 7
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('white')
      // Severity badge
      const badgeW = doc.widthOfString(sev.label) + 10
      doc.roundedRect(cardX + 10, headerY - 2, badgeW, 13, 2).fill(sev.color)
      doc.text(sev.label, cardX + 15, headerY, { lineBreak: false })

      let headerX = cardX + 10 + badgeW + 6
      if (c.member) {
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#1A1A1A')
          .text(c.member, headerX, headerY, { lineBreak: false })
        headerX += doc.widthOfString(c.member) + 6
      }
      if (c.clause) {
        doc.fontSize(7.5).font('Helvetica').fillColor(GREY)
          .text(c.clause, headerX, headerY, { width: cardX + CONTENT_W - headerX - 8, lineBreak: false })
      }

      // Title
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#1A1A1A')
        .text(c.title || '', cardX + 10, cardTop + 22, { width: CONTENT_W - 20 })

      // Detail
      doc.moveDown(0.2)
      doc.fontSize(8.5).font('Helvetica').fillColor('#374151')
        .text(c.detail || '', cardX + 10, doc.y, { width: CONTENT_W - 20, lineGap: 1.5 })

      // Recommendation box
      if (c.recommendation) {
        doc.moveDown(0.3)
        const recY = doc.y
        doc.rect(cardX + 10, recY, CONTENT_W - 20, 1).fill('#D1D5DB') // thin rule
        doc.moveDown(0.25)
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor(sev.color)
          .text('ACTION: ', cardX + 10, doc.y, { lineBreak: false })
        doc.fontSize(8).font('Helvetica').fillColor('#374151')
          .text(c.recommendation, cardX + 10 + doc.widthOfString('ACTION: ') + 2, doc.y - doc.currentLineHeight(), { width: CONTENT_W - 20 - doc.widthOfString('ACTION: ') - 4, lineGap: 1.5 })
      }

      doc.y = cardTop + estHeight + 6
      if (doc.y > 750) doc.addPage()
    })

    // ── FOOTER on each page ─────────────────────────────────────────────────
    const totalPages = doc.bufferedPageRange().count
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i)
      doc.fontSize(7).font('Helvetica').fillColor(GREY)
        .text(
          `ARX Engineers Ltd  |  Co. No. 16198467  |  www.arxengineers.co.uk  |  AI-assisted review — does not replace engineer judgement  |  Page ${i + 1} of ${totalPages}`,
          MARGIN, 820, { width: CONTENT_W, align: 'center' }
        )
    }

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
