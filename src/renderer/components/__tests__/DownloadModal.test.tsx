import { describe, it, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import DownloadModal from '../DownloadModal'
import { mockApi, ok, fail } from '../../__tests__/mocks/window-api'
import type { IpcResult, SearchAppResult } from '../../../preload/index'

const TITLE = 'Download App'
const SEARCH_PLACEHOLDER = 'Search by label or name...'
const LOADING_PLACEHOLDER = 'Loading apps...'
const NO_RESULTS = 'No apps found'
const LIST_ERROR = 'Error: Failed to load apps'
const LISTBOX_LABEL = 'Matching apps'
const PICK_VERSION = 'Select version...'
const BUSY_LABEL = 'Downloading...'
const DONE_TITLE = 'Download Complete'
const SHOW_IN_FINDER = 'Show in Finder'
const DISK_FULL = 'Error: Disk full'
const REFINE_HINT = /Showing first 30 results/
const ACTIVE_DESCENDANT = 'aria-activedescendant'
const ARIA_EXPANDED = 'aria-expanded'
const ARIA_CONTROLS = 'aria-controls'
const ARIA_SELECTED = 'aria-selected'
const BACKSPACE = '{Backspace}'
const INVALID_TOKEN_ERROR = 'Error: Invalid token'
const FOLDER_NAME = 'slack@2.1.0'
const ARROW_DOWN = '{ArrowDown}'
const UNIX_PATH = '/Users/me/Downloads/slack@2.1.0'
const WINDOWS_PATH = 'C:\\Users\\me\\Downloads\\slack@2.1.0'
const ZOOM_ENTRIES = ['Zoom (v3)', 'Zoom (v2)', 'Zoom (v1)']

const slack: SearchAppResult = {
  name: 'slack',
  label: 'Slack',
  theme: '#4a154b',
  version: '2.1.0',
  availableVersions: ['2.1.0', '2.0.0', '1.3.0']
}

const gmail: SearchAppResult = {
  name: 'gmail',
  label: 'Gmail',
  theme: '#ea4335',
  version: '1.0.0',
  availableVersions: ['1.0.0']
}

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
  availableVersions: ['1.0.0', '3.0.0', '3.1.0', '2.0.0']
}

const banana: SearchAppResult = {
  name: 'banana',
  label: 'BANana',
  theme: '#000',
  version: '1.0.0',
  availableVersions: ['1.0.0']
}

const legacy: SearchAppResult = {
  name: 'legacy',
  label: 'Legacy',
  theme: '#000',
  version: '2.0.0',
  availableVersions: ['1.0.0', '1.1.0']
}

const unpublished: SearchAppResult = {
  name: 'unpublished',
  label: 'Unpublished',
  theme: '#000',
  version: '1.0.0',
  availableVersions: []
}

const apps = [slack, gmail]

const bulkApps = (count: number, versions: string[] = ['1.0.0']): SearchAppResult[] =>
  Array.from({ length: count }, (_, i) => ({
    name: `bulk-${i}`,
    label: `Bulk ${String(i).padStart(2, '0')}`,
    theme: '#000',
    version: versions[0],
    availableVersions: versions
  }))

type AppList = IpcResult<SearchAppResult[]>
type DownloadResult = IpcResult<string>

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const searchBox = () => screen.getByRole('combobox', { name: 'Search App' })
const versionSelect = () => screen.getByRole('combobox', { name: 'Version' })
const versionOptions = () =>
  within(versionSelect())
    .getAllByRole('option')
    .map((option) => option.textContent)
const downloadButton = () => screen.getByRole('button', { name: 'Download' })
const closeButton = () => screen.getByRole('button', { name: '×' })
const okButton = () => screen.getByRole('button', { name: 'OK' })
const marks = () => screen.queryAllByRole('mark').map((mark) => mark.textContent)
const highlighted = () => screen.getByRole('option', { selected: true })
const scrollIntoView = () => vi.mocked(Element.prototype.scrollIntoView)
const lastScrolled = () => {
  const { contexts } = scrollIntoView().mock
  return contexts[contexts.length - 1]
}
const overlay = () => document.querySelector('.settings-overlay') as HTMLElement
const successDetails = () => ({
  folder: document.querySelector('.download-success-folder')?.textContent,
  parent: document.querySelector('.download-success-path')?.textContent
})

function expectNoHighlight() {
  const options = screen.getAllByRole('option')
  expect(options.map((option) => option.getAttribute(ARIA_SELECTED))).toEqual(options.map(() => 'false'))
  expect(options.map((option) => option.classList.contains('highlighted'))).toEqual(options.map(() => false))
  expect(searchBox()).not.toHaveAttribute(ACTIVE_DESCENDANT)
}

function expectHighlight(index: number) {
  const options = screen.getAllByRole('option')
  const expected = options.map((_, i) => i === index)
  expect(options.map((option) => option.getAttribute(ARIA_SELECTED) === 'true')).toEqual(expected)
  expect(options.map((option) => option.getAttribute(ARIA_SELECTED))).not.toContain(null)
  expect(options.map((option) => option.classList.contains('highlighted'))).toEqual(expected)
  expect(searchBox()).toHaveAttribute(ACTIVE_DESCENDANT, options[index].id)
}

function mountModal() {
  const user = userEvent.setup()
  const onClose = vi.fn()
  const view = render(<DownloadModal onClose={onClose} />)
  return { user, api: mockApi(), onClose, ...view }
}

async function renderModal(list: SearchAppResult[] = apps) {
  mockApi().ipm.searchApps.mockResolvedValue(ok(list))
  const context = mountModal()
  await waitFor(() => expect(searchBox()).toBeEnabled())
  return context
}

async function selectApp(user: UserEvent, query: string, index = 0) {
  await user.clear(searchBox())
  await user.type(searchBox(), query)
  await user.click(screen.getAllByRole('option')[index])
}

async function renderReady(list: SearchAppResult[] = apps) {
  const context = await renderModal(list)
  await selectApp(context.user, 'gmail')
  await context.user.selectOptions(versionSelect(), 'v1.0.0')
  return context
}

const clickTitle = (user: UserEvent) => user.click(screen.getByRole('heading', { name: TITLE }))

const closers: { name: string; close: (user: UserEvent) => Promise<void> }[] = [
  { name: 'Escape', close: (user) => user.keyboard('{Escape}') },
  { name: 'the close button', close: (user) => user.click(closeButton()) },
  { name: 'a click on the backdrop', close: (user) => user.click(overlay()) }
]

const successClosers = [
  ...closers,
  { name: 'Enter', close: (user: UserEvent) => user.keyboard('{Enter}') },
  { name: 'the OK button', close: (user: UserEvent) => user.click(okButton()) }
]

describe('DownloadModal opening', () => {
  it('shows the title, an empty collapsed search box and a disabled Download button', async () => {
    await renderModal()

    expect(screen.getByRole('heading', { level: 2, name: TITLE })).toBeInTheDocument()
    expect(searchBox()).toHaveValue('')
    expect(searchBox()).toHaveAttribute('placeholder', SEARCH_PLACEHOLDER)
    expect(searchBox()).toHaveAttribute('aria-autocomplete', 'list')
    expect(searchBox()).toHaveAttribute(ARIA_EXPANDED, 'false')
    expect(searchBox()).not.toHaveAttribute(ARIA_CONTROLS)
    expect(searchBox()).not.toHaveAttribute(ACTIVE_DESCENDANT)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Version' })).not.toBeInTheDocument()
    expect(downloadButton()).toBeDisabled()
  })

  it('locks the search box with a loading placeholder until the app list arrives', async () => {
    const list = deferred<AppList>()
    mockApi().ipm.searchApps.mockReturnValue(list.promise)
    mountModal()

    expect(screen.getByPlaceholderText(LOADING_PLACEHOLDER)).toBeDisabled()
    expect(downloadButton()).toBeDisabled()

    await act(async () => {
      list.resolve(ok(apps))
    })

    expect(screen.getByPlaceholderText(SEARCH_PLACEHOLDER)).toBeEnabled()
    expect(mockApi().ipm.searchApps).toHaveBeenCalledOnce()
  })

  it('focuses the search box as soon as it opens and keeps the focus once the apps have loaded', async () => {
    const list = deferred<AppList>()
    mockApi().ipm.searchApps.mockReturnValue(list.promise)
    mountModal()

    expect(searchBox()).toBeDisabled()
    expect(searchBox()).toHaveFocus()

    await act(async () => {
      list.resolve(ok(apps))
    })

    expect(searchBox()).toBeEnabled()
    expect(searchBox()).toHaveFocus()
  })

  it('treats an empty app list as loaded', async () => {
    const { user } = await renderModal([])

    expect(screen.queryByText(/^Error/)).not.toBeInTheDocument()

    await user.type(searchBox(), 'x')
    expect(screen.getByText(NO_RESULTS)).toBeInTheDocument()
  })

  const noReason: AppList = { success: false }
  const noReasonEmpty: AppList = { success: false, error: '' }
  const noData: AppList = { success: true }

  test.each([
    { reason: 'a failure with a reason', result: fail('Invalid token'), message: INVALID_TOKEN_ERROR },
    { reason: 'a failure without a reason', result: noReason, message: LIST_ERROR },
    { reason: 'a failure with an empty reason', result: noReasonEmpty, message: LIST_ERROR },
    { reason: 'a success without data', result: noData, message: LIST_ERROR }
  ])('shows "$message" for $reason and unlocks the search', async ({ result, message }) => {
    mockApi().ipm.searchApps.mockResolvedValue(result)
    mountModal()

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(SEARCH_PLACEHOLDER)).toBeEnabled()
    expect(downloadButton()).toBeDisabled()
  })

  test.each([
    { rejection: new Error('Network down'), message: 'Error: Network down' },
    { rejection: 'offline', message: 'Error: offline' }
  ])('shows "$message" when the app list request rejects', async ({ rejection, message }) => {
    mockApi().ipm.searchApps.mockRejectedValue(rejection)
    mountModal()

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(SEARCH_PLACEHOLDER)).toBeEnabled()
  })

  it('has nothing to search after a failed load and keeps the error visible', async () => {
    mockApi().ipm.searchApps.mockResolvedValue(fail('Invalid token'))
    const { user } = mountModal()
    await screen.findByText(INVALID_TOKEN_ERROR)

    await user.type(searchBox(), 'slack')

    expect(screen.getByText(NO_RESULTS)).toBeInTheDocument()
    expect(screen.getByText(INVALID_TOKEN_ERROR)).toBeInTheDocument()
  })
})

describe('DownloadModal search results', () => {
  it('matches the label or the name, ignoring case and surrounding spaces', async () => {
    const { user } = await renderModal([...apps, teams])

    await user.type(searchBox(), '  MICROSOFT ')
    expect(screen.getByRole('option')).toHaveTextContent(teams.label)

    await user.clear(searchBox())
    await user.type(searchBox(), 'ms-te')
    expect(screen.getByRole('option')).toHaveTextContent(teams.label)
  })

  it('wires the combobox to the listbox and gives every option its own id', async () => {
    const { user } = await renderModal()

    await user.type(searchBox(), 'slack')

    const listbox = screen.getByRole('listbox', { name: LISTBOX_LABEL })
    const options = within(listbox).getAllByRole('option')
    const ids = options.map((option) => option.id)
    expect(searchBox()).toHaveAttribute(ARIA_EXPANDED, 'true')
    expect(searchBox()).toHaveAttribute(ARIA_CONTROLS, listbox.id)
    expect(options).toHaveLength(2)
    expect(ids).not.toContain('')
    expect(new Set(ids).size).toBe(options.length)
    expectNoHighlight()
  })

  it('collapses when nothing matches and when the query is cleared', async () => {
    const { user } = await renderModal()

    await user.type(searchBox(), 'zzz')
    expect(screen.getByText(NO_RESULTS)).toBeInTheDocument()
    expect(searchBox()).toHaveAttribute(ARIA_EXPANDED, 'false')
    expect(searchBox()).not.toHaveAttribute(ARIA_CONTROLS)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await user.clear(searchBox())
    expect(screen.queryByText(NO_RESULTS)).not.toBeInTheDocument()

    await user.type(searchBox(), 'slack')
    expect(searchBox()).toHaveAttribute(ARIA_EXPANDED, 'true')
    await user.clear(searchBox())
    expect(searchBox()).toHaveAttribute(ARIA_EXPANDED, 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('treats a blank query as no search', async () => {
    const { user } = await renderModal()

    await user.type(searchBox(), '   ')

    expect(searchBox()).toHaveValue('   ')
    expect(searchBox()).toHaveAttribute(ARIA_EXPANDED, 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.queryByText(NO_RESULTS)).not.toBeInTheDocument()
  })

  it('lists a single-major app once without a version suffix and keeps the order of the list', async () => {
    const { user } = await renderModal([slack, gmail, teams])

    await user.type(searchBox(), 'm')

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveTextContent('Gmail')
    expect(options[0]).toHaveTextContent('gmail · 1 versions')
    expect(options[0]).not.toHaveTextContent('(v')
    expect(options[1]).toHaveTextContent(teams.label)
    expect(options[1]).toHaveTextContent('ms-teams · 2 versions')
    expect(options[1]).not.toHaveTextContent('(v')
  })

  it('lists every major of a multi-major app from the newest to the oldest', async () => {
    const { user } = await renderModal([slack, zoom])

    await user.type(searchBox(), 'zoom')

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)
    expect(options[0]).toHaveTextContent('Zoom (v3)')
    expect(options[0]).toHaveTextContent('zoom · 2 versions')
    expect(options[1]).toHaveTextContent('Zoom (v2)')
    expect(options[1]).toHaveTextContent('zoom · 1 versions')
    expect(options[2]).toHaveTextContent('Zoom (v1)')
    expect(options[2]).toHaveTextContent('zoom · 1 versions')
  })

  it('lists the entries of each matching app one after the other in the order of the list', async () => {
    const { user } = await renderModal([zoom, gmail, teams])

    await user.type(searchBox(), 'm')

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(5)
    expect(options[0]).toHaveTextContent('Zoom (v3)')
    expect(options[1]).toHaveTextContent('Zoom (v2)')
    expect(options[2]).toHaveTextContent('Zoom (v1)')
    expect(options[3]).toHaveTextContent('Gmail')
    expect(options[4]).toHaveTextContent(teams.label)
  })

  it('renders the entries of a multi-major app without duplicate keys', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockReturnValue(undefined)
    const { user } = await renderModal([zoom])

    await user.type(searchBox(), `zoom${ARROW_DOWN}`)

    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('labels a single-group app with the major of its latest version', async () => {
    const { user } = await renderModal([legacy])

    await user.type(searchBox(), 'legacy')

    expect(screen.getByRole('option')).toHaveTextContent('Legacy (v2)')
    expect(screen.getByRole('option')).toHaveTextContent('legacy · 2 versions')
  })

  it('lists an app that has no published versions with zero versions', async () => {
    const { user } = await renderModal([unpublished])

    await user.type(searchBox(), 'unpub')

    expect(screen.getByRole('option')).toHaveTextContent('unpublished · 0 versions')
    expect(screen.getByRole('option')).not.toHaveTextContent('(v')
  })

  test.each([
    { count: 29, shown: 29, hint: 0 },
    { count: 30, shown: 30, hint: 1 },
    { count: 35, shown: 30, hint: 1 }
  ])('lists at most 30 of $count matches and shows the refine hint from 30 on', async ({ count, shown, hint }) => {
    const { user } = await renderModal(bulkApps(count))

    await user.type(searchBox(), 'bulk')

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(shown)
    expect(options[0]).toHaveTextContent('Bulk 00')
    expect(options[shown - 1]).toHaveTextContent(`Bulk ${shown - 1}`)
    expect(screen.queryAllByText(REFINE_HINT)).toHaveLength(hint)
    expect(screen.queryByText(NO_RESULTS)).not.toBeInTheDocument()
  })

  it('counts the 30 entries, not the apps, so a multi-major app can be cut in half', async () => {
    const { user } = await renderModal(bulkApps(16, ['2.0.0', '1.0.0']))

    await user.type(searchBox(), 'bulk')

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(30)
    expect(options[0]).toHaveTextContent('Bulk 00 (v2)')
    expect(options[1]).toHaveTextContent('Bulk 00 (v1)')
    expect(options[29]).toHaveTextContent('Bulk 14 (v1)')
    expect(screen.queryByRole('option', { name: /Bulk 15/ })).not.toBeInTheDocument()
    expect(screen.getByText(REFINE_HINT)).toBeInTheDocument()
  })

  it('marks the matched text in the label and the name with the casing of the result', async () => {
    const { user } = await renderModal()

    await user.type(searchBox(), 'GMA')

    expect(marks()).toEqual(['Gma', 'gma'])
  })

  it('marks only the name when the label does not contain the query', async () => {
    const { user } = await renderModal([teams])

    await user.type(searchBox(), 'ms-te')

    expect(marks()).toEqual(['ms-te'])
  })

  it('marks only the first occurrence in each text', async () => {
    const { user } = await renderModal([banana])

    await user.type(searchBox(), 'an')

    expect(marks()).toEqual(['AN', 'an'])
  })

  it('still lists the matches but marks nothing when the query has a leading space', async () => {
    const { user } = await renderModal()

    await user.type(searchBox(), ' gmail')

    expect(screen.getByRole('option')).toHaveTextContent('Gmail')
    expect(marks()).toEqual([])
  })
})

describe('DownloadModal keyboard navigation', () => {
  it('moves the highlight down with ArrowDown and wraps to the first result', async () => {
    const { user } = await renderModal([zoom])
    await user.type(searchBox(), 'zoom')
    expectNoHighlight()
    expect(screen.queryByRole('option', { selected: true })).not.toBeInTheDocument()

    for (const index of [0, 1, 2, 0]) {
      await user.keyboard(ARROW_DOWN)
      expectHighlight(index)
      expect(highlighted()).toHaveTextContent(ZOOM_ENTRIES[index])
    }
  })

  it('moves the highlight up with ArrowUp, starts from the last result and wraps', async () => {
    const { user } = await renderModal([zoom])
    await user.type(searchBox(), 'zoom')

    for (const index of [2, 1, 0, 2]) {
      await user.keyboard('{ArrowUp}')
      expectHighlight(index)
      expect(highlighted()).toHaveTextContent(ZOOM_ENTRIES[index])
    }
  })

  it('mixes ArrowDown and ArrowUp on the same highlight', async () => {
    const { user } = await renderModal([zoom])
    await user.type(searchBox(), 'zoom')

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}')
    expectHighlight(0)
    expect(highlighted()).toHaveTextContent(ZOOM_ENTRIES[0])

    await user.keyboard(ARROW_DOWN)
    expectHighlight(1)
    expect(highlighted()).toHaveTextContent(ZOOM_ENTRIES[1])
  })

  it('keeps the caret still on the arrow keys even when nothing can be highlighted', async () => {
    const { user } = await renderModal()
    await user.type(searchBox(), 'slack')
    expect(fireEvent.keyDown(searchBox(), { key: 'ArrowDown' })).toBe(false)
    expect(fireEvent.keyDown(searchBox(), { key: 'ArrowUp' })).toBe(false)

    await user.clear(searchBox())
    expect(fireEvent.keyDown(searchBox(), { key: 'ArrowDown' })).toBe(false)
    expect(fireEvent.keyDown(searchBox(), { key: 'ArrowUp' })).toBe(false)

    await user.type(searchBox(), 'zzz')
    expect(fireEvent.keyDown(searchBox(), { key: 'ArrowDown' })).toBe(false)
    expect(fireEvent.keyDown(searchBox(), { key: 'ArrowUp' })).toBe(false)
  })

  it('ignores arrow keys and Enter when nothing matches', async () => {
    const { user, api, onClose } = await renderModal()
    await user.type(searchBox(), 'zzz')

    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}')

    expect(screen.getByText(NO_RESULTS)).toBeInTheDocument()
    expect(searchBox()).not.toHaveAttribute(ACTIVE_DESCENDANT)
    expect(searchBox()).toHaveValue('zzz')
    expect(screen.queryByRole('combobox', { name: 'Version' })).not.toBeInTheDocument()
    expect(api.ipm.downloadVersion).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ignores arrow keys and Enter when the query is empty', async () => {
    const { user, api, onClose } = await renderModal()
    await user.click(searchBox())

    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(searchBox()).not.toHaveAttribute(ACTIVE_DESCENDANT)
    expect(screen.queryByRole('combobox', { name: 'Version' })).not.toBeInTheDocument()
    expect(api.ipm.downloadVersion).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does nothing on Enter before a result is highlighted and prevents the default only when it picks one', async () => {
    const { user } = await renderModal([zoom])
    await user.type(searchBox(), 'zoom')

    expect(fireEvent.keyDown(searchBox(), { key: 'Enter' })).toBe(true)
    expect(screen.getAllByRole('option')).toHaveLength(3)

    await user.keyboard(ARROW_DOWN)
    expect(fireEvent.keyDown(searchBox(), { key: 'Enter' })).toBe(false)
    expect(searchBox()).toHaveValue('Zoom (v3)')
  })

  it('resets the highlight when the query changes', async () => {
    const { user } = await renderModal()
    await user.type(searchBox(), 'slack')
    await user.keyboard(ARROW_DOWN)
    expectHighlight(0)

    await user.keyboard(BACKSPACE)
    expectNoHighlight()

    await user.keyboard('{Enter}')
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(screen.queryByRole('combobox', { name: 'Version' })).not.toBeInTheDocument()
  })

  it('selects the highlighted result with Enter, even an older major, and collapses the list', async () => {
    const { user, api, onClose } = await renderModal([zoom])

    await user.type(searchBox(), 'zoom{ArrowDown}{ArrowDown}{Enter}')

    expect(searchBox()).toHaveValue('Zoom (v2)')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(versionOptions()).toEqual([PICK_VERSION, 'v2.0.0'])
    expect(api.ipm.downloadVersion).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('selects the result that is clicked', async () => {
    const { user } = await renderModal([zoom])
    await user.type(searchBox(), 'zoom')

    await user.click(screen.getAllByRole('option')[2])

    expect(searchBox()).toHaveValue('Zoom (v1)')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('scrolls the highlighted result into view and does nothing when the highlight resets', async () => {
    const { user } = await renderModal([zoom])
    await user.type(searchBox(), 'zoom')
    const options = screen.getAllByRole('option')
    expect(scrollIntoView()).not.toHaveBeenCalled()

    await user.keyboard(ARROW_DOWN)
    expect(lastScrolled()).toBe(options[0])
    expect(scrollIntoView()).toHaveBeenLastCalledWith({ block: 'nearest' })

    scrollIntoView().mockClear()
    await user.keyboard(ARROW_DOWN)
    expect(lastScrolled()).toBe(options[1])
    expect(scrollIntoView()).toHaveBeenLastCalledWith({ block: 'nearest' })

    scrollIntoView().mockClear()
    await user.keyboard(BACKSPACE)
    expect(options.filter((option) => scrollIntoView().mock.contexts.includes(option))).toEqual([])
  })

  it('closes on Escape instead of collapsing the result list first', async () => {
    const { user, onClose } = await renderModal()
    await user.type(searchBox(), 'slack{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
    expect(searchBox()).toHaveValue('slack')
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })
})

describe('DownloadModal choosing an app and a version', () => {
  test.each([
    { query: 'slack', index: 0, value: 'Slack (v2)', versions: ['v2.1.0', 'v2.0.0'] },
    { query: 'slack', index: 1, value: 'Slack (v1)', versions: ['v1.3.0'] },
    { query: 'gmail', index: 0, value: 'Gmail', versions: ['v1.0.0'] },
    { query: 'zoom', index: 0, value: 'Zoom (v3)', versions: ['v3.0.0', 'v3.1.0'] },
    { query: 'zoom', index: 1, value: 'Zoom (v2)', versions: ['v2.0.0'] }
  ])('shows $value in the search box and lists $versions', async ({ query, index, value, versions }) => {
    const { user } = await renderModal([slack, gmail, zoom])

    await user.type(searchBox(), query)
    await user.click(screen.getAllByRole('option')[index])

    expect(searchBox()).toHaveValue(value)
    expect(searchBox()).toHaveAttribute(ARIA_EXPANDED, 'false')
    expect(searchBox()).not.toHaveAttribute(ARIA_CONTROLS)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(versionOptions()).toEqual([PICK_VERSION, ...versions])
    expect(versionSelect()).toHaveValue('')
    expect(downloadButton()).toBeDisabled()
  })

  it('lists the versions of a major in the order the API sent them', async () => {
    const { user } = await renderModal([zoom])

    await selectApp(user, 'zoom')

    expect(versionOptions()).toEqual([PICK_VERSION, 'v3.0.0', 'v3.1.0'])
  })

  it('names a single-group app after its latest major and lists its versions', async () => {
    const { user } = await renderModal([legacy])

    await selectApp(user, 'legacy')

    expect(searchBox()).toHaveValue('Legacy (v2)')
    expect(versionOptions()).toEqual([PICK_VERSION, 'v1.0.0', 'v1.1.0'])
  })

  it('offers only the placeholder for an app without versions', async () => {
    const { user } = await renderModal([unpublished])

    await selectApp(user, 'unpublished')

    expect(searchBox()).toHaveValue('Unpublished')
    expect(versionOptions()).toEqual([PICK_VERSION])
    expect(downloadButton()).toBeDisabled()
  })

  it('enables Download only while a version is chosen', async () => {
    const { user } = await renderModal()
    await selectApp(user, 'slack')
    expect(downloadButton()).toBeDisabled()

    await user.selectOptions(versionSelect(), 'v2.0.0')
    expect(versionSelect()).toHaveValue('2.0.0')
    expect(downloadButton()).toBeEnabled()

    await user.selectOptions(versionSelect(), PICK_VERSION)
    expect(versionSelect()).toHaveValue('')
    expect(downloadButton()).toBeDisabled()
  })

  it('forgets the app and its version as soon as the search box is edited', async () => {
    const { user } = await renderReady()
    expect(downloadButton()).toBeEnabled()

    await user.type(searchBox(), BACKSPACE)

    expect(searchBox()).toHaveValue('Gmai')
    expect(screen.queryByRole('combobox', { name: 'Version' })).not.toBeInTheDocument()
    expect(downloadButton()).toBeDisabled()
    expect(screen.getByRole('option')).toHaveTextContent('Gmail')

    await user.click(screen.getByRole('option'))
    expect(versionSelect()).toHaveValue('')
    expect(downloadButton()).toBeDisabled()
  })

  it('resets the version when another app is picked', async () => {
    const { user } = await renderModal()
    await selectApp(user, 'slack')
    await user.selectOptions(versionSelect(), 'v2.1.0')

    await selectApp(user, 'gmail')

    expect(searchBox()).toHaveValue('Gmail')
    expect(versionSelect()).toHaveValue('')
    expect(versionOptions()).toEqual([PICK_VERSION, 'v1.0.0'])
    expect(downloadButton()).toBeDisabled()
  })

  it('keeps an error while the search box is edited and clears it when an app is picked', async () => {
    const { user, api } = await renderReady()
    api.ipm.downloadVersion.mockResolvedValue(fail('Disk full'))
    await user.click(downloadButton())
    expect(await screen.findByText(DISK_FULL)).toBeInTheDocument()

    await user.clear(searchBox())
    expect(screen.getByText(DISK_FULL)).toBeInTheDocument()

    await user.type(searchBox(), 'slack')
    expect(screen.getByText(DISK_FULL)).toBeInTheDocument()

    await user.click(screen.getAllByRole('option')[0])
    expect(screen.queryByText(DISK_FULL)).not.toBeInTheDocument()
  })
})

describe('DownloadModal downloading', () => {
  it('sends the app name and the chosen version', async () => {
    const { user, api } = await renderModal([slack, zoom])
    await selectApp(user, 'zoom')
    await user.selectOptions(versionSelect(), 'v3.0.0')

    await user.click(downloadButton())

    expect(await screen.findByText(DONE_TITLE)).toBeInTheDocument()
    expect(api.ipm.downloadVersion).toHaveBeenCalledOnce()
    expect(api.ipm.downloadVersion).toHaveBeenCalledWith('zoom', '3.0.0')
  })

  it('shows Downloading... and ignores more clicks and Enter until it finishes', async () => {
    const { user, api } = await renderReady()
    const pending = deferred<DownloadResult>()
    api.ipm.downloadVersion.mockReturnValue(pending.promise)

    await user.click(downloadButton())

    const busy = await screen.findByRole('button', { name: BUSY_LABEL })
    expect(busy).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument()
    await user.click(busy)
    await user.click(searchBox())
    await user.keyboard('{Enter}')
    expect(api.ipm.downloadVersion).toHaveBeenCalledOnce()
    expect(screen.queryByText(DONE_TITLE)).not.toBeInTheDocument()

    await act(async () => {
      pending.resolve(ok(UNIX_PATH))
    })

    expect(await screen.findByText(DONE_TITLE)).toBeInTheDocument()
    expect(api.ipm.downloadVersion).toHaveBeenCalledOnce()
  })

  it('downloads once when Enter is pressed on the focused Download button', async () => {
    const { user, api } = await renderReady()
    downloadButton().focus()

    await user.keyboard('{Enter}')

    expect(await screen.findByText(DONE_TITLE)).toBeInTheDocument()
    expect(api.ipm.downloadVersion).toHaveBeenCalledOnce()
  })

  it('stays silent when the folder dialog is cancelled and can be tried again', async () => {
    const { user, api } = await renderReady()
    api.ipm.downloadVersion.mockResolvedValueOnce(fail('Cancelled')).mockResolvedValueOnce(fail('Disk full'))

    await user.click(downloadButton())

    await waitFor(() => expect(downloadButton()).toBeEnabled())
    expect(api.ipm.downloadVersion).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/^Error/)).not.toBeInTheDocument()
    expect(screen.queryByText(DONE_TITLE)).not.toBeInTheDocument()
    expect(versionSelect()).toHaveValue('1.0.0')

    await user.click(downloadButton())
    expect(await screen.findByText(DISK_FULL)).toBeInTheDocument()
    expect(api.ipm.downloadVersion).toHaveBeenCalledTimes(2)
  })

  const noReason: DownloadResult = { success: false }

  test.each([
    { failure: 'a failure with a reason', result: fail('Disk full'), message: DISK_FULL },
    { failure: 'a failure without a reason', result: noReason, message: 'Error: undefined' },
    {
      failure: 'a reason that only starts like a cancel',
      result: fail('Cancelled by peer'),
      message: 'Error: Cancelled by peer'
    }
  ])('shows "$message" for $failure and re-enables Download', async ({ result, message }) => {
    const { user, api } = await renderReady()
    api.ipm.downloadVersion.mockResolvedValue(result)

    await user.click(downloadButton())

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(downloadButton()).toBeEnabled()
    expect(versionSelect()).toHaveValue('1.0.0')
    expect(screen.queryByText(DONE_TITLE)).not.toBeInTheDocument()
  })

  test.each([
    { rejection: new Error('Socket closed'), message: 'Error: Socket closed' },
    { rejection: 'offline', message: 'Error: offline' }
  ])('shows "$message" when the download request rejects and re-enables Download', async ({ rejection, message }) => {
    const { user, api } = await renderReady()
    api.ipm.downloadVersion.mockRejectedValue(rejection)

    await user.click(downloadButton())

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(downloadButton()).toBeEnabled()
    expect(screen.queryByText(DONE_TITLE)).not.toBeInTheDocument()
  })

  it('hides the earlier error while the next attempt runs', async () => {
    const { user, api } = await renderReady()
    const pending = deferred<DownloadResult>()
    api.ipm.downloadVersion.mockResolvedValueOnce(fail('Disk full')).mockReturnValueOnce(pending.promise)
    await user.click(downloadButton())
    expect(await screen.findByText(DISK_FULL)).toBeInTheDocument()

    await user.click(downloadButton())

    expect(await screen.findByRole('button', { name: BUSY_LABEL })).toBeDisabled()
    expect(screen.queryByText(DISK_FULL)).not.toBeInTheDocument()

    await act(async () => {
      pending.resolve(ok(UNIX_PATH))
    })
    expect(await screen.findByText(DONE_TITLE)).toBeInTheDocument()
  })

  it('stays on the form without a message when the download succeeds without a path', async () => {
    const { user, api } = await renderReady()
    const noPath: DownloadResult = { success: true }
    api.ipm.downloadVersion.mockResolvedValue(noPath)

    await user.click(downloadButton())

    await waitFor(() => expect(api.ipm.downloadVersion).toHaveBeenCalledOnce())
    await waitFor(() => expect(downloadButton()).toBeEnabled())
    expect(screen.queryByText(DONE_TITLE)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Error/)).not.toBeInTheDocument()
  })
})

describe('DownloadModal download complete', () => {
  test.each([
    { name: 'a Unix path', path: UNIX_PATH, folder: FOLDER_NAME, parent: '/Users/me/Downloads' },
    { name: 'a path directly under the root', path: '/slack@2.1.0', folder: FOLDER_NAME, parent: '' },
    { name: 'a path without a separator', path: FOLDER_NAME, folder: FOLDER_NAME, parent: '' },
    { name: 'a Windows path as one folder name with no location', path: WINDOWS_PATH, folder: WINDOWS_PATH, parent: '' }
  ])('shows $name and reveals the exact path in Finder', async ({ path, folder, parent }) => {
    const { user, api, onClose } = await renderReady()
    api.ipm.downloadVersion.mockResolvedValue(ok(path))

    await user.click(downloadButton())

    expect(await screen.findByText(DONE_TITLE)).toBeInTheDocument()
    expect(successDetails()).toEqual({ folder, parent })

    await user.click(screen.getByRole('button', { name: SHOW_IN_FINDER }))
    expect(api.showInFinder).toHaveBeenCalledOnce()
    expect(api.showInFinder).toHaveBeenCalledWith(path)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('replaces the form with the result', async () => {
    const { user, api } = await renderReady()
    api.ipm.downloadVersion.mockResolvedValue(ok(UNIX_PATH))

    await user.click(downloadButton())

    expect(await screen.findByText(DONE_TITLE)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: TITLE })).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: SHOW_IN_FINDER })).toBeInTheDocument()
    expect(okButton()).toBeInTheDocument()
  })

  it('stays on the result for keys other than Enter and Escape', async () => {
    const { user, api, onClose } = await renderReady()
    api.ipm.downloadVersion.mockResolvedValue(ok(UNIX_PATH))
    await user.click(downloadButton())
    await screen.findByText(DONE_TITLE)

    await user.keyboard('x{ArrowDown}{Backspace}')

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText(DONE_TITLE)).toBeInTheDocument()
  })

  it.each(successClosers)('closes with $name', async ({ close }) => {
    const { user, api, onClose } = await renderReady()
    api.ipm.downloadVersion.mockResolvedValue(ok(UNIX_PATH))
    await user.click(downloadButton())
    await screen.findByText(DONE_TITLE)

    await close(user)

    expect(onClose).toHaveBeenCalledOnce()
    expect(api.ipm.downloadVersion).toHaveBeenCalledOnce()
  })
})

describe('DownloadModal Enter key', () => {
  it.each([
    { focus: 'the search box', focusOn: (user: UserEvent) => user.click(searchBox()) },
    { focus: 'nothing', focusOn: (user: UserEvent) => clickTitle(user) }
  ])('starts the download on Enter with $focus focused', async ({ focusOn }) => {
    const { user, api, onClose } = await renderReady()
    await focusOn(user)

    await user.keyboard('{Enter}')

    expect(await screen.findByText(DONE_TITLE)).toBeInTheDocument()
    expect(api.ipm.downloadVersion).toHaveBeenCalledOnce()
    expect(api.ipm.downloadVersion).toHaveBeenCalledWith('gmail', '1.0.0')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not start the download on Enter while the version select has the focus', async () => {
    const { user, api } = await renderReady()
    expect(versionSelect()).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(api.ipm.downloadVersion).not.toHaveBeenCalled()

    await clickTitle(user)
    await user.keyboard('{Enter}')
    expect(await screen.findByText(DONE_TITLE)).toBeInTheDocument()
    expect(api.ipm.downloadVersion).toHaveBeenCalledOnce()
  })

  it('ignores Enter until an app and a version are chosen', async () => {
    const { user, api, onClose } = await renderModal()
    await clickTitle(user)

    await user.keyboard('{Enter}')
    await selectApp(user, 'gmail')
    await clickTitle(user)
    await user.keyboard('{Enter}')

    expect(api.ipm.downloadVersion).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByText(DONE_TITLE)).not.toBeInTheDocument()

    await user.selectOptions(versionSelect(), 'v1.0.0')
    await clickTitle(user)
    await user.keyboard('{Enter}')
    expect(await screen.findByText(DONE_TITLE)).toBeInTheDocument()
    expect(api.ipm.downloadVersion).toHaveBeenCalledOnce()
  })

  it('ignores Enter once the search box has been edited, although a version was chosen', async () => {
    const { user, api } = await renderReady()

    await user.type(searchBox(), `${BACKSPACE}{Enter}`)

    expect(searchBox()).toHaveValue('Gmai')
    expect(api.ipm.downloadVersion).not.toHaveBeenCalled()
    expect(screen.queryByText(DONE_TITLE)).not.toBeInTheDocument()
  })

  it('only starts the download on Enter and not on other keys', async () => {
    const { user, api } = await renderReady()
    await clickTitle(user)

    await user.keyboard('x{ArrowDown}{Tab}{Backspace}')
    expect(api.ipm.downloadVersion).not.toHaveBeenCalled()

    await user.keyboard('{Enter}')
    expect(await screen.findByText(DONE_TITLE)).toBeInTheDocument()
    expect(api.ipm.downloadVersion).toHaveBeenCalledOnce()
  })

  it('downloads the version that is chosen last', async () => {
    const { user, api } = await renderModal()
    await selectApp(user, 'slack')
    await user.selectOptions(versionSelect(), 'v2.1.0')
    await user.selectOptions(versionSelect(), 'v2.0.0')
    await clickTitle(user)

    await user.keyboard('{Enter}')

    expect(await screen.findByText(DONE_TITLE)).toBeInTheDocument()
    expect(api.ipm.downloadVersion).toHaveBeenCalledOnce()
    expect(api.ipm.downloadVersion).toHaveBeenCalledWith('slack', '2.0.0')
  })

  it('downloads the app that is chosen last', async () => {
    const { user, api } = await renderModal()
    await selectApp(user, 'slack')
    await user.selectOptions(versionSelect(), 'v2.1.0')
    await selectApp(user, 'gmail')
    await user.selectOptions(versionSelect(), 'v1.0.0')
    await clickTitle(user)

    await user.keyboard('{Enter}')

    expect(await screen.findByText(DONE_TITLE)).toBeInTheDocument()
    expect(api.ipm.downloadVersion).toHaveBeenCalledOnce()
    expect(api.ipm.downloadVersion).toHaveBeenCalledWith('gmail', '1.0.0')
  })
})

describe('DownloadModal closing', () => {
  it.each(closers)('closes with $name', async ({ close }) => {
    const { user, onClose } = await renderModal()

    await close(user)

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes on Escape from the version select', async () => {
    const { user, onClose } = await renderReady()
    expect(versionSelect()).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes on Escape while the apps are still loading', async () => {
    mockApi().ipm.searchApps.mockReturnValue(deferred<AppList>().promise)
    const { user, onClose } = mountModal()

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
  })

  it.each(closers)('closes with $name while a download is running and lets the download finish', async ({ close }) => {
    const { user, api, onClose } = await renderReady()
    const pending = deferred<DownloadResult>()
    api.ipm.downloadVersion.mockReturnValue(pending.promise)
    await user.click(downloadButton())
    expect(await screen.findByRole('button', { name: BUSY_LABEL })).toBeDisabled()

    await close(user)

    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: BUSY_LABEL })).toBeDisabled()
    expect(screen.queryByText(DONE_TITLE)).not.toBeInTheDocument()

    await act(async () => {
      pending.resolve(ok(UNIX_PATH))
    })

    expect(await screen.findByText(DONE_TITLE)).toBeInTheDocument()
    expect(successDetails()).toEqual({ folder: FOLDER_NAME, parent: '/Users/me/Downloads' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(api.ipm.downloadVersion).toHaveBeenCalledOnce()
  })

  it('stays open for clicks inside the panel', async () => {
    const { user, onClose } = await renderModal()

    await user.click(screen.getByRole('heading', { name: TITLE }))
    await user.click(screen.getByText('Search App'))
    await user.click(searchBox())
    await user.type(searchBox(), 'slack')
    await user.click(screen.getAllByRole('option')[0])
    await user.click(versionSelect())

    expect(onClose).not.toHaveBeenCalled()
  })

  it('stays open for other keys', async () => {
    const { user, onClose } = await renderModal()

    await user.keyboard('a{Tab}{ArrowDown}{Backspace}')

    expect(onClose).not.toHaveBeenCalled()
  })

  it('stops listening to the keyboard once it is closed', async () => {
    const { api, onClose, unmount } = await renderReady()

    unmount()

    expect(fireEvent.keyDown(window, { key: 'Escape' })).toBe(true)
    expect(fireEvent.keyDown(window, { key: 'Enter' })).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
    expect(api.ipm.downloadVersion).not.toHaveBeenCalled()
  })

  it('calls the latest onClose', async () => {
    const { user, onClose, rerender } = await renderModal()
    const nextOnClose = vi.fn()

    rerender(<DownloadModal onClose={nextOnClose} />)
    await user.keyboard('{Escape}')

    expect(nextOnClose).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('DownloadModal reopening', () => {
  it('starts from an empty form and loads the app list again', async () => {
    const first = await renderReady()
    first.api.ipm.downloadVersion.mockResolvedValue(fail('Disk full'))
    await first.user.click(downloadButton())
    expect(await screen.findByText(DISK_FULL)).toBeInTheDocument()
    first.unmount()

    await renderModal()

    expect(searchBox()).toHaveValue('')
    expect(screen.queryByText(DISK_FULL)).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Version' })).not.toBeInTheDocument()
    expect(downloadButton()).toBeDisabled()
    expect(mockApi().ipm.searchApps).toHaveBeenCalledTimes(2)
  })

  it('shows the form again after a finished download', async () => {
    const first = await renderReady()
    first.api.ipm.downloadVersion.mockResolvedValue(ok(UNIX_PATH))
    await first.user.click(downloadButton())
    await screen.findByText(DONE_TITLE)
    first.unmount()

    await renderModal()

    expect(screen.queryByText(DONE_TITLE)).not.toBeInTheDocument()
    expect(searchBox()).toHaveValue('')
    expect(downloadButton()).toBeDisabled()
  })
})
