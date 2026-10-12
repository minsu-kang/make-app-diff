import { describe, it, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import Sidebar from '../Sidebar'
import { mockApi, ok, fail } from '../../__tests__/mocks/window-api'
import type { AppInfo, FavoriteApp, IpcResult, RecentApp, SearchAppResult } from '../../shared/types'

const HINT = 'Type to search from 2 apps'
const SEARCH_PLACEHOLDER = 'Search by label or name...'
const LOADING_PLACEHOLDER = 'Loading apps...'
const NO_RESULTS = 'No apps found'
const LIST_ERROR = 'Failed to load apps'
const INFO_ERROR = 'Failed to load app info'
const ADD_FAVORITE = 'Add to favorites'
const REMOVE_FAVORITE = 'Remove from favorites'
const NOW = 1_700_000_000_000
const NOT_FOUND = 'App not found'
const LATEST_V2 = 'Latest: v2.1.0'
const TWO_VERSIONS = '2 versions available'
const HINT_ONE = 'Type to search from 1 apps'
const PICK_FIRST = 'slack{ArrowDown}{Enter}'
const ARROW_DOWN = '{ArrowDown}'
const ARIA_DISABLED = 'aria-disabled'
const ICON_URL = 'data:image/png;base64,AAAA'

const apps: SearchAppResult[] = [
  { name: 'slack', label: 'Slack', theme: '#4a154b', version: '2.1.0', availableVersions: ['2.1.0', '2.0.0', '1.3.0'] },
  { name: 'gmail', label: 'Gmail', theme: '#ea4335', version: '1.0.0', availableVersions: ['1.0.0'] }
]

const teams: SearchAppResult = {
  name: 'ms-teams',
  label: 'Microsoft Teams',
  theme: '#464eb8',
  version: '1.1.0',
  availableVersions: ['1.1.0', '1.0.0']
}

const zoom: SearchAppResult = {
  name: 'zoom',
  label: 'Zoom',
  theme: '#2d8cff',
  version: '3.1.0',
  availableVersions: ['1.0.0', '3.1.0', '3.0.0', '2.0.0']
}

const slackInfo: AppInfo = {
  name: 'slack',
  label: 'Slack',
  description: '',
  version: '2.1.0',
  versions: ['2.1.0', '2.0.0', '1.3.0']
}

const favoriteSlackV1: FavoriteApp = { name: 'slack', label: 'Slack', major: 1, addedAt: 1 }
const favoriteSlackV2: FavoriteApp = { name: 'slack', label: 'Slack', major: 2, addedAt: 2 }
const favoriteGmailV1: FavoriteApp = { name: 'gmail', label: 'Gmail', major: 1, addedAt: 3 }
const recentSlackV2: RecentApp = { name: 'slack', label: 'Slack', major: 2, lastViewed: 1 }
const recentGmailV1: RecentApp = { name: 'gmail', label: 'Gmail', major: 1, lastViewed: 2 }

const slackV2Item = /Slack\s*slack · v2/
const slackV1Item = /Slack\s*slack · v1/
const gmailV1Item = /Gmail\s*gmail · v1/

function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const onAppSelect = vi.fn()
  const onSettingsClick = vi.fn()
  const props = { onAppSelect, onSettingsClick }
  const view = render(<Sidebar {...props} {...overrides} />)
  const rerender = (next: Partial<Parameters<typeof Sidebar>[0]>) =>
    view.rerender(<Sidebar {...props} {...overrides} {...next} />)
  return { onAppSelect, onSettingsClick, rerender, unmount: view.unmount, container: view.container }
}

async function renderLoaded(list: SearchAppResult[] = apps, overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const user = userEvent.setup()
  const api = mockApi()
  api.ipm.searchApps.mockResolvedValue(ok(list))
  const view = renderSidebar(overrides)
  const input = screen.getByRole('textbox')
  await waitFor(() => expect(input).toBeEnabled())
  return { user, api, input, ...view }
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

type AppList = IpcResult<SearchAppResult[]>

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function selectSlackV2(info: AppInfo = slackInfo) {
  mockApi().ipm.getAppInfo.mockResolvedValue(ok(info))
  const context = await renderLoaded()
  await context.user.type(context.input, PICK_FIRST)
  await waitFor(() => expect(context.onAppSelect).toHaveBeenCalledOnce())
  await screen.findByText(/^Latest: v/)
  return context
}

const isCollapsed = (header: HTMLElement) => header.querySelector('[data-collapsed]')?.getAttribute('data-collapsed')

const highlightFlags = () => screen.getAllByRole('listitem').map((el) => el.classList.contains('highlighted'))

const quickItems = () => screen.getAllByRole('button', { name: /· v\d/ })

const activeFlags = () => quickItems().map((el) => el.classList.contains('active'))

const spyOnConsoleError = () => vi.spyOn(console, 'error').mockReturnValue(undefined)

describe('Sidebar', () => {
  it('loads the app list and shows the search hint', async () => {
    mockApi().ipm.searchApps.mockResolvedValue(ok(apps))
    renderSidebar()

    expect(screen.getByPlaceholderText(LOADING_PLACEHOLDER)).toBeDisabled()
    expect(await screen.findByText(HINT)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(SEARCH_PLACEHOLDER)).toBeEnabled()
  })

  it('shows the error when the app list fails to load', async () => {
    mockApi().ipm.searchApps.mockResolvedValue(fail('Invalid token'))
    renderSidebar()

    expect(await screen.findByText('Invalid token')).toBeInTheDocument()
  })

  it('filters by label or name and groups results by major version', async () => {
    const user = userEvent.setup()
    mockApi().ipm.searchApps.mockResolvedValue(ok(apps))
    renderSidebar()
    await screen.findByText(HINT)

    await user.type(screen.getByRole('textbox'), 'sla')

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Slack (v2)')
    expect(items[0]).toHaveTextContent('slack · 2 versions')
    expect(items[1]).toHaveTextContent('Slack (v1)')

    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'zzz')
    expect(screen.getByText(NO_RESULTS)).toBeInTheDocument()
  })

  it('selects a result with the keyboard and records it as recent', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    api.ipm.searchApps.mockResolvedValue(ok(apps))
    api.ipm.getAppInfo.mockResolvedValue(ok(slackInfo))
    const { onAppSelect } = renderSidebar()
    await screen.findByText(HINT)

    await user.type(screen.getByRole('textbox'), PICK_FIRST)

    await waitFor(() => expect(onAppSelect).toHaveBeenCalledOnce())
    expect(api.ipm.getAppInfo).toHaveBeenCalledWith('slack', '2.1.0')
    expect(onAppSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'slack', versions: ['2.1.0', '2.0.0'] }))
    expect(api.recent.add).toHaveBeenCalledWith('slack', 'Slack', 2)
    expect(await screen.findByText(LATEST_V2)).toBeInTheDocument()
    expect(screen.getByText(TWO_VERSIONS)).toBeInTheDocument()
  })

  it('toggles a favorite and saves the list', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    api.ipm.searchApps.mockResolvedValue(ok(apps))
    api.ipm.getAppInfo.mockResolvedValue(ok(slackInfo))
    renderSidebar()
    await screen.findByText(HINT)

    await user.type(screen.getByRole('textbox'), 'slack')
    await user.click(screen.getAllByRole('listitem')[0])
    await user.click(await screen.findByTitle(ADD_FAVORITE))

    expect(api.favorites.save).toHaveBeenCalledWith([expect.objectContaining({ name: 'slack', major: 2 })])
    expect(await screen.findByTitle(REMOVE_FAVORITE)).toBeInTheDocument()
    expect(screen.getByText('Favorites')).toBeInTheDocument()
  })

  it('lists favorites and recents and quick-selects one with the keyboard', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    api.ipm.searchApps.mockResolvedValue(ok(apps))
    api.favorites.load.mockResolvedValue(ok([{ name: 'gmail', label: 'Gmail', major: 1, addedAt: 1 }]))
    api.recent.load.mockResolvedValue(ok([{ name: 'slack', label: 'Slack', major: 2, lastViewed: 1 }]))
    api.ipm.getAppInfo.mockResolvedValue(ok(slackInfo))
    const { onAppSelect } = renderSidebar()

    const recent = await screen.findByRole('button', { name: /Slack/ })
    expect(screen.getByRole('button', { name: /Gmail/ })).toBeInTheDocument()

    recent.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(onAppSelect).toHaveBeenCalledOnce())
    expect(api.ipm.getAppInfo).toHaveBeenCalledWith('slack', '2.1.0')
  })

  it('focuses the search input on Cmd+K and calls onSettingsClick', async () => {
    const user = userEvent.setup()
    mockApi().ipm.searchApps.mockResolvedValue(ok(apps))
    const { onSettingsClick } = renderSidebar()
    await screen.findByText(HINT)

    await user.keyboard('{Meta>}k{/Meta}')
    expect(screen.getByRole('textbox')).toHaveFocus()

    await user.click(screen.getByTitle('Settings'))
    expect(onSettingsClick).toHaveBeenCalledOnce()
  })
})

describe('Sidebar app list loading', () => {
  const noError: AppList = { success: false }
  const noData: AppList = { success: true }

  test.each([
    { reason: 'a failure without an error', result: noError },
    { reason: 'a success without data', result: noData }
  ])('shows the generic message for $reason and unlocks the search', async ({ result }) => {
    mockApi().ipm.searchApps.mockResolvedValue(result)
    renderSidebar()

    expect(await screen.findByText(LIST_ERROR)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(SEARCH_PLACEHOLDER)).toBeEnabled()
  })

  test.each([
    { rejection: new Error('Network down'), message: 'Network down' },
    { rejection: 'offline', message: 'offline' }
  ])('shows "$message" when the app list request rejects', async ({ rejection, message }) => {
    mockApi().ipm.searchApps.mockRejectedValue(rejection)
    renderSidebar()

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(SEARCH_PLACEHOLDER)).toBeEnabled()
  })

  it('shows no hint when there are no apps to search', async () => {
    const { input } = await renderLoaded([])

    expect(input).toHaveAttribute('placeholder', SEARCH_PLACEHOLDER)
    expect(screen.queryByText(/Type to search/)).not.toBeInTheDocument()
  })

  it('reloads the app list when refreshKey changes', async () => {
    const { api, rerender } = await renderLoaded()
    expect(screen.getByText(HINT)).toBeInTheDocument()
    api.ipm.searchApps.mockResolvedValue(ok([apps[1]]))

    rerender({ refreshKey: 1 })

    expect(await screen.findByText(HINT_ONE)).toBeInTheDocument()
    expect(api.ipm.searchApps).toHaveBeenCalledTimes(2)
  })

  test.each([
    {
      outcome: 'resolves',
      settle: (d: ReturnType<typeof deferred<IpcResult<SearchAppResult[]>>>) => d.resolve(ok(apps))
    },
    {
      outcome: 'fails',
      settle: (d: ReturnType<typeof deferred<IpcResult<SearchAppResult[]>>>) => d.reject(new Error('stale failure'))
    }
  ])('ignores a stale app list request that $outcome after a refresh', async ({ settle }) => {
    const api = mockApi()
    const stale = deferred<AppList>()
    const fresh = deferred<AppList>()
    api.ipm.searchApps.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise)
    const { rerender } = renderSidebar()
    rerender({ refreshKey: 1 })

    await act(async () => {
      fresh.resolve(ok([apps[1]]))
    })
    expect(await screen.findByText(HINT_ONE)).toBeInTheDocument()

    await act(async () => {
      settle(stale)
    })
    expect(screen.getByText(HINT_ONE)).toBeInTheDocument()
    expect(screen.queryByText('stale failure')).not.toBeInTheDocument()
  })

  it('stays loading until the latest app list request finishes', async () => {
    const api = mockApi()
    const stale = deferred<AppList>()
    const fresh = deferred<AppList>()
    api.ipm.searchApps.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise)
    const { rerender } = renderSidebar()
    rerender({ refreshKey: 1 })

    await act(async () => {
      stale.resolve(ok(apps))
    })
    expect(screen.getByPlaceholderText(LOADING_PLACEHOLDER)).toBeDisabled()

    await act(async () => {
      fresh.resolve(ok(apps))
    })
    expect(screen.getByPlaceholderText(SEARCH_PLACEHOLDER)).toBeEnabled()
  })

  it('hides the empty-result message while the app list reloads', async () => {
    const { user, api, input, rerender } = await renderLoaded()
    const reload = deferred<AppList>()
    api.ipm.searchApps.mockReturnValueOnce(reload.promise)
    await user.type(input, 'zzz')
    expect(screen.getByText(NO_RESULTS)).toBeInTheDocument()

    rerender({ refreshKey: 1 })

    expect(input).toBeDisabled()
    expect(input).toHaveValue('zzz')
    expect(screen.queryByText(NO_RESULTS)).not.toBeInTheDocument()

    await act(async () => {
      reload.resolve(ok(apps))
    })
    expect(await screen.findByText(NO_RESULTS)).toBeInTheDocument()
  })
})

describe('Sidebar favorites and recents loading', () => {
  it('logs and carries on when favorites and recents fail to load', async () => {
    const errorSpy = spyOnConsoleError()
    const favoritesError = new Error('favorites down')
    const recentsError = new Error('recents down')
    const api = mockApi()
    api.favorites.load.mockRejectedValue(favoritesError)
    api.recent.load.mockRejectedValue(recentsError)

    await renderLoaded()

    expect(errorSpy).toHaveBeenCalledWith('Failed to load favorites', favoritesError)
    expect(errorSpy).toHaveBeenCalledWith('Failed to load recent apps', recentsError)
    expect(screen.getByText(HINT)).toBeInTheDocument()
  })

  it('ignores unsuccessful favorites and recents results', async () => {
    const api = mockApi()
    api.favorites.load.mockResolvedValue(fail('no favorites'))
    api.recent.load.mockResolvedValue(fail('no recents'))

    await renderLoaded()

    expect(screen.getByText(HINT)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Favorites/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Recents/ })).not.toBeInTheDocument()
  })

  it('shows only the favorites section and no hint when there are no recents', async () => {
    mockApi().favorites.load.mockResolvedValue(ok([favoriteSlackV1, favoriteGmailV1]))

    await renderLoaded()

    expect(screen.getByRole('button', { name: /Favorites/ })).toHaveTextContent(/2$/)
    expect(screen.queryByRole('button', { name: /Recents/ })).not.toBeInTheDocument()
    expect(quickItems()).toHaveLength(2)
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
  })

  it('shows only the recents section and no hint when there are no favorites', async () => {
    mockApi().recent.load.mockResolvedValue(ok([recentSlackV2]))

    await renderLoaded()

    expect(screen.getByRole('button', { name: /Recents/ })).toHaveTextContent(/1$/)
    expect(screen.queryByRole('button', { name: /Favorites/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: slackV2Item })).toBeInTheDocument()
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
  })

  it('collapses and expands each section on its own', async () => {
    const api = mockApi()
    api.favorites.load.mockResolvedValue(ok([favoriteGmailV1]))
    api.recent.load.mockResolvedValue(ok([recentSlackV2]))
    const { user } = await renderLoaded()
    const favoritesHeader = screen.getByRole('button', { name: /Favorites/ })
    const recentsHeader = screen.getByRole('button', { name: /Recents/ })
    expect(isCollapsed(favoritesHeader)).toBe('false')

    await user.click(favoritesHeader)

    expect(isCollapsed(favoritesHeader)).toBe('true')
    expect(screen.queryByRole('button', { name: gmailV1Item })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: slackV2Item })).toBeInTheDocument()

    await user.click(recentsHeader)

    expect(isCollapsed(recentsHeader)).toBe('true')
    expect(screen.queryByRole('button', { name: slackV2Item })).not.toBeInTheDocument()

    await user.click(favoritesHeader)
    await user.click(recentsHeader)

    expect(isCollapsed(favoritesHeader)).toBe('false')
    expect(isCollapsed(recentsHeader)).toBe('false')
    expect(screen.getByRole('button', { name: gmailV1Item })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: slackV2Item })).toBeInTheDocument()
  })

  it('hides both sections while searching and brings them back when the search is cleared', async () => {
    const api = mockApi()
    api.favorites.load.mockResolvedValue(ok([favoriteGmailV1]))
    api.recent.load.mockResolvedValue(ok([recentSlackV2]))
    const { user, input } = await renderLoaded()

    await user.type(input, 'zzz')
    expect(screen.queryByRole('button', { name: /Favorites/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Recents/ })).not.toBeInTheDocument()

    await user.clear(input)
    expect(screen.getByRole('button', { name: /Favorites/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Recents/ })).toBeInTheDocument()
  })

  it('keeps the sections and the selected app card when the query is blank', async () => {
    const api = mockApi()
    api.favorites.load.mockResolvedValue(ok([favoriteGmailV1]))
    api.recent.load.mockResolvedValue(ok([recentSlackV2]))
    api.recent.add.mockResolvedValue(ok([recentSlackV2]))
    api.ipm.getAppInfo.mockResolvedValue(ok(slackInfo))
    const { user, input } = await renderLoaded()
    await user.click(screen.getByRole('button', { name: slackV2Item }))
    await screen.findByText(LATEST_V2)

    await user.type(input, '  ')

    expect(screen.getByRole('button', { name: /Favorites/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Recents/ })).toBeInTheDocument()
    expect(screen.getByText(LATEST_V2)).toBeInTheDocument()
  })
})

describe('Sidebar search results', () => {
  it('matches the label or the name case-insensitively and trims the query', async () => {
    const { user, input } = await renderLoaded([...apps, teams])

    await user.type(input, '  MICROSOFT ')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('listitem')).toHaveTextContent(teams.label)

    await user.clear(input)
    await user.type(input, 'ms-te')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('listitem')).toHaveTextContent(teams.label)
  })

  it('lists a single-major app once without a version suffix', async () => {
    const { user, input } = await renderLoaded([...apps, teams])

    await user.type(input, 'm')

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Gmail')
    expect(items[0]).not.toHaveTextContent('(v1)')
    expect(items[0]).toHaveTextContent('gmail · 1 versions')
    expect(items[1]).toHaveTextContent(teams.label)
    expect(items[1]).not.toHaveTextContent('(v1)')
    expect(items[1]).toHaveTextContent('ms-teams · 2 versions')
  })

  it('lists every major of a multi-major app from newest to oldest', async () => {
    const { user, input } = await renderLoaded([...apps, zoom])

    await user.type(input, 'zoom')

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Zoom (v3)')
    expect(items[0]).toHaveTextContent('zoom · 2 versions')
    expect(items[1]).toHaveTextContent('Zoom (v2)')
    expect(items[1]).toHaveTextContent('zoom · 1 versions')
    expect(items[2]).toHaveTextContent('Zoom (v1)')
    expect(items[2]).toHaveTextContent('zoom · 1 versions')
  })

  it('renders the majors of one app without duplicate keys', async () => {
    const errorSpy = spyOnConsoleError()
    const { user, input } = await renderLoaded([...apps, zoom])

    await user.type(input, 'zoom')

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('caps the result list at 50 entries', async () => {
    const bulk = Array.from({ length: 55 }, (_, i) => ({
      name: `bulk-${i}`,
      label: `Bulk ${String(i).padStart(2, '0')}`,
      theme: '#000',
      version: '1.0.0',
      availableVersions: ['1.0.0']
    }))
    const { user, input } = await renderLoaded(bulk)

    await user.type(input, 'bulk')

    expect(screen.getAllByRole('listitem')).toHaveLength(50)
    expect(screen.getByText('Bulk 00')).toBeInTheDocument()
    expect(screen.getByText('Bulk 49')).toBeInTheDocument()
    expect(screen.queryByText('Bulk 50')).not.toBeInTheDocument()
  })

  it('treats a blank query as no search', async () => {
    const { user, input } = await renderLoaded()

    await user.type(input, '   ')

    expect(input).toHaveValue('   ')
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    expect(screen.queryByText(NO_RESULTS)).not.toBeInTheDocument()
    expect(screen.getByText(HINT)).toBeInTheDocument()
  })

  it('moves the highlight down with ArrowDown and wraps to the first result', async () => {
    const { user, input } = await renderLoaded([...apps, zoom])
    await user.type(input, 'zoom')
    expect(highlightFlags()).toEqual([false, false, false])

    await user.keyboard(ARROW_DOWN)
    expect(highlightFlags()).toEqual([true, false, false])

    await user.keyboard(ARROW_DOWN)
    expect(highlightFlags()).toEqual([false, true, false])

    await user.keyboard(ARROW_DOWN)
    expect(highlightFlags()).toEqual([false, false, true])

    await user.keyboard(ARROW_DOWN)
    expect(highlightFlags()).toEqual([true, false, false])
  })

  it('moves the highlight up with ArrowUp and wraps to the last result', async () => {
    const { user, input } = await renderLoaded([...apps, zoom])
    await user.type(input, 'zoom')

    await user.keyboard('{ArrowUp}')
    expect(highlightFlags()).toEqual([false, false, true])

    await user.keyboard('{ArrowUp}')
    expect(highlightFlags()).toEqual([false, true, false])

    await user.keyboard('{ArrowUp}')
    expect(highlightFlags()).toEqual([true, false, false])

    await user.keyboard('{ArrowUp}')
    expect(highlightFlags()).toEqual([false, false, true])
  })

  it('keeps the caret still on the arrow keys and on Enter for a highlighted result', async () => {
    const { user, api, input } = await renderLoaded()
    api.ipm.getAppInfo.mockResolvedValue(ok(slackInfo))
    await user.type(input, 'slack')

    expect(fireEvent.keyDown(input, { key: 'ArrowDown' })).toBe(false)
    expect(fireEvent.keyDown(input, { key: 'ArrowUp' })).toBe(false)
    expect(fireEvent.keyDown(input, { key: 'ArrowDown' })).toBe(false)
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(false)
    await waitFor(() => expect(api.ipm.getAppInfo).toHaveBeenCalledOnce())
  })

  it('does nothing on Enter before a result is highlighted', async () => {
    const { user, api, input } = await renderLoaded()
    await user.type(input, 'slack')

    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(true)
    await user.keyboard('{Enter}')

    expect(api.ipm.getAppInfo).not.toHaveBeenCalled()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('ignores arrow keys and Enter when nothing matches', async () => {
    const { user, api, input } = await renderLoaded()
    await user.type(input, 'zzz')

    expect(fireEvent.keyDown(input, { key: 'ArrowDown' })).toBe(false)
    expect(fireEvent.keyDown(input, { key: 'ArrowUp' })).toBe(false)
    await user.keyboard('{Enter}')

    expect(api.ipm.getAppInfo).not.toHaveBeenCalled()
    expect(screen.getByText(NO_RESULTS)).toBeInTheDocument()
  })

  it('ignores arrow keys when the query is empty', async () => {
    const { user, api, input } = await renderLoaded()
    await user.click(input)

    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}')

    expect(api.ipm.getAppInfo).not.toHaveBeenCalled()
    expect(screen.getByText(HINT)).toBeInTheDocument()
  })

  it('resets the highlight when the query changes', async () => {
    const { user, api, input } = await renderLoaded()
    await user.type(input, 'slack{ArrowDown}')
    expect(highlightFlags()).toEqual([true, false])

    await user.keyboard('{Backspace}')
    expect(highlightFlags()).toEqual([false, false])

    await user.keyboard('{Enter}')
    expect(api.ipm.getAppInfo).not.toHaveBeenCalled()
  })

  it('does nothing on Enter when a reload leaves the highlight past the last result', async () => {
    const { user, api, input, rerender } = await renderLoaded([...apps, zoom])
    await user.type(input, 'zoom{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(highlightFlags()).toEqual([false, false, true])
    api.ipm.searchApps.mockResolvedValue(ok([...apps, { ...zoom, availableVersions: ['3.1.0', '3.0.0', '2.0.0'] }]))

    rerender({ refreshKey: 1 })
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    await waitFor(() => expect(input).toBeEnabled())
    input.focus()
    await user.keyboard('{Enter}')

    expect(api.ipm.getAppInfo).not.toHaveBeenCalled()
    expect(input).toHaveValue('zoom')
    expect(highlightFlags()).toEqual([false, false])
  })

  it('selects the highlighted older major with Enter and clears the search', async () => {
    const { user, api, input, onAppSelect } = await renderLoaded()
    api.ipm.getAppInfo.mockResolvedValue(ok(slackInfo))
    await user.type(input, 'slack{ArrowDown}{ArrowDown}{Enter}')

    await waitFor(() => expect(onAppSelect).toHaveBeenCalledOnce())
    expect(api.ipm.getAppInfo).toHaveBeenCalledWith('slack', '1.3.0')
    expect(input).toHaveValue('')
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('clears the search and drops the focus on Escape', async () => {
    const { user, input } = await renderLoaded()
    await user.type(input, 'sla')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)

    await user.keyboard('{Escape}')

    expect(input).toHaveValue('')
    expect(input).not.toHaveFocus()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    expect(screen.getByText(HINT)).toBeInTheDocument()
  })

  it('selects the result that is clicked', async () => {
    const { user, api, input, onAppSelect } = await renderLoaded()
    api.ipm.getAppInfo.mockResolvedValue(ok(slackInfo))
    await user.type(input, 'slack')

    await user.click(screen.getAllByRole('listitem')[1])

    await waitFor(() => expect(onAppSelect).toHaveBeenCalledOnce())
    expect(api.ipm.getAppInfo).toHaveBeenCalledWith('slack', '1.3.0')
    expect(onAppSelect).toHaveBeenCalledWith({ ...slackInfo, versions: ['1.3.0'], version: '1.3.0' })
    expect(api.recent.add).toHaveBeenCalledWith('slack', 'Slack', 1)
    expect(await screen.findByText('Latest: v1.3.0')).toBeInTheDocument()
    expect(screen.getByText('1 versions available')).toBeInTheDocument()
    expect(input).toHaveValue('')
  })

  it('hides the selected app card while searching and shows it again after Escape', async () => {
    const { user, api, input } = await renderLoaded()
    api.ipm.getAppInfo.mockResolvedValue(ok(slackInfo))
    await user.type(input, PICK_FIRST)
    expect(await screen.findByText(LATEST_V2)).toBeInTheDocument()

    await user.type(input, 'gm')
    expect(screen.queryByText(LATEST_V2)).not.toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.getByText(LATEST_V2)).toBeInTheDocument()
  })
})

describe('Sidebar Cmd+K shortcut', () => {
  it('focuses the search input with Ctrl+K but not with a plain k', async () => {
    const { user, input } = await renderLoaded()

    await user.keyboard('k')
    expect(input).not.toHaveFocus()

    await user.keyboard('{Control>}k{/Control}')
    expect(input).toHaveFocus()
  })

  it('prevents the browser default for the shortcut only', async () => {
    await renderLoaded()

    expect(fireEvent.keyDown(window, { key: 'k', metaKey: true })).toBe(false)
    expect(fireEvent.keyDown(window, { key: 'k', ctrlKey: true })).toBe(false)
    expect(fireEvent.keyDown(window, { key: 'k' })).toBe(true)
    expect(fireEvent.keyDown(window, { key: 'j', metaKey: true })).toBe(true)
  })

  it('stops listening once the sidebar unmounts', async () => {
    const { unmount } = await renderLoaded()

    unmount()

    expect(fireEvent.keyDown(window, { key: 'k', metaKey: true })).toBe(true)
  })
})

describe.each([
  { via: 'a search result', trigger: 'search', fallbackLabel: 'slack' },
  { via: 'a recent item', trigger: 'recent', fallbackLabel: 'Slack' }
])('Sidebar selecting $via', ({ trigger, fallbackLabel }) => {
  async function renderAndPick() {
    mockApi().recent.load.mockResolvedValue(ok([recentSlackV2]))
    const context = await renderLoaded()
    await pick(context.user)
    return context
  }

  async function pick(user: UserEvent) {
    if (trigger === 'search') {
      await user.type(screen.getByRole('textbox'), 'slack')
      await user.click(screen.getAllByRole('listitem')[0])
    } else {
      await user.click(await screen.findByRole('button', { name: slackV2Item }))
    }
  }

  it('selects the app and records it as recent', async () => {
    mockApi().ipm.getAppInfo.mockResolvedValue(ok(slackInfo))

    const { api, onAppSelect } = await renderAndPick()

    await waitFor(() => expect(onAppSelect).toHaveBeenCalledOnce())
    expect(api.ipm.getAppInfo).toHaveBeenCalledWith('slack', '2.1.0')
    expect(onAppSelect).toHaveBeenCalledWith({ ...slackInfo, versions: ['2.1.0', '2.0.0'], version: '2.1.0' })
    expect(api.recent.add).toHaveBeenCalledWith('slack', 'Slack', 2)
    expect(await screen.findByRole('heading', { level: 3, name: 'Slack' })).toBeInTheDocument()
    expect(screen.getByText('slack', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText(LATEST_V2)).toBeInTheDocument()
    expect(screen.getByText(TWO_VERSIONS)).toBeInTheDocument()
  })

  it('keeps the full version list when the API has no version of that major', async () => {
    const info: AppInfo = { ...slackInfo, version: '2.0.5', versions: ['1.0.0', '1.0.1'] }
    mockApi().ipm.getAppInfo.mockResolvedValue(ok(info))

    const { onAppSelect } = await renderAndPick()

    await waitFor(() => expect(onAppSelect).toHaveBeenCalledWith(info))
    expect(await screen.findByText('Latest: v2.0.5')).toBeInTheDocument()
    expect(screen.getByText(TWO_VERSIONS)).toBeInTheDocument()
  })

  it('shows zero versions when the API returns none', async () => {
    mockApi().ipm.getAppInfo.mockResolvedValue(ok({ ...slackInfo, versions: [] }))

    await renderAndPick()

    expect(await screen.findByText('0 versions available')).toBeInTheDocument()
    expect(screen.getByText(LATEST_V2)).toBeInTheDocument()
  })

  it('falls back to a name based label when the API returns no label', async () => {
    mockApi().ipm.getAppInfo.mockResolvedValue(ok({ ...slackInfo, label: '' }))

    const { api } = await renderAndPick()

    await waitFor(() => expect(api.recent.add).toHaveBeenCalledWith('slack', fallbackLabel, 2))
    expect(await screen.findByRole('heading', { level: 3, name: 'slack' })).toBeInTheDocument()
    expect(screen.getByText('S')).toBeInTheDocument()
  })

  it('replaces the recents with the list that recent.add returns', async () => {
    mockApi().ipm.getAppInfo.mockResolvedValue(ok(slackInfo))
    mockApi().recent.add.mockResolvedValue(ok([recentGmailV1, recentSlackV2]))

    await renderAndPick()

    await waitFor(() => expect(screen.getByRole('button', { name: /Recents/ })).toHaveTextContent(/2$/))
    const items = quickItems()
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Gmail')
    expect(items[1]).toHaveTextContent('Slack')
  })

  it('keeps the recents when recent.add is unsuccessful', async () => {
    mockApi().ipm.getAppInfo.mockResolvedValue(ok(slackInfo))
    mockApi().recent.add.mockResolvedValue(fail('Store locked'))

    const { api } = await renderAndPick()

    await waitFor(() => expect(api.recent.add).toHaveBeenCalledOnce())
    expect(await screen.findByText(LATEST_V2)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Recents/ })).toHaveTextContent(/1$/)
    expect(screen.queryByText('Store locked')).not.toBeInTheDocument()
  })

  it('logs a rejected recent.add and still selects the app', async () => {
    const errorSpy = spyOnConsoleError()
    const failure = new Error('Store crashed')
    mockApi().ipm.getAppInfo.mockResolvedValue(ok(slackInfo))
    mockApi().recent.add.mockRejectedValue(failure)

    const { onAppSelect } = await renderAndPick()

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith('Failed to update recent apps', failure))
    expect(onAppSelect).toHaveBeenCalledOnce()
    expect(screen.getByText(LATEST_V2)).toBeInTheDocument()
  })

  const noReason: IpcResult<AppInfo> = { success: false }

  test.each([
    { failure: 'a failure with a reason', result: fail(NOT_FOUND), message: NOT_FOUND },
    { failure: 'a failure without a reason', result: noReason, message: INFO_ERROR }
  ])('shows the error and selects nothing on $failure', async ({ result, message }) => {
    mockApi().ipm.getAppInfo.mockResolvedValue(result)

    const { api, onAppSelect } = await renderAndPick()

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(onAppSelect).not.toHaveBeenCalled()
    expect(api.recent.add).not.toHaveBeenCalled()
    expect(screen.queryByText(/^Latest: v/)).not.toBeInTheDocument()
  })

  test.each([
    { rejection: new Error('Socket closed'), message: 'Socket closed' },
    { rejection: 'offline', message: 'offline' }
  ])('shows "$message" when the app info request rejects', async ({ rejection, message }) => {
    mockApi().ipm.getAppInfo.mockRejectedValue(rejection)

    const { api, onAppSelect } = await renderAndPick()

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(onAppSelect).not.toHaveBeenCalled()
    expect(api.recent.add).not.toHaveBeenCalled()
  })

  it('clears an earlier error when the next selection starts', async () => {
    mockApi().ipm.getAppInfo.mockResolvedValueOnce(fail(NOT_FOUND)).mockResolvedValueOnce(ok(slackInfo))
    const { user } = await renderAndPick()
    expect(await screen.findByText(NOT_FOUND)).toBeInTheDocument()

    await pick(user)

    expect(await screen.findByText(LATEST_V2)).toBeInTheDocument()
    expect(screen.queryByText(NOT_FOUND)).not.toBeInTheDocument()
  })
})

describe('Sidebar favorites and recents list items', () => {
  it('quick-selects the newest version of the saved major', async () => {
    const api = mockApi()
    api.favorites.load.mockResolvedValue(ok([favoriteSlackV1]))
    api.ipm.getAppInfo.mockResolvedValue(ok(slackInfo))
    const { user, onAppSelect } = await renderLoaded()

    await user.click(screen.getByRole('button', { name: slackV1Item }))

    await waitFor(() => expect(onAppSelect).toHaveBeenCalledOnce())
    expect(api.ipm.getAppInfo).toHaveBeenCalledWith('slack', '1.3.0')
    expect(onAppSelect).toHaveBeenCalledWith({ ...slackInfo, versions: ['1.3.0'], version: '1.3.0' })
    expect(api.recent.add).toHaveBeenCalledWith('slack', 'Slack', 1)
  })

  it('asks for the default version when the app or its major is not in the list', async () => {
    const api = mockApi()
    api.favorites.load.mockResolvedValue(
      ok([
        { name: 'ghost', label: 'Ghost', major: 4, addedAt: 1 },
        { name: 'slack', label: 'Slack', major: 5, addedAt: 2 }
      ])
    )
    api.ipm.getAppInfo.mockResolvedValue(fail('not found'))
    const { user } = await renderLoaded()

    await user.click(screen.getByRole('button', { name: /Ghost\s*ghost · v4/ }))
    await user.click(screen.getByRole('button', { name: /Slack\s*slack · v5/ }))

    await waitFor(() => expect(api.ipm.getAppInfo).toHaveBeenCalledTimes(2))
    expect(api.ipm.getAppInfo).toHaveBeenNthCalledWith(1, 'ghost', undefined)
    expect(api.ipm.getAppInfo).toHaveBeenNthCalledWith(2, 'slack', undefined)
  })

  it('passes the saved label to recent.add when the API returns none', async () => {
    const api = mockApi()
    api.favorites.load.mockResolvedValue(ok([{ ...favoriteGmailV1, label: 'Gmail (work)' }]))
    api.ipm.getAppInfo.mockResolvedValue(
      ok({ ...slackInfo, name: 'gmail', label: '', version: '1.0.0', versions: ['1.0.0'] })
    )
    const { user } = await renderLoaded()

    await user.click(screen.getByRole('button', { name: /Gmail \(work\)\s*gmail · v1/ }))

    await waitFor(() => expect(api.recent.add).toHaveBeenCalledWith('gmail', 'Gmail (work)', 1))
  })

  it('marks every list item of the selected app and major as active', async () => {
    const api = mockApi()
    const recents = [recentSlackV2, recentGmailV1]
    api.favorites.load.mockResolvedValue(ok([favoriteSlackV2, favoriteSlackV1, favoriteGmailV1]))
    api.recent.load.mockResolvedValue(ok(recents))
    api.recent.add.mockResolvedValue(ok(recents))
    api.ipm.getAppInfo.mockResolvedValue(ok(slackInfo))
    const { user } = await renderLoaded()
    expect(activeFlags()).toEqual([false, false, false, false, false])

    await user.click(screen.getAllByRole('button', { name: slackV2Item })[0])

    await waitFor(() => expect(activeFlags()).toEqual([true, false, false, true, false]))

    await user.click(screen.getByRole('button', { name: slackV1Item }))

    await waitFor(() => expect(activeFlags()).toEqual([false, true, false, false, false]))
  })

  it('ignores clicks and keys on favorites and recents while the app list is loading', async () => {
    const api = mockApi()
    const list = deferred<AppList>()
    api.ipm.searchApps.mockReturnValue(list.promise)
    api.favorites.load.mockResolvedValue(ok([favoriteGmailV1]))
    api.recent.load.mockResolvedValue(ok([recentSlackV2]))
    api.ipm.getAppInfo.mockResolvedValue(ok(slackInfo))
    const user = userEvent.setup()
    renderSidebar()
    const favorite = await screen.findByRole('button', { name: gmailV1Item })
    const recent = screen.getByRole('button', { name: slackV2Item })
    expect(favorite).toHaveAttribute(ARIA_DISABLED, 'true')
    expect(recent).toHaveAttribute(ARIA_DISABLED, 'true')

    await user.click(favorite)
    await user.click(recent)
    recent.focus()
    await user.keyboard('{Enter} ')
    favorite.focus()
    await user.keyboard('{Enter} ')

    expect(api.ipm.getAppInfo).not.toHaveBeenCalled()

    await act(async () => {
      list.resolve(ok(apps))
    })
    expect(favorite).toHaveAttribute(ARIA_DISABLED, 'false')
    expect(recent).toHaveAttribute(ARIA_DISABLED, 'false')

    await user.click(favorite)

    await waitFor(() => expect(api.ipm.getAppInfo).toHaveBeenCalledWith('gmail', '1.0.0'))
  })

  it('activates a focused list item with Space or Enter and ignores other keys', async () => {
    const api = mockApi()
    api.favorites.load.mockResolvedValue(ok([favoriteGmailV1]))
    api.ipm.getAppInfo.mockResolvedValue(ok({ ...slackInfo, name: 'gmail', versions: ['1.0.0'], version: '1.0.0' }))
    const { user } = await renderLoaded()
    screen.getByRole('button', { name: gmailV1Item }).focus()

    await user.keyboard('a{Escape}')
    expect(api.ipm.getAppInfo).not.toHaveBeenCalled()

    await user.keyboard(' ')
    await waitFor(() => expect(api.ipm.getAppInfo).toHaveBeenCalledTimes(1))

    await user.keyboard('{Enter}')
    await waitFor(() => expect(api.ipm.getAppInfo).toHaveBeenCalledTimes(2))
  })

  it('puts the section headers and list items in the Tab order after the search box', async () => {
    const api = mockApi()
    api.favorites.load.mockResolvedValue(ok([favoriteGmailV1]))
    api.recent.load.mockResolvedValue(ok([recentSlackV2]))
    const { user, input } = await renderLoaded()
    input.focus()

    await user.tab()
    expect(screen.getByRole('button', { name: /Favorites/ })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('button', { name: gmailV1Item })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('button', { name: /Recents/ })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('button', { name: slackV2Item })).toHaveFocus()
  })
})

describe('Sidebar selected app card', () => {
  it('shows the initial of the app and the default surface without an icon or theme', async () => {
    const { container } = await selectSlackV2()

    const initial = screen.getByText('S')
    expect(initial.parentElement).toHaveStyle({ background: 'var(--bg-surface)' })
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it('shows the icon and theme passed by the parent', async () => {
    const { rerender } = await selectSlackV2()

    rerender({ appIcon: ICON_URL, appTheme: '#4a154b' })

    const icon = screen.getByRole('img', { name: 'Slack' })
    expect(icon).toHaveAttribute('src', ICON_URL)
    expect(icon.parentElement).toHaveStyle({ background: '#4a154b' })
    expect(screen.queryByText('S')).not.toBeInTheDocument()
  })

  it('labels the icon with the app name when the API returns no label', async () => {
    const { rerender } = await selectSlackV2({ ...slackInfo, label: '' })

    rerender({ appIcon: ICON_URL })

    expect(screen.getByRole('img', { name: 'slack' })).toHaveAttribute('src', ICON_URL)
  })

  it('shows the app name and an empty favorite star before it is saved', async () => {
    await selectSlackV2()

    expect(screen.getByText('slack', { selector: 'p' })).toBeInTheDocument()
    const star = screen.getByTitle(ADD_FAVORITE)
    expect(star).toHaveTextContent('☆')
    expect(star).not.toHaveClass('active')
  })
})

describe('Sidebar favorite toggle', () => {
  it('adds the selected app and major to favorites with a timestamp', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    const { user, api } = await selectSlackV2()
    expect(screen.queryByRole('button', { name: /Favorites/ })).not.toBeInTheDocument()

    await user.click(screen.getByTitle(ADD_FAVORITE))

    expect(api.favorites.save).toHaveBeenCalledOnce()
    expect(api.favorites.save).toHaveBeenCalledWith([{ name: 'slack', label: 'Slack', major: 2, addedAt: NOW }])
    const star = screen.getByTitle(REMOVE_FAVORITE)
    expect(star).toHaveTextContent('★')
    expect(star).toHaveClass('active')
    expect(screen.getByRole('button', { name: /Favorites/ })).toHaveTextContent(/1$/)
    expect(screen.getByRole('button', { name: slackV2Item })).toHaveClass('active')
  })

  it('keeps the other majors when adding a new one', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    mockApi().favorites.load.mockResolvedValue(ok([favoriteSlackV1, favoriteGmailV1]))
    const { user, api } = await selectSlackV2()
    expect(screen.getByTitle(ADD_FAVORITE)).toBeInTheDocument()

    await user.click(screen.getByTitle(ADD_FAVORITE))

    expect(api.favorites.save).toHaveBeenCalledWith([
      favoriteSlackV1,
      favoriteGmailV1,
      { name: 'slack', label: 'Slack', major: 2, addedAt: NOW }
    ])
  })

  it('removes only the matching major and can add it back', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    mockApi().favorites.load.mockResolvedValue(ok([favoriteSlackV1, favoriteSlackV2, favoriteGmailV1]))
    const { user, api } = await selectSlackV2()
    expect(screen.getByTitle(REMOVE_FAVORITE)).toHaveClass('active')

    await user.click(screen.getByTitle(REMOVE_FAVORITE))

    expect(api.favorites.save).toHaveBeenLastCalledWith([favoriteSlackV1, favoriteGmailV1])
    const star = screen.getByTitle(ADD_FAVORITE)
    expect(star).toHaveTextContent('☆')
    expect(star).not.toHaveClass('active')
    expect(screen.getByRole('button', { name: slackV1Item })).toBeInTheDocument()
    expect(quickItems()).toHaveLength(2)

    await user.click(star)

    expect(api.favorites.save).toHaveBeenLastCalledWith([
      favoriteSlackV1,
      favoriteGmailV1,
      { name: 'slack', label: 'Slack', major: 2, addedAt: NOW }
    ])
    expect(screen.getByTitle(REMOVE_FAVORITE)).toBeInTheDocument()
  })

  it('names the favorite after the app when the API returns no label', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    const { user, api } = await selectSlackV2({ ...slackInfo, label: '' })

    await user.click(screen.getByTitle(ADD_FAVORITE))

    expect(api.favorites.save).toHaveBeenCalledWith([{ name: 'slack', label: 'slack', major: 2, addedAt: NOW }])
  })

  it('logs a rejected save and keeps the favorite toggled', async () => {
    const errorSpy = spyOnConsoleError()
    const failure = new Error('Disk full')
    const { user, api } = await selectSlackV2()
    api.favorites.save.mockRejectedValue(failure)

    await user.click(screen.getByTitle(ADD_FAVORITE))

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith('Failed to save favorites', failure))
    expect(screen.getByTitle(REMOVE_FAVORITE)).toBeInTheDocument()
  })
})
