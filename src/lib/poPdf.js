import { fileBaseName } from './exportFiles.js'
import { formatDate } from './format.js'
import { PO_KIND_LABEL, formatMoney, formatQty, poAmount, poLineColours } from './materials.js'

const TYPE_LABEL = { primary: 'Primary', secondary: 'Secondary' }

// One purchase order as a PDF, to send to the vendor.
export async function exportPoPdf(po, lookups) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const fabric = po.kind === 'fabric'
  const vendor = fabric ? lookups.fabricVendor.get(po.fabric_vendor_id) : lookups.accessoryVendor.get(po.accessory_vendor_id)
  const entry = lookups.entry.get(po.wishlist_entry_id)
  const sample = lookups.sample.get(po.sample_id)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const right = doc.internal.pageSize.getWidth() - 40

  doc.setFontSize(16)
  doc.text(`Purchase order ${po.po_no}`, 40, 42)
  doc.setFontSize(10)
  doc.setTextColor(60)
  const facts = [
    `Order date: ${formatDate(po.order_date)}`,
    `Vendor: ${vendor ? `${vendor.name} (${vendor.code})` : ''}`,
    `${PO_KIND_LABEL[po.kind]}${po.is_open ? ', open order' : ''}`,
    entry ? `Wishlist item: ${entry.wishlist_no}` : sample ? `Sample: ${sample.sample_no}` : '',
    sample?.design_no ? `Design no: ${sample.design_no}` : '',
    po.remarks ? `Remarks: ${po.remarks}` : '',
  ].filter(Boolean)
  doc.text(facts, 40, 60)
  if (po.status === 'cancelled') {
    doc.setTextColor(190, 40, 40)
    doc.setFontSize(14)
    doc.text('CANCELLED', right, 42, { align: 'right' })
  }

  const head = [
    fabric ? 'FABRIC NAME' : 'ACCESSORY NAME',
    fabric ? 'FABRIC TYPE' : 'TYPE',
    ...(fabric ? [] : ['DIMENSION']),
    'NO. OF COLOURS',
    'COLOURS NAME',
    'QTY',
    'TOTAL QTY',
    'RATE',
    'AMOUNT',
    'PROMISED DATE OF DELIVERY',
    ...(fabric ? ['FOLDS', 'PAINA'] : []),
  ]
  const body = po.lines.map((line) => [
    (line.fabric_id ? lookups.fabric.get(line.fabric_id)?.name : lookups.accessory.get(line.accessory_id)?.name) ?? '',
    TYPE_LABEL[line.item_type] ?? '',
    ...(fabric ? [] : [line.dimension ?? '']),
    line.colours.length || '',
    poLineColours(line, lookups),
    line.qty_text,
    `${formatQty(line.total_qty)} ${line.unit}`,
    formatMoney(line.rate),
    formatMoney(line.amount),
    formatDate(line.promised_date),
    ...(fabric ? [line.folds ?? '', line.paina === null ? '' : formatQty(line.paina)] : []),
  ])
  const amountAt = head.indexOf('AMOUNT')
  autoTable(doc, {
    head: [head],
    body: body.map((row) => row.map((value) => String(value))),
    foot: [head.map((_, index) => (index === amountAt - 1 ? 'TOTAL' : index === amountAt ? formatMoney(poAmount(po)) : ''))],
    startY: 60 + facts.length * 13,
    margin: { left: 40, right: 40 },
    styles: { fontSize: 9, cellPadding: 5, overflow: 'linebreak' },
    headStyles: { fillColor: [8, 128, 93], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [242, 249, 245], textColor: 20, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 251, 249] },
  })
  doc.save(`${fileBaseName(po.po_no)}.pdf`)
}
