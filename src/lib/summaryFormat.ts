//This file provides shared formatting/aggregation helpers (averages, ranges, durations, grouping by explanation) used by both the Summary UI and the exported summary text file.

import type { DecodedRow } from '../types'

export function avg(arr: number[]): string {
  if (arr.length === 0) return '—'
  return (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)
}

export function minMax(arr: number[]): string {
  if (arr.length === 0) return '—'
  return `${Math.min(...arr)} – ${Math.max(...arr)}`
}

export function formatDuration(sec: number): string {
  if (sec <= 0) return '<1s'
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

export function groupByExplanation(rows: DecodedRow[]): { explanation: string; rows: DecodedRow[] }[] {
  const groups = new Map<string, DecodedRow[]>()
  for (const r of rows) {
    if (!groups.has(r.explanation)) groups.set(r.explanation, [])
    groups.get(r.explanation)!.push(r)
  }
  return [...groups.entries()]
    .map(([explanation, rs]) => ({ explanation, rows: rs }))
    .sort((a, b) => b.rows.length - a.rows.length)
}
