import type { FileDiff } from '../../shared/types'
import { componentKey, mergeStatuses } from './components'

export type TabType = 'app' | 'account' | 'hook'

export function filterDiffs(diffs: FileDiff[], tab: TabType): FileDiff[] {
  return diffs.filter((d) => {
    const isAccount = d.filePath.startsWith('accounts/') || d.filePath.startsWith('connections/')
    const isHook = d.filePath.startsWith('hooks/') || d.filePath.startsWith('webhooks/')
    if (tab === 'account') return isAccount
    if (tab === 'hook') return isHook
    return !isAccount && !isHook
  })
}

export function countChanges(diffs: FileDiff[]): { added: number; deleted: number; modified: number } {
  const statusesByComponent = new Map<string, Set<string>>()
  for (const d of diffs) {
    const key = componentKey(d.filePath)
    const statuses = statusesByComponent.get(key) ?? new Set<string>()
    statuses.add(d.status)
    statusesByComponent.set(key, statuses)
  }

  const counts = { added: 0, deleted: 0, modified: 0 }
  for (const statuses of statusesByComponent.values()) {
    const status = mergeStatuses(statuses)
    if (status) counts[status]++
  }
  return counts
}
