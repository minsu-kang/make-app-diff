import { describe, it, expect } from 'vitest'
import { buildJsonPathMap } from '../diff-viewer'

function pathsByLine(content: string): string[] {
  return Array.from(buildJsonPathMap(content).values())
}

function pretty(value: unknown, indent: number | string = 4): string {
  return JSON.stringify(value, null, indent)
}

describe('buildJsonPathMap line paths', () => {
  it('numbers every line from 1 and gives each the path of the object it sits in', () => {
    const map = buildJsonPathMap(pretty({ response: { output: 'data' }, name: 'x' }))

    expect(Array.from(map.entries())).toEqual([
      [1, ''],
      [2, 'response'],
      [3, 'response'],
      [4, ''],
      [5, ''],
      [6, '']
    ])
  })

  it('returns an empty map for invalid or unterminated JSON', () => {
    expect(buildJsonPathMap('{"a": {')).toEqual(new Map())
    expect(buildJsonPathMap('')).toEqual(new Map())
  })

  it('returns to the parent path after a closing brace and keeps nesting through sibling objects', () => {
    expect(pathsByLine(pretty({ a: { x: 1 }, b: { y: 2 } }, 2))).toEqual(['', 'a', 'a', '', 'b', 'b', '', ''])
  })

  it('joins nested keys with dots', () => {
    expect(pathsByLine(pretty({ a: { b: { c: [{ d: 1 }] } } }, 2))).toEqual([
      '',
      'a',
      'a.b',
      'a.b.c',
      'a.b.c[0]',
      'a.b.c[0]',
      'a.b.c',
      'a.b',
      'a',
      '',
      ''
    ])
  })

  it('indexes the objects of a named array and shows plain items under the array path', () => {
    expect(pathsByLine(pretty({ items: [{ id: 1 }, { id: 2 }] }))).toEqual([
      '',
      'items',
      'items[0]',
      'items[0]',
      'items',
      'items[1]',
      'items[1]',
      'items',
      '',
      ''
    ])
    expect(pathsByLine(pretty({ tags: ['a', 'b'], z: 1 }))).toEqual(['', 'tags', 'tags', 'tags', '', '', ''])
  })

  it('restarts the element index for every array', () => {
    expect(pathsByLine(pretty({ a: [{ x: 1 }], b: [{ y: 1 }, { y: 2 }] }, 2))).toEqual([
      '',
      'a',
      'a[0]',
      'a[0]',
      'a',
      '',
      'b',
      'b[0]',
      'b[0]',
      'b',
      'b[1]',
      'b[1]',
      'b',
      '',
      ''
    ])
  })

  it('indexes the objects of a root array and nests named containers below them', () => {
    expect(pathsByLine(pretty([{ a: 1 }, { b: [{ c: 1 }, { d: 2 }] }]))).toEqual([
      '',
      '[0]',
      '[0]',
      '',
      '[1]',
      '[1].b',
      '[1].b[0]',
      '[1].b[0]',
      '[1].b',
      '[1].b[1]',
      '[1].b[1]',
      '[1].b',
      '[1]',
      '',
      ''
    ])
  })

  it('does not index arrays nested directly in arrays', () => {
    expect(pathsByLine(pretty({ matrix: [[1], [2]] }))).toEqual([
      '',
      'matrix',
      'matrix',
      'matrix',
      'matrix',
      'matrix',
      'matrix',
      'matrix',
      '',
      ''
    ])
  })

  it('indexes an object inside an anonymous array from its own count', () => {
    expect(pathsByLine(pretty([[{ a: 1 }]]))).toEqual(['', '', '[0]', '[0]', '', '', ''])
  })

  it('does not open a container for self-contained braces and brackets on one line', () => {
    expect(pathsByLine(pretty({ empty: {}, list: [], after: 1 }))).toEqual(['', '', '', '', ''])
    expect(pathsByLine('{\n    "inline": {"a": 1},\n    "list": [1, 2],\n    "next": 1\n}')).toEqual([
      '',
      '',
      '',
      '',
      ''
    ])
  })

  it('opens named containers when there is no space after the colon', () => {
    expect(pathsByLine('{\n"a":{\n"b":1\n},\n"c":[\n{\n"d":2\n}\n]\n}')).toEqual([
      '',
      'a',
      'a',
      '',
      'c',
      'c[0]',
      'c[0]',
      'c',
      '',
      ''
    ])
  })

  it('drops the key when the opening brace sits on its own line', () => {
    expect(pathsByLine('{\n"a":\n{\n"b": 1\n}\n}')).toEqual(['', '', '', '', '', ''])
  })

  it('does not recognise a key that contains an escaped quote, so its closing brace pops the parent', () => {
    expect(pathsByLine('{\n    "q\\"uote": {\n        "a": 1\n    }\n}')).toEqual(['', '', '', '', ''])
  })

  it('ignores carriage returns at the end of lines', () => {
    expect(pathsByLine(pretty({ a: { b: [1] } }, 2).replace(/\n/g, '\r\n'))).toEqual([
      '',
      'a',
      'a.b',
      'a.b',
      'a',
      '',
      ''
    ])
  })

  it('maps a single-line document to the root path', () => {
    expect(Array.from(buildJsonPathMap('{"a": {"b": 1}}').entries())).toEqual([[1, '']])
  })
})
