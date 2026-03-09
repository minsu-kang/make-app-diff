import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import { imljsonLanguage, imljsonLanguageConfig } from './languages/imljson'
import { makediffDark, makediffMake, makediffLight } from './themes/monaco-themes'

// Configure Monaco workers for local loading (no CDN)
self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    if (label === 'json') return new jsonWorker()
    return new editorWorker()
  }
}

// Use local monaco instance instead of CDN
loader.config({ monaco })

// Register IMLJSON language
monaco.languages.register({ id: 'imljson' })
monaco.languages.setMonarchTokensProvider('imljson', imljsonLanguage)
monaco.languages.setLanguageConfiguration('imljson', imljsonLanguageConfig)

// Register themes
monaco.editor.defineTheme('makediff-dark', makediffDark)
monaco.editor.defineTheme('makediff-make', makediffMake)
monaco.editor.defineTheme('makediff-light', makediffLight)

export function getMonacoTheme(): string {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark'
  return `makediff-${theme}`
}

export function getLanguageForFile(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    json: 'json',
    imljson: 'imljson',
    js: 'javascript',
    ts: 'typescript',
    css: 'css',
    html: 'html',
    xml: 'xml',
    md: 'markdown'
  }
  return map[ext] || 'plaintext'
}
