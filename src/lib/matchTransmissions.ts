//This file matches sequences of decoded rows against the transmission patterns to detect and group known multi-step transmission events (e.g. standard reading, alarm transmissions).

import type { DecodedRow, TransmissionPattern, Transmission, TimelineEvent } from '../types'
import { compareDateTime } from './dateTime'

export interface TransmissionRange {
  transmission: Transmission
  startRowIdx: number
  endRowIdx: number
}

function toTimelineEvent(row: DecodedRow): TimelineEvent {
  return {
    time: row.time,
    source: row.source,
    event: row.event,
    explanation: row.explanation,
    severity: row.severity,
  }
}

function transmissionStatus(events: TimelineEvent[]): Transmission['status'] {
  if (events.some(e => e.severity === 'error')) return 'error'
  if (events.some(e => e.severity === 'warning')) return 'warning'
  return 'healthy'
}

export function matchTransmissionRanges(
  rows: DecodedRow[],
  patterns: TransmissionPattern[],
): TransmissionRange[] {
  const sorted = [...rows].sort(compareDateTime)

  const results: TransmissionRange[] = []

  for (const pattern of patterns) {
    const { sequence } = pattern
    if (sequence.length === 0) continue

    const firstItem = sequence[0]
    const firstAnchor = Array.isArray(firstItem) ? firstItem[0] : firstItem

    let i = 0
    while (i < sorted.length) {
      if (!sorted[i].event.includes(firstAnchor)) { i++; continue }

      const matchStartIdx = i
      let j = i
      let succeeded = true

      for (const item of sequence) {
        if (typeof item === 'string') {
          // Find this substring anywhere from j onwards
          while (j < sorted.length && !sorted[j].event.includes(item)) j++
          if (j >= sorted.length) { succeeded = false; break }
          j++
        } else {
          // Consecutive group: find item[0] anywhere, then item[1..] must be in immediately following rows
          while (j < sorted.length && !sorted[j].event.includes(item[0])) j++
          if (j >= sorted.length) { succeeded = false; break }
          let p = j + 1
          let consecutive = true
          for (let k = 1; k < item.length; k++) {
            if (p >= sorted.length || !sorted[p].event.includes(item[k])) {
              consecutive = false; break
            }
            p++
          }
          if (!consecutive) { succeeded = false; break }
          j = p
        }
      }

      if (succeeded) {
        const matchRows = sorted.slice(matchStartIdx, j)
        const events = matchRows.map(toTimelineEvent)
        results.push({
          transmission: {
            id: 0,
            patternId: pattern.id,
            patternLabel: pattern.label,
            date: sorted[matchStartIdx].date,
            startTime: sorted[matchStartIdx].time,
            endTime: sorted[j - 1].time,
            events,
            status: transmissionStatus(events),
          },
          startRowIdx: matchStartIdx,
          endRowIdx: j - 1,
        })
        i = j
      } else {
        i++
      }
    }
  }

  results.sort((a, b) =>
    compareDateTime(
      { date: a.transmission.date, time: a.transmission.startTime },
      { date: b.transmission.date, time: b.transmission.startTime },
    )
  )
  results.forEach((r, idx) => { r.transmission.id = idx + 1 })

  return results
}

export function matchTransmissions(
  rows: DecodedRow[],
  patterns: TransmissionPattern[],
): Transmission[] {
  return matchTransmissionRanges(rows, patterns).map(r => r.transmission)
}
