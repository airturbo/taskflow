import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
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
