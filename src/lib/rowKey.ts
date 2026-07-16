// A stable identity string for a single log event, used to locate and
// navigate to a specific event across separate components (e.g. clicking an
// error in the Summary panel and scrolling to it inside CombinedView).
export function rowKey(date: string, time: string, event: string): string {
  return `${date}|${time}|${event}`
}
