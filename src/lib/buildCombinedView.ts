//This file is an alternative, currently unused merger of sessions and rows into a single combined view (kept for reference; buildUnifiedView.ts is the one actually used by the app).

import type { DecodedRow, Transmission, CombinedItem } from '../types'

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
}

function parseDateTime(date: string, time: string): Date {
  const parts = date.split('-')
  if (parts.length === 3 && isNaN(Number(parts[1]))) {
    const day = parseInt(parts[0], 10)
    const month = MONTH_MAP[parts[1]] ?? 0
    const year = parseInt(parts[2], 10)
    const [h, m, s] = time.split(':').map(Number)
    return new Date(year, month, day, h, m, s)
  }
  return new Date(`${date} ${time}`)
}

export function buildCombinedView(rows: DecodedRow[], transmissions: Transmission[]): CombinedItem[] {
  const sorted = [...rows].sort(
    (a, b) => parseDateTime(a.date, a.time).getTime() - parseDateTime(b.date, b.time).getTime()
  )

  // Map "time|event" → Transmission for every event claimed by a transmission
  const claimedBy = new Map<string, Transmission>()
  for (const tx of transmissions) {
    for (const evt of tx.events) {
      claimedBy.set(`${evt.time}|${evt.event}`, tx)
    }
  }

  const result: CombinedItem[] = []
  const emittedIds = new Set<number>()

  for (const row of sorted) {
    const tx = claimedBy.get(`${row.time}|${row.event}`)
    if (tx) {
      if (!emittedIds.has(tx.id)) {
        result.push({ kind: 'transmission', data: tx })
        emittedIds.add(tx.id)
      }
      // Subsequent rows belonging to this transmission are absorbed into the group
    } else {
      result.push({ kind: 'row', data: row })
    }
  }

  return result
}
