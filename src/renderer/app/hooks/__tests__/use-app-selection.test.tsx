import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { appOf, deferred, useWiredHooks } from './wired-hooks'
import { fail, mockApi, ok } from '../../../__tests__/mocks/window-api'
import type { AppInfo, DiffResult, IpcResult } from '../../../shared/types'

const ICON = 'data:image/png;base64,iVBORw0KGgo='

const slack = appOf('slack', 'Slack', ['2.1.0', '2.0.0', '1.0.0'])
const gmail = appOf('gmail', 'Gmail', ['1.1.0', '1.0.0'])
const solo = appOf('solo', 'Solo', ['1.0.0'])
const bare = appOf('bare', 'Bare', [])
const unlisted = { ...appOf('unlisted', 'Unlisted', []), versions: undefined } as unknown as AppInfo

const loadedDiff: DiffResult = {
  type: 'app',
  diffs: [
    { filePath: 'modules/a.imljson', status: 'modified', oldContent: 'a', newContent: 'b', unifiedDiff: '-a\n+b' }
  ],
  summary: { added: 0, deleted: 0, modified: 1, unchanged: 0 }
}

function renderWired() {
  return renderHook(() => useWiredHooks())
}

describe('useAppSelection', () => {
  describe('selecting an app', () => {
    it('shows the app and preselects the previous and the latest version', async () => {
      const { result } = renderWired()

      await act(async () => result.current.selection.handleAppSelect(slack))

      expect(result.current.selection.appInfo).toBe(slack)
      expect(result.current.selection.fromVersion).toBe('2.0.0')
      expect(result.current.selection.toVersion).toBe('2.1.0')
    })

    it('preselects only the To version for an app with one version', async () => {
      const { result } = renderWired()
      await act(async () => result.current.selection.handleAppSelect(slack))

      await act(async () => result.current.selection.handleAppSelect(solo))

      expect(result.current.selection.fromVersion).toBe('')
      expect(result.current.selection.toVersion).toBe('1.0.0')
    })

    it.each([
      ['an empty version list', bare],
      ['no version list', unlisted]
    ])('clears both versions for %s', async (_label, info) => {
      const { result } = renderWired()
      await act(async () => result.current.selection.handleAppSelect(slack))

      await act(async () => result.current.selection.handleAppSelect(info))

      expect(result.current.selection.fromVersion).toBe('')
      expect(result.current.selection.toVersion).toBe('')
    })

    it('resets the diff of the previous app and the decompile flag', async () => {
      const { result } = renderWired()
      await act(async () => result.current.selection.handleAppSelect(slack))
      act(() => {
        result.current.state.setDiffResult(loadedDiff)
        result.current.state.setSelectedFile('modules/a.imljson')
        result.current.state.setError('Old failure')
        result.current.state.setDecompile(false)
      })

      await act(async () => result.current.selection.handleAppSelect(gmail))

      expect(result.current.state.diffResult).toBeNull()
      expect(result.current.state.selectedFile).toBeNull()
      expect(result.current.state.error).toBeNull()
      expect(result.current.state.decompile).toBe(true)
    })

    it('drops a pending request and stops the spinner', async () => {
      const pending = deferred<IpcResult<DiffResult>>()
      mockApi().ipm.getDiff.mockReturnValue(pending.promise)
      const { result } = renderWired()
      await act(async () => result.current.selection.handleAppSelect(slack))
      act(() => {
        void result.current.requests.handleCompare()
      })
      expect(result.current.state.loading).toBe(true)

      await act(async () => result.current.selection.handleAppSelect(gmail))
      expect(result.current.state.loading).toBe(false)

      await act(async () => pending.resolve(ok(loadedDiff)))
      expect(result.current.state.diffResult).toBeNull()
    })
  })

  describe('the app icon', () => {
    it('is requested by app name and shown once it arrives', async () => {
      const api = mockApi()
      api.ipm.getAppIcon.mockResolvedValue(ok(ICON))
      const { result } = renderWired()

      await act(async () => result.current.selection.handleAppSelect(slack))

      expect(api.ipm.getAppIcon).toHaveBeenCalledExactlyOnceWith('slack')
      expect(result.current.selection.appIcon).toBe(ICON)
    })

    it('is cleared when the next app is selected', async () => {
      const api = mockApi()
      api.ipm.getAppIcon.mockResolvedValueOnce(ok(ICON)).mockResolvedValueOnce(fail('no icon'))
      const { result } = renderWired()
      await act(async () => result.current.selection.handleAppSelect(slack))
      expect(result.current.selection.appIcon).toBe(ICON)

      await act(async () => result.current.selection.handleAppSelect(gmail))

      expect(result.current.selection.appIcon).toBeNull()
    })

    it('stays empty when the icon is missing', async () => {
      mockApi().ipm.getAppIcon.mockResolvedValue({ success: true })
      const { result } = renderWired()

      await act(async () => result.current.selection.handleAppSelect(slack))

      expect(result.current.selection.appIcon).toBeNull()
    })

    it('logs a failed icon request and keeps the selection', async () => {
      const consoleError = vi.spyOn(console, 'error').mockReturnValue(undefined)
      const failure = new Error('icon down')
      mockApi().ipm.getAppIcon.mockRejectedValue(failure)
      const { result } = renderWired()

      await act(async () => result.current.selection.handleAppSelect(slack))

      expect(consoleError).toHaveBeenCalledWith('Failed to load app icon', failure)
      expect(result.current.selection.appInfo).toBe(slack)
    })
  })

  describe('changing the versions', () => {
    it('sets the From and To versions', async () => {
      const { result } = renderWired()
      await act(async () => result.current.selection.handleAppSelect(slack))

      act(() => result.current.selection.handleFromChange('1.0.0'))
      act(() => result.current.selection.handleToChange('2.0.0'))

      expect(result.current.selection.fromVersion).toBe('1.0.0')
      expect(result.current.selection.toVersion).toBe('2.0.0')
    })

    it('swaps the versions', async () => {
      const { result } = renderWired()
      await act(async () => result.current.selection.handleAppSelect(slack))

      act(() => result.current.selection.handleSwap())

      expect(result.current.selection.fromVersion).toBe('2.1.0')
      expect(result.current.selection.toVersion).toBe('2.0.0')
    })

    it.each([
      [
        'a From change',
        (selection: ReturnType<typeof useWiredHooks>['selection']) => selection.handleFromChange('1.0.0')
      ],
      ['a To change', (selection: ReturnType<typeof useWiredHooks>['selection']) => selection.handleToChange('1.0.0')],
      ['a swap', (selection: ReturnType<typeof useWiredHooks>['selection']) => selection.handleSwap()]
    ])('drops a pending request on %s', async (_label, change) => {
      const pending = deferred<IpcResult<DiffResult>>()
      mockApi().ipm.getDiff.mockReturnValue(pending.promise)
      const { result } = renderWired()
      await act(async () => result.current.selection.handleAppSelect(slack))
      act(() => {
        void result.current.requests.handleCompare()
      })

      act(() => change(result.current.selection))
      expect(result.current.state.loading).toBe(false)

      await act(async () => pending.resolve(ok(loadedDiff)))
      expect(result.current.state.diffResult).toBeNull()
    })

    it('swaps the versions that were changed last', async () => {
      const { result } = renderWired()
      await act(async () => result.current.selection.handleAppSelect(slack))

      act(() => result.current.selection.handleFromChange('1.0.0'))
      act(() => result.current.selection.handleSwap())

      expect(result.current.selection.fromVersion).toBe('2.1.0')
      expect(result.current.selection.toVersion).toBe('1.0.0')
    })

    it('keeps the handlers while the versions change', async () => {
      const { result, rerender } = renderWired()
      await act(async () => result.current.selection.handleAppSelect(slack))
      const before = result.current.selection

      rerender()
      act(() => result.current.selection.handleToChange('1.0.0'))

      expect(result.current.selection.handleFromChange).toBe(before.handleFromChange)
      expect(result.current.selection.handleToChange).toBe(before.handleToChange)
      expect(result.current.selection.handleAppSelect).toBe(before.handleAppSelect)
    })
  })
})
