import React from 'react'
import { createRoot } from 'react-dom/client'
import BrowserActivityOverlay from './BrowserActivityOverlay'

createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <BrowserActivityOverlay />
  </React.StrictMode>
)
