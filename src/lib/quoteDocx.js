import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, PageOrientation,
  UnderlineType, ImageRun, VerticalAlign
} from 'docx'

const PURPLE = '5B2D8E'
const GREY = '888888'
const LIGHT_GREY = 'F5F5F5'
const MID_GREY = 'CCCCCC'
const WHITE = 'FFFFFF'
const BLACK = '1A1A1A'
const FONT = 'Arial'

const A4P = { width: 11906, height: 16838 }
const MARGIN = { top: 1440, right: 1440, bottom: 1440, left: 1440 }
const CONTENT_WIDTH = 9026

const noBorder = { style: BorderStyle.NONE, size: 0, color: WHITE }
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideH: noBorder, insideV: noBorder }

const run = (text, opts = {}) => new TextRun({
  text, font: FONT,
  size: opts.size || 22,
  bold: opts.bold || false,
  italics: opts.italic || false,
  color: opts.color || BLACK,
  underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
})

const para = (children, opts = {}) => new Paragraph({
  alignment: opts.align || AlignmentType.LEFT,
  spacing: { before: opts.before || 0, after: opts.after || 60 },
  border: opts.borderBottom ? { bottom: { style: BorderStyle.SINGLE, size: opts.borderSize || 8, color: opts.borderColor || PURPLE, space: 4 } } : undefined,
  children: Array.isArray(children) ? children : [children],
})

const tp = (text, opts = {}) => para([run(text, opts)], opts)
const sp = (n = 1) => Array.from({ length: n }, () => para([run('')], { after: 0 }))

const headingPara = (text) => para(
  [run(text, { bold: true, color: PURPLE, size: 22 })],
  { borderBottom: true, borderSize: 8, borderColor: PURPLE, before: 200, after: 100 }
)

const bullet = (text) => new Paragraph({
  spacing: { before: 40, after: 40 },
  indent: { left: 360, hanging: 240 },
  children: [run('·\t', { color: PURPLE, size: 20 }), run(text, { size: 20 })],
})

const dashLine = (text) => new Paragraph({
  spacing: { before: 60, after: 60 },
  indent: { left: 360 },
  children: [run('—\t', { color: PURPLE }), run(text)],
})

const tcClause = (num, text) => new Paragraph({
  spacing: { before: 60, after: 60 },
  indent: { left: 500, hanging: 500 },
  children: [run(`${num}.\t`, { bold: true }), run(text, { size: 20 })],
})

const divider = (color = MID_GREY) => para([run('')], {
  after: 0, borderBottom: true, borderSize: 4, borderColor: color
})

// Assumptions for design projects
const SCOPE_ASSUMPTIONS_DESIGN = [
  "We will not be responsible for the design of non-structural items such as waterproofing, roof lights or door glazing, nor are we responsible for the structural design of the glass structure or fire proofing/protection of structural elements.",
  "A trial pit requirement sketch may be issued upon appointment. These pits should be ready to inspect prior to site visit.",
  "Quotation does not allow for foundations subject to influence of trees.",
  "It is the responsibility of the client to ensure building control approval is obtained prior to commencement of construction works or ordering of materials.",
  "Our fee does not allow time for works as a result of Party Wall negotiations or discussions.",
  "Our fee does not allow for value engineering process, or changes that will result in our structure being redesigned or reassessed. This includes any input from the contractor during the construction stage.",
  "Temporary works such as props, struts or needling will be contractor designed.",
  "All setting out will be the architect's responsibility. The contractor must take their own site dimensions to confirm lengths for fabrication.",
  "Any existing structure that may be present is assumed to be of a good structural condition. Our quote does not allow for any remedial or repair works unless stated above.",
  "This quote does not include for staircase design, below-ground drainage or external works unless stated otherwise.",
  "Meetings and/or site visits will be charged at hourly rates, unless agreed otherwise.",
  "Professional Indemnity Insurance (PI) for the above scope is limited to 20 times our fee stated above.",
  "Building regulations calculations will be issued upon payment of invoice.",
  "The fee proposal is valid for 3 months.",
  "All documentation will be issued in PDF format. If paper copies are required, they will be charged at cost plus £20 admin fee per set.",
]

// Assumptions for inspection-only projects (no design-specific items)
const SCOPE_ASSUMPTIONS_INSPECTION = [
  "We will not be responsible for the design of non-structural items such as waterproofing, roof lights or door glazing, nor are we responsible for the structural design of the glass structure or fire proofing/protection of structural elements.",
  "This inspection is visual only. Intrusive investigation, opening up works or trial pits are not included unless separately agreed.",
  "Any existing structure inspected is assessed on the basis of visible condition only. Hidden defects or concealed structural elements are outside the scope of this inspection.",
  "Our fee does not allow time for works as a result of Party Wall negotiations or discussions.",
  "Professional Indemnity Insurance (PI) for the above scope is limited to 20 times our fee stated above.",
  "The fee proposal is valid for 3 months.",
  "All documentation will be issued in PDF format.",
]

const TC_CLAUSES = [
  'ARX Engineers ("the Consultant") shall provide to the Client the professional services ("the Services") for the Project described in this fee proposal and as prescribed by these Terms of Agreement.',
  "In providing the services, the Consultant shall exercise reasonable skill and care.",
  "The Client shall provide to the Consultant briefing and all information concerning the Client's requirements for the commission.",
  "The Client shall pay to the Consultant the Fee as set out in this proposal. All sums due are exclusive of Value Added Tax.",
  "All monies payable by the Client to the Consultant shall be paid within 28 days of invoice. Monies not paid within that period shall attract interest in accordance with The Late Payment of Commercial Debts (Interest) Act 1998.",
  "The liability of the Consultant under or in connection with this Agreement whether in contract or in tort shall not exceed the value of this Agreement.",
  "After the expiration of six years from the date of the final invoice, the Consultant shall be discharged from all liability in respect of the Services.",
  "Copyright in all drawings, reports, specifications, calculations and other documents provided by the Consultant shall remain the property of the Consultant.",
  "The Client shall have a licence to use the documents for the purpose of completing the Project only.",
  "Each party shall keep secret and confidential all information, data, specifications, drawings, reports and other documents.",
  "Complaints should be directed in the first instance to: effiome@gmail.com.",
  "Any dispute shall first be the subject of mediation before any legal proceedings are commenced.",
  "The Client may terminate this agreement upon giving the Consultant 60 days written notice.",
  "The Consultant may suspend or terminate if monies are outstanding for more than 28 days.",
  "Neither party may assign or transfer any obligation under this Agreement without written consent.",
  "The liability of the Consultant for any claim arising out of or in connection with asbestos is excluded.",
  "This Appointment will be subject to UK law and jurisdiction.",
]

async function loadLogo() {
  try {
    const response = await fetch('/arx-logo.jpg')
    const buffer = await response.arrayBuffer()
    return new Uint8Array(buffer)
  } catch {
    return null
  }
}

// Cover page using a two-row table to pin top content and footer to page edges
function buildCoverChildren({ logoData, addressLines, project, siteAddress, monthYear, isInspection }) {
  const COVER_W = 16838 - 3600  // landscape content width (1.25" margins each side)
  const COVER_H = 11906 - 3600  // landscape content height

  const topCell = new TableCell({
    borders: noBorders,
    width: { size: COVER_W, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
    children: [
      // Logo
      ...(logoData ? [new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 0, after: 400 },
        children: [new ImageRun({
          data: logoData,
          transformation: { width: 252, height: 101 },
          type: 'jpg',
        })]
      })] : [tp('ARX Engineers Ltd', { bold: true, size: 40, color: PURPLE, after: 400 })]),

      // Address block
      ...addressLines.map(line => para([run(line, { size: 22, bold: line === project.client_name })], { after: 40 })),
      ...sp(1),
      tp(`Project Reference: ${project.ref}`, { after: 40 }),
      tp(siteAddress, { after: 40, color: GREY }),
    ]
  })

  const midCell = new TableCell({
    borders: noBorders,
    width: { size: COVER_W, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      divider(PURPLE),
      tp(
        isInspection
          ? 'FEE PROPOSAL FOR STRUCTURAL INSPECTION SERVICES'
          : 'FEE PROPOSAL FOR STRUCTURAL ENGINEERING SERVICES',
        { bold: true, size: 28, color: PURPLE, before: 80, after: 80 }
      ),
      divider(PURPLE),
      ...sp(1),
      tp(monthYear, { size: 22, color: GREY }),
    ]
  })

  const botCell = new TableCell({
    borders: noBorders,
    width: { size: COVER_W, type: WidthType.DXA },
    verticalAlign: VerticalAlign.BOTTOM,
    children: [
      para([run('ARX Engineers Ltd  |  Effiom Esua BEng MSc  |  Director', { size: 18, color: GREY })], { after: 20 }),
      para([run('admin@arxengineers.co.uk  |  www.arxengineers.co.uk  |  +44 (0)772 229 8882', { size: 18, color: GREY })], { after: 20 }),
      para([run('Company No. 16198467  |  183 Marksbury Road, Bristol, BS3 5LF', { size: 18, color: GREY })]),
    ]
  })

  return [
    new Table({
      width: { size: COVER_W, type: WidthType.DXA },
      columnWidths: [COVER_W],
      borders: noBorders,
      rows: [
        new TableRow({ children: [topCell], tableHeader: false }),
        new TableRow({ children: [midCell], tableHeader: false }),
        new TableRow({ children: [botCell], tableHeader: false }),
      ]
    })
  ]
}

export async function generateQuoteDocx({
  project, quoteData, careOf,
  includeSiteVisit = false, siteVisitFee = 350, siteVisitCount = 1,
  includeNHBC = false, hourlyRate = 70,
  quoteType = 'design',   // 'design' | 'inspection'
}) {
  const isInspection = quoteType === 'inspection'

  const today = new Date()
  const monthYear = today.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const fee = quoteData.suggestedFee || 0
  const deposit = Math.round(fee * 0.2)
  const balance = fee - deposit
  const siteAddress = [project.address_line1, project.town, project.postcode].filter(Boolean).join(', ')
  const clientFirstName = (project.client_name || '').split(' ').find(w => !['Mr','Mrs','Ms','Miss','Dr','&','and'].includes(w)) || project.client_name || 'Client'

  const addressLines = []
  if (careOf) addressLines.push(`For C/O ${careOf} on behalf of ${project.client_name}:`)
  else if (project.client_name) addressLines.push(project.client_name)
  if (project.address_line1) addressLines.push(project.address_line1)
  if (project.address_line2) addressLines.push(project.address_line2)
  if (project.town) addressLines.push(project.town)
  if (project.postcode) addressLines.push(project.postcode)

  const logoData = await loadLogo()

  // ── COVER PAGE ─────────────────────────────────────────────
  const coverChildren = buildCoverChildren({ logoData, addressLines, project, siteAddress, monthYear, isInspection })

  // ── LETTER PAGE ────────────────────────────────────────────
  const letterChildren = [
    tp(`Dear ${clientFirstName},`, { after: 120 }),
    tp(
      isInspection
        ? `Thank you for considering ARX to carry out a structural inspection at your property. It is something I am looking forward to, and I wanted to take a moment — before we get into the detail — to speak to you directly.`
        : `Thank you for considering ARX for the structural engineering of your ${quoteData.projectDescription || 'project'}. It is a project I am looking forward to being part of, and I wanted to take a moment — before we get into the technical detail — to speak to you directly.`,
      { after: 120 }
    ),
    tp(`At ARX, we believe that structural engineering done well is largely invisible. What you should see is your home transformed, your vision realised, and your build progressing without surprises. What you should feel, throughout, is that you have a trusted partner in your corner — someone who is as invested in the outcome as you are.`, { after: 120 }),
    tp(`I have been working in structural engineering since 2017, and ARX was founded on a single conviction: that every client — whether a homeowner making the most significant investment of their life, an architect delivering for their client, or a contractor building to programme — deserves the same thing. Not just competent engineering, but a genuinely exceptional experience.`, { after: 120 }),
    tp(`The proposal that follows sets out our scope, our fee, and the terms under which we work. I hope it gives you confidence not just in the numbers, but in the practice behind them.`, { after: 120 }),
    tp(`If you have any questions at all — about the scope, the process, or anything else — please do not hesitate to get in touch before signing. I would rather answer a question now than have any uncertainty remain.`, { after: 200 }),
    tp('Yours sincerely,', { after: 60 }),
    tp('ARX Engineers', { bold: true, after: 20 }),
    tp('Aim For Excellence', { italic: true, color: PURPLE, after: 280 }),
    headingPara('OUR COMMITMENT TO YOU'),
    tp(`ARX was built around one idea: that the people who trust us with their projects deserve more than calculations and drawings. They deserve a structural engineer who communicates clearly, delivers on time, and treats their project with the same care they would.`, { after: 120 }),
    tp(`With nearly a decade of experience across residential, commercial, and mixed-use projects, we bring the rigour of a large practice and the personal attention of a dedicated partner. Every project that leaves ARX has been considered, checked, and crafted to the standard we put our name to.`),
  ]

  // ── PROCESS PAGE ──────────────────────────────────────────
  const processChildren = isInspection ? [
    headingPara('WHAT HAPPENS NEXT'),
    tp('01  Appointment', { bold: true, color: PURPLE, after: 40 }),
    tp('Return your signed acceptance. We will confirm receipt within one working day and open your project file.', { after: 120 }),
    tp('02  Site & Inspection', { bold: true, color: PURPLE, after: 40 }),
    tp('We will coordinate a convenient time for your site visit. We will carry out a visual inspection of the relevant elements.', { after: 120 }),
    tp('03  Summary of Findings', { bold: true, color: PURPLE, after: 40 }),
    tp('We will summarise our findings and recommendations in writing. Where structural intervention is required, we will outline the options and agree a way forward.', { after: 240 }),
    headingPara('HOW WE WORK TOGETHER'),
    tp('A successful project is a shared effort. To deliver our best work for you, we ask that we work as genuine partners — each taking responsibility for our part. Here is what that looks like in practice:', { after: 120 }),
    dashLine('We will communicate proactively — you will never need to chase us for an update.'),
    dashLine('We ask that key decisions and any changes to the scope are confirmed in writing, so the project record is always clear.'),
    dashLine('Our inspection is based on visible conditions. Where further investigation is required, we will advise you promptly and agree a way forward.'),
    dashLine('If anything is unclear at any stage, please ask. We would always rather take five minutes to explain than have uncertainty affect your project.'),
  ] : [
    headingPara('WHAT HAPPENS NEXT'),
    tp('01  Appointment', { bold: true, color: PURPLE, after: 40 }),
    tp('Return your signed acceptance whereupon we will prepare a payable deposit. We will confirm receipt within one working day and open your project file.', { after: 120 }),
    tp(includeSiteVisit ? '02  Site & Survey' : '02  Design & Calculations', { bold: true, color: PURPLE, after: 40 }),
    ...(includeSiteVisit ? [
      tp('We will coordinate a convenient time for your site visit. We may issue a trial pit sketch in advance if required so a contractor can prepare.', { after: 120 }),
      tp('03  Design & Calculations', { bold: true, color: PURPLE, after: 40 }),
    ] : []),
    tp('We will produce your structural calculations and general arrangement drawings. Upon settlement of the outstanding balance, the calculations will be issued in PDF format, ready to submit to Building Control.', { after: 120 }),
    tp(`${includeSiteVisit ? '04' : '03'}  Construction Support`, { bold: true, color: PURPLE, after: 40 }),
    tp('We remain available throughout the build. Any site queries, contractor RFIs, or Building Control responses are handled promptly — your build does not stop because of us.', { after: 240 }),
    headingPara('HOW WE WORK TOGETHER'),
    tp('A successful project is a shared effort. To deliver our best work for you, we ask that we work as genuine partners — each taking responsibility for our part. Here is what that looks like in practice:', { after: 120 }),
    dashLine('We will communicate proactively — you will never need to chase us for an update.'),
    dashLine('We ask that key decisions and any changes to the architectural intent are confirmed in writing, so the project record is always clear.'),
    dashLine('Our designs are based on the information provided. Where site conditions differ from what is assumed, we will advise you promptly and agree a way forward.'),
    dashLine('Building Control approval and contractor setting-out remain the responsibility of the relevant parties — we are here to support, not to duplicate their role.'),
    dashLine('If anything is unclear at any stage, please ask. We would always rather take five minutes to explain than have uncertainty affect your project.'),
  ]

  // ── SCOPE PAGE ────────────────────────────────────────────
  const scopeChildren = isInspection ? [
    tp('Thank you for inviting ARX to provide structural inspection services for your property. Following a review of your enquiry, we have provided a fee proposal based on our understanding of the scope.', { after: 160 }),
    headingPara('SCOPE'),
    tp(`According to the information provided, the following is deemed necessary for the ${quoteData.projectDescription || siteAddress}:`, { after: 120 }),
    ...(quoteData.scopeItems || []).map((item, i) => new Paragraph({
      spacing: { before: 60, after: 60 },
      indent: { left: 400, hanging: 400 },
      children: [run(`${i + 1}.\t`), run(item)],
    })),
    ...sp(2),
    headingPara('Stage 4 (INSPECTION & REPORTING)'),
    new Paragraph({ spacing: { before: 60, after: 60 }, indent: { left: 400, hanging: 400 }, children: [run('1)\t', { bold: true, color: PURPLE }), run('1No. site visit included in quotation.')] }),
    new Paragraph({ spacing: { before: 60, after: 60 }, indent: { left: 400, hanging: 400 }, children: [run('2)\t', { bold: true, color: PURPLE }), run('Written summary of findings and recommendations.')] }),
    ...sp(1),
    headingPara('Stage 5 (FURTHER INVOLVEMENT, IF REQUIRED)'),
    new Paragraph({ spacing: { before: 60, after: 60 }, indent: { left: 400, hanging: 400 }, children: [run('1)\t', { bold: true, color: PURPLE }), run('Any structural design or further investigation to be agreed separately.')] }),
  ] : [
    tp('Thank you for inviting ARX to provide structural engineering services for your project. Following a review of the proposal, we have provided a fee proposal based on our understanding of the scope.', { after: 160 }),
    headingPara('SCOPE'),
    tp(`According to the latest planning drawings, the following is deemed necessary for the construction of ${quoteData.projectDescription || siteAddress}:`, { after: 120 }),
    ...(quoteData.scopeItems || []).map((item, i) => new Paragraph({
      spacing: { before: 60, after: 60 },
      indent: { left: 400, hanging: 400 },
      children: [run(`${i + 1}.\t`), run(item)],
    })),
    ...sp(2),
    headingPara('Stage 4 (DETAILED DESIGN – FOR BUILDING CONTROL & TENDER)'),
    new Paragraph({ spacing: { before: 60, after: 60 }, indent: { left: 400, hanging: 400 }, children: [run('1)\t', { bold: true, color: PURPLE }), run(includeSiteVisit ? `${siteVisitCount} site visit${siteVisitCount > 1 ? 's' : ''} included in quotation` : 'No site visits considered in quotation')] }),
    new Paragraph({ spacing: { before: 60, after: 60 }, indent: { left: 400, hanging: 400 }, children: [run('2)\t', { bold: true, color: PURPLE }), run('Provide Building Regulations calculations.')] }),
    new Paragraph({ spacing: { before: 60, after: 60 }, indent: { left: 400, hanging: 400 }, children: [run('3)\t', { bold: true, color: PURPLE }), run('Produce general arrangement drawings and provide key details.')] }),
    new Paragraph({ spacing: { before: 60, after: 60 }, indent: { left: 400, hanging: 400 }, children: [run('4)\t', { bold: true, color: PURPLE }), run('Any changes to the architectural intent requiring structural design to be at time charge.')] }),
    ...sp(1),
    headingPara('Stage 5 (CONSTRUCTION PHASE)'),
    new Paragraph({ spacing: { before: 60, after: 60 }, indent: { left: 400, hanging: 400 }, children: [run('1)\t', { bold: true, color: PURPLE }), run('Time charge.')] }),
    ...sp(2),
    headingPara('BUILDING REGULATION COMPLIANCE'),
    tp('The Building Safety Act requires all aspects of the works to be compliant with the Building Regulations Approved Documents. Including but not limited to: Fire Safety, Conservation of Fuel & Power, Access, Ventilation, Overheating, Protection from Falling, Collisions & Impacts, Security, Resistance To Sound etc.', { after: 120 }),
    tp('It is the responsibility of the Client, the Main Contractor or other professionals to ensure this is satisfied as this is outside of our expertise and the remit extended to ARX Engineers.'),
  ]

  // ── FEE PAGE ──────────────────────────────────────────────
  const feeLabel = isInspection ? 'Site Inspection & Summary of Findings' : 'Calculations and Markup Drawings'
  const depositNote = isInspection
    ? '(Full fee payable prior to commencement of inspection)'
    : '(20% deposit on instruction, outstanding balance payable prior to issue of calculations)'

  const feeChildren = [
    headingPara('FEE'),
    tp('To carry out the structural engineering scope as mentioned, our fee will be as follows:', { after: 120 }),
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [6000, 3026],
      borders: noBorders,
      rows: [new TableRow({ children: [
        new TableCell({ borders: noBorders, width: { size: 6000, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 0, right: 120 }, shading: { fill: 'EDE7F6', type: ShadingType.CLEAR }, children: [tp(feeLabel, { bold: true })] }),
        new TableCell({ borders: noBorders, width: { size: 3026, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 0 }, shading: { fill: 'EDE7F6', type: ShadingType.CLEAR }, children: [para([run(`£${fee.toLocaleString()}`, { bold: true, size: 26, color: PURPLE })], { align: AlignmentType.RIGHT })] }),
      ]})]
    }),
    ...sp(1),
    tp(depositNote, { size: 18, color: GREY, after: 160 }),
    headingPara('ADDITIONAL SCOPE (IF REQUIRED)'),
    ...(isInspection ? [
      bullet('Where structural intervention or further investigation is required following inspection, a separate fee will be agreed with the Client.'),
      bullet('Construction Stage to be time charge if required.'),
    ] : [
      ...(!includeSiteVisit ? [bullet(`For site visits, we would suggest a fee of £${siteVisitFee} per site visit payable prior to visit.`)] : []),
      ...(includeNHBC ? [bullet(`NHBC tree foundation design (NHBC 4.2): £350 (included in fee above)`)] : [bullet('NHBC tree foundation design (NHBC 4.2) not included. Available at £350 if required.')]),
      bullet('Construction Stage to be time charge if required.'),
    ]),
    ...sp(2),
    headingPara('SCOPE ASSUMPTIONS & EXCLUSIONS'),
    ...(isInspection ? SCOPE_ASSUMPTIONS_INSPECTION : SCOPE_ASSUMPTIONS_DESIGN).map(a => bullet(a)),
    ...sp(2),
    headingPara('HOURLY RATE'),
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [6000, 3026],
      borders: noBorders,
      rows: [new TableRow({ children: [
        new TableCell({ borders: noBorders, width: { size: 6000, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 0, right: 0 }, children: [tp('Director', { bold: true })] }),
        new TableCell({ borders: noBorders, width: { size: 3026, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 0, right: 0 }, children: [para([run(`£${hourlyRate}`, { bold: true })], { align: AlignmentType.RIGHT })] }),
      ]})]
    }),
  ]

  // ── ACCEPTANCE + T&Cs PAGE ─────────────────────────────────
  const acceptanceChildren = [
    headingPara('ACCEPTANCE'),
    tp('I accept the fee proposal and terms and conditions.', { after: 200 }),
    tp('Name(s):      _____________________________________', { after: 160 }),
    tp('Address:      _____________________________________', { after: 120 }),
    tp('               ________________________________________', { after: 120 }),
    tp('               ________________________________________', { after: 200 }),
    tp('Signature: ________________________', { after: 160 }),
    tp('Date: ________________', { after: 240 }),
    tp('(*) In the case of acceptance, please return a signed copy of this fee proposal via post or email. This is a condition required for us to begin our involvement on the project. This offer will act as a private contract between both parties, without affecting to the formal contract signature.', { size: 18, color: GREY, after: 280 }),
    divider(PURPLE),
    ...sp(1),
    para([run('We look forward to working with you and delivering a result you are truly proud of.', { italic: true, color: PURPLE })], { align: AlignmentType.CENTER, after: 280 }),
    divider(MID_GREY),
    ...sp(1),
    headingPara('STANDARD TERMS OF AGREEMENT FOR PROFESSIONAL SERVICES'),
    ...TC_CLAUSES.map((tc, i) => tcClause(i + 1, tc)),
  ]

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: A4P.height, height: A4P.width, orientation: PageOrientation.LANDSCAPE },
            margin: { top: 1800, right: 1800, bottom: 1800, left: 1800 }
          }
        },
        children: coverChildren,
      },
      {
        properties: { page: { size: A4P, margin: MARGIN } },
        children: [
          ...letterChildren,
          new Paragraph({ pageBreakBefore: true, children: [run('')] }),
          ...processChildren,
          new Paragraph({ pageBreakBefore: true, children: [run('')] }),
          ...scopeChildren,
          new Paragraph({ pageBreakBefore: true, children: [run('')] }),
          ...feeChildren,
          new Paragraph({ pageBreakBefore: true, children: [run('')] }),
          ...acceptanceChildren,
        ]
      }
    ]
  })

  return await Packer.toBlob(doc)
}

export { downloadDocx } from './invoiceDocx.js'
