import { useEffect } from 'react'
import { beforeEach, describe, it, expect, onTestFinished, vi, type MockInstance } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DiffViewer from '../DiffViewer'
import ToastContainer from '../Toast'
import { editorHandles } from '../../__tests__/mocks/monaco'
import { mockApi, ok, type ApiMock } from '../../__tests__/mocks/window-api'
import type { FileDiff } from '../../shared/types'

type Props = Parameters<typeof DiffViewer>[0]

const NO_DIFFS = 'No differences found'
const SELECT_FILE = 'Select a file to view'
const INVALID_IMAGE = 'Invalid image data'
const NOT_AN_IMAGE = 'Not an image'
const COPY_DIFF_TITLE = 'Copy unified diff'
const COPY_CONTENT_TITLE = 'Copy file content'
const EXPAND_TITLE = 'Expand all hidden regions'
const COLLAPSE_TITLE = 'Collapse all regions'
const VSCODE_TITLE = 'Open in VS Code diff'
const EXPAND_LABEL = 'Expand All'
const COLLAPSE_LABEL = 'Collapse All'
const VSCODE_LABEL = 'VS Code'
const VSCODE_FAILURE = 'Failed to open VS Code'
const COPY_FAILURE = 'Failed to copy to clipboard'
const CHECK_MARK = '✓'
const THEME_ATTR = 'data-theme'
const MODIFIED_ATTR = 'data-modified'
const ORIGINAL_ATTR = 'data-original'
const LANGUAGE_ATTR = 'data-language'
const SIDE_BY_SIDE_ATTR = 'data-side-by-side'
const DARK_THEME = 'makediff-dark'
const LIGHT_THEME = 'makediff-light'
const MAKE_THEME = 'makediff-make'
const FROM = '1.0.0'
const TO = '2.0.0'
const DIFF_EDITOR = 'diff-editor'
const EDITOR = 'editor'
const FIND_WIDGET = 'find-widget'
const TOGGLE = 'monaco-custom-toggle'
const CLOSE_ICON = 'codicon-widget-close'
const PNG = 'data:image/png;base64,iVBORw0KGgo='
const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='
const SVG = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='
const ICO = 'data:image/vnd.microsoft.icon;base64,AAABAAEA'
const EMBEDDED_IMAGE = '{"icon":"data:image/png;base64,AAAA"}'

const COLLAPSED_REGIONS = {
  hideUnchangedRegions: { enabled: true, contextLineCount: 3, minimumLineCount: 8, revealLineCount: 20 }
}
const EXPANDED_REGIONS = { hideUnchangedRegions: { enabled: false } }

const modified: FileDiff = {
  filePath: 'modules/send/api.imljson',
  status: 'modified',
  oldContent: '{"a":1}',
  newContent: '{"a":2}',
  unifiedDiff: '-{"a":1}\n+{"a":2}'
}

const added: FileDiff = {
  filePath: 'modules/new/api.json',
  status: 'added',
  oldContent: '',
  newContent: '{"n":1}',
  unifiedDiff: '+{"n":1}'
}

const deleted: FileDiff = {
  filePath: 'modules/old/code.js',
  status: 'deleted',
  oldContent: '{"o":1}',
  newContent: '',
  unifiedDiff: '-{"o":1}'
}

const unchanged: FileDiff = {
  filePath: 'README.md',
  status: 'unchanged',
  oldContent: '# Same',
  newContent: '# Same',
  unifiedDiff: ' # Same'
}

const image = (status: FileDiff['status'], oldContent: string, newContent: string, filePath = 'assets/icon.png') =>
  ({ filePath, status, oldContent, newContent, unifiedDiff: '' }) satisfies FileDiff

const addedImage = image('added', '', PNG)
const deletedImage = image('deleted', GIF, '', 'assets/old.gif')

const invalidSources = [
  { name: 'an empty payload', src: 'data:image/png;base64,' },
  { name: 'characters outside base64', src: 'data:image/png;base64,iVBOR!!' },
  { name: 'a non-base64 encoding', src: 'data:image/svg+xml;utf8,<svg></svg>' },
  { name: 'markup after the payload', src: 'data:image/png;base64,iVBORw0KGgo=" onerror="alert(1)' },
  { name: 'a trailing newline', src: PNG + '\n' },
  { name: 'an upper case mime type', src: 'data:image/PNG;base64,iVBORw0KGgo=' }
]

const showing = (diff: FileDiff, extra: Partial<Props> = {}): Partial<Props> => ({
  diffs: [diff],
  selectedFile: diff.filePath,
  ...extra
})

function renderViewer(props: Partial<Props> = {}) {
  const base: Props = { diffs: [modified], selectedFile: modified.filePath }
  let current: Props = { ...base, ...props }
  const ui = () => (
    <>
      <DiffViewer {...current} />
      <ToastContainer />
    </>
  )
  const view = render(ui())
  const rerender = (next: Partial<Props>) => {
    current = { ...current, ...next }
    view.rerender(ui())
  }
  return { container: view.container, rerender, unmount: view.unmount }
}

const diffEditor = () => screen.getByTestId(DIFF_EDITOR)
const singleEditor = () => screen.getByTestId(EDITOR)
const copyButton = () => screen.getByRole('button', { name: /^(Copy|✓)$/ })
const vsCodeButton = () => screen.getByRole('button', { name: VSCODE_LABEL })
const expandButton = () => screen.getByRole('button', { name: /^(Expand|Collapse) All$/ })
const queryExpandButton = () => screen.queryByRole('button', { name: /^(Expand|Collapse) All$/ })
const regionUpdates = () => editorHandles.diffEditor.updateOptions
const toastTexts = () => Array.from(document.querySelectorAll('.toast-text')).map((el) => el.textContent)
const pathBar = () => document.querySelector('.diff-file-path') as HTMLElement
const pathTrail = () =>
  Array.from(pathBar().querySelectorAll('span'))
    .filter((el) => el.childElementCount === 0 && !el.closest('button'))
    .map((el) => el.textContent)
const pathSegments = () => pathTrail().filter((text) => text !== '/')
const pathNames = () => Array.from(pathBar().querySelectorAll('.diff-file-path-name')).map((el) => el.textContent)
const sideOf = (label: 'Before' | 'After') => screen.getByText(label).closest('.media-diff-side') as HTMLElement

async function expectErrorToast(message: string) {
  const text = await screen.findByText(message)
  expect(text.closest('.toast')).toHaveClass('toast-error')
}

function expectSide(label: 'Before' | 'After', src: string | null) {
  const side = sideOf(label)
  if (src === null) {
    expect(within(side).getByText(NOT_AN_IMAGE)).toBeInTheDocument()
    expect(side.querySelector('img')).not.toBeInTheDocument()
    return
  }
  expect(within(side).getByRole('img')).toHaveAttribute('src', src)
  expect(within(side).queryByText(NOT_AN_IMAGE)).not.toBeInTheDocument()
}

function expectPresence(element: HTMLElement | null, present: boolean) {
  if (present) {
    expect(element).toBeInTheDocument()
  } else {
    expect(element).not.toBeInTheDocument()
  }
}

function mountTarget(rootClass: string, chain: string[]) {
  const root = document.createElement('div')
  root.className = rootClass
  document.body.append(root)
  onTestFinished(() => root.remove())
  let parent: HTMLElement = root
  for (const className of chain) {
    const el = document.createElement('span')
    el.className = className
    parent.append(el)
    parent = el
  }
  return parent
}

function watchMouseover() {
  const probe = vi.fn()
  document.addEventListener('mouseover', probe, true)
  onTestFinished(() => document.removeEventListener('mouseover', probe, true))
  return probe
}

function ThemeSetter({ theme }: Readonly<{ theme: string }>) {
  useEffect(() => {
    document.documentElement.setAttribute(THEME_ATTR, theme)
  }, [theme])
  return null
}

describe('DiffViewer empty states', () => {
  it('shows an empty state without diffs', () => {
    renderViewer({ diffs: [], selectedFile: null })
    expect(screen.getByText(NO_DIFFS)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('prefers the empty state over the file prompt when a file is selected but there are no diffs', () => {
    renderViewer({ diffs: [], selectedFile: modified.filePath })
    expect(screen.getByText(NO_DIFFS)).toBeInTheDocument()
    expect(screen.queryByText(SELECT_FILE)).not.toBeInTheDocument()
  })

  it.each([
    { name: 'nothing', selectedFile: null },
    { name: 'an empty path', selectedFile: '' },
    { name: 'a path that is not in the diffs', selectedFile: 'modules/missing/api.json' }
  ])('asks to select a file when the selection is $name', ({ selectedFile }) => {
    renderViewer({ diffs: [modified, added], selectedFile })

    expect(screen.getByText(SELECT_FILE)).toBeInTheDocument()
    expect(screen.queryByText(NO_DIFFS)).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByTestId(DIFF_EDITOR)).not.toBeInTheDocument()
  })

  it('follows the selection through the diff list, back to the prompt and to the empty state', () => {
    const { rerender } = renderViewer({ diffs: [modified, added, deleted] })
    expect(diffEditor()).toHaveAttribute(MODIFIED_ATTR, modified.newContent)

    rerender({ selectedFile: added.filePath })
    expect(diffEditor()).toHaveAttribute(MODIFIED_ATTR, added.newContent)

    rerender({ selectedFile: null })
    expect(screen.getByText(SELECT_FILE)).toBeInTheDocument()
    expect(screen.queryByTestId(DIFF_EDITOR)).not.toBeInTheDocument()

    rerender({ selectedFile: deleted.filePath })
    expect(diffEditor()).toHaveAttribute(ORIGINAL_ATTR, deleted.oldContent)

    rerender({ diffs: [] })
    expect(screen.getByText(NO_DIFFS)).toBeInTheDocument()
    expect(screen.queryByTestId(DIFF_EDITOR)).not.toBeInTheDocument()
  })

  it('picks the content of the selected file when the diffs are replaced', () => {
    const { rerender } = renderViewer()
    expect(diffEditor()).toHaveAttribute(MODIFIED_ATTR, modified.newContent)

    rerender({ diffs: [{ ...modified, newContent: '{"a":3}' }] })
    expect(diffEditor()).toHaveAttribute(MODIFIED_ATTR, '{"a":3}')
  })
})

describe('DiffViewer header path', () => {
  it.each([
    { file: 'api.json', segments: ['api.json'], name: 'api.json' },
    {
      file: modified.filePath,
      segments: ['modules', '/', 'send', '/', 'api.imljson'],
      name: 'api.imljson'
    },
    { file: '/rooted/file.json', segments: ['', '/', 'rooted', '/', 'file.json'], name: 'file.json' }
  ])('splits $file into segments and marks only the last one as the file name', ({ file, segments, name }) => {
    renderViewer(showing({ ...modified, filePath: file }))

    expect(pathTrail()).toEqual(segments)
    expect(pathNames()).toEqual([name])
  })

  it('renders repeated path segments without duplicate key warnings', () => {
    const consoleError = vi.spyOn(console, 'error').mockReturnValue(undefined)

    renderViewer(showing({ ...modified, filePath: 'a/a/a.json' }))

    expect(pathSegments()).toEqual(['a', 'a', 'a.json'])
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('rebuilds the path when the selection changes to shorter and longer paths', () => {
    const paths = ['a/b/c/d.json', 'e.json', 'f/g.json', 'p/q.json', 'h/i/j/k/l.json', 'm/n/o.json']
    const diffs = paths.map((filePath) => ({ ...modified, filePath }))
    const { rerender } = renderViewer({ diffs, selectedFile: paths[0] })
    expect(pathTrail()).toEqual(['a', '/', 'b', '/', 'c', '/', 'd.json'])

    rerender({ selectedFile: paths[1] })
    expect(pathTrail()).toEqual(['e.json'])
    expect(pathNames()).toEqual(['e.json'])

    rerender({ selectedFile: paths[2] })
    expect(pathTrail()).toEqual(['f', '/', 'g.json'])
    expect(pathNames()).toEqual(['g.json'])

    rerender({ selectedFile: paths[3] })
    expect(pathTrail()).toEqual(['p', '/', 'q.json'])
    expect(pathNames()).toEqual(['q.json'])

    rerender({ selectedFile: paths[4] })
    expect(pathTrail()).toEqual(['h', '/', 'i', '/', 'j', '/', 'k', '/', 'l.json'])
    expect(pathNames()).toEqual(['l.json'])

    rerender({ selectedFile: paths[5] })
    expect(pathTrail()).toEqual(['m', '/', 'n', '/', 'o.json'])
    expect(pathNames()).toEqual(['o.json'])
  })
})

describe('DiffViewer text editors', () => {
  it('renders a side-by-side diff editor with the file language and the current theme', () => {
    document.documentElement.setAttribute(THEME_ATTR, 'light')
    renderViewer()

    const editor = diffEditor()
    expect(editor).toHaveAttribute(LANGUAGE_ATTR, 'imljson')
    expect(editor).toHaveAttribute(THEME_ATTR, LIGHT_THEME)
    expect(editor).toHaveAttribute(ORIGINAL_ATTR, '{"a":1}')
    expect(editor).toHaveAttribute(MODIFIED_ATTR, '{"a":2}')
    expect(editor).toHaveAttribute(SIDE_BY_SIDE_ATTR, 'true')
    expect(screen.queryByTestId(EDITOR)).not.toBeInTheDocument()
  })

  it.each([
    { name: 'a modified', diff: modified, sideBySide: 'true' },
    { name: 'an unchanged', diff: unchanged, sideBySide: 'true' },
    { name: 'an added', diff: added, sideBySide: 'false' },
    { name: 'a deleted', diff: deleted, sideBySide: 'false' }
  ])('gives $name file its original and modified content, side by side: $sideBySide', ({ diff, sideBySide }) => {
    renderViewer(showing(diff))

    const editor = diffEditor()
    expect(editor).toHaveAttribute(ORIGINAL_ATTR, diff.oldContent)
    expect(editor).toHaveAttribute(MODIFIED_ATTR, diff.newContent)
    expect(editor).toHaveAttribute(SIDE_BY_SIDE_ATTR, sideBySide)
  })

  it('treats the default view mode as diff', () => {
    renderViewer(showing(modified, { viewMode: 'diff' }))
    expect(diffEditor()).toHaveAttribute(SIDE_BY_SIDE_ATTR, 'true')
    expect(screen.queryByTestId(EDITOR)).not.toBeInTheDocument()
  })

  it('renders added files inline and show mode as a single editor', () => {
    const { rerender } = renderViewer(showing(added))
    expect(diffEditor()).toHaveAttribute(SIDE_BY_SIDE_ATTR, 'false')

    rerender({ viewMode: 'show' })
    expect(screen.queryByTestId(DIFF_EDITOR)).not.toBeInTheDocument()
    expect(singleEditor()).toHaveAttribute('data-value', added.newContent)
  })

  it.each([
    { name: 'a modified file shows its new content', diff: modified, value: modified.newContent },
    { name: 'an added file shows its content', diff: added, value: added.newContent },
    { name: 'an unchanged file shows its content', diff: unchanged, value: unchanged.newContent },
    { name: 'a deleted file shows an empty editor, not its old content', diff: deleted, value: '' }
  ])('in show mode $name', ({ diff, value }) => {
    renderViewer(showing(diff, { viewMode: 'show' }))

    expect(singleEditor()).toHaveAttribute('data-value', value)
    expect(screen.queryByTestId(DIFF_EDITOR)).not.toBeInTheDocument()
  })

  it.each([
    { file: 'data/config.json', language: 'json' },
    { file: modified.filePath, language: 'imljson' },
    { file: 'src/app.js', language: 'javascript' },
    { file: 'src/app.ts', language: 'typescript' },
    { file: 'docs/README.md', language: 'markdown' },
    { file: 'DATA/CONFIG.JSON', language: 'json' },
    { file: 'notes.txt', language: 'plaintext' },
    { file: 'LICENSE', language: 'plaintext' }
  ])('passes the $language language of $file to the diff editor and to the show editor', ({ file, language }) => {
    const { rerender } = renderViewer(showing({ ...modified, filePath: file }))
    expect(diffEditor()).toHaveAttribute(LANGUAGE_ATTR, language)

    rerender({ viewMode: 'show' })
    expect(singleEditor()).toHaveAttribute(LANGUAGE_ATTR, language)
  })

  it('uses the language of the newly selected file', () => {
    const { rerender } = renderViewer({ diffs: [modified, deleted] })
    expect(diffEditor()).toHaveAttribute(LANGUAGE_ATTR, 'imljson')

    rerender({ selectedFile: deleted.filePath })
    expect(diffEditor()).toHaveAttribute(LANGUAGE_ATTR, 'javascript')
  })

  it.each([
    { name: 'new', embedded: { ...modified, newContent: EMBEDDED_IMAGE } },
    { name: 'old', embedded: { ...modified, oldContent: EMBEDDED_IMAGE } }
  ])('does not treat $name text that merely mentions an image data URI as an image', ({ embedded }) => {
    const { container } = renderViewer(showing(embedded))

    expect(diffEditor()).toHaveAttribute(ORIGINAL_ATTR, embedded.oldContent)
    expect(diffEditor()).toHaveAttribute(MODIFIED_ATTR, embedded.newContent)
    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(expandButton()).toBeInTheDocument()
  })
})

describe('DiffViewer theme', () => {
  const variants = [
    { name: 'side-by-side diff editor', props: showing(modified), testId: DIFF_EDITOR },
    { name: 'inline diff editor', props: showing(added), testId: DIFF_EDITOR },
    { name: 'show-mode editor', props: showing(modified, { viewMode: 'show' }), testId: EDITOR }
  ]

  it.each([
    { attr: null, expected: DARK_THEME },
    { attr: '', expected: DARK_THEME },
    { attr: 'dark', expected: DARK_THEME },
    { attr: 'make', expected: MAKE_THEME },
    { attr: 'light', expected: LIGHT_THEME }
  ])('starts with $expected when data-theme is $attr', ({ attr, expected }) => {
    if (attr !== null) document.documentElement.setAttribute(THEME_ATTR, attr)
    renderViewer()
    expect(diffEditor()).toHaveAttribute(THEME_ATTR, expected)
  })

  it.each(variants)('follows data-theme changes in the $name', async ({ props, testId }) => {
    renderViewer(props)
    const theme = () => screen.getByTestId(testId)
    expect(theme()).toHaveAttribute(THEME_ATTR, DARK_THEME)

    act(() => document.documentElement.setAttribute(THEME_ATTR, 'make'))
    await waitFor(() => expect(theme()).toHaveAttribute(THEME_ATTR, MAKE_THEME))

    act(() => document.documentElement.setAttribute(THEME_ATTR, 'light'))
    await waitFor(() => expect(theme()).toHaveAttribute(THEME_ATTR, LIGHT_THEME))

    act(() => document.documentElement.removeAttribute(THEME_ATTR))
    await waitFor(() => expect(theme()).toHaveAttribute(THEME_ATTR, DARK_THEME))
  })

  it('follows data-theme changes through the MutationObserver', async () => {
    renderViewer()
    expect(diffEditor()).toHaveAttribute(THEME_ATTR, DARK_THEME)

    act(() => document.documentElement.setAttribute(THEME_ATTR, 'make'))

    await waitFor(() => expect(diffEditor()).toHaveAttribute(THEME_ATTR, MAKE_THEME))
  })

  it('picks up a theme that a sibling applies while the viewer mounts', () => {
    render(
      <>
        <ThemeSetter theme="light" />
        <DiffViewer diffs={[modified]} selectedFile={modified.filePath} />
      </>
    )

    expect(diffEditor()).toHaveAttribute(THEME_ATTR, LIGHT_THEME)
  })

  it('stops observing the theme when it unmounts', () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const { unmount } = renderViewer()
    expect(disconnect).not.toHaveBeenCalled()

    unmount()

    expect(disconnect).toHaveBeenCalledOnce()
  })
})

describe('DiffViewer find widget tooltips', () => {
  it.each([
    { name: 'a toggle', chain: [TOGGLE] },
    { name: 'a close icon', chain: [CLOSE_ICON] },
    { name: 'a child of a toggle', chain: [TOGGLE, 'codicon'] },
    { name: 'a toggle nested deeper in the widget', chain: ['find-widget-row', TOGGLE] }
  ])('swallows mouseover on $name inside the find widget', ({ chain }) => {
    renderViewer()
    const probe = watchMouseover()

    fireEvent.mouseOver(mountTarget(FIND_WIDGET, chain))

    expect(probe).not.toHaveBeenCalled()
  })

  it.each([
    { name: 'another control of the find widget', root: FIND_WIDGET, chain: ['monaco-button'] },
    { name: 'a toggle outside the find widget', root: 'suggest-widget', chain: [TOGGLE] },
    { name: 'a close icon outside the find widget', root: 'suggest-widget', chain: [CLOSE_ICON] }
  ])('lets mouseover on $name through', ({ root, chain }) => {
    renderViewer()
    const probe = watchMouseover()
    const target = mountTarget(root, chain)

    fireEvent.mouseOver(target)

    expect(probe).toHaveBeenCalledOnce()
    expect(probe.mock.calls[0][0].target).toBe(target)
  })

  it('lets a mouseover through whose target is not an element', () => {
    renderViewer()
    const probe = watchMouseover()

    document.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))

    expect(probe).toHaveBeenCalledOnce()
  })

  it('stops swallowing mouseover once it unmounts', () => {
    const { unmount } = renderViewer()
    const probe = watchMouseover()
    const target = mountTarget(FIND_WIDGET, [TOGGLE])

    fireEvent.mouseOver(target)
    expect(probe).not.toHaveBeenCalled()

    unmount()
    fireEvent.mouseOver(target)
    expect(probe).toHaveBeenCalledOnce()
  })
})

describe('DiffViewer toolbar', () => {
  it.each([
    { name: 'a text diff', props: showing(modified), vsCode: true, expand: true, copyTitle: COPY_DIFF_TITLE },
    {
      name: 'a text diff in show mode',
      props: showing(modified, { viewMode: 'show' }),
      vsCode: false,
      expand: false,
      copyTitle: COPY_CONTENT_TITLE
    },
    { name: 'an added image', props: showing(addedImage), vsCode: false, expand: false, copyTitle: COPY_DIFF_TITLE },
    {
      name: 'a modified image',
      props: showing(image('modified', PNG, GIF)),
      vsCode: false,
      expand: false,
      copyTitle: COPY_DIFF_TITLE
    },
    {
      name: 'an image in show mode',
      props: showing(deletedImage, { viewMode: 'show' }),
      vsCode: false,
      expand: false,
      copyTitle: COPY_CONTENT_TITLE
    }
  ])('offers the right actions for $name', ({ props, vsCode, expand, copyTitle }) => {
    renderViewer(props)

    expect(screen.getByTitle(copyTitle)).toBe(copyButton())
    expectPresence(screen.queryByRole('button', { name: VSCODE_LABEL }), vsCode)
    expectPresence(queryExpandButton(), expand)
  })

  it('labels the actions with their titles', () => {
    renderViewer()

    expect(screen.getByTitle(COPY_DIFF_TITLE)).toHaveTextContent('Copy')
    expect(screen.getByTitle(VSCODE_TITLE)).toHaveTextContent(VSCODE_LABEL)
    expect(screen.getByTitle(EXPAND_TITLE)).toHaveTextContent(EXPAND_LABEL)
  })

  it('swaps the actions when the view mode changes', () => {
    const { rerender } = renderViewer()
    expect(vsCodeButton()).toBeInTheDocument()

    rerender({ viewMode: 'show' })
    expect(screen.queryByRole('button', { name: VSCODE_LABEL })).not.toBeInTheDocument()
    expect(queryExpandButton()).not.toBeInTheDocument()
    expect(screen.getByTitle(COPY_CONTENT_TITLE)).toBe(copyButton())

    rerender({ viewMode: 'diff' })
    expect(vsCodeButton()).toBeInTheDocument()
    expect(screen.getByTitle(COPY_DIFF_TITLE)).toBe(copyButton())
  })
})

describe('DiffViewer copy', () => {
  let user: ReturnType<typeof userEvent.setup>
  let writeText: MockInstance<Clipboard['writeText']>

  // user-event resets its clipboard stub between tests only when vitest globals are on
  beforeEach(async () => {
    user = userEvent.setup()
    await navigator.clipboard.writeText('')
    writeText = vi.spyOn(navigator.clipboard, 'writeText')
  })

  it('copies the unified diff and flips the button to a check mark', async () => {
    renderViewer()
    expect(copyButton()).not.toHaveClass('copied')

    await user.click(screen.getByText('Copy'))

    expect(await navigator.clipboard.readText()).toBe(modified.unifiedDiff)
    expect(await screen.findByText(CHECK_MARK)).toBeInTheDocument()
    expect(copyButton()).toHaveClass('copied')
  })

  it.each([
    { name: 'the unified diff of a modified file', props: showing(modified), expected: modified.unifiedDiff },
    { name: 'the unified diff of an added file', props: showing(added), expected: added.unifiedDiff },
    { name: 'the unified diff of a deleted file', props: showing(deleted), expected: deleted.unifiedDiff },
    { name: 'the unified diff of an unchanged file', props: showing(unchanged), expected: unchanged.unifiedDiff },
    {
      name: 'the unified diff when the diff mode is explicit',
      props: showing(modified, { viewMode: 'diff' }),
      expected: modified.unifiedDiff
    },
    { name: 'the empty diff of an image', props: showing(addedImage), expected: '' },
    {
      name: 'the new content of a modified file in show mode',
      props: showing(modified, { viewMode: 'show' }),
      expected: modified.newContent
    },
    {
      name: 'the content of an added file in show mode',
      props: showing(added, { viewMode: 'show' }),
      expected: added.newContent
    },
    {
      name: 'nothing for a deleted file in show mode, as its new content is empty',
      props: showing(deleted, { viewMode: 'show' }),
      expected: ''
    },
    {
      name: 'the data URI of an added image in show mode',
      props: showing(addedImage, { viewMode: 'show' }),
      expected: PNG
    },
    {
      name: 'nothing for a deleted image in show mode',
      props: showing(deletedImage, { viewMode: 'show' }),
      expected: ''
    }
  ])('copies $name', async ({ props, expected }) => {
    renderViewer(props)

    await user.click(copyButton())

    expect(writeText).toHaveBeenCalledExactlyOnceWith(expected)
    expect(await screen.findByRole('button', { name: CHECK_MARK })).toBeInTheDocument()
  })

  it('copies what is shown after the selection and the mode change', async () => {
    const { rerender } = renderViewer({ diffs: [modified, added], selectedFile: modified.filePath })

    rerender({ selectedFile: added.filePath })
    await user.click(copyButton())
    expect(writeText).toHaveBeenLastCalledWith(added.unifiedDiff)

    rerender({ viewMode: 'show' })
    await user.click(copyButton())
    expect(writeText).toHaveBeenLastCalledWith(added.newContent)
  })

  it('shows the check mark for 1.5 seconds and then goes back to Copy', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    renderViewer()

    fireEvent.click(copyButton())
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(copyButton()).toHaveTextContent(CHECK_MARK)
    expect(copyButton()).toHaveClass('copied')

    act(() => vi.advanceTimersByTime(1499))
    expect(copyButton()).toHaveTextContent(CHECK_MARK)

    act(() => vi.advanceTimersByTime(1))
    expect(copyButton()).toHaveTextContent('Copy')
    expect(copyButton()).not.toHaveClass('copied')
  })

  it('toasts when the clipboard write fails', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    renderViewer()

    await user.click(screen.getByText('Copy'))

    await expectErrorToast('denied')
    expect(copyButton()).toHaveTextContent('Copy')
    expect(screen.queryByText(CHECK_MARK)).not.toBeInTheDocument()
  })

  it('toasts a generic message when the clipboard write rejects with a plain value', async () => {
    writeText.mockRejectedValue('nope')
    renderViewer()

    await user.click(copyButton())

    await expectErrorToast(COPY_FAILURE)
    expect(toastTexts()).toEqual([COPY_FAILURE])
    expect(copyButton()).toHaveTextContent('Copy')
  })

  it('shows no toast when the copy succeeds', async () => {
    renderViewer()

    await user.click(copyButton())

    expect(await screen.findByText(CHECK_MARK)).toBeInTheDocument()
    expect(toastTexts()).toEqual([])
  })
})

describe('DiffViewer open in VS Code', () => {
  const failures: { name: string; arrange: (api: ApiMock) => void; message: string }[] = [
    {
      name: 'the result carries no error text',
      arrange: (api) => api.editor.openDiff.mockResolvedValue({ success: false }),
      message: VSCODE_FAILURE
    },
    {
      name: 'the result carries an empty error text',
      arrange: (api) => api.editor.openDiff.mockResolvedValue({ success: false, error: '' }),
      message: VSCODE_FAILURE
    },
    {
      name: 'the result carries an error text',
      arrange: (api) => api.editor.openDiff.mockResolvedValue({ success: false, error: 'code is not installed' }),
      message: 'code is not installed'
    },
    {
      name: 'the call rejects with an Error',
      arrange: (api) => api.editor.openDiff.mockRejectedValue(new Error('IPC closed')),
      message: 'IPC closed'
    },
    {
      name: 'the call rejects with a plain value',
      arrange: (api) => api.editor.openDiff.mockRejectedValue('boom'),
      message: VSCODE_FAILURE
    }
  ]

  it('opens the diff in VS Code with both versions', async () => {
    const user = userEvent.setup()
    renderViewer({ fromVersion: FROM, toVersion: TO })

    await user.click(screen.getByText(VSCODE_LABEL))

    expect(mockApi().editor.openDiff).toHaveBeenCalledExactlyOnceWith({
      filePath: modified.filePath,
      fromVersion: FROM,
      toVersion: TO,
      oldContent: modified.oldContent,
      newContent: modified.newContent
    })
    expect(toastTexts()).toEqual([])
  })

  it.each([added, deleted, unchanged])('sends the selected $status file, not the first one', async (diff) => {
    const user = userEvent.setup()
    renderViewer({
      diffs: [modified, added, deleted, unchanged],
      selectedFile: diff.filePath,
      fromVersion: FROM,
      toVersion: TO
    })

    await user.click(vsCodeButton())

    expect(mockApi().editor.openDiff).toHaveBeenCalledExactlyOnceWith({
      filePath: diff.filePath,
      fromVersion: FROM,
      toVersion: TO,
      oldContent: diff.oldContent,
      newContent: diff.newContent
    })
  })

  it('sends the versions it has been rerendered with', async () => {
    const user = userEvent.setup()
    const { rerender } = renderViewer({ fromVersion: FROM, toVersion: TO })

    rerender({ fromVersion: '3.0.0', toVersion: '4.0.0' })
    await user.click(vsCodeButton())

    expect(mockApi().editor.openDiff).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ fromVersion: '3.0.0', toVersion: '4.0.0' })
    )
  })

  it('sends the versions and the file it has been rerendered with', async () => {
    const user = userEvent.setup()
    const { rerender } = renderViewer({ diffs: [modified, added], fromVersion: FROM, toVersion: TO })

    rerender({ selectedFile: added.filePath, fromVersion: '3.0.0', toVersion: '4.0.0' })
    await user.click(vsCodeButton())

    expect(mockApi().editor.openDiff).toHaveBeenCalledExactlyOnceWith({
      filePath: added.filePath,
      fromVersion: '3.0.0',
      toVersion: '4.0.0',
      oldContent: added.oldContent,
      newContent: added.newContent
    })
  })

  it.each([
    { name: 'both versions are missing', versions: {} },
    { name: 'the from version is missing', versions: { toVersion: TO } },
    { name: 'the to version is missing', versions: { fromVersion: FROM } },
    { name: 'the from version is empty', versions: { fromVersion: '', toVersion: TO } },
    { name: 'the to version is empty', versions: { fromVersion: FROM, toVersion: '' } }
  ])('keeps the button but does nothing when $name', async ({ versions }) => {
    const user = userEvent.setup()
    renderViewer(versions)

    await user.click(vsCodeButton())

    expect(mockApi().editor.openDiff).not.toHaveBeenCalled()
    expect(toastTexts()).toEqual([])
  })

  it.each(failures)('toasts an error when $name', async ({ arrange, message }) => {
    const user = userEvent.setup()
    arrange(mockApi())
    renderViewer({ fromVersion: FROM, toVersion: TO })

    await user.click(vsCodeButton())

    await expectErrorToast(message)
    expect(toastTexts()).toEqual([message])
  })

  it('shows no toast when VS Code opens', async () => {
    const user = userEvent.setup()
    mockApi().editor.openDiff.mockResolvedValue(ok(undefined))
    renderViewer({ fromVersion: FROM, toVersion: TO })

    await user.click(vsCodeButton())

    await waitFor(() => expect(mockApi().editor.openDiff).toHaveBeenCalledOnce())
    expect(toastTexts()).toEqual([])
  })
})

describe('DiffViewer expand all', () => {
  it('toggles Expand All through the editor options and resets on file switch', async () => {
    const user = userEvent.setup()
    const { rerender } = renderViewer({ diffs: [modified, added] })
    regionUpdates().mockClear()

    await user.click(screen.getByText(EXPAND_LABEL))
    expect(regionUpdates()).toHaveBeenLastCalledWith(EXPANDED_REGIONS)
    expect(screen.getByText(COLLAPSE_LABEL)).toBeInTheDocument()

    rerender({ selectedFile: added.filePath })
    expect(await screen.findByText(EXPAND_LABEL)).toBeInTheDocument()
  })

  it('collapses again with the same region settings the editor starts with', async () => {
    const user = userEvent.setup()
    renderViewer()
    regionUpdates().mockClear()
    expect(expandButton()).toHaveAttribute('title', EXPAND_TITLE)

    await user.click(expandButton())
    expect(regionUpdates()).toHaveBeenCalledExactlyOnceWith(EXPANDED_REGIONS)
    expect(expandButton()).toHaveTextContent(COLLAPSE_LABEL)
    expect(expandButton()).toHaveAttribute('title', COLLAPSE_TITLE)

    await user.click(expandButton())
    expect(regionUpdates()).toHaveBeenCalledTimes(2)
    expect(regionUpdates()).toHaveBeenLastCalledWith(COLLAPSED_REGIONS)
    expect(expandButton()).toHaveTextContent(EXPAND_LABEL)
    expect(expandButton()).toHaveAttribute('title', EXPAND_TITLE)

    await user.click(expandButton())
    expect(regionUpdates()).toHaveBeenLastCalledWith(EXPANDED_REGIONS)
    expect(expandButton()).toHaveTextContent(COLLAPSE_LABEL)
  })

  it('collapses the regions of the editor when another file is selected and expands from scratch', async () => {
    const user = userEvent.setup()
    const { rerender } = renderViewer({ diffs: [modified, added] })
    await user.click(expandButton())
    regionUpdates().mockClear()

    rerender({ selectedFile: added.filePath })

    expect(regionUpdates()).toHaveBeenCalledWith(COLLAPSED_REGIONS)
    expect(expandButton()).toHaveTextContent(EXPAND_LABEL)

    await user.click(expandButton())
    expect(regionUpdates()).toHaveBeenLastCalledWith(EXPANDED_REGIONS)
    expect(expandButton()).toHaveTextContent(COLLAPSE_LABEL)
  })

  it('stays expanded when the same file is rerendered with fresh diffs', async () => {
    const user = userEvent.setup()
    const { rerender } = renderViewer()
    await user.click(expandButton())
    regionUpdates().mockClear()

    rerender({ diffs: [{ ...modified }] })

    expect(expandButton()).toHaveTextContent(COLLAPSE_LABEL)
    expect(regionUpdates()).not.toHaveBeenCalled()
  })

  it('ignores Expand All until the diff editor has mounted', async () => {
    const user = userEvent.setup()
    const mounted = editorHandles.diffEditor
    editorHandles.diffEditor = null as never
    onTestFinished(() => {
      editorHandles.diffEditor = mounted
    })
    renderViewer()

    await user.click(expandButton())

    expect(expandButton()).toHaveTextContent(EXPAND_LABEL)
    expect(mounted.updateOptions).not.toHaveBeenCalled()
  })

  it('keeps the Collapse All label after a trip through show mode', async () => {
    const user = userEvent.setup()
    const { rerender } = renderViewer()
    await user.click(expandButton())

    rerender({ viewMode: 'show' })
    expect(queryExpandButton()).not.toBeInTheDocument()

    rerender({ viewMode: 'diff' })
    expect(expandButton()).toHaveTextContent(COLLAPSE_LABEL)
  })
})

describe('DiffViewer image preview', () => {
  it('previews images instead of mounting an editor', () => {
    renderViewer(showing(addedImage))

    expect(screen.getByRole('img')).toHaveAttribute('src', addedImage.newContent)
    expect(screen.queryByTestId(DIFF_EDITOR)).not.toBeInTheDocument()
    expect(screen.queryByTestId(EDITOR)).not.toBeInTheDocument()
    expect(screen.queryByText(EXPAND_LABEL)).not.toBeInTheDocument()
  })

  it.each([
    { name: 'an added png', diff: image('added', '', PNG), src: PNG },
    { name: 'a deleted gif', diff: image('deleted', GIF, ''), src: GIF },
    { name: 'an added svg', diff: image('added', '', SVG), src: SVG },
    { name: 'a deleted icon', diff: image('deleted', ICO, ''), src: ICO }
  ])('previews $name from the side that exists', ({ diff, src }) => {
    renderViewer(showing(diff))

    expect(screen.getByRole('img')).toHaveAttribute('src', src)
    expect(screen.queryByText(INVALID_IMAGE)).not.toBeInTheDocument()
    expect(screen.queryByText('Before')).not.toBeInTheDocument()
    expect(screen.queryByText('After')).not.toBeInTheDocument()
  })

  it.each(invalidSources)('refuses an added image with $name', ({ src }) => {
    const { container } = renderViewer(showing(image('added', '', src)))

    expect(screen.getByText(INVALID_IMAGE)).toBeInTheDocument()
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it.each(invalidSources)('refuses a deleted image with $name', ({ src }) => {
    const { container } = renderViewer(showing(image('deleted', src, '')))

    expect(screen.getByText(INVALID_IMAGE)).toBeInTheDocument()
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it('shows both sides of a modified image under Before and After', () => {
    renderViewer(showing(image('modified', PNG, GIF)))

    expectSide('Before', PNG)
    expectSide('After', GIF)
    expect(screen.getAllByRole('img').map((img) => img.getAttribute('src'))).toEqual([PNG, GIF])
    expect(screen.queryByText(INVALID_IMAGE)).not.toBeInTheDocument()
  })

  it.each([
    { name: 'an image that became text', old: PNG, now: '{"a":1}', before: PNG, after: null },
    { name: 'text that became an image', old: '{"a":1}', now: GIF, before: null, after: GIF },
    {
      name: 'an image that became another data URI',
      old: PNG,
      now: 'data:text/plain;base64,QUJD',
      before: PNG,
      after: null
    },
    {
      name: 'an image that became an invalid image',
      old: PNG,
      now: 'data:image/png;base64,**',
      before: PNG,
      after: null
    },
    {
      name: 'an invalid image that became an image',
      old: 'data:image/png;base64,**',
      now: GIF,
      before: null,
      after: GIF
    },
    {
      name: 'two invalid images',
      old: 'data:image/png;base64,',
      now: 'data:image/gif;base64,%%',
      before: null,
      after: null
    }
  ])('marks the sides that are not valid images for $name', ({ old, now, before, after }) => {
    renderViewer(showing(image('modified', old, now)))

    expectSide('Before', before)
    expectSide('After', after)
    expect(screen.queryByText(INVALID_IMAGE)).not.toBeInTheDocument()
  })

  it('shows an unchanged image like a modified one', () => {
    renderViewer(showing(image('unchanged', PNG, PNG)))

    expectSide('Before', PNG)
    expectSide('After', PNG)
    expect(screen.queryByTestId(DIFF_EDITOR)).not.toBeInTheDocument()
  })

  it('keeps the preview in show mode', () => {
    renderViewer(showing(addedImage, { viewMode: 'show' }))

    expect(screen.getByRole('img')).toHaveAttribute('src', PNG)
    expect(screen.queryByTestId(EDITOR)).not.toBeInTheDocument()
    expect(screen.queryByTestId(DIFF_EDITOR)).not.toBeInTheDocument()
  })

  it('switches between the preview, the editor and the toolbar with the selection', () => {
    const diffs = [modified, addedImage, deleted]
    const { container, rerender } = renderViewer({ diffs })
    expect(diffEditor()).toBeInTheDocument()
    expect(expandButton()).toBeInTheDocument()
    expect(container.querySelector('img')).not.toBeInTheDocument()

    rerender({ selectedFile: addedImage.filePath })
    expect(screen.getByRole('img')).toHaveAttribute('src', PNG)
    expect(screen.queryByTestId(DIFF_EDITOR)).not.toBeInTheDocument()
    expect(queryExpandButton()).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: VSCODE_LABEL })).not.toBeInTheDocument()

    rerender({ selectedFile: deleted.filePath })
    expect(diffEditor()).toHaveAttribute(ORIGINAL_ATTR, deleted.oldContent)
    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(expandButton()).toBeInTheDocument()
    expect(vsCodeButton()).toBeInTheDocument()
  })

  it('swaps the image when the selection moves between images', () => {
    const diffs = [addedImage, deletedImage, image('modified', PNG, GIF, 'assets/logo.png')]
    const { rerender } = renderViewer({ diffs, selectedFile: addedImage.filePath })
    expect(screen.getByRole('img')).toHaveAttribute('src', PNG)

    rerender({ selectedFile: deletedImage.filePath })
    expect(screen.getByRole('img')).toHaveAttribute('src', GIF)

    rerender({ selectedFile: 'assets/logo.png' })
    expectSide('Before', PNG)
    expectSide('After', GIF)

    rerender({ selectedFile: addedImage.filePath })
    expect(screen.getByRole('img')).toHaveAttribute('src', PNG)
    expect(screen.queryByText('Before')).not.toBeInTheDocument()
  })
})
