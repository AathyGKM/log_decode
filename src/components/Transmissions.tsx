import { useState } from 'react'
import type { Transmission, TimelineEvent } from '../types'

interface Props {
  transmissions: Transmission[]
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

export function Transmissions({ transmissions }: Props) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  const toggleCollapse = (id: number) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const healthy = transmissions.filter(t => t.status === 'healthy').length
  const warned = transmissions.filter(t => t.status === 'warning').length
  const errored = transmissions.filter(t => t.status === 'error').length

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-gray-800">Transmissions</h2>
          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
            {transmissions.length} detected
          </span>
        </div>
        <div className="flex gap-2 text-xs">
          {healthy > 0 && (
            <span className="flex items-center gap-1 text-green-700">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              {healthy} healthy
            </span>
          )}
          {warned > 0 && (
            <span className="flex items-center gap-1 text-amber-700">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              {warned} warning
            </span>
          )}
          {errored > 0 && (
            <span className="flex items-center gap-1 text-red-700">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {errored} error
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {transmissions.length === 0 ? (
          <p className="text-sm text-gray-400 italic text-center py-4">
            No transmissions matched the defined patterns.
            Edit <code className="font-mono text-xs bg-gray-100 px-1 rounded">public/transmission_patterns.json</code> to adjust.
          </p>
        ) : (
          transmissions.map(tx => {
            const isCollapsed = collapsed.has(tx.id)
            return (
              <div key={tx.id} className="border rounded-lg overflow-hidden">
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
                    {tx.events.map((evt, i) => (
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
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
