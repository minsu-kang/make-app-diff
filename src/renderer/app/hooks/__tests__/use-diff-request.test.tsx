import type { ReactNode } from 'react'
import { describe, it, expect } from 'vitest'
import { act, renderHook, screen } from '@testing-library/react'
import { appOf, deferred, useWiredHooks } from './wired-hooks'
import ToastContainer from '../../../shared/ui/Toast'
import { mockApi, ok } from '../../../__tests__/mocks/window-api'
import type { DiffResult, FileDiff, IpcResult } from '../../../shared/types'

const slack = appOf('slack', 'Slack', ['2.1.0', '2.0.0'])
const VSCODE_FAILURE = 'Failed to open VS Code'

function fileDiff(filePath: string, status: FileDiff['status'], oldContent: string, newContent: string): FileDiff {
  return { filePath, status, oldContent, newContent, unifiedDiff: `-${oldContent}\n+${newContent}` }
}

function diffOf(...diffs: FileDiff[]): DiffResult {
  return { type: 'app', diffs, summary: { added: 0, deleted: 0, modified: diffs.length, unchanged: 0 } }
}

const modified = fileDiff('modules/send/api.imljson', 'modified', 'a', 'b')
const added = fileDiff('connections/oauth/api.imljson', 'added', '', 'c')
const deleted = fileDiff('accounts/old.json', 'deleted', 'gone', '')
const hook = fileDiff('hooks/hook.json', 'added', '', 'h')
const tabbed = diffOf(modified, added, deleted, hook)

function WithToasts({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      {children}
      <ToastContainer />
    </>
  )
}

async function renderSelected() {
  const view = renderHook(() => useWiredHooks(), { wrapper: WithToasts })
  await act(async () => view.result.current.selection.handleAppSelect(slack))
  return view
}

type Wired = Awaited<ReturnType<typeof renderSelected>>['result']

function startCompare(result: Wired) {
  act(() => {
    void result.current.requests.handleCompare()
  })
}

describe('useDiffState', () => {
  it('starts with nothing loaded', () => {
    const { result } = renderHook(() => useWiredHooks())

    expect(result.current.state).toMatchObject({
      diffResult: null,
      activeTab: 'app',
      loading: false,
      error: null,
      selectedFile: null,
      viewMode: 'diff',
      decompile: true,
      currentDiffs: []
    })
    expect(result.current.state.summaries).toEqual({ app: null, account: null, hook: null })
  })

  it('lists the diffs of the active tab and counts the changes of every tab', () => {
    const { result } = renderHook(() => useWiredHooks())

    act(() => result.current.state.setDiffResult(tabbed))
    expect(result.current.state.currentDiffs).toEqual([modified])
    expect(result.current.state.summaries).toEqual({
      app: { added: 0, deleted: 0, modified: 1 },
      account: { added: 1, deleted: 1, modified: 0 },
      hook: { added: 1, deleted: 0, modified: 0 }
    })

    act(() => result.current.state.setActiveTab('account'))
    expect(result.current.state.currentDiffs).toEqual([added, deleted])

    act(() => result.current.state.setActiveTab('hook'))
    expect(result.current.state.currentDiffs).toEqual([hook])
  })

  it('keeps the derived lists until the diff or the tab changes', () => {
    const { result } = renderHook(() => useWiredHooks())
    act(() => result.current.state.setDiffResult(tabbed))
    const { currentDiffs, summaries } = result.current.state

    act(() => result.current.state.setSelectedFile(modified.filePath))
    expect(result.current.state.currentDiffs).toBe(currentDiffs)
    expect(result.current.state.summaries).toBe(summaries)

    act(() => result.current.state.setActiveTab('account'))
    expect(result.current.state.currentDiffs).not.toBe(currentDiffs)
    expect(result.current.state.summaries).toBe(summaries)
  })

  it('stops the spinner and drops the answer of the running request when it invalidates', async () => {
    const pending = deferred<IpcResult<DiffResult>>()
    mockApi().ipm.getDiff.mockReturnValue(pending.promise)
    const { result } = await renderSelected()
    startCompare(result)
    expect(result.current.state.loading).toBe(true)

    act(() => result.current.state.invalidateRequests())
    expect(result.current.state.loading).toBe(false)

    await act(async () => pending.resolve(ok(tabbed)))
    expect(result.current.state.diffResult).toBeNull()
    expect(result.current.state.loading).toBe(false)
  })
})

describe('useDiffRequest', () => {
  describe('Compare', () => {
    it.each([
      [
        'no app is selected',
        async () => {
          const view = renderHook(() => useWiredHooks())
          act(() => {
            view.result.current.selection.handleFromChange('2.0.0')
            view.result.current.selection.handleToChange('2.1.0')
          })
          return view
        }
      ],
      [
        'the From version is empty',
        async () => {
          const view = await renderSelected()
          act(() => view.result.current.selection.handleFromChange(''))
          return view
        }
      ],
      [
        'the To version is empty',
        async () => {
          const view = await renderSelected()
          act(() => view.result.current.selection.handleToChange(''))
          return view
        }
      ]
    ])('does nothing when %s', async (_label, prepare) => {
      const api = mockApi()
      const { result } = await prepare()

      await act(async () => result.current.requests.handleCompare())

      expect(api.ipm.getDiff).not.toHaveBeenCalled()
      expect(result.current.state).toMatchObject({ loading: false, error: null, viewMode: 'diff' })
    })

    it('asks for the selected versions and shows the result', async () => {
      const api = mockApi()
      const pending = deferred<IpcResult<DiffResult>>()
      api.ipm.getDiff.mockReturnValue(pending.promise)
      const { result } = await renderSelected()

      startCompare(result)
      expect(api.ipm.getDiff).toHaveBeenCalledExactlyOnceWith('slack', '2.0.0', '2.1.0', true)
      expect(result.current.state).toMatchObject({ loading: true, viewMode: 'diff', error: null, selectedFile: null })

      await act(async () => pending.resolve(ok(tabbed)))
      expect(result.current.state.diffResult).toBe(tabbed)
      expect(result.current.state.loading).toBe(false)
    })

    it('clears the previous error and the selected file when it starts', async () => {
      const pending = deferred<IpcResult<DiffResult>>()
      mockApi().ipm.getDiff.mockReturnValue(pending.promise)
      const { result } = await renderSelected()
      act(() => {
        result.current.state.setError('Old failure')
        result.current.state.setSelectedFile(modified.filePath)
      })

      startCompare(result)

      expect(result.current.state.error).toBeNull()
      expect(result.current.state.selectedFile).toBeNull()
    })

    const answers: Array<[string, () => Promise<IpcResult<DiffResult>>, string]> = [
      [
        'the message of an unsuccessful result',
        async () => ({ success: false, error: 'Version not found' }),
        'Version not found'
      ],
      ['a default when the result has no message', async () => ({ success: false }), 'Compare failed'],
      ['a default when a successful result has no data', async () => ({ success: true }), 'Compare failed'],
      ['the message of a rejected Error', () => Promise.reject(new Error('socket hang up')), 'socket hang up'],
      ['the text of a rejected value that is not an Error', () => Promise.reject('plain text'), 'plain text']
    ]

    it.each(answers)('shows %s', async (_label, respond, message) => {
      mockApi().ipm.getDiff.mockImplementation(respond)
      const { result } = await renderSelected()

      await act(async () => result.current.requests.handleCompare())

      expect(result.current.state.error).toBe(message)
      expect(result.current.state.diffResult).toBeNull()
      expect(result.current.state.loading).toBe(false)
    })

    it('sends an explicit flag and falls back to the stored one for anything that is not a boolean', async () => {
      const api = mockApi()
      api.ipm.getDiff.mockResolvedValue(ok(tabbed))
      const { result } = await renderSelected()

      await act(async () => result.current.requests.handleCompare(false))
      expect(api.ipm.getDiff).toHaveBeenLastCalledWith('slack', '2.0.0', '2.1.0', false)

      act(() => result.current.state.setDecompile(false))
      await act(async () => result.current.requests.handleCompare({ type: 'click' } as unknown as boolean))
      expect(api.ipm.getDiff).toHaveBeenLastCalledWith('slack', '2.0.0', '2.1.0', false)

      await act(async () => result.current.requests.handleCompare(true))
      expect(api.ipm.getDiff).toHaveBeenLastCalledWith('slack', '2.0.0', '2.1.0', true)
    })

    it('ignores the answer of an older request once a newer one started', async () => {
      const api = mockApi()
      const first = deferred<IpcResult<DiffResult>>()
      const second = deferred<IpcResult<DiffResult>>()
      api.ipm.getDiff.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      const { result } = await renderSelected()
      startCompare(result)
      startCompare(result)

      await act(async () => first.resolve(ok(diffOf(modified))))
      expect(result.current.state.diffResult).toBeNull()
      expect(result.current.state.loading).toBe(true)

      await act(async () => second.resolve(ok(tabbed)))
      expect(result.current.state.diffResult).toBe(tabbed)
      expect(result.current.state.loading).toBe(false)
    })

    it('ignores the failure of an older request', async () => {
      const api = mockApi()
      const first = deferred<IpcResult<DiffResult>>()
      const second = deferred<IpcResult<DiffResult>>()
      api.ipm.getDiff.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      const { result } = await renderSelected()
      startCompare(result)
      startCompare(result)

      await act(async () => first.reject(new Error('Late failure')))
      expect(result.current.state.error).toBeNull()
      expect(result.current.state.loading).toBe(true)

      await act(async () => second.resolve(ok(tabbed)))
      expect(result.current.state.error).toBeNull()
      expect(result.current.state.diffResult).toBe(tabbed)
    })
  })

  describe('Show', () => {
    it('does nothing when no app is selected', async () => {
      const api = mockApi()
      const { result } = renderHook(() => useWiredHooks())

      await act(async () => result.current.requests.handleShow('2.0.0'))

      expect(api.ipm.showVersion).not.toHaveBeenCalled()
      expect(result.current.state).toMatchObject({ loading: false, error: null, viewMode: 'diff' })
    })

    it('asks for the given version and switches to the Show view', async () => {
      const api = mockApi()
      const pending = deferred<IpcResult<DiffResult>>()
      api.ipm.showVersion.mockReturnValue(pending.promise)
      const { result } = await renderSelected()

      act(() => {
        void result.current.requests.handleShow('2.0.0')
      })
      expect(api.ipm.showVersion).toHaveBeenCalledExactlyOnceWith('slack', '2.0.0', true)
      expect(result.current.state).toMatchObject({ loading: true, viewMode: 'show' })

      await act(async () => pending.resolve(ok(tabbed)))
      expect(result.current.state.diffResult).toBe(tabbed)
      expect(result.current.state.loading).toBe(false)
    })

    it('goes back to the Compare view when a comparison runs next', async () => {
      mockApi().ipm.showVersion.mockResolvedValue(ok(tabbed))
      mockApi().ipm.getDiff.mockResolvedValue(ok(tabbed))
      const { result } = await renderSelected()
      await act(async () => result.current.requests.handleShow('2.0.0'))
      expect(result.current.state.viewMode).toBe('show')

      await act(async () => result.current.requests.handleCompare())

      expect(result.current.state.viewMode).toBe('diff')
    })

    it('shows a default message when the result has none and sends an explicit flag', async () => {
      const api = mockApi()
      api.ipm.showVersion.mockResolvedValue({ success: false })
      const { result } = await renderSelected()

      await act(async () => result.current.requests.handleShow('2.0.0', false))

      expect(api.ipm.showVersion).toHaveBeenCalledWith('slack', '2.0.0', false)
      expect(result.current.state.error).toBe('Show failed')
    })

    it('ignores the answer of a Show that a newer request outdated', async () => {
      const api = mockApi()
      const first = deferred<IpcResult<DiffResult>>()
      api.ipm.showVersion.mockReturnValueOnce(first.promise)
      api.ipm.getDiff.mockResolvedValue(ok(tabbed))
      const { result } = await renderSelected()
      act(() => {
        void result.current.requests.handleShow('2.0.0')
      })
      await act(async () => result.current.requests.handleCompare())

      await act(async () => first.resolve(ok(diffOf(modified))))

      expect(result.current.state.viewMode).toBe('diff')
      expect(result.current.state.diffResult).toBe(tabbed)
    })
  })

  describe('the SDK toggle', () => {
    it('flips the flag and shows the To version with the new flag', async () => {
      const api = mockApi()
      api.ipm.showVersion.mockResolvedValue(ok(tabbed))
      const { result } = await renderSelected()

      await act(async () => result.current.requests.handleDecompileToggle())

      expect(result.current.state.decompile).toBe(false)
      expect(api.ipm.showVersion).toHaveBeenCalledExactlyOnceWith('slack', '2.1.0', false)

      await act(async () => result.current.requests.handleDecompileToggle())
      expect(result.current.state.decompile).toBe(true)
      expect(api.ipm.showVersion).toHaveBeenLastCalledWith('slack', '2.1.0', true)
    })

    it('only flips the flag when there is no To version', async () => {
      const api = mockApi()
      const { result } = await renderSelected()
      act(() => result.current.selection.handleToChange(''))

      await act(async () => result.current.requests.handleDecompileToggle())

      expect(result.current.state.decompile).toBe(false)
      expect(api.ipm.showVersion).not.toHaveBeenCalled()
    })
  })

  describe('Open in VS Code', () => {
    async function renderWithDiff() {
      const view = await renderSelected()
      act(() => view.result.current.state.setDiffResult(tabbed))
      return view
    }

    it.each([
      ['no diff is loaded', async () => renderSelected()],
      [
        'there is no To version',
        async () => {
          const view = await renderWithDiff()
          act(() => view.result.current.selection.handleToChange(''))
          return view
        }
      ]
    ])('does nothing when %s', async (_label, prepare) => {
      const api = mockApi()
      const { result } = await prepare()

      await act(async () => result.current.requests.handleOpenVscode())

      expect(api.editor.openInVscode).not.toHaveBeenCalled()
    })

    it('sends the files that have new content under the To version', async () => {
      const api = mockApi()
      const { result } = await renderWithDiff()

      await act(async () => result.current.requests.handleOpenVscode())

      expect(api.editor.openInVscode).toHaveBeenCalledExactlyOnceWith({
        appName: 'slack',
        version: '2.1.0',
        files: [
          { path: modified.filePath, content: 'b' },
          { path: added.filePath, content: 'c' },
          { path: hook.filePath, content: 'h' }
        ]
      })
    })

    it('toasts the message of an unsuccessful result and a default without one', async () => {
      const api = mockApi()
      const { result } = await renderWithDiff()

      api.editor.openInVscode.mockResolvedValueOnce({ success: false, error: 'code is not installed' })
      await act(async () => result.current.requests.handleOpenVscode())
      expect(await screen.findByText('code is not installed')).toBeInTheDocument()

      api.editor.openInVscode.mockResolvedValueOnce({ success: false })
      await act(async () => result.current.requests.handleOpenVscode())
      expect(await screen.findByText(VSCODE_FAILURE)).toBeInTheDocument()
    })

    it('toasts the message of a rejected Error and a default for any other rejection', async () => {
      const api = mockApi()
      const { result } = await renderWithDiff()

      api.editor.openInVscode.mockRejectedValueOnce(new Error('IPC closed'))
      await act(async () => result.current.requests.handleOpenVscode())
      expect(await screen.findByText('IPC closed')).toBeInTheDocument()

      api.editor.openInVscode.mockRejectedValueOnce('plain text')
      await act(async () => result.current.requests.handleOpenVscode())
      expect(await screen.findByText(VSCODE_FAILURE)).toBeInTheDocument()
    })
  })

  describe('acting on the latest state', () => {
    it('sends the versions that were changed last when comparing', async () => {
      const api = mockApi()
      api.ipm.getDiff.mockResolvedValue(ok(tabbed))
      const { result } = await renderSelected()

      act(() => result.current.selection.handleToChange('2.0.0'))
      act(() => result.current.selection.handleFromChange('2.1.0'))
      await act(async () => result.current.requests.handleCompare())

      expect(api.ipm.getDiff).toHaveBeenCalledExactlyOnceWith('slack', '2.1.0', '2.0.0', true)
    })

    it('sends the SDK flag that was set last when showing a version', async () => {
      const api = mockApi()
      api.ipm.showVersion.mockResolvedValue(ok(tabbed))
      const { result } = await renderSelected()

      act(() => result.current.state.setDecompile(false))
      await act(async () => result.current.requests.handleShow('2.0.0'))

      expect(api.ipm.showVersion).toHaveBeenCalledExactlyOnceWith('slack', '2.0.0', false)
    })

    it('shows the To version that was changed last when the SDK toggle runs', async () => {
      const api = mockApi()
      api.ipm.showVersion.mockResolvedValue(ok(tabbed))
      const { result } = await renderSelected()

      act(() => result.current.selection.handleToChange('2.0.0'))
      await act(async () => result.current.requests.handleDecompileToggle())

      expect(api.ipm.showVersion).toHaveBeenCalledExactlyOnceWith('slack', '2.0.0', false)
    })

    it('exports the diff that was loaded last', async () => {
      const api = mockApi()
      const { result } = await renderSelected()
      act(() => result.current.state.setDiffResult(diffOf(modified)))
      act(() => result.current.state.setDiffResult(diffOf(hook)))

      await act(async () => result.current.requests.handleOpenVscode())

      expect(api.editor.openInVscode).toHaveBeenCalledExactlyOnceWith({
        appName: 'slack',
        version: '2.1.0',
        files: [{ path: hook.filePath, content: 'h' }]
      })
    })
  })

  describe('the identity of the handlers', () => {
    it('keeps them while unrelated state changes', async () => {
      const { result, rerender } = await renderSelected()
      const before = result.current.requests

      rerender()
      act(() => result.current.state.setSelectedFile(modified.filePath))
      act(() => result.current.state.setActiveTab('hook'))

      expect(result.current.requests.handleCompare).toBe(before.handleCompare)
      expect(result.current.requests.handleShow).toBe(before.handleShow)
      expect(result.current.requests.handleDecompileToggle).toBe(before.handleDecompileToggle)
    })

    it('keeps Show and the SDK toggle when only the From version changes', async () => {
      const { result } = await renderSelected()
      const before = result.current.requests

      act(() => result.current.selection.handleFromChange('2.1.0'))

      expect(result.current.requests.handleShow).toBe(before.handleShow)
      expect(result.current.requests.handleDecompileToggle).toBe(before.handleDecompileToggle)
    })
  })
})
