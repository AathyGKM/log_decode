//This file loads and parses the logkey.csv knowledge base into KeyEntry records used to decode raw log events into human-readable explanations.

import type { KeyEntry } from '../types'

export async function parseKey(): Promise<KeyEntry[]> {
  const response = await fetch('/logkey.csv')
  const text = await response.text()
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  const dataLines = lines.slice(1)
  const entries: KeyEntry[] = []

  for (const line of dataLines) {
    const parts = line.split(',')
    if (parts.length < 4) continue
    const no = parseInt(parts[0].trim(), 10)
    if (isNaN(no) || no <= 0) continue
    const pcApp = parts[1].trim()
    const oneTouchApp = parts[2].trim()
    const explanation = parts.slice(3).join(',').trim()
    entries.push({ no, pcApp, oneTouchApp, explanation })
  }

  return entries
}
