import { useCallback, useState } from 'react'

interface LoadedFile {
  name: string
  text: string
}

interface Props {
  onLoad: (files: LoadedFile[]) => void
  disabled?: boolean
}

function readFile(file: File): Promise<LoadedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve({ name: file.name, text: (e.target?.result as string) ?? '' })
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

export function FileUpload({ onLoad, disabled }: Props) {
  const [dragging, setDragging] = useState(false)
  const [loaded, setLoaded] = useState<{ name: string; count: number }[]>([])

  const processFiles = useCallback(async (fileList: FileList) => {
    const csvFiles = Array.from(fileList).filter(f => f.name.endsWith('.csv'))
    if (csvFiles.length === 0) return
    const loadedFiles = await Promise.all(csvFiles.map(readFile))
    setLoaded(prev => [
      ...prev,
      ...loadedFiles.map(f => ({
        name: f.name,
        count: Math.max(0, f.text.split('\n').filter(l => l.trim()).length - 1),
      })),
    ])
    onLoad(loadedFiles)
  }, [onLoad])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files)
  }, [disabled, processFiles])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) processFiles(e.target.files)
    e.target.value = ''
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div
        onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-blue-300'}`}
      >
        <svg className="mx-auto mb-3 h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-gray-600 mb-3">
          Drag &amp; drop device log CSV files here, or
        </p>
        <label className={`inline-block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-blue-700'
        }`}>
          Browse files
          <input
            type="file"
            accept=".csv"
            multiple
            onChange={handleChange}
            disabled={disabled}
            className="hidden"
          />
        </label>
        <p className="mt-3 text-xs text-gray-400">Accepts .csv files only — multiple files supported</p>
      </div>

      {loaded.length > 0 && (
        <div className="mt-3 space-y-1">
          {loaded.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="h-4 w-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>
                Loaded <strong>{f.name}</strong> &mdash; {f.count.toLocaleString()} events
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
