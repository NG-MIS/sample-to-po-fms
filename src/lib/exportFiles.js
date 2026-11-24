import { formatDateTime, todayLocal } from './format.js'

// Export and import helpers shared by every list.
// The heavier libraries (PDF, Excel) are only loaded at the moment they are needed.

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// "User master 2026-11-24"
export function fileBaseName(title) {
  return `${title.replace(/[\\/:*?"<>|]+/g, ' ').trim()} ${todayLocal()}`
}

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value)
  // A cell that starts with = + - or @ could be run as a formula when the file is opened.
  if (/^[=+\-@\t\r]/.test(text) && typeof value !== 'number') text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function exportCsv(title, headers, rows) {
  // The marker at the start makes Excel read names in any language correctly.
  const blob = new Blob(['﻿', toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' })
  downloadBlob(blob, `${fileBaseName(title)}.csv`)
}

async function excelBlob(sheets) {
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  return writeExcelFile(sheets).toBlob()
}

const boldRow = (cells) => cells.map((value) => ({ value, fontWeight: 'bold' }))
const widthsFor = (headers, rows) =>
  headers.map((header, index) => {
    const longest = rows.reduce((max, row) => Math.max(max, String(row[index] ?? '').length), String(header).length)
    return { width: Math.min(Math.max(longest + 2, 10), 50) }
  })

export async function exportExcel(title, headers, rows) {
  const blob = await excelBlob([
    {
      data: [boldRow(headers), ...rows.map((row) => row.map((value) => (value === '' ? null : value)))],
      sheet: title.slice(0, 31),
      columns: widthsFor(headers, rows),
      stickyRowsCount: 1,
    },
  ])
  downloadBlob(blob, `${fileBaseName(title)}.xlsx`)
}

export async function exportPdf(title, headers, rows, note) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: headers.length > 5 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
  doc.setFontSize(14)
  doc.text(title, 40, 40)
  doc.setFontSize(9)
  doc.setTextColor(90)
  doc.text([`Exported ${formatDateTime(new Date())}`, `${rows.length} rows`, note].filter(Boolean).join('   |   '), 40, 56)
  autoTable(doc, {
    head: [headers],
    body: rows.map((row) => row.map((value) => (value === null || value === undefined ? '' : String(value)))),
    startY: 68,
    margin: { left: 40, right: 40 },
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [8, 128, 93], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [242, 249, 245] },
    didDrawPage: () => {
      const page = doc.getNumberOfPages()
      doc.setFontSize(8)
      doc.setTextColor(120)
      doc.text(`Page ${page}`, doc.internal.pageSize.getWidth() - 40, doc.internal.pageSize.getHeight() - 20, {
        align: 'right',
      })
    },
  })
  doc.save(`${fileBaseName(title)}.pdf`)
}

// ---------- Import ----------

// An empty Excel file to fill in: the headings on the first sheet, and a
// second sheet that explains what goes in each column.
//   fields: [{ header, required, hint }]
export async function downloadTemplate(title, fields) {
  const headers = fields.map((field) => field.header)
  const guide = fields.map((field) => [field.header, field.required ? 'Required' : 'Optional', field.hint || ''])
  const blob = await excelBlob([
    { data: [boldRow(headers)], sheet: 'Data', columns: headers.map(() => ({ width: 24 })), stickyRowsCount: 1 },
    {
      data: [boldRow(['COLUMN', 'REQUIRED?', 'WHAT TO ENTER']), ...guide],
      sheet: 'How to fill',
      columns: [{ width: 26 }, { width: 12 }, { width: 80 }],
    },
  ])
  downloadBlob(blob, `${title} template.xlsx`)
}

// Splits CSV text into rows of cells, coping with quotes, commas and line breaks inside cells.
export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const source = text.replace(/^﻿/, '')
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

const cellText = (value) => {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).trim()
}

// Reads the first sheet of an .xlsx file, or a .csv file.
// Gives back { headers: ['NAME', ...], rows: [{ line, cells: { NAME: 'x', ... } }] }
// where `line` is the row number as the person sees it in their file.
export async function readTable(file) {
  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv'
  let grid
  if (isCsv) grid = parseCsv(await file.text())
  else if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/universal')
    grid = await readSheet(file)
  } else {
    throw new Error('Choose an Excel file (.xlsx) or a CSV file (.csv).')
  }

  const [first, ...rest] = grid
  if (!first) throw new Error('The file is empty.')
  const headers = first.map((value) => cellText(value).toUpperCase())
  const rows = rest
    .map((cells, index) => ({
      line: index + 2,
      cells: Object.fromEntries(headers.map((header, column) => [header, cellText(cells[column])])),
    }))
    .filter((row) => Object.values(row.cells).some((value) => value !== ''))
  return { headers, rows }
}

// Reads a yes/no cell. Blank gives the fallback; anything unclear gives null.
export function readYesNo(text, fallback) {
  const value = (text || '').trim().toLowerCase()
  if (value === '') return fallback
  if (['yes', 'y', 'true', '1', 'active', 'on'].includes(value)) return true
  if (['no', 'n', 'false', '0', 'inactive', 'off'].includes(value)) return false
  return null
}

export const splitList = (text) =>
  (text || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
