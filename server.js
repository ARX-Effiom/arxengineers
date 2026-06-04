import express from 'express'
import cors from 'cors'
import { createServer } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

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
      parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim())
    } catch {
      parsed = { existing: [], proposed: [], remove: [], retain: [], notes: [`Parse error — raw: ${rawText.slice(0, 200)}`] }
    }
    res.json(parsed)
  } catch (err) {
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
