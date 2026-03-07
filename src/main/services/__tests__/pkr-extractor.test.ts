import { describe, it, expect, vi } from 'vitest'

const { mockUnpackSync } = vi.hoisted(() => ({
  mockUnpackSync: vi.fn()
}))

vi.mock('pkr', () => ({
  default: { unpackSync: mockUnpackSync },
  unpackSync: mockUnpackSync
}))

import { extractPkr } from '../pkr-extractor'

describe('extractPkr', () => {
  it('extracts files from PKR buffer', () => {
    mockUnpackSync.mockReturnValueOnce([
      { path: 'manifest.json', data: Buffer.from('{}') },
      { path: 'lib/app.js', data: Buffer.from('code') }
    ])
    const result = extractPkr(Buffer.from('pkr-data'))
    expect(result).toHaveLength(2)
    expect(result[0].path).toBe('lib/app.js')
    expect(result[0].content).toBe('code')
    expect(result[1].path).toBe('manifest.json')
    expect(result[1].content).toBe('{}')
  })

  it('filters out unpacked-app-files/ paths', () => {
    mockUnpackSync.mockReturnValueOnce([
      { path: 'manifest.json', data: Buffer.from('{}') },
      { path: 'unpacked-app-files/big-file.bin', data: Buffer.from('large') }
    ])
    const result = extractPkr(Buffer.from('pkr-data'))
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('manifest.json')
  })

  it('sorts results alphabetically by path', () => {
    mockUnpackSync.mockReturnValueOnce([
      { path: 'z.txt', data: Buffer.from('z') },
      { path: 'a.txt', data: Buffer.from('a') },
      { path: 'm.txt', data: Buffer.from('m') }
    ])
    const result = extractPkr(Buffer.from(''))
    expect(result.map((f) => f.path)).toEqual(['a.txt', 'm.txt', 'z.txt'])
  })

  it('returns empty array for empty archive', () => {
    mockUnpackSync.mockReturnValueOnce([])
    const result = extractPkr(Buffer.from(''))
    expect(result).toEqual([])
  })
})
