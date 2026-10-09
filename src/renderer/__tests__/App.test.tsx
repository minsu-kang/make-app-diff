import { describe, it, expect, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import App from '../App'
import { fail, mockApi, mockMenu, ok } from './mocks/window-api'
import type { AppInfo, DiffResult, FileDiff, IpcResult, IpmSettings, SearchAppResult } from '../../preload/index'

const SEARCH_PLACEHOLDER = 'Search by label or name...'
const CHANGED_FILES = 'Changed files (1)'
const HINT = 'Select two versions above and click Compare to see differences.'
const LOADING = 'Comparing versions...'
const NO_VERSION = 'Select version...'
const SWAP_TITLE = 'Swap versions'
const RAW_TOGGLE = 'Switch to raw compiled view'
const SDK_TOGGLE = 'Switch to SDK decompiled view'
const VSCODE_TITLE = 'Open in VS Code'
const VSCODE_FAILURE = 'Failed to open VS Code'
const NO_FILE = 'Select a file to view'
const SESSION_LOG = 'Failed to check the session'
const SESSION_EXPIRED = 'Session expired (48h inactive). Please re-enter your tokens.'
const IPME_HOST = 'ipme.integromat.com'
const ICON = 'data:image/png;base64,iVBORw0KGgo='
const HALF_HOUR = 30 * 60 * 1000
const DOWNLOAD_TOGGLE = 'Download version'
const THEME_ATTR = 'data-theme'
const CONNECTIONS_DIR = 'connections'
const SAVE_SETTINGS = 'Save Settings'
const COLLAPSED_CLASS = 'sidebar-collapsed'
const LATE_FAILURE = 'Late failure'
const NETWORK_DOWN = 'Network down'
const HANG_UP = 'socket hang up'
const NOT_FOUND = 'Version not found'
const NO_ERROR_TITLE = 'a result without an error message'
const REJECTED_ERROR_TITLE = 'a rejected Error'
const REJECTED_VALUE_TITLE = 'a rejected value that is not an Error'

const slackInfo: AppInfo = {
  name: 'slack',
  label: 'Slack',
  description: 'Chat',
  version: '2.1.0',
  versions: ['2.1.0', '2.0.0']
}

const gmailInfo: AppInfo = {
  name: 'gmail',
  label: 'Gmail',
  description: 'Mail',
  version: '1.1.0',
  versions: ['1.1.0', '1.0.0']
}

type DiffPromise = Promise<IpcResult<DiffResult>>

const slackThreeVersions: AppInfo = { ...slackInfo, version: '2.2.0', versions: ['2.2.0', '2.1.0', '2.0.0'] }
const slackTwoMajors: AppInfo = { ...slackInfo, versions: ['2.1.0', '2.0.0', '1.3.0', '1.2.0'] }

const storedSettings: IpmSettings = {
  host: 'ipm.integromat.com',
  ipmToken: 'token',
  ipmeToken: '',
  env: 'staging',
  ipmVersion: '3.20.0'
}

function fileDiff(filePath: string, status: FileDiff['status'], oldContent: string, newContent: string): FileDiff {
  return { filePath, status, oldContent, newContent, unifiedDiff: `-${oldContent}\n+${newContent}` }
}

const diffResult: DiffResult = {
  type: 'app',
  diffs: [
    {
      filePath: 'modules/send/api.imljson',
      status: 'modified',
      oldContent: 'a',
      newContent: 'b',
      unifiedDiff: '-a\n+b'
    },
    { filePath: 'connections/oauth/api.imljson', status: 'added', oldContent: '', newContent: 'c', unifiedDiff: '+c' }
  ],
  summary: { added: 1, deleted: 0, modified: 1, unchanged: 0 }
}

const moduleFilePath = diffResult.diffs[0].filePath

const tabbedDiff: DiffResult = {
  ...diffResult,
  diffs: [
    ...diffResult.diffs,
    fileDiff('accounts/oauth.json', 'deleted', 'old-account', ''),
    fileDiff('hooks/hook.json', 'added', '', 'h'),
    fileDiff('webhooks/hook1/api.imljson', 'modified', 'w1', 'w2')
  ],
  summary: { added: 2, deleted: 1, modified: 2, unchanged: 0 }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function searchResultOf(info: AppInfo): SearchAppResult {
  return {
    name: info.name,
    label: info.label,
    theme: '#000',
    version: info.version,
    availableVersions: info.versions
  }
}

function stubApps(...infos: AppInfo[]) {
  const api = mockApi()
  api.ipm.searchApps.mockResolvedValue(ok(infos.map(searchResultOf)))
  api.ipm.getAppInfo.mockImplementation(async (name) => {
    const info = infos.find((candidate) => candidate.name === name)
    return info ? ok(info) : fail(`Unknown app ${name}`)
  })
}

async function renderApp() {
  const view = render(<App />)
  await waitFor(() => expect(mockApi().menu.setEnabled).toHaveBeenCalledWith(true))
  return view
}

function openSettingsFromMenu() {
  act(() => mockMenu().emit('openSettings'))
}

async function renderAbout() {
  await renderApp()
  act(() => mockMenu().emit('showInfo'))
}

async function selectApp(user: UserEvent, query = 'slack') {
  await user.type(await screen.findByPlaceholderText(SEARCH_PLACEHOLDER), query)
  await user.click(await screen.findByRole('listitem'))
}

async function compare(user: UserEvent) {
  await user.click(await screen.findByRole('button', { name: 'Compare' }))
}

async function showFromDownload(user: UserEvent, version: string) {
  await user.click(await screen.findByTitle(DOWNLOAD_TOGGLE))
  await user.selectOptions(screen.getByLabelText('Download'), version)
  await user.click(screen.getByRole('button', { name: 'Show' }))
}

async function openFile(user: UserEvent, filePath: string) {
  for (const part of filePath.split('/')) await user.click(screen.getByText(part))
}

async function renderPendingCompare(user: UserEvent) {
  const pending = deferred<IpcResult<DiffResult>>()
  stubApps(slackInfo, gmailInfo)
  mockApi().ipm.getDiff.mockReturnValue(pending.promise)
  render(<App />)
  await selectApp(user)
  await compare(user)
  expect(await screen.findByText(LOADING)).toBeInTheDocument()
  return pending
}

async function renderPendingShow(user: UserEvent) {
  const pending = deferred<IpcResult<DiffResult>>()
  stubApps(slackInfo, gmailInfo)
  mockApi().ipm.showVersion.mockReturnValue(pending.promise)
  render(<App />)
  await selectApp(user)
  await showFromDownload(user, '2.1.0')
  expect(await screen.findByText(LOADING)).toBeInTheDocument()
  return pending
}

function closestOverlay(element: HTMLElement): HTMLElement {
  const overlay = element.closest<HTMLElement>('.settings-overlay')
  if (!overlay) throw new Error('The element is not inside an overlay')
  return overlay
}

function settingsPanel() {
  return within(closestOverlay(screen.getByRole('heading', { name: 'Settings' })))
}

function themeCard(label: string) {
  return screen.getByText(label).closest('button') as HTMLElement
}

function aboutRow(label: string) {
  const row = screen.getByText(label).parentElement
  if (!row) throw new Error('The About row has no parent')
  return within(row)
}

describe('App', () => {
  it('applies the stored theme and enables the menu when a token exists', async () => {
    const api = mockApi()
    api.theme.load.mockResolvedValue('light')
    render(<App />)

    await waitFor(() => expect(api.menu.setEnabled).toHaveBeenCalledWith(true))
    expect(document.documentElement).toHaveAttribute(THEME_ATTR, 'light')
    expect(screen.getByText('Search for an app in the sidebar to get started.')).toBeInTheDocument()
  })

  it('forces the settings dialog when the token is empty', async () => {
    mockApi().settings.load.mockResolvedValue({
      host: 'ipm.integromat.com',
      ipmToken: '  ',
      ipmeToken: '',
      env: 'staging',
      ipmVersion: '3.20.0'
    })
    render(<App />)

    expect(await screen.findByText(/A valid token is required/)).toBeInTheDocument()
    expect(mockApi().menu.setEnabled).not.toHaveBeenCalled()
  })

  it('forces the settings dialog and toasts when the session expired', async () => {
    mockApi().session.check.mockResolvedValue({ expired: true })
    render(<App />)

    expect(await screen.findByText(/Session expired/)).toBeInTheDocument()
    expect(screen.getByText(/A valid token is required/)).toBeInTheDocument()
  })

  it('opens the About dialog from the menu and closes it on Escape', async () => {
    render(<App />)
    await waitFor(() => expect(mockApi().menu.setEnabled).toHaveBeenCalled())

    act(() => mockMenu().emit('showInfo'))
    expect(screen.getByText('0.0.0-test')).toBeInTheDocument()

    await userEvent.setup().keyboard('{Escape}')
    expect(screen.queryByText('About')).not.toBeInTheDocument()
  })

  it('selects an app, compares two versions and renders the diff of the active tab', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    api.ipm.searchApps.mockResolvedValue(
      ok([{ name: 'slack', label: 'Slack', theme: '#000', version: '2.1.0', availableVersions: ['2.1.0', '2.0.0'] }])
    )
    api.ipm.getAppInfo.mockResolvedValue(ok(slackInfo))
    api.ipm.getDiff.mockResolvedValue(ok(diffResult))
    render(<App />)

    await user.type(await screen.findByPlaceholderText(SEARCH_PLACEHOLDER), 'slack')
    await user.click(screen.getByRole('listitem'))

    await user.click(await screen.findByRole('button', { name: 'Compare' }))

    expect(api.ipm.getDiff).toHaveBeenCalledWith('slack', '2.0.0', '2.1.0', true)
    expect(await screen.findByText(CHANGED_FILES)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Connection/ })).toHaveTextContent('+1')

    await user.click(screen.getByRole('button', { name: /Connection/ }))
    expect(screen.getByText(CHANGED_FILES)).toBeInTheDocument()
    expect(screen.getByText(CONNECTIONS_DIR)).toBeInTheDocument()
  })

  it('shows the error with a retry that repeats the compare', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    api.ipm.searchApps.mockResolvedValue(
      ok([{ name: 'slack', label: 'Slack', theme: '#000', version: '2.1.0', availableVersions: ['2.1.0', '2.0.0'] }])
    )
    api.ipm.getAppInfo.mockResolvedValue(ok(slackInfo))
    api.ipm.getDiff.mockResolvedValueOnce({ success: false, error: 'Boom' }).mockResolvedValueOnce(ok(diffResult))
    render(<App />)

    await user.type(await screen.findByPlaceholderText(SEARCH_PLACEHOLDER), 'slack')
    await user.click(screen.getByRole('listitem'))
    await user.click(await screen.findByRole('button', { name: 'Compare' }))
    expect(await screen.findByText('Boom')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText(CHANGED_FILES)).toBeInTheDocument()
    expect(api.ipm.getDiff).toHaveBeenCalledTimes(2)
  })

  it('re-checks the session every 30 minutes and locks the app when it expired', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const api = mockApi()
    render(<App />)
    await waitFor(() => expect(api.menu.setEnabled).toHaveBeenCalledWith(true))

    api.session.check.mockResolvedValue({ expired: true })
    await act(() => vi.advanceTimersByTimeAsync(30 * 60 * 1000))

    expect(await screen.findByText(/A valid token is required/)).toBeInTheDocument()
    expect(api.menu.setEnabled).toHaveBeenLastCalledWith(false)
  })

  it('shows a version through Show and toggles the SDK view for custom apps', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    api.ipm.searchApps.mockResolvedValue(
      ok([{ name: 'slack', label: 'Slack', theme: '#000', version: '2.1.0', availableVersions: ['2.1.0', '2.0.0'] }])
    )
    api.ipm.getAppInfo.mockResolvedValue(ok(slackInfo))
    api.ipm.showVersion.mockResolvedValue(ok({ ...diffResult, isCustomApp: true }))
    render(<App />)

    await user.type(await screen.findByPlaceholderText(SEARCH_PLACEHOLDER), 'slack')
    await user.click(screen.getByRole('listitem'))
    await user.click(await screen.findByTitle(DOWNLOAD_TOGGLE))
    await user.selectOptions(screen.getByLabelText('Download'), 'v2.1.0')
    await user.click(screen.getByRole('button', { name: 'Show' }))

    expect(api.ipm.showVersion).toHaveBeenCalledWith('slack', '2.1.0', true)
    expect(await screen.findByText('Files (1)')).toBeInTheDocument()

    await user.click(screen.getByTitle(RAW_TOGGLE))

    expect(api.ipm.showVersion).toHaveBeenLastCalledWith('slack', '2.1.0', false)
    await user.click(await screen.findByTitle(VSCODE_TITLE))
    expect(api.editor.openInVscode).toHaveBeenCalledWith({
      appName: 'slack',
      version: '2.1.0',
      files: [
        { path: 'modules/send/api.imljson', content: 'b' },
        { path: 'connections/oauth/api.imljson', content: 'c' }
      ]
    })
  })

  describe('startup', () => {
    it('logs a failed theme load and keeps starting up', async () => {
      const consoleError = vi.spyOn(console, 'error').mockReturnValue(undefined)
      const failure = new Error('Theme store is broken')
      mockApi().theme.load.mockRejectedValue(failure)

      await renderApp()

      expect(consoleError).toHaveBeenCalledWith('Failed to load the theme', failure)
      expect(document.documentElement).not.toHaveAttribute(THEME_ATTR)
      expect(screen.getByText('Search for an app in the sidebar to get started.')).toBeInTheDocument()
    })

    it('reads the IPME token when the IPME host is configured', async () => {
      mockApi().settings.load.mockResolvedValue({
        ...storedSettings,
        host: IPME_HOST,
        ipmToken: '',
        ipmeToken: 'ipme-token'
      })

      await renderApp()

      expect(screen.queryByText(/A valid token is required/)).not.toBeInTheDocument()
    })

    it('forces the settings dialog when only the token of the other host is set', async () => {
      const api = mockApi()
      api.settings.load.mockResolvedValue({ ...storedSettings, host: IPME_HOST, ipmToken: 'ipm-token', ipmeToken: '' })
      render(<App />)

      expect(await screen.findByText(/A valid token is required/)).toBeInTheDocument()
      expect(api.menu.setEnabled).not.toHaveBeenCalled()
    })

    it('keeps the menu disabled and toasts when the session expired', async () => {
      const api = mockApi()
      api.session.check.mockResolvedValue({ expired: true })
      render(<App />)

      expect(await screen.findByText(SESSION_EXPIRED)).toBeInTheDocument()
      expect(api.menu.setEnabled).not.toHaveBeenCalled()
    })

    it('toasts and logs when the session check fails', async () => {
      const consoleError = vi.spyOn(console, 'error').mockReturnValue(undefined)
      const failure = new Error('IPC is down')
      const api = mockApi()
      api.session.check.mockRejectedValue(failure)
      render(<App />)

      expect(
        await screen.findByText('Could not check the session. Open Settings to verify your tokens.')
      ).toBeInTheDocument()
      expect(consoleError).toHaveBeenCalledWith(SESSION_LOG, failure)
      expect(api.menu.setEnabled).not.toHaveBeenCalled()
      expect(screen.queryByText(/A valid token is required/)).not.toBeInTheDocument()
    })

    it('toasts and logs when the stored settings cannot be read', async () => {
      const consoleError = vi.spyOn(console, 'error').mockReturnValue(undefined)
      const failure = new Error('Settings file is corrupt')
      const api = mockApi()
      api.settings.load.mockRejectedValue(failure)
      render(<App />)

      expect(
        await screen.findByText('Could not check the session. Open Settings to verify your tokens.')
      ).toBeInTheDocument()
      expect(consoleError).toHaveBeenCalledWith(SESSION_LOG, failure)
      expect(api.menu.setEnabled).not.toHaveBeenCalled()
    })
  })

  describe('periodic session check', () => {
    it('runs every 30 minutes and leaves a valid session alone', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const api = mockApi()
      await renderApp()
      expect(api.session.check).toHaveBeenCalledTimes(1)

      await act(() => vi.advanceTimersByTimeAsync(HALF_HOUR - 60 * 1000))
      expect(api.session.check).toHaveBeenCalledTimes(1)

      await act(() => vi.advanceTimersByTimeAsync(60 * 1000))
      expect(api.session.check).toHaveBeenCalledTimes(2)
      expect(api.menu.setEnabled).not.toHaveBeenCalledWith(false)
      expect(screen.queryByText(/Session expired/)).not.toBeInTheDocument()
      expect(screen.queryByText(/A valid token is required/)).not.toBeInTheDocument()
    })

    it('toasts the expiry when the session runs out between checks', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const api = mockApi()
      await renderApp()

      api.session.check.mockResolvedValue({ expired: true })
      await act(() => vi.advanceTimersByTimeAsync(HALF_HOUR))

      expect(await screen.findByText(SESSION_EXPIRED)).toBeInTheDocument()
      expect(screen.getByText(/A valid token is required/)).toBeInTheDocument()
    })

    it('logs a failing check without locking the app or toasting', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const consoleError = vi.spyOn(console, 'error').mockReturnValue(undefined)
      const failure = new Error('IPC timed out')
      const api = mockApi()
      await renderApp()

      api.session.check.mockRejectedValue(failure)
      await act(() => vi.advanceTimersByTimeAsync(HALF_HOUR))

      expect(consoleError).toHaveBeenCalledWith(SESSION_LOG, failure)
      expect(screen.queryByText(/Could not check the session/)).not.toBeInTheDocument()
      expect(screen.queryByText(/A valid token is required/)).not.toBeInTheDocument()
      expect(api.menu.setEnabled).not.toHaveBeenCalledWith(false)
    })

    it('unregisters the menu listeners and stops checking once unmounted', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const api = mockApi()
      const menu = mockMenu()
      const stopSettings = vi.fn()
      const stopDownload = vi.fn()
      const stopInfo = vi.fn()
      menu.openSettings.mockReturnValue(stopSettings)
      menu.downloadApp.mockReturnValue(stopDownload)
      menu.showInfo.mockReturnValue(stopInfo)
      const { unmount } = await renderApp()
      expect(menu.openSettings).toHaveBeenCalledOnce()
      expect(menu.downloadApp).toHaveBeenCalledOnce()
      expect(menu.showInfo).toHaveBeenCalledOnce()
      expect(stopSettings).not.toHaveBeenCalled()

      unmount()

      expect(stopSettings).toHaveBeenCalledOnce()
      expect(stopDownload).toHaveBeenCalledOnce()
      expect(stopInfo).toHaveBeenCalledOnce()
      api.session.check.mockClear()
      await vi.advanceTimersByTimeAsync(HALF_HOUR)
      expect(api.session.check).not.toHaveBeenCalled()
    })
  })

  describe('menu events', () => {
    it('opens the Settings dialog as a dismissible dialog', async () => {
      const user = userEvent.setup()
      await renderApp()

      openSettingsFromMenu()

      expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
      expect(screen.queryByText(/A valid token is required/)).not.toBeInTheDocument()
      await user.click(settingsPanel().getByRole('button', { name: '×' }))
      expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument()
    })

    it('opens the Download dialog and closes it on Escape', async () => {
      const user = userEvent.setup()
      await renderApp()

      act(() => mockMenu().emit('downloadApp'))
      expect(await screen.findByRole('heading', { name: 'Download App' })).toBeInTheDocument()

      await user.keyboard('{Escape}')
      expect(screen.queryByRole('heading', { name: 'Download App' })).not.toBeInTheDocument()
    })
  })

  describe('About dialog', () => {
    it('lists the application and runtime versions', async () => {
      Object.assign(window, {
        appVersion: { app: '9.8.7', electron: '31.0.1', chrome: '126.0.2', node: '20.11.0' }
      })
      await renderAbout()

      expect(screen.getByRole('heading', { name: 'About' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 3, name: 'MakeDiff' })).toBeInTheDocument()
      expect(screen.getByText('App version diff viewer')).toBeInTheDocument()
      expect(aboutRow('Version').getByText('9.8.7')).toBeInTheDocument()
      expect(aboutRow('Electron').getByText('31.0.1')).toBeInTheDocument()
      expect(aboutRow('Chrome').getByText('126.0.2')).toBeInTheDocument()
      expect(aboutRow('Node').getByText('20.11.0')).toBeInTheDocument()
      expect(screen.getByText(`© ${new Date().getFullYear()} Minsu Kang`)).toBeInTheDocument()
    })

    it('falls back to placeholders when the versions are not exposed', async () => {
      Object.assign(window, { appVersion: undefined })
      await renderAbout()

      expect(aboutRow('Version').getByText('1.0.0')).toBeInTheDocument()
      expect(aboutRow('Electron').getByText('-')).toBeInTheDocument()
      expect(aboutRow('Chrome').getByText('-')).toBeInTheDocument()
      expect(aboutRow('Node').getByText('-')).toBeInTheDocument()
    })

    it('closes when the overlay is clicked', async () => {
      const user = userEvent.setup()
      await renderAbout()

      await user.click(closestOverlay(screen.getByRole('heading', { name: 'About' })))

      expect(screen.queryByRole('heading', { name: 'About' })).not.toBeInTheDocument()
    })

    it('stays open when the panel itself is clicked', async () => {
      const user = userEvent.setup()
      await renderAbout()

      await user.click(screen.getByRole('heading', { name: 'About' }))
      await user.click(screen.getByText('App version diff viewer'))

      expect(screen.getByRole('heading', { name: 'About' })).toBeInTheDocument()
    })

    it('closes with the close button', async () => {
      const user = userEvent.setup()
      await renderAbout()

      await user.click(screen.getByRole('button', { name: '✕' }))

      expect(screen.queryByRole('heading', { name: 'About' })).not.toBeInTheDocument()
    })

    it('closes on Enter but ignores other keys', async () => {
      const user = userEvent.setup()
      await renderAbout()

      await user.keyboard('x')
      expect(screen.getByRole('heading', { name: 'About' })).toBeInTheDocument()

      await user.keyboard('{Enter}')
      expect(screen.queryByRole('heading', { name: 'About' })).not.toBeInTheDocument()
    })
  })

  describe('theme and settings', () => {
    it('lets Settings switch the theme live and persists it on save', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      api.theme.load.mockResolvedValue('light')
      await renderApp()
      expect(document.documentElement).toHaveAttribute(THEME_ATTR, 'light')

      openSettingsFromMenu()
      await waitFor(() => expect(themeCard('Light')).toHaveClass('active'))

      await user.click(themeCard('Make'))
      expect(document.documentElement).toHaveAttribute(THEME_ATTR, 'make')
      expect(api.theme.save).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: SAVE_SETTINGS }))

      await waitFor(() => expect(api.theme.save).toHaveBeenCalledWith('make'))
      expect(await screen.findByText('Settings saved')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument()
      expect(document.documentElement).toHaveAttribute(THEME_ATTR, 'make')
    })

    it('reverts the live theme to the stored one when the changes are discarded', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      api.theme.load.mockResolvedValue('light')
      await renderApp()

      openSettingsFromMenu()
      await waitFor(() => expect(themeCard('Light')).toHaveClass('active'))
      await user.click(themeCard('Make'))
      expect(document.documentElement).toHaveAttribute(THEME_ATTR, 'make')

      await user.keyboard('{Escape}')
      await user.click(await screen.findByRole('button', { name: 'Discard' }))

      expect(document.documentElement).toHaveAttribute(THEME_ATTR, 'light')
      expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument()
      expect(api.theme.save).not.toHaveBeenCalled()
    })

    it('opens Settings from the sidebar and reloads the app list after saving', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      await renderApp()
      await waitFor(() => expect(api.ipm.searchApps).toHaveBeenCalledTimes(1))

      await user.click(screen.getByTitle('Settings'))
      await waitFor(() => expect(screen.getByLabelText('IPM Token')).toHaveValue('token'))
      await user.click(screen.getByRole('button', { name: SAVE_SETTINGS }))

      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument())
      expect(api.settings.save).toHaveBeenCalledWith(storedSettings)
      await waitFor(() => expect(api.ipm.searchApps).toHaveBeenCalledTimes(2))
    })

    it('lifts the forced mode once the tokens are saved', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      api.session.check.mockResolvedValue({ expired: true })
      render(<App />)
      expect(await screen.findByText(/A valid token is required/)).toBeInTheDocument()
      expect(settingsPanel().queryByRole('button', { name: '×' })).not.toBeInTheDocument()
      await waitFor(() => expect(screen.getByLabelText('IPM Token')).toHaveValue('token'))

      await user.click(screen.getByRole('button', { name: SAVE_SETTINGS }))
      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument())

      await user.click(screen.getByTitle('Settings'))
      expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
      expect(screen.queryByText(/A valid token is required/)).not.toBeInTheDocument()
      expect(settingsPanel().getByRole('button', { name: '×' })).toBeInTheDocument()
    })
  })

  describe('sidebar toggle', () => {
    it('hides and restores the sidebar without losing the selected app', async () => {
      const user = userEvent.setup()
      stubApps(slackInfo)
      const { container } = render(<App />)
      await selectApp(user)
      expect(await screen.findByRole('heading', { level: 2, name: 'Slack' })).toBeInTheDocument()
      expect(container.firstElementChild).not.toHaveClass(COLLAPSED_CLASS)

      await user.click(screen.getByTitle('Hide sidebar'))

      expect(screen.queryByPlaceholderText(SEARCH_PLACEHOLDER)).not.toBeInTheDocument()
      expect(container.firstElementChild).toHaveClass(COLLAPSED_CLASS)
      expect(screen.getByRole('heading', { level: 2, name: 'Slack' })).toBeInTheDocument()

      await user.click(screen.getByTitle('Show sidebar'))

      expect(await screen.findByPlaceholderText(SEARCH_PLACEHOLDER)).toBeInTheDocument()
      expect(container.firstElementChild).not.toHaveClass(COLLAPSED_CLASS)
      expect(screen.getByRole('heading', { level: 2, name: 'Slack' })).toBeInTheDocument()
    })
  })

  describe('selecting an app', () => {
    it('shows the app in the header and preselects the previous and the latest version', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      stubApps(slackInfo)
      render(<App />)

      await selectApp(user)

      const header = (await screen.findByRole('heading', { level: 2, name: 'Slack' })).parentElement
      if (!header) throw new Error('The header has no parent')
      expect(within(header).getByText('slack')).toBeInTheDocument()
      expect(within(header).getByText('v2.1.0')).toBeInTheDocument()
      expect(within(header).getByText('Chat')).toBeInTheDocument()
      expect(screen.getByLabelText('From')).toHaveValue('2.0.0')
      expect(screen.getByLabelText('To')).toHaveValue('2.1.0')
      expect(screen.getByText(HINT)).toBeInTheDocument()
      expect(api.ipm.getAppIcon).toHaveBeenCalledWith('slack')
    })

    it('preselects only the To version for an app with a single version', async () => {
      const user = userEvent.setup()
      stubApps({ ...slackInfo, version: '1.0.0', versions: ['1.0.0'] })
      render(<App />)

      await selectApp(user)

      expect(await screen.findByLabelText('To')).toHaveValue('1.0.0')
      expect(screen.getByLabelText('From')).toHaveValue('')
      expect(screen.getByRole('button', { name: 'Compare' })).toBeDisabled()
    })

    it('leaves both versions empty for an app without versions', async () => {
      const user = userEvent.setup()
      stubApps({ ...slackInfo, version: '', versions: [] })
      render(<App />)

      await selectApp(user)

      expect(await screen.findByLabelText('To')).toHaveValue('')
      expect(screen.getByLabelText('From')).toHaveValue('')
      expect(screen.getByRole('button', { name: 'Compare' })).toBeDisabled()
      expect(screen.getByTitle(SWAP_TITLE)).toBeDisabled()
    })

    it('shows the fetched icon in the header and in the sidebar card', async () => {
      const user = userEvent.setup()
      stubApps(slackInfo)
      mockApi().ipm.getAppIcon.mockResolvedValue(ok(ICON))
      render(<App />)

      await selectApp(user)

      const icons = await screen.findAllByAltText('Slack')
      expect(icons.map((icon) => icon.getAttribute('src'))).toEqual([ICON, ICON])
      expect(screen.queryByText('S')).not.toBeInTheDocument()
    })

    it('shows the initial letter while no icon is available', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      stubApps(slackInfo)
      render(<App />)

      await selectApp(user)
      await waitFor(() => expect(api.ipm.getAppIcon).toHaveBeenCalledWith('slack'))

      expect(screen.getAllByText('S')).toHaveLength(2)
      expect(screen.queryByAltText('Slack')).not.toBeInTheDocument()
    })

    it('logs a failed icon fetch and keeps the initial letter', async () => {
      const user = userEvent.setup()
      const consoleError = vi.spyOn(console, 'error').mockReturnValue(undefined)
      const failure = new Error('Icon service is down')
      stubApps(slackInfo)
      mockApi().ipm.getAppIcon.mockRejectedValue(failure)
      render(<App />)

      await selectApp(user)

      await waitFor(() => expect(consoleError).toHaveBeenCalledWith('Failed to load app icon', failure))
      expect(screen.getAllByText('S')).toHaveLength(2)
    })

    it('falls back to the app name and its initial when the app has no label', async () => {
      const user = userEvent.setup()
      stubApps({ ...slackInfo, name: 'my-app', label: '', version: '1.0.0', versions: ['1.0.0'], description: '' })
      render(<App />)

      await selectApp(user, 'my-app')

      expect(await screen.findByRole('heading', { level: 2, name: 'my-app' })).toBeInTheDocument()
      expect(screen.getAllByText('M')).toHaveLength(2)
    })

    it('labels the icon with the app name when the app has no label', async () => {
      const user = userEvent.setup()
      stubApps({ ...slackInfo, name: 'my-app', label: '', version: '1.0.0', versions: ['1.0.0'] })
      mockApi().ipm.getAppIcon.mockResolvedValue(ok(ICON))
      render(<App />)

      await selectApp(user, 'my-app')

      expect(await screen.findAllByAltText('my-app')).toHaveLength(2)
    })

    it('clears the previous diff when another app is selected', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      stubApps(slackInfo, gmailInfo)
      api.ipm.getDiff.mockResolvedValue(ok(diffResult))
      render(<App />)
      await selectApp(user)
      await compare(user)
      expect(await screen.findByText(CHANGED_FILES)).toBeInTheDocument()

      await selectApp(user, 'gmail')

      expect(await screen.findByRole('heading', { level: 2, name: 'Gmail' })).toBeInTheDocument()
      expect(screen.queryByText(CHANGED_FILES)).not.toBeInTheDocument()
      expect(screen.getByText(HINT)).toBeInTheDocument()
      expect(screen.getByLabelText('From')).toHaveValue('1.0.0')
      expect(screen.getByLabelText('To')).toHaveValue('1.1.0')
      expect(api.ipm.getAppIcon).toHaveBeenLastCalledWith('gmail')
    })

    it('clears a previous error when another app is selected', async () => {
      const user = userEvent.setup()
      stubApps(slackInfo, gmailInfo)
      mockApi().ipm.getDiff.mockResolvedValue(fail('Boom'))
      render(<App />)
      await selectApp(user)
      await compare(user)
      expect(await screen.findByText('Boom')).toBeInTheDocument()

      await selectApp(user, 'gmail')

      expect(await screen.findByRole('heading', { level: 2, name: 'Gmail' })).toBeInTheDocument()
      expect(screen.queryByText('Boom')).not.toBeInTheDocument()
      expect(screen.getByText(HINT)).toBeInTheDocument()
    })

    it('returns to the SDK view when another app is selected', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      stubApps(slackInfo, gmailInfo)
      api.ipm.showVersion.mockResolvedValue(ok({ ...diffResult, isCustomApp: true }))
      render(<App />)
      await selectApp(user)
      await showFromDownload(user, '2.1.0')
      await user.click(await screen.findByTitle(RAW_TOGGLE))
      expect(api.ipm.showVersion).toHaveBeenLastCalledWith('slack', '2.1.0', false)
      expect(await screen.findByTitle(SDK_TOGGLE)).toBeInTheDocument()

      await selectApp(user, 'gmail')
      await user.selectOptions(await screen.findByLabelText('Download'), '1.0.0')
      await user.click(screen.getByRole('button', { name: 'Show' }))

      expect(api.ipm.showVersion).toHaveBeenLastCalledWith('gmail', '1.0.0', true)
    })
  })

  describe('favorites and recents', () => {
    it('opens a favorite in the main view and records it as recent', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      stubApps(slackInfo)
      api.favorites.load.mockResolvedValue(ok([{ name: 'slack', label: 'Slack', major: 2, addedAt: 1 }]))
      api.ipm.getDiff.mockResolvedValue(ok(diffResult))
      render(<App />)
      await screen.findByPlaceholderText(SEARCH_PLACEHOLDER)

      await user.click(await screen.findByText('slack · v2'))

      expect(await screen.findByRole('heading', { level: 2, name: 'Slack' })).toBeInTheDocument()
      expect(api.ipm.getAppInfo).toHaveBeenCalledWith('slack', '2.1.0')
      expect(api.recent.add).toHaveBeenCalledWith('slack', 'Slack', 2)
      await compare(user)
      expect(api.ipm.getDiff).toHaveBeenCalledWith('slack', '2.0.0', '2.1.0', true)
    })

    it('opens a recent app of an older major and compares the two latest versions of that major', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      stubApps(slackTwoMajors)
      api.recent.load.mockResolvedValue(ok([{ name: 'slack', label: 'Slack', major: 1, lastViewed: 1 }]))
      api.ipm.getDiff.mockResolvedValue(ok(diffResult))
      render(<App />)
      await screen.findByPlaceholderText(SEARCH_PLACEHOLDER)

      await user.click(await screen.findByText('slack · v1'))

      expect(await screen.findByLabelText('From')).toHaveValue('1.2.0')
      expect(screen.getByLabelText('To')).toHaveValue('1.3.0')
      expect(api.ipm.getAppInfo).toHaveBeenCalledWith('slack', '1.3.0')
      expect(api.recent.add).toHaveBeenCalledWith('slack', 'Slack', 1)
      await compare(user)
      expect(api.ipm.getDiff).toHaveBeenCalledWith('slack', '1.2.0', '1.3.0', true)
    })

    it('stores a newly starred app as a favorite', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      stubApps(slackInfo)
      render(<App />)
      await selectApp(user)

      await user.click(await screen.findByTitle('Add to favorites'))

      expect(api.favorites.save).toHaveBeenCalledWith([
        { name: 'slack', label: 'Slack', major: 2, addedAt: expect.any(Number) }
      ])
      expect(screen.getByTitle('Remove from favorites')).toBeInTheDocument()
    })
  })

  describe('choosing versions', () => {
    it('compares the versions picked in the From and To dropdowns', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      stubApps(slackThreeVersions)
      api.ipm.getDiff.mockResolvedValue(ok(diffResult))
      render(<App />)
      await selectApp(user)
      expect(await screen.findByLabelText('From')).toHaveValue('2.1.0')
      expect(screen.getByLabelText('To')).toHaveValue('2.2.0')

      await user.selectOptions(screen.getByLabelText('From'), '2.0.0')
      await user.selectOptions(screen.getByLabelText('To'), '2.1.0')
      await compare(user)

      expect(api.ipm.getDiff).toHaveBeenCalledWith('slack', '2.0.0', '2.1.0', true)
      expect(await screen.findByText('2.0.0 → 2.1.0')).toBeInTheDocument()
    })

    it('swaps the versions before comparing', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      stubApps(slackInfo)
      api.ipm.getDiff.mockResolvedValue(ok(diffResult))
      render(<App />)
      await selectApp(user)

      await user.click(await screen.findByTitle(SWAP_TITLE))
      expect(screen.getByLabelText('From')).toHaveValue('2.1.0')
      expect(screen.getByLabelText('To')).toHaveValue('2.0.0')
      await compare(user)

      expect(api.ipm.getDiff).toHaveBeenCalledWith('slack', '2.1.0', '2.0.0', true)
      expect(await screen.findByText('2.1.0 → 2.0.0')).toBeInTheDocument()
    })

    it('compares with Cmd+Enter only while two different versions are selected', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      stubApps(slackInfo)
      api.ipm.getDiff.mockResolvedValue(ok(diffResult))
      render(<App />)
      await selectApp(user)
      await user.selectOptions(await screen.findByLabelText('From'), NO_VERSION)

      await user.keyboard('{Meta>}{Enter}{/Meta}')
      expect(api.ipm.getDiff).not.toHaveBeenCalled()

      await user.selectOptions(screen.getByLabelText('From'), '2.0.0')
      await user.keyboard('{Meta>}{Enter}{/Meta}')

      expect(api.ipm.getDiff).toHaveBeenCalledOnce()
      expect(api.ipm.getDiff).toHaveBeenCalledWith('slack', '2.0.0', '2.1.0', true)
      expect(await screen.findByText(CHANGED_FILES)).toBeInTheDocument()
    })

    it('compares with the raw view when the SDK view was switched off', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      stubApps(slackInfo)
      api.ipm.showVersion.mockResolvedValue(ok({ ...diffResult, isCustomApp: true }))
      api.ipm.getDiff.mockResolvedValue(ok(diffResult))
      render(<App />)
      await selectApp(user)
      await showFromDownload(user, '2.1.0')
      await user.click(await screen.findByTitle(RAW_TOGGLE))

      await compare(user)

      expect(api.ipm.getDiff).toHaveBeenCalledWith('slack', '2.0.0', '2.1.0', false)
      expect(await screen.findByText(CHANGED_FILES)).toBeInTheDocument()
    })
  })

  describe('loading and stale responses', () => {
    it('shows the loading state while comparing and swaps it for the result', async () => {
      const user = userEvent.setup()
      const pending = await renderPendingCompare(user)

      expect(screen.getByRole('button', { name: 'Comparing...' })).toBeDisabled()
      expect(screen.queryByText(HINT)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^App/ })).not.toBeInTheDocument()

      await act(async () => pending.resolve(ok(diffResult)))

      expect(await screen.findByText(CHANGED_FILES)).toBeInTheDocument()
      expect(screen.queryByText(LOADING)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Compare' })).toBeEnabled()
    })

    it('shows the loading state while a version is being shown', async () => {
      const user = userEvent.setup()
      const pending = await renderPendingShow(user)

      expect(screen.getByRole('button', { name: 'Show' })).toBeDisabled()
      expect(screen.queryByText(HINT)).not.toBeInTheDocument()

      await act(async () => pending.resolve(ok(diffResult)))

      expect(await screen.findByText('Files (1)')).toBeInTheDocument()
      expect(screen.queryByText(LOADING)).not.toBeInTheDocument()
    })

    it('drops a compare result that arrives after the versions were swapped', async () => {
      const user = userEvent.setup()
      const pending = await renderPendingCompare(user)

      await user.click(screen.getByTitle(SWAP_TITLE))
      expect(screen.queryByText(LOADING)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Compare' })).toBeEnabled()

      await act(async () => pending.resolve(ok(diffResult)))

      expect(screen.queryByText(CHANGED_FILES)).not.toBeInTheDocument()
      expect(screen.getByText(HINT)).toBeInTheDocument()
    })

    it('drops a compare failure that arrives after the From version changed', async () => {
      const user = userEvent.setup()
      const pending = await renderPendingCompare(user)

      await user.selectOptions(screen.getByLabelText('From'), NO_VERSION)
      expect(screen.queryByText(LOADING)).not.toBeInTheDocument()

      await act(async () => pending.reject(new Error(LATE_FAILURE)))

      expect(screen.queryByText(LATE_FAILURE)).not.toBeInTheDocument()
      expect(screen.getByText(HINT)).toBeInTheDocument()
    })

    it('drops a show result that arrives after the To version changed', async () => {
      const user = userEvent.setup()
      const pending = await renderPendingShow(user)

      await user.selectOptions(screen.getByLabelText('To'), NO_VERSION)
      expect(screen.queryByText(LOADING)).not.toBeInTheDocument()

      await act(async () => pending.resolve(ok(diffResult)))

      expect(screen.queryByText('Files (1)')).not.toBeInTheDocument()
      expect(screen.getByText(HINT)).toBeInTheDocument()
    })

    const overlappingRequests: {
      title: string
      arrange: (older: DiffPromise, newer: DiffPromise) => void
      start: (user: UserEvent) => Promise<void>
    }[] = [
      {
        title: 'compare',
        arrange: (older, newer) => {
          mockApi().ipm.getDiff.mockReturnValueOnce(older).mockReturnValueOnce(newer)
        },
        start: compare
      },
      {
        title: 'shown version',
        arrange: (older, newer) => {
          mockApi().ipm.showVersion.mockReturnValue(older)
          mockApi().ipm.getDiff.mockReturnValue(newer)
        },
        start: (user) => showFromDownload(user, '2.2.0')
      }
    ]

    it.each(overlappingRequests)(
      'keeps the loading state of a newer compare while an older $title settles',
      async ({ arrange, start }) => {
        const user = userEvent.setup()
        const older = deferred<IpcResult<DiffResult>>()
        const newer = deferred<IpcResult<DiffResult>>()
        stubApps(slackThreeVersions)
        arrange(older.promise, newer.promise)
        render(<App />)
        await selectApp(user)
        await start(user)
        expect(await screen.findByText(LOADING)).toBeInTheDocument()

        await user.selectOptions(screen.getByLabelText('From'), '2.0.0')
        await compare(user)
        expect(await screen.findByText(LOADING)).toBeInTheDocument()

        await act(async () => older.resolve(ok(diffResult)))

        expect(screen.getByText(LOADING)).toBeInTheDocument()

        await act(async () => newer.resolve(ok(tabbedDiff)))

        expect(await screen.findByText(CHANGED_FILES)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^Webhook/ })).toHaveTextContent(/^Webhook\+1~1$/)
        expect(screen.queryByText(LOADING)).not.toBeInTheDocument()
      }
    )

    it('drops a show failure that arrives after another app was selected', async () => {
      const user = userEvent.setup()
      const pending = await renderPendingShow(user)

      await selectApp(user, 'gmail')
      expect(await screen.findByRole('heading', { level: 2, name: 'Gmail' })).toBeInTheDocument()
      expect(screen.queryByText(LOADING)).not.toBeInTheDocument()

      await act(async () => pending.reject(new Error(LATE_FAILURE)))

      expect(screen.queryByText(LATE_FAILURE)).not.toBeInTheDocument()
      expect(screen.getByText(HINT)).toBeInTheDocument()
    })
  })

  describe('compare failures', () => {
    it.each([
      {
        title: NO_ERROR_TITLE,
        arrange: () => mockApi().ipm.getDiff.mockResolvedValue({ success: false }),
        message: 'Compare failed'
      },
      {
        title: 'a successful result without data',
        arrange: () => mockApi().ipm.getDiff.mockResolvedValue({ success: true }),
        message: 'Compare failed'
      },
      {
        title: REJECTED_ERROR_TITLE,
        arrange: () => mockApi().ipm.getDiff.mockRejectedValue(new Error(NETWORK_DOWN)),
        message: NETWORK_DOWN
      },
      {
        title: REJECTED_VALUE_TITLE,
        arrange: () => mockApi().ipm.getDiff.mockRejectedValue(HANG_UP),
        message: HANG_UP
      }
    ])('shows the message for $title', async ({ arrange, message }) => {
      const user = userEvent.setup()
      stubApps(slackInfo)
      arrange()
      render(<App />)
      await selectApp(user)

      await compare(user)

      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
      expect(screen.queryByText(HINT)).not.toBeInTheDocument()
      expect(screen.queryByText(LOADING)).not.toBeInTheDocument()
    })
  })

  describe('retrying with a cleared version', () => {
    it('ignores Retry and keeps the error while a version is cleared', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      stubApps(slackInfo)
      api.ipm.getDiff.mockResolvedValue(fail('Boom'))
      render(<App />)
      await selectApp(user)
      await compare(user)
      expect(await screen.findByText('Boom')).toBeInTheDocument()

      await user.selectOptions(screen.getByLabelText('From'), NO_VERSION)
      await user.click(screen.getByRole('button', { name: 'Retry' }))

      expect(api.ipm.getDiff).toHaveBeenCalledOnce()
      expect(screen.getByText('Boom')).toBeInTheDocument()
      expect(screen.queryByText(LOADING)).not.toBeInTheDocument()
    })
  })

  describe('show failures', () => {
    it.each([
      {
        title: 'the error of the result',
        arrange: () => mockApi().ipm.showVersion.mockResolvedValue(fail(NOT_FOUND)),
        message: NOT_FOUND
      },
      {
        title: NO_ERROR_TITLE,
        arrange: () => mockApi().ipm.showVersion.mockResolvedValue({ success: false }),
        message: 'Show failed'
      },
      {
        title: 'a successful result without data',
        arrange: () => mockApi().ipm.showVersion.mockResolvedValue({ success: true }),
        message: 'Show failed'
      },
      {
        title: REJECTED_ERROR_TITLE,
        arrange: () => mockApi().ipm.showVersion.mockRejectedValue(new Error(NETWORK_DOWN)),
        message: NETWORK_DOWN
      },
      {
        title: REJECTED_VALUE_TITLE,
        arrange: () => mockApi().ipm.showVersion.mockRejectedValue(HANG_UP),
        message: HANG_UP
      }
    ])('shows the message for $title', async ({ arrange, message }) => {
      const user = userEvent.setup()
      stubApps(slackInfo)
      arrange()
      render(<App />)
      await selectApp(user)

      await showFromDownload(user, '2.1.0')

      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
      expect(screen.queryByText(LOADING)).not.toBeInTheDocument()
    })

    it('retries a failed Show with the same version instead of comparing', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      stubApps(slackInfo)
      api.ipm.showVersion.mockResolvedValueOnce(fail(NOT_FOUND)).mockResolvedValueOnce(ok(diffResult))
      render(<App />)
      await selectApp(user)
      await showFromDownload(user, '2.1.0')
      expect(await screen.findByText(NOT_FOUND)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Retry' }))

      expect(await screen.findByText('Files (1)')).toBeInTheDocument()
      expect(screen.queryByText(NOT_FOUND)).not.toBeInTheDocument()
      expect(api.ipm.showVersion).toHaveBeenNthCalledWith(2, 'slack', '2.1.0', true)
      expect(api.ipm.getDiff).not.toHaveBeenCalled()
    })
  })

  describe('diff tabs', () => {
    it('sorts the changed files into the App, Connection and Webhook tabs with their change counts', async () => {
      const user = userEvent.setup()
      stubApps(slackInfo)
      mockApi().ipm.getDiff.mockResolvedValue(ok(tabbedDiff))
      render(<App />)
      await selectApp(user)
      await compare(user)

      expect(await screen.findByText(CHANGED_FILES)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^App/ })).toHaveTextContent(/^App~1$/)
      expect(screen.getByRole('button', { name: /^Connection/ })).toHaveTextContent(/^Connection\+1-1$/)
      expect(screen.getByRole('button', { name: /^Webhook/ })).toHaveTextContent(/^Webhook\+1~1$/)
      expect(screen.getByRole('button', { name: /^App/ })).toHaveClass('active')
      expect(screen.getByText('modules')).toBeInTheDocument()
      expect(screen.queryByText(CONNECTIONS_DIR)).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /^Connection/ }))
      expect(screen.getByText('Changed files (2)')).toBeInTheDocument()
      expect(screen.getByText('accounts')).toBeInTheDocument()
      expect(screen.getByText(CONNECTIONS_DIR)).toBeInTheDocument()
      expect(screen.queryByText('modules')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Connection/ })).toHaveClass('active')

      await user.click(screen.getByRole('button', { name: /^Webhook/ }))
      expect(screen.getByText('Changed files (2)')).toBeInTheDocument()
      expect(screen.getByText('hooks')).toBeInTheDocument()
      expect(screen.getByText('webhooks')).toBeInTheDocument()
      expect(screen.queryByText('accounts')).not.toBeInTheDocument()
    })

    it('opens the selected file in the diff editor and forgets it when the tab changes', async () => {
      const user = userEvent.setup()
      stubApps(slackInfo)
      mockApi().ipm.getDiff.mockResolvedValue(ok(tabbedDiff))
      render(<App />)
      await selectApp(user)
      await compare(user)
      expect(await screen.findByText(NO_FILE)).toBeInTheDocument()

      await openFile(user, moduleFilePath)

      const editor = screen.getByTestId('diff-editor')
      expect(editor).toHaveAttribute('data-original', 'a')
      expect(editor).toHaveAttribute('data-modified', 'b')
      expect(editor).toHaveAttribute('data-language', 'imljson')
      expect(screen.queryByText(NO_FILE)).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /^Connection/ }))
      await user.click(screen.getByRole('button', { name: /^App/ }))

      expect(screen.getByText(NO_FILE)).toBeInTheDocument()
      expect(screen.queryByTestId('diff-editor')).not.toBeInTheDocument()
    })

    it('shows that a tab has no changes', async () => {
      const user = userEvent.setup()
      stubApps(slackInfo)
      mockApi().ipm.getDiff.mockResolvedValue(ok(diffResult))
      render(<App />)
      await selectApp(user)
      await compare(user)
      expect(await screen.findByText(CHANGED_FILES)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /^Webhook/ }))

      expect(screen.getByText('No changes')).toBeInTheDocument()
      expect(screen.queryByText(/Changed files/)).not.toBeInTheDocument()
      expect(screen.queryByText(NO_FILE)).not.toBeInTheDocument()
    })

    it('offers the SDK toggle and the VS Code export only while a version is shown', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      stubApps(slackInfo)
      api.ipm.getDiff.mockResolvedValue(ok({ ...diffResult, isCustomApp: true }))
      api.ipm.showVersion.mockResolvedValue(ok({ ...diffResult, isCustomApp: true }))
      render(<App />)
      await selectApp(user)
      await compare(user)
      expect(await screen.findByText(CHANGED_FILES)).toBeInTheDocument()

      expect(screen.queryByTitle(RAW_TOGGLE)).not.toBeInTheDocument()
      expect(screen.queryByTitle(VSCODE_TITLE)).not.toBeInTheDocument()

      await showFromDownload(user, '2.1.0')

      expect(await screen.findByTitle(RAW_TOGGLE)).toBeInTheDocument()
      expect(screen.getByTitle(VSCODE_TITLE)).toBeInTheDocument()
    })

    it('offers the VS Code export but no SDK toggle for a version that is not a custom app', async () => {
      const user = userEvent.setup()
      stubApps(slackInfo)
      mockApi().ipm.showVersion.mockResolvedValue(ok(diffResult))
      render(<App />)
      await selectApp(user)

      await showFromDownload(user, '2.1.0')

      expect(await screen.findByTitle(VSCODE_TITLE)).toBeInTheDocument()
      expect(screen.queryByTitle(RAW_TOGGLE)).not.toBeInTheDocument()
      expect(screen.queryByTitle(SDK_TOGGLE)).not.toBeInTheDocument()
    })

    it('shows the content of the selected file while a version is shown', async () => {
      const user = userEvent.setup()
      stubApps(slackInfo)
      mockApi().ipm.showVersion.mockResolvedValue(ok(diffResult))
      render(<App />)
      await selectApp(user)
      await showFromDownload(user, '2.1.0')
      expect(await screen.findByText(NO_FILE)).toBeInTheDocument()

      await openFile(user, moduleFilePath)

      const editor = screen.getByTestId('editor')
      expect(editor).toHaveAttribute('data-value', 'b')
      expect(editor).toHaveAttribute('data-language', 'imljson')
    })
  })

  describe('VS Code export', () => {
    it('exports only the files that have new content', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      stubApps(slackInfo)
      api.ipm.showVersion.mockResolvedValue(
        ok({ ...diffResult, diffs: [diffResult.diffs[0], fileDiff('removed/old.json', 'deleted', 'gone', '')] })
      )
      render(<App />)
      await selectApp(user)
      await showFromDownload(user, '2.1.0')

      await user.click(await screen.findByTitle(VSCODE_TITLE))

      expect(api.editor.openInVscode).toHaveBeenCalledOnce()
      expect(api.editor.openInVscode).toHaveBeenCalledWith({
        appName: 'slack',
        version: '2.1.0',
        files: [{ path: moduleFilePath, content: 'b' }]
      })
      expect(screen.queryByText(VSCODE_FAILURE)).not.toBeInTheDocument()
    })

    it.each([
      {
        title: 'the error of the result',
        arrange: () =>
          mockApi().editor.openInVscode.mockResolvedValue({ success: false, error: 'VS Code is not installed' }),
        toast: 'VS Code is not installed'
      },
      {
        title: NO_ERROR_TITLE,
        arrange: () => mockApi().editor.openInVscode.mockResolvedValue({ success: false }),
        toast: VSCODE_FAILURE
      },
      {
        title: REJECTED_ERROR_TITLE,
        arrange: () => mockApi().editor.openInVscode.mockRejectedValue(new Error('IPC channel closed')),
        toast: 'IPC channel closed'
      },
      {
        title: REJECTED_VALUE_TITLE,
        arrange: () => mockApi().editor.openInVscode.mockRejectedValue('nope'),
        toast: VSCODE_FAILURE
      }
    ])('toasts $title when VS Code cannot be opened', async ({ arrange, toast }) => {
      const user = userEvent.setup()
      stubApps(slackInfo)
      mockApi().ipm.showVersion.mockResolvedValue(ok(diffResult))
      arrange()
      render(<App />)
      await selectApp(user)
      await showFromDownload(user, '2.1.0')

      await user.click(await screen.findByTitle(VSCODE_TITLE))

      expect(await screen.findByText(toast)).toBeInTheDocument()
    })

    it('neither exports nor refetches on an SDK toggle while the To version is empty', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      stubApps(slackInfo)
      api.ipm.showVersion.mockResolvedValue(ok({ ...diffResult, isCustomApp: true }))
      render(<App />)
      await selectApp(user)
      await user.selectOptions(await screen.findByLabelText('To'), NO_VERSION)
      await showFromDownload(user, '2.0.0')
      expect(await screen.findByText('Files (1)')).toBeInTheDocument()

      await user.click(screen.getByTitle(VSCODE_TITLE))
      expect(api.editor.openInVscode).not.toHaveBeenCalled()

      await user.click(screen.getByTitle(RAW_TOGGLE))
      expect(screen.getByTitle(SDK_TOGGLE)).toBeInTheDocument()
      expect(api.ipm.showVersion).toHaveBeenCalledOnce()
    })
  })

  describe('version actions', () => {
    it('copies a shown version as a ZIP for the selected app', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      stubApps(slackInfo)
      api.ipm.showVersion.mockResolvedValue(
        ok({ ...diffResult, diffs: [diffResult.diffs[0], fileDiff('gone.json', 'deleted', 'old', '')] })
      )
      render(<App />)
      await selectApp(user)
      await user.click(await screen.findByTitle(DOWNLOAD_TOGGLE))
      await user.selectOptions(screen.getByLabelText('Download'), '2.0.0')

      await user.click(screen.getByRole('button', { name: 'Copy ZIP' }))

      expect(api.ipm.showVersion).toHaveBeenCalledWith('slack', '2.0.0')
      expect(api.clipboard.copyZip).toHaveBeenCalledWith({
        appName: 'slack',
        version: '2.0.0',
        files: [
          { path: moduleFilePath, content: 'b' },
          { path: 'gone.json', content: 'old' }
        ]
      })
      expect(await screen.findByText('Copied! Cmd+V to paste')).toBeInTheDocument()
    })

    it('toasts a failed ZIP copy', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      stubApps(slackInfo)
      api.ipm.showVersion.mockResolvedValue(ok(diffResult))
      api.clipboard.copyZip.mockResolvedValue(fail('Disk full'))
      render(<App />)
      await selectApp(user)
      await user.click(await screen.findByTitle(DOWNLOAD_TOGGLE))
      await user.selectOptions(screen.getByLabelText('Download'), '2.0.0')

      await user.click(screen.getByRole('button', { name: 'Copy ZIP' }))

      expect(await screen.findByText('Failed: Disk full')).toBeInTheDocument()
      expect(screen.queryByText('Copied! Cmd+V to paste')).not.toBeInTheDocument()
    })

    it('downloads a version and reveals it in the file manager', async () => {
      const user = userEvent.setup()
      const api = mockApi()
      stubApps(slackInfo)
      api.ipm.downloadVersion.mockResolvedValue(ok('/Users/me/Downloads/slack@2.0.0'))
      render(<App />)
      await selectApp(user)
      await user.click(await screen.findByTitle(DOWNLOAD_TOGGLE))
      await user.selectOptions(screen.getByLabelText('Download'), '2.0.0')

      await user.click(screen.getByRole('button', { name: 'Download' }))

      expect(api.ipm.downloadVersion).toHaveBeenCalledWith('slack', '2.0.0')
      expect(await screen.findByText('Download Complete')).toBeInTheDocument()
      expect(screen.getByText('/Users/me/Downloads')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Show in Finder' }))
      expect(api.showInFinder).toHaveBeenCalledWith('/Users/me/Downloads/slack@2.0.0')

      await user.click(screen.getByRole('button', { name: 'OK' }))
      expect(screen.queryByText('Download Complete')).not.toBeInTheDocument()
    })
  })
})
