import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { db, ensureSeeded } from './db'
import { startSync } from './lib/sync'

async function boot() {
  await ensureSeeded()
  // Ask Safari to keep our IndexedDB data instead of evicting it under storage pressure.
  navigator.storage?.persist?.().catch(() => {})
  startSync()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
boot()

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}))
}

// Handy for debugging from the console.
;(window as unknown as { db: typeof db }).db = db
