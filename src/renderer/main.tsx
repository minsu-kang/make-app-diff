import React from 'react'
import ReactDOM from 'react-dom/client'
import './monaco/monaco-setup'
import './styles/tokens.css'
import './styles/base.css'
import './shared/ui/buttons.css'
import './shared/ui/dialog.css'
import './shared/ui/search-results.css'
import './shared/ui/download-success.css'
import './shared/ui/error-message.css'
import './shared/ui/section-chevron.css'
import App from './app/App'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
