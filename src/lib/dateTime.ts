//This file provides shared date/time parsing and comparison helpers used across the decode pipeline to sort and compare log rows and sessions chronologically.

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
}

export function parseDateTime(date: string, time: string): Date {
  // "06-May-2026" + "16:00:00"
  const parts = date.split('-')
  if (parts.length === 3 && isNaN(Number(parts[1]))) {
    const day = parseInt(parts[0], 10)
    const month = MONTH_MAP[parts[1]] ?? 0
    const year = parseInt(parts[2], 10)
    const [h, m, s] = time.split(':').map(Number)
    return new Date(year, month, day, h, m, s)
  }
  return new Date(`${date} ${time}`)
}

export function compareDateTime(
  a: { date: string; time: string },
  b: { date: string; time: string },
): number {
  return parseDateTime(a.date, a.time).getTime() - parseDateTime(b.date, b.time).getTime()
}
