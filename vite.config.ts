import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Emits sw.js listing every built file, so the web version keeps working offline after one visit.
// The version changes whenever any file name (they carry content hashes) or public file changes.
const serviceWorker = (): Plugin => ({
  name: 'snap-puzzle-sw',
  apply: 'build',
  generateBundle(_, bundle) {
    const publicFiles = readdirSync('public', { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => `${d.parentPath.replace(/^public\/?/, '')}${d.parentPath === 'public' ? '' : '/'}${d.name}`)
    const files = ['./', './index.html', ...Object.keys(bundle).filter((f) => f !== 'index.html'), ...publicFiles]
      .map((f) => (f.startsWith('./') ? f : `./${f}`))
    const hash = createHash('sha256')
    files.forEach((f) => hash.update(f))
    publicFiles.forEach((f) => hash.update(readFileSync(`public/${f}`)))
    const source = readFileSync('sw.template.js', 'utf8')
      .replace('__VERSION__', hash.digest('hex').slice(0, 12))
      .replace('__FILES__', JSON.stringify(files, null, 2))
    this.emitFile({ type: 'asset', fileName: 'sw.js', source })
  },
})

// https://vite.dev/config/
export default defineConfig({
  // Relative paths so the same build runs inside the Android app and under any GitHub Pages folder
  base: './',
  plugins: [react(), tailwindcss(), serviceWorker()],
})
