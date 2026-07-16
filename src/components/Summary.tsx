import { useState } from 'react'
import type { ReactNode } from 'react'
import type { CountedStat, DecodedRow, PerformanceScore, SummaryStats } from '../types'
import { avg, minMax, formatDuration, groupByExplanation } from '../lib/summaryFormat'

interface Props {
  stats: SummaryStats
  performance: PerformanceScore
  onNavigateToEvent?: (row: DecodedRow) => void
}

function performanceColor(pct: number): { text: string; bg: string; bar: string } {
  if (pct >= 80) return { text: 'text-green-700', bg: 'bg-green-50', bar: 'bg-green-500' }
  if (pct >= 50) return { text: 'text-amber-700', bg: 'bg-amber-50', bar: 'bg-amber-400' }
  return { text: 'text-red-700', bg: 'bg-red-50', bar: 'bg-red-500' }
}

function PerformanceSection({ performance }: { performance: PerformanceScore }) {
  const colours = performanceColor(performance.overall)
  return (
    <div className={`px-4 py-4 border-b border-gray-200 ${colours.bg}`}>
      <div className="flex items-center justify-between gap-4 mb-3">
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Device Performance</h3>
          <p className={`text-3xl font-bold ${colours.text}`}>{performance.overall}%</p>
        </div>
        <div className="flex-1 max-w-xs h-2 rounded-full bg-white overflow-hidden">
          <div className={`h-full rounded-full ${colours.bar}`} style={{ width: `${performance.overall}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {performance.subScores.map(s => (
          <div key={s.label} className="bg-white rounded px-2.5 py-1.5">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-gray-500">{s.label}</span>
              <span className="text-sm font-semibold text-gray-800">{s.percentage}%</span>
            </div>
            <div className="text-[10px] text-gray-400">{s.detail} · weight {Math.round(s.weight * 100)}%</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: SummaryStats['overallStatus'] }) {
  const cls =
    status === 'error' ? 'bg-red-100 text-red-800' :
    status === 'warning' ? 'bg-amber-100 text-amber-800' :
    'bg-green-100 text-green-800'
  const label = status === 'healthy' ? 'Healthy' : status === 'warning' ? 'Warning' : 'Error'
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{label}</span>
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={`font-medium ${highlight ? 'text-red-600' : 'text-gray-900'}`}>{value}</span>
    </div>
  )
}

// A stat row whose count can be expanded to reveal the raw events (date,
// time, event text) that contributed to it — click an event to navigate to
// it in the Events & Transmissions view, same as Errors/Warnings.
function CountedRow({
  label,
  stat,
  highlightWhenPositive,
  onNavigateToEvent,
}: {
  label: string
  stat: CountedStat
  highlightWhenPositive?: boolean
  onNavigateToEvent?: (row: DecodedRow) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const highlight = highlightWhenPositive && stat.count > 0

  return (
    <div>
      <button
        onClick={() => setExpanded(e => !e)}
        disabled={stat.count === 0}
        className="w-full flex justify-between items-center text-sm disabled:cursor-default"
      >
        <span className="text-gray-600 flex items-center gap-1">
          {label}
          {stat.count > 0 && (
            <svg
              className={`h-3 w-3 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </span>
        <span className={`font-medium ${highlight ? 'text-red-600' : 'text-gray-900'}`}>{stat.count}</span>
      </button>
      {expanded && stat.count > 0 && (
        <div className="mt-1 mb-1.5 ml-3 pl-2 border-l-2 border-gray-100 space-y-0.5">
          {stat.rows.map((r, i) => (
            <div
              key={i}
              role={onNavigateToEvent ? 'button' : undefined}
              onClick={onNavigateToEvent ? () => onNavigateToEvent(r) : undefined}
              className={`text-xs font-mono text-gray-500 ${onNavigateToEvent ? 'cursor-pointer hover:underline' : ''}`}
              title={r.event}
            >
              {r.date} {r.time} — {r.event}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Summary({ stats, performance, onNavigateToEvent }: Props) {
  const { health, connectivity, lwm2m, errors, warnings, unmatchedRows, dateRange, firstEventTime, lastEventTime, logDurationSeconds, overallStatus } = stats
  const lowBattery = health.voltages.some(v => v < 2800)

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Summary</h2>
        <StatusBadge status={overallStatus} />
      </div>

      <PerformanceSection performance={performance} />

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
        {/* Left column */}
        <div className="px-4 py-4 space-y-5">
          <Section title="Device Health">
            <Row label="Temperature range (°C)" value={minMax(health.temperatures)} />
            <Row label="Average temperature (°C)" value={avg(health.temperatures)} />
            <Row label="Voltage range (mV)" value={minMax(health.voltages)} />
            <Row label="Average voltage (mV)" value={avg(health.voltages)} />
            {health.avgCurrents.length > 0 && (
              <Row label="Average current (μA)" value={avg(health.avgCurrents)} />
            )}
            {lowBattery && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
                <span>⚠</span>
                <span>Low battery detected (below 2800 mV)</span>
              </div>
            )}
          </Section>

          <Section title="Connectivity">
            <CountedRow label="Cereg success (registered)" stat={connectivity.cererSuccess} onNavigateToEvent={onNavigateToEvent} />
            <CountedRow label="Cereg search / attach" stat={connectivity.ceregSearch} onNavigateToEvent={onNavigateToEvent} />
            <CountedRow label="SIM errors" stat={connectivity.simErrors} highlightWhenPositive onNavigateToEvent={onNavigateToEvent} />
            <CountedRow label="Modem disabled events" stat={connectivity.modemDisabled} highlightWhenPositive onNavigateToEvent={onNavigateToEvent} />
            <CountedRow label="CME errors" stat={connectivity.cmeErrors} highlightWhenPositive onNavigateToEvent={onNavigateToEvent} />
          </Section>
        </div>

        {/* Right column */}
        <div className="px-4 py-4 space-y-5">
          <Section title="LWM2M Activity">
            <CountedRow label="Reading cycles" stat={lwm2m.readingCycles} onNavigateToEvent={onNavigateToEvent} />
            <CountedRow label="Reading dispatch cycles" stat={lwm2m.readingDispatches} onNavigateToEvent={onNavigateToEvent} />
            <CountedRow label="Status cycles" stat={lwm2m.statusCycles} onNavigateToEvent={onNavigateToEvent} />
            <CountedRow label="Status dispatch cycles" stat={lwm2m.statusDispatches} onNavigateToEvent={onNavigateToEvent} />
            <CountedRow label="Notify success" stat={lwm2m.notifySuccess} onNavigateToEvent={onNavigateToEvent} />
            <CountedRow label="Notify failed" stat={lwm2m.notifyFailed} highlightWhenPositive onNavigateToEvent={onNavigateToEvent} />
            <CountedRow label="Observe registrations" stat={lwm2m.observeCount} onNavigateToEvent={onNavigateToEvent} />
            <CountedRow label="FOTA events" stat={lwm2m.fotaEvents} onNavigateToEvent={onNavigateToEvent} />
          </Section>

          {Object.keys(stats.sessionCounts).length > 0 && (
            <Section title="Session Types">
              {Object.entries(stats.sessionCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([label, count]) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-gray-600">{label.replace('Communication session — ', '')}</span>
                    <span className="font-medium text-gray-900 flex gap-2">
                      <span>{count}</span>
                      <span className="text-gray-400 font-normal">avg {formatDuration(stats.sessionAvgDurations[label] ?? 0)}</span>
                    </span>
                  </div>
                ))}
            </Section>
          )}

          {errors.length > 0 && (
            <Section title={`Errors (${errors.length})`}>
              <div className="space-y-2">
                {groupByExplanation(errors).map(({ explanation, rows: group }) => (
                  <div key={explanation} className="bg-red-50 rounded px-2 py-1.5">
                    <div className="flex justify-between gap-2 text-xs text-red-800 font-semibold">
                      <span>{explanation}</span>
                      <span className="flex-shrink-0">{group.length}</span>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {group.map((r, i) => (
                        <div
                          key={i}
                          role={onNavigateToEvent ? 'button' : undefined}
                          onClick={onNavigateToEvent ? () => onNavigateToEvent(r) : undefined}
                          className={`text-xs font-mono text-red-700 ${onNavigateToEvent ? 'cursor-pointer hover:underline' : ''}`}
                          title={r.event}
                        >
                          {r.date} {r.time} — {r.event}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {warnings.length > 0 && (
            <Section title={`Warnings (${warnings.length})`}>
              <div className="space-y-2">
                {groupByExplanation(warnings).map(({ explanation, rows: group }) => (
                  <div key={explanation} className="bg-amber-50 rounded px-2 py-1.5">
                    <div className="flex justify-between gap-2 text-xs text-amber-800 font-semibold">
                      <span>{explanation}</span>
                      <span className="flex-shrink-0">{group.length}</span>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {group.map((r, i) => (
                        <div
                          key={i}
                          role={onNavigateToEvent ? 'button' : undefined}
                          onClick={onNavigateToEvent ? () => onNavigateToEvent(r) : undefined}
                          className={`text-xs font-mono text-amber-700 ${onNavigateToEvent ? 'cursor-pointer hover:underline' : ''}`}
                          title={r.event}
                        >
                          {r.date} {r.time} — {r.event}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {unmatchedRows.length > 0 && (
            <Section title={`Unmatched events (${unmatchedRows.length})`}>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {unmatchedRows.map((r, i) => (
                  <div
                    key={i}
                    role={onNavigateToEvent ? 'button' : undefined}
                    onClick={onNavigateToEvent ? () => onNavigateToEvent(r) : undefined}
                    className={`text-xs font-mono bg-gray-50 text-gray-600 px-2 py-1 rounded truncate ${onNavigateToEvent ? 'cursor-pointer hover:underline' : ''}`}
                    title={r.event}
                  >
                    {r.date} {r.time} — {r.event}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex flex-wrap gap-4 text-xs text-gray-500">
        {dateRange.start && (
          <span>
            Log span: <strong className="text-gray-700">{dateRange.start} {firstEventTime}</strong>
            {' → '}<strong className="text-gray-700">{dateRange.end} {lastEventTime}</strong>
          </span>
        )}
        {dateRange.start && (
          <span>Duration: <strong className="text-gray-700">{formatDuration(logDurationSeconds)}</strong></span>
        )}
        <span>Total: <strong className="text-gray-700">{stats.totalEvents.toLocaleString()}</strong></span>
        <span>Matched: <strong className="text-green-700">{stats.matchedEvents.toLocaleString()}</strong></span>
        <span>Unmatched: <strong className="text-orange-600">{stats.unmatchedEvents.toLocaleString()}</strong></span>
        <span className="ml-auto">
          Status: <StatusBadge status={overallStatus} />
        </span>
      </div>
    </div>
  )
}
