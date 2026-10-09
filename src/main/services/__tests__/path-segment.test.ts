import { describe, it, expect } from 'vitest'
import { assertPathSegment } from '../path-segment'

describe('assertPathSegment', () => {
  it.each(['acme', 'google-drive', '1.2.0', 'acme@1.0.0', 'My_App-2', '...'])('accepts %s', (value) => {
    expect(() => assertPathSegment(value, 'appName')).not.toThrow()
  })

  it.each(['', '.', '..', '../x', 'a/b', 'a\\b', 'a b', 'a?x=1', 'a#b', 'a%2Fb', 'a\nb', '/'])(
    'rejects %j',
    (value) => {
      expect(() => assertPathSegment(value, 'appName')).toThrow('Invalid appName')
    }
  )

  it.each([undefined, null, 1, {}, ['acme']])('rejects the non-string %j', (value) => {
    expect(() => assertPathSegment(value, 'version')).toThrow('Invalid version')
  })
})
