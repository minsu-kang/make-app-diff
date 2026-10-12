import { describe, it, expect } from 'vitest'
import { buildSearchEntries, entryLabel, getSearchInputValue, moveHighlight } from '../app-search'
import type { SearchApp, SearchEntry } from '../../types'

function makeApp(name: string, label: string, version: string, availableVersions: string[]): SearchApp {
  return { name, label, version, availableVersions }
}

const slack = makeApp('slack', 'Slack', '2.1.0', ['2.1.0', '2.0.0', '1.3.0'])
const gmail = makeApp('gmail', 'Gmail', '1.0.0', ['1.0.0'])
const teams = makeApp('ms-teams', 'Microsoft Teams', '1.1.0', ['1.1.0', '1.0.0'])
const zoom = makeApp('zoom', 'Zoom', '3.1.0', ['1.0.0', '3.0.0', '3.1.0', '2.0.0'])
const legacy = makeApp('legacy', 'Legacy', '2.0.0', ['1.0.0', '1.1.0'])
const unpublished = makeApp('unpublished', 'Unpublished', '1.0.0', [])

const summary = (entries: SearchEntry[]) => entries.map((entry) => [entry.app.name, entry.major, entry.versions])
const entryOf = (app: SearchApp, major: number): SearchEntry => ({ app, major, versions: app.availableVersions })

describe('buildSearchEntries', () => {
  it.each(['', '   '])('finds nothing for the blank query %j', (query) => {
    expect(buildSearchEntries([slack, gmail], query, 10)).toEqual([])
  })

  it('finds nothing when no label or name contains the query', () => {
    expect(buildSearchEntries([slack, gmail], 'zzz', 10)).toEqual([])
  })

  it('matches the label or the name, ignoring case and surrounding spaces', () => {
    const apps = [slack, gmail, teams]

    expect(summary(buildSearchEntries(apps, '  MICROSOFT ', 10))).toEqual([['ms-teams', 1, ['1.1.0', '1.0.0']]])
    expect(summary(buildSearchEntries(apps, 'ms-te', 10))).toEqual([['ms-teams', 1, ['1.1.0', '1.0.0']]])
    expect(summary(buildSearchEntries(apps, 'GMAIL', 10))).toEqual([['gmail', 1, ['1.0.0']]])
  })

  it('keeps the original app object and version list in an entry', () => {
    const [entry] = buildSearchEntries([gmail], 'gmail', 10)

    expect(entry.app).toBe(gmail)
    expect(entry.versions).toEqual(gmail.availableVersions)
  })

  it('returns one entry for an app with a single major, in the order of the API', () => {
    expect(summary(buildSearchEntries([slack, teams], 'teams', 10))).toEqual([['ms-teams', 1, ['1.1.0', '1.0.0']]])
  })

  it('names a single-group app after the major of its latest version', () => {
    expect(summary(buildSearchEntries([legacy], 'legacy', 10))).toEqual([['legacy', 2, ['1.0.0', '1.1.0']]])
  })

  it('returns one entry without versions for an app that has none', () => {
    expect(summary(buildSearchEntries([unpublished], 'unpub', 10))).toEqual([['unpublished', 1, []]])
  })

  it('returns every major of a multi-major app from the newest to the oldest', () => {
    expect(summary(buildSearchEntries([slack, zoom], 'zoom', 10))).toEqual([
      ['zoom', 3, ['3.0.0', '3.1.0']],
      ['zoom', 2, ['2.0.0']],
      ['zoom', 1, ['1.0.0']]
    ])
  })

  it('sorts the majors as numbers, not as text', () => {
    const app = makeApp('wide', 'Wide', '10.0.0', ['9.0.0', '10.0.0', '2.0.0'])

    expect(buildSearchEntries([app], 'wide', 10).map((entry) => entry.major)).toEqual([10, 9, 2])
  })

  it('groups versions without a numeric major under 0', () => {
    const app = makeApp('odd', 'Odd', '1.0.0', ['abc', '0.1.0', '1.0.0'])

    expect(summary(buildSearchEntries([app], 'odd', 10))).toEqual([
      ['odd', 1, ['1.0.0']],
      ['odd', 0, ['abc', '0.1.0']]
    ])
  })

  it('lists the entries of each matching app one after the other in the order of the list', () => {
    const entries = buildSearchEntries([zoom, gmail, teams], 'm', 10)

    expect(entries.map((entry) => [entry.app.name, entry.major])).toEqual([
      ['zoom', 3],
      ['zoom', 2],
      ['zoom', 1],
      ['gmail', 1],
      ['ms-teams', 1]
    ])
  })

  it('cuts the entries at the limit, not the apps, so a multi-major app can be cut in half', () => {
    const entries = buildSearchEntries([gmail, zoom, teams], 'm', 3)

    expect(entries.map((entry) => [entry.app.name, entry.major])).toEqual([
      ['gmail', 1],
      ['zoom', 3],
      ['zoom', 2]
    ])
  })

  it.each([
    { limit: 0, expected: [] },
    { limit: 1, expected: [['gmail', 1]] },
    {
      limit: 2,
      expected: [
        ['gmail', 1],
        ['ms-teams', 1]
      ]
    },
    {
      limit: 5,
      expected: [
        ['gmail', 1],
        ['ms-teams', 1]
      ]
    }
  ])('returns at most $limit entries', ({ limit, expected }) => {
    const entries = buildSearchEntries([gmail, teams], 'm', limit)

    expect(entries.map((entry) => [entry.app.name, entry.major])).toEqual(expected)
  })

  it('leaves the apps it was given untouched', () => {
    const app = makeApp('wide', 'Wide', '3.0.0', ['1.0.0', '3.0.0', '2.0.0'])

    buildSearchEntries([app], 'wide', 10)

    expect(app).toEqual(makeApp('wide', 'Wide', '3.0.0', ['1.0.0', '3.0.0', '2.0.0']))
  })
})

describe('entryLabel', () => {
  it.each([
    { app: gmail, major: 1 },
    { app: teams, major: 1 },
    { app: unpublished, major: 1 }
  ])('is the plain label of $app.label when every version has its major', ({ app, major }) => {
    expect(entryLabel(entryOf(app, major))).toBe(app.label)
  })

  it.each([
    { app: slack, major: 2, label: 'Slack (v2)' },
    { app: slack, major: 1, label: 'Slack (v1)' },
    { app: zoom, major: 3, label: 'Zoom (v3)' }
  ])('adds the major to the label of $app.label when other majors exist', ({ app, major, label }) => {
    expect(entryLabel(entryOf(app, major))).toBe(label)
  })

  it('adds the major of the latest version to a single-group app', () => {
    expect(entryLabel(entryOf(legacy, 2))).toBe('Legacy (v2)')
  })
})

describe('getSearchInputValue', () => {
  const selected = entryOf(slack, 2)

  it('shows the query when nothing is selected', () => {
    expect(getSearchInputValue(null, 'sla')).toBe('sla')
    expect(getSearchInputValue(null, '')).toBe('')
  })

  it('shows the label of the selected entry while the query is empty', () => {
    expect(getSearchInputValue(selected, '')).toBe('Slack (v2)')
    expect(getSearchInputValue(entryOf(gmail, 1), '')).toBe('Gmail')
  })

  it('shows the query when it is not empty, even if only spaces', () => {
    expect(getSearchInputValue(selected, 'sla')).toBe('sla')
    expect(getSearchInputValue(selected, ' ')).toBe(' ')
  })
})

describe('moveHighlight', () => {
  it.each([-1, 0, 3])('has no highlight in an empty list (from %i)', (current) => {
    expect(moveHighlight(current, 0, 'down')).toBe(-1)
    expect(moveHighlight(current, 0, 'up')).toBe(-1)
  })

  it.each([
    { current: -1, expected: 0 },
    { current: 0, expected: 1 },
    { current: 1, expected: 2 },
    { current: 2, expected: 0 }
  ])('moves down from $current to $expected in a list of 3', ({ current, expected }) => {
    expect(moveHighlight(current, 3, 'down')).toBe(expected)
  })

  it.each([
    { current: -1, expected: 2 },
    { current: 0, expected: 2 },
    { current: 1, expected: 0 },
    { current: 2, expected: 1 }
  ])('moves up from $current to $expected in a list of 3', ({ current, expected }) => {
    expect(moveHighlight(current, 3, 'up')).toBe(expected)
  })

  it('stays on the only entry of a one-entry list', () => {
    expect(moveHighlight(0, 1, 'down')).toBe(0)
    expect(moveHighlight(0, 1, 'up')).toBe(0)
    expect(moveHighlight(-1, 1, 'down')).toBe(0)
    expect(moveHighlight(-1, 1, 'up')).toBe(0)
  })
})
