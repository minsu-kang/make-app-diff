import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import VersionSelector from '../VersionSelector'
import ToastContainer from '../Toast'
import { mockApi, ok, fail, type ApiMock } from '../../__tests__/mocks/window-api'
import type { DiffResult, IpcResult, VersionTags } from '../../../preload/index'

type Props = Parameters<typeof VersionSelector>[0]

const APP = 'slack'
const PLACEHOLDER = 'Select version...'
const COMPARE_TITLE = 'Compare versions (Cmd+Enter)'
const SWAP_TITLE = 'Swap versions'
const DOWNLOAD_TOGGLE_TITLE = 'Download version'
const TIMELINE_TITLE = 'Version timeline'
const COPY_ZIP_TITLE = 'Copy version as ZIP to clipboard (Cmd+V to paste)'
const COMPARING = 'Comparing...'
const COPYING = 'Copying...'
const DOWNLOADING = 'Downloading...'
const DOWNLOAD_COMPLETE = 'Download Complete'
const DOWNLOAD_PATH = '/Users/me/Downloads/slack@2.0.0'
const DOWNLOAD_FOLDER = 'slack@2.0.0'
const DOWNLOAD_PARENT = '/Users/me/Downloads'
const WINDOWS_PATH = String.raw`C:\Users\me\slack@2.0.0`
const COPIED = 'Copied! Cmd+V to paste'
const CLASS_ACTIVE = 'active'
const OVERLAY_SELECTOR = '.settings-overlay'
const TOAST_SELECTOR = '.toast'

const versions = ['3.0.0', '2.2.0', '2.1.0', '2.0.0', '1.0.0']
const readyToCompare = { fromVersion: '2.0.0', toVersion: '2.2.0' }
const cmdEnter: KeyboardEventInit = { key: 'Enter', metaKey: true }
const ctrlEnter: KeyboardEventInit = { key: 'Enter', ctrlKey: true }
const tags: VersionTags = { staging: ['2.2.0', '3.0.0'], production: ['2.1.0'], stable: ['2.0.0'] }

const shown: DiffResult = {
  type: 'app',
  diffs: [{ filePath: 'a.json', status: 'added', oldContent: '', newContent: '{}', unifiedDiff: '' }],
  summary: { added: 1, deleted: 0, modified: 0, unchanged: 0 }
}

const mixed: DiffResult = {
  type: 'app',
  diffs: [
    { filePath: 'added.json', status: 'added', oldContent: '', newContent: '{"a":1}', unifiedDiff: '' },
    { filePath: 'deleted.json', status: 'deleted', oldContent: '{"b":2}', newContent: '', unifiedDiff: '' },
    { filePath: 'modified.json', status: 'modified', oldContent: 'old', newContent: 'new', unifiedDiff: '' },
    { filePath: 'empty.json', status: 'unchanged', oldContent: '', newContent: '', unifiedDiff: '' }
  ],
  summary: { added: 1, deleted: 1, modified: 1, unchanged: 1 }
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function renderSelector(overrides: Partial<Props> = {}) {
  const callbacks = {
    onFromChange: vi.fn(),
    onToChange: vi.fn(),
    onSwap: vi.fn(),
    onCompare: vi.fn(),
    onShow: vi.fn()
  }
  const base: Props = { versions, appName: APP, fromVersion: '', toVersion: '', loading: false, ...callbacks }
  const ui = (next: Partial<Props>) => (
    <>
      <VersionSelector {...base} {...overrides} {...next} />
      <ToastContainer />
    </>
  )
  const view = render(ui({}))
  return { ...callbacks, rerender: (next: Partial<Props>) => view.rerender(ui(next)), unmount: view.unmount }
}

const fromSelect = () => screen.getByLabelText('From')
const toSelect = () => screen.getByLabelText('To')
const downloadSelect = () => screen.getByLabelText('Download')
const compareButton = () => screen.getByTitle(COMPARE_TITLE)
const swapButton = () => screen.getByTitle(SWAP_TITLE)
const downloadToggle = () => screen.getByTitle(DOWNLOAD_TOGGLE_TITLE)
const timelineToggle = () => screen.getByTitle(TIMELINE_TITLE)
const showButton = () => screen.getByRole('button', { name: 'Show' })
const copyZipButton = () => screen.getByTitle(COPY_ZIP_TITLE)
const downloadButton = () => screen.getByRole('button', { name: /^Download(ing\.\.\.)?$/ })

const options = (select: HTMLElement) => within(select).getAllByRole<HTMLOptionElement>('option')
const optionLabels = (select: HTMLElement) => options(select).map((o) => o.textContent)
const optionValues = (select: HTMLElement) => options(select).map((o) => o.value)
const isActive = (button: HTMLElement) => button.classList.contains(CLASS_ACTIVE)
const timelineNodes = () => screen.queryAllByTitle(/^v\d/).map((node) => node.getAttribute('title'))
const toastOf = (text: string) => screen.getByText(text).closest(TOAST_SELECTOR)
const toastTexts = () => screen.queryAllByText(/^(Download failed|Failed|Copied)/).map((node) => node.textContent)
const overlay = () => document.querySelector(OVERLAY_SELECTOR) as HTMLElement
const successDetails = () => ({
  folder: document.querySelector('.download-success-folder')?.textContent,
  parent: document.querySelector('.download-success-path')?.textContent
})
const pressKey = (init: KeyboardEventInit) => fireEvent.keyDown(document.body, init)
const downloadSettled = () => waitFor(() => expect(downloadButton()).toBeEnabled())

async function openDownload(user: UserEvent, version?: string) {
  await user.click(downloadToggle())
  if (version) await user.selectOptions(downloadSelect(), version)
}

async function downloadVia(user: UserEvent, version = '2.0.0') {
  await openDownload(user, version)
  await user.click(downloadButton())
}

async function copyZipVia(user: UserEvent, version = '2.0.0') {
  await openDownload(user, version)
  await user.click(copyZipButton())
}

describe('VersionSelector', () => {
  it('limits the dropdowns to the latest major and hides the selected counterpart', () => {
    renderSelector({ toVersion: '2.2.0' })

    expect(optionLabels(fromSelect())).toEqual([PLACEHOLDER, 'v2.1.0', 'v2.0.0'])
    expect(optionLabels(toSelect())).toEqual([PLACEHOLDER, 'v2.2.0', 'v2.1.0', 'v2.0.0'])
    expect(toSelect()).toHaveValue('2.2.0')
  })

  it('fires Compare on click and on Cmd+Enter', async () => {
    const user = userEvent.setup()
    const { onCompare } = renderSelector(readyToCompare)

    await user.click(screen.getByRole('button', { name: 'Compare' }))
    await user.keyboard('{Meta>}{Enter}{/Meta}')

    expect(onCompare).toHaveBeenCalledTimes(2)
    expect(onCompare).toHaveBeenLastCalledWith()
  })

  it('disables Compare and Swap while nothing is selected', () => {
    renderSelector()
    expect(screen.getByRole('button', { name: 'Compare' })).toBeDisabled()
    expect(swapButton()).toBeDisabled()
  })

  it('reports dropdown changes and swaps', async () => {
    const user = userEvent.setup()
    const { onFromChange, onSwap } = renderSelector(readyToCompare)

    await user.selectOptions(fromSelect(), 'v2.1.0')
    await user.click(swapButton())

    expect(onFromChange).toHaveBeenCalledWith('2.1.0')
    expect(onSwap).toHaveBeenCalledOnce()
  })

  it('hides the timeline toggle with two versions or fewer', () => {
    renderSelector({ versions: ['1.0.0', '1.1.0'] })
    expect(screen.queryByTitle(TIMELINE_TITLE)).not.toBeInTheDocument()
  })

  it('shows the timeline for a long list', async () => {
    const user = userEvent.setup()
    renderSelector(readyToCompare)

    await user.click(timelineToggle())

    expect(screen.getByTitle('v2.1.0')).toBeInTheDocument()
  })

  it('downloads a version and shows the completion dialog', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    api.ipm.downloadVersion.mockResolvedValue(ok(DOWNLOAD_PATH))
    renderSelector({ toVersion: '2.2.0' })

    await downloadVia(user)

    expect(api.ipm.downloadVersion).toHaveBeenCalledWith(APP, '2.0.0')
    expect(await screen.findByText(DOWNLOAD_COMPLETE)).toBeInTheDocument()
    expect(screen.getByText(DOWNLOAD_FOLDER)).toBeInTheDocument()
    expect(screen.getByText(DOWNLOAD_PARENT)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show in Finder' }))
    expect(api.showInFinder).toHaveBeenCalledWith(DOWNLOAD_PATH)

    await user.click(screen.getByRole('button', { name: 'OK' }))
    expect(screen.queryByText(DOWNLOAD_COMPLETE)).not.toBeInTheDocument()
  })

  it('toasts a failed download but not a cancelled one', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    api.ipm.downloadVersion.mockResolvedValueOnce(fail('Cancelled')).mockResolvedValueOnce(fail('Disk full'))
    renderSelector({ toVersion: '2.2.0' })

    await downloadVia(user)
    await downloadSettled()
    expect(screen.queryByText(/Download failed/)).not.toBeInTheDocument()

    await user.click(downloadButton())
    expect(await screen.findByText('Download failed: Disk full')).toBeInTheDocument()
  })

  it('copies a version as ZIP and toasts the outcome', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    api.ipm.showVersion.mockResolvedValue(ok(shown))
    renderSelector({ toVersion: '2.2.0' })

    await copyZipVia(user)

    expect(api.ipm.showVersion).toHaveBeenCalledWith(APP, '2.0.0')
    expect(api.clipboard.copyZip).toHaveBeenCalledWith({
      appName: APP,
      version: '2.0.0',
      files: [{ path: 'a.json', content: '{}' }]
    })
    expect(await screen.findByText(COPIED)).toBeInTheDocument()
    expect(toastOf(COPIED)).toHaveClass('toast-success')
    expect(toastTexts()).toEqual([COPIED])
  })

  it('shows the selected version through the Show button', async () => {
    const user = userEvent.setup()
    const { onShow } = renderSelector({ toVersion: '2.2.0' })

    await openDownload(user, '2.1.0')
    await user.click(showButton())
    await user.selectOptions(downloadSelect(), '2.0.0')
    await user.click(showButton())

    expect(onShow).toHaveBeenNthCalledWith(1, '2.1.0')
    expect(onShow).toHaveBeenNthCalledWith(2, '2.0.0')
    expect(mockApi().ipm.showVersion).not.toHaveBeenCalled()
  })
})

describe('VersionSelector dropdowns', () => {
  it('lists every version of the latest major in the given order when nothing is selected', () => {
    renderSelector({ versions: ['2.0.0', '3.0.0', '2.5.0', '3.1.0', '3.0.5'] })

    expect(optionLabels(fromSelect())).toEqual([PLACEHOLDER, 'v3.0.0', 'v3.1.0', 'v3.0.5'])
    expect(optionLabels(toSelect())).toEqual([PLACEHOLDER, 'v3.0.0', 'v3.1.0', 'v3.0.5'])
    expect(optionValues(fromSelect())).toEqual(['', '3.0.0', '3.1.0', '3.0.5'])
    expect(optionValues(toSelect())).toEqual(['', '3.0.0', '3.1.0', '3.0.5'])
    expect(fromSelect()).toHaveValue('')
    expect(toSelect()).toHaveValue('')
  })

  it('hides each selected version from the other dropdown and keeps both selections shown', () => {
    renderSelector({ fromVersion: '2.1.0', toVersion: '2.2.0' })

    expect(optionLabels(fromSelect())).toEqual([PLACEHOLDER, 'v2.1.0', 'v2.0.0'])
    expect(optionLabels(toSelect())).toEqual([PLACEHOLDER, 'v2.2.0', 'v2.0.0'])
    expect(fromSelect()).toHaveValue('2.1.0')
    expect(toSelect()).toHaveValue('2.2.0')
  })

  it.each([
    { name: 'ascending majors', list: ['9.0.0', '10.0.0'], expected: ['v10.0.0'] },
    { name: 'descending majors', list: ['10.0.0', '9.0.0'], expected: ['v10.0.0'] },
    {
      name: 'a lower major listed last',
      list: ['11.0.0', '2.0.0', '3.0.0', '11.2.0', '2.5.0'],
      expected: ['v11.0.0', 'v11.2.0']
    },
    { name: 'a three-digit major', list: ['1.0.0', '100.0.0', '11.0.0', '99.0.0'], expected: ['v100.0.0'] },
    { name: 'a single major', list: ['9.1.0', '9.0.0', '9.2.0'], expected: ['v9.1.0', 'v9.0.0', 'v9.2.0'] }
  ])('defaults to the numerically latest major for $name', ({ list, expected }) => {
    renderSelector({ versions: list })

    expect(optionLabels(fromSelect())).toEqual([PLACEHOLDER, ...expected])
    expect(optionLabels(toSelect())).toEqual([PLACEHOLDER, ...expected])
  })

  const manyMajors = ['1.0.0', '1.5.0', '9.0.0', '9.9.9', '10.0.0', '10.1.0', '100.0.0', '11.0.0']

  it.each([
    { name: 'To 10.0.0', selection: { toVersion: '10.0.0' }, from: ['v10.1.0'], to: ['v10.0.0', 'v10.1.0'] },
    { name: 'To 9.0.0', selection: { toVersion: '9.0.0' }, from: ['v9.9.9'], to: ['v9.0.0', 'v9.9.9'] },
    { name: 'To 1.0.0', selection: { toVersion: '1.0.0' }, from: ['v1.5.0'], to: ['v1.0.0', 'v1.5.0'] },
    { name: 'To 100.0.0', selection: { toVersion: '100.0.0' }, from: [], to: ['v100.0.0'] },
    { name: 'From 10.1.0', selection: { fromVersion: '10.1.0' }, from: ['v10.0.0', 'v10.1.0'], to: ['v10.0.0'] },
    { name: 'From 1.5.0', selection: { fromVersion: '1.5.0' }, from: ['v1.0.0', 'v1.5.0'], to: ['v1.0.0'] },
    { name: 'From 11.0.0', selection: { fromVersion: '11.0.0' }, from: ['v11.0.0'], to: [] }
  ])('keeps only the selected major when $name', ({ selection, from, to }) => {
    renderSelector({ versions: manyMajors, ...selection })

    expect(optionLabels(fromSelect())).toEqual([PLACEHOLDER, ...from])
    expect(optionLabels(toSelect())).toEqual([PLACEHOLDER, ...to])
  })

  it('follows the To major before the From major and shows the placeholder for a From outside it', () => {
    renderSelector({ fromVersion: '1.0.0', toVersion: '2.1.0' })

    expect(optionLabels(fromSelect())).toEqual([PLACEHOLDER, 'v2.2.0', 'v2.0.0'])
    expect(optionLabels(toSelect())).toEqual([PLACEHOLDER, 'v2.2.0', 'v2.1.0', 'v2.0.0'])
    expect(fromSelect()).toHaveValue('')
    expect(toSelect()).toHaveValue('2.1.0')
  })

  it('falls back to the From major while To is empty', () => {
    renderSelector({ fromVersion: '1.0.0' })

    expect(optionLabels(fromSelect())).toEqual([PLACEHOLDER, 'v1.0.0'])
    expect(optionLabels(toSelect())).toEqual([PLACEHOLDER])
    expect(fromSelect()).toHaveValue('1.0.0')
  })

  it.each([
    { name: 'an empty list', list: [] as string[], selection: {}, expected: [] as string[] },
    { name: 'only unparseable versions', list: ['beta', 'next'], selection: {}, expected: [] },
    {
      name: 'unparseable versions next to numeric ones',
      list: ['1.0.0', 'beta', '2.0.0', 'v3.0.0'],
      selection: {},
      expected: ['v2.0.0']
    },
    {
      name: 'an unparseable selected version',
      list: ['1.0.0', 'beta'],
      selection: { toVersion: 'beta' },
      expected: []
    },
    { name: 'versions without minor or patch', list: ['1', '2', '2.1'], selection: {}, expected: ['v2', 'v2.1'] },
    { name: 'an unparseable version next to major 0', list: ['0.1.0', 'beta'], selection: {}, expected: ['v0.1.0'] },
    {
      name: 'an unparseable selected version next to major 0',
      list: ['0.1.0', 'beta'],
      selection: { toVersion: 'beta' },
      expected: []
    }
  ])('handles $name', ({ list, selection, expected }) => {
    renderSelector({ versions: list, ...selection })

    expect(optionLabels(fromSelect())).toEqual([PLACEHOLDER, ...expected])
    expect(optionLabels(toSelect())).toEqual([PLACEHOLDER, ...expected])
  })

  it('recomputes the lists when the selection or the version list changes', () => {
    const { rerender } = renderSelector()
    expect(optionLabels(toSelect())).toEqual([PLACEHOLDER, 'v3.0.0'])

    rerender({ fromVersion: '2.0.0' })
    expect(optionLabels(toSelect())).toEqual([PLACEHOLDER, 'v2.2.0', 'v2.1.0'])

    rerender({ fromVersion: '1.0.0' })
    expect(optionLabels(fromSelect())).toEqual([PLACEHOLDER, 'v1.0.0'])

    rerender({ toVersion: '2.1.0' })
    expect(optionLabels(fromSelect())).toEqual([PLACEHOLDER, 'v2.2.0', 'v2.0.0'])

    rerender({ toVersion: '2.1.0', versions: ['2.1.0', '2.5.0', '1.0.0'] })
    expect(optionLabels(fromSelect())).toEqual([PLACEHOLDER, 'v2.5.0'])
  })

  it('reports the chosen version of each dropdown and clears it with the placeholder', async () => {
    const user = userEvent.setup()
    const { onFromChange, onToChange } = renderSelector(readyToCompare)

    await user.selectOptions(toSelect(), '2.1.0')
    expect(onToChange).toHaveBeenCalledOnce()
    expect(onToChange).toHaveBeenCalledWith('2.1.0')
    expect(onFromChange).not.toHaveBeenCalled()

    await user.selectOptions(fromSelect(), PLACEHOLDER)
    expect(onFromChange).toHaveBeenCalledOnce()
    expect(onFromChange).toHaveBeenCalledWith('')

    await user.selectOptions(toSelect(), PLACEHOLDER)
    expect(onToChange).toHaveBeenLastCalledWith('')
  })
})

describe('VersionSelector Compare', () => {
  it('enables Compare for two different versions', () => {
    renderSelector(readyToCompare)

    expect(compareButton()).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Compare' })).toBe(compareButton())
  })

  it.each([
    { name: 'nothing is selected', props: {} },
    { name: 'only From is selected', props: { fromVersion: '2.0.0' } },
    { name: 'only To is selected', props: { toVersion: '2.2.0' } },
    { name: 'both versions are the same', props: { fromVersion: '2.0.0', toVersion: '2.0.0' } },
    { name: 'a comparison is loading', props: { ...readyToCompare, loading: true } }
  ])('disables Compare and ignores click, Cmd+Enter and Ctrl+Enter when $name', async ({ props }) => {
    const user = userEvent.setup()
    const { onCompare } = renderSelector(props)

    expect(compareButton()).toBeDisabled()
    await user.click(compareButton())
    expect(pressKey(cmdEnter)).toBe(true)
    expect(pressKey(ctrlEnter)).toBe(true)

    expect(onCompare).not.toHaveBeenCalled()
  })

  it('labels the button Comparing... while loading', () => {
    renderSelector({ ...readyToCompare, loading: true })

    expect(compareButton()).toHaveTextContent(COMPARING)
    expect(screen.queryByRole('button', { name: 'Compare' })).not.toBeInTheDocument()
    expect(fromSelect()).toBeEnabled()
    expect(toSelect()).toBeEnabled()
  })

  it('does not hand a boolean to onCompare on click, which App would take as the decompile flag', async () => {
    const user = userEvent.setup()
    const { onCompare } = renderSelector(readyToCompare)

    await user.click(compareButton())

    expect(onCompare).toHaveBeenCalledOnce()
    expect(onCompare).not.toHaveBeenCalledWith(expect.any(Boolean))
  })

  it.each([
    { name: 'Cmd+Enter', init: cmdEnter },
    { name: 'Ctrl+Enter', init: ctrlEnter }
  ])('calls onCompare without arguments and cancels the default action on $name', ({ init }) => {
    const { onCompare } = renderSelector(readyToCompare)

    expect(pressKey(init)).toBe(false)

    expect(onCompare).toHaveBeenCalledOnce()
    expect(onCompare).toHaveBeenCalledWith()
  })

  it.each([
    { name: 'plain Enter', init: { key: 'Enter' } },
    { name: 'Shift+Enter', init: { key: 'Enter', shiftKey: true } },
    { name: 'Alt+Enter', init: { key: 'Enter', altKey: true } },
    { name: 'Cmd+Space', init: { key: ' ', metaKey: true } },
    { name: 'Ctrl+K', init: { key: 'k', ctrlKey: true } }
  ])('ignores $name', ({ init }) => {
    const { onCompare } = renderSelector(readyToCompare)

    expect(pressKey(init)).toBe(true)

    expect(onCompare).not.toHaveBeenCalled()
  })

  it('reacts to the latest selection and callback after a rerender', () => {
    const { onCompare, rerender } = renderSelector({ fromVersion: '2.0.0' })
    pressKey(cmdEnter)
    expect(onCompare).not.toHaveBeenCalled()

    const next = vi.fn()
    rerender({ toVersion: '2.2.0', onCompare: next })
    pressKey(cmdEnter)
    expect(next).toHaveBeenCalledOnce()

    const last = vi.fn()
    rerender({ toVersion: '2.2.0', onCompare: last })
    pressKey(cmdEnter)
    expect(last).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledOnce()
    expect(onCompare).not.toHaveBeenCalled()

    rerender({ toVersion: '2.2.0', onCompare: last, loading: true })
    pressKey(cmdEnter)
    expect(last).toHaveBeenCalledOnce()
  })

  it('stops listening for the shortcut once unmounted', () => {
    const { onCompare, unmount } = renderSelector(readyToCompare)

    unmount()

    expect(pressKey(cmdEnter)).toBe(true)
    expect(onCompare).not.toHaveBeenCalled()
  })
})

describe('VersionSelector Swap', () => {
  it.each([
    { name: 'only From is selected', props: { fromVersion: '2.0.0' } },
    { name: 'only To is selected', props: { toVersion: '2.2.0' } },
    { name: 'both are selected', props: readyToCompare },
    {
      name: 'both are the same and a comparison is loading',
      props: { fromVersion: '2.0.0', toVersion: '2.0.0', loading: true }
    }
  ])('enables Swap and calls onSwap once when $name', async ({ props }) => {
    const user = userEvent.setup()
    const { onSwap, onFromChange, onToChange, onCompare } = renderSelector(props)

    expect(swapButton()).toBeEnabled()
    await user.click(swapButton())

    expect(onSwap).toHaveBeenCalledOnce()
    expect(onFromChange).not.toHaveBeenCalled()
    expect(onToChange).not.toHaveBeenCalled()
    expect(onCompare).not.toHaveBeenCalled()
  })

  it('ignores clicks while nothing is selected', async () => {
    const user = userEvent.setup()
    const { onSwap } = renderSelector()

    await user.click(swapButton())

    expect(onSwap).not.toHaveBeenCalled()
  })
})

describe('VersionSelector timeline', () => {
  it.each([
    { name: 'three versions', list: ['1.0.0', '1.1.0', '1.2.0'], selection: {}, shown: true },
    { name: 'an empty list', list: [] as string[], selection: {}, shown: false },
    {
      name: 'two versions in the selected major out of five',
      list: ['2.0.0', '2.1.0', '1.0.0', '1.1.0', '1.2.0'],
      selection: { toVersion: '2.1.0' },
      shown: false
    },
    {
      name: 'three versions in the latest major out of four',
      list: ['2.0.0', '2.1.0', '2.2.0', '1.0.0'],
      selection: {},
      shown: true
    },
    {
      name: 'three versions in a major that is not selected',
      list: ['3.0.0', '2.0.0', '2.1.0', '2.2.0'],
      selection: { toVersion: '3.0.0' },
      shown: false
    }
  ])('toggle visibility with $name', ({ list, selection, shown: visible }) => {
    renderSelector({ versions: list, ...selection })

    expect(screen.queryByTitle(TIMELINE_TITLE) !== null).toBe(visible)
  })

  it('opens and closes the timeline with its toggle and marks the toggle active', async () => {
    const user = userEvent.setup()
    renderSelector(readyToCompare)
    expect(timelineNodes()).toEqual([])
    expect(isActive(timelineToggle())).toBe(false)

    await user.click(timelineToggle())
    expect(timelineNodes()).not.toEqual([])
    expect(isActive(timelineToggle())).toBe(true)

    await user.click(timelineToggle())
    expect(timelineNodes()).toEqual([])
    expect(isActive(timelineToggle())).toBe(false)
  })

  it('shows only the selected major with the From and To markers', async () => {
    const user = userEvent.setup()
    renderSelector(readyToCompare)

    await user.click(timelineToggle())

    expect(timelineNodes()).toEqual(['v2.0.0', 'v2.1.0', 'v2.2.0'])
    expect(screen.getByText('2.x')).toBeInTheDocument()
    expect(screen.getByText('FROM')).toBeInTheDocument()
    expect(screen.getByText('TO')).toBeInTheDocument()
  })

  it('shows the latest major when nothing is selected', async () => {
    const user = userEvent.setup()
    renderSelector({ versions: ['9.0.0', '10.0.0', '9.5.0', '10.1.0', '10.2.0'] })

    await user.click(timelineToggle())

    expect(timelineNodes()).toEqual(['v10.0.0', 'v10.1.0', 'v10.2.0'])
  })

  it('wires node clicks to the From and To callbacks', async () => {
    const user = userEvent.setup()
    const { onFromChange, onToChange } = renderSelector({
      versions: ['2.0.0', '2.1.0', '2.2.0', '2.3.0'],
      ...readyToCompare
    })
    await user.click(timelineToggle())

    await user.click(screen.getByTitle('v2.3.0'))
    expect(onToChange).toHaveBeenCalledOnce()
    expect(onToChange).toHaveBeenCalledWith('2.3.0')
    expect(onFromChange).not.toHaveBeenCalled()

    await user.click(screen.getByTitle('v2.1.0'))
    expect(onFromChange).toHaveBeenCalledOnce()
    expect(onFromChange).toHaveBeenCalledWith('2.1.0')
    expect(onToChange).toHaveBeenCalledOnce()
  })

  it('passes the environment tags to the timeline', async () => {
    const user = userEvent.setup()
    renderSelector({ ...readyToCompare, tags })

    await user.click(timelineToggle())

    expect(screen.getByText('Staging: v2.2.0')).toBeInTheDocument()
    expect(screen.getByText('Production: v2.1.0')).toBeInTheDocument()
    expect(screen.getByText('Stable: v2.0.0')).toBeInTheDocument()
  })

  it('shows no environment line without tags', async () => {
    const user = userEvent.setup()
    renderSelector(readyToCompare)

    await user.click(timelineToggle())

    expect(screen.queryByText(/^(Staging|Production|Stable):/)).not.toBeInTheDocument()
  })

  it.each([
    { name: 'one version', other: ['1.0.0'] },
    { name: 'two versions', other: ['1.0.0', '1.1.0'] }
  ])('hides an open timeline while the selected major has $name and restores it', async ({ other }) => {
    const user = userEvent.setup()
    const list = ['2.0.0', '2.1.0', '2.2.0', ...other]
    const { rerender } = renderSelector({ versions: list, toVersion: '2.2.0' })
    await user.click(timelineToggle())
    expect(timelineNodes()).toEqual(['v2.0.0', 'v2.1.0', 'v2.2.0'])

    rerender({ versions: list, toVersion: '1.0.0' })
    expect(screen.queryByTitle(TIMELINE_TITLE)).not.toBeInTheDocument()
    expect(timelineNodes()).toEqual([])

    rerender({ versions: list, toVersion: '2.2.0' })
    expect(isActive(timelineToggle())).toBe(true)
    expect(timelineNodes()).toEqual(['v2.0.0', 'v2.1.0', 'v2.2.0'])
  })
})

describe('VersionSelector download row', () => {
  it('toggles the row with the download button and marks the button active', async () => {
    const user = userEvent.setup()
    renderSelector({ toVersion: '2.2.0' })
    expect(screen.queryByLabelText('Download')).not.toBeInTheDocument()
    expect(isActive(downloadToggle())).toBe(false)

    await user.click(downloadToggle())
    expect(downloadSelect()).toBeInTheDocument()
    expect(showButton()).toBeInTheDocument()
    expect(copyZipButton()).toBeInTheDocument()
    expect(downloadButton()).toBeInTheDocument()
    expect(isActive(downloadToggle())).toBe(true)

    await user.click(downloadToggle())
    expect(screen.queryByLabelText('Download')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show' })).not.toBeInTheDocument()
    expect(screen.queryByTitle(COPY_ZIP_TITLE)).not.toBeInTheDocument()
    expect(isActive(downloadToggle())).toBe(false)
  })

  it('lists every version of the selected major, including the selected ones, in the given order', async () => {
    const user = userEvent.setup()
    renderSelector(readyToCompare)

    await openDownload(user)

    expect(optionLabels(downloadSelect())).toEqual([PLACEHOLDER, 'v2.2.0', 'v2.1.0', 'v2.0.0'])
    expect(optionValues(downloadSelect())).toEqual(['', '2.2.0', '2.1.0', '2.0.0'])
    expect(downloadSelect()).toHaveValue('')
  })

  it('lists the latest major when nothing is selected', async () => {
    const user = userEvent.setup()
    renderSelector({ versions: ['9.0.0', '10.0.0', '9.5.0', '10.1.0'] })

    await openDownload(user)

    expect(optionLabels(downloadSelect())).toEqual([PLACEHOLDER, 'v10.0.0', 'v10.1.0'])
  })

  it('keeps Show, Copy ZIP and Download disabled until a version is chosen and again after clearing it', async () => {
    const user = userEvent.setup()
    renderSelector({ toVersion: '2.2.0' })
    await openDownload(user)
    expect(showButton()).toBeDisabled()
    expect(copyZipButton()).toBeDisabled()
    expect(downloadButton()).toBeDisabled()

    await user.selectOptions(downloadSelect(), '2.1.0')
    expect(showButton()).toBeEnabled()
    expect(copyZipButton()).toBeEnabled()
    expect(downloadButton()).toBeEnabled()

    await user.selectOptions(downloadSelect(), PLACEHOLDER)
    expect(showButton()).toBeDisabled()
    expect(copyZipButton()).toBeDisabled()
    expect(downloadButton()).toBeDisabled()
  })

  it('disables Show and Copy ZIP but not Download while a comparison is loading', async () => {
    const user = userEvent.setup()
    renderSelector({ toVersion: '2.2.0', loading: true })

    await openDownload(user, '2.1.0')

    expect(downloadSelect()).toBeEnabled()
    expect(showButton()).toBeDisabled()
    expect(copyZipButton()).toBeDisabled()
    expect(downloadButton()).toBeEnabled()
  })

  it('does not change the From or To selection when a download version is chosen', async () => {
    const user = userEvent.setup()
    const { onFromChange, onToChange, onSwap, onCompare, onShow } = renderSelector({ toVersion: '2.2.0' })

    await openDownload(user, '2.1.0')

    for (const callback of [onFromChange, onToChange, onSwap, onCompare, onShow]) {
      expect(callback).not.toHaveBeenCalled()
    }
  })

  it('remembers the chosen version while the row is closed', async () => {
    const user = userEvent.setup()
    renderSelector({ toVersion: '2.2.0' })
    await openDownload(user, '2.1.0')

    await user.click(downloadToggle())
    await user.click(downloadToggle())

    expect(downloadSelect()).toHaveValue('2.1.0')
    expect(showButton()).toBeEnabled()
  })

  it('clears the chosen version and the completion dialog when the app changes', async () => {
    const user = userEvent.setup()
    mockApi().ipm.downloadVersion.mockResolvedValue(ok(DOWNLOAD_PATH))
    const { rerender } = renderSelector({ toVersion: '2.2.0' })
    await downloadVia(user)
    expect(await screen.findByText(DOWNLOAD_COMPLETE)).toBeInTheDocument()

    rerender({ appName: 'gmail' })

    expect(screen.queryByText(DOWNLOAD_COMPLETE)).not.toBeInTheDocument()
    expect(downloadSelect()).toHaveValue('')
    expect(showButton()).toBeDisabled()
  })

  it('clears the chosen version and the completion dialog when the version list is replaced', async () => {
    const user = userEvent.setup()
    mockApi().ipm.downloadVersion.mockResolvedValue(ok(DOWNLOAD_PATH))
    const { rerender } = renderSelector({ toVersion: '2.2.0' })
    await downloadVia(user)
    expect(await screen.findByText(DOWNLOAD_COMPLETE)).toBeInTheDocument()

    rerender({ versions: [...versions] })

    expect(screen.queryByText(DOWNLOAD_COMPLETE)).not.toBeInTheDocument()
    expect(downloadSelect()).toHaveValue('')
    expect(showButton()).toBeDisabled()
  })

  it('keeps the chosen version and the completion dialog when other props change', async () => {
    const user = userEvent.setup()
    mockApi().ipm.downloadVersion.mockResolvedValue(ok(DOWNLOAD_PATH))
    const { rerender } = renderSelector({ toVersion: '2.2.0' })
    await downloadVia(user)
    expect(await screen.findByText(DOWNLOAD_COMPLETE)).toBeInTheDocument()

    rerender({ toVersion: '2.2.0', fromVersion: '2.1.0', loading: true })

    expect(screen.getByText(DOWNLOAD_COMPLETE)).toBeInTheDocument()
    expect(downloadSelect()).toHaveValue('2.0.0')
  })

  it('opens the row with only the placeholder for an empty version list', async () => {
    const user = userEvent.setup()
    renderSelector({ versions: [] })

    await openDownload(user)

    expect(optionLabels(downloadSelect())).toEqual([PLACEHOLDER])
    expect(showButton()).toBeDisabled()
    expect(downloadButton()).toBeDisabled()
  })

  it('keeps the download row and the timeline open when the app changes', async () => {
    const user = userEvent.setup()
    const { rerender } = renderSelector(readyToCompare)
    await openDownload(user, '2.1.0')
    await user.click(timelineToggle())

    rerender({ ...readyToCompare, appName: 'gmail' })

    expect(downloadSelect()).toHaveValue('')
    expect(isActive(downloadToggle())).toBe(true)
    expect(isActive(timelineToggle())).toBe(true)
    expect(timelineNodes()).toEqual(['v2.0.0', 'v2.1.0', 'v2.2.0'])
  })

  it('still acts on a chosen download version that the new major no longer lists', async () => {
    const user = userEvent.setup()
    const { onShow, rerender } = renderSelector({ toVersion: '2.2.0' })
    await openDownload(user, '2.0.0')

    rerender({ toVersion: '1.0.0' })

    expect(optionLabels(downloadSelect())).toEqual([PLACEHOLDER, 'v1.0.0'])
    expect(downloadSelect()).toHaveValue('')
    expect(showButton()).toBeEnabled()
    await user.click(showButton())
    expect(onShow).toHaveBeenCalledWith('2.0.0')
  })
})

describe('VersionSelector download action', () => {
  it('shows Downloading... and blocks the button until the download settles', async () => {
    const user = userEvent.setup()
    const pending = deferred<IpcResult<string>>()
    mockApi().ipm.downloadVersion.mockReturnValue(pending.promise)
    renderSelector({ toVersion: '2.2.0' })

    await downloadVia(user)
    expect(downloadButton()).toHaveTextContent(DOWNLOADING)
    expect(downloadButton()).toBeDisabled()
    expect(showButton()).toBeEnabled()
    expect(copyZipButton()).toBeEnabled()
    expect(mockApi().ipm.downloadVersion).toHaveBeenCalledOnce()

    await act(async () => pending.resolve(ok(DOWNLOAD_PATH)))

    expect(await screen.findByText(DOWNLOAD_COMPLETE)).toBeInTheDocument()
    expect(downloadButton()).toBeEnabled()
    expect(downloadButton()).toHaveTextContent(/^Download$/)
  })

  it('stays silent and restores the button when the download is cancelled', async () => {
    const user = userEvent.setup()
    const pending = deferred<IpcResult<string>>()
    mockApi().ipm.downloadVersion.mockReturnValue(pending.promise)
    renderSelector({ toVersion: '2.2.0' })
    await downloadVia(user)

    await act(async () => pending.resolve(fail('Cancelled')))

    await downloadSettled()
    expect(downloadButton()).toHaveTextContent(/^Download$/)
    expect(screen.queryByText(DOWNLOAD_COMPLETE)).not.toBeInTheDocument()
    expect(toastTexts()).toEqual([])
  })

  it.each([
    {
      name: 'an error result',
      arrange: (api: ApiMock) => api.ipm.downloadVersion.mockResolvedValue(fail('Disk full')),
      text: 'Download failed: Disk full'
    },
    {
      name: 'a result without an error',
      arrange: (api: ApiMock) => api.ipm.downloadVersion.mockResolvedValue({ success: false }),
      text: 'Download failed: undefined'
    },
    {
      name: 'a rejected Error',
      arrange: (api: ApiMock) => api.ipm.downloadVersion.mockRejectedValue(new Error('Network down')),
      text: 'Download failed: Network down'
    },
    {
      name: 'a rejected string',
      arrange: (api: ApiMock) => api.ipm.downloadVersion.mockRejectedValue('offline'),
      text: 'Download failed: offline'
    }
  ])('toasts $text for $name and restores the button', async ({ arrange, text }) => {
    const user = userEvent.setup()
    arrange(mockApi())
    renderSelector({ toVersion: '2.2.0' })

    await downloadVia(user)

    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(toastOf(text)).toHaveClass('toast-error')
    await downloadSettled()
    expect(toastTexts()).toEqual([text])
    expect(downloadButton()).toHaveTextContent(/^Download$/)
    expect(screen.queryByText(DOWNLOAD_COMPLETE)).not.toBeInTheDocument()
  })

  it('shows neither a dialog nor a toast for a success without a path', async () => {
    const user = userEvent.setup()
    mockApi().ipm.downloadVersion.mockResolvedValue({ success: true })
    renderSelector({ toVersion: '2.2.0' })

    await downloadVia(user)

    await downloadSettled()
    expect(downloadButton()).toHaveTextContent(/^Download$/)
    expect(screen.queryByText(DOWNLOAD_COMPLETE)).not.toBeInTheDocument()
    expect(toastTexts()).toEqual([])
  })

  it('does nothing without an app name', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    renderSelector({ appName: '', toVersion: '2.2.0' })
    await openDownload(user, '2.0.0')

    await user.click(downloadButton())
    await user.click(copyZipButton())

    expect(api.ipm.downloadVersion).not.toHaveBeenCalled()
    expect(api.ipm.showVersion).not.toHaveBeenCalled()
    expect(api.clipboard.copyZip).not.toHaveBeenCalled()
    expect(downloadButton()).toHaveTextContent(/^Download$/)
    expect(copyZipButton()).toHaveTextContent('Copy ZIP')
    expect(toastTexts()).toEqual([])
  })

  it.each([
    { name: 'a Unix path', path: DOWNLOAD_PATH, folder: DOWNLOAD_FOLDER, parent: DOWNLOAD_PARENT },
    { name: 'a path without forward slashes', path: WINDOWS_PATH, folder: WINDOWS_PATH, parent: '' }
  ])('splits $name into folder name and parent folder', async ({ path, folder, parent }) => {
    const user = userEvent.setup()
    mockApi().ipm.downloadVersion.mockResolvedValue(ok(path))
    renderSelector({ toVersion: '2.2.0' })

    await downloadVia(user)

    expect(await screen.findByText(DOWNLOAD_COMPLETE)).toBeInTheDocument()
    expect(successDetails()).toEqual({ folder, parent })
  })

  it('keeps the dialog open for Show in Finder and for clicks inside or outside the panel', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    api.ipm.downloadVersion.mockResolvedValue(ok(DOWNLOAD_PATH))
    renderSelector({ toVersion: '2.2.0' })
    await downloadVia(user)

    await user.click(await screen.findByRole('button', { name: 'Show in Finder' }))
    await user.click(screen.getByText(DOWNLOAD_COMPLETE))
    await user.click(overlay())

    expect(api.showInFinder).toHaveBeenCalledOnce()
    expect(api.showInFinder).toHaveBeenCalledWith(DOWNLOAD_PATH)
    expect(screen.getByText(DOWNLOAD_COMPLETE)).toBeInTheDocument()
  })

  it('keeps the chosen version after OK and downloads again', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    api.ipm.downloadVersion.mockResolvedValue(ok(DOWNLOAD_PATH))
    renderSelector({ toVersion: '2.2.0' })
    await downloadVia(user)
    await user.click(await screen.findByRole('button', { name: 'OK' }))

    expect(screen.queryByText(DOWNLOAD_COMPLETE)).not.toBeInTheDocument()
    expect(downloadSelect()).toHaveValue('2.0.0')

    await user.click(downloadButton())

    expect(await screen.findByText(DOWNLOAD_COMPLETE)).toBeInTheDocument()
    expect(api.ipm.downloadVersion).toHaveBeenCalledTimes(2)
    expect(api.ipm.downloadVersion).toHaveBeenLastCalledWith(APP, '2.0.0')
  })
})

describe('VersionSelector copy as ZIP', () => {
  it('sends the new content of each file and the old content of deleted ones', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    api.ipm.showVersion.mockResolvedValue(ok(mixed))
    renderSelector({ toVersion: '2.2.0' })

    await copyZipVia(user, '2.1.0')

    expect(await screen.findByText(COPIED)).toBeInTheDocument()
    expect(api.clipboard.copyZip).toHaveBeenCalledOnce()
    expect(api.clipboard.copyZip).toHaveBeenCalledWith({
      appName: APP,
      version: '2.1.0',
      files: [
        { path: 'added.json', content: '{"a":1}' },
        { path: 'deleted.json', content: '{"b":2}' },
        { path: 'modified.json', content: 'new' },
        { path: 'empty.json', content: '' }
      ]
    })
    expect(screen.queryByText(DOWNLOAD_COMPLETE)).not.toBeInTheDocument()
  })

  it('shows Copying... and blocks the button while the version loads and while the ZIP is copied', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    const version = deferred<IpcResult<DiffResult>>()
    const zip = deferred<IpcResult<string>>()
    api.ipm.showVersion.mockReturnValue(version.promise)
    api.clipboard.copyZip.mockReturnValue(zip.promise)
    renderSelector({ toVersion: '2.2.0' })

    await copyZipVia(user)
    expect(copyZipButton()).toHaveTextContent(COPYING)
    expect(copyZipButton()).toBeDisabled()
    expect(showButton()).toBeEnabled()
    expect(downloadButton()).toBeEnabled()
    expect(api.clipboard.copyZip).not.toHaveBeenCalled()

    await act(async () => version.resolve(ok(shown)))
    await waitFor(() => expect(api.clipboard.copyZip).toHaveBeenCalledOnce())
    expect(copyZipButton()).toHaveTextContent(COPYING)
    expect(copyZipButton()).toBeDisabled()

    await act(async () => zip.resolve(ok('/tmp/slack@2.0.0.zip')))

    expect(await screen.findByText(COPIED)).toBeInTheDocument()
    expect(copyZipButton()).toBeEnabled()
    expect(copyZipButton()).toHaveTextContent('Copy ZIP')
  })

  it.each([
    {
      name: 'showVersion returns an error',
      arrange: (api: ApiMock) => api.ipm.showVersion.mockResolvedValue(fail('No access')),
      text: 'Failed: No access',
      copied: false
    },
    {
      name: 'showVersion returns an error together with data',
      arrange: (api: ApiMock) =>
        api.ipm.showVersion.mockResolvedValue({ success: false, error: 'Partial', data: shown }),
      text: 'Failed: Partial',
      copied: false
    },
    {
      name: 'showVersion succeeds without data',
      arrange: (api: ApiMock) => api.ipm.showVersion.mockResolvedValue({ success: true }),
      text: 'Failed: undefined',
      copied: false
    },
    {
      name: 'showVersion rejects with an Error',
      arrange: (api: ApiMock) => api.ipm.showVersion.mockRejectedValue(new Error('Timed out')),
      text: 'Failed: Timed out',
      copied: false
    },
    {
      name: 'showVersion rejects with a string',
      arrange: (api: ApiMock) => api.ipm.showVersion.mockRejectedValue('offline'),
      text: 'Failed: offline',
      copied: false
    },
    {
      name: 'copyZip returns an error',
      arrange: (api: ApiMock) => {
        api.ipm.showVersion.mockResolvedValue(ok(shown))
        api.clipboard.copyZip.mockResolvedValue(fail('Clipboard busy'))
      },
      text: 'Failed: Clipboard busy',
      copied: true
    },
    {
      name: 'copyZip rejects with an Error',
      arrange: (api: ApiMock) => {
        api.ipm.showVersion.mockResolvedValue(ok(shown))
        api.clipboard.copyZip.mockRejectedValue(new Error('Clipboard gone'))
      },
      text: 'Failed: Clipboard gone',
      copied: true
    },
    {
      name: 'copyZip rejects with a string',
      arrange: (api: ApiMock) => {
        api.ipm.showVersion.mockResolvedValue(ok(shown))
        api.clipboard.copyZip.mockRejectedValue('denied')
      },
      text: 'Failed: denied',
      copied: true
    }
  ])('toasts $text when $name and restores the button', async ({ arrange, text, copied }) => {
    const user = userEvent.setup()
    const api = mockApi()
    arrange(api)
    renderSelector({ toVersion: '2.2.0' })

    await copyZipVia(user)

    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(toastOf(text)).toHaveClass('toast-error')
    expect(screen.queryByText(COPIED)).not.toBeInTheDocument()
    expect(api.clipboard.copyZip).toHaveBeenCalledTimes(copied ? 1 : 0)
    await waitFor(() => expect(copyZipButton()).toBeEnabled())
    expect(toastTexts()).toEqual([text])
    expect(copyZipButton()).toHaveTextContent('Copy ZIP')
  })
})
