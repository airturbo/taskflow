import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './styles/globals.css'
import './styles/sidebar-shared.css'
import './styles/mobile-layout.css'
import './styles/shared-components.css'
import App from './App.tsx'
import { AuthGate } from './components/AuthGate.tsx'
import { ViewErrorBoundary } from './components/ViewErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ViewErrorBoundary viewName="App">
        <AuthGate>
          <App />
        </AuthGate>
      </ViewErrorBoundary>
    </HashRouter>
  </StrictMode>,
)
