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

  describe('JSON normalization', () => {
    it('treats .json files with only key-order differences as unchanged', () => {
      const oldFiles: ExtractedFile[] = [
        { path: 'config.json', content: JSON.stringify({ z: 1, a: 2, m: 3 }, null, 4) }
      ]
      const newFiles: ExtractedFile[] = [
        { path: 'config.json', content: JSON.stringify({ a: 2, m: 3, z: 1 }, null, 4) }
      ]
      const result = computeDiff('app', oldFiles, newFiles)
      expect(result.summary.unchanged).toBe(1)
      expect(result.diffs).toHaveLength(0)
    })

    it('treats .imljson files with IMLJSON schema key ordering as unchanged', () => {
      const obj = { method: 'GET', url: 'https://example.com', headers: { 'x-token': '123' } }
      const reversed = { headers: { 'x-token': '123' }, url: 'https://example.com', method: 'GET' }
      const oldFiles: ExtractedFile[] = [{ path: 'api.imljson', content: JSON.stringify(obj, null, 4) }]
      const newFiles: ExtractedFile[] = [{ path: 'api.imljson', content: JSON.stringify(reversed, null, 4) }]
      const result = computeDiff('app', oldFiles, newFiles)
      expect(result.summary.unchanged).toBe(1)
      expect(result.diffs).toHaveLength(0)
    })

    it('detects actual value changes in .json files after normalization', () => {
      const oldFiles: ExtractedFile[] = [{ path: 'data.json', content: JSON.stringify({ a: 1, b: 2 }, null, 4) }]
      const newFiles: ExtractedFile[] = [{ path: 'data.json', content: JSON.stringify({ b: 2, a: 99 }, null, 4) }]
      const result = computeDiff('app', oldFiles, newFiles)
      expect(result.summary.modified).toBe(1)
    })

    it('returns original content when JSON is invalid', () => {
      const oldFiles: ExtractedFile[] = [{ path: 'bad.json', content: '{ invalid json' }]
      const newFiles: ExtractedFile[] = [{ path: 'bad.json', content: '{ different invalid' }]
      const result = computeDiff('app', oldFiles, newFiles)
      expect(result.summary.modified).toBe(1)
      expect(result.diffs[0].oldContent).toBe('{ invalid json')
      expect(result.diffs[0].newContent).toBe('{ different invalid')
    })

    it('does not normalize non-JSON files', () => {
      const oldFiles: ExtractedFile[] = [{ path: 'code.js', content: 'const x = { b: 1, a: 2 }' }]
      const newFiles: ExtractedFile[] = [{ path: 'code.js', content: 'const x = { a: 2, b: 1 }' }]
      const result = computeDiff('app', oldFiles, newFiles)
      expect(result.summary.modified).toBe(1)
    })

    it('does not normalize .txt files', () => {
      const jsonStr1 = JSON.stringify({ z: 1, a: 2 })
      const jsonStr2 = JSON.stringify({ a: 2, z: 1 })
      const oldFiles: ExtractedFile[] = [{ path: 'notes.txt', content: jsonStr1 }]
      const newFiles: ExtractedFile[] = [{ path: 'notes.txt', content: jsonStr2 }]
      const result = computeDiff('app', oldFiles, newFiles)
      expect(result.summary.modified).toBe(1)
    })
  })

  describe('IMLJSON nested key ordering', () => {
    it('sorts response sub-keys in schema order (temp, valid, type, output, error)', () => {
      const obj1 = {
        url: 'https://api.example.com',
        response: {
          error: { message: 'fail' },
          output: '{{body}}',
          type: 'json',
          valid: '{{statusCode == 200}}',
          temp: {}
        }
      }
      const obj2 = {
        url: 'https://api.example.com',
        response: {
          temp: {},
          valid: '{{statusCode == 200}}',
          type: 'json',
          output: '{{body}}',
          error: { message: 'fail' }
        }
      }
      const oldFiles: ExtractedFile[] = [{ path: 'api.imljson', content: JSON.stringify(obj1, null, 4) }]
      const newFiles: ExtractedFile[] = [{ path: 'api.imljson', content: JSON.stringify(obj2, null, 4) }]
      const result = computeDiff('app', oldFiles, newFiles)
      expect(result.summary.unchanged).toBe(1)
    })

    it('sorts pagination sub-keys in schema order (mergeWithParent, url, method)', () => {
      const obj1 = {
        url: 'https://api.example.com',
        pagination: { method: 'GET', url: '/next', mergeWithParent: true }
      }
      const obj2 = {
        url: 'https://api.example.com',
        pagination: { mergeWithParent: true, url: '/next', method: 'GET' }
      }
      const oldFiles: ExtractedFile[] = [{ path: 'api.imljson', content: JSON.stringify(obj1, null, 4) }]
      const newFiles: ExtractedFile[] = [{ path: 'api.imljson', content: JSON.stringify(obj2, null, 4) }]
      const result = computeDiff('app', oldFiles, newFiles)
      expect(result.summary.unchanged).toBe(1)
    })

    it('sorts arrays of objects recursively', () => {
      const obj1 = [
        { method: 'POST', url: '/a' },
        { method: 'GET', url: '/b' }
      ]
      const obj2 = [
        { url: '/a', method: 'POST' },
        { url: '/b', method: 'GET' }
      ]
      const oldFiles: ExtractedFile[] = [{ path: 'steps.imljson', content: JSON.stringify(obj1, null, 4) }]
      const newFiles: ExtractedFile[] = [{ path: 'steps.imljson', content: JSON.stringify(obj2, null, 4) }]
      const result = computeDiff('app', oldFiles, newFiles)
      expect(result.summary.unchanged).toBe(1)
    })
  })

  describe('binary files', () => {
    it('produces empty unifiedDiff for base64 data URI content', () => {
      const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk'
      const oldFiles: ExtractedFile[] = [{ path: 'icon.png', content: dataUri }]
      const newFiles: ExtractedFile[] = [{ path: 'icon.png', content: 'data:image/png;base64,AAAA' }]
      const result = computeDiff('app', oldFiles, newFiles)
      expect(result.diffs).toHaveLength(1)
      expect(result.diffs[0].status).toBe('modified')
      expect(result.diffs[0].unifiedDiff).toBe('')
    })

    it('produces empty unifiedDiff when only new file is binary', () => {
      const newFiles: ExtractedFile[] = [{ path: 'logo.png', content: 'data:image/png;base64,ABCD' }]
      const result = computeDiff('app', [], newFiles)
      expect(result.diffs[0].status).toBe('added')
      expect(result.diffs[0].unifiedDiff).toBe('')
    })

    it('produces empty unifiedDiff when only old file is binary', () => {
      const oldFiles: ExtractedFile[] = [{ path: 'logo.png', content: 'data:image/svg+xml;base64,PHN2Zw==' }]
      const result = computeDiff('app', oldFiles, [])
      expect(result.diffs[0].status).toBe('deleted')
      expect(result.diffs[0].unifiedDiff).toBe('')
    })
  })
})
