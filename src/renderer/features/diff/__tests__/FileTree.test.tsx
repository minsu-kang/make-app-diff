import { afterEach, beforeEach, describe, it, expect, vi, type MockInstance } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import FileTree from '../FileTree'
import type { FileDiff } from '../../../shared/types'

type Props = Partial<Parameters<typeof FileTree>[0]>

const NO_CHANGES = 'No changes'
const META_FILE = 'metadata.json'
const API_FILE = 'api.imljson'
const MODULES = 'modules'
const SEND_PATH = 'modules/send/api.imljson'
const GET_PATH = 'modules/get/api.imljson'
const APP_NAME = 'slack'
const VERSION_RANGE = '1.0.0 → 2.0.0'
const CHANGED_HEADER = 'Changed components (3)'
const ARIA_EXPANDED = 'aria-expanded'
const ARIA_SELECTED = 'aria-selected'
const COL_RESIZE = 'col-resize'
const DEFAULT_WIDTH = '280px'
const DEFAULT_ICON_COLOR = '#8a8a8a'
const CLOSED_FOLDER_FILLS = ['#c09553']
const OPEN_FOLDER_FILLS = ['#c09553', '#dcb67a']

const COLORS = { added: '#2ea043', deleted: '#f85149', modified: '#d29922' }

function diff(filePath: string, status: FileDiff['status'] = 'modified'): FileDiff {
  return { filePath, status, oldContent: 'a', newContent: 'b', unifiedDiff: '' }
}

const diffs = [diff(SEND_PATH), diff(GET_PATH, 'added'), diff(META_FILE, 'deleted')]
const sharedPathDiffs = [diff('icon', 'deleted'), diff('icon/logo.png', 'added')]

const rows = () => screen.queryAllByRole('treeitem')
const labelEl = (item: HTMLElement) => item.querySelector<HTMLElement>('.tree-label') as HTMLElement
const labelOf = (item: HTMLElement) => labelEl(item).textContent
const names = () => rows().map(labelOf)

function row(name: string, nth = 0): HTMLElement {
  const found = rows().filter((item) => labelOf(item) === name)[nth]
  if (!found) throw new Error('No row labelled ' + name)
  return found
}

const isSelected = (item: HTMLElement) => item.classList.contains('selected')
const isChevronOpen = (item: HTMLElement) => item.querySelector('.tree-chevron')?.classList.contains('expanded')
const badge = (item: HTMLElement) => item.querySelector('.tree-badge')?.textContent ?? null
const iconFills = (item: HTMLElement) =>
  Array.from(item.querySelectorAll('.tree-icon-svg path')).map((path) => path.getAttribute('fill'))

function fileIcon(item: HTMLElement) {
  const svg = item.querySelector('.tree-icon-svg svg')
  return {
    letter: svg?.querySelector('text')?.textContent ?? null,
    color: svg?.querySelector('path')?.getAttribute('stroke')
  }
}

function indent(item: HTMLElement) {
  const guides = Array.from(item.querySelectorAll<HTMLElement>('.indent-guide'))
  return {
    width: item.querySelector<HTMLElement>('.tree-indent')?.style.width,
    guides: guides.map((g) => g.style.left)
  }
}

const PANEL = '.file-tree'
const HANDLE = '.file-tree-resize'
const panel = () => document.querySelector<HTMLElement>(PANEL) as HTMLElement
const handle = () => document.querySelector<HTMLElement>(HANDLE) as HTMLElement
const panelWidth = () => panel().style.width

const startDrag = (clientX: number) => fireEvent.mouseDown(handle(), { clientX })
const dragTo = (clientX: number) => fireEvent.mouseMove(document, { clientX })
const endDrag = () => fireEvent.mouseUp(document)

const isDragEvent = (type: string) => type === 'mousemove' || type === 'mouseup'

function watchDocumentListeners() {
  const add = vi.spyOn(document, 'addEventListener')
  const remove = vi.spyOn(document, 'removeEventListener')
  const added = () => add.mock.calls.filter(([type]) => isDragEvent(type))
  const removed = () => remove.mock.calls.filter(([type]) => isDragEvent(type))
  return {
    addedTypes: () => added().map(([type]) => type),
    stillListening: () =>
      added()
        .filter(([type, fn]) => !removed().some(([t, f]) => t === type && f === fn))
        .map(([type]) => type)
  }
}

function renderTree(overrides: Props = {}) {
  const onFileSelect = vi.fn()
  const props = { diffs, selectedFile: null, onFileSelect, ...overrides }
  const view = render(<FileTree {...props} />)
  const rerender = (next: Props) => view.rerender(<FileTree {...props} {...next} />)
  return { onFileSelect, rerender, unmount: view.unmount }
}

async function open(user: UserEvent, ...folders: string[]) {
  for (const folder of folders) await user.click(row(folder))
}

let consoleError: MockInstance<typeof console.error>

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockReturnValue(undefined)
})

afterEach(() => {
  endDrag()
  const reported = [...consoleError.mock.calls]
  expect(reported).toEqual([])
})

describe('FileTree', () => {
  it('shows an empty state without diffs', () => {
    render(<FileTree diffs={[]} selectedFile={null} onFileSelect={vi.fn()} />)
    expect(screen.getByText(NO_CHANGES)).toBeInTheDocument()
  })

  it('starts collapsed and expands folders on click', async () => {
    const user = userEvent.setup()
    render(<FileTree diffs={diffs} selectedFile={null} onFileSelect={vi.fn()} />)

    expect(screen.getByText(CHANGED_HEADER)).toBeInTheDocument()
    expect(screen.queryByText('send')).not.toBeInTheDocument()

    await user.click(screen.getByText('modules'))
    expect(screen.getByText('send')).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: /modules/ })).toHaveAttribute(ARIA_EXPANDED, 'true')
  })

  it('selects a file with the mouse and with the keyboard', async () => {
    const user = userEvent.setup()
    const onFileSelect = vi.fn()
    render(<FileTree diffs={diffs} selectedFile={META_FILE} onFileSelect={onFileSelect} />)

    const file = screen.getByRole('treeitem', { name: /metadata\.json/ })
    expect(file).toHaveAttribute(ARIA_SELECTED, 'true')

    await user.click(file)
    file.focus()
    await user.keyboard('{Enter}')

    expect(onFileSelect).toHaveBeenCalledTimes(2)
    expect(onFileSelect).toHaveBeenCalledWith(META_FILE)
  })

  it('colors names by status and lists the compared versions', () => {
    render(
      <FileTree
        diffs={diffs}
        selectedFile={null}
        onFileSelect={vi.fn()}
        appName={APP_NAME}
        fromVersion="1.0.0"
        toVersion="2.0.0"
      />
    )

    expect(screen.getByText(META_FILE)).toHaveStyle({ color: COLORS.deleted })
    expect(screen.getByText(APP_NAME)).toBeInTheDocument()
    expect(screen.getByText(VERSION_RANGE)).toBeInTheDocument()
  })

  it('labels the header Components in show mode', () => {
    render(<FileTree diffs={diffs} selectedFile={null} onFileSelect={vi.fn()} viewMode="show" />)
    expect(screen.getByText('Components (3)')).toBeInTheDocument()
  })

  describe('empty state', () => {
    it('replaces the whole panel, including the header, the version info and the resize handle', () => {
      renderTree({ diffs: [], appName: APP_NAME, fromVersion: '1.0.0', toVersion: '2.0.0' })

      expect(screen.getByText(NO_CHANGES)).toBeInTheDocument()
      expect(screen.queryByRole('tree')).not.toBeInTheDocument()
      expect(screen.queryByText(/files/i)).not.toBeInTheDocument()
      expect(screen.queryByText(APP_NAME)).not.toBeInTheDocument()
      expect(document.querySelector(PANEL)).toBeNull()
      expect(document.querySelector(HANDLE)).toBeNull()
    })

    it('switches with the diffs and the tree comes back collapsed', async () => {
      const user = userEvent.setup()
      const { rerender } = renderTree()
      await open(user, MODULES)

      rerender({ diffs: [] })
      expect(screen.getByText(NO_CHANGES)).toBeInTheDocument()
      expect(screen.queryByRole('tree')).not.toBeInTheDocument()

      rerender({ diffs })
      expect(screen.queryByText(NO_CHANGES)).not.toBeInTheDocument()
      expect(names()).toEqual([MODULES, META_FILE])
    })
  })

  describe('header and version info', () => {
    it('counts the diffs, not the visible rows', () => {
      renderTree()

      expect(screen.getByText(CHANGED_HEADER)).toBeInTheDocument()
      expect(names()).toEqual([MODULES, META_FILE])
    })

    it('counts the components in show mode too', () => {
      renderTree({ viewMode: 'show', diffs: [diff('a.json'), diff('b/c.json'), diff('b/d.json'), diff('e.json')] })

      expect(screen.getByText('Components (4)')).toBeInTheDocument()
      expect(screen.queryByText(/Changed components/)).not.toBeInTheDocument()
    })

    it('counts the files of a component once', () => {
      renderTree({
        diffs: [
          diff('modules/send/api.imljson'),
          diff('modules/send/metadata.json'),
          diff('modules/send/scope.imljson'),
          diff('connections/oauth/api.imljson'),
          diff('connections/oauth/metadata.json')
        ]
      })

      expect(screen.getByText('Changed components (2)')).toBeInTheDocument()
    })

    it('shows the app name and the compared versions in diff mode', () => {
      renderTree({ appName: APP_NAME, fromVersion: '1.0.0', toVersion: '2.0.0', viewMode: 'diff' })

      expect(screen.getByText(APP_NAME)).toBeInTheDocument()
      expect(screen.getByText(VERSION_RANGE)).toBeInTheDocument()
    })

    it.each([
      { name: 'the app name is missing', props: { appName: undefined } },
      { name: 'the app name is empty', props: { appName: '' } },
      { name: 'the from version is missing', props: { fromVersion: undefined } },
      { name: 'the from version is empty', props: { fromVersion: '' } },
      { name: 'the to version is missing', props: { toVersion: undefined } },
      { name: 'the to version is empty', props: { toVersion: '' } },
      { name: 'the view mode is show', props: { viewMode: 'show' as const } }
    ])('hides the version info when $name', ({ props }) => {
      renderTree({ appName: APP_NAME, fromVersion: '1.0.0', toVersion: '2.0.0', ...props })

      expect(screen.queryByText(APP_NAME)).not.toBeInTheDocument()
      expect(screen.queryByText(/→/)).not.toBeInTheDocument()
      expect(screen.getByRole('tree')).toBeInTheDocument()
    })
  })

  describe('rows', () => {
    it('starts collapsed with the folders first', () => {
      renderTree()

      expect(names()).toEqual([MODULES, META_FILE])
      expect(row(MODULES)).toHaveAttribute(ARIA_EXPANDED, 'false')
      expect(isChevronOpen(row(MODULES))).toBe(false)
    })

    it('exposes the expanded state on folders only and the selected state on files only', async () => {
      const user = userEvent.setup()
      renderTree()
      await open(user, MODULES)

      expect(rows().map((item) => item.getAttribute(ARIA_EXPANDED))).toEqual(['true', 'false', 'false', null])
      expect(rows().map((item) => item.getAttribute(ARIA_SELECTED))).toEqual([null, null, null, 'false'])
    })

    it('lists nested rows folders first with an indent and a guide per level', async () => {
      const user = userEvent.setup()
      renderTree()
      await open(user, MODULES, 'get', 'send')

      expect(names()).toEqual([MODULES, 'get', API_FILE, 'send', API_FILE, META_FILE])
      expect(indent(row(MODULES))).toEqual({ width: '0px', guides: [] })
      expect(indent(row('get'))).toEqual({ width: '16px', guides: ['7px'] })
      expect(indent(row(API_FILE))).toEqual({ width: '32px', guides: ['7px', '23px'] })
      expect(indent(row(META_FILE))).toEqual({ width: '0px', guides: [] })
    })

    it('puts every row in the tab order', async () => {
      const user = userEvent.setup()
      renderTree()

      await user.tab()
      expect(row(MODULES)).toHaveFocus()
      await user.tab()
      expect(row(META_FILE)).toHaveFocus()
    })
  })

  describe('folders', () => {
    it('expands and collapses on click and swaps the chevron and the icon', async () => {
      const user = userEvent.setup()
      const { onFileSelect } = renderTree()
      expect(iconFills(row(MODULES))).toEqual(CLOSED_FOLDER_FILLS)

      await user.click(row(MODULES))
      expect(names()).toEqual([MODULES, 'get', 'send', META_FILE])
      expect(row(MODULES)).toHaveAttribute(ARIA_EXPANDED, 'true')
      expect(isChevronOpen(row(MODULES))).toBe(true)
      expect(iconFills(row(MODULES))).toEqual(OPEN_FOLDER_FILLS)
      expect(iconFills(row('get'))).toEqual(CLOSED_FOLDER_FILLS)
      expect(iconFills(row('send'))).toEqual(CLOSED_FOLDER_FILLS)

      await user.click(row(MODULES))
      expect(names()).toEqual([MODULES, META_FILE])
      expect(row(MODULES)).toHaveAttribute(ARIA_EXPANDED, 'false')
      expect(isChevronOpen(row(MODULES))).toBe(false)
      expect(iconFills(row(MODULES))).toEqual(CLOSED_FOLDER_FILLS)
      expect(onFileSelect).not.toHaveBeenCalled()
    })

    it('gives every open folder the same icon', async () => {
      const user = userEvent.setup()
      renderTree()
      await open(user, MODULES, 'get')

      expect(iconFills(row(MODULES))).toEqual(OPEN_FOLDER_FILLS)
      expect(iconFills(row('get'))).toEqual(OPEN_FOLDER_FILLS)
      expect(iconFills(row('send'))).toEqual(CLOSED_FOLDER_FILLS)
    })

    it('expands folders independently of each other', async () => {
      const user = userEvent.setup()
      renderTree()
      await open(user, MODULES, 'send')

      expect(names()).toEqual([MODULES, 'get', 'send', API_FILE, META_FILE])
      expect(row('get')).toHaveAttribute(ARIA_EXPANDED, 'false')
      expect(row('send')).toHaveAttribute(ARIA_EXPANDED, 'true')
    })

    it('collapsing a folder also collapses the subfolders that were open', async () => {
      const user = userEvent.setup()
      renderTree()
      await open(user, MODULES, 'send', MODULES)
      expect(names()).toEqual([MODULES, META_FILE])

      await open(user, MODULES)
      expect(names()).toEqual([MODULES, 'get', 'send', META_FILE])
      expect(row('send')).toHaveAttribute(ARIA_EXPANDED, 'false')
    })

    it('collapsing a folder keeps open the folders that only share its name prefix', async () => {
      const user = userEvent.setup()
      renderTree({ diffs: [diff('mod/a.json'), diff('modules/b.json')] })
      await open(user, 'mod', MODULES)
      expect(names()).toEqual(['mod', 'a.json', MODULES, 'b.json'])

      await open(user, 'mod')
      expect(names()).toEqual(['mod', MODULES, 'b.json'])
      expect(row(MODULES)).toHaveAttribute(ARIA_EXPANDED, 'true')
    })

    it('shows how many files each folder holds, nested ones included, and no count on files', async () => {
      const user = userEvent.setup()
      renderTree({
        diffs: [
          diff('a/one.json'),
          diff('a/b/two.json'),
          diff('a/b/three.json'),
          diff('c/four.json'),
          diff('root.json')
        ]
      })
      await open(user, 'a', 'b')

      expect(badge(row('a'))).toBe('3')
      expect(badge(row('b'))).toBe('2')
      expect(badge(row('c'))).toBe('1')
      expect(badge(row('one.json'))).toBeNull()
      expect(badge(row('two.json'))).toBeNull()
      expect(badge(row('root.json'))).toBeNull()
    })

    it('counts the components in a folder, not their files, and shows no count on a component', async () => {
      const user = userEvent.setup()
      renderTree({
        diffs: [
          diff('modules/send/api.imljson'),
          diff('modules/send/metadata.json'),
          diff('modules/get/api.imljson'),
          diff('modules/get/metadata.json'),
          diff('modules/get/scope.imljson'),
          diff('functions/pad/code.js'),
          diff('assets/a.png'),
          diff('assets/b.png')
        ]
      })
      await open(user, MODULES)

      expect(badge(row(MODULES))).toBe('2')
      expect(badge(row('functions'))).toBe('1')
      expect(badge(row('assets'))).toBe('2')
      expect(badge(row('send'))).toBeNull()
      expect(badge(row('get'))).toBeNull()
    })

    it('counts a folder next to a file with the same path separately', async () => {
      const user = userEvent.setup()
      renderTree({ diffs: sharedPathDiffs, selectedFile: 'icon' })

      const [fileRow, folderRow] = rows()
      expect(names()).toEqual(['icon', 'icon'])
      expect(fileRow).not.toHaveAttribute(ARIA_EXPANDED)
      expect(badge(fileRow)).toBeNull()
      expect(folderRow).toHaveAttribute(ARIA_EXPANDED, 'false')
      expect(badge(folderRow)).toBe('1')

      await user.click(folderRow)
      expect(names()).toEqual(['icon', 'icon', 'logo.png'])
    })
  })

  describe('status colors', () => {
    it.each([
      { status: 'added' as const, color: COLORS.added },
      { status: 'deleted' as const, color: COLORS.deleted },
      { status: 'modified' as const, color: COLORS.modified }
    ])('colors a $status file $color', ({ status, color }) => {
      renderTree({ diffs: [diff('file.json', status)] })

      expect(labelEl(row('file.json'))).toHaveStyle({ color })
    })

    it('leaves a file with an unknown status in the default color', () => {
      renderTree({ diffs: [diff('same.json', 'unchanged')] })

      expect(labelEl(row('same.json')).style.color).toBe('')
    })

    it.each([
      { folder: 'added-dir', color: COLORS.added },
      { folder: 'deleted-dir', color: COLORS.deleted },
      { folder: 'modified-dir', color: COLORS.modified },
      { folder: 'mixed-dir', color: COLORS.modified },
      { folder: 'edited-and-added-dir', color: COLORS.modified }
    ])('colors the folder $folder $color after what is inside', ({ folder, color }) => {
      renderTree({
        diffs: [
          diff('added-dir/a.json', 'added'),
          diff('deleted-dir/b.json', 'deleted'),
          diff('modified-dir/c.json'),
          diff('mixed-dir/d.json', 'added'),
          diff('mixed-dir/e.json', 'deleted'),
          diff('edited-and-added-dir/f.json'),
          diff('edited-and-added-dir/g.json', 'added')
        ]
      })

      expect(labelEl(row(folder))).toHaveStyle({ color })
    })

    it('leaves a folder with only unknown statuses in the default color', () => {
      renderTree({ diffs: [diff('same-dir/same.json', 'unchanged')] })

      expect(labelEl(row('same-dir')).style.color).toBe('')
    })

    it('colors a parent folder from everything below it and each subfolder from its own files', async () => {
      const user = userEvent.setup()
      renderTree({ diffs: [diff('outer/inner/new.json', 'added'), diff('outer/gone.json', 'deleted')] })
      await open(user, 'outer')

      expect(labelEl(row('outer'))).toHaveStyle({ color: COLORS.modified })
      expect(labelEl(row('inner'))).toHaveStyle({ color: COLORS.added })
      expect(labelEl(row('gone.json'))).toHaveStyle({ color: COLORS.deleted })
    })

    it('colors files by their own status inside a mixed folder', async () => {
      const user = userEvent.setup()
      renderTree()
      await open(user, MODULES, 'get', 'send')

      expect(labelEl(row(API_FILE, 0))).toHaveStyle({ color: COLORS.added })
      expect(labelEl(row(API_FILE, 1))).toHaveStyle({ color: COLORS.modified })
      expect(labelEl(row(META_FILE))).toHaveStyle({ color: COLORS.deleted })
    })
  })

  describe('file icons', () => {
    it.each([
      ['config.json', '{ }', '#e6c84c'],
      ['api.imljson', '{ }', '#e6c84c'],
      ['index.js', 'JS', '#e8d44d'],
      ['index.ts', 'TS', '#3178c6'],
      ['readme.md', 'M', '#519aba'],
      ['style.css', '#', '#56b3b4'],
      ['page.html', '<>', '#e44d26'],
      ['logo.png', 'P', '#a074c4'],
      ['logo.svg', 'S', '#e6a23c'],
      ['notes.txt', null, DEFAULT_ICON_COLOR],
      ['archive.zip', null, DEFAULT_ICON_COLOR],
      ['LICENSE', null, DEFAULT_ICON_COLOR],
      ['trailing.', null, DEFAULT_ICON_COLOR],
      ['README.MD', 'M', '#519aba'],
      ['bundle.min.js', 'JS', '#e8d44d'],
      ['json', null, DEFAULT_ICON_COLOR],
      ['ts', null, DEFAULT_ICON_COLOR]
    ])('draws %s with the letter %j in %s', (name, letter, color) => {
      renderTree({ diffs: [diff(name)] })

      expect(fileIcon(row(name))).toEqual({ letter, color })
    })

    it('draws a file inside a folder like any other file', async () => {
      const user = userEvent.setup()
      renderTree({ diffs: [diff('src/index.ts')] })
      await open(user, 'src')

      expect(fileIcon(row('index.ts'))).toEqual({ letter: 'TS', color: '#3178c6' })
    })
  })

  describe('selection', () => {
    it('marks only the file whose full path is selected', async () => {
      const user = userEvent.setup()
      renderTree({ selectedFile: SEND_PATH })
      await open(user, MODULES, 'get', 'send')

      expect(names()).toEqual([MODULES, 'get', API_FILE, 'send', API_FILE, META_FILE])
      expect(rows().map(isSelected)).toEqual([false, false, false, false, true, false])
      expect(rows().map((item) => item.getAttribute(ARIA_SELECTED))).toEqual([
        null,
        null,
        'false',
        null,
        'true',
        'false'
      ])
    })

    it('selects nothing without a selected file or with an unknown path', () => {
      const { rerender } = renderTree()
      expect(rows().map(isSelected)).toEqual([false, false])
      expect(row(META_FILE)).toHaveAttribute(ARIA_SELECTED, 'false')

      rerender({ selectedFile: 'missing.json' })
      expect(rows().map(isSelected)).toEqual([false, false])
      expect(row(META_FILE)).toHaveAttribute(ARIA_SELECTED, 'false')
    })

    it('never marks a folder as selected, even when its path is the selected file', () => {
      renderTree({ selectedFile: MODULES })

      expect(rows().map(isSelected)).toEqual([false, false])
      expect(row(MODULES)).not.toHaveAttribute(ARIA_SELECTED)
    })

    it('marks the file row and not the folder row when both share a path', () => {
      renderTree({ diffs: sharedPathDiffs, selectedFile: 'icon' })

      const [fileRow, folderRow] = rows()
      expect(isSelected(fileRow)).toBe(true)
      expect(fileRow).toHaveAttribute(ARIA_SELECTED, 'true')
      expect(isSelected(folderRow)).toBe(false)
      expect(folderRow).not.toHaveAttribute(ARIA_SELECTED)
    })

    it('follows the selectedFile prop and does not select on its own', async () => {
      const user = userEvent.setup()
      const { rerender, onFileSelect } = renderTree()

      await user.click(row(META_FILE))
      expect(onFileSelect).toHaveBeenCalledOnce()
      expect(isSelected(row(META_FILE))).toBe(false)

      rerender({ selectedFile: META_FILE })
      expect(isSelected(row(META_FILE))).toBe(true)
      expect(row(META_FILE)).toHaveAttribute(ARIA_SELECTED, 'true')

      rerender({ selectedFile: null })
      expect(isSelected(row(META_FILE))).toBe(false)
    })

    it('keeps a folder collapsed when the selected file is inside it', async () => {
      const user = userEvent.setup()
      const { rerender } = renderTree({ selectedFile: SEND_PATH })

      expect(names()).toEqual([MODULES, META_FILE])
      expect(row(MODULES)).toHaveAttribute(ARIA_EXPANDED, 'false')

      rerender({ selectedFile: GET_PATH })
      expect(names()).toEqual([MODULES, META_FILE])

      await open(user, MODULES, 'get')
      expect(isSelected(row(API_FILE))).toBe(true)
    })
  })

  describe('activation', () => {
    it('calls onFileSelect with the full path of the clicked file', async () => {
      const user = userEvent.setup()
      const { onFileSelect } = renderTree()
      await open(user, MODULES, 'get', 'send')

      await user.click(row(API_FILE, 1))
      expect(onFileSelect.mock.calls).toEqual([[SEND_PATH]])

      await user.click(row(API_FILE, 0))
      expect(onFileSelect.mock.calls).toEqual([[SEND_PATH], [GET_PATH]])
    })

    it('calls onFileSelect again when the selected file is clicked', async () => {
      const user = userEvent.setup()
      const { onFileSelect } = renderTree({ selectedFile: META_FILE })

      await user.click(row(META_FILE))
      expect(onFileSelect.mock.calls).toEqual([[META_FILE]])
    })

    it.each([
      { key: 'Enter', keys: '{Enter}' },
      { key: 'Space', keys: ' ' }
    ])('$key selects the focused file', async ({ keys }) => {
      const user = userEvent.setup()
      const { onFileSelect } = renderTree()

      row(META_FILE).focus()
      await user.keyboard(keys)

      expect(onFileSelect.mock.calls).toEqual([[META_FILE]])
      expect(names()).toEqual([MODULES, META_FILE])
    })

    it.each([
      { key: 'Enter', keys: '{Enter}' },
      { key: 'Space', keys: ' ' }
    ])('$key toggles the focused folder', async ({ keys }) => {
      const user = userEvent.setup()
      const { onFileSelect } = renderTree()

      row(MODULES).focus()
      await user.keyboard(keys)
      expect(names()).toEqual([MODULES, 'get', 'send', META_FILE])
      expect(row(MODULES)).toHaveAttribute(ARIA_EXPANDED, 'true')

      await user.keyboard(keys)
      expect(names()).toEqual([MODULES, META_FILE])
      expect(onFileSelect).not.toHaveBeenCalled()
    })

    it.each(['a', '{ArrowDown}', '{Escape}'])('ignores %s on a file and on a folder', async (keys) => {
      const user = userEvent.setup()
      const { onFileSelect } = renderTree()

      row(META_FILE).focus()
      await user.keyboard(keys)
      row(MODULES).focus()
      await user.keyboard(keys)

      expect(onFileSelect).not.toHaveBeenCalled()
      expect(names()).toEqual([MODULES, META_FILE])
    })

    it('selects the file row of a shared path and toggles its folder row', async () => {
      const user = userEvent.setup()
      const { onFileSelect } = renderTree({ diffs: sharedPathDiffs })
      const [fileRow, folderRow] = rows()

      await user.click(fileRow)
      expect(onFileSelect.mock.calls).toEqual([['icon']])
      expect(names()).toEqual(['icon', 'icon'])

      await user.click(folderRow)
      expect(onFileSelect).toHaveBeenCalledOnce()
      expect(names()).toEqual(['icon', 'icon', 'logo.png'])
    })
  })

  describe('new diffs', () => {
    it('collapses every folder when it receives a new diffs array', async () => {
      const user = userEvent.setup()
      const { rerender } = renderTree()
      await open(user, MODULES, 'send')
      expect(names()).toEqual([MODULES, 'get', 'send', API_FILE, META_FILE])

      rerender({ diffs: [...diffs] })
      expect(names()).toEqual([MODULES, META_FILE])
      expect(row(MODULES)).toHaveAttribute(ARIA_EXPANDED, 'false')
    })

    it('keeps the folders open when only other props change', async () => {
      const user = userEvent.setup()
      const { rerender } = renderTree()
      await open(user, MODULES)

      rerender({ selectedFile: META_FILE })
      rerender({ appName: APP_NAME, fromVersion: '1.0.0', toVersion: '2.0.0' })
      rerender({ viewMode: 'show' })

      expect(names()).toEqual([MODULES, 'get', 'send', META_FILE])
      expect(row(MODULES)).toHaveAttribute(ARIA_EXPANDED, 'true')
    })

    it('lists the rows of the new diffs', () => {
      const { rerender } = renderTree()

      rerender({ diffs: [diff('other/x.json'), diff('y.json')] })

      expect(names()).toEqual(['other', 'y.json'])
      expect(screen.getByText('Changed components (2)')).toBeInTheDocument()
    })
  })

  describe('resizing', () => {
    it('starts 280px wide', () => {
      renderTree()

      expect(panelWidth()).toBe(DEFAULT_WIDTH)
    })

    it('resizes by the distance dragged from where the drag started', () => {
      renderTree()

      expect(startDrag(100)).toBe(false)
      expect(panelWidth()).toBe(DEFAULT_WIDTH)

      dragTo(150)
      expect(panelWidth()).toBe('330px')
      dragTo(60)
      expect(panelWidth()).toBe('240px')
      dragTo(100)
      expect(panelWidth()).toBe(DEFAULT_WIDTH)
    })

    it('shows the resize cursor and blocks text selection until the mouse is released', () => {
      renderTree()
      expect(document.body.style.cursor).toBe('')
      expect(document.body.style.userSelect).toBe('')

      startDrag(100)
      expect(document.body.style.cursor).toBe(COL_RESIZE)
      expect(document.body.style.userSelect).toBe('none')

      dragTo(150)
      expect(document.body.style.cursor).toBe(COL_RESIZE)

      endDrag()
      expect(document.body.style.cursor).toBe('')
      expect(document.body.style.userSelect).toBe('')
      expect(panelWidth()).toBe('330px')
    })

    it.each([
      { moveBy: -400, width: '180px' },
      { moveBy: -101, width: '180px' },
      { moveBy: -100, width: '180px' },
      { moveBy: -99, width: '181px' },
      { moveBy: 0, width: DEFAULT_WIDTH },
      { moveBy: 319, width: '599px' },
      { moveBy: 320, width: '600px' },
      { moveBy: 321, width: '600px' },
      { moveBy: 5000, width: '600px' }
    ])('keeps the width between 180px and 600px when dragged by $moveBy', ({ moveBy, width }) => {
      renderTree()

      startDrag(1000)
      dragTo(1000 + moveBy)

      expect(panelWidth()).toBe(width)
    })

    it('recovers from a clamped width as soon as the pointer comes back in range', () => {
      renderTree()

      startDrag(1000)
      dragTo(9000)
      expect(panelWidth()).toBe('600px')
      dragTo(1050)
      expect(panelWidth()).toBe('330px')
      dragTo(-9000)
      expect(panelWidth()).toBe('180px')
      dragTo(1000)
      expect(panelWidth()).toBe(DEFAULT_WIDTH)
    })

    it('ignores mouse moves when no drag is going on', () => {
      renderTree()

      dragTo(500)
      expect(panelWidth()).toBe(DEFAULT_WIDTH)
      expect(document.body.style.cursor).toBe('')
    })

    it('stops resizing and removes its listeners on mouseup', () => {
      renderTree()
      const listeners = watchDocumentListeners()

      startDrag(100)
      dragTo(150)
      expect(listeners.addedTypes()).toEqual(expect.arrayContaining(['mousemove', 'mouseup']))
      expect(listeners.stillListening()).toEqual(expect.arrayContaining(['mousemove', 'mouseup']))

      endDrag()
      expect(listeners.stillListening()).toEqual([])

      dragTo(400)
      expect(panelWidth()).toBe('330px')
    })

    it('starts the next drag from the width the panel has now', () => {
      renderTree()

      startDrag(100)
      dragTo(150)
      endDrag()
      expect(panelWidth()).toBe('330px')

      startDrag(500)
      dragTo(520)
      expect(panelWidth()).toBe('350px')
      endDrag()

      startDrag(500)
      dragTo(0)
      expect(panelWidth()).toBe('180px')
    })

    it('ends overlapping drags with a single mouseup', () => {
      renderTree()
      const listeners = watchDocumentListeners()

      startDrag(100)
      startDrag(200)
      endDrag()
      dragTo(400)

      expect(panelWidth()).toBe(DEFAULT_WIDTH)
      expect(document.body.style.cursor).toBe('')
      expect(document.body.style.userSelect).toBe('')
      expect(listeners.stillListening()).toEqual([])
    })

    it('clears the body styles and the listeners when the mouse is released after unmounting mid-drag', () => {
      const { unmount } = renderTree()
      const listeners = watchDocumentListeners()

      startDrag(100)
      unmount()
      endDrag()

      expect(document.body.style.cursor).toBe('')
      expect(document.body.style.userSelect).toBe('')
      expect(listeners.stillListening()).toEqual([])
    })

    it('keeps the dragged width while the empty state is shown', () => {
      const { rerender } = renderTree()
      startDrag(100)
      dragTo(150)
      endDrag()

      rerender({ diffs: [] })
      expect(screen.getByText(NO_CHANGES)).toBeInTheDocument()

      rerender({ diffs })
      expect(panelWidth()).toBe('330px')
    })

    it('resizes with the drag handle and clamps the width', () => {
      const { container } = render(<FileTree diffs={diffs} selectedFile={null} onFileSelect={vi.fn()} />)
      const tree = container.querySelector<HTMLElement>(PANEL)
      const resizeHandle = container.querySelector<HTMLElement>(HANDLE)
      if (!tree || !resizeHandle) throw new Error('file tree not rendered')

      fireEvent.mouseDown(resizeHandle, { clientX: 100 })
      expect(document.body.style.cursor).toBe(COL_RESIZE)
      fireEvent.mouseMove(document, { clientX: 150 })
      expect(tree.style.width).toBe('330px')
      fireEvent.mouseMove(document, { clientX: 5000 })
      expect(tree.style.width).toBe('600px')
      fireEvent.mouseUp(document)

      expect(document.body.style.cursor).toBe('')
    })
  })
})
