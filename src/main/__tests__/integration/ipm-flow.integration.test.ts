import { describe, it, expect, vi } from 'vitest'
import type { AppInfo, FavoriteApp, IpcResult, IpmSettings, RecentApp, SearchAppResult } from '../../types'
import { PNG, PROD_HOST, connect, invoke, ipm, settings, spies, startApp } from './harness'

const HOUR = 60 * 60 * 1000

describe('settings and session', () => {
  it('rejects a token the server refuses and keeps the previous settings', async () => {
    await startApp()
    ipm().get('/v3/info/google-drive').reply(403, {})

    const result = await invoke<IpcResult<void>>('settings:save', settings)

    expect(result).toEqual({ success: false, error: `Invalid token. Please check your token for ${PROD_HOST}.` })
    const stored = await invoke<IpmSettings>('settings:load')
    expect(stored.ipmToken).toBe('')
    expect(stored.host).toBe('ipme.integromat.com')
    expect(spies.enableMenuItems).not.toHaveBeenCalled()
  })

  it('saves valid settings and sends the new host, token and headers on the next request', async () => {
    await startApp()
    await connect()
    ipm()
      .get('/search/apps')
      .matchHeader('x-imt-token', 'token-prod')
      .matchHeader('x-imt-ipm-version', '3.21.0')
      .matchHeader('x-imt-env', 'production')
      .reply(200, [])

    const result = await invoke<IpcResult<SearchAppResult[]>>('ipm:search-apps')

    expect(result).toEqual({ success: true, data: [] })
    expect(await invoke<IpmSettings>('settings:load')).toEqual(settings)
    expect(spies.enableMenuItems).toHaveBeenCalledTimes(1)
  })

  it('uses the staging token when the staging host is selected', async () => {
    await startApp()
    await connect({ host: 'ipme.integromat.com' })
    ipm('ipme.integromat.com').get('/search/apps').matchHeader('x-imt-token', 'token-staging').reply(200, [])

    expect(await invoke<IpcResult<SearchAppResult[]>>('ipm:search-apps')).toEqual({ success: true, data: [] })
  })

  it('expires the session after 48 hours: tokens are cleared and later requests go out without one', async () => {
    await startApp()
    await connect()
    expect(await invoke('session:check')).toEqual({ expired: false })

    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 49 * HOUR })
    expect(await invoke('session:check')).toEqual({ expired: true })

    expect(spies.disableMenuItems).toHaveBeenCalledTimes(1)
    const stored = await invoke<IpmSettings>('settings:load')
    expect(stored.ipmToken).toBe('')
    expect(stored.ipmeToken).toBe('')
    expect(stored.host).toBe(PROD_HOST)

    ipm()
      .get('/search/apps')
      .matchHeader('x-imt-token', (token) => token === '')
      .reply(200, [])
    expect(await invoke('ipm:search-apps')).toEqual({ success: true, data: [] })
  })

  it('keeps the session just before 48 hours', async () => {
    await startApp()
    await connect()

    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 47 * HOUR })

    expect(await invoke('session:check')).toEqual({ expired: false })
    expect((await invoke<IpmSettings>('settings:load')).ipmToken).toBe('token-prod')
  })
})

describe('app catalog', () => {
  it('lists apps with their versions sorted newest first', async () => {
    await startApp()
    await connect()
    ipm()
      .get('/search/apps')
      .reply(200, [
        {
          name: 'slack',
          label: 'Slack',
          theme: '#4a154b',
          version: '2.0.0',
          availableVersions: ['1.9.0', '2.0.0', '1.10.0', '2.1.3']
        }
      ])

    const result = await invoke<IpcResult<SearchAppResult[]>>('ipm:search-apps')

    expect(result.data?.[0].availableVersions).toEqual(['2.1.3', '2.0.0', '1.10.0', '1.9.0'])
  })

  it('turns a server error into an error result', async () => {
    await startApp()
    await connect()
    ipm().get('/search/apps').reply(500, {})

    const result = await invoke<IpcResult<SearchAppResult[]>>('ipm:search-apps')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Request failed with status code 500')
  })

  it('reads the label from the manifest of the newest version and theme and icon hash from the meta', async () => {
    await startApp()
    await connect()
    ipm()
      .get('/v3/info/slack')
      .reply(200, {
        name: 'slack',
        label: 'old label',
        description: 'Slack app',
        version: '1.0.0',
        versions: ['1.0.0', '2.0.0', '1.5.0'],
        meta: { theme: '#4a154b', iconHash: 'abc123' }
      })
    ipm().get('/manifest/app/slack/2.0.0').reply(200, { label: 'Slack (manifest)' })

    const result = await invoke<IpcResult<AppInfo>>('ipm:get-app-info', 'slack')

    expect(result.data).toMatchObject({
      version: '2.0.0',
      versions: ['2.0.0', '1.5.0', '1.0.0'],
      label: 'Slack (manifest)',
      theme: '#4a154b',
      iconHash: 'abc123'
    })
  })

  it('reads the manifest of a requested version and falls back to the app name for the label', async () => {
    await startApp()
    await connect()
    ipm()
      .get('/v3/info/slack')
      .reply(200, { name: 'slack', version: '2.0.0', versions: ['1.0.0', '2.0.0'] })
    ipm().get('/manifest/app/slack/1.0.0').reply(200, {})

    const result = await invoke<IpcResult<AppInfo>>('ipm:get-app-info', 'slack', '1.0.0')

    expect(result.data).toMatchObject({ version: '1.0.0', label: 'slack' })
  })

  it('rejects an empty app name without calling the server', async () => {
    await startApp()
    await connect()

    const result = await invoke<IpcResult<AppInfo>>('ipm:get-app-info', '')

    expect(result).toEqual({ success: false, error: 'Invalid appName: expected non-empty string' })
  })

  it('returns the icon as a data URL and detects SVG', async () => {
    await startApp()
    await connect()
    ipm().get('/admin/icon/apps/slack').reply(200, PNG, { 'Content-Type': 'image/png' })
    ipm().get('/admin/icon/apps/svg-app').reply(200, '<svg xmlns="http://www.w3.org/2000/svg"></svg>')

    const png = await invoke<IpcResult<string>>('ipm:get-app-icon', 'slack')
    const svg = await invoke<IpcResult<string>>('ipm:get-app-icon', 'svg-app')

    expect(png.data).toBe(`data:image/png;base64,${PNG.toString('base64')}`)
    expect(svg.data).toMatch(/^data:image\/svg\+xml;base64,/)
  })
})

describe('favorites and recent apps', () => {
  it('stores favorites and rejects an entry without a major version, keeping what was saved', async () => {
    await startApp()
    const slack: FavoriteApp = { name: 'slack', label: 'Slack', major: 2, addedAt: 1 }
    const old: FavoriteApp = { name: 'old', label: 'Old', major: 1, addedAt: 2 }

    expect(await invoke('favorites:save', [slack, old])).toEqual({ success: true })
    expect(await invoke('favorites:save', [slack, { name: 'bad', label: 'Bad', addedAt: 3 }])).toEqual({
      success: false,
      error: 'Invalid favorite.major: expected finite number'
    })
    expect((await invoke<IpcResult<FavoriteApp[]>>('favorites:load')).data).toEqual([slack, old])
  })

  it('keeps the eight most recent apps, newest first, without duplicates', async () => {
    await startApp()
    for (let i = 1; i <= 9; i++) await invoke('recent:add', `app-${i}`, `App ${i}`, 1)
    await invoke('recent:add', 'app-5', 'App 5', 1)

    const result = await invoke<IpcResult<RecentApp[]>>('recent:load')

    expect(result.data?.map((r) => r.name)).toEqual([
      'app-5',
      'app-9',
      'app-8',
      'app-7',
      'app-6',
      'app-4',
      'app-3',
      'app-2'
    ])
  })
})
