//This file aggregates decoded rows and communication sessions into the SummaryStats used to drive the Summary panel (health, connectivity, LWM2M activity, errors/warnings, etc).

import type { CountedStat, DecodedRow, SummaryStats, TimelineSession } from '../types'
import { compareDateTime, parseDateTime } from './dateTime'

function stat(rows: DecodedRow[]): CountedStat {
  return { count: rows.length, rows }
}

function extractTemp(event: string): number | null {
  const m = event.match(/Temp\(C\):\s*(-?\d+)/)
  return m ? parseInt(m[1], 10) : null
}

function extractVoltage(event: string): number | null {
  const m = event.match(/Volt\(mV\):\s*(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

function extractCurrent(event: string): number | null {
  const m = event.match(/Average Current \(uA\):\s*([\d.]+)/)
  return m ? parseFloat(m[1]) : null
}

export function summarise(rows: DecodedRow[], sessions: TimelineSession[] = []): SummaryStats {
  const sources: Record<string, number> = {}
  const temperatures: number[] = []
  const voltages: number[] = []
  const avgCurrents: number[] = []

  const cererSuccessRows: DecodedRow[] = []
  const ceregSearchRows: DecodedRow[] = []
  const simErrorRows: DecodedRow[] = []
  const modemDisabledRows: DecodedRow[] = []
  const cmeErrorRows: DecodedRow[] = []
  const readingCycleRows: DecodedRow[] = []
  const readingDispatchRows: DecodedRow[] = []
  const statusCycleRows: DecodedRow[] = []
  const statusDispatchRows: DecodedRow[] = []
  const notifySuccessRows: DecodedRow[] = []
  const notifyFailedRows: DecodedRow[] = []
  const observeRows: DecodedRow[] = []
  const fotaRows: DecodedRow[] = []

  for (const row of rows) {
    sources[row.source] = (sources[row.source] ?? 0) + 1

    const temp = extractTemp(row.event)
    if (temp !== null) temperatures.push(temp)

    const voltage = extractVoltage(row.event)
    if (voltage !== null) voltages.push(voltage)

    const current = extractCurrent(row.event)
    if (current !== null) avgCurrents.push(current)

    const e = row.event
    if (e.includes('Cereg: 1')) cererSuccessRows.push(row)
    if (e.includes('Cereg: 0') || e.includes('Cereg: 2')) ceregSearchRows.push(row)
    if (e.includes('SIM Error')) simErrorRows.push(row)
    if (
      e.includes('Modem Disabled') ||
      e.includes('Modem Power State: DISABLED') ||
      e.includes('Modem Power State: 0')
    ) modemDisabledRows.push(row)
    if (e.includes('CME Error')) cmeErrorRows.push(row)
    if (e.includes('Reading Next Run Time')) readingCycleRows.push(row)
    if (e.toLowerCase().includes('reading next dispatch time')) readingDispatchRows.push(row)
    if (e.includes('Status Next Run Time')) statusCycleRows.push(row)
    if (e.includes('Status Next Dispatch Time')) statusDispatchRows.push(row)
    if (e.includes('LWM2M: Notify') && e.includes('Status: 0')) notifySuccessRows.push(row)
    if (e.includes('LWM2M: Notify') && e.includes('Status: 1')) notifyFailedRows.push(row)
    if (e.includes('LWM2M: Observe')) observeRows.push(row)
    if (
      e.includes('Swmgt Current Block') ||
      e.includes('Swmgt Backoff') ||
      e.includes('Swmgt Store Error') ||
      (e.startsWith('LWM2M') && (
        e.includes('Execute: 9') ||
        e.includes('Request: 9') ||
        e.includes('Write: 9')
      ))
    ) fotaRows.push(row)
  }

  const sessionCounts: Record<string, number> = {}
  const sessionDurationMap: Record<string, number[]> = {}
  for (const s of sessions) {
    sessionCounts[s.label] = (sessionCounts[s.label] ?? 0) + 1
    const toSec = (t: string) => { const [h, m, sec] = t.split(':').map(Number); return h * 3600 + m * 60 + sec }
    let dur = toSec(s.endTime) - toSec(s.startTime)
    if (dur < 0) dur += 86400
    if (!sessionDurationMap[s.label]) sessionDurationMap[s.label] = []
    sessionDurationMap[s.label].push(dur)
  }
  const sessionAvgDurations: Record<string, number> = {}
  for (const [label, durations] of Object.entries(sessionDurationMap)) {
    sessionAvgDurations[label] = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
  }

  const errors = rows.filter(r => r.severity === 'error')
  const warnings = rows.filter(r => r.severity === 'warning')
  const unmatchedRows = rows.filter(r => !r.matched)

  const sorted = [...rows].sort(compareDateTime)
  const firstRow = sorted[0]
  const lastRow = sorted[sorted.length - 1]
  const logDurationSeconds = (firstRow && lastRow)
    ? Math.round((parseDateTime(lastRow.date, lastRow.time).getTime() - parseDateTime(firstRow.date, firstRow.time).getTime()) / 1000)
    : 0

  const overallStatus: SummaryStats['overallStatus'] =
    errors.length > 0 ? 'error' :
    warnings.length > 0 ? 'warning' : 'healthy'

  return {
    totalEvents: rows.length,
    matchedEvents: rows.filter(r => r.matched).length,
    unmatchedEvents: rows.filter(r => !r.matched).length,
    dateRange: { start: firstRow?.date ?? '', end: lastRow?.date ?? '' },
    firstEventTime: firstRow?.time ?? '',
    lastEventTime: lastRow?.time ?? '',
    logDurationSeconds,
    sources,
    health: { temperatures, voltages, avgCurrents },
    connectivity: {
      cererSuccess: stat(cererSuccessRows),
      ceregSearch: stat(ceregSearchRows),
      simErrors: stat(simErrorRows),
      modemDisabled: stat(modemDisabledRows),
      cmeErrors: stat(cmeErrorRows),
    },
    lwm2m: {
      readingCycles: stat(readingCycleRows),
      readingDispatches: stat(readingDispatchRows),
      statusCycles: stat(statusCycleRows),
      statusDispatches: stat(statusDispatchRows),
      notifySuccess: stat(notifySuccessRows),
      notifyFailed: stat(notifyFailedRows),
      observeCount: stat(observeRows),
      fotaEvents: stat(fotaRows),
    },
    sessionCounts,
    sessionAvgDurations,
    errors,
    warnings,
    unmatchedRows,
    overallStatus,
  }
}
