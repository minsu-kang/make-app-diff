import { describe, it, expect, vi, afterEach } from 'vitest'
import { isWebUrl, openExternal } from '../external-link'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isWebUrl', () => {
  it.each(['https://github.com/integromat/make-app-diff/releases', 'http://localhost:3000/a?b=c'])(
    'accepts %s',
    (url) => {
      expect(isWebUrl(url)).toBe(true)
    }
  )

  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'mailto:a@b.c', 'data:text/html,hi', 'ftp://host/x'])(
    'rejects %s',
    (url) => {
      expect(isWebUrl(url)).toBe(false)
    }
  )

  it.each(['', 'not a url', '::', '//no-scheme.example', 'https//missing-colon'])(
    'returns false for the malformed value %j instead of throwing',
    (url) => {
      expect(isWebUrl(url)).toBe(false)
    }
  )
})

describe('openExternal', () => {
  it('opens the url', () => {
    const open = vi.fn().mockResolvedValue(undefined)
    openExternal('https://example.com', open)
    expect(open).toHaveBeenCalledWith('https://example.com')
  })

  it('logs a failed launch instead of leaving an unhandled rejection', async () => {
    const error = new Error('no handler')
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    openExternal('https://example.com', () => Promise.reject(error))
    await new Promise((resolve) => setTimeout(resolve, 10))
    process.off('unhandledRejection', unhandled)
    expect(logged).toHaveBeenCalledWith('Failed to open https://example.com', error)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('does not log when the launch succeeds', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    openExternal('https://example.com', () => Promise.resolve())
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(logged).not.toHaveBeenCalled()
  })
})
