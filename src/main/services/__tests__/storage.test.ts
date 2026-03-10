import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockSet = vi.fn()

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      private defaults: Record<string, unknown>
      constructor(opts: { defaults: Record<string, unknown> }) {
        this.defaults = opts.defaults
      }
      get(key: string): unknown {
        const result = mockGet(key)
        if (result !== undefined) return result
        return (this.defaults as Record<string, unknown>)[key]
      }
      set(key: string, value: unknown): void {
        mockSet(key, value)
      }
    }
  }
})

// Import after mock so the module-level `new Store()` uses our mock
import {
  loadSettings,
  saveSettings,
  loadTheme,
  saveTheme,
  loadFavorites,
  saveFavorites,
  loadRecentApps,
  saveRecentApps
} from '../storage'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadSettings', () => {
  it('returns defaults when store has full settings', () => {
    mockGet.mockReturnValueOnce({
      host: 'ipme.integromat.com',
      ipmToken: '',
      ipmeToken: '',
      env: 'staging',
      ipmVersion: '3.20.0'
    })
    const settings = loadSettings()
    expect(settings.host).toBe('ipme.integromat.com')
    expect(settings.env).toBe('staging')
    expect(settings.ipmVersion).toBe('3.20.0')
  })

  it('applies defaults for missing fields', () => {
    mockGet.mockReturnValueOnce({
      host: '',
      ipmToken: 'tok',
      env: '',
      ipmVersion: ''
    })
    const settings = loadSettings()
    // Falsy host falls back to default
    expect(settings.host).toBe('ipme.integromat.com')
    expect(settings.ipmToken).toBe('tok')
    expect(settings.env).toBe('staging')
    expect(settings.ipmVersion).toBe('3.20.0')
  })

  it('preserves empty string tokens via nullish coalescing', () => {
    mockGet.mockReturnValueOnce({
      host: 'ipm.integromat.com',
      ipmToken: '',
      ipmeToken: '',
      env: 'staging',
      ipmVersion: '3.20.0'
    })
    const settings = loadSettings()
    expect(settings.ipmToken).toBe('')
    expect(settings.ipmeToken).toBe('')
  })
})

describe('saveSettings', () => {
  it('calls store.set with settings', () => {
    const settings = {
      host: 'ipm.integromat.com',
      ipmToken: 'tok',
      ipmeToken: 'etok',
      env: 'production',
      ipmVersion: '4.0.0'
    }
    saveSettings(settings)
    expect(mockSet).toHaveBeenCalledWith('settings', settings)
  })
})

describe('loadTheme', () => {
  it('returns stored theme', () => {
    mockGet.mockReturnValueOnce('make')
    expect(loadTheme()).toBe('make')
  })

  it('returns dark as default', () => {
    mockGet.mockReturnValueOnce('')
    expect(loadTheme()).toBe('dark')
  })
})

describe('saveTheme', () => {
  it('calls store.set with theme', () => {
    saveTheme('light')
    expect(mockSet).toHaveBeenCalledWith('theme', 'light')
  })
})

describe('loadFavorites', () => {
  it('returns stored favorites', () => {
    const favorites = [{ name: 'google-drive', label: 'Google Drive', addedAt: 1704067200000 }]
    mockGet.mockReturnValueOnce(favorites)
    expect(loadFavorites()).toEqual(favorites)
  })

  it('returns empty array as default', () => {
    mockGet.mockReturnValueOnce(undefined)
    expect(loadFavorites()).toEqual([])
  })
})

describe('saveFavorites', () => {
  it('calls store.set with favorites', () => {
    const favorites = [{ name: 'slack', label: 'Slack', major: 1, addedAt: 1706745600000 }]
    saveFavorites(favorites)
    expect(mockSet).toHaveBeenCalledWith('favorites', favorites)
  })
})

describe('loadRecentApps', () => {
  it('returns stored recent apps', () => {
    const recent = [{ name: 'github', label: 'GitHub', major: 1, lastViewed: 1709251200000 }]
    mockGet.mockReturnValueOnce(recent)
    expect(loadRecentApps()).toEqual(recent)
  })

  it('returns empty array as default', () => {
    mockGet.mockReturnValueOnce(undefined)
    expect(loadRecentApps()).toEqual([])
  })
})

describe('saveRecentApps', () => {
  it('calls store.set with recentApps', () => {
    const recent = [{ name: 'jira', label: 'Jira', major: 1, lastViewed: 1711929600000 }]
    saveRecentApps(recent)
    expect(mockSet).toHaveBeenCalledWith('recentApps', recent)
  })
})
