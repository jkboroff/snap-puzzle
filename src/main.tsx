import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { SnapPuzzle } from './SnapPuzzle.tsx'
import { Capacitor } from '@capacitor/core'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SnapPuzzle />
  </StrictMode>,
)

// The web version caches itself for offline play; the Android app already has its files on the phone
if (import.meta.env.PROD && 'serviceWorker' in navigator && !Capacitor.isNativePlatform()) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Offline mode unavailable', e))
}
