import { describe, it, expect, vi } from 'vitest'

const { mockUnpackSync } = vi.hoisted(() => ({
  mockUnpackSync: vi.fn()
}))

vi.mock('pkr', () => ({
  default: { unpackSync: mockUnpackSync },
  unpackSync: mockUnpackSync
}))

import { extractPkr, toFileData } from '../pkr-extractor'

describe('toFileData', () => {
  it('decodes an extracted image back to its original bytes', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    mockUnpackSync.mockReturnValueOnce([{ path: 'assets/icon.png', data: png }])
    const [file] = extractPkr(Buffer.from(''))
    const data = toFileData(file.path, file.content)
    expect(Buffer.isBuffer(data)).toBe(true)
    expect((data as Buffer).equals(png)).toBe(true)
  })

  it.each(['icon.png', 'photo.JPG'])('decodes a %s data URI, whatever the extension case', (name) => {
    const data = toFileData(`assets/${name}`, `data:image/x-any;base64,${Buffer.from('bytes').toString('base64')}`)
    expect(Buffer.isBuffer(data) && data.toString()).toBe('bytes')
  })

  it('keeps text files unchanged', () => {
    expect(toFileData('lib/app.js', 'const a = 1')).toBe('const a = 1')
  })

  it('keeps a text file whose content looks like a data URI', () => {
    const uri = 'data:image/png;base64,AAAA'
    expect(toFileData('notes.txt', uri)).toBe(uri)
  })

  it('keeps image-named content that is not a base64 data URI', () => {
    expect(toFileData('icon.png', 'not an image')).toBe('not an image')
    expect(toFileData('icon.png', 'data:text/plain;base64,AAAA')).toBe('data:text/plain;base64,AAAA')
  })
})

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

  it('returns image files as base64 data URIs and everything else as text', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const jpg = Buffer.from([0xff, 0xd8, 0xff])
    mockUnpackSync.mockReturnValueOnce([
      { path: 'assets/icon.png', data: png },
      { path: 'assets/photo.JPG', data: jpg },
      { path: 'assets/logo.svg', data: Buffer.from('<svg/>') },
      { path: 'README', data: Buffer.from('readme') }
    ])
    const byPath = new Map(extractPkr(Buffer.from('')).map((f) => [f.path, f.content]))
    expect(byPath.get('assets/icon.png')).toBe(`data:image/png;base64,${png.toString('base64')}`)
    expect(byPath.get('assets/photo.JPG')).toBe(`data:image/jpeg;base64,${jpg.toString('base64')}`)
    expect(byPath.get('assets/logo.svg')).toBe('<svg/>')
    expect(byPath.get('README')).toBe('readme')
  })

  it('returns empty array for empty archive', () => {
    mockUnpackSync.mockReturnValueOnce([])
    const result = extractPkr(Buffer.from(''))
    expect(result).toEqual([])
  })
})
