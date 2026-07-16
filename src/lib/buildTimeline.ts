//This file contains the logic to build a timeline of communication sessions from a list of decoded log rows. Each session is defined by a sequence of events starting with an ACTIVE modem state and ending with either a SLEEP or DISABLED state. The timeline also includes pre-session and post-session events, as well as gap detection between sessions.

import type { DecodedRow, TimelineEvent, TimelineSession } from '../types'
import { parseDateTime, compareDateTime } from './dateTime'

function formatGap(minutes: number): string {
  if (minutes >= 60) return `~${Math.round(minutes / 60)} hrs gap`
  return `~${Math.round(minutes)} min gap`
}

function isActive(event: string): boolean {
  return event.includes('Modem Power State: ACTIVE') || event.includes('Modem Power State: 2')
}

function isSleep(event: string): boolean {
  return (
    event.includes('Modem Power State: SLEEP') ||
    event.includes('Modem Power State: 1') ||
    event.includes('Modem Power State: DISABLED') ||
    event.includes('Modem Power State: 0')
  )
}

function toTimelineEvent(row: DecodedRow): TimelineEvent {
  return {
    time: row.time,
    source: row.source,
    event: row.event,
    explanation: row.explanation,
    severity: row.severity,
  }
}

function sessionLabel(events: TimelineEvent[]): string {
  const evts = events.map(e => e.event.trim().replace(/\s+/g, ' '))
  const fwIdx = evts.findIndex(e => e.includes('FLSV: MCU Reset> Firmware Update'))
  const disabledIdx = evts.findIndex(e => e.includes('Modem Power State: DISABLED') || e.includes('Modem Power State: 0'))
  const sleepIdx = evts.findIndex(e => e.includes('Modem Power State: SLEEP') || e.includes('Modem Power State: 1'))
  const notifyIdx = evts.findIndex(e => e.includes('LWM2M: Notify: 10376'))
  const activeIdx = evts.findIndex(e => isActive(e))
  const recoverIdx = evts.findIndex(e => e.includes('NBIT: Lwm2m Recovered: 0'))
  const alarmIdx = evts.findIndex(e => e.includes('LWM2M: Notify: 10377'))
  const failedAlarmIdx = evts.findIndex(e =>
    e.includes('LWM2M: Notify: 10377') && (e.includes('Status: 1') || e.includes('Ack: 2'))
  )
  let obnineLastIdx = -1
  for (let k = evts.length - 1; k >= 0; k--) {
    if (evts[k].includes('LWM2M: Observe: 9')) { obnineLastIdx = k; break }
  }
  const notnineIdx = evts.findIndex(e => e.includes('LWM2M: Notify: 9'))

  if (evts.some(e => e.includes('SIM Error') && e.includes('Modem Disabled')))
    return 'Communication session — SIM failure'
  if (fwIdx !== -1 && disabledIdx !== -1 && fwIdx < disabledIdx)
    return 'Communication session — modem disabled after firmware update'
  if (fwIdx !== -1 && activeIdx !== -1 && fwIdx < activeIdx)
    return 'Communication session — Firmware Update'
  if (activeIdx !== -1 && recoverIdx !== -1 && notifyIdx !== -1 && sleepIdx !== -1 && activeIdx < recoverIdx && recoverIdx < notifyIdx && notifyIdx < sleepIdx)
    return 'Communication session — Successful Short Transmission'
  if (activeIdx !== -1 && recoverIdx !== -1 && alarmIdx !== -1 && sleepIdx !== -1 && activeIdx < recoverIdx && recoverIdx < alarmIdx && alarmIdx < sleepIdx)
    return 'Communication session — Successful Short Alarm Transmission'
  if (
    activeIdx !== -1 && obnineLastIdx !== -1 && sleepIdx !== -1 &&
    activeIdx < obnineLastIdx && obnineLastIdx === sleepIdx - 1
  )
    return 'Communication session — Modem Incomplete Reset'
  if (activeIdx !== -1 && disabledIdx !== -1)
    return 'Communication session — modem disabled'
  if (
  evts.some(e => e.includes('FLSV: MCU Reset> User')) &&
  activeIdx !== -1 &&
  evts.some(e => e.includes('LWM2M: Notify: 10376'))
  )
    return 'Communication session — User Reboot Successful Transmission'
  if (
  activeIdx !== -1 &&
  evts.some(e => e.includes('LWM2M: Request: 10376')) &&
  evts.some(e => e.includes('LWM2M: Notify: 10376'))
  )
    return 'Communication session — Modem Reset Successful Transmission'
  if (evts.some(e => e.includes('MCU Reset> Brown Out')))
    return 'Communication session — device brown out'
  if (evts.some(e => e.includes('CME Error')))
    return 'Communication session — CME error'
  if (activeIdx !== -1 && sleepIdx !== -1 && failedAlarmIdx !== -1 && activeIdx < sleepIdx && sleepIdx < failedAlarmIdx)
    return 'Communication session — Modem Fake Transmission'
  if (evts.some(e => e.includes('LWM2M: Notify') && e.includes('Status: 1')))
    return 'Communication session — notify failed'
  if (evts.some(e => e.includes('Swmgt Current Block') || e.includes('Execute: 9 : 0') || e.includes('Request: 9 : 0 : 4'))) 
    return 'Communication session — firmware update'

  //OneTouchApp
  if (
  evts.some(e => e.includes('Modem Power State: 2')) &&
  evts.some(e => e.includes('LWM2M: Notify: 10376'))
  )
    return 'Communication session — Successful Transmission'

  return 'Communication session — Unknown'
}

function sessionStatus(events: TimelineEvent[]): TimelineSession['status'] {
  if (events.some(e => e.severity === 'error')) return 'error'
  if (events.some(e => e.severity === 'warning')) return 'warning'
  return 'healthy'
}

export function buildTimeline(rows: DecodedRow[]): TimelineSession[] {
  const sorted = [...rows].sort(compareDateTime)

  const sessions: TimelineSession[] = []
  let id = 1
  let prevEndTime: Date | null = null

  const firstActiveIdx = sorted.findIndex(r => isActive(r.event))

  // Pre-session group: events before first ACTIVE
  if (firstActiveIdx > 0) {
    const pre = sorted.slice(0, firstActiveIdx)
    sessions.push({
      id: id++,
      label: 'Scheduled events — modem idle',
      date: pre[0].date,
      startTime: pre[0].time,
      endTime: pre[pre.length - 1].time,
      events: pre.map(toTimelineEvent),
      status: 'info',
    })
    prevEndTime = parseDateTime(pre[pre.length - 1].date, pre[pre.length - 1].time)
  } else if (firstActiveIdx === -1) {
    // No ACTIVE events at all — whole log is idle
    if (sorted.length > 0) {
      sessions.push({
        id: id++,
        label: 'Scheduled events — modem idle',
        date: sorted[0].date,
        startTime: sorted[0].time,
        endTime: sorted[sorted.length - 1].time,
        events: sorted.map(toTimelineEvent),
        status: 'info',
      })
    }
    return sessions
  }

  // Walk through ACTIVE→SLEEP cycles
  let i = firstActiveIdx
  while (i < sorted.length) {
    if (!isActive(sorted[i].event)) { i++; continue }

    const group: DecodedRow[] = []

    // A firmware-update MCU reset is often logged a few seconds before the
    // modem reactivates, landing in the gap before this session's own ACTIVE
    // marker rather than inside any session. Pull it into this session as its
    // lead-in row, since it's the reset that triggered this reactivation.
    if (i > 0 && sorted[i - 1].event.includes('FLSV: MCU Reset> Firmware Update')) {
      group.push(sorted[i - 1])
    }

    const sessionStart = group[0] ?? sorted[i]
    let endRow = sorted[i]
    let sawSingleSleep = false

    while (i < sorted.length) {
      const row = sorted[i]
      group.push(row)
      endRow = row
      const wasSleepOnly =
        row.event.includes('Modem Power State: SLEEP') ||
        row.event.includes('Modem Power State: 1')
      const wasDisabled =
        row.event.includes('Modem Power State: DISABLED') ||
        row.event.includes('Modem Power State: 0')
      const isFailedAlarmNotify =
        row.event.includes('LWM2M: Notify: 10377') &&
        (row.event.includes('Status: 1') || row.event.includes('Ack: 2'))
      i++
      if (wasDisabled) {
        break
      }
      if (wasSleepOnly) {
        if (i < sorted.length && isSleep(sorted[i].event)) {
          // Two consecutive SLEEPs — consume second and end session
          group.push(sorted[i])
          endRow = sorted[i]
          i++
          break
        }
        // Single SLEEP — keep collecting, but now watch for a failed alarm
        // notify arriving afterward, which concludes a "fake transmission".
        sawSingleSleep = true
        continue
      }
      if (sawSingleSleep && isFailedAlarmNotify) {
        // ACTIVE → single SLEEP → failed alarm Notify: conclude the session here.
        break
      }
    }

    const startDt = parseDateTime(sessionStart.date, sessionStart.time)
    let gapBefore: string | undefined

    if (prevEndTime) {
      const gapMin = (startDt.getTime() - prevEndTime.getTime()) / 60000
      if (gapMin > 0) {
        let label = formatGap(gapMin)
        if (gapMin > 12 * 60) label += ' — modem offline'
        gapBefore = label
      }
    }

    const tlEvents = group.map(toTimelineEvent)
    sessions.push({
      id: id++,
      label: sessionLabel(tlEvents),
      date: sessionStart.date,
      startTime: sessionStart.time,
      endTime: endRow.time,
      events: tlEvents,
      status: sessionStatus(tlEvents),
      gapBefore,
    })

    prevEndTime = parseDateTime(endRow.date, endRow.time)
  }

  // Post-process: detect abnormal pattern crossing session boundary
  // Pattern: single SLEEP → LWM2M: Notify: 10376 → Lwm2m Recovered: 2
  // (normal sessions end with TWO consecutive SLEEPs, so this is the case where
  //  only one SLEEP was found before the next ACTIVE or end of log)
  for (let k = 0; k < sorted.length; k++) {
    if (!isSleep(sorted[k].event)) continue
    // Skip if immediately followed by another SLEEP (that's a normal session end)
    if (k + 1 < sorted.length && isSleep(sorted[k + 1].event)) continue

    // Find LWM2M: Notify: 10376 after this single SLEEP (before next ACTIVE)
    let notifyIdx = -1
    for (let m = k + 1; m < sorted.length && !isActive(sorted[m].event); m++) {
      if (sorted[m].event.includes('LWM2M: Notify: 10376')) { notifyIdx = m; break }
    }
    if (notifyIdx === -1) continue

    // Find Lwm2m Recovered: 2 after Notify (before next ACTIVE)
    let recoveredFound = false
    for (let n = notifyIdx + 1; n < sorted.length && !isActive(sorted[n].event); n++) {
      if (sorted[n].event.includes('Lwm2m Recovered: 2')) { recoveredFound = true; break }
    }
    if (!recoveredFound) continue

    // Relabel the session whose end row matches this SLEEP
    const sleepRow = sorted[k]
    const target = sessions.find(s => s.endTime === sleepRow.time && s.date === sleepRow.date)
    if (target) target.label = 'Communication session — Modem self reset before transmission'
  }

  return sessions
}
