export interface LogRow {
  date: string
  time: string
  event: string
  source: string
}

export interface KeyEntry {
  no: number
  pcApp: string
  oneTouchApp: string
  explanation: string
}

export interface DecodedRow extends LogRow {
  explanation: string
  matched: boolean
  severity: 'error' | 'warning' | 'info' | 'normal'
}

// A count paired with the raw rows that contributed to it, so the UI/export
// can drill down from a stat into the actual events behind it.
export interface CountedStat {
  count: number
  rows: DecodedRow[]
}

export interface SummaryStats {
  totalEvents: number
  matchedEvents: number
  unmatchedEvents: number
  dateRange: { start: string; end: string }
  firstEventTime: string   // time portion of the chronologically first row, e.g. "10:20:22"
  lastEventTime: string    // time portion of the chronologically last row
  logDurationSeconds: number  // span from first to last row, chronologically
  sources: Record<string, number>
  health: {
    temperatures: number[]
    voltages: number[]
    avgCurrents: number[]
  }
  connectivity: {
    cererSuccess: CountedStat
    ceregSearch: CountedStat
    simErrors: CountedStat
    modemDisabled: CountedStat
    cmeErrors: CountedStat
  }
  lwm2m: {
    readingCycles: CountedStat
    readingDispatches: CountedStat
    statusCycles: CountedStat
    statusDispatches: CountedStat
    notifySuccess: CountedStat
    notifyFailed: CountedStat
    observeCount: CountedStat
    fotaEvents: CountedStat
  }
  sessionCounts: Record<string, number>
  sessionAvgDurations: Record<string, number>  // label → avg seconds
  errors: DecodedRow[]
  warnings: DecodedRow[]
  unmatchedRows: DecodedRow[]
  overallStatus: 'healthy' | 'warning' | 'error'
}

// One weighted component of a device's overall performance evaluation.
export interface PerformanceSubScore {
  label: string
  percentage: number   // 0-100
  weight: number        // 0-1, as actually applied (after renormalisation for missing sub-scores)
  detail: string        // e.g. "58/60 notifies succeeded"
}

export interface PerformanceScore {
  overall: number   // 0-100, rounded
  subScores: PerformanceSubScore[]
}

export interface TimelineEvent {
  time: string
  source: string
  event: string
  explanation: string
  severity: 'error' | 'warning' | 'info' | 'normal'
}

export interface TimelineSession {
  id: number
  label: string
  date: string
  startTime: string
  endTime: string
  events: TimelineEvent[]
  status: 'healthy' | 'warning' | 'error' | 'info'
  gapBefore?: string
}

export interface TransmissionPattern {
  id: string
  label: string
  description: string
  sequence: (string | string[])[]  // nested array = events must be consecutive (no events between)
}

export interface Transmission {
  id: number
  patternId: string
  patternLabel: string
  date: string
  startTime: string
  endTime: string
  events: TimelineEvent[]
  status: 'healthy' | 'warning' | 'error'
}

export type CombinedItem =
  | { kind: 'transmission'; data: Transmission }
  | { kind: 'row'; data: DecodedRow }

export type UnifiedItem =
  | { kind: 'session'; data: TimelineSession; items: CombinedItem[]; gapBefore?: string }
  | { kind: 'presession'; items: CombinedItem[] }
  | { kind: 'gap'; items: CombinedItem[] }
