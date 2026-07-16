export function normalise(text: string): string {
  let s = text.trim()

  // Collapse runs of whitespace into a single space
  s = s.replace(/\s+/g, ' ')

  // Dates with month names: DD-Mon-YYYY (e.g. "06-May-2026")
  s = s.replace(/\d{2}-[A-Za-z]{3}-\d{4}/g, '{date}')

  // Dates with slashes: DD/MM/YY (e.g. "24/03/26")
  s = s.replace(/\d{2}\/\d{2}\/\d{2}/g, '{date}')

  // Times: HH:MM:SS
  s = s.replace(/\d{2}:\d{2}:\d{2}/g, '{time}')

  // Unix timestamps: 10-digit numbers (before general integer replacement)
  s = s.replace(/\b\d{10}\b/g, '{ts}')

  // Hex memory addresses: exactly 8 uppercase hex chars (e.g. "0800066D")
  s = s.replace(/\b[0-9A-F]{8}\b/g, '{hex}')

  // Decimal numbers, positive and negative (before integers)
  s = s.replace(/-?\b\d+\.\d+\b/g, '{n}')

  // Integers, positive and negative — except the OneTouchApp state code
  // immediately after "Modem Power State: ", which must stay literal since
  // 0/1/2 (DISABLED/SLEEP/ACTIVE) map to different explanations in logkey.csv;
  // collapsing them to {n} would make every state match whichever of those
  // three key entries happens to appear first in the file.
  s = s.replace(/(?<!Modem Power State: )-?\b\d+\b/g, '{n}')

  return s
}
