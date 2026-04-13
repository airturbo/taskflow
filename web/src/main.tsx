import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import './styles/sidebar-shared.css'
import './styles/mobile-layout.css'
import './index.css'
import App from './App.tsx'
import { AuthGate } from './components/AuthGate.tsx'
import { ViewErrorBoundary } from './components/ViewErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ViewErrorBoundary viewName="App">
      <AuthGate>
        <App />
      </AuthGate>
    </ViewErrorBoundary>
  </StrictMode>,
)
