import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, PageOrientation,
  UnderlineType
} from 'docx'

const PURPLE = '5B2D8E'
const LIGHT_GREY = 'F2F2F2'
const WHITE = 'FFFFFF'

const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }

const cell = (children, opts = {}) => new TableCell({
  borders: noBorders,
  width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
  shading: opts.shade ? { fill: opts.shade, type: ShadingType.CLEAR } : undefined,
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  verticalAlign: opts.valign || undefined,
  children: Array.isArray(children) ? children : [children],
})

const para = (text, opts = {}) => new Paragraph({
  alignment: opts.align || AlignmentType.LEFT,
  spacing: { before: opts.spaceBefore || 0, after: opts.spaceAfter || 40 },
  children: [new TextRun({
    text,
    font: 'Arial',
    size: opts.size || 20,
    bold: opts.bold || false,
    italics: opts.italic || false,
    color: opts.color || '000000',
    underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
  })]
})

const dividerLine = (color = PURPLE) => new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 8, color, space: 1 } },
  spacing: { before: 60, after: 60 },
  children: [new TextRun({ text: '', font: 'Arial', size: 2 })]
})

export async function generateInvoiceDocx({ project, invoiceType, amount, invoiceRef, dueDate, careOf }) {
  const today = new Date()
  const dateStr = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const dueDateStr = dueDate
    ? new Date(dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const typeLabel = invoiceType === 'deposit' ? 'DEPOSIT' : invoiceType === 'balance' ? 'BALANCE' : 'VARIATION ORDER'
  const amountFormatted = `£${Number(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  // Build address lines
  const addressLines = []
  if (careOf) addressLines.push(`For C/O ${careOf}:`)
  if (project.client_name) addressLines.push(project.client_name)
  if (project.address_line1) addressLines.push(project.address_line1)
  if (project.address_line2) addressLines.push(project.address_line2)
  if (project.town) addressLines.push(project.town)
  if (project.postcode) addressLines.push(project.postcode)

  const description = invoiceType === 'deposit'
    ? `Deposit invoice for structural engineering services in connection with proposed works at ${[project.address_line1, project.town, project.postcode].filter(Boolean).join(', ')}.`
    : invoiceType === 'balance'
    ? `Balance invoice for structural engineering services in connection with proposed works at ${[project.address_line1, project.town, project.postcode].filter(Boolean).join(', ')}. This completes payment for the agreed scope of works.`
    : `Variation order for additional structural engineering services in connection with works at ${[project.address_line1, project.town, project.postcode].filter(Boolean).join(', ')}.`

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Arial', size: 20 } }
      }
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children: [

        // Header: ARX Engineers
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 0, after: 20 },
          children: [new TextRun({ text: 'ARX Engineers Ltd', font: 'Arial', size: 28, bold: true, color: PURPLE })]
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 0, after: 20 },
          children: [new TextRun({ text: '183 Marksbury Road, Bristol, BS3 5LF', font: 'Arial', size: 16, color: '666666' })]
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 0, after: 20 },
          children: [new TextRun({ text: 'admin@arxengineers.co.uk  |  www.arxengineers.co.uk', font: 'Arial', size: 16, color: '666666' })]
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 0, after: 20 },
          children: [new TextRun({ text: '+44 (0)772 229 8882', font: 'Arial', size: 16, color: '666666' })]
        }),

        dividerLine(PURPLE),

        // INVOICE title
        new Paragraph({
          spacing: { before: 200, after: 80 },
          children: [new TextRun({ text: `INVOICE — ${typeLabel}`, font: 'Arial', size: 32, bold: true, color: PURPLE })]
        }),

        // Invoice ref and date row
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [4513, 4513],
          borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideH: noBorder, insideV: noBorder },
          rows: [new TableRow({
            children: [
              cell([
                para('Invoice reference', { size: 16, color: '888888' }),
                para(invoiceRef || `${invoiceType === 'deposit' ? 'INV-DEP' : invoiceType === 'balance' ? 'INV-BAL' : 'VO'}-${project.ref}`, { size: 20, bold: true }),
              ], { width: 4513 }),
              cell([
                para('Date issued', { size: 16, color: '888888' }),
                para(dateStr, { size: 20, bold: true }),
              ], { width: 4513 }),
            ]
          })]
        }),

        new Paragraph({ spacing: { before: 120, after: 0 }, children: [new TextRun('')] }),

        // To / Project ref row
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [4513, 4513],
          borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideH: noBorder, insideV: noBorder },
          rows: [new TableRow({
            children: [
              cell([
                para('To', { size: 16, color: '888888' }),
                ...addressLines.map(l => para(l, { size: 20, bold: l === project.client_name })),
              ], { width: 4513 }),
              cell([
                para('Project reference', { size: 16, color: '888888' }),
                para(project.ref, { size: 20, bold: true }),
              ], { width: 4513 }),
            ]
          })]
        }),

        new Paragraph({ spacing: { before: 240, after: 0 }, children: [new TextRun('')] }),
        dividerLine('CCCCCC'),

        // Description header row
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [6269, 2757],
          borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideH: noBorder, insideV: noBorder },
          rows: [
            // Header
            new TableRow({
              children: [
                cell(para('Description', { size: 18, bold: true, color: WHITE }), { width: 6269, shade: PURPLE }),
                cell(para('Amount', { size: 18, bold: true, color: WHITE, align: AlignmentType.RIGHT }), { width: 2757, shade: PURPLE }),
              ]
            }),
            // Content
            new TableRow({
              children: [
                cell(para(description, { size: 18 }), { width: 6269, shade: LIGHT_GREY }),
                cell(para(amountFormatted, { size: 20, bold: true, align: AlignmentType.RIGHT }), { width: 2757, shade: LIGHT_GREY }),
              ]
            }),
            // Total row
            new TableRow({
              children: [
                cell(para('Total due', { size: 20, bold: true, align: AlignmentType.RIGHT }), { width: 6269 }),
                cell(para(amountFormatted, { size: 22, bold: true, color: PURPLE, align: AlignmentType.RIGHT }), { width: 2757 }),
              ]
            }),
          ]
        }),

        new Paragraph({ spacing: { before: 200, after: 0 }, children: [new TextRun('')] }),

        // Payment details
        para('Payment Details', { size: 22, bold: true, color: PURPLE, spaceBefore: 120 }),
        dividerLine('CCCCCC'),

        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [2200, 6826],
          borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideH: noBorder, insideV: noBorder },
          rows: [
            new TableRow({ children: [cell(para('Bank', { size: 18, color: '888888' }), { width: 2200 }), cell(para('Monzo', { size: 18 }), { width: 6826 })] }),
            new TableRow({ children: [cell(para('Account name', { size: 18, color: '888888' }), { width: 2200 }), cell(para('ARX Engineers Ltd', { size: 18 }), { width: 6826 })] }),
            new TableRow({ children: [cell(para('Sort code', { size: 18, color: '888888' }), { width: 2200 }), cell(para('04-00-03', { size: 18 }), { width: 6826 })] }),
            new TableRow({ children: [cell(para('Account number', { size: 18, color: '888888' }), { width: 2200 }), cell(para('81677090', { size: 18 }), { width: 6826 })] }),
            new TableRow({ children: [cell(para('Reference', { size: 18, color: '888888' }), { width: 2200 }), cell(para(project.ref, { size: 18, bold: true }), { width: 6826 })] }),
            new TableRow({ children: [cell(para('Payment due', { size: 18, color: '888888' }), { width: 2200 }), cell(para(dueDateStr, { size: 18, bold: true }), { width: 6826 })] }),
          ]
        }),

        new Paragraph({ spacing: { before: 200, after: 0 }, children: [new TextRun('')] }),
        dividerLine('CCCCCC'),

        // Footer terms
        para(
          'Payment is due within 28 days of invoice. Monies not paid within that period shall attract interest in accordance with The Late Payment of Commercial Debts (Interest) Act 1998. ARX Engineers Ltd is registered in England & Wales, Company No. 16198467.',
          { size: 16, color: '888888', spaceBefore: 80 }
        ),
      ]
    }]
  })

  const blob = await Packer.toBlob(doc)
  return blob
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
