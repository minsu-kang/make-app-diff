import { describe, it, expect } from 'vitest'
import { componentKey, isInsideComponent, mergeStatuses } from '../components'

describe('componentKey', () => {
  it.each([
    ['modules/send/api.imljson', 'modules/send'],
    ['rpcs/listBoards/metadata.json', 'rpcs/listBoards'],
    ['functions/formatDate/code.js', 'functions/formatDate'],
    ['endpoints/getBoard/context.md', 'endpoints/getBoard'],
    ['connections/oauth/api.imljson', 'connections/oauth'],
    ['webhooks/hook1/attach.imljson', 'webhooks/hook1'],
    ['accounts/oauth/manifest.json', 'accounts/oauth'],
    ['hooks/hook1/manifest.json', 'hooks/hook1']
  ])('groups %s under its component folder', (filePath, key) => {
    expect(componentKey(filePath)).toBe(key)
  })

  it('keeps files nested deeper inside a component with that component', () => {
    expect(componentKey('modules/send/docs/readme.md')).toBe('modules/send')
  })

  it.each(['base.imljson', 'metadata.json', '.sdk', 'assets/icon.png', 'assets/images/hero.svg', 'lib/app.js'])(
    'treats %s as a component of its own',
    (filePath) => {
      expect(componentKey(filePath)).toBe(filePath)
    }
  )

  it('treats a file right under a component folder as a component of its own', () => {
    expect(componentKey('modules/list.json')).toBe('modules/list.json')
  })

  it('matches the folder name only, not a similar name', () => {
    expect(componentKey('modules-old/send/api.imljson')).toBe('modules-old/send/api.imljson')
    expect(componentKey('src/modules/send/api.imljson')).toBe('src/modules/send/api.imljson')
  })
})

describe('isInsideComponent', () => {
  it('is true for a component folder and the folders below it', () => {
    expect(isInsideComponent('modules/send')).toBe(true)
    expect(isInsideComponent('modules/send/docs')).toBe(true)
  })

  it('is false for the folder that holds the components and for other folders', () => {
    expect(isInsideComponent('modules')).toBe(false)
    expect(isInsideComponent('assets')).toBe(false)
    expect(isInsideComponent('assets/images')).toBe(false)
    expect(isInsideComponent('src/modules/send')).toBe(false)
  })
})

describe('mergeStatuses', () => {
  it('is modified when anything is modified', () => {
    expect(mergeStatuses(new Set(['modified', 'added']))).toBe('modified')
  })

  it('is modified when something is added and something is deleted', () => {
    expect(mergeStatuses(new Set(['added', 'deleted']))).toBe('modified')
  })

  it('is added or deleted when every change is', () => {
    expect(mergeStatuses(new Set(['added']))).toBe('added')
    expect(mergeStatuses(new Set(['deleted']))).toBe('deleted')
  })

  it('is null when nothing changed', () => {
    expect(mergeStatuses(new Set())).toBeNull()
    expect(mergeStatuses(new Set(['unchanged']))).toBeNull()
  })
})
