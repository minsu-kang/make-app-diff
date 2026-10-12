import { StrictMode, type ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import { useSession } from '../use-session'
import ToastContainer from '../../../shared/ui/Toast'
import { mockApi } from '../../../__tests__/mocks/window-api'
import type { IpmSettings } from '../../../shared/types'

const HALF_HOUR = 30 * 60 * 1000
const SESSION_EXPIRED = 'Session expired (48h inactive). Please re-enter your tokens.'
const CHECK_FAILED = 'Could not check the session. Open Settings to verify your tokens.'
const SESSION_LOG = 'Failed to check the session'
const IPME_HOST = 'ipme.integromat.com'

function WithToasts({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      {children}
      <ToastContainer />
    </>
  )
}

function StrictWithToasts({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <StrictMode>
      <WithToasts>{children}</WithToasts>
    </StrictMode>
  )
}

function renderSession(wrapper: typeof WithToasts = WithToasts) {
  const setters = { setForcedSettings: vi.fn(), setShowSettings: vi.fn() }
  const view = renderHook(() => useSession({ ...setters }), { wrapper })
  return { ...view, setters }
}

function storedSettings(overrides: Partial<IpmSettings>): IpmSettings {
  return {
    host: 'ipm.integromat.com',
    ipmToken: 'token',
    ipmeToken: '',
    env: 'staging',
    ipmVersion: '3.20.0',
    ...overrides
  }
}

describe('useSession', () => {
  describe('on mount', () => {
    it('applies the stored theme to the document', async () => {
      const api = mockApi()
      api.theme.load.mockResolvedValue('make')
      renderSession()

      await waitFor(() => expect(api.menu.setEnabled).toHaveBeenCalledWith(true))
      expect(document.documentElement).toHaveAttribute('data-theme', 'make')
    })

    it('logs a failed theme load and still checks the session', async () => {
      const consoleError = vi.spyOn(console, 'error').mockReturnValue(undefined)
      const failure = new Error('no theme')
      const api = mockApi()
      api.theme.load.mockRejectedValue(failure)
      renderSession()

      await waitFor(() => expect(api.menu.setEnabled).toHaveBeenCalledWith(true))
      expect(consoleError).toHaveBeenCalledWith('Failed to load the theme', failure)
      expect(document.documentElement).not.toHaveAttribute('data-theme')
    })

    it('loads the theme, then checks the session, then reads the settings', async () => {
      const api = mockApi()
      renderSession()

      await waitFor(() => expect(api.settings.load).toHaveBeenCalled())
      const order = (mock: { mock: { invocationCallOrder: number[] } }) => mock.mock.invocationCallOrder[0]
      expect(order(api.theme.load)).toBeLessThan(order(api.session.check))
      expect(order(api.session.check)).toBeLessThan(order(api.settings.load))
    })

    it('does not start again when it re-renders with new setter objects', async () => {
      const api = mockApi()
      const { rerender } = renderSession()
      await waitFor(() => expect(api.menu.setEnabled).toHaveBeenCalledWith(true))

      rerender()
      rerender()

      expect(api.theme.load).toHaveBeenCalledOnce()
      expect(api.session.check).toHaveBeenCalledOnce()
      expect(api.settings.load).toHaveBeenCalledOnce()
    })

    it('enables the menu when the host has a token', async () => {
      const api = mockApi()
      const { setters } = renderSession()

      await waitFor(() => expect(api.menu.setEnabled).toHaveBeenCalledExactlyOnceWith(true))
      expect(setters.setShowSettings).not.toHaveBeenCalled()
      expect(setters.setForcedSettings).not.toHaveBeenCalled()
    })

    it('reads the IPME token on the IPME host', async () => {
      const api = mockApi()
      api.settings.load.mockResolvedValue(storedSettings({ host: IPME_HOST, ipmToken: '', ipmeToken: 'ipme' }))
      const { setters } = renderSession()

      await waitFor(() => expect(api.menu.setEnabled).toHaveBeenCalledWith(true))
      expect(setters.setShowSettings).not.toHaveBeenCalled()
    })

    it('forces the settings when only the token of the other host is set', async () => {
      const api = mockApi()
      api.settings.load.mockResolvedValue(storedSettings({ host: IPME_HOST, ipmToken: 'ipm', ipmeToken: '' }))
      const { setters } = renderSession()

      await waitFor(() => expect(setters.setShowSettings).toHaveBeenCalledExactlyOnceWith(true))
      expect(setters.setForcedSettings).toHaveBeenCalledExactlyOnceWith(true)
      expect(api.menu.setEnabled).not.toHaveBeenCalled()
    })

    it('forces the settings when the token is blank', async () => {
      const api = mockApi()
      api.settings.load.mockResolvedValue(storedSettings({ ipmToken: '   ' }))
      const { setters } = renderSession()

      await waitFor(() => expect(setters.setShowSettings).toHaveBeenCalledExactlyOnceWith(true))
      expect(setters.setForcedSettings).toHaveBeenCalledExactlyOnceWith(true)
      expect(api.menu.setEnabled).not.toHaveBeenCalled()
    })

    it('toasts and forces the settings when the session expired, without reading them', async () => {
      const api = mockApi()
      api.session.check.mockResolvedValue({ expired: true })
      const { setters } = renderSession()

      expect(await screen.findByText(SESSION_EXPIRED)).toBeInTheDocument()
      expect(setters.setShowSettings).toHaveBeenCalledExactlyOnceWith(true)
      expect(setters.setForcedSettings).toHaveBeenCalledExactlyOnceWith(true)
      expect(api.settings.load).not.toHaveBeenCalled()
      expect(api.menu.setEnabled).not.toHaveBeenCalled()
    })

    it('toasts and logs when the session check fails', async () => {
      const consoleError = vi.spyOn(console, 'error').mockReturnValue(undefined)
      const failure = new Error('IPC timed out')
      mockApi().session.check.mockRejectedValue(failure)
      const { setters } = renderSession()

      expect(await screen.findByText(CHECK_FAILED)).toBeInTheDocument()
      expect(consoleError).toHaveBeenCalledWith(SESSION_LOG, failure)
      expect(setters.setShowSettings).not.toHaveBeenCalled()
    })

    it('toasts and logs when the settings cannot be read', async () => {
      const consoleError = vi.spyOn(console, 'error').mockReturnValue(undefined)
      const failure = new Error('no store')
      const api = mockApi()
      api.settings.load.mockRejectedValue(failure)
      renderSession()

      expect(await screen.findByText(CHECK_FAILED)).toBeInTheDocument()
      expect(consoleError).toHaveBeenCalledWith(SESSION_LOG, failure)
      expect(api.menu.setEnabled).not.toHaveBeenCalled()
    })
  })

  describe('every 30 minutes', () => {
    async function startedSession(wrapper?: typeof WithToasts) {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const view = renderSession(wrapper)
      await waitFor(() => expect(mockApi().menu.setEnabled).toHaveBeenCalledWith(true))
      return view
    }

    it('checks again and leaves a valid session alone', async () => {
      const api = mockApi()
      const { setters } = await startedSession()
      expect(api.session.check).toHaveBeenCalledTimes(1)

      await act(() => vi.advanceTimersByTimeAsync(HALF_HOUR - 60 * 1000))
      expect(api.session.check).toHaveBeenCalledTimes(1)

      await act(() => vi.advanceTimersByTimeAsync(60 * 1000))
      expect(api.session.check).toHaveBeenCalledTimes(2)
      expect(setters.setShowSettings).not.toHaveBeenCalled()
      expect(api.menu.setEnabled).not.toHaveBeenCalledWith(false)
    })

    it('locks the app and toasts when the session ran out', async () => {
      const api = mockApi()
      const { setters } = await startedSession()

      api.session.check.mockResolvedValue({ expired: true })
      await act(() => vi.advanceTimersByTimeAsync(HALF_HOUR))

      expect(await screen.findByText(SESSION_EXPIRED)).toBeInTheDocument()
      expect(api.menu.setEnabled).toHaveBeenLastCalledWith(false)
      expect(setters.setForcedSettings).toHaveBeenCalledExactlyOnceWith(true)
      expect(setters.setShowSettings).toHaveBeenCalledExactlyOnceWith(true)
    })

    it('logs a failing check without locking the app or toasting', async () => {
      const consoleError = vi.spyOn(console, 'error').mockReturnValue(undefined)
      const failure = new Error('IPC timed out')
      const api = mockApi()
      const { setters } = await startedSession()

      api.session.check.mockRejectedValue(failure)
      await act(() => vi.advanceTimersByTimeAsync(HALF_HOUR))

      expect(consoleError).toHaveBeenCalledWith(SESSION_LOG, failure)
      expect(screen.queryByText(CHECK_FAILED)).not.toBeInTheDocument()
      expect(setters.setShowSettings).not.toHaveBeenCalled()
      expect(api.menu.setEnabled).not.toHaveBeenCalledWith(false)
    })

    it('stops checking once unmounted', async () => {
      const api = mockApi()
      const { unmount } = await startedSession()

      unmount()
      api.session.check.mockClear()
      await vi.advanceTimersByTimeAsync(HALF_HOUR)

      expect(api.session.check).not.toHaveBeenCalled()
    })

    it('runs one interval after the development remount', async () => {
      const api = mockApi()
      await startedSession(StrictWithToasts)
      api.session.check.mockClear()

      await act(() => vi.advanceTimersByTimeAsync(HALF_HOUR))

      expect(api.session.check).toHaveBeenCalledTimes(1)
    })
  })
})
