import { StrictMode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useFavoritesRecents } from '../use-favorites-recents'
import { mockApi, ok, fail } from '../../../__tests__/mocks/window-api'
import type { FavoriteApp, RecentApp } from '../../../shared/types'

const NOW = 1_700_000_000_000

const slackV1: FavoriteApp = { name: 'slack', label: 'Slack', major: 1, addedAt: 1 }
const slackV2: FavoriteApp = { name: 'slack', label: 'Slack', major: 2, addedAt: 2 }
const gmailV1: FavoriteApp = { name: 'gmail', label: 'Gmail', major: 1, addedAt: 3 }
const recentSlack: RecentApp = { name: 'slack', label: 'Slack', major: 2, lastViewed: 1 }
const recentGmail: RecentApp = { name: 'gmail', label: 'Gmail', major: 1, lastViewed: 2 }

function silenceConsole() {
  return vi.spyOn(console, 'error').mockReturnValue(undefined)
}

async function renderLoaded(favorites: FavoriteApp[] = [], recents: RecentApp[] = []) {
  mockApi().favorites.load.mockResolvedValue(ok(favorites))
  mockApi().recent.load.mockResolvedValue(ok(recents))
  const view = renderHook(() => useFavoritesRecents())
  await waitFor(() => expect(view.result.current.favorites).toEqual(favorites))
  await waitFor(() => expect(view.result.current.recentApps).toEqual(recents))
  return view
}

describe('useFavoritesRecents', () => {
  describe('on mount', () => {
    it('starts empty and loads the favorites and the recent apps once each', async () => {
      const { result } = await renderLoaded([slackV1, gmailV1], [recentSlack])

      expect(result.current.favorites).toEqual([slackV1, gmailV1])
      expect(result.current.recentApps).toEqual([recentSlack])
      expect(mockApi().favorites.load).toHaveBeenCalledTimes(1)
      expect(mockApi().recent.load).toHaveBeenCalledTimes(1)
    })

    it('keeps the lists empty before the answers arrive', () => {
      mockApi().favorites.load.mockReturnValue(new Promise(() => undefined))
      mockApi().recent.load.mockReturnValue(new Promise(() => undefined))
      const { result } = renderHook(() => useFavoritesRecents())

      expect(result.current.favorites).toEqual([])
      expect(result.current.recentApps).toEqual([])
    })

    it('ignores a failed answer and still loads the other list', async () => {
      mockApi().favorites.load.mockResolvedValue(fail('no store'))
      mockApi().recent.load.mockResolvedValue(ok([recentGmail]))
      const { result } = renderHook(() => useFavoritesRecents())

      await waitFor(() => expect(result.current.recentApps).toEqual([recentGmail]))
      expect(result.current.favorites).toEqual([])
    })

    it('ignores a successful answer without data', async () => {
      mockApi().favorites.load.mockResolvedValue({ success: true })
      mockApi().recent.load.mockResolvedValue({ success: true })
      const { result } = renderHook(() => useFavoritesRecents())

      await waitFor(() => expect(mockApi().recent.load).toHaveBeenCalled())
      expect(result.current.favorites).toEqual([])
      expect(result.current.recentApps).toEqual([])
    })

    it('logs a rejected favorites load and still loads the recent apps', async () => {
      const consoleError = silenceConsole()
      const failure = new Error('favorites broken')
      mockApi().favorites.load.mockRejectedValue(failure)
      mockApi().recent.load.mockResolvedValue(ok([recentSlack]))
      const { result } = renderHook(() => useFavoritesRecents())

      await waitFor(() => expect(result.current.recentApps).toEqual([recentSlack]))
      expect(consoleError).toHaveBeenCalledWith('Failed to load favorites', failure)
      expect(result.current.favorites).toEqual([])
    })

    it('logs a rejected recent load and still loads the favorites', async () => {
      const consoleError = silenceConsole()
      const failure = new Error('recents broken')
      mockApi().favorites.load.mockResolvedValue(ok([slackV1]))
      mockApi().recent.load.mockRejectedValue(failure)
      const { result } = renderHook(() => useFavoritesRecents())

      await waitFor(() => expect(result.current.favorites).toEqual([slackV1]))
      expect(consoleError).toHaveBeenCalledWith('Failed to load recent apps', failure)
      expect(result.current.recentApps).toEqual([])
    })

    it('loads the favorites before the recent apps', async () => {
      const { result } = await renderLoaded()

      expect(result.current.favorites).toEqual([])
      const favoritesOrder = mockApi().favorites.load.mock.invocationCallOrder[0]
      const recentOrder = mockApi().recent.load.mock.invocationCallOrder[0]
      expect(favoritesOrder).toBeLessThan(recentOrder)
    })

    it('loads both lists twice under StrictMode and ends with the answers', async () => {
      mockApi().favorites.load.mockResolvedValue(ok([slackV1]))
      mockApi().recent.load.mockResolvedValue(ok([recentSlack]))
      const { result } = renderHook(() => useFavoritesRecents(), { wrapper: StrictMode })

      await waitFor(() => expect(result.current.favorites).toEqual([slackV1]))
      await waitFor(() => expect(result.current.recentApps).toEqual([recentSlack]))
      expect(mockApi().favorites.load).toHaveBeenCalledTimes(2)
      expect(mockApi().recent.load).toHaveBeenCalledTimes(2)
    })
  })

  describe('addRecent', () => {
    it('sends the app and replaces the list with the answer', async () => {
      const { result } = await renderLoaded([], [recentGmail])
      mockApi().recent.add.mockResolvedValue(ok([recentSlack, recentGmail]))

      act(() => result.current.addRecent('slack', 'Slack', 2))

      expect(mockApi().recent.add).toHaveBeenCalledWith('slack', 'Slack', 2)
      await waitFor(() => expect(result.current.recentApps).toEqual([recentSlack, recentGmail]))
    })

    it('keeps the list when the answer fails', async () => {
      const { result } = await renderLoaded([], [recentGmail])
      mockApi().recent.add.mockResolvedValue(fail('disk full'))

      act(() => result.current.addRecent('slack', 'Slack', 2))

      await waitFor(() => expect(mockApi().recent.add).toHaveBeenCalled())
      expect(result.current.recentApps).toEqual([recentGmail])
    })

    it('keeps the list when a successful answer has no data', async () => {
      const { result } = await renderLoaded([], [recentGmail])
      mockApi().recent.add.mockResolvedValue({ success: true })

      act(() => result.current.addRecent('slack', 'Slack', 2))

      await waitFor(() => expect(mockApi().recent.add).toHaveBeenCalled())
      expect(result.current.recentApps).toEqual([recentGmail])
    })

    it('logs a rejection and keeps the list', async () => {
      const consoleError = silenceConsole()
      const failure = new Error('ipc closed')
      const { result } = await renderLoaded([], [recentGmail])
      mockApi().recent.add.mockRejectedValue(failure)

      act(() => result.current.addRecent('slack', 'Slack', 2))

      await waitFor(() => expect(consoleError).toHaveBeenCalledWith('Failed to update recent apps', failure))
      expect(result.current.recentApps).toEqual([recentGmail])
    })

    it('does not touch the favorites', async () => {
      const { result } = await renderLoaded([slackV1])
      mockApi().recent.add.mockResolvedValue(ok([recentSlack]))

      act(() => result.current.addRecent('slack', 'Slack', 2))

      await waitFor(() => expect(result.current.recentApps).toEqual([recentSlack]))
      expect(result.current.favorites).toEqual([slackV1])
      expect(mockApi().favorites.save).not.toHaveBeenCalled()
    })
  })

  describe('toggleFavorite', () => {
    it('adds a favorite with the current time and saves the new list', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW)
      const { result } = await renderLoaded([slackV1])

      act(() => result.current.toggleFavorite('gmail', 'Gmail', 1))

      const expected = [slackV1, { name: 'gmail', label: 'Gmail', major: 1, addedAt: NOW }]
      expect(result.current.favorites).toEqual(expected)
      expect(mockApi().favorites.save).toHaveBeenCalledTimes(1)
      expect(mockApi().favorites.save).toHaveBeenCalledWith(expected)
    })

    it('removes a favorite that exists and saves the new list', async () => {
      const { result } = await renderLoaded([slackV1, gmailV1])

      act(() => result.current.toggleFavorite('slack', 'Slack', 1))

      expect(result.current.favorites).toEqual([gmailV1])
      expect(mockApi().favorites.save).toHaveBeenCalledWith([gmailV1])
    })

    it('treats another major of the same app as another favorite', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW)
      const { result } = await renderLoaded([slackV1])

      act(() => result.current.toggleFavorite('slack', 'Slack', 2))

      expect(result.current.favorites).toEqual([slackV1, { ...slackV2, addedAt: NOW }])
    })

    it('treats the same major of another app as another favorite', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW)
      const { result } = await renderLoaded([slackV1])

      act(() => result.current.toggleFavorite('gmail', 'Gmail', 1))

      expect(result.current.favorites).toEqual([slackV1, { ...gmailV1, addedAt: NOW }])
    })

    it('removes only the matching favorite when the list has several', async () => {
      const { result } = await renderLoaded([slackV1, slackV2, gmailV1])

      act(() => result.current.toggleFavorite('slack', 'Slack', 2))

      expect(result.current.favorites).toEqual([slackV1, gmailV1])
    })

    it('adds on the first call and removes on the second', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW)
      const { result } = await renderLoaded()

      act(() => result.current.toggleFavorite('slack', 'Slack', 1))
      expect(result.current.favorites).toEqual([{ ...slackV1, addedAt: NOW }])

      act(() => result.current.toggleFavorite('slack', 'Slack', 1))
      expect(result.current.favorites).toEqual([])
      expect(mockApi().favorites.save).toHaveBeenLastCalledWith([])
      expect(mockApi().favorites.save).toHaveBeenCalledTimes(2)
    })

    it('keeps the new list in state and logs when the save rejects', async () => {
      const consoleError = silenceConsole()
      const failure = new Error('read-only store')
      mockApi().favorites.save.mockRejectedValue(failure)
      const { result } = await renderLoaded([slackV1])

      act(() => result.current.toggleFavorite('slack', 'Slack', 1))

      await waitFor(() => expect(consoleError).toHaveBeenCalledWith('Failed to save favorites', failure))
      expect(result.current.favorites).toEqual([])
    })

    it('does not touch the recent apps', async () => {
      const { result } = await renderLoaded([], [recentSlack])

      act(() => result.current.toggleFavorite('slack', 'Slack', 2))

      expect(result.current.recentApps).toEqual([recentSlack])
      expect(mockApi().recent.add).not.toHaveBeenCalled()
    })
  })

  describe('isFavorite', () => {
    it('matches on both the name and the major', async () => {
      const { result } = await renderLoaded([slackV1, gmailV1])

      expect(result.current.isFavorite('slack', 1)).toBe(true)
      expect(result.current.isFavorite('gmail', 1)).toBe(true)
      expect(result.current.isFavorite('slack', 2)).toBe(false)
      expect(result.current.isFavorite('zoom', 1)).toBe(false)
    })

    it('is false for a missing major', async () => {
      const { result } = await renderLoaded([slackV1])

      expect(result.current.isFavorite('slack', null)).toBe(false)
    })

    it('follows a toggle on the next render', async () => {
      const { result } = await renderLoaded()
      expect(result.current.isFavorite('slack', 1)).toBe(false)

      act(() => result.current.toggleFavorite('slack', 'Slack', 1))
      expect(result.current.isFavorite('slack', 1)).toBe(true)
    })
  })
})
