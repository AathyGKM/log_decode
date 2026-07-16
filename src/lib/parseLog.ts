//This file parses a raw device log CSV (in either the "Date, Time, Event" or "Timestamp, Code" format) into an array of LogRow records.

import type { LogRow } from '../types'

const KNOWN_SOURCES = ['NBIT', 'LWM2M', 'SNSR', 'FLSV', 'GKCOAP', 'LOGG', 'M95M01']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function extractSource(event: string): string {
  const colon = event.indexOf(':')
  if (colon === -1) return 'UNKNOWN'
  const prefix = event.substring(0, colon).trim()
  return KNOWN_SOURCES.includes(prefix) ? prefix : 'UNKNOWN'
}

// Converts "DD/MM/YY" → "DD-Mon-YYYY" (e.g. "08/07/22" → "08-Jul-2022")
function convertDate(ddmmyy: string): string {
  const parts = ddmmyy.split('/')
  if (parts.length !== 3) return ddmmyy
  const day = parts[0].padStart(2, '0')
  const monthIdx = parseInt(parts[1], 10) - 1
  const year = 2000 + parseInt(parts[2], 10)
  const month = MONTHS[monthIdx] ?? parts[1]
  return `${day}-${month}-${year}`
}

export function parseLog(csvText: string): LogRow[] {
  const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  const firstLine = lines[0].toLowerCase()

  // Format 2: "Timestamp, Code" — combined date+time in one column
  if (firstLine.startsWith('timestamp')) {
    const rows: LogRow[] = []
    for (const line of lines.slice(1)) {
      const commaIdx = line.indexOf(',')
      if (commaIdx === -1) continue
      const timestamp = line.substring(0, commaIdx).trim()
      const event = line.substring(commaIdx + 1).trim()
      if (!timestamp || !event) continue
      const spaceIdx = timestamp.indexOf(' ')
      const datePart = spaceIdx !== -1 ? timestamp.substring(0, spaceIdx) : timestamp
      const timePart = spaceIdx !== -1 ? timestamp.substring(spaceIdx + 1) : ''
      const date = convertDate(datePart)
      rows.push({ date, time: timePart, event, source: extractSource(event) })
    }
    return rows
  }

  // Format 1: "Date, Time, Event" — original 3-column format
  const dataLines = firstLine.startsWith('date') || firstLine.startsWith('"date') ? lines.slice(1) : lines
  const rows: LogRow[] = []
  for (const line of dataLines) {
    const parts = line.split(',')
    if (parts.length < 3) continue
    const date = parts[0].trim()
    const time = parts[1].trim()
    const event = parts.slice(2).join(',').trim()
    if (!date || !time || !event) continue
    rows.push({ date, time, event, source: extractSource(event) })
  }
  return rows
}
