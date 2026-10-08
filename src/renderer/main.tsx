import React from 'react'
import ReactDOM from 'react-dom/client'
import './monaco-setup'
import App from './App'
import './styles/global.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
