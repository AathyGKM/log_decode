import { useState } from 'react'
import { filePanelAnchorId } from './FileReportPanel'
import type { SummaryStats } from '../types'

interface FileNavEntry {
  id: string
  fileName: string
  status: SummaryStats['overallStatus']
}

interface Props {
  files: FileNavEntry[]
}

function statusDot(status: FileNavEntry['status']): string {
  if (status === 'error') return 'bg-red-500'
  if (status === 'warning') return 'bg-amber-400'
  return 'bg-green-500'
}

export function FileNavSidebar({ files }: Props) {
  const [hovered, setHovered] = useState(false)

  if (files.length <= 1) return null

  const scrollToFile = (id: string) => {
    document.getElementById(filePanelAnchorId(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="hidden lg:block fixed left-0 top-28 z-40"
    >
      <nav
        className={`bg-white border border-l-0 border-gray-200 rounded-r-lg shadow-sm overflow-hidden transition-all duration-200 ease-out ${
          hovered ? 'w-56' : 'w-7'
        }`}
      >
        {hovered ? (
          <div className="p-2 max-h-[70vh] overflow-y-auto">
            <span className="block px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
              Files ({files.length})
            </span>
            <div className="space-y-0.5">
              {files.map(f => (
                <button
                  key={f.id}
                  onClick={() => scrollToFile(f.id)}
                  title={f.fileName}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                >
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${statusDot(f.status)}`} />
                  <span className="truncate">{f.fileName}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="w-7 py-3 flex flex-col items-center gap-1.5 text-gray-400">
            <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-[10px] font-semibold tracking-wider [writing-mode:vertical-rl] rotate-180">
              Files
            </span>
          </div>
        )}
      </nav>
    </div>
  )
}
