import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileUpload } from './components/FileUpload'
import { FileReportPanel, openFileReportWindow } from './components/FileReportPanel'
import { PerformanceOverview } from './components/PerformanceOverview'
import { FileNavSidebar } from './components/FileNavSidebar'
import { ScrollToTopButton } from './components/ScrollToTopButton'
import { parseKey } from './lib/parseKey'
import { parsePatterns } from './lib/parsePatterns'
import { parseLog } from './lib/parseLog'
import { filterRowsFromStart } from './lib/filterRowsFromStart'
import { matchKey } from './lib/matchKey'
import { matchTransmissionRanges } from './lib/matchTransmissions'
import { buildUnifiedView } from './lib/buildUnifiedView'
import { buildTimeline } from './lib/buildTimeline'
import { summarise } from './lib/summarise'
import { evaluatePerformance } from './lib/evaluatePerformance'
import { formatSummaryText } from './lib/formatSummaryText'
import type { KeyEntry, TransmissionPattern } from './types'
import type { FileReportPanelProps } from './components/FileReportPanel'

type FileResult = FileReportPanelProps

interface UploadedFile {
  id: string
  name: string
  text: string
}

function decodeFile(
  id: string,
  name: string,
  text: string,
  keys: KeyEntry[],
  patterns: TransmissionPattern[],
  startDateTime: Date | null,
): FileResult {
  const rows = filterRowsFromStart(parseLog(text), startDateTime)
  const decodedRows = matchKey(rows, keys)
  const ranges = matchTransmissionRanges(decodedRows, patterns)
  const matched = ranges.map(r => r.transmission)
  const tl = buildTimeline(decodedRows)
  const summary = summarise(decodedRows, tl)
  return {
    id,
    fileName: name,
    decoded: decodedRows,
    summary,
    performance: evaluatePerformance(summary, tl),
    timeline: tl,
    transmissions: matched,
    unifiedItems: buildUnifiedView(decodedRows, ranges, tl),
  }
}

export default function App() {
  const [keys, setKeys] = useState<KeyEntry[]>([])
  const [patterns, setPatterns] = useState<TransmissionPattern[]>([])
  const [keysLoading, setKeysLoading] = useState(true)
  const [keysError, setKeysError] = useState(false)
  const [fileResults, setFileResults] = useState<FileResult[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')

  const startDateTime = useMemo(() => {
    if (!startDate) return null
    const d = new Date(`${startDate}T${startTime || '00:00:00'}`)
    return isNaN(d.getTime()) ? null : d
  }, [startDate, startTime])

  useEffect(() => {
    Promise.all([parseKey(), parsePatterns()])
      .then(([k, p]) => { setKeys(k); setPatterns(p); setKeysLoading(false) })
      .catch(() => { setKeysError(true); setKeysLoading(false) })
  }, [])

  const handleFiles = useCallback((files: { name: string; text: string }[]) => {
    const newUploads = files.map(file => ({ id: crypto.randomUUID(), name: file.name, text: file.text }))
    const results = newUploads.map(u => decodeFile(u.id, u.name, u.text, keys, patterns, startDateTime))
    setUploadedFiles(prev => [...prev, ...newUploads])
    setFileResults(prev => [...prev, ...results])
  }, [keys, patterns, startDateTime])

  // Re-decode every already-uploaded file whenever the start point changes,
  // using each file's retained raw text — no need to re-select it from disk.
  useEffect(() => {
    if (uploadedFiles.length === 0) return
    setFileResults(() => uploadedFiles.map(u => decodeFile(u.id, u.name, u.text, keys, patterns, startDateTime)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDateTime])

  const handleOpenAllInNewWindows = useCallback(() => {
    const blocked = fileResults.filter(r => !openFileReportWindow(r)).length
    if (blocked > 0) {
      alert(`${blocked} window(s) were blocked by the browser's popup blocker. Please allow popups for this site and try again.`)
    }
  }, [fileResults])

  const handleDownloadAllSummaries = useCallback(() => {
    const separator = `\n${'='.repeat(60)}\n\n`
    const text = fileResults.map(r => formatSummaryText(r.fileName, r.summary, r.performance)).join(separator)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
    a.download = `log-summaries-${stamp}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [fileResults])

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">NB-IoT Log Decoder</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Upload device log CSV files to decode and analyse events
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {keysError && (
          <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            Failed to load knowledge base (logkey.csv). Make sure it is present in the public folder.
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-gray-600 font-medium">Decode start point (optional):</span>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-700"
          />
          <input
            type="time"
            step="1"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            disabled={!startDate}
            className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 disabled:opacity-50"
          />
          {startDate && (
            <button
              onClick={() => { setStartDate(''); setStartTime('') }}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Clear
            </button>
          )}
          <span className="text-xs text-gray-400">
            Rows before this date/time are excluded from decoding — applies to all uploaded logs and re-decodes any already loaded.
          </span>
        </div>

        <FileUpload onLoad={handleFiles} disabled={keysLoading || keysError} />

        <PerformanceOverview
          files={fileResults.map(r => ({ id: r.id, fileName: r.fileName, overall: r.performance.overall }))}
        />

        {fileResults.length > 0 && (
          <div className="flex justify-end gap-2">
            <button
              onClick={handleDownloadAllSummaries}
              className="text-xs px-2.5 py-1 border border-gray-300 rounded text-gray-600 bg-white hover:bg-gray-50"
            >
              Download all summaries (.txt)
            </button>
            <button
              onClick={handleOpenAllInNewWindows}
              className="text-xs px-2.5 py-1 border border-gray-300 rounded text-gray-600 bg-white hover:bg-gray-50"
            >
              Open all in new windows
            </button>
          </div>
        )}

        {fileResults.map(result => (
          <FileReportPanel key={result.id} {...result} />
        ))}
      </main>

      <FileNavSidebar
        files={fileResults.map(r => ({ id: r.id, fileName: r.fileName, status: r.summary.overallStatus }))}
      />
      <ScrollToTopButton />
    </div>
  )
}
