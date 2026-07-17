//This file filters parsed log rows to only those at or after a chosen start date/time, used as an optional decode cutoff applied before the rest of the pipeline runs.

import { parseDateTime } from './dateTime'

export function filterRowsFromStart<T extends { date: string; time: string }>(
  rows: T[],
  start: Date | null,
): T[] {
  if (!start) return rows
  return rows.filter(r => parseDateTime(r.date, r.time).getTime() >= start.getTime())
}
