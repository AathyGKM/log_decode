import type { CombinedItem, DecodedRow, TimelineSession, UnifiedItem } from '../types'
import type { TransmissionRange } from './matchTransmissions'
import { parseDateTime, compareDateTime } from './dateTime'

interface SessionRange {
  session: TimelineSession
  startMs: number
  endMs: number
}

export function buildUnifiedView(
  rows: DecodedRow[],
  transmissionRanges: TransmissionRange[],
  sessions: TimelineSession[],
): UnifiedItem[] {
  const sorted = [...rows].sort(compareDateTime)

  const sortedSessions = [...sessions].sort(
    (a, b) => parseDateTime(a.date, a.startTime).getTime() - parseDateTime(b.date, b.startTime).getTime()
  )

  const sessionRanges: SessionRange[] = sortedSessions.map(s => {
    const startMs = parseDateTime(s.date, s.startTime).getTime()
    let endMs = parseDateTime(s.date, s.endTime).getTime()
    if (endMs < startMs) endMs += 24 * 60 * 60 * 1000
    return { session: s, startMs, endMs }
  })

  function findSession(row: DecodedRow): TimelineSession | undefined {
    const rowMs = parseDateTime(row.date, row.time).getTime()
    return sessionRanges.find(r => rowMs >= r.startMs && rowMs <= r.endMs)?.session
  }

  // A transmission range can legitimately begin with a "next dispatch/sample
  // time" reminder row that is logged before its session's ACTIVE marker
  // (i.e. it falls in the gap between sessions) — that's fine, it still
  // belongs to the session it concludes in. But some pattern matches span
  // much further than intended (a "find anywhere" sequence item can leap over
  // an entire intervening real session). So every row in the span must
  // resolve to either no session (gap) or the same single session — if a
  // second, different real session shows up anywhere inside the span, the
  // range is rejected outright rather than silently swallowing that other
  // session's rows.
  function resolveHomeSession(range: TransmissionRange): TimelineSession | undefined | 'conflict' {
    let home: TimelineSession | undefined
    for (let k = range.startRowIdx; k <= range.endRowIdx; k++) {
      const s = findSession(sorted[k])
      if (!s) continue
      if (home && home.id !== s.id) return 'conflict'
      home = s
    }
    return home
  }

  // Drop overlapping transmission ranges (first-by-start-row wins). This is an
  // embed-layer-only rule — it does not affect matchTransmissions()'s own
  // output used elsewhere (Summary, Transmissions view, counts).
  const sortedRanges = [...transmissionRanges].sort((a, b) => a.startRowIdx - b.startRowIdx)
  const rangeByStartIdx = new Map<number, { range: TransmissionRange; homeSession: TimelineSession | undefined }>()
  let watermark = -1
  for (const range of sortedRanges) {
    if (range.startRowIdx <= watermark) continue
    const home = resolveHomeSession(range)
    if (home === 'conflict') continue
    rangeByStartIdx.set(range.startRowIdx, { range, homeSession: home })
    watermark = range.endRowIdx
  }

  // A row/range that doesn't fall inside any session either predates the very
  // first session (true presession) or sits in the gap between two sessions
  // (or after the last one) — those should surface as their own group
  // positioned right at that gap, not be lumped into one global bucket at the
  // top of the view.
  function resolveOrphanSlot(refRow: DecodedRow): { presession: true } | { gapAfterSessionId: number } {
    const rowMs = parseDateTime(refRow.date, refRow.time).getTime()
    if (sessionRanges.length === 0 || rowMs < sessionRanges[0].startMs) return { presession: true }
    const nextIdx = sessionRanges.findIndex(r => r.startMs > rowMs)
    const precedingIdx = nextIdx === -1 ? sessionRanges.length - 1 : nextIdx - 1
    return { gapAfterSessionId: sessionRanges[precedingIdx].session.id }
  }

  const preSessionItems: CombinedItem[] = []
  const sessionItemsMap = new Map<number, CombinedItem[]>()
  const gapItemsMap = new Map<number, CombinedItem[]>() // keyed by the session id the gap immediately follows

  function pushItem(item: CombinedItem, session: TimelineSession | undefined, refRow: DecodedRow) {
    if (session) {
      if (!sessionItemsMap.has(session.id)) sessionItemsMap.set(session.id, [])
      sessionItemsMap.get(session.id)!.push(item)
      return
    }
    const slot = resolveOrphanSlot(refRow)
    if ('presession' in slot) {
      preSessionItems.push(item)
    } else {
      if (!gapItemsMap.has(slot.gapAfterSessionId)) gapItemsMap.set(slot.gapAfterSessionId, [])
      gapItemsMap.get(slot.gapAfterSessionId)!.push(item)
    }
  }

  let i = 0
  while (i < sorted.length) {
    const entry = rangeByStartIdx.get(i)
    if (entry) {
      pushItem(
        { kind: 'transmission', data: entry.range.transmission },
        entry.homeSession,
        sorted[entry.range.startRowIdx],
      )
      i = entry.range.endRowIdx + 1
      continue
    }
    pushItem({ kind: 'row', data: sorted[i] }, findSession(sorted[i]), sorted[i])
    i += 1
  }

  const result: UnifiedItem[] = []

  if (preSessionItems.length > 0) {
    result.push({ kind: 'presession', items: preSessionItems })
  }

  for (const session of sortedSessions) {
    result.push({
      kind: 'session',
      data: session,
      items: sessionItemsMap.get(session.id) ?? [],
      gapBefore: session.gapBefore,
    })

    const gapItems = gapItemsMap.get(session.id)
    if (gapItems && gapItems.length > 0) {
      result.push({ kind: 'gap', items: gapItems })
    }
  }

  return result
}
