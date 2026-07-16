import { useState } from 'react'
import type { TimelineSession, TimelineEvent } from '../types'

interface Props {
  sessions: TimelineSession[]
}

type Filter = 'all' | 'errors' | 'connectivity' | 'lwm2m' | 'sensor'

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

function filterEvent(evt: TimelineEvent, filter: Filter): boolean {
  if (filter === 'all') return true
  if (filter === 'errors') return evt.severity === 'error' || evt.severity === 'warning'
  if (filter === 'connectivity') return evt.source === 'NBIT'
  if (filter === 'lwm2m') return evt.source === 'LWM2M'
  if (filter === 'sensor') return evt.source === 'SNSR'
  return true
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All events' },
  { key: 'errors', label: 'Errors only' },
  { key: 'connectivity', label: 'Connectivity' },
  { key: 'lwm2m', label: 'LWM2M' },
  { key: 'sensor', label: 'Sensor' },
]

export function Timeline({ sessions }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  const toggleCollapse = (id: number) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-gray-800">Session Timeline</h2>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === f.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {sessions.map(session => {
          const visibleEvents = session.events.filter(e => filterEvent(e, filter))
          const isCollapsed = collapsed.has(session.id)

          return (
            <div key={session.id}>
              {session.gapBefore && (
                <div className="flex items-center gap-2 mb-3 text-xs text-gray-400">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="px-2 py-0.5 border border-gray-200 rounded-full bg-gray-50 whitespace-nowrap">
                    {session.gapBefore}
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              )}

              <div className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleCollapse(session.id)}
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
                    {session.events.length} events
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
                    {visibleEvents.length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-2 text-center">
                        No events match the current filter
                      </p>
                    ) : (
                      visibleEvents.map((evt, i) => (
                        <div
                          key={i}
                          className={`flex gap-3 items-start p-2 rounded border text-xs ${severityBorder(evt.severity)}`}
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
                      ))
                    )}
                  </div>
                )}
              </div>
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
