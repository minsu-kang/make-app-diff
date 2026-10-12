import { describe, it, expect } from 'vitest'
import { countChanges, filterDiffs } from '../filter-diffs'
import type { FileDiff } from '../../../shared/types'

function file(filePath: string, status: FileDiff['status'] = 'modified'): FileDiff {
  return { filePath, status, oldContent: 'a', newContent: 'b', unifiedDiff: '-a\n+b' }
}

const modulesFile = file('modules/send/api.imljson')
const accountsFile = file('accounts/oauth.json')
const connectionsFile = file('connections/oauth/api.imljson')
const hooksFile = file('hooks/hook.json')
const webhooksFile = file('webhooks/hook1/api.imljson')
const all = [modulesFile, accountsFile, connectionsFile, hooksFile, webhooksFile]

describe('filterDiffs', () => {
  it('keeps what is neither an account nor a hook on the app tab', () => {
    expect(filterDiffs(all, 'app')).toEqual([modulesFile])
  })

  it('treats compiled accounts and SDK connections as accounts', () => {
    expect(filterDiffs(all, 'account')).toEqual([accountsFile, connectionsFile])
  })

  it('treats compiled hooks and SDK webhooks as hooks', () => {
    expect(filterDiffs(all, 'hook')).toEqual([hooksFile, webhooksFile])
  })

  it('matches the folder prefix only, not a similar name', () => {
    const lookalikes = [file('accounts-old/a.json'), file('hooksets/h.json'), file('modules/accounts/a.json')]

    expect(filterDiffs(lookalikes, 'app')).toEqual(lookalikes)
    expect(filterDiffs(lookalikes, 'account')).toEqual([])
    expect(filterDiffs(lookalikes, 'hook')).toEqual([])
  })

  it('returns nothing for no diffs', () => {
    expect(filterDiffs([], 'app')).toEqual([])
  })
})

describe('countChanges', () => {
  it('counts the diffs of each status', () => {
    const diffs = [file('a', 'added'), file('b', 'added'), file('c', 'deleted'), file('d', 'modified'), file('e')]

    expect(countChanges(diffs)).toEqual({ added: 2, deleted: 1, modified: 2 })
  })

  it('does not count unchanged files', () => {
    expect(countChanges([file('a', 'unchanged')])).toEqual({ added: 0, deleted: 0, modified: 0 })
  })

  it('returns zeros for no diffs', () => {
    expect(countChanges([])).toEqual({ added: 0, deleted: 0, modified: 0 })
  })
})
