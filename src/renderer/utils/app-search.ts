import type { SearchApp, SearchEntry } from '../shared/types'
import { getMajor } from './version'

function groupByMajor(versions: string[]): Map<number, string[]> {
  const groups = new Map<number, string[]>()
  for (const v of versions) {
    const major = getMajor(v)
    const group = groups.get(major)
    if (group) group.push(v)
    else groups.set(major, [v])
  }
  return groups
}

function entriesForApp(app: SearchApp): SearchEntry[] {
  const groups = groupByMajor(app.availableVersions)
  if (groups.size <= 1) return [{ app, major: getMajor(app.version), versions: app.availableVersions }]
  return [...groups.entries()].sort(([a], [b]) => b - a).map(([major, versions]) => ({ app, major, versions }))
}

export function buildSearchEntries(apps: SearchApp[], query: string, limit: number): SearchEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const matched = apps.filter((app) => app.label.toLowerCase().includes(q) || app.name.toLowerCase().includes(q))
  return matched.flatMap((app) => entriesForApp(app)).slice(0, limit)
}

export function entryLabel(entry: SearchEntry): string {
  const hasOtherMajors = entry.app.availableVersions.some((v) => getMajor(v) !== entry.major)
  const suffix = hasOtherMajors ? ` (v${entry.major})` : ''
  return `${entry.app.label}${suffix}`
}

export function getSearchInputValue(selected: SearchEntry | null, query: string): string {
  return selected && !query ? entryLabel(selected) : query
}

export function moveHighlight(current: number, length: number, direction: 'up' | 'down'): number {
  if (length === 0) return -1
  if (direction === 'down') return (current + 1) % length
  return current <= 0 ? length - 1 : current - 1
}
