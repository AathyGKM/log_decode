import { useCallback, useState } from 'react'
import { CombinedView } from './CombinedView'
import { Summary } from './Summary'
import { openReportWindow } from '../lib/openReportWindow'
import { rowKey } from '../lib/rowKey'
import { formatSummaryText } from '../lib/formatSummaryText'
import type { DecodedRow, PerformanceScore, SummaryStats, TimelineSession, Transmission, UnifiedItem } from '../types'

export interface FileReportPanelProps {
  id: string
  fileName: string
  decoded: DecodedRow[]
  summary: SummaryStats
  performance: PerformanceScore
  timeline: TimelineSession[]
  transmissions: Transmission[]
  unifiedItems: UnifiedItem[]
}

// DOM anchor id used by FileNavSidebar to scroll to a given file's panel.
export function filePanelAnchorId(id: string): string {
  return `file-panel-${id}`
}

// DOM anchor id used by CombinedView's "Go to Summary" button.
export function summaryAnchorId(id: string): string {
  return `summary-${id}`
}

// Shared so both a panel's own "Open in new window" button and a bulk
// "open all" action can pop the same report layout into a new window.
export function openFileReportWindow(props: FileReportPanelProps): boolean {
  return openReportWindow(
    <div className="min-h-screen bg-gray-100 p-6">
      <FileReportPanel {...props} />
    </div>,
    props.fileName,
  )
}

export function FileReportPanel({ id, fileName, decoded, summary, performance, timeline, transmissions, unifiedItems }: FileReportPanelProps) {
  const [scrollTargetKey, setScrollTargetKey] = useState<string | null>(null)
  const [scrollNonce, setScrollNonce] = useState(0)

  const handleNavigateToEvent = useCallback((row: DecodedRow) => {
    setScrollTargetKey(rowKey(row.date, row.time, row.event))
    setScrollNonce(n => n + 1)
  }, [])

  const handleOpenInNewWindow = () => {
    const ok = openFileReportWindow({ id, fileName, decoded, summary, performance, timeline, transmissions, unifiedItems })
    if (!ok) alert('Popup blocked — please allow popups for this site to open the report in a new window.')
  }

  const handleDownloadSummary = () => {
    const text = formatSummaryText(fileName, summary, performance)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
    const baseName = fileName.replace(/\.csv$/i, '')
    a.download = `summary-${baseName}-${stamp}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div id={filePanelAnchorId(id)} className="space-y-3 scroll-mt-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-gray-700">
          {fileName} <span className="text-gray-400 font-normal">— {decoded.length.toLocaleString()} events</span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadSummary}
            className="text-xs px-2.5 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 flex items-center gap-1"
          >
            Download summary (.txt)
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
            </svg>
          </button>
          <button
            onClick={handleOpenInNewWindow}
            className="text-xs px-2.5 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 flex items-center gap-1"
          >
            Open in new window
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        </div>
      </div>

      <CombinedView
        items={unifiedItems}
        sessions={timeline}
        transmissions={transmissions}
        rows={decoded}
        scrollTargetKey={scrollTargetKey}
        scrollNonce={scrollNonce}
        fileName={fileName}
        summaryAnchorId={summaryAnchorId(id)}
      />
      <div id={summaryAnchorId(id)} className="scroll-mt-4">
        <Summary stats={summary} performance={performance} onNavigateToEvent={handleNavigateToEvent} />
      </div>
    </div>
  )
}
