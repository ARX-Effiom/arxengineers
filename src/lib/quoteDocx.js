import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, PageOrientation,
  UnderlineType, LevelFormat, HeadingLevel
} from 'docx'

const PURPLE = '5B2D8E'
const GREY = '888888'
const LIGHT_GREY = 'F5F5F5'
const WHITE = 'FFFFFF'
const FONT = 'Arial'

const noBorder = { style: BorderStyle.NONE, size: 0, color: WHITE }
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }

// ── Paragraph helpers ──────────────────────────────────────────
const p = (text, opts = {}) => new Paragraph({
  alignment: opts.align || AlignmentType.LEFT,
  spacing: { before: opts.before || 0, after: opts.after || 60 },
  border: opts.borderBottom ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: PURPLE, space: 4 } } : undefined,
  children: [new TextRun({
    text: text || '',
    font: FONT,
    size: opts.size || 22,
    bold: opts.bold || false,
    italics: opts.italic || false,
    color: opts.color || '000000',
    underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
  })]
})

const spacer = (lines = 1) => Array.from({ length: lines }, () =>
  new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: '', font: FONT, size: 22 })] })
)

const sectionHeading = (text) => new Paragraph({
  spacing: { before: 200, after: 100 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: PURPLE, space: 4 } },
  children: [new TextRun({ text, font: FONT, size: 22, bold: true, color: PURPLE })]
})

const bulletItem = (text) => new Paragraph({
  spacing: { before: 20, after: 20 },
  indent: { left: 320, hanging: 200 },
  children: [
    new TextRun({ text: '•\t', font: FONT, size: 16, color: PURPLE }),
    new TextRun({ text, font: FONT, size: 16 }),
  ]
})

const tcItem = (num, text) => new Paragraph({
  spacing: { before: 40, after: 40 },
  indent: { left: 380, hanging: 380 },
  children: [
    new TextRun({ text: `${num}.\t`, font: FONT, size: 16, bold: true }),
    new TextRun({ text, font: FONT, size: 16 }),
  ]
})

const pageBreak = () => new Paragraph({
  children: [new TextRun({ text: '', break: 1 })]
})

// ── Standard content ─────────────────────────────────────────
const ASSUMPTIONS = [
  'No allowance has been made for temporary works (propping, shoring, needling) which shall be designed and implemented by the appointed contractor.',
  'No allowance has been made for the design of staircase, below-ground drainage or external works unless specifically stated in the scope above.',
  'Setting out of all works is the responsibility of the architect / designer or main contractor.',
  'The existing structure, foundations and ground conditions are assumed to be adequate and competent. No intrusive investigation or trial pits are included unless stated.',
  'No Party Wall negotiations or discussions are included within this fee unless stated.',
  'No allowance has been made for value engineering or redesign required as a result of contractor input or procurement.',
  'All documents will be issued in PDF format. Any changes required after issue will be subject to additional fees at the hourly rate.',
  'No responsibility is accepted for non-structural items including waterproofing, glazing, fire protection or rooflights.',
  'Building Control approval is the responsibility of the client.',
]

const TC_CLAUSES = [
  'All fees are exclusive of VAT. ARX Engineers Ltd is not currently VAT registered.',
  'A deposit of 20% of the agreed fee is payable on instruction. The balance is payable prior to issue of final calculations and drawings.',
  'Payment is due within 28 days of invoice. Interest will be charged on late payments in accordance with The Late Payment of Commercial Debts (Interest) Act 1998.',
  'Copyright of all documents, drawings and calculations remains with ARX Engineers Ltd.',
  'Professional Indemnity insurance is maintained at 20 times the project fee.',
  'Liability is limited to the value of the agreement between the parties.',
  'The liability period is 6 years from the date of the final invoice.',
  'This fee proposal is valid for 3 months from the date of issue.',
  'Complaints should be directed to: effiome@gmail.com. In the event of a dispute, the parties agree to attempt resolution through mediation before commencing legal proceedings.',
  'This agreement is subject to the law and jurisdiction of England and Wales.',
  'The client may terminate this agreement with 60 days written notice. ARX Engineers Ltd may terminate if payment is outstanding for more than 28 days.',
]

// ── Main export ───────────────────────────────────────────────
export async function generateQuoteDocx({ project, quoteData, careOf }) {
  const today = new Date()
  const dateStr = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const expiryDate = new Date(today)
  expiryDate.setMonth(expiryDate.getMonth() + 3)
  const expiryStr = expiryDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const fee = quoteData.suggestedFee || 0
  const deposit = Math.round(fee * 0.2)
  const balance = fee - deposit

  const addressLines = []
  if (careOf) { addressLines.push(`For C/O ${careOf}:`); addressLines.push('') }
  if (project.client_name) addressLines.push(project.client_name)
  if (project.address_line1) addressLines.push(project.address_line1)
  if (project.address_line2) addressLines.push(project.address_line2)
  if (project.town) addressLines.push(project.town)
  if (project.postcode) addressLines.push(project.postcode)

  const siteAddress = [project.address_line1, project.town, project.postcode].filter(Boolean).join(', ')

  // ── COVER PAGE (landscape) ────────────────────────────────
  const coverChildren = [
    ...spacer(4),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: 'ARX Engineers Ltd', font: FONT, size: 52, bold: true, color: PURPLE })]
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 40 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: PURPLE, space: 4 } },
      children: [new TextRun({ text: 'Structural Engineering Fee Proposal', font: FONT, size: 32, color: '333333' })]
    }),
    ...spacer(2),
    ...addressLines.map(line => new Paragraph({
      spacing: { before: 0, after: 40 },
      children: [new TextRun({ text: line, font: FONT, size: 24, bold: line === project.client_name })]
    })),
    ...spacer(1),
    p(`Project Reference: ${project.ref}`, { size: 22, bold: true }),
    p(`Date: ${dateStr}`, { size: 22 }),
    p(`Valid until: ${expiryStr}`, { size: 20, color: GREY }),
    ...spacer(4),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 20 },
      children: [new TextRun({ text: 'Effiom Esua  |  Director, BEng MSc', font: FONT, size: 18, color: GREY })]
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 20 },
      children: [new TextRun({ text: 'admin@arxengineers.co.uk  |  www.arxengineers.co.uk  |  +44 (0)772 229 8882', font: FONT, size: 18, color: GREY })]
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: 'ARX Engineers Ltd  |  Co. No. 16198467  |  183 Marksbury Road, Bristol, BS3 5LF', font: FONT, size: 18, color: GREY })]
    }),
  ]

  // ── PAGE 2: SCOPE ─────────────────────────────────────────
  const scopeChildren = [
    sectionHeading('1.  Scope of Works'),
    ...spacer(1),
    p(`Project: ${siteAddress}`, { size: 20, color: GREY, after: 80 }),
    p(quoteData.projectDescription || '', { size: 22, after: 120 }),
    ...(quoteData.scopeItems || []).map((item, i) => new Paragraph({
      spacing: { before: 60, after: 60 },
      indent: { left: 360, hanging: 360 },
      children: [
        new TextRun({ text: `${i + 1}.\t`, font: FONT, size: 22 }),
        new TextRun({ text: item, font: FONT, size: 22 }),
      ]
    })),
    ...spacer(1),
    p(quoteData.siteVisitLine || 'No site visits considered in quotation.', { size: 20, color: GREY, before: 80 }),
  ]

  // ── PAGE 3: FEE ───────────────────────────────────────────
  const feeChildren = [
    sectionHeading('2.  Fee Proposal'),
    ...spacer(1),
    new Table({
      width: { size: 9026, type: WidthType.DXA },
      columnWidths: [5500, 3526],
      borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideH: noBorder, insideV: noBorder },
      rows: [
        new TableRow({ children: [
          new TableCell({ borders: noBorders, width: { size: 5500, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 0, right: 120 }, shading: { fill: LIGHT_GREY, type: ShadingType.CLEAR }, children: [p('Total Fee', { bold: true, size: 22 })] }),
          new TableCell({ borders: noBorders, width: { size: 3526, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 0 }, shading: { fill: LIGHT_GREY, type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `£${fee.toLocaleString()}`, font: FONT, size: 28, bold: true, color: PURPLE })] })] }),
        ]}),
        new TableRow({ children: [
          new TableCell({ borders: noBorders, width: { size: 5500, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 0, right: 120 }, children: [p('Deposit (20%) — payable on instruction', { size: 20 })] }),
          new TableCell({ borders: noBorders, width: { size: 3526, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 0 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `£${deposit.toLocaleString()}`, font: FONT, size: 20 })] })] }),
        ]}),
        new TableRow({ children: [
          new TableCell({ borders: noBorders, width: { size: 5500, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 0, right: 120 }, children: [p('Balance — payable prior to issue of calculations', { size: 20 })] }),
          new TableCell({ borders: noBorders, width: { size: 3526, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 0 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `£${balance.toLocaleString()}`, font: FONT, size: 20 })] })] }),
        ]}),
      ]
    }),
    ...spacer(2),
    ...(quoteData.additionalNotes?.length ? [
      sectionHeading('Notes & Flags'),
      ...quoteData.additionalNotes.map(n => bulletItem(n)),
    ] : []),
    ...spacer(2),
    sectionHeading('Bank Details'),
    ...spacer(1),
    new Table({
      width: { size: 9026, type: WidthType.DXA },
      columnWidths: [2200, 6826],
      borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideH: noBorder, insideV: noBorder },
      rows: [
        ['Bank', 'Monzo'],
        ['Account name', 'ARX Engineers Ltd'],
        ['Sort code', '04-00-03'],
        ['Account number', '81677090'],
        ['Reference', project.ref],
      ].map(([label, value]) => new TableRow({ children: [
        new TableCell({ borders: noBorders, width: { size: 2200, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 0, right: 120 }, children: [p(label, { size: 18, color: GREY })] }),
        new TableCell({ borders: noBorders, width: { size: 6826, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 0 }, children: [p(value, { size: 18 })] }),
      ]}))
    }),
  ]

  // ── PAGE 4: ASSUMPTIONS ───────────────────────────────────
  const assumptionsChildren = [
    sectionHeading('3.  Assumptions & Exclusions'),
    ...spacer(1),
    ...ASSUMPTIONS.map(a => bulletItem(a)),
  ]

  // ── PAGE 5: T&Cs ──────────────────────────────────────────
  const tcChildren = [
    sectionHeading('4.  Terms & Conditions'),
    ...spacer(1),
    ...TC_CLAUSES.map((tc, i) => tcItem(i + 1, tc)),
  ]

  // ── PAGE 6: CLOSING ───────────────────────────────────────
  const closingChildren = [
    sectionHeading('5.  Acceptance'),
    ...spacer(2),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: 'We trust this proposal meets with your approval.', font: FONT, size: 22, italics: true, color: PURPLE })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: 'Please confirm your instruction by return email and we will issue our deposit invoice.', font: FONT, size: 22, italics: true, color: PURPLE })]
    }),
    ...spacer(3),
    p('Best regards,', { size: 22, after: 40 }),
    ...spacer(1),
    p('Effiom Esua', { size: 22, bold: true }),
    p('Director | BEng MSc', { size: 20 }),
    p('ARX Engineers Ltd', { size: 20, color: PURPLE }),
    p('admin@arxengineers.co.uk  |  www.arxengineers.co.uk', { size: 18, color: GREY }),
    p('+44 (0)772 229 8882', { size: 18, color: GREY }),
    ...spacer(1),
    new Paragraph({
      spacing: { before: 60, after: 0 },
      border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'DDDDDD', space: 4 } },
      children: [new TextRun({ text: 'Aim For Excellence', font: FONT, size: 18, bold: true, color: PURPLE })]
    }),
    new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: 'ARX Engineers Ltd  |  Registered in England & Wales  |  Company No. 16198467', font: FONT, size: 16, color: GREY })]
    }),
    new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: 'Registered Office: 183 Marksbury Road, Bristol, BS3 5LF', font: FONT, size: 16, color: GREY })]
    }),
  ]

  const A4_PORTRAIT = { width: 11906, height: 16838 }
  const margin = { top: 1440, right: 1440, bottom: 1440, left: 1440 }

  const doc = new Document({
    numbering: { config: [] },
    styles: {
      default: { document: { run: { font: FONT, size: 22 } } }
    },
    sections: [
      // Cover - landscape
      {
        properties: {
          page: {
            size: { width: A4_PORTRAIT.height, height: A4_PORTRAIT.width, orientation: PageOrientation.LANDSCAPE },
            margin: { top: 1800, right: 1800, bottom: 1800, left: 1800 }
          }
        },
        children: coverChildren,
      },
      // Pages 2-6 - portrait
      {
        properties: { page: { size: A4_PORTRAIT, margin } },
        children: [
          ...scopeChildren,
          pageBreak(),
          ...feeChildren,
          pageBreak(),
          ...assumptionsChildren,
          pageBreak(),
          ...tcChildren,
          pageBreak(),
          ...closingChildren,
        ]
      }
    ]
  })

  return await Packer.toBlob(doc)
}

export function downloadDocx(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
