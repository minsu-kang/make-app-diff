import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import { imljsonLanguage, imljsonLanguageConfig } from './languages/imljson'
import { makediffDark, makediffMake, makediffLight } from './themes/monaco-themes'

// Configure Monaco workers for local loading (no CDN)
self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    if (label === 'json') return new jsonWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    return new editorWorker()
  }
}

// Read-only viewer: the language workers run, but compiled and generated code gets no error underlines
const noDiagnostics = { noSemanticValidation: true, noSyntaxValidation: true, noSuggestionDiagnostics: true }
monaco.typescript.typescriptDefaults.setDiagnosticsOptions(noDiagnostics)
monaco.typescript.javascriptDefaults.setDiagnosticsOptions(noDiagnostics)
monaco.css.cssDefaults.setOptions({ validate: false })
monaco.css.scssDefaults.setOptions({ validate: false })
monaco.css.lessDefaults.setOptions({ validate: false })

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
