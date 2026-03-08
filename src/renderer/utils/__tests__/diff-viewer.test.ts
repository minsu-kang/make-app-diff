import { describe, it, expect } from 'vitest'
import { splitHighlightedLines, buildJsonPathMap, isValidDataUri } from '../diff-viewer'

describe('splitHighlightedLines', () => {
  it('splits plain text by newlines', () => {
    const result = splitHighlightedLines('line1\nline2\nline3')
    expect(result).toEqual(['line1', 'line2', 'line3'])
  })

  it('handles single line without newline', () => {
    expect(splitHighlightedLines('hello')).toEqual(['hello'])
  })

  it('preserves span context across lines', () => {
    const html = '<span class="keyword">if\ntrue</span>'
    const result = splitHighlightedLines(html)
    expect(result).toHaveLength(2)
    // First line: opens span and closes it at end
    expect(result[0]).toBe('<span class="keyword">if</span>')
    // Second line: re-opens the span and includes the close tag
    expect(result[1]).toBe('<span class="keyword">true</span>')
  })

  it('handles nested spans across lines', () => {
    const html = '<span class="outer"><span class="inner">a\nb</span></span>'
    const result = splitHighlightedLines(html)
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('</span></span>')
    expect(result[1]).toContain('<span class="outer"><span class="inner">')
  })

  it('handles empty input', () => {
    expect(splitHighlightedLines('')).toEqual([''])
  })

  it('handles line with only closing tags', () => {
    const html = '<span class="a">x\n</span>'
    const result = splitHighlightedLines(html)
    expect(result).toHaveLength(2)
  })
})

describe('buildJsonPathMap', () => {
  it('returns empty map for invalid JSON', () => {
    expect(buildJsonPathMap('not json').size).toBe(0)
  })

  it('maps line numbers to JSON paths for simple object', () => {
    const json = JSON.stringify({ name: 'test', value: 42 }, null, 4)
    const pathMap = buildJsonPathMap(json)
    expect(pathMap.size).toBeGreaterThan(0)
    // First line is `{`, path should be empty string (root)
    expect(pathMap.get(1)).toBe('')
  })

  it('maps nested object paths', () => {
    const json = JSON.stringify(
      {
        response: {
          output: 'data'
        }
      },
      null,
      4
    )
    const pathMap = buildJsonPathMap(json)
    // Find the line with "response": {
    const lines = json.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('"response"')) {
        expect(pathMap.get(i + 1)).toBe('response')
      }
    }
  })

  it('maps array elements with indices', () => {
    const json = JSON.stringify(
      {
        items: [{ id: 1 }, { id: 2 }]
      },
      null,
      4
    )
    const pathMap = buildJsonPathMap(json)
    const lines = json.split('\n')
    // Find lines that are bare `{` inside the items array
    let arrayElementCount = 0
    for (let i = 0; i < lines.length; i++) {
      const path = pathMap.get(i + 1)
      if (path && path.startsWith('items[')) {
        arrayElementCount++
      }
    }
    expect(arrayElementCount).toBeGreaterThan(0)
  })

  it('handles empty object', () => {
    const pathMap = buildJsonPathMap('{}')
    expect(pathMap.size).toBeGreaterThan(0)
  })

  it('handles empty array', () => {
    const pathMap = buildJsonPathMap('[]')
    expect(pathMap.size).toBeGreaterThan(0)
  })
})

describe('isValidDataUri', () => {
  it('accepts valid PNG data URI', () => {
    expect(isValidDataUri('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
  })

  it('accepts valid SVG data URI', () => {
    expect(isValidDataUri('data:image/svg+xml;base64,PHN2Zw==')).toBe(true)
  })

  it('accepts valid JPEG data URI', () => {
    expect(isValidDataUri('data:image/jpeg;base64,/9j/4AAQ==')).toBe(true)
  })

  it('rejects non-image data URI', () => {
    expect(isValidDataUri('data:text/plain;base64,aGVsbG8=')).toBe(false)
  })

  it('rejects URI with invalid base64 characters', () => {
    expect(isValidDataUri('data:image/png;base64,invalid chars!!')).toBe(false)
  })

  it('rejects plain string', () => {
    expect(isValidDataUri('not a data uri')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidDataUri('')).toBe(false)
  })
})
