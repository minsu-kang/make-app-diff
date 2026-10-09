import { describe, it, expect } from 'vitest'
import { resolveIpmBaseUrl } from '../ipm-base-url'

describe('resolveIpmBaseUrl', () => {
  it('returns the origin of a local http URL for an unpackaged app', () => {
    expect(resolveIpmBaseUrl(false, { MAKEDIFF_IPM_URL: 'http://127.0.0.1:4010' })).toBe('http://127.0.0.1:4010')
    expect(resolveIpmBaseUrl(false, { MAKEDIFF_IPM_URL: 'http://localhost:4010/some/path' })).toBe(
      'http://localhost:4010'
    )
    expect(resolveIpmBaseUrl(false, { MAKEDIFF_IPM_URL: ' http://[::1]:4010 ' })).toBe('http://[::1]:4010')
  })

  it('ignores the variable in a packaged app', () => {
    expect(resolveIpmBaseUrl(true, { MAKEDIFF_IPM_URL: 'http://127.0.0.1:4010' })).toBeUndefined()
  })

  it.each([
    ['unset', {}],
    ['empty', { MAKEDIFF_IPM_URL: '' }],
    ['blank', { MAKEDIFF_IPM_URL: '   ' }],
    ['not a URL', { MAKEDIFF_IPM_URL: 'not a url' }],
    ['https', { MAKEDIFF_IPM_URL: 'https://127.0.0.1:4010' }],
    ['a remote host', { MAKEDIFF_IPM_URL: 'http://ipm.example.com' }],
    ['a local name inside a remote host', { MAKEDIFF_IPM_URL: 'http://localhost.example.com' }],
    ['credentials in front of a remote host', { MAKEDIFF_IPM_URL: 'http://127.0.0.1@ipm.example.com' }]
  ])('returns nothing when the variable is %s', (_label, env) => {
    expect(resolveIpmBaseUrl(false, env)).toBeUndefined()
  })
})
