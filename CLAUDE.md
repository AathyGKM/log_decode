# CLAUDE.md — Log Decoder Project Reference

> This file is the single source of truth for Claude Code.
> Read this fully before writing any code, creating any file, or making any decision.

---

## 1. Project overview

A **client-side only** web application that decodes NB-IoT device diagnostic logs.
The user uploads a CSV log file. The app translates every event line into plain English
using a local knowledge base (`logkey.csv`), detects transmission patterns, generates a
structured summary, and renders a chronological unified session view — all without any
backend or AI API calls.

**Stack:** React 18 · TypeScript · Vite · Tailwind CSS  
**Runs on:** `localhost:5173` via `npm run dev`  
**No backend. No API keys. No server language.**

---

## 2. Project structure

```
log-decoder/
├── public/
│   ├── logkey.csv                   # Knowledge base — never modify at runtime
│   └── transmission_patterns.json   # Transmission sequence patterns — extend to add new patterns
├── src/
│   ├── components/
│   │   ├── CombinedView.tsx         # Primary view: unified sessions + rows (used in App)
│   │   ├── FileUpload.tsx           # Drag-and-drop CSV upload zone
│   │   ├── LogTable.tsx             # Decoded log rows with explanation column (standalone)
│   │   ├── Summary.tsx              # Auto-generated stats summary panel
│   │   ├── Timeline.tsx             # Chronological session timeline (standalone)
│   │   └── Transmissions.tsx        # Transmission pattern list (standalone, not in App)
│   ├── lib/
│   │   ├── parseLog.ts              # Parses device CSV → LogRow[]
│   │   ├── parseKey.ts              # Loads logkey.csv → KeyEntry[]
│   │   ├── parsePatterns.ts         # Loads transmission_patterns.json → TransmissionPattern[]
│   │   ├── normalise.ts             # Strips variable values from log strings
│   │   ├── matchKey.ts              # 4-pass pattern matcher → DecodedRow[]
│   │   ├── matchTransmissions.ts    # Sequence matcher → Transmission[]
│   │   ├── summarise.ts             # Aggregates DecodedRow[] → SummaryStats
│   │   ├── buildTimeline.ts         # Groups DecodedRow[] → TimelineSession[]
│   │   ├── buildUnifiedView.ts      # Merges sessions + rows → UnifiedItem[] (used in App)
│   │   └── buildCombinedView.ts     # Alternative merger (unused — kept for reference)
│   ├── types/
│   │   └── index.ts                 # All shared TypeScript types
│   ├── App.tsx                      # App shell, state, view orchestration
│   ├── index.css                    # Tailwind directives only
│   └── main.tsx                     # React entry point
├── example_log.csv                  # Sample log file for testing
├── .gitignore
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.js
```

---

## 3. TypeScript types  
**File: `src/types/index.ts`**

```ts
// Raw row from the device log CSV
export interface LogRow {
  date: string        // e.g. "06-May-2026"
  time: string        // e.g. "16:15:01"
  event: string       // e.g. "NBIT: Temp(C): 27 Volt(mV): 3014 Modem Power State: ACTIVE"
  source: string      // extracted prefix: "NBIT" | "LWM2M" | "SNSR" | "FLSV" | "GKCOAP" | "LOGG" | "M95M01" | "UNKNOWN"
}

// One entry from logkey.csv
export interface KeyEntry {
  no: number
  pcApp: string       // Log (PC App) column
  oneTouchApp: string // Log (OneTouchApp) column
  explanation: string // Human-readable explanation
}

// A log row after pattern matching
export interface DecodedRow extends LogRow {
  explanation: string       // From logkey.csv, or "Undocumented event" if unmatched
  matched: boolean          // true if explanation came from logkey
  severity: 'error' | 'warning' | 'info' | 'normal'
}

// Aggregated stats for the summary panel
export interface SummaryStats {
  totalEvents: number
  matchedEvents: number
  unmatchedEvents: number
  dateRange: { start: string; end: string }
  sources: Record<string, number>      // { NBIT: 270, LWM2M: 261, ... }
  health: {
    temperatures: number[]             // all Temp(C) values
    voltages: number[]                 // all Volt(mV) values
    avgCurrents: number[]              // all Average Current (uA) values
  }
  connectivity: {
    cererSuccessCount: number          // Cereg: 1 count
    ceregSearchCount: number           // Cereg: 0 or 2 count
    simErrors: number
    modemDisabledCount: number         // Modem Disabled / Power State: DISABLED / Power State: 0
    cmeErrors: number
  }
  lwm2m: {
    readingCycles: number
    notifySuccess: number              // Status: 0
    notifyFailed: number               // Status: 1
    observeCount: number
    fotaEvents: number
  }
  errors: DecodedRow[]                 // rows with severity === 'error'
  warnings: DecodedRow[]              // rows with severity === 'warning'
  unmatchedRows: DecodedRow[]         // rows with matched === false
  overallStatus: 'healthy' | 'warning' | 'error'
}

// One event inside a timeline session
export interface TimelineEvent {
  time: string
  source: string
  event: string
  explanation: string
  severity: 'error' | 'warning' | 'info' | 'normal'
}

// A communication session (modem ACTIVE → SLEEP cycle)
export interface TimelineSession {
  id: number
  label: string                         // e.g. "Communication session — successful transmission"
  date: string
  startTime: string
  endTime: string
  events: TimelineEvent[]
  status: 'healthy' | 'warning' | 'error' | 'info'
  gapBefore?: string                    // e.g. "~19 hrs gap — modem offline" (if gap > 30 min)
}

// One pattern definition from transmission_patterns.json
export interface TransmissionPattern {
  id: string
  label: string
  description: string
  sequence: (string | string[])[]       // string = find anywhere; string[] = consecutive group
}

// A matched transmission sequence
export interface Transmission {
  id: number
  patternId: string
  patternLabel: string
  date: string
  startTime: string
  endTime: string
  events: TimelineEvent[]
  status: 'healthy' | 'warning' | 'error'
}

// Items in the unified view
export type CombinedItem =
  | { kind: 'transmission'; data: Transmission }
  | { kind: 'row'; data: DecodedRow }

export type UnifiedItem =
  | { kind: 'session'; data: TimelineSession; items: CombinedItem[]; gapBefore?: string }
  | { kind: 'presession'; items: CombinedItem[] }
```

---

## 4. CSV input format

### Device log CSV (user uploads at runtime)
```
Date, Time, Event
06-May-2026,16:00:00, LWM2M: Reading Next Run Time: 06-May-2026 17:00:00
06-May-2026,16:15:01, NBIT: Temp(C): 27  Volt(mV): 3014  Modem Power State: ACTIVE
```
- 3 columns: `Date`, ` Time`, ` Event` (note leading spaces in headers — trim on parse)
- Date format: `DD-Mon-YYYY`
- Time format: `HH:MM:SS`
- Event always starts with a source prefix followed by colon: `NBIT:`, `LWM2M:`, `SNSR:`, `FLSV:`, `GKCOAP:`, `LOGG:`, `M95M01:`

### Knowledge base (`public/logkey.csv` — loaded once on app start)
```
No,Log (PC App),Log (OneTouchApp),Explanation
1,FLSV: LWM2M Readings Not Dispatched: 0,FLSV: LWM2M Readings Not Dispatched: 0,Failsafe message for not dispatched reading logs.
```
- 4 columns: `No`, `Log (PC App)`, `Log (OneTouchApp)`, `Explanation`
- 84 entries total
- Some `Explanation` values are blank/NaN — treat as `"Undocumented event"`

### Transmission patterns (`public/transmission_patterns.json` — loaded once on app start)
```json
{
  "patterns": [
    {
      "id": "standard-reading",
      "label": "Standard reading transmission",
      "description": "...",
      "sequence": [
        "Reading Dispatch Dispatch Time:",
        "Modem Power State: ACTIVE",
        "NBIT: Lwm2m Recovered: 0",
        "LWM2M: Notify: 10376",
        ["Modem Power State: SLEEP", "Modem Power State: SLEEP"]
      ]
    }
  ]
}
```
- A `string` item in `sequence` means: find this substring anywhere from the current position
- A `string[]` item means: find `item[0]` anywhere, then `item[1..n]` must follow in immediately consecutive rows
- Currently 3 patterns: `standard-reading`, `no-reading`, `Alarm-transmission`

---

## 5. Pattern matching logic  
**File: `src/lib/matchKey.ts`**

For each log row, run four passes in order. Return on first match.

### Pass 1 — Exact match (whitespace-collapsed)
Collapse all whitespace runs to a single space, then compare directly against both `pcApp` and `oneTouchApp`.

### Pass 1.5 — Partial normalise
Normalise only trailing state fields (`Status`, `Ack`, `Result`, `Index`) to `{n}` while preserving structural IDs (object:instance:resource numbers, `Type` values). This allows `LWM2M: Notify: 10376 : 0 : 6 Status: 0 Ack: 0` to match against key entries with any Status/Ack values without collapsing the object IDs.

### Pass 2 — Full normalise
Strip all variable values then compare:
- Dates with month names (e.g. `06-May-2026`) → `{date}`
- Dates with slashes (e.g. `24/03/26`) → `{date}`
- Times (e.g. `17:00:00`) → `{time}`
- Unix timestamps (10-digit integers) → `{ts}`
- Hex memory addresses (exactly 8 uppercase hex chars, e.g. `0800066D`) → `{hex}`
- Decimal numbers → `{n}`
- Integers (positive and negative) → `{n}`

Match against fully normalised versions of both `Log (PC App)` and `Log (OneTouchApp)` columns.

Example:
```
"NBIT: Temp(C): 27  Volt(mV): 3014  Modem Power State: ACTIVE"
→ "NBIT: Temp(C): {n} Volt(mV): {n} Modem Power State: ACTIVE"
```

### Pass 3 — Prefix match
Some key entries end with a colon (open-ended). Check if the fully normalised log event **starts with** the normalised key pattern.

Examples of prefix-style key entries:
- `NBIT: Transmission:`
- `NBIT: Transmission Failed:`
- `LWM2M: Reading Next Run Time:`
- `LWM2M: Reading Next Dispatch Time:`
- `LWM2M: Alarm Next Sample Time:`
- `LWM2M: Alarm Stop Sample Time:`
- `LWM2M: Query Next Dispatch Time:`
- `FLSV: GKCOAP Hang:`

### No match
Set `explanation = "Undocumented event"`, `matched = false`.

### Dual format handling
The device has two log formats — PC App (text states) and OneTouchApp (numeric codes).
Always check **both** `pcApp` and `oneTouchApp` columns on every pass.

| PC App format | OneTouchApp format |
|---|---|
| `Modem Power State: ACTIVE` | `Modem Power State: 2` |
| `Modem Power State: SLEEP` | `Modem Power State: 1` |
| `Modem Power State: DISABLED` | `Modem Power State: 0` |
| `Modem Error: ERROR_RECEIVED` | `Modem Error: 2` |
| `Modem Error: RESP_ERR` | `Modem Error: 3` |
| `Modem Error: RESP_TIMEOUT` | `Modem Error: 4` |
| `Modem Error: HARD_RESET` | `Modem Error: 5` |

---

## 6. Severity classification
**Used in `matchKey.ts` after explanation is assigned**

| Severity | Condition |
|---|---|
| `error` | Event contains: `SIM Error`, `Modem Disabled`, `CME Error`, `Modem Error`, `M95M01: Validate Error`, `Swmgt Store Error`, `GKCOAP Hang`, `MCU Reset> PVD`, `MCU Reset> Firmware` |
| `warning` | LWM2M Notify with `Status: 1` or `Ack: 2` · `Transmission Failed` · `LWM2M Readings Not Dispatched` · `Cereg: 0` (no registration) · Voltage below 2800 mV |
| `info` | `Reading Next Run Time` · `Status Next Run Time` · `Query Next Dispatch Time` · `Alarm Next Sample Time` · `Alarm Stop Sample Time` · `Reading Next Dispatch Time` · `Swmgt Current Block` · `Lwm2m Recovered` · `Coap Recovered` · `Next Get Time` |
| `normal` | Everything else |

---

## 7. Summary generation logic  
**File: `src/lib/summarise.ts`**

Overall status rules (evaluated in order — first match wins):
1. **`error`** — any row with `severity === 'error'`
2. **`warning`** — any row with `severity === 'warning'`
3. **`healthy`** — no errors or warnings

`modemDisabledCount` counts all three variants: event contains `Modem Disabled`, `Modem Power State: DISABLED`, or `Modem Power State: 0`.

Battery threshold: flag as low if any `Volt(mV)` value is below `2800`.

---

## 8. Timeline building logic  
**File: `src/lib/buildTimeline.ts`**

1. Sort all `DecodedRow[]` by `date + time` ascending (parse with Date object using `MONTH_MAP`)
2. Detect **session boundaries**:
   - Session **starts** when event contains `Modem Power State: ACTIVE` or `Modem Power State: 2`
   - Session **ends** when event contains `SLEEP` (or `1`) or `DISABLED` (or `0`)
   - A normal session ends with **two consecutive SLEEP events** — both are consumed
   - Events before the first ACTIVE marker form a "pre-session" group labelled `"Scheduled events — modem idle"`
   - If no ACTIVE event exists at all, the entire log is returned as a single idle group
3. Calculate **time gaps** between sessions:
   - Gap > 30 minutes → `gapBefore` label `"~X hrs gap"` or `"~X min gap"`
   - Gap > 12 hours → append `" — modem offline"` to the label
4. Assign **session status** by scanning its events:
   - Any `error` severity → session status `error`
   - Any `warning` severity → session status `warning`
   - Otherwise → `healthy`
5. Generate a **session label** from its dominant event pattern (checked in order):
   - Contains `SIM Error` or `Modem Disabled` → `"Communication session — SIM failure"`
   - Contains `CME Error` → `"Communication session — CME error"`
   - Contains LWM2M Notify with `Status: 1` → `"Communication session — notify failed"`
   - Contains `Swmgt Current Block`, `Execute: 9 : 0`, or `Request: 9 : 0 : 4` → `"Communication session — firmware update"`
   - Otherwise → `"Communication session — successful transmission"`
   - No ACTIVE event (idle period) → `"Scheduled events — modem idle"`
6. **Post-processing — modem reset detection**: After building all sessions, scan sorted rows for the pattern: single SLEEP (not followed by another SLEEP) → `LWM2M: Notify: 10376` → `Lwm2m Recovered: 2` (all before next ACTIVE). If found, relabel the session whose `endTime`/`date` match that SLEEP row to `"Communication session — modem reset before transmission"`.

---

## 9. Transmission pattern matching  
**File: `src/lib/matchTransmissions.ts`**

Runs after `matchKey`. For each pattern in `transmission_patterns.json`:
1. Sort rows by datetime
2. Walk rows looking for the first sequence anchor (first item, or `item[0]` if array)
3. For each candidate start:
   - `string` items: find the substring anywhere from current position (rows can be skipped)
   - `string[]` items: find `item[0]` anywhere, then `item[1..n]` must be in **immediately consecutive** following rows
4. On full sequence match: emit a `Transmission` covering all matched rows; advance pointer to end of match
5. On mismatch: advance by one and retry
6. After all patterns, sort results by datetime and assign sequential IDs

Transmission status is determined by highest severity among its events (error > warning > healthy).

---

## 10. Unified view building  
**File: `src/lib/buildUnifiedView.ts`**

Merges `DecodedRow[]` + `TimelineSession[]` into `UnifiedItem[]`:
1. Sort rows by datetime
2. For each row, find which session it belongs to (by timestamp range)
3. Rows that fall before any session → `presession` group
4. Rows within a session's time range → grouped under that session
5. Output: `[presession?, session, session, ...]` in chronological order
6. Each session item carries `gapBefore` from the `TimelineSession`

Note: `Transmission[]` is accepted as a parameter but currently not embedded in items — all items are `{ kind: 'row' }` only.

---

## 11. Complete knowledge base (all 84 entries)

This is the authoritative translation table. The `matchKey.ts` logic must produce
explanations that match this list exactly.

| No | Log (PC App) | Log (OneTouchApp) | Explanation |
|----|---|---|---|
| 1 | FLSV: LWM2M Readings Not Dispatched: 0 | FLSV: LWM2M Readings Not Dispatched: 0 | Failsafe message for not dispatched reading logs. |
| 2 | FLSV: MCU Reset> Firmware Update: 0800066D | FLSV: MCU Reset> Firmware Update: 0800066D | Failsafe message for firmware update |
| 3 | FLSV: MCU Reset> PVD/PVM: 0800066D | FLSV: MCU Reset> PVD/PVM: 0800066D | Failsafe message for PVD in device. |
| 4 | GKCOAP: Report Next Time: 27/03/26 02:03:15 | GKCOAP: Report Next Time: 27/03/26 02:03:15 | Next GKCOAP reporting time |
| 5 | LOGG: Meter Log: 25783 | LOGG: Meter Log: 25783 | Total reading logs |
| 6 | LWM2M: Alarm Next Sample Time: 25/03/26 02:41:15 | LWM2M: Alarm Next Sample Time: 25/03/26 02:41:15 | Next alarm sample time |
| 7 | LWM2M: Execute: 9 : 0 : 10 Status: 2 Result: 15 | LWM2M: Execute: 9 : 0 : 10 Status: 2 Result: 15 | FOTA command for firmware activation |
| 8 | LWM2M: Notify: 10376 : 0 : 6 Status: 1 Ack: 2 | LWM2M: Notify: 10376 : 0 : 6 Status: 1 Ack: 2 | LWM2M resource for readings |
| 9 | LWM2M: Query Next Dispatch Time: 24/03/26 02:30:12 | LWM2M: Query Next Dispatch Time: 24/03/26 02:30:12 | Next query transmission time |
| 10 | LWM2M: Reading Next Dispatch Time: 24/03/26 02:30:12 | LWM2M: Reading Next Dispatch Time: 24/03/26 02:30:12 | Next reading transmission time |
| 11 | LWM2M: Request: 9 : 0 : 10 Type: 9 Status: 0 | LWM2M: Request: 9 : 0 : 10 Type: 9 Status: 0 | FOTA command to request firmware activation |
| 12 | LWM2M: Status Next Run Time: 23/03/26 03:00:00 | LWM2M: Status Next Run Time: 23/03/26 03:00:00 | Next status log time |
| 13 | LWM2M: Swmgt Current Block: 0 | LWM2M: Swmgt Current Block: 0 | FOTA first package initiation |
| 14 | LWM2M: Swmgt Current Block: 461 | LWM2M: Swmgt Current Block: 461 | FOTA packet download |
| 15 | NBIT: Cereg: 2 | NBIT: Cereg: 2 | Network registration/attach |
| 16 | NBIT: CME Error: 3 BC66 SubState: 0 BC66 State: PROCESS_REQUEST_Bc66LinkState | NBIT: CME Error: 3 BC66 SubState: 0 BC66 State: PROCESS_REQUEST_Bc66LinkState | CME Error |
| 17 | NBIT: CME Error: 32 BC66 SubState: 0 BC66 State: PROCESS_REQUEST_Bc66LinkState | NBIT: CME Error: 32 BC66 SubState: 0 BC66 State: PROCESS_REQUEST_Bc66LinkState | CME Error |
| 18 | NBIT: CME Error: 33 BC66 SubState: 0 BC66 State: PROCESS_REQUEST_Bc66LinkState | NBIT: CME Error: 33 BC66 SubState: 0 BC66 State: PROCESS_REQUEST_Bc66LinkState | CME Error |
| 19 | NBIT: CME Error: 4 BC66 SubState: 0 BC66 State: PROCESS_REQUEST_Bc66LinkState | NBIT: CME Error: 4 BC66 SubState: 0 BC66 State: PROCESS_REQUEST_Bc66LinkState | CME Error |
| 20 | NBIT: CME Error: 846 BC66 SubState: 0 BC66 State: PROCESS_REQUEST_Bc66LinkState | NBIT: CME Error: 846 BC66 SubState: 0 BC66 State: PROCESS_REQUEST_Bc66LinkState | CME Error |
| 21 | NBIT: Coap Recovered: 0 | NBIT: Coap Recovered: 0 | *(no explanation — treat as "Undocumented event")* |
| 22 | NBIT: Lwm2m Recovered: 0 | NBIT: Lwm2m Recovered: 0 | *(no explanation — treat as "Undocumented event")* |
| 23 | NBIT: Temp(C): 27 Volt(mV): 3010 Modem Error: ERROR_RECEIVED | NBIT: Temp(C): 27 Volt(mV): 3010 Modem Error: 2 | Modem Error |
| 24 | NBIT: Temp(C): 27 Volt(mV): 3010 Modem Error: RESP_ERR | NBIT: Temp(C): 27 Volt(mV): 3010 Modem Error: 3 | Modem Error |
| 25 | NBIT: Temp(C): 27 Volt(mV): 3010 Modem Error: RESP_TIMEOUT | NBIT: Temp(C): 30 Volt(mV): 2996 Modem Error: 4 | Modem Error |
| 26 | NBIT: Temp(C): 27 Volt(mV): 3009 Modem Error: HARD_RESET | NBIT: Temp(C): 30 Volt(mV): 2996 Modem Error: 5 | Modem Error |
| 27 | NBIT: Temp(C): 27 Volt(mV): 3009 Modem Power State: DISABLED | NBIT: Temp(C): 30 Volt(mV): 2996 Modem Power State: 0 | Modem disabled |
| 28 | NBIT: Temp(C): 27 Volt(mV): 3009 Modem Power State: SLEEP | NBIT: Temp(C): 30 Volt(mV): 2996 Modem Power State: 1 | Modem sleep |
| 29 | NBIT: Temp(C): 27 Volt(mV): 3009 Modem Power State: ACTIVE | NBIT: Temp(C): 30 Volt(mV): 2996 Modem Power State: 2 | Modem activate |
| 30 | NBIT: Transmission Failed: | NBIT: Transmission Failed: | Count of failed transmission |
| 31 | NBIT: Transmission: | NBIT: Transmission: | Count of total transmission |
| 32 | SNSR: Average Current (uA): 15.624999 | SNSR: Average Current (uA): 15.624999 | Average current consumption |
| 33 | SNSR: Temp(C): 39 Volt(mV): 2996 | SNSR: Temp(C): 39 Volt(mV): 2996 | MCU Voltage level |
| 34 | FLSV: MCU Reset> User: 0800A3AA | FLSV: MCU Reset> User: 0800A3AA | User reboot |
| 35 | LWM2M: Execute: 9 : 0 : 11 Status: 2 Result: 0 | LWM2M: Execute: 9 : 0 : 11 Status: 2 Result: 0 | FOTA Command deactivate firmware |
| 36 | LWM2M: Notify: 10376 : 0 : 6 Status: 0 Ack: 0 | LWM2M: Notify: 10376 : 0 : 6 Status: 0 Ack: 0 | LWM2M resource for readings |
| 37 | LWM2M: Notify: 10376 : 1 : 6 Status: 0 Ack: 0 | LWM2M: Notify: 10376 : 1 : 6 Status: 0 Ack: 0 | LWM2M resource for readings |
| 38 | LWM2M: Notify: 10377 : 0 : 3 Status: 0 Ack: 0 | LWM2M: Notify: 10377 : 0 : 3 Status: 0 Ack: 0 | LWM2M resource for alarm |
| 39 | LWM2M: Notify: 9 : 0 : 1 Status: 0 Ack: 0 | LWM2M: Notify: 9 : 0 : 1 Status: 0 Ack: 0 | LWM2M resource for firmware version |
| 40 | LWM2M: Notify: 9 : 0 : 7 Status: 0 Ack: 0 | LWM2M: Notify: 9 : 0 : 7 Status: 0 Ack: 0 | LWM2M resource for firmware update state |
| 41 | LWM2M: Notify: 9 : 0 : 9 Status: 0 Ack: 0 | LWM2M: Notify: 9 : 0 : 9 Status: 0 Ack: 0 | LWM2M resource for firmware update result |
| 42 | LWM2M: Observe: 10376 : 0 : 6 Status: 0 Index: 0 | LWM2M: Observe: 10376 : 0 : 6 Status: 0 Index: 0 | LWM2M Object registration |
| 43 | LWM2M: Observe: 10376 : 1 : 6 Status: 0 Index: 0 | LWM2M: Observe: 10376 : 1 : 6 Status: 0 Index: 0 | LWM2M Object registration |
| 44 | LWM2M: Observe: 10377 : 0 : 3 Status: 0 Index: 0 | LWM2M: Observe: 10377 : 0 : 3 Status: 0 Index: 0 | LWM2M Object registration |
| 45 | LWM2M: Observe: 9 : 0 : 1 Status: 0 Index: 0 | LWM2M: Observe: 9 : 0 : 1 Status: 0 Index: 0 | LWM2M Object registration |
| 46 | LWM2M: Observe: 9 : 0 : 7 Status: 0 Index: 0 | LWM2M: Observe: 9 : 0 : 7 Status: 0 Index: 0 | LWM2M Object registration |
| 47 | LWM2M: Observe: 9 : 0 : 9 Status: 0 Index: 0 | LWM2M: Observe: 9 : 0 : 9 Status: 0 Index: 0 | LWM2M Object registration |
| 48 | LWM2M: Request: 10376 : 0 : 6 Type: 10 Status: 0 | LWM2M: Request: 10376 : 0 : 6 Type: 10 Status: 0 | LWM2M Object registration |
| 49 | LWM2M: Request: 10376 : 1 : 6 Type: 10 Status: 0 | LWM2M: Request: 10376 : 1 : 6 Type: 10 Status: 0 | LWM2M Object registration |
| 50 | LWM2M: Request: 10377 : 0 : 3 Type: 10 Status: 0 | LWM2M: Request: 10377 : 0 : 3 Type: 10 Status: 0 | LWM2M Object registration |
| 51 | LWM2M: Request: 9 : 0 : 11 Type: 9 Status: 0 | LWM2M: Request: 9 : 0 : 11 Type: 9 Status: 0 | FOTA Command deactivate firmware |
| 52 | LWM2M: Request: 9 : 0 : 3 Type: 7 Status: 0 | LWM2M: Request: 9 : 0 : 3 Type: 7 Status: 0 | FOTA Command for firmware package URI |
| 53 | LWM2M: Request: 9 : 0 : 1 Type: 10 Status: 0 | LWM2M: Request: 9 : 0 : 1 Type: 10 Status: 0 | LWM2M Object registration |
| 54 | LWM2M: Request: 9 : 0 : 7 Type: 10 Status: 0 | LWM2M: Request: 9 : 0 : 7 Type: 10 Status: 0 | LWM2M Object registration |
| 55 | LWM2M: Request: 9 : 0 : 9 Type: 10 Status: 0 | LWM2M: Request: 9 : 0 : 9 Type: 10 Status: 0 | LWM2M Object registration |
| 56 | LWM2M: Write: 9 : 0 : 3 Status: 2 Result: 15 | LWM2M: Write: 9 : 0 : 3 Status: 2 Result: 15 | FOTA Command for firmware package URI |
| 57 | NBIT: Cell ID: 0951F248 | NBIT: Cell ID: 0951F248 | Cell ID number |
| 58 | NBIT: Cereg: 1 | NBIT: Cereg: 1 | Successful network registration/attach |
| 59 | NBIT: CME Error: 847 BC66 SubState: 0 BC66 State: PROCESS_REQUEST_Bc66LinkState | NBIT: CME Error: 847 BC66 SubState: 0 BC66 State: PROCESS_REQUEST_Bc66LinkState | CME Error |
| 60 | NBIT: Earfcn: 1391 | NBIT: Earfcn: 1391 | Modem Parameter |
| 61 | NBIT: Opr Mode: 2 Tx Power: 230 ECL: 0 | NBIT: Opr Mode: 2 Tx Power: 230 ECL: 0 | Modem Parameter |
| 62 | NBIT: Pci: 401 EarfcnOffset: 1 | NBIT: Pci: 401 EarfcnOffset: 1 | Modem Parameter |
| 63 | NBIT: RSRQ: 65528 RSRP: 65450 | NBIT: RSRQ: 65528 RSRP: 65450 | Modem Parameter |
| 64 | NBIT: Rx Time(s): 85 | NBIT: Rx Time(s): 85 | Modem Parameter |
| 65 | NBIT: SINR: 11 RSSI: 65458 | NBIT: SINR: 11 RSSI: 65458 | Modem Parameter |
| 66 | NBIT: Sleep Duration: 0 | NBIT: Sleep Duration: 0 | Modem Parameter |
| 67 | NBIT: TAC: 6182 Band: 3 | NBIT: TAC: 6182 Band: 3 | Modem Parameter |
| 68 | NBIT: Transmission: 14980 | NBIT: Transmission: 14980 | Modem Parameter |
| 69 | NBIT: Tx Time(s): 4 | NBIT: Tx Time(s): 4 | Modem Parameter |
| 70 | LWM2M: Request: 9 : 0 : 4 Type: 9 Status: 0 | LWM2M: Request: 9 : 0 : 4 Type: 9 Status: 0 | FOTA Command firmware installation |
| 71 | LWM2M: Execute: 9 : 0 : 4 Status: 2 Result: 15 | LWM2M: Execute: 9 : 0 : 4 Status: 2 Result: 15 | FOTA Command firmware installation |
| 72 | LWM2M: Next Get Time: 1775412358 Swmgt Backoff: 05-Apr-2026 18:05:58 | LWM2M: Next Get Time: 1775412358 Swmgt Backoff: 05-Apr-2026 18:05:58 | FOTA Command firmware package backoff |
| 73 | LWM2M: Swmgt Store Error: 00000000 | LWM2M: Swmgt Store Error: 00000000 | FOTA Command package download error |
| 74 | NBIT: Modem Disabled. Restart Time: 11/04/26 09:38:48 | NBIT: Modem Disabled. Restart Time: 11/04/26 09:38:48 | Modem disable and restart message. |
| 75 | NBIT: SIM Error: 1 | NBIT: SIM Error: 1 | SIM Error count |
| 76 | FLSV: GKCOAP Hang: | FLSV: GKCOAP Hang: | Failsafe GKCOAP hang/not connecting |
| 77 | FLSV: MCU Reset> Option Byte Load: 00000000 | FLSV: MCU Reset> Option Byte Load: 00000000 | MCU Reset |
| 78 | M95M01: Validate Error: 11 | M95M01: Validate Error: 11 | EEPROM Hardware error |
| 79 | LWM2M: Status Next Run Time: 23/03/26 03:00:00 | LWM2M: Status Next Run Time: 23/03/26 03:00:00 | Next status log time |
| 80 | LWM2M: Alarm Next Sample Time: | LWM2M: Alarm Next Sample Time: | Next alarm sample time |
| 81 | LWM2M: Alarm Stop Sample Time: | LWM2M: Alarm Stop Sample Time: | Next alarm sample stop time |
| 82 | LWM2M: Reading Next Dispatch Time: | LWM2M: Reading Next Dispatch Time: | Reading dispatch time |
| 83 | LWM2M: Reading Next Run Time: | LWM2M: Reading Next Run Time: | Next reading log time |
| 85 | NBIT: Lwm2m Recovered: 10 | NBIT: Lwm2m Recovered: 10 | LWM2M reset timeout |

---

## 12. UI components and layout

### App shell — rendered in order
1. `<FileUpload>` — always visible at the top
2. `<CombinedView>` — rendered after a file is loaded (primary view)
3. `<Summary>` — rendered after a file is loaded, below CombinedView

`LogTable` and `Timeline` exist as standalone components but are not rendered in App.tsx.
`Transmissions` exists but is also not rendered in App.tsx.

### FileUpload (`src/components/FileUpload.tsx`)
- Drag-and-drop zone + browse button
- Accepts `.csv` files only
- Disabled while knowledge base is loading
- On load: `parseLog` → `matchKey` → `matchTransmissions` → `buildTimeline` → `summarise` → `buildUnifiedView`
- Shows filename and event count after successful load

### CombinedView (`src/components/CombinedView.tsx`)
Primary view — receives `items: UnifiedItem[]`, `sessions`, `transmissions`, `rows`.

- Presession group rendered first (events before any ACTIVE marker)
- Then each session rendered as a collapsible titled block with a status-coloured dot
- Events inside each session shown as a vertical list
- Each event: time (monospace) · source badge · explanation · raw event (muted, truncated)
- Time gap dividers between sessions if gap > 30 minutes
- Source filter chips and expand/collapse all buttons
- Export CSV button

### LogTable (`src/components/LogTable.tsx`)
Columns: `Date` · `Time` · `Source` (badge) · `Event` (monospace, truncated) · `Explanation`

- Source badges are colour-coded: NBIT=blue · LWM2M=green · SNSR=amber · FLSV=pink
- Error rows have a faint red row background tint
- Warning rows have a faint amber row background tint
- Filter chips above the table for each source prefix
- Stat bar showing: total events · date span · matched count · unmatched count
- Export CSV button — downloads the decoded table with explanation column appended

### Summary (`src/components/Summary.tsx`)
Two-column grid:

Left column:
- Device health: temperature, voltage trend, average current, low battery flag
- Connectivity: Cereg success/search counts, SIM errors, modem disabled, CME errors

Right column:
- LWM2M activity: reading cycles, notify success/fail, observe count, FOTA events
- Collapsible lists of errors, warnings, unmatched events

Bottom status bar: log span · event counts · overall status badge

### Colour conventions (Tailwind classes)
| Purpose | Tailwind |
|---|---|
| NBIT badge | `bg-blue-50 text-blue-800` |
| LWM2M badge | `bg-green-50 text-green-800` |
| SNSR badge | `bg-amber-50 text-amber-800` |
| FLSV badge | `bg-pink-50 text-pink-800` |
| Error row tint | `bg-red-50` |
| Warning row tint | `bg-amber-50` |
| Status: healthy | `bg-green-100 text-green-800` |
| Status: warning | `bg-amber-100 text-amber-800` |
| Status: error | `bg-red-100 text-red-800` |

---

## 13. Build and run commands

```bash
npm run dev      # start dev server → http://localhost:5173
npm run build    # production build → dist/
npm run preview  # preview production build locally
```

---

## 14. Rules for Claude Code

- **Never** add a backend, server, or API call of any kind
- **Never** add an `.env` file or reference `import.meta.env`
- **Never** install additional dependencies without asking first
- **Always** keep all logic in `src/lib/` — no business logic in components
- **Always** use the types defined in `src/types/index.ts` — never define inline types
- **Always** refer to section 11 (knowledge base table) when writing or testing `matchKey.ts`
- **Always** use Tailwind utility classes for styling — no inline styles, no CSS modules
- Components receive data as props — they do not fetch or parse anything themselves
- If a log event does not match any key entry after all 4 passes, set `explanation = "Undocumented event"` and `matched = false` — never guess or invent an explanation
- To add a new transmission pattern, add an entry to `public/transmission_patterns.json` — do not hardcode patterns in `matchTransmissions.ts`
