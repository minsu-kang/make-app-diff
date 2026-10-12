import { StrictMode, type ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useShellUi } from '../use-shell-ui'

function Strict({ children }: Readonly<{ children: ReactNode }>) {
  return <StrictMode>{children}</StrictMode>
}

function press(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }))
  })
}

describe('useShellUi', () => {
  it('starts with every dialog closed and the sidebar open', () => {
    const { result } = renderHook(() => useShellUi())

    expect(result.current).toMatchObject({
      showSettings: false,
      forcedSettings: false,
      appListRefreshKey: 0,
      showDownloadModal: false,
      showInfo: false,
      sidebarCollapsed: false
    })
  })

  it('updates each flag through its own setter', () => {
    const { result } = renderHook(() => useShellUi())

    act(() => result.current.setShowSettings(true))
    act(() => result.current.setForcedSettings(true))
    act(() => result.current.setAppListRefreshKey((key) => key + 1))
    act(() => result.current.setShowDownloadModal(true))
    act(() => result.current.setSidebarCollapsed(true))

    expect(result.current).toMatchObject({
      showSettings: true,
      forcedSettings: true,
      appListRefreshKey: 1,
      showDownloadModal: true,
      showInfo: false,
      sidebarCollapsed: true
    })
  })

  it('keeps the setters stable across renders', () => {
    const { result, rerender } = renderHook(() => useShellUi())
    const first = result.current

    act(() => result.current.setShowInfo(true))
    rerender()

    expect(result.current.setShowSettings).toBe(first.setShowSettings)
    expect(result.current.setForcedSettings).toBe(first.setForcedSettings)
    expect(result.current.setAppListRefreshKey).toBe(first.setAppListRefreshKey)
    expect(result.current.setShowDownloadModal).toBe(first.setShowDownloadModal)
    expect(result.current.setShowInfo).toBe(first.setShowInfo)
    expect(result.current.setSidebarCollapsed).toBe(first.setSidebarCollapsed)
  })

  it('closes the About dialog on Escape and on Enter but not on other keys', () => {
    const { result } = renderHook(() => useShellUi())
    act(() => result.current.setShowInfo(true))

    press('x')
    expect(result.current.showInfo).toBe(true)

    press('Escape')
    expect(result.current.showInfo).toBe(false)

    act(() => result.current.setShowInfo(true))
    press('Enter')
    expect(result.current.showInfo).toBe(false)
  })

  it('listens for keys only while the About dialog is open', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { result, unmount } = renderHook(() => useShellUi())
    expect(add).not.toHaveBeenCalledWith('keydown', expect.any(Function))

    act(() => result.current.setShowInfo(true))
    expect(add).toHaveBeenCalledWith('keydown', expect.any(Function))

    act(() => result.current.setShowInfo(false))
    expect(remove).toHaveBeenCalledWith('keydown', add.mock.calls.find(([type]) => type === 'keydown')?.[1])

    act(() => result.current.setShowInfo(true))
    unmount()
    const keydownAdds = add.mock.calls.filter(([type]) => type === 'keydown')
    const keydownRemoves = remove.mock.calls.filter(([type]) => type === 'keydown')
    expect(keydownRemoves).toEqual(keydownAdds)
  })

  it('closes the About dialog once per key press after the development remount', () => {
    const { result } = renderHook(() => useShellUi(), { wrapper: Strict })
    act(() => result.current.setShowInfo(true))

    press('Escape')

    expect(result.current.showInfo).toBe(false)
  })
})
