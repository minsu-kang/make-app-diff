import type { FileDiff } from '../../shared/types'

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
  return {
    added: diffs.filter((d) => d.status === 'added').length,
    deleted: diffs.filter((d) => d.status === 'deleted').length,
    modified: diffs.filter((d) => d.status === 'modified').length
  }
}
