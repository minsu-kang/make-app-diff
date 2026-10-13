import { StrictMode } from 'react'
import { describe, it, expect } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useAppList } from '../use-app-list'
import { mockApi, ok, fail } from '../../../__tests__/mocks/window-api'
import type { IpcResult, SearchAppResult } from '../../../shared/types'

type AppList = IpcResult<SearchAppResult[]>

const LIST_ERROR = 'Failed to load apps'

const apps: SearchAppResult[] = [
  { name: 'slack', label: 'Slack', theme: '#4a154b', version: '2.1.0', availableVersions: ['2.1.0', '2.0.0'] },
  { name: 'gmail', label: 'Gmail', theme: '#ea4335', version: '1.0.0', availableVersions: ['1.0.0'] }
]

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function renderList(refreshKey?: number) {
  return renderHook(({ key }) => useAppList(key), { initialProps: { key: refreshKey } })
}

describe('useAppList', () => {
  it('starts loading and loads the list once on mount', async () => {
    const pending = deferred<AppList>()
    mockApi().ipm.searchApps.mockReturnValue(pending.promise)
    const { result } = renderList()

    expect(result.current.loadingApps).toBe(true)
    expect(result.current.allApps).toEqual([])
    expect(result.current.error).toBeNull()
    expect(mockApi().ipm.searchApps).toHaveBeenCalledTimes(1)

    pending.resolve(ok(apps))
    await waitFor(() => expect(result.current.loadingApps).toBe(false))
    expect(result.current.allApps).toEqual(apps)
    expect(result.current.error).toBeNull()
  })

  it('reports the error of a failed answer', async () => {
    mockApi().ipm.searchApps.mockResolvedValue(fail('IPM is down'))
    const { result } = renderList()

    await waitFor(() => expect(result.current.loadingApps).toBe(false))
    expect(result.current.error).toBe('IPM is down')
    expect(result.current.allApps).toEqual([])
  })

  it('uses a fallback message when the failed answer has none', async () => {
    mockApi().ipm.searchApps.mockResolvedValue({ success: false })
    const { result } = renderList()

    await waitFor(() => expect(result.current.error).toBe(LIST_ERROR))
    expect(result.current.loadingApps).toBe(false)
  })

  it('treats a successful answer without data as a failure', async () => {
    mockApi().ipm.searchApps.mockResolvedValue({ success: true })
    const { result } = renderList()

    await waitFor(() => expect(result.current.error).toBe(LIST_ERROR))
    expect(result.current.allApps).toEqual([])
  })

  it('reports the message of a rejection', async () => {
    mockApi().ipm.searchApps.mockRejectedValue(new Error('socket hang up'))
    const { result } = renderList()

    await waitFor(() => expect(result.current.error).toBe('socket hang up'))
    expect(result.current.loadingApps).toBe(false)
  })

  it('reports a rejection that is not an Error as text', async () => {
    mockApi().ipm.searchApps.mockRejectedValue('plain failure')
    const { result } = renderList()

    await waitFor(() => expect(result.current.error).toBe('plain failure'))
    expect(result.current.loadingApps).toBe(false)
  })

  it('loads again when the refresh key changes and clears the old error first', async () => {
    mockApi().ipm.searchApps.mockResolvedValueOnce(fail('first failure'))
    const { result, rerender } = renderList(0)
    await waitFor(() => expect(result.current.error).toBe('first failure'))

    const pending = deferred<AppList>()
    mockApi().ipm.searchApps.mockReturnValue(pending.promise)
    rerender({ key: 1 })

    expect(result.current.error).toBeNull()
    expect(result.current.loadingApps).toBe(true)
    expect(mockApi().ipm.searchApps).toHaveBeenCalledTimes(2)

    pending.resolve(ok(apps))
    await waitFor(() => expect(result.current.allApps).toEqual(apps))
    expect(result.current.loadingApps).toBe(false)
  })

  it('keeps the old list while the next load runs', async () => {
    mockApi().ipm.searchApps.mockResolvedValueOnce(ok(apps))
    const { result, rerender } = renderList(0)
    await waitFor(() => expect(result.current.allApps).toEqual(apps))

    mockApi().ipm.searchApps.mockReturnValue(deferred<AppList>().promise)
    rerender({ key: 1 })

    expect(result.current.loadingApps).toBe(true)
    expect(result.current.allApps).toEqual(apps)
  })

  it('does not load again when it renders with the same refresh key', async () => {
    const { result, rerender } = renderList(3)
    await waitFor(() => expect(result.current.loadingApps).toBe(false))

    rerender({ key: 3 })

    expect(mockApi().ipm.searchApps).toHaveBeenCalledTimes(1)
  })

  describe.each([
    {
      name: 'an answer',
      settle: (d: ReturnType<typeof deferred<AppList>>) => d.resolve(ok(apps))
    },
    {
      name: 'a failed answer',
      settle: (d: ReturnType<typeof deferred<AppList>>) => d.resolve(fail('stale failure'))
    },
    {
      name: 'a rejection',
      settle: (d: ReturnType<typeof deferred<AppList>>) => d.reject(new Error('stale rejection'))
    }
  ])('when $name arrives after the refresh key changed', ({ settle }) => {
    it('drops it and keeps loading for the new key', async () => {
      const stale = deferred<AppList>()
      const fresh = deferred<AppList>()
      mockApi().ipm.searchApps.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise)
      const { result, rerender } = renderList(0)
      rerender({ key: 1 })

      await act(async () => settle(stale))

      expect(result.current.allApps).toEqual([])
      expect(result.current.error).toBeNull()
      expect(result.current.loadingApps).toBe(true)

      fresh.resolve(ok([apps[1]]))
      await waitFor(() => expect(result.current.loadingApps).toBe(false))
      expect(result.current.allApps).toEqual([apps[1]])
    })
  })

  it('lets the caller set and clear the error', async () => {
    const { result } = renderList()
    await waitFor(() => expect(result.current.loadingApps).toBe(false))

    act(() => result.current.setError('Failed to load app info'))
    expect(result.current.error).toBe('Failed to load app info')

    act(() => result.current.setError(null))
    expect(result.current.error).toBeNull()
  })

  it('keeps an error the caller set while the list was loading', async () => {
    const pending = deferred<AppList>()
    mockApi().ipm.searchApps.mockReturnValue(pending.promise)
    const { result } = renderList()

    act(() => result.current.setError('Failed to load app info'))
    pending.resolve(ok(apps))

    await waitFor(() => expect(result.current.loadingApps).toBe(false))
    expect(result.current.allApps).toEqual(apps)
    expect(result.current.error).toBe('Failed to load app info')
  })

  it('ends with the answer of the second request under StrictMode', async () => {
    const first = deferred<AppList>()
    const second = deferred<AppList>()
    mockApi().ipm.searchApps.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useAppList(undefined), { wrapper: StrictMode })

    expect(mockApi().ipm.searchApps).toHaveBeenCalledTimes(2)
    second.resolve(ok(apps))
    await waitFor(() => expect(result.current.loadingApps).toBe(false))

    await act(async () => first.resolve(ok([apps[0]])))

    expect(result.current.allApps).toEqual(apps)
  })
})
