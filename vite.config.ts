import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const version = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')

// base is relative so the build works on GitHub Pages under /fitness-hq/
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    {
      name: 'sw-version',
      apply: 'build',
      closeBundle() {
        // Stamp the service worker so each deploy busts the old cache.
        const p = resolve(__dirname, 'dist/sw.js')
        writeFileSync(p, readFileSync(p, 'utf8').replace('__VERSION__', version))
      },
    },
  ],
})
