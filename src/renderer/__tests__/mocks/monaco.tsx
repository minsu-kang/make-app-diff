import { useEffect } from 'react'
import { vi } from 'vitest'

export interface EditorProps {
  language?: string
  value?: string
  original?: string
  modified?: string
  theme?: string
  options?: { renderSideBySide?: boolean }
  onMount?: (editor: unknown, monaco: unknown) => void
}

export const editorHandles = {
  diffEditor: { updateOptions: vi.fn() },
  editor: { updateOptions: vi.fn() }
}

export function FakeEditor({ language, value, theme, onMount }: EditorProps) {
  useEffect(() => onMount?.(editorHandles.editor, {}), [onMount])
  return <div data-testid="editor" data-language={language} data-theme={theme} data-value={value} />
}

export function FakeDiffEditor({ language, original, modified, theme, options, onMount }: EditorProps) {
  useEffect(() => onMount?.(editorHandles.diffEditor, {}), [onMount])
  return (
    <div
      data-testid="diff-editor"
      data-language={language}
      data-theme={theme}
      data-original={original}
      data-modified={modified}
      data-side-by-side={String(options?.renderSideBySide)}
    />
  )
}

export const monacoReactModule = {
  Editor: FakeEditor,
  DiffEditor: FakeDiffEditor,
  loader: { config: vi.fn() }
}

export const monacoEditorModule = {
  editor: { defineTheme: vi.fn() },
  languages: {
    register: vi.fn(),
    setMonarchTokensProvider: vi.fn(),
    setLanguageConfiguration: vi.fn()
  },
  typescript: {
    typescriptDefaults: { setDiagnosticsOptions: vi.fn() },
    javascriptDefaults: { setDiagnosticsOptions: vi.fn() }
  },
  css: {
    cssDefaults: { setOptions: vi.fn() },
    scssDefaults: { setOptions: vi.fn() },
    lessDefaults: { setOptions: vi.fn() }
  }
}
