import { useCallback, useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VersionTimeline from '../VersionTimeline'
import type { VersionTags } from '../../../preload/index'

type Props = Parameters<typeof VersionTimeline>[0]
type Layout = Record<string, readonly [left: number, width: number]>

const versions = ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '2.0.0']
const V1 = ['1.0.0', '1.1.0', '1.2.0', '1.3.0']
const FROM_LABEL = 'FROM'
const TO_LABEL = 'TO'
const ENV_ITEM = /^(Staging|Production|Stable): v/
const GROUP_LABEL = /^\d+\.x$/
const PRODUCTION_V11 = 'Production: v1.1.0'
const SCROLL_OPTIONS = { inline: 'center', block: 'nearest', behavior: 'smooth' }

const evenLayout = (list: string[]): Layout => Object.fromEntries(list.map((v, i) => [v, [i * 100, 10] as const]))
const LAYOUT = evenLayout(V1)

const centerOf = (layout: Layout, v: string) => layout[v][0] + layout[v][1] / 2
const at = (v: string) => centerOf(LAYOUT, v)

const emptyTags = (tags: Partial<VersionTags> = {}): VersionTags => ({
  staging: [],
  production: [],
  stable: [],
  ...tags
})

function renderTimeline(overrides: Partial<Props> = {}) {
  const onFromChange = vi.fn()
  const onToChange = vi.fn()
  const props: Props = { versions, fromVersion: '', toVersion: '', onFromChange, onToChange }
  const view = render(<VersionTimeline {...props} {...overrides} />)
  const rerender = (next: Partial<Props>) => view.rerender(<VersionTimeline {...props} {...overrides} {...next} />)
  return { onFromChange, onToChange, rerender, unmount: view.unmount, container: view.container }
}

interface StatefulProps {
  list: string[]
  initialFrom: string
  initialTo: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
}

function StatefulTimeline({ list, initialFrom, initialTo, onFrom, onTo }: Readonly<StatefulProps>) {
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  return (
    <VersionTimeline
      versions={list}
      fromVersion={from}
      toVersion={to}
      onFromChange={(v) => {
        onFrom(v)
        setFrom(v)
      }}
      onToChange={(v) => {
        onTo(v)
        setTo(v)
      }}
    />
  )
}

function StableTimeline({ initialFrom, initialTo, onFrom, onTo }: Readonly<Omit<StatefulProps, 'list'>>) {
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const changeFrom = useCallback(
    (v: string) => {
      onFrom(v)
      setFrom(v)
    },
    [onFrom]
  )
  const changeTo = useCallback(
    (v: string) => {
      onTo(v)
      setTo(v)
    },
    [onTo]
  )
  return (
    <VersionTimeline versions={V1} fromVersion={from} toVersion={to} onFromChange={changeFrom} onToChange={changeTo} />
  )
}

function renderStateful(initial: { from?: string; to?: string } = {}, list: string[] = V1) {
  const onFromChange = vi.fn()
  const onToChange = vi.fn()
  const view = render(
    <StatefulTimeline
      list={list}
      initialFrom={initial.from ?? ''}
      initialTo={initial.to ?? ''}
      onFrom={onFromChange}
      onTo={onToChange}
    />
  )
  return { onFromChange, onToChange, container: view.container }
}

function renderStable(initial: { from: string; to: string }) {
  const onFromChange = vi.fn()
  const onToChange = vi.fn()
  render(<StableTimeline initialFrom={initial.from} initialTo={initial.to} onFrom={onFromChange} onTo={onToChange} />)
  return { onFromChange, onToChange }
}

function stubLayout(layout: Layout) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const [left, width] = layout[this.title.slice(1)] ?? [0, 0]
    return { left, width, right: 0, top: 0, bottom: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }
  })
}

const item = (v: string) => screen.getByTitle(`v${v}`)
const titles = () => screen.queryAllByTitle(/^v/).map((el) => el.title)
const labels = () => screen.queryAllByText(/^v/).map((el) => el.textContent)
const groupLabels = () => screen.queryAllByText(GROUP_LABEL).map((el) => el.textContent)
const envItems = () => screen.queryAllByText(ENV_ITEM).map((el) => el.textContent)

const NODE_STATES: Record<string, string> = { 'selected-from': 'from', 'selected-to': 'to', 'in-range': 'range' }

function stateOf(v: string) {
  const node = item(v).querySelector('.version-node')
  return Object.entries(NODE_STATES)
    .filter(([cls]) => node?.classList.contains(cls))
    .map(([, token]) => token)
    .join(' ')
}

const shownVersions = () => titles().map((t) => t.slice(1))
const states = () => Object.fromEntries(shownVersions().map((v) => [v, stateOf(v)]))
const roleOf = (v: string) => within(item(v)).queryByText(/^(FROM|TO)$/)?.textContent ?? ''
const roles = () => Object.fromEntries(shownVersions().map((v) => [v, roleOf(v)]))
const connectors = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.version-timeline-line'), (el) => el.classList.contains('in-range'))
const envRow = (container: HTMLElement) => container.querySelector('.version-timeline-env')
const dragActive = (container: HTMLElement) => container.firstElementChild?.classList.contains('dragging') ?? false

const press = (v: string, init: MouseEventInit = {}) => fireEvent.mouseDown(item(v), init)
const moveTo = (clientX: number) => fireEvent.mouseMove(window, { clientX })
const release = () => fireEvent.mouseUp(window)

const scrollSpy = () => vi.mocked(Element.prototype.scrollIntoView)
const scrolledTitles = () => scrollSpy().mock.contexts.map((el) => (el as HTMLElement).title)

describe('VersionTimeline', () => {
  describe('nodes and major versions', () => {
    it('shows only the latest major when nothing is selected, sorted ascending', () => {
      renderTimeline()
      expect(screen.getAllByText(/^v\d/).map((n) => n.textContent)).toEqual(['v2.0.0'])
      expect(screen.getByText('2.x')).toBeInTheDocument()
    })

    it('shows every version of the latest major, ordered, and hides the older majors', () => {
      renderTimeline({ versions: ['2.1.0', '1.0.0', '2.0.0', '1.5.0', '2.2.0'] })

      expect(labels()).toEqual(['v2.0.0', 'v2.1.0', 'v2.2.0'])
      expect(groupLabels()).toEqual(['2.x'])
    })

    it('orders versions numerically, not alphabetically, and leaves the versions prop untouched', () => {
      const input = ['1.10.0', '1.2.9', '1.9.0', '1.2.0', '1.2.10']
      const original = [...input]

      renderTimeline({ versions: input })

      expect(labels()).toEqual(['v1.2.0', 'v1.2.9', 'v1.2.10', 'v1.9.0', 'v1.10.0'])
      expect(input).toEqual(original)
    })

    it.each([
      { name: 'nothing selected', selection: {}, expected: ['v10.0.0', 'v10.1.0'], group: '10.x' },
      { name: 'TO in 9.x', selection: { toVersion: '9.1.0' }, expected: ['v9.0.0', 'v9.1.0'], group: '9.x' },
      { name: 'FROM in 9.x', selection: { fromVersion: '9.0.0' }, expected: ['v9.0.0', 'v9.1.0'], group: '9.x' },
      { name: 'FROM in 1.x', selection: { fromVersion: '1.0.0' }, expected: ['v1.0.0'], group: '1.x' }
    ])('compares multi-digit majors as numbers with $name', ({ selection, expected, group }) => {
      renderTimeline({ versions: ['1.0.0', '9.0.0', '9.1.0', '10.0.0', '10.1.0'], ...selection })

      expect(labels()).toEqual(expected)
      expect(groupLabels()).toEqual([group])
    })

    it('treats major 0 as a real major', () => {
      const { rerender } = renderTimeline({ versions: ['0.1.0', '0.2.0'] })
      expect(labels()).toEqual(['v0.1.0', 'v0.2.0'])
      expect(groupLabels()).toEqual(['0.x'])

      rerender({ versions: ['0.1.0', '0.2.0', '1.0.0'], toVersion: '0.2.0' })
      expect(labels()).toEqual(['v0.1.0', 'v0.2.0'])
      expect(groupLabels()).toEqual(['0.x'])
    })

    it('follows the major of TO when both ends are selected', () => {
      renderTimeline({ fromVersion: '1.0.0', toVersion: '2.0.0' })

      expect(labels()).toEqual(['v2.0.0'])
      expect(groupLabels()).toEqual(['2.x'])
      expect(roles()).toEqual({ '2.0.0': TO_LABEL })
      expect(states()).toEqual({ '2.0.0': 'to' })
    })

    it('follows the major of FROM when only FROM is selected', () => {
      renderTimeline({ fromVersion: '1.1.0' })

      expect(labels()).toEqual(['v1.0.0', 'v1.1.0', 'v1.2.0', 'v1.3.0'])
      expect(groupLabels()).toEqual(['1.x'])
      expect(roles()).toEqual({ '1.0.0': '', '1.1.0': FROM_LABEL, '1.2.0': '', '1.3.0': '' })
    })

    it('renders no nodes for an empty version list, with or without a selection', () => {
      const { rerender } = renderTimeline({ versions: [] })
      expect(titles()).toEqual([])
      expect(groupLabels()).toEqual([])

      rerender({ fromVersion: '1.0.0', toVersion: '1.1.0' })
      expect(titles()).toEqual([])
      expect(groupLabels()).toEqual([])
    })

    it('uses the first part of a version without dots as its major', () => {
      renderTimeline({ versions: ['2', '3'] })

      expect(labels()).toEqual(['v3'])
      expect(groupLabels()).toEqual(['3.x'])
    })

    describe('a version without a numeric major is not major 0 (getMajor would make it so)', () => {
      it('hides versions that have no numeric major', () => {
        renderTimeline({ versions: ['beta', '1.0.0', '1.1.0'] })

        expect(titles()).toEqual(['v1.0.0', 'v1.1.0'])
      })

      it('does not group a version without a numeric major under major 0', () => {
        renderTimeline({ versions: ['beta', '0.1.0', '0.2.0'], toVersion: '0.1.0' })

        expect(titles()).toEqual(['v0.1.0', 'v0.2.0'])
        expect(groupLabels()).toEqual(['0.x'])
      })

      it('renders nothing when the latest version has no numeric major', () => {
        renderTimeline({ versions: ['0.0.0', 'beta'] })

        expect(titles()).toEqual([])
        expect(groupLabels()).toEqual([])
      })

      it('renders nothing and no environment versions when the selected version has no numeric major', () => {
        const { container } = renderTimeline({
          versions: ['beta', '0.1.0'],
          toVersion: 'beta',
          tags: emptyTags({ staging: ['0.1.0'], production: ['beta'] })
        })

        expect(titles()).toEqual([])
        expect(groupLabels()).toEqual([])
        expect(envRow(container)).toBeNull()
      })

      it('does not list an environment version without a numeric major under major 0', () => {
        const { container } = renderTimeline({ toVersion: '0.1.0', tags: emptyTags({ staging: ['beta'] }) })

        expect(envRow(container)).toBeNull()
      })
    })

    it('labels every node with its version and a matching tooltip', () => {
      renderTimeline({ fromVersion: '1.0.0', toVersion: '1.2.0' })

      expect(titles()).toEqual(['v1.0.0', 'v1.1.0', 'v1.2.0', 'v1.3.0'])
      for (const el of screen.getAllByTitle(/^v/)) {
        expect(within(el).getByText(el.title)).toBeInTheDocument()
      }
    })
  })

  describe('selection markers', () => {
    it('follows the major of the selection and marks FROM/TO and the range between', () => {
      renderTimeline({ fromVersion: '1.0.0', toVersion: '1.2.0' })

      expect(screen.getAllByText(/^v1\./).map((n) => n.textContent)).toEqual(['v1.0.0', 'v1.1.0', 'v1.2.0', 'v1.3.0'])
      expect(roles()).toEqual({ '1.0.0': FROM_LABEL, '1.1.0': '', '1.2.0': TO_LABEL, '1.3.0': '' })
      expect(states()).toEqual({ '1.0.0': 'from', '1.1.0': 'range', '1.2.0': 'to', '1.3.0': '' })
    })

    it('keeps the end markers out of the range and marks a wider range', () => {
      renderTimeline({ fromVersion: '1.0.0', toVersion: '1.3.0' })

      expect(states()).toEqual({ '1.0.0': 'from', '1.1.0': 'range', '1.2.0': 'range', '1.3.0': 'to' })
    })

    it('marks the same range when FROM is above TO', () => {
      renderTimeline({ fromVersion: '1.3.0', toVersion: '1.0.0' })

      expect(roles()).toEqual({ '1.0.0': TO_LABEL, '1.1.0': '', '1.2.0': '', '1.3.0': FROM_LABEL })
      expect(states()).toEqual({ '1.0.0': 'to', '1.1.0': 'range', '1.2.0': 'range', '1.3.0': 'from' })
    })

    it('lights the connectors only between nodes inside the range', () => {
      const { container, rerender } = renderTimeline({ fromVersion: '1.0.0', toVersion: '1.2.0' })
      expect(connectors(container)).toEqual([true, true, false])

      rerender({ fromVersion: '1.1.0', toVersion: '1.2.0' })
      expect(connectors(container)).toEqual([false, true, false])

      rerender({ fromVersion: '1.3.0', toVersion: '1.1.0' })
      expect(connectors(container)).toEqual([false, true, true])
    })

    it('marks one node as FROM and as TO when both ends are the same version', () => {
      const { container } = renderTimeline({ fromVersion: '1.1.0', toVersion: '1.1.0' })

      expect(roles()).toEqual({ '1.0.0': '', '1.1.0': FROM_LABEL, '1.2.0': '', '1.3.0': '' })
      expect(states()).toEqual({ '1.0.0': '', '1.1.0': 'from to', '1.2.0': '', '1.3.0': '' })
      expect(connectors(container)).toEqual([false, false, false])
    })

    it.each([
      { name: 'only FROM', selection: { fromVersion: '1.1.0' }, expected: { '1.1.0': 'from' } },
      { name: 'only TO', selection: { toVersion: '1.2.0' }, expected: { '1.2.0': 'to' } }
    ])('marks no range with $name', ({ selection, expected }) => {
      const { container } = renderTimeline({ ...selection })

      expect(states()).toEqual({ '1.0.0': '', '1.1.0': '', '1.2.0': '', '1.3.0': '', ...expected })
      expect(connectors(container)).toEqual([false, false, false])
    })

    it('marks no range when an end is not in the version list', () => {
      const { container } = renderTimeline({ fromVersion: '1.0.0', toVersion: '1.9.0' })

      expect(roles()).toEqual({ '1.0.0': FROM_LABEL, '1.1.0': '', '1.2.0': '', '1.3.0': '' })
      expect(states()).toEqual({ '1.0.0': 'from', '1.1.0': '', '1.2.0': '', '1.3.0': '' })
      expect(connectors(container)).toEqual([false, false, false])
    })

    it('marks no range when FROM sits in another major than the shown one', () => {
      const { container } = renderTimeline({
        versions: ['1.0.0', '2.0.0', '2.1.0', '2.2.0'],
        fromVersion: '1.0.0',
        toVersion: '2.1.0'
      })

      expect(roles()).toEqual({ '2.0.0': '', '2.1.0': TO_LABEL, '2.2.0': '' })
      expect(states()).toEqual({ '2.0.0': '', '2.1.0': 'to', '2.2.0': '' })
      expect(connectors(container)).toEqual([false, false])
    })
  })

  describe('environment versions', () => {
    it('shows the latest version per environment for the active major', () => {
      renderTimeline({
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        tags: { staging: ['1.3.0', '2.0.0'], production: ['1.1.0'], stable: [] }
      })

      expect(screen.getByText('Staging: v1.3.0')).toBeInTheDocument()
      expect(screen.getByText(PRODUCTION_V11)).toBeInTheDocument()
      expect(screen.queryByText(/^Stable/)).not.toBeInTheDocument()
    })

    it('lists Staging, Production and Stable in that order at their highest numeric version', () => {
      renderTimeline({
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        tags: { stable: ['1.0.0'], production: ['1.1.0', '1.0.0'], staging: ['1.2.0', '1.10.0', '1.9.0', '2.0.0'] }
      })

      expect(envItems()).toEqual(['Staging: v1.10.0', PRODUCTION_V11, 'Stable: v1.0.0'])
    })

    it('follows the active major and hides environments without a version in it', () => {
      const tags = emptyTags({ staging: ['1.3.0', '2.0.0'], production: ['1.1.0'], stable: ['2.1.0', '2.0.0'] })
      const { rerender } = renderTimeline({ fromVersion: '1.0.0', toVersion: '1.1.0', tags })
      expect(envItems()).toEqual(['Staging: v1.3.0', PRODUCTION_V11])

      rerender({ fromVersion: '1.0.0', toVersion: '2.0.0' })
      expect(envItems()).toEqual(['Staging: v2.0.0', 'Stable: v2.1.0'])
    })

    it('shows the latest versions of the latest major when nothing is selected', () => {
      renderTimeline({ tags: emptyTags({ staging: ['1.3.0', '2.0.0'], production: ['1.1.0'] }) })

      expect(envItems()).toEqual(['Staging: v2.0.0'])
    })

    it('shows environment versions that are not in the version list', () => {
      renderTimeline({ fromVersion: '1.0.0', tags: emptyTags({ production: ['1.7.0'] }) })

      expect(envItems()).toEqual(['Production: v1.7.0'])
    })

    it('does not filter by major when there is no version to take a major from', () => {
      renderTimeline({
        versions: [],
        tags: emptyTags({ staging: ['1.0.0', '2.5.0'], production: ['3.1.0', '1.0.0'], stable: ['0.9.0'] })
      })

      expect(envItems()).toEqual(['Staging: v2.5.0', 'Production: v3.1.0', 'Stable: v0.9.0'])
    })

    it('ignores environments whose value is not an array', () => {
      renderTimeline({
        fromVersion: '1.0.0',
        tags: { staging: undefined, production: null, stable: ['1.0.0'] } as unknown as VersionTags
      })

      expect(envItems()).toEqual(['Stable: v1.0.0'])
    })

    it.each([
      { name: 'there are no tags', tags: undefined },
      { name: 'every environment is empty', tags: emptyTags() },
      {
        name: 'no environment has a version in the active major',
        tags: emptyTags({ staging: ['2.0.0'], stable: ['3.0.0'] })
      },
      { name: 'the values are not arrays', tags: {} as VersionTags }
    ])('renders no environment row when $name', ({ tags }) => {
      const { container } = renderTimeline({ fromVersion: '1.0.0', toVersion: '1.1.0', tags })

      expect(envItems()).toEqual([])
      expect(envRow(container)).toBeNull()
    })

    it('renders the environment row above the nodes only when something is shown', () => {
      const { container } = renderTimeline({ fromVersion: '1.0.0', tags: emptyTags({ staging: ['1.1.0'] }) })

      expect(envRow(container)).toBeInTheDocument()
      expect(envRow(container)).toHaveTextContent('Staging: v1.1.0')
    })
  })

  describe('clicking', () => {
    it('sets FROM when nothing is selected', async () => {
      const user = userEvent.setup()
      const { onFromChange, onToChange } = renderTimeline({ versions: V1 })

      await user.click(item('1.2.0'))

      expect(onFromChange).toHaveBeenCalledExactlyOnceWith('1.2.0')
      expect(onToChange).not.toHaveBeenCalled()
    })

    it('sets TO when only FROM is set', async () => {
      const user = userEvent.setup()
      const { onFromChange, onToChange } = renderTimeline({ fromVersion: '1.0.0', toVersion: '' })

      await user.click(item('1.2.0'))

      expect(onToChange).toHaveBeenCalledExactlyOnceWith('1.2.0')
      expect(onFromChange).not.toHaveBeenCalled()
    })

    it('sets FROM when only TO is set', async () => {
      const user = userEvent.setup()
      const { onFromChange, onToChange } = renderTimeline({ fromVersion: '', toVersion: '1.2.0' })

      await user.click(item('1.0.0'))

      expect(onFromChange).toHaveBeenCalledExactlyOnceWith('1.0.0')
      expect(onToChange).not.toHaveBeenCalled()
    })

    it.each([
      { name: 'nearer to FROM', from: '1.0.0', to: '1.3.0', click: '1.1.0', changed: 'from' },
      { name: 'nearer to TO', from: '1.0.0', to: '1.3.0', click: '1.2.0', changed: 'to' },
      { name: 'equally far, FROM below TO', from: '1.0.0', to: '1.2.0', click: '1.1.0', changed: 'from' },
      { name: 'equally far, FROM above TO', from: '1.2.0', to: '1.0.0', click: '1.1.0', changed: 'from' },
      { name: 'nearer to TO, FROM above TO', from: '1.3.0', to: '1.0.0', click: '1.1.0', changed: 'to' },
      { name: 'nearer to FROM, FROM above TO', from: '1.3.0', to: '1.0.0', click: '1.2.0', changed: 'from' },
      { name: 'past the TO end', from: '1.0.0', to: '1.1.0', click: '1.3.0', changed: 'to' },
      { name: 'before the FROM end', from: '1.2.0', to: '1.3.0', click: '1.0.0', changed: 'from' }
    ])('with both ends set replaces the closer one when the click is $name', async ({ from, to, click, changed }) => {
      const user = userEvent.setup()
      const { onFromChange, onToChange } = renderTimeline({ fromVersion: from, toVersion: to })
      const [replaced, untouched] = changed === 'from' ? [onFromChange, onToChange] : [onToChange, onFromChange]

      await user.click(item(click))

      expect(replaced).toHaveBeenCalledExactlyOnceWith(click)
      expect(untouched).not.toHaveBeenCalled()
    })

    it('counts a FROM outside the shown major as sitting before the first node', async () => {
      const user = userEvent.setup()
      const list = ['1.0.0', '2.0.0', '2.1.0', '2.2.0']
      const { onFromChange, onToChange } = renderTimeline({ versions: list, fromVersion: '1.0.0', toVersion: '2.1.0' })

      await user.click(item('2.0.0'))
      expect(onFromChange).toHaveBeenLastCalledWith('2.0.0')
      expect(onToChange).not.toHaveBeenCalled()

      await user.click(item('2.2.0'))
      expect(onToChange).toHaveBeenLastCalledWith('2.2.0')
      expect(onFromChange).toHaveBeenCalledTimes(1)
    })

    it('compares positions inside the shown major only', async () => {
      const user = userEvent.setup()
      const list = ['1.0.0', '1.1.0', '2.0.0', '2.1.0', '2.2.0', '2.3.0']
      const { onFromChange, onToChange } = renderTimeline({ versions: list, fromVersion: '2.0.0', toVersion: '2.3.0' })

      await user.click(item('2.2.0'))

      expect(onToChange).toHaveBeenCalledExactlyOnceWith('2.2.0')
      expect(onFromChange).not.toHaveBeenCalled()
    })

    it('clears the end that is clicked again', async () => {
      const user = userEvent.setup()
      const { onFromChange, onToChange } = renderTimeline({ fromVersion: '1.0.0', toVersion: '1.3.0' })

      await user.click(item('1.0.0'))
      expect(onFromChange).toHaveBeenCalledExactlyOnceWith('')
      expect(onToChange).not.toHaveBeenCalled()

      await user.click(item('1.3.0'))
      expect(onToChange).toHaveBeenCalledExactlyOnceWith('')
      expect(onFromChange).toHaveBeenCalledTimes(1)
    })

    it.each([
      { name: 'only FROM is set', selection: { fromVersion: '1.1.0' }, clear: 'from' },
      { name: 'only TO is set', selection: { toVersion: '1.1.0' }, clear: 'to' },
      { name: 'both ends are the same version', selection: { fromVersion: '1.1.0', toVersion: '1.1.0' }, clear: 'from' }
    ])('clears the selected end when $name', async ({ selection, clear }) => {
      const user = userEvent.setup()
      const { onFromChange, onToChange } = renderTimeline(selection)
      const [cleared, untouched] = clear === 'from' ? [onFromChange, onToChange] : [onToChange, onFromChange]

      await user.click(item('1.1.0'))

      expect(cleared).toHaveBeenCalledExactlyOnceWith('')
      expect(untouched).not.toHaveBeenCalled()
    })

    it('walks through selecting FROM, TO, replacing the closer end and deselecting', async () => {
      const user = userEvent.setup()
      const { onFromChange, onToChange } = renderStateful()

      await user.click(item('1.1.0'))
      expect(roles()).toEqual({ '1.0.0': '', '1.1.0': FROM_LABEL, '1.2.0': '', '1.3.0': '' })

      await user.click(item('1.3.0'))
      expect(roles()).toEqual({ '1.0.0': '', '1.1.0': FROM_LABEL, '1.2.0': '', '1.3.0': TO_LABEL })
      expect(states()).toEqual({ '1.0.0': '', '1.1.0': 'from', '1.2.0': 'range', '1.3.0': 'to' })

      await user.click(item('1.0.0'))
      expect(roles()).toEqual({ '1.0.0': FROM_LABEL, '1.1.0': '', '1.2.0': '', '1.3.0': TO_LABEL })
      expect(states()).toEqual({ '1.0.0': 'from', '1.1.0': 'range', '1.2.0': 'range', '1.3.0': 'to' })

      await user.click(item('1.0.0'))
      expect(roles()).toEqual({ '1.0.0': '', '1.1.0': '', '1.2.0': '', '1.3.0': TO_LABEL })

      await user.click(item('1.3.0'))
      expect(roles()).toEqual({ '1.0.0': '', '1.1.0': '', '1.2.0': '', '1.3.0': '' })

      expect(onFromChange.mock.calls).toEqual([['1.1.0'], ['1.0.0'], ['']])
      expect(onToChange.mock.calls).toEqual([['1.3.0'], ['']])
    })

    it('ignores clicks while a drag is in progress', () => {
      const { onFromChange, onToChange } = renderTimeline({ versions: V1, fromVersion: '1.0.0', toVersion: '1.1.0' })

      press('1.1.0')
      fireEvent.click(item('1.3.0'))
      expect(onFromChange).not.toHaveBeenCalled()
      expect(onToChange).not.toHaveBeenCalled()

      release()
      fireEvent.click(item('1.3.0'))
      expect(onToChange).toHaveBeenCalledExactlyOnceWith('1.3.0')
      expect(onFromChange).not.toHaveBeenCalled()
    })
  })

  describe('dragging', () => {
    it('drags the TO node to another version using the node positions', () => {
      stubLayout(LAYOUT)
      const { onFromChange, onToChange } = renderTimeline({ fromVersion: '1.0.0', toVersion: '1.1.0' })

      press('1.1.0')
      moveTo(200)
      release()

      expect(onToChange).toHaveBeenCalledExactlyOnceWith('1.2.0')
      expect(onFromChange).not.toHaveBeenCalled()
    })

    it('drags the FROM node, even past the TO node', () => {
      stubLayout(LAYOUT)
      const { onFromChange, onToChange } = renderTimeline({ fromVersion: '1.0.0', toVersion: '1.1.0' })

      press('1.0.0')
      moveTo(at('1.3.0'))

      expect(onFromChange).toHaveBeenCalledExactlyOnceWith('1.3.0')
      expect(onToChange).not.toHaveBeenCalled()
    })

    it('drags FROM when both ends sit on the pressed node', () => {
      stubLayout(LAYOUT)
      const { onFromChange, onToChange } = renderTimeline({ fromVersion: '1.1.0', toVersion: '1.1.0' })

      press('1.1.0')
      moveTo(at('1.2.0'))

      expect(onFromChange).toHaveBeenCalledExactlyOnceWith('1.2.0')
      expect(onToChange).not.toHaveBeenCalled()
    })

    it.each([
      { name: 'TO over itself', press: '1.2.0', target: '1.2.0' },
      { name: 'TO over FROM', press: '1.2.0', target: '1.0.0' },
      { name: 'FROM over itself', press: '1.0.0', target: '1.0.0' },
      { name: 'FROM over TO', press: '1.0.0', target: '1.2.0' }
    ])('does not move the end when dragging $name', ({ press: pressed, target }) => {
      stubLayout(LAYOUT)
      const { onFromChange, onToChange } = renderTimeline({ fromVersion: '1.0.0', toVersion: '1.2.0' })

      press(pressed)
      moveTo(at(target))

      expect(onFromChange).not.toHaveBeenCalled()
      expect(onToChange).not.toHaveBeenCalled()
    })

    it('picks the node whose center is nearest to the pointer', () => {
      stubLayout({ '1.0.0': [0, 100], '1.1.0': [100, 10], '1.2.0': [200, 10], '1.3.0': [300, 10] })
      const { onToChange } = renderTimeline({ fromVersion: '1.3.0', toVersion: '1.2.0' })

      press('1.2.0')
      moveTo(70)
      expect(onToChange).toHaveBeenLastCalledWith('1.0.0')

      moveTo(80)
      expect(onToChange).toHaveBeenLastCalledWith('1.1.0')
      expect(onToChange).toHaveBeenCalledTimes(2)
    })

    it('prefers the earlier node when the pointer is exactly between two', () => {
      stubLayout(LAYOUT)
      const { onToChange } = renderTimeline({ fromVersion: '1.3.0', toVersion: '1.2.0' })

      press('1.2.0')
      moveTo((at('1.0.0') + at('1.1.0')) / 2)

      expect(onToChange).toHaveBeenCalledExactlyOnceWith('1.0.0')
    })

    it('clamps to the first and last node when the pointer leaves the timeline', () => {
      stubLayout(LAYOUT)
      const { onToChange } = renderTimeline({ fromVersion: '1.2.0', toVersion: '1.1.0' })

      press('1.1.0')
      moveTo(-5000)
      expect(onToChange).toHaveBeenLastCalledWith('1.0.0')

      moveTo(5000)
      expect(onToChange).toHaveBeenLastCalledWith('1.3.0')
      expect(onToChange).toHaveBeenCalledTimes(2)
    })

    it('never picks a node of a major that is no longer shown', () => {
      const list = ['1.0.0', '1.1.0', '1.2.0', '2.0.0', '2.1.0', '2.2.0']
      stubLayout({
        '1.0.0': [0, 10],
        '1.1.0': [100, 10],
        '1.2.0': [200, 10],
        '2.0.0': [0, 10],
        '2.1.0': [100, 10],
        '2.2.0': [250, 10]
      })
      const { onToChange, rerender } = renderTimeline({ versions: list, fromVersion: '1.0.0', toVersion: '1.1.0' })
      rerender({ fromVersion: '2.0.0', toVersion: '2.1.0' })

      press('2.1.0')
      moveTo(210)

      expect(onToChange).toHaveBeenCalledExactlyOnceWith('2.2.0')
    })

    it('ignores pointer moves once no node is left to hit', () => {
      stubLayout(LAYOUT)
      const { onFromChange, onToChange, rerender } = renderTimeline({
        versions: V1,
        fromVersion: '1.0.0',
        toVersion: '1.1.0'
      })

      press('1.1.0')
      rerender({ versions: [] })
      moveTo(at('1.2.0'))

      expect(onFromChange).not.toHaveBeenCalled()
      expect(onToChange).not.toHaveBeenCalled()
    })

    it('only drags the FROM and TO nodes', () => {
      stubLayout(LAYOUT)
      const { container, onFromChange, onToChange } = renderTimeline({ fromVersion: '1.0.0', toVersion: '1.1.0' })

      const notPrevented = press('1.3.0')
      moveTo(at('1.2.0'))

      expect(notPrevented).toBe(true)
      expect(dragActive(container)).toBe(false)
      expect(onFromChange).not.toHaveBeenCalled()
      expect(onToChange).not.toHaveBeenCalled()
    })

    it('prevents the default mouse down and flags the timeline as dragging until the mouse is released', () => {
      const { container } = renderTimeline({ fromVersion: '1.0.0', toVersion: '1.1.0' })
      expect(dragActive(container)).toBe(false)

      expect(press('1.0.0')).toBe(false)
      expect(dragActive(container)).toBe(true)

      release()
      expect(dragActive(container)).toBe(false)

      expect(press('1.1.0')).toBe(false)
      expect(dragActive(container)).toBe(true)
    })

    it('starts a drag with any mouse button', () => {
      const { container } = renderTimeline({ fromVersion: '1.0.0', toVersion: '1.1.0' })

      expect(press('1.1.0', { button: 2 })).toBe(false)
      expect(dragActive(container)).toBe(true)
    })

    it('stops following the pointer after the mouse is released', () => {
      stubLayout(LAYOUT)
      const { onToChange } = renderTimeline({ fromVersion: '1.0.0', toVersion: '1.1.0' })

      press('1.1.0')
      moveTo(at('1.2.0'))
      release()
      moveTo(at('1.3.0'))

      expect(onToChange).toHaveBeenCalledExactlyOnceWith('1.2.0')
    })

    it('does nothing when the pointer moves without a press', () => {
      stubLayout(LAYOUT)
      const { onFromChange, onToChange } = renderTimeline({ fromVersion: '1.0.0', toVersion: '1.1.0' })

      moveTo(at('1.3.0'))

      expect(onFromChange).not.toHaveBeenCalled()
      expect(onToChange).not.toHaveBeenCalled()
    })

    it('stops following the pointer when the timeline unmounts mid-drag', () => {
      stubLayout(LAYOUT)
      const { onToChange, unmount } = renderTimeline({ fromVersion: '1.0.0', toVersion: '1.1.0' })

      press('1.1.0')
      unmount()
      moveTo(at('1.3.0'))

      expect(onToChange).not.toHaveBeenCalled()
    })

    it('keeps TO under the pointer and settles once it sits there', () => {
      stubLayout(LAYOUT)
      const { container, onFromChange, onToChange } = renderStateful({ from: '1.0.0', to: '1.1.0' })

      press('1.1.0')
      moveTo(at('1.2.0'))
      expect(roles()).toEqual({ '1.0.0': FROM_LABEL, '1.1.0': '', '1.2.0': TO_LABEL, '1.3.0': '' })

      moveTo(at('1.2.0'))
      moveTo(at('1.2.0') + 20)
      expect(onToChange).toHaveBeenCalledExactlyOnceWith('1.2.0')

      moveTo(at('1.3.0'))
      expect(onToChange.mock.calls).toEqual([['1.2.0'], ['1.3.0']])

      release()
      expect(dragActive(container)).toBe(false)
      expect(states()).toEqual({ '1.0.0': 'from', '1.1.0': 'range', '1.2.0': 'range', '1.3.0': 'to' })
      expect(onFromChange).not.toHaveBeenCalled()
    })

    it('keeps FROM under the pointer and refuses to step onto TO', () => {
      stubLayout(LAYOUT)
      const { onFromChange, onToChange } = renderStateful({ from: '1.0.0', to: '1.3.0' })

      press('1.0.0')
      moveTo(at('1.1.0'))
      moveTo(at('1.3.0'))
      moveTo(at('1.2.0'))
      release()

      expect(onFromChange.mock.calls).toEqual([['1.1.0'], ['1.2.0']])
      expect(onToChange).not.toHaveBeenCalled()
      expect(roles()).toEqual({ '1.0.0': '', '1.1.0': '', '1.2.0': FROM_LABEL, '1.3.0': TO_LABEL })
    })
  })

  describe('with stable callbacks and versions', () => {
    it('drags FROM onto the next node and back to where it started', () => {
      stubLayout(LAYOUT)
      const { onFromChange, onToChange } = renderStable({ from: '1.0.0', to: '1.3.0' })

      press('1.0.0')
      moveTo(at('1.1.0'))
      moveTo(at('1.0.0'))
      release()

      expect(onFromChange.mock.calls).toEqual([['1.1.0'], ['1.0.0']])
      expect(onToChange).not.toHaveBeenCalled()
      expect(roles()).toEqual({ '1.0.0': FROM_LABEL, '1.1.0': '', '1.2.0': '', '1.3.0': TO_LABEL })
    })

    it('measures a second click against the end the first click moved', async () => {
      const user = userEvent.setup()
      const { onFromChange, onToChange } = renderStable({ from: '1.0.0', to: '1.3.0' })

      await user.click(item('1.1.0'))
      await user.click(item('1.2.0'))

      expect(onFromChange.mock.calls).toEqual([['1.1.0'], ['1.2.0']])
      expect(onToChange).not.toHaveBeenCalled()
      expect(roles()).toEqual({ '1.0.0': '', '1.1.0': '', '1.2.0': FROM_LABEL, '1.3.0': TO_LABEL })
    })
  })

  describe('scrolling', () => {
    it('scrolls the TO node into view when both ends are set', () => {
      renderTimeline({ fromVersion: '1.0.0', toVersion: '1.2.0' })

      expect(scrolledTitles()).toEqual(['v1.2.0'])
      expect(scrollSpy()).toHaveBeenCalledExactlyOnceWith(SCROLL_OPTIONS)
    })

    it('scrolls the FROM node into view when only FROM is set', () => {
      renderTimeline({ fromVersion: '1.1.0' })

      expect(scrolledTitles()).toEqual(['v1.1.0'])
    })

    it('does not scroll when nothing is selected', () => {
      renderTimeline()

      expect(scrollSpy()).not.toHaveBeenCalled()
    })

    it('does not scroll when the target is not in the list', () => {
      renderTimeline({ fromVersion: '1.0.0', toVersion: '1.9.0' })

      expect(scrollSpy()).not.toHaveBeenCalled()
    })

    it('scrolls again when the selection changes, but not when it is cleared or other props change', () => {
      const { rerender } = renderTimeline({ fromVersion: '1.0.0', toVersion: '1.1.0' })
      expect(scrolledTitles()).toEqual(['v1.1.0'])

      rerender({ fromVersion: '1.0.0', toVersion: '1.3.0' })
      expect(scrolledTitles()).toEqual(['v1.1.0', 'v1.3.0'])

      rerender({ fromVersion: '1.0.0', toVersion: '1.3.0', tags: emptyTags({ staging: ['1.2.0'] }) })
      expect(scrolledTitles()).toEqual(['v1.1.0', 'v1.3.0'])

      rerender({ fromVersion: '1.2.0', toVersion: '' })
      expect(scrolledTitles()).toEqual(['v1.1.0', 'v1.3.0', 'v1.2.0'])

      rerender({ fromVersion: '', toVersion: '' })
      expect(scrolledTitles()).toEqual(['v1.1.0', 'v1.3.0', 'v1.2.0'])
    })
  })
})
