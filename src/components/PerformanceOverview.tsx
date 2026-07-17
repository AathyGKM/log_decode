//This file shows a compact overview of every uploaded file's overall performance percentage, right below the upload area, with click-to-scroll into each file's own panel.

import { filePanelAnchorId } from './FileReportPanel'
import { performanceColor } from '../lib/summaryFormat'

interface PerformanceOverviewEntry {
  id: string
  fileName: string
  overall: number
}

interface Props {
  files: PerformanceOverviewEntry[]
}

export function PerformanceOverview({ files }: Props) {
  if (files.length === 0) return null

  const scrollToFile = (id: string) => {
    document.getElementById(filePanelAnchorId(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-800">All Files — Performance Overview</h2>
      </div>
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {files.map(f => {
          const colours = performanceColor(f.overall)
          return (
            <button
              key={f.id}
              onClick={() => scrollToFile(f.id)}
              className={`flex items-center justify-between gap-2 px-3 py-2 rounded text-left hover:opacity-90 ${colours.bg}`}
            >
              <span className="text-sm text-gray-700 truncate" title={f.fileName}>{f.fileName}</span>
              <span className={`text-lg font-bold flex-shrink-0 ${colours.text}`}>{f.overall}%</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
