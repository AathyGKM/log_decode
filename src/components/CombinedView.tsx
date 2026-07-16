import { useEffect, useState } from 'react'
import type { CombinedItem, DecodedRow, Transmission, TimelineEvent, TimelineSession, UnifiedItem } from '../types'
import { rowKey } from '../lib/rowKey'
import { parseDateTime } from '../lib/dateTime'

interface Props {
  items: UnifiedItem[]
  sessions: TimelineSession[]
  transmissions: Transmission[]
  rows: DecodedRow[]
  scrollTargetKey?: string | null
  scrollNonce?: number
  fileName?: string
  summaryAnchorId?: string
}

// Locates which session (and, if applicable, which nested transmission or
// gap group) a target event belongs to, so it can be expanded before
// scrolling to it.
function locateTarget(
  items: UnifiedItem[],
  targetKey: string,
): { sessionId?: number; transmissionId?: number; gapIndex?: number } | null {
  for (const [idx, item] of items.entries()) {
    if (item.kind === 'presession' || item.kind === 'gap') {
      for (const ci of item.items) {
        if (ci.kind === 'row' && rowKey(ci.data.date, ci.data.time, ci.data.event) === targetKey) {
          return item.kind === 'gap' ? { gapIndex: idx } : {}
        }
        if (ci.kind === 'transmission' && ci.data.events.some(e => rowKey(ci.data.date, e.time, e.event) === targetKey)) {
          return item.kind === 'gap' ? { gapIndex: idx } : {}
        }
      }
      continue
    }
    for (const ci of item.items) {
      if (ci.kind === 'row' && rowKey(ci.data.date, ci.data.time, ci.data.event) === targetKey) {
        return { sessionId: item.data.id }
      }
      if (ci.kind === 'transmission') {
        const tx = ci.data
        if (tx.events.some(e => rowKey(tx.date, e.time, e.event) === targetKey)) {
          return { sessionId: item.data.id, transmissionId: tx.id }
        }
      }
    }
  }
  return null
}

const SOURCE_COLOURS: Record<string, string> = {
  NBIT: 'bg-blue-50 text-blue-800',
  LWM2M: 'bg-green-50 text-green-800',
  SNSR: 'bg-amber-50 text-amber-800',
  FLSV: 'bg-pink-50 text-pink-800',
  GKCOAP: 'bg-purple-50 text-purple-800',
  LOGG: 'bg-gray-100 text-gray-700',
  M95M01: 'bg-orange-50 text-orange-800',
  UNKNOWN: 'bg-gray-100 text-gray-500',
}

function rowBg(severity: DecodedRow['severity']): string {
  if (severity === 'error') return 'bg-red-50'
  if (severity === 'warning') return 'bg-amber-50'
  return ''
}

function severityDot(severity: TimelineEvent['severity']): string {
  if (severity === 'error') return 'bg-red-500'
  if (severity === 'warning') return 'bg-amber-400'
  if (severity === 'info') return 'bg-blue-400'
  return 'bg-gray-300'
}

function severityBorder(severity: TimelineEvent['severity']): string {
  if (severity === 'error') return 'border-red-300 bg-red-50'
  if (severity === 'warning') return 'border-amber-300 bg-amber-50'
  if (severity === 'info') return 'border-blue-200 bg-blue-50'
  return 'border-gray-200 bg-white'
}

function statusDot(status: Transmission['status']): string {
  if (status === 'error') return 'bg-red-500 ring-red-200'
  if (status === 'warning') return 'bg-amber-400 ring-amber-200'
  return 'bg-green-500 ring-green-200'
}

function statusHeaderBg(status: Transmission['status']): string {
  if (status === 'error') return 'bg-red-50 border-red-200'
  if (status === 'warning') return 'bg-amber-50 border-amber-200'
  return 'bg-green-50 border-green-200'
}

function sessionDot(status: TimelineSession['status']): string {
  if (status === 'error') return 'bg-red-500 ring-red-200'
  if (status === 'warning') return 'bg-amber-400 ring-amber-200'
  if (status === 'info') return 'bg-gray-300 ring-gray-100'
  return 'bg-green-500 ring-green-200'
}

function sessionHeaderBg(status: TimelineSession['status']): string {
  if (status === 'error') return 'bg-red-50 border-red-200'
  if (status === 'warning') return 'bg-amber-50 border-amber-200'
  if (status === 'info') return 'bg-gray-50 border-gray-200'
  return 'bg-green-50 border-green-200'
}

function timeDiffSeconds(t1: string, t2: string): number {
  const [h1, m1, s1] = t1.split(':').map(Number)
  const [h2, m2, s2] = t2.split(':').map(Number)
  return (h2 * 3600 + m2 * 60 + s2) - (h1 * 3600 + m1 * 60 + s1)
}

function formatDuration(sec: number): string {
  if (sec <= 0) return '<1s'
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

function combinedItemStart(ci: CombinedItem): { date: string; time: string } {
  return ci.kind === 'row'
    ? { date: ci.data.date, time: ci.data.time }
    : { date: ci.data.date, time: ci.data.startTime }
}

function combinedItemEnd(ci: CombinedItem): { date: string; time: string } {
  return ci.kind === 'row'
    ? { date: ci.data.date, time: ci.data.time }
    : { date: ci.data.date, time: ci.data.endTime }
}

function combinedItemEventCount(ci: CombinedItem): number {
  return ci.kind === 'row' ? 1 : ci.data.events.length
}

function exportCsv(rows: DecodedRow[], fileName?: string) {
  const header = 'Date,Time,Source,Event,Explanation,Matched,Severity'
  const body = rows.map(r =>
    [
      r.date,
      r.time,
      r.source,
      `"${r.event.replace(/"/g, '""')}"`,
      `"${r.explanation.replace(/"/g, '""')}"`,
      r.matched,
      r.severity,
    ].join(',')
  )
  const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const baseName = fileName ? fileName.replace(/\.csv$/i, '') : 'decoded-log'
  a.download = `decoded-${baseName}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function CombinedView({ items, sessions, transmissions, rows, scrollTargetKey, scrollNonce, fileName, summaryAnchorId }: Props) {
  const allSources = [...new Set(rows.map(r => r.source))].sort()
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [collapsedSessions, setCollapsedSessions] = useState<Set<number>>(new Set())
  const [collapsedGaps, setCollapsedGaps] = useState<Set<number>>(new Set())
  const [highlightKey, setHighlightKey] = useState<string | null>(null)

  // Navigate to (expand + scroll to + briefly highlight) a specific event,
  // e.g. when the user clicks an error/warning in the Summary panel.
  useEffect(() => {
    if (!scrollTargetKey) return
    const target = locateTarget(items, scrollTargetKey)
    if (!target) return

    setActiveFilters(new Set())

    if (target.sessionId !== undefined) {
      setCollapsedSessions(prev => {
        if (!prev.has(target.sessionId!)) return prev
        const next = new Set(prev)
        next.delete(target.sessionId!)
        return next
      })
    }
    if (target.transmissionId !== undefined) {
      setCollapsed(prev => {
        if (!prev.has(target.transmissionId!)) return prev
        const next = new Set(prev)
        next.delete(target.transmissionId!)
        return next
      })
    }
    if (target.gapIndex !== undefined) {
      setCollapsedGaps(prev => {
        if (!prev.has(target.gapIndex!)) return prev
        const next = new Set(prev)
        next.delete(target.gapIndex!)
        return next
      })
    }

    setHighlightKey(scrollTargetKey)
    const scrollTimer = setTimeout(() => {
      document.getElementById(scrollTargetKey)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
    const clearTimer = setTimeout(() => setHighlightKey(null), 2500)
    return () => { clearTimeout(scrollTimer); clearTimeout(clearTimer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollNonce])

  const toggleFilter = (src: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev)
      if (next.has(src)) next.delete(src)
      else next.add(src)
      return next
    })
  }

  const toggleCollapse = (id: number) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSession = (id: number) => {
    setCollapsedSessions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleGap = (idx: number) => {
    setCollapsedGaps(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const expandAll = () => {
    setCollapsed(new Set())
    setCollapsedSessions(new Set())
    setCollapsedGaps(new Set())
  }
  const collapseAll = () => {
    setCollapsed(new Set(transmissions.map(t => t.id)))
    setCollapsedGaps(new Set(items.reduce<number[]>((acc, it, idx) => (it.kind === 'gap' ? [...acc, idx] : acc), [])))
    setCollapsedSessions(new Set(sessions.map(s => s.id)))
  }

  const matchedCount = rows.filter(r => r.matched).length
  const startDate = rows[0]?.date ?? ''
  const endDate = rows[rows.length - 1]?.date ?? ''

  function renderCombinedItem(ci: CombinedItem, key: string) {
    if (ci.kind === 'transmission') {
      const tx = ci.data
      const isCollapsed = collapsed.has(tx.id)
      return (
        <div key={key} className="mx-3 my-2 border rounded-lg overflow-hidden">
          <button
            onClick={() => toggleCollapse(tx.id)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 border-b text-left ${statusHeaderBg(tx.status)}`}
          >
            <span className={`h-3 w-3 rounded-full ring-2 flex-shrink-0 ${statusDot(tx.status)}`} />
            <div className="flex-1 min-w-0">
              <span className="font-medium text-sm text-gray-800">
                #{tx.id} — {tx.patternLabel}
              </span>
              <span className="ml-2 text-xs text-gray-500">
                {tx.date} · {tx.startTime}–{tx.endTime}
              </span>
            </div>
            <span className="text-xs text-gray-400 flex-shrink-0">
              {tx.events.length} events
            </span>
            <svg
              className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {!isCollapsed && (
            <div className="px-4 py-3 space-y-1.5">
              {tx.events.map((evt, i) => {
                const evtKey = rowKey(tx.date, evt.time, evt.event)
                const isHighlighted = evtKey === highlightKey
                return (
                  <div
                    key={i}
                    id={evtKey}
                    className={`flex gap-3 items-start p-2 rounded border text-xs ${severityBorder(evt.severity)} ${isHighlighted ? 'ring-2 ring-blue-500' : ''}`}
                  >
                    <span className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${severityDot(evt.severity)}`} />
                    <span className="font-mono text-gray-500 flex-shrink-0 w-16">{evt.time}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${SOURCE_COLOURS[evt.source] ?? 'bg-gray-100 text-gray-600'}`}>
                      {evt.source}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-800 font-medium">{evt.explanation}</div>
                      <div className="font-mono text-gray-400 truncate mt-0.5" title={evt.event}>{evt.event}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    const row = ci.data
    if (activeFilters.size > 0 && !activeFilters.has(row.source)) return null
    const rKey = rowKey(row.date, row.time, row.event)
    const isHighlighted = rKey === highlightKey
    return (
      <div
        key={key}
        id={rKey}
        className={`flex items-start gap-2 px-4 py-1.5 text-xs ${rowBg(row.severity)} ${isHighlighted ? 'ring-2 ring-blue-500' : ''}`}
      >
        <span className="text-gray-500 whitespace-nowrap w-24 flex-shrink-0">{row.date}</span>
        <span className="font-mono text-gray-500 whitespace-nowrap w-16 flex-shrink-0">{row.time}</span>
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${SOURCE_COLOURS[row.source] ?? 'bg-gray-100 text-gray-600'}`}>
          {row.source}
        </span>
        <span className="font-mono text-gray-600 truncate flex-1 min-w-0" title={row.event}>{row.event}</span>
        <span className={`flex-shrink-0 w-56 truncate ${row.matched ? 'text-gray-700' : 'text-gray-400 italic'}`} title={row.explanation}>
          {row.explanation}
        </span>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-gray-800">Events &amp; Transmissions</h2>
          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
            {rows.length} events · {sessions.length} sessions · {transmissions.length} transmissions
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="text-xs px-2.5 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
          >
            Expand All
          </button>
          {summaryAnchorId && (
            <button
              onClick={() => document.getElementById(summaryAnchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="text-xs px-2.5 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
            >
              Go to Summary
            </button>
          )}
          <button
            onClick={collapseAll}
            className="text-xs px-2.5 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
          >
            Collapse All
          </button>
          <button
            onClick={() => exportCsv(rows, fileName)}
            className="text-xs px-2.5 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats + source filter */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex gap-3 text-gray-500">
          <span><strong className="text-gray-700">{rows.length.toLocaleString()}</strong> events</span>
          {startDate && <span>{startDate}{endDate !== startDate ? ` → ${endDate}` : ''}</span>}
          <span><strong className="text-green-700">{matchedCount.toLocaleString()}</strong> matched</span>
          <span><strong className="text-orange-600">{(rows.length - matchedCount).toLocaleString()}</strong> unmatched</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-gray-500">Source:</span>
          {allSources.map(src => (
            <button
              key={src}
              onClick={() => toggleFilter(src)}
              className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                activeFilters.has(src)
                  ? 'border-blue-500 bg-blue-500 text-white'
                  : `${SOURCE_COLOURS[src] ?? 'bg-gray-100 text-gray-600'} border-transparent`
              }`}
            >
              {src}
            </button>
          ))}
          {activeFilters.size > 0 && (
            <button
              onClick={() => setActiveFilters(new Set())}
              className="text-gray-400 hover:text-gray-600 underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Unified chronological list */}
      <div className="divide-y divide-gray-100">
        {items.map((item, idx) => {
          if (item.kind === 'presession') {
            return (
              <div key="presession">
                {item.items.map((ci, i) => renderCombinedItem(ci, `pre-${i}`))}
              </div>
            )
          }

          if (item.kind === 'gap') {
            const isGapCollapsed = collapsedGaps.has(idx)
            const first = combinedItemStart(item.items[0])
            const last = combinedItemEnd(item.items[item.items.length - 1])
            const durationSec = Math.max(
              0,
              Math.round((parseDateTime(last.date, last.time).getTime() - parseDateTime(first.date, first.time).getTime()) / 1000)
            )
            const eventCount = item.items.reduce((n, ci) => n + combinedItemEventCount(ci), 0)
            return (
              <div key={`gap-${idx}`} className="bg-gray-50/50">
                <button
                  onClick={() => toggleGap(idx)}
                  className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-100"
                >
                  <span className="h-3 w-3 rounded-full ring-2 flex-shrink-0 bg-gray-300 ring-gray-100" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-gray-500 font-medium">Events between sessions</span>
                    <span className="ml-2 text-xs text-gray-400">
                      {first.date}{last.date !== first.date ? ` ${first.time} – ${last.date} ${last.time}` : ` · ${first.time}–${last.time}`}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {formatDuration(durationSec)}
                  </span>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {eventCount} events
                  </span>
                  <svg
                    className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${isGapCollapsed ? '-rotate-90' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {!isGapCollapsed && item.items.map((ci, i) => renderCombinedItem(ci, `gap-${idx}-${i}`))}
              </div>
            )
          }

          const session = item.data
          const isSessionCollapsed = collapsedSessions.has(session.id)
          return (
            <div key={`session-${session.id}`}>
              {item.gapBefore && (
                <div className="flex items-center gap-3 px-4 py-2 bg-gray-50/50">
                  <span className="h-3 w-3 rounded-full ring-2 flex-shrink-0 bg-gray-300 ring-gray-100" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-gray-500 font-medium">Gap</span>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{item.gapBefore}</span>
                </div>
              )}
              <button
                onClick={() => toggleSession(session.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 border-b text-left ${sessionHeaderBg(session.status)}`}
              >
                <span className={`h-3 w-3 rounded-full ring-2 flex-shrink-0 ${sessionDot(session.status)}`} />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm text-gray-800">{session.label}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    {session.date} · {session.startTime}–{session.endTime}
                  </span>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {formatDuration(timeDiffSeconds(session.startTime, session.endTime))}
                </span>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {session.events.length} events
                </span>
                <svg
                  className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${isSessionCollapsed ? '-rotate-90' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {!isSessionCollapsed && (
                <div className="pl-3 divide-y divide-gray-50 border-l-4 border-gray-100 ml-4 my-1">
                  {item.items.map((ci, i) => renderCombinedItem(ci, `s${session.id}-${i}`))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200 flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="font-medium text-gray-600">Legend:</span>
        {[
          { colour: 'bg-red-500', label: 'Error' },
          { colour: 'bg-amber-400', label: 'Warning' },
          { colour: 'bg-gray-300', label: 'Normal' },
          { colour: 'bg-blue-400', label: 'Informational' },
        ].map(({ colour, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${colour}`} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-px w-5 border-t border-dashed border-gray-400" />
          Time gap
        </span>
      </div>
    </div>
  )
}
