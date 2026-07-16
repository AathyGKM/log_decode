//This file formats a file's SummaryStats and PerformanceScore into a plain-text report for the "Download all summaries" export.

import type { CountedStat, PerformanceScore, SummaryStats } from '../types'
import { avg, minMax, formatDuration, groupByExplanation } from './summaryFormat'

function pushStatLines(lines: string[], label: string, stat: CountedStat) {
  lines.push(`  ${label}: ${stat.count}`)
  for (const r of stat.rows) lines.push(`    ${r.date} ${r.time} -- ${r.event}`)
}

export function formatSummaryText(fileName: string, stats: SummaryStats, performance: PerformanceScore): string {
  const lines: string[] = []

  lines.push(`File: ${fileName}`)
  lines.push(`Status: ${stats.overallStatus.toUpperCase()}`)
  if (stats.dateRange.start) {
    lines.push(`Log span: ${stats.dateRange.start} ${stats.firstEventTime} -> ${stats.dateRange.end} ${stats.lastEventTime}`)
    lines.push(`Duration: ${formatDuration(stats.logDurationSeconds)}`)
  }
  lines.push(`Total events: ${stats.totalEvents} | Matched: ${stats.matchedEvents} | Unmatched: ${stats.unmatchedEvents}`)
  lines.push('')

  lines.push(`Device Performance: ${performance.overall}%`)
  for (const s of performance.subScores) {
    lines.push(`  ${s.label}: ${s.percentage}% (${s.detail}, weight ${Math.round(s.weight * 100)}%)`)
  }
  lines.push('')

  lines.push('Device Health')
  lines.push(`  Temperature range (C): ${minMax(stats.health.temperatures)}`)
  lines.push(`  Average temperature (C): ${avg(stats.health.temperatures)}`)
  lines.push(`  Voltage range (mV): ${minMax(stats.health.voltages)}`)
  lines.push(`  Average voltage (mV): ${avg(stats.health.voltages)}`)
  if (stats.health.avgCurrents.length > 0) {
    lines.push(`  Average current (uA): ${avg(stats.health.avgCurrents)}`)
  }
  lines.push(`  Low battery (<2800mV): ${stats.health.voltages.some(v => v < 2800) ? 'yes' : 'no'}`)
  lines.push('')

  lines.push('Connectivity')
  pushStatLines(lines, 'Cereg success (registered)', stats.connectivity.cererSuccess)
  pushStatLines(lines, 'Cereg search/attach', stats.connectivity.ceregSearch)
  pushStatLines(lines, 'SIM errors', stats.connectivity.simErrors)
  pushStatLines(lines, 'Modem disabled events', stats.connectivity.modemDisabled)
  pushStatLines(lines, 'CME errors', stats.connectivity.cmeErrors)
  lines.push('')

  lines.push('LWM2M Activity')
  pushStatLines(lines, 'Reading cycles', stats.lwm2m.readingCycles)
  pushStatLines(lines, 'Reading dispatch cycles', stats.lwm2m.readingDispatches)
  pushStatLines(lines, 'Status cycles', stats.lwm2m.statusCycles)
  pushStatLines(lines, 'Status dispatch cycles', stats.lwm2m.statusDispatches)
  pushStatLines(lines, 'Notify success', stats.lwm2m.notifySuccess)
  pushStatLines(lines, 'Notify failed', stats.lwm2m.notifyFailed)
  pushStatLines(lines, 'Observe registrations', stats.lwm2m.observeCount)
  pushStatLines(lines, 'FOTA events', stats.lwm2m.fotaEvents)
  lines.push('')

  const sessionEntries = Object.entries(stats.sessionCounts).sort((a, b) => b[1] - a[1])
  if (sessionEntries.length > 0) {
    lines.push('Session Types')
    for (const [label, count] of sessionEntries) {
      lines.push(`  ${label.replace('Communication session — ', '')}: ${count} (avg ${formatDuration(stats.sessionAvgDurations[label] ?? 0)})`)
    }
    lines.push('')
  }

  if (stats.errors.length > 0) {
    lines.push(`Errors (${stats.errors.length})`)
    for (const { explanation, rows } of groupByExplanation(stats.errors)) {
      lines.push(`  ${explanation}: ${rows.length}`)
      for (const r of rows) lines.push(`    ${r.date} ${r.time} -- ${r.event}`)
    }
    lines.push('')
  }

  if (stats.warnings.length > 0) {
    lines.push(`Warnings (${stats.warnings.length})`)
    for (const { explanation, rows } of groupByExplanation(stats.warnings)) {
      lines.push(`  ${explanation}: ${rows.length}`)
      for (const r of rows) lines.push(`    ${r.date} ${r.time} -- ${r.event}`)
    }
    lines.push('')
  }

  if (stats.unmatchedRows.length > 0) {
    lines.push(`Unmatched events (${stats.unmatchedRows.length})`)
    for (const r of stats.unmatchedRows) lines.push(`  ${r.date} ${r.time} -- ${r.event}`)
    lines.push('')
  }

  return lines.join('\n')
}
