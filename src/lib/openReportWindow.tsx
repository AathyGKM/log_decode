import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

// Pops a fully-rendered React element into a brand new browser window,
// copying over the current document's stylesheets so Tailwind classes still
// render correctly. The popup is an in-memory snapshot mounted directly into
// a blank window — it is not backed by a route, so refreshing it will show a
// blank page; re-open it from the main window if needed.
// Returns false (instead of alerting) when the popup was blocked, so callers
// opening several windows at once can show one consolidated message.
export function openReportWindow(node: ReactElement, title: string): boolean {
  const win = window.open('', '_blank', 'width=1280,height=900')
  if (!win) return false
  win.document.title = title
  document.querySelectorAll('link[rel="stylesheet"], style').forEach(styleNode => {
    win.document.head.appendChild(styleNode.cloneNode(true))
  })
  const container = win.document.createElement('div')
  win.document.body.appendChild(container)
  createRoot(container).render(node)
  return true
}
