import type { PerformanceScore, PerformanceSubScore, SummaryStats, TimelineSession } from '../types'

interface RawSubScore {
  label: string
  weight: number
  percentage: number | null   // null = no data for this file, exclude from overall
  detail: string
}

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0
}

function isSleepEvent(event: string): boolean {
  return event.includes('Modem Power State: SLEEP') || event.includes('Modem Power State: 1')
}

function realSessionsOf(sessions: TimelineSession[]): TimelineSession[] {
  return sessions.filter(s => s.status !== 'info')
}

// Connectivity: a session only counts as a successful registration if it
// shows the full cycle — both Cereg: 1 and Cereg: 2 present. A session that
// shows Cereg: 0 (search/retry) without completing that cycle counts as
// failed. Sessions with no Cereg activity at all carry no signal either way.
function evaluateConnectivity(sessions: TimelineSession[]): { percentage: number | null; detail: string } {
  const real = realSessionsOf(sessions)
  const withCereg = real.filter(s => s.events.some(e => e.event.includes('NBIT: Cereg:')))
  if (withCereg.length === 0) return { percentage: null, detail: 'no Cereg activity' }

  const isSuccessful = (s: TimelineSession) =>
    s.events.some(e => e.event.includes('NBIT: Cereg: 1')) &&
    s.events.some(e => e.event.includes('NBIT: Cereg: 2'))

  const successCount = withCereg.filter(isSuccessful).length
  return {
    percentage: pct(successCount, withCereg.length),
    detail: `${successCount}/${withCereg.length} sessions completed registration (Cereg 1 & 2)`,
  }
}

// Session health: judged purely on whether the session actually communicated
// correctly over LWM2M — error/warning severity is handled separately by the
// Error-Free Rate sub-score.
function evaluateSessionHealth(sessions: TimelineSession[]): { percentage: number | null; detail: string } {
  const real = realSessionsOf(sessions)
  if (real.length === 0) return { percentage: null, detail: 'no communication sessions' }

  const isHealthy = (s: TimelineSession) => {
    const lwm2mEvents = s.events.filter(e => e.source === 'LWM2M')
    if (lwm2mEvents.length === 0) return false // no LWM2M activity at all — failed

    const hasBadRecovery = s.events.some(e =>
      e.event.includes('Lwm2m Recovered: 2') || e.event.includes('Lwm2m Recovered: 5')
    )
    if (hasBadRecovery) return false

    const sleepIdx = s.events.findIndex(e => isSleepEvent(e.event))
    if (sleepIdx !== -1 && s.events.slice(sleepIdx + 1).some(e => e.source === 'LWM2M')) {
      return false // LWM2M activity arriving after SLEEP — a "fake"/wasted transmission
    }

    const hasGoodRecovery = s.events.some(e => e.event.includes('Lwm2m Recovered: 0'))
    const hasSuccessfulNotify = s.events.some(e => e.event.includes('LWM2M: Notify') && e.event.includes('Status: 0'))
    return hasGoodRecovery && hasSuccessfulNotify
  }

  const healthyCount = real.filter(isHealthy).length
  return { percentage: pct(healthyCount, real.length), detail: `${healthyCount}/${real.length} sessions healthy` }
}

// Error-free rate: percentage of sessions with no error/warning-severity
// events, with error-severity sessions weighted twice as heavily as
// warning-only sessions.
function evaluateErrorFreeRate(sessions: TimelineSession[]): { percentage: number | null; detail: string } {
  const real = realSessionsOf(sessions)
  if (real.length === 0) return { percentage: null, detail: 'no communication sessions' }

  const errorSessions = real.filter(s => s.status === 'error').length
  const warningSessions = real.filter(s => s.status === 'warning').length
  const cleanSessions = real.length - errorSessions - warningSessions
  const percentage = Math.max(0, 100 - ((errorSessions * 2 + warningSessions) / real.length) * 100)

  return {
    percentage,
    detail: `${cleanSessions}/${real.length} sessions error/warning-free (${errorSessions} error, ${warningSessions} warning)`,
  }
}

export function evaluatePerformance(stats: SummaryStats, sessions: TimelineSession[]): PerformanceScore {
  const { health, lwm2m } = stats

  const connectivity = evaluateConnectivity(sessions)
  const sessionHealth = evaluateSessionHealth(sessions)
  const errorFree = evaluateErrorFreeRate(sessions)
  const batteryReadings = health.voltages.length
  const batteryHealthy = health.voltages.filter(v => v >= 2800).length

  const notifyTotal = lwm2m.notifySuccess.count + lwm2m.notifyFailed.count

  const raw: RawSubScore[] = [
    {
      label: 'Transmission success',
      weight: 0.35,
      percentage: notifyTotal > 0 ? pct(lwm2m.notifySuccess.count, notifyTotal) : null,
      detail: notifyTotal > 0 ? `${lwm2m.notifySuccess.count}/${notifyTotal} notifies succeeded` : 'no notify activity',
    },
    {
      label: 'Connectivity reliability',
      weight: 0.25,
      percentage: connectivity.percentage,
      detail: connectivity.detail,
    },
    {
      label: 'Session health',
      weight: 0.20,
      percentage: sessionHealth.percentage,
      detail: sessionHealth.detail,
    },
    {
      label: 'Error-free rate',
      weight: 0.15,
      percentage: errorFree.percentage,
      detail: errorFree.detail,
    },
    {
      label: 'Battery health',
      weight: 0.05,
      percentage: batteryReadings > 0 ? pct(batteryHealthy, batteryReadings) : null,
      detail: batteryReadings > 0 ? `${batteryHealthy}/${batteryReadings} readings ≥ 2800mV` : 'no voltage readings',
    },
  ]

  const available = raw.filter((s): s is RawSubScore & { percentage: number } => s.percentage !== null)
  const weightTotal = available.reduce((sum, s) => sum + s.weight, 0)

  const subScores: PerformanceSubScore[] = available.map(s => ({
    label: s.label,
    percentage: Math.round(s.percentage * 10) / 10,
    weight: weightTotal > 0 ? s.weight / weightTotal : 0,
    detail: s.detail,
  }))

  const overall = weightTotal > 0
    ? Math.round(available.reduce((sum, s) => sum + s.percentage * (s.weight / weightTotal), 0))
    : 0

  return { overall, subScores }
}
