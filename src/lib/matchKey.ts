import type { LogRow, KeyEntry, DecodedRow } from '../types'
import { normalise } from './normalise'

function extractVoltage(event: string): number | null {
  const m = event.match(/Volt\(mV\):\s*(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

function classifySeverity(event: string): DecodedRow['severity'] {
  if (
    event.includes('SIM Error') ||
    event.includes('Modem Disabled') ||
    event.includes('CME Error') ||
    event.includes('Modem Error') ||
    event.includes('M95M01: Validate Error') ||
    event.includes('Swmgt Store Error') ||
    event.includes('GKCOAP Hang') ||
    event.includes('MCU Reset> PVD') //||
    //event.includes('MCU Reset> Firmware')
  ) return 'error'

  const voltage = extractVoltage(event)
  if (
    (event.includes('LWM2M: Notify') && (event.includes('Status: 1') || event.includes('Ack: 2'))) ||
    event.includes('Transmission Failed') ||
    event.includes('LWM2M Readings Not Dispatched') ||
    event.includes('Cereg: 0') ||
    (voltage !== null && voltage < 2800)
  ) return 'warning'

  if (
    event.includes('Reading Next Run Time') ||
    event.includes('Status Next Run Time') ||
    event.includes('Query Next Dispatch Time') ||
    event.includes('Alarm Next Sample Time') ||
    event.includes('Alarm Stop Sample Time') ||
    event.includes('Reading Next Dispatch Time') ||
    event.includes('Swmgt Current Block') ||
    event.includes('Lwm2m Recovered') ||
    event.includes('Coap Recovered') ||
    event.includes('Next Get Time')
  ) return 'info'

  return 'normal'
}

function makeDecoded(
  row: LogRow,
  explanation: string,
  matched: boolean,
): DecodedRow {
  return { ...row, explanation, matched, severity: classifySeverity(row.event) }
}

function collapseWs(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

// Normalises only trailing state fields (Status/Ack/Result/Index) while preserving
// structural IDs (object:instance:resource, Type) so distinct entries remain distinguishable.
function partialNormalise(s: string): string {
  return s.replace(/\b(Status|Ack|Result|Index):\s*-?\d+/g, '$1: {n}')
}

export function matchKey(rows: LogRow[], keys: KeyEntry[]): DecodedRow[] {
  return rows.map(row => {
    const event = collapseWs(row.event)
    const eventLower = event.toLowerCase()
    const normEvent = normalise(event)
    const normEventLower = normEvent.toLowerCase()
    const partialEvent = partialNormalise(event)
    const partialEventLower = partialEvent.toLowerCase()

    // Pass 1 — whitespace-collapsed exact match (preserves all numbers)
    for (const key of keys) {
      if (
        collapseWs(key.pcApp).toLowerCase() === eventLower ||
        collapseWs(key.oneTouchApp).toLowerCase() === eventLower
      ) {
        const expl = key.explanation.trim() || 'Undocumented event'
        return makeDecoded(row, expl, Boolean(key.explanation.trim()))
      }
    }

    // Pass 1.5 — partial normalise: only Status/Ack/Result/Index vary; structural IDs preserved
    for (const key of keys) {
      if (
        partialNormalise(collapseWs(key.pcApp)).toLowerCase() === partialEventLower ||
        partialNormalise(collapseWs(key.oneTouchApp)).toLowerCase() === partialEventLower
      ) {
        const expl = key.explanation.trim() || 'Undocumented event'
        return makeDecoded(row, expl, Boolean(key.explanation.trim()))
      }
    }

    // Pass 2 — full normalise (all numbers → {n})
    for (const key of keys) {
      if (
        normalise(key.pcApp).toLowerCase() === normEventLower ||
        normalise(key.oneTouchApp).toLowerCase() === normEventLower
      ) {
        const expl = key.explanation.trim() || 'Undocumented event'
        return makeDecoded(row, expl, Boolean(key.explanation.trim()))
      }
    }

    // Pass 3 — prefix match (key pattern ends with ':')
    for (const key of keys) {
      const pc = key.pcApp.trim()
      const ot = key.oneTouchApp.trim()
      if (
        (pc.endsWith(':') && normEventLower.startsWith(normalise(pc).toLowerCase())) ||
        (ot.endsWith(':') && normEventLower.startsWith(normalise(ot).toLowerCase()))
      ) {
        const expl = key.explanation.trim() || 'Undocumented event'
        return makeDecoded(row, expl, Boolean(key.explanation.trim()))
      }
    }

    return makeDecoded(row, 'Undocumented event', false)
  })
}
