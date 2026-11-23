import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { isMac, isWindows } from './lib/platform'
import './styles.css'
import '@xterm/xterm/css/xterm.css'

// Prevent the window from navigating to a file:// URL when a file is dropped
// outside our explicit drop zones. The Context panel handles its own drops.
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

// macOS: the window is transparent over native vibrancy. Square it off in fullscreen.
// Windows 11: the window is Mica; the renderer stays translucent so the material shows.
if (isMac) {
  document.documentElement.classList.add('mac')
  window.api.window.onFullScreen((fs) =>
    document.documentElement.classList.toggle('fullscreen', fs)
  )
}
if (isWindows) document.documentElement.classList.add('win')

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
