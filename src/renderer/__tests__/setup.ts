import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { installWindowMocks } from './mocks/window-api'

vi.mock('@monaco-editor/react', async () => (await import('./mocks/monaco')).monacoReactModule)
vi.mock('monaco-editor', async () => (await import('./mocks/monaco')).monacoEditorModule)

beforeEach(() => {
  vi.clearAllMocks()
  installWindowMocks()
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.documentElement.removeAttribute('data-theme')
  vi.useRealTimers()
})
