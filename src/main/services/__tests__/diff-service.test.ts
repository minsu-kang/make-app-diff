import { describe, it, expect } from 'vitest'
import { computeDiff } from '../diff-service'
import { ExtractedFile } from '../../types'

describe('computeDiff', () => {
  it('returns empty result for empty inputs', () => {
    const result = computeDiff('app', [], [])
    expect(result.diffs).toEqual([])
    expect(result.summary).toEqual({ added: 0, deleted: 0, modified: 0, unchanged: 0 })
    expect(result.type).toBe('app')
  })

  it('detects added files', () => {
    const newFiles: ExtractedFile[] = [
      { path: 'new.txt', content: 'hello' },
      { path: 'another.txt', content: 'world' }
    ]
    const result = computeDiff('app', [], newFiles)
    expect(result.diffs).toHaveLength(2)
    expect(result.diffs.every((d) => d.status === 'added')).toBe(true)
    expect(result.summary.added).toBe(2)
    expect(result.summary.deleted).toBe(0)
    expect(result.summary.modified).toBe(0)
    expect(result.summary.unchanged).toBe(0)
  })

  it('detects deleted files', () => {
    const oldFiles: ExtractedFile[] = [{ path: 'gone.txt', content: 'bye' }]
    const result = computeDiff('app', oldFiles, [])
    expect(result.diffs).toHaveLength(1)
    expect(result.diffs[0].status).toBe('deleted')
    expect(result.summary.deleted).toBe(1)
  })

  it('detects modified files with unified diff', () => {
    const oldFiles: ExtractedFile[] = [{ path: 'file.txt', content: 'old content' }]
    const newFiles: ExtractedFile[] = [{ path: 'file.txt', content: 'new content' }]
    const result = computeDiff('app', oldFiles, newFiles)
    expect(result.diffs).toHaveLength(1)
    expect(result.diffs[0].status).toBe('modified')
    expect(result.diffs[0].unifiedDiff).toContain('-old content')
    expect(result.diffs[0].unifiedDiff).toContain('+new content')
    expect(result.summary.modified).toBe(1)
  })

  it('excludes unchanged files from diffs', () => {
    const files: ExtractedFile[] = [{ path: 'same.txt', content: 'same' }]
    const result = computeDiff('app', files, files)
    expect(result.diffs).toHaveLength(0)
    expect(result.summary.unchanged).toBe(1)
  })

  it('handles mixed changes correctly', () => {
    const oldFiles: ExtractedFile[] = [
      { path: 'deleted.txt', content: 'remove me' },
      { path: 'modified.txt', content: 'old' },
      { path: 'unchanged.txt', content: 'same' }
    ]
    const newFiles: ExtractedFile[] = [
      { path: 'added.txt', content: 'new file' },
      { path: 'modified.txt', content: 'new' },
      { path: 'unchanged.txt', content: 'same' }
    ]
    const result = computeDiff('app', oldFiles, newFiles)
    expect(result.summary).toEqual({ added: 1, deleted: 1, modified: 1, unchanged: 1 })
    expect(result.diffs).toHaveLength(3)
  })

  it('sorts results by filePath alphabetically', () => {
    const oldFiles: ExtractedFile[] = [{ path: 'z.txt', content: 'a' }]
    const newFiles: ExtractedFile[] = [
      { path: 'a.txt', content: 'new' },
      { path: 'm.txt', content: 'new' },
      { path: 'z.txt', content: 'b' }
    ]
    const result = computeDiff('app', oldFiles, newFiles)
    const paths = result.diffs.map((d) => d.filePath)
    expect(paths).toEqual(['a.txt', 'm.txt', 'z.txt'])
  })

  it('preserves old and new content in diff entries', () => {
    const oldFiles: ExtractedFile[] = [{ path: 'f.txt', content: 'old' }]
    const newFiles: ExtractedFile[] = [{ path: 'f.txt', content: 'new' }]
    const result = computeDiff('app', oldFiles, newFiles)
    expect(result.diffs[0].oldContent).toBe('old')
    expect(result.diffs[0].newContent).toBe('new')
  })

  it('passes through the component type', () => {
    expect(computeDiff('account', [], []).type).toBe('account')
    expect(computeDiff('hook', [], []).type).toBe('hook')
  })
})
