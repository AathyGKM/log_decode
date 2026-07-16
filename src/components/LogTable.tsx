import { useState } from 'react'
import type { DecodedRow } from '../types'

interface Props {
  rows: DecodedRow[]
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

function exportCsv(rows: DecodedRow[]) {
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
  a.download = 'decoded-log.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export function LogTable({ rows }: Props) {
  const allSources = [...new Set(rows.map(r => r.source))].sort()
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set())

  const toggleFilter = (src: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev)
      if (next.has(src)) next.delete(src)
      else next.add(src)
      return next
    })
  }

  const filtered = activeFilters.size === 0
    ? rows
    : rows.filter(r => activeFilters.has(r.source))

  const matchedCount = rows.filter(r => r.matched).length
  const unmatchedCount = rows.length - matchedCount
  const startDate = rows[0]?.date ?? ''
  const endDate = rows[rows.length - 1]?.date ?? ''

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gray-600">Source:</span>
          {allSources.map(src => (
            <button
              key={src}
              onClick={() => toggleFilter(src)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
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
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Clear
            </button>
          )}
        </div>
        <button
          onClick={() => exportCsv(rows)}
          className="text-xs px-3 py-1.5 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50"
        >
          Export CSV
        </button>
      </div>

      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex flex-wrap gap-4 text-xs text-gray-500">
        <span><strong className="text-gray-700">{rows.length.toLocaleString()}</strong> events</span>
        {startDate && <span>{startDate}{endDate !== startDate ? ` → ${endDate}` : ''}</span>}
        <span><strong className="text-green-700">{matchedCount.toLocaleString()}</strong> matched</span>
        <span><strong className="text-orange-600">{unmatchedCount.toLocaleString()}</strong> unmatched</span>
        {filtered.length !== rows.length && (
          <span className="text-blue-600">Showing {filtered.length.toLocaleString()} filtered</span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Date</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Time</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Explanation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((row, i) => (
              <tr key={i} className={rowBg(row.severity)}>
                <td className="px-3 py-1.5 whitespace-nowrap text-gray-600 text-xs">{row.date}</td>
                <td className="px-3 py-1.5 whitespace-nowrap font-mono text-gray-600 text-xs">{row.time}</td>
                <td className="px-3 py-1.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SOURCE_COLOURS[row.source] ?? 'bg-gray-100 text-gray-600'}`}>
                    {row.source}
                  </span>
                </td>
                <td className="px-3 py-1.5 max-w-xs">
                  <span className="font-mono text-xs text-gray-700 truncate block" title={row.event}>
                    {row.event}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-gray-700 text-xs">
                  {row.matched ? row.explanation : (
                    <span className="text-gray-400 italic">{row.explanation}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
