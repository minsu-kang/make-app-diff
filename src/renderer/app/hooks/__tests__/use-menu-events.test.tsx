import { StrictMode, type ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMenuEvents } from '../use-menu-events'
import { mockMenu } from '../../../__tests__/mocks/window-api'

function createSetters() {
  return { setShowSettings: vi.fn(), setShowDownloadModal: vi.fn(), setShowInfo: vi.fn() }
}

function Strict({ children }: Readonly<{ children: ReactNode }>) {
  return <StrictMode>{children}</StrictMode>
}

describe('useMenuEvents', () => {
  it('opens each dialog from its own menu event', () => {
    const setters = createSetters()
    renderHook(() => useMenuEvents({ ...setters }))

    mockMenu().emit('openSettings')
    expect(setters.setShowSettings).toHaveBeenCalledExactlyOnceWith(true)
    expect(setters.setShowDownloadModal).not.toHaveBeenCalled()
    expect(setters.setShowInfo).not.toHaveBeenCalled()

    mockMenu().emit('downloadApp')
    expect(setters.setShowDownloadModal).toHaveBeenCalledExactlyOnceWith(true)

    mockMenu().emit('showInfo')
    expect(setters.setShowInfo).toHaveBeenCalledExactlyOnceWith(true)
    expect(setters.setShowSettings).toHaveBeenCalledOnce()
  })

  it('registers each listener once and keeps it across re-renders with new setter objects', () => {
    const setters = createSetters()
    const { rerender } = renderHook(() => useMenuEvents({ ...setters }))

    rerender()
    rerender()

    expect(mockMenu().openSettings).toHaveBeenCalledOnce()
    expect(mockMenu().downloadApp).toHaveBeenCalledOnce()
    expect(mockMenu().showInfo).toHaveBeenCalledOnce()
  })

  it('reacts once per event after the development remount', () => {
    const setters = createSetters()
    renderHook(() => useMenuEvents(setters), { wrapper: Strict })

    mockMenu().emit('showInfo')

    expect(setters.setShowInfo).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('stops listening once unmounted', () => {
    const setters = createSetters()
    const { unmount } = renderHook(() => useMenuEvents(setters))

    unmount()
    mockMenu().emit('openSettings')
    mockMenu().emit('downloadApp')
    mockMenu().emit('showInfo')

    expect(setters.setShowSettings).not.toHaveBeenCalled()
    expect(setters.setShowDownloadModal).not.toHaveBeenCalled()
    expect(setters.setShowInfo).not.toHaveBeenCalled()
  })

  it('moves to a new setter when it changes', () => {
    const first = createSetters()
    const second = createSetters()
    const { rerender } = renderHook((setters) => useMenuEvents(setters), { initialProps: first })

    rerender({ ...first, setShowInfo: second.setShowInfo })
    mockMenu().emit('showInfo')

    expect(second.setShowInfo).toHaveBeenCalledExactlyOnceWith(true)
    expect(first.setShowInfo).not.toHaveBeenCalled()
  })
})
