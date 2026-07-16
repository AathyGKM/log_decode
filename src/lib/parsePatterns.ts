import type { TransmissionPattern } from '../types'

export async function parsePatterns(): Promise<TransmissionPattern[]> {
  try {
    const response = await fetch('/transmission_patterns.json')
    if (!response.ok) return []
    const data = await response.json() as { patterns?: TransmissionPattern[] }
    return Array.isArray(data.patterns) ? data.patterns : []
  } catch {
    return []
  }
}
