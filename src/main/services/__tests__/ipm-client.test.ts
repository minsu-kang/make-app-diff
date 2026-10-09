import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { IpmClient } from '../ipm-client'
import { IpmSettings } from '../../types'

vi.mock('axios')

const mockGet = vi.fn()
const mockAxiosCreate = vi.mocked(axios.create)

beforeEach(() => {
  vi.clearAllMocks()
  mockAxiosCreate.mockReturnValue({ get: mockGet } as never)
})

function makeSettings(overrides: Partial<IpmSettings> = {}): IpmSettings {
  return {
    host: 'ipm.integromat.com',
    ipmToken: 'token-prod',
    ipmeToken: 'token-staging',
    env: 'staging',
    ipmVersion: '3.20.0',
    ...overrides
  }
}

describe('IpmClient constructor', () => {
  it('uses a given base URL instead of https plus the host, also after updateSettings', () => {
    const client = new IpmClient(makeSettings(), 'http://127.0.0.1:4010')
    client.updateSettings(makeSettings({ host: 'ipme.integromat.com' }))

    expect(mockAxiosCreate.mock.calls.map(([config]) => config?.baseURL)).toEqual([
      'http://127.0.0.1:4010',
      'http://127.0.0.1:4010'
    ])
  })

  it('creates axios client with correct baseURL and headers for ipm host', () => {
    new IpmClient(makeSettings())
    expect(mockAxiosCreate).toHaveBeenCalledWith({
      baseURL: 'https://ipm.integromat.com',
      timeout: 30000,
      headers: {
        'x-imt-token': 'token-prod',
        'x-imt-ipm-version': '3.20.0',
        'x-imt-env': 'staging'
      }
    })
  })

  it('falls back to the default version and env when they are blank', () => {
    new IpmClient(makeSettings({ ipmVersion: '', env: '' }))
    expect(mockAxiosCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-imt-ipm-version': '3.20.0',
          'x-imt-env': 'staging'
        })
      })
    )
  })

  it('applies the same defaults when the settings are updated to blank values', () => {
    const client = new IpmClient(makeSettings())
    client.updateSettings(makeSettings({ ipmVersion: '', env: '' }))
    expect(mockAxiosCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-imt-ipm-version': '3.20.0',
          'x-imt-env': 'staging'
        })
      })
    )
  })

  it('uses ipmeToken for ipme host', () => {
    new IpmClient(makeSettings({ host: 'ipme.integromat.com' }))
    expect(mockAxiosCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://ipme.integromat.com',
        headers: expect.objectContaining({
          'x-imt-token': 'token-staging'
        })
      })
    )
  })
})

describe('updateSettings', () => {
  it('builds the new client with the new host and token', () => {
    const client = new IpmClient(makeSettings())
    client.updateSettings(makeSettings({ host: 'ipme.integromat.com', env: 'production', ipmVersion: '4.0.0' }))

    expect(mockAxiosCreate).toHaveBeenCalledTimes(2)
    expect(mockAxiosCreate).toHaveBeenLastCalledWith({
      baseURL: 'https://ipme.integromat.com',
      timeout: 30000,
      headers: {
        'x-imt-token': 'token-staging',
        'x-imt-ipm-version': '4.0.0',
        'x-imt-env': 'production'
      }
    })
  })

  it('sends later requests through the rebuilt client and checks the new token', async () => {
    const oldGet = vi.fn().mockResolvedValue({ data: {} })
    const newGet = vi.fn().mockResolvedValue({ data: [] })
    const created = [{ get: oldGet }, { get: newGet }]
    mockAxiosCreate.mockImplementation(() => created.shift() as never)

    const client = new IpmClient(makeSettings())
    client.updateSettings(makeSettings({ host: 'ipme.integromat.com', ipmeToken: 'token-staging' }))
    await client.searchApps()
    expect(newGet).toHaveBeenCalledWith('/search/apps')
    expect(oldGet).not.toHaveBeenCalled()

    client.updateSettings(makeSettings({ host: 'ipme.integromat.com', ipmeToken: '' }))
    await expect(client.testConnection()).rejects.toThrow('Token is required')
  })
})

describe('testConnection', () => {
  it('calls /v3/info/google-drive', async () => {
    mockGet.mockResolvedValueOnce({ data: {} })
    const client = new IpmClient(makeSettings())
    await client.testConnection()
    expect(mockGet).toHaveBeenCalledWith('/v3/info/google-drive')
  })

  it('throws error when token is empty', async () => {
    const client = new IpmClient(makeSettings({ ipmToken: '', ipmeToken: '' }))
    await expect(client.testConnection()).rejects.toThrow('Token is required')
  })

  it('throws custom error on 403', async () => {
    const axiosError = new Error('Request failed') as Error & {
      response?: { status: number }
      isAxiosError: boolean
    }
    axiosError.response = { status: 403 }
    axiosError.isAxiosError = true
    vi.mocked(axios.isAxiosError).mockReturnValueOnce(true)
    mockGet.mockRejectedValueOnce(axiosError)

    const client = new IpmClient(makeSettings())
    await expect(client.testConnection()).rejects.toThrow('Invalid token')
  })

  it('rethrows non-403 errors', async () => {
    const error = new Error('Network error')
    vi.mocked(axios.isAxiosError).mockReturnValueOnce(false)
    mockGet.mockRejectedValueOnce(error)

    const client = new IpmClient(makeSettings())
    await expect(client.testConnection()).rejects.toThrow('Network error')
  })
})

describe('searchApps', () => {
  it('calls /search/apps and returns data', async () => {
    const data = [{ name: 'app1' }]
    mockGet.mockResolvedValueOnce({ data })
    const client = new IpmClient(makeSettings())
    const result = await client.searchApps()
    expect(mockGet).toHaveBeenCalledWith('/search/apps')
    expect(result).toEqual(data)
  })
})

describe('getAppInfo', () => {
  it('calls /v3/info/{appName} and returns data', async () => {
    const data = { name: 'my-app', version: '1.0.0' }
    mockGet.mockResolvedValueOnce({ data })
    const client = new IpmClient(makeSettings())
    const result = await client.getAppInfo('my-app')
    expect(mockGet).toHaveBeenCalledWith('/v3/info/my-app')
    expect(result).toEqual(data)
  })
})

describe('getManifest', () => {
  it('calls /manifest/app/{appName}/{version}', async () => {
    const data = { dependencies: { accounts: [], hooks: [], keys: [] } }
    mockGet.mockResolvedValueOnce({ data })
    const client = new IpmClient(makeSettings())
    const result = await client.getManifest('app', '1.0.0')
    expect(mockGet).toHaveBeenCalledWith('/manifest/app/app/1.0.0')
    expect(result).toEqual(data)
  })
})

describe('getAppIcon', () => {
  it('uses responseType arraybuffer', async () => {
    const buffer = Buffer.from('icon-data')
    mockGet.mockResolvedValueOnce({ data: buffer })
    const client = new IpmClient(makeSettings())
    await client.getAppIcon('my-app')
    expect(mockGet).toHaveBeenCalledWith('/admin/icon/apps/my-app', { responseType: 'arraybuffer' })
  })
})

describe('downloadComponent', () => {
  it.each([
    ['app', '/v3/sync/app/my-app/1.0.0'],
    ['account', '/v3/sync/account/my-app/1.0.0'],
    ['hook', '/v3/sync/hook/my-app/1.0.0']
  ] as const)('maps type %s to correct URL', async (type, expectedUrl) => {
    const buffer = Buffer.from('data')
    mockGet.mockResolvedValueOnce({ data: buffer })
    const client = new IpmClient(makeSettings())
    await client.downloadComponent('my-app', '1.0.0', type)
    expect(mockGet).toHaveBeenCalledWith(expectedUrl, { responseType: 'arraybuffer' })
  })
})

describe('downloadDependencyComponent', () => {
  it('calls correct URL for account type', async () => {
    const buffer = Buffer.from('data')
    mockGet.mockResolvedValueOnce({ data: buffer })
    const client = new IpmClient(makeSettings())
    await client.downloadDependencyComponent('conn-name', '2.0.0', 'account')
    expect(mockGet).toHaveBeenCalledWith('/v3/sync/account/conn-name/2.0.0', { responseType: 'arraybuffer' })
  })

  it('calls correct URL for hook type', async () => {
    const buffer = Buffer.from('data')
    mockGet.mockResolvedValueOnce({ data: buffer })
    const client = new IpmClient(makeSettings())
    await client.downloadDependencyComponent('hook-name', '3.0.0', 'hook')
    expect(mockGet).toHaveBeenCalledWith('/v3/sync/hook/hook-name/3.0.0', { responseType: 'arraybuffer' })
  })
})

describe('request paths', () => {
  const traversal = '../admin'

  it.each([
    ['getAppInfo', (c: IpmClient) => c.getAppInfo(traversal), 'appName'],
    ['getManifest app name', (c: IpmClient) => c.getManifest(traversal, '1.0.0'), 'appName'],
    ['getManifest version', (c: IpmClient) => c.getManifest('app', '1.0.0/..'), 'version'],
    ['getAppIcon', (c: IpmClient) => c.getAppIcon('app?x=1'), 'appName'],
    ['downloadComponent app name', (c: IpmClient) => c.downloadComponent('a/b', '1.0.0', 'app'), 'appName'],
    ['downloadComponent version', (c: IpmClient) => c.downloadComponent('app', '..', 'app'), 'version'],
    ['downloadComponent type', (c: IpmClient) => c.downloadComponent('app', '1.0.0', '../x' as never), 'type'],
    [
      'downloadDependencyComponent name',
      (c: IpmClient) => c.downloadDependencyComponent('a#b', '1.0.0', 'hook'),
      'name'
    ],
    [
      'downloadDependencyComponent version',
      (c: IpmClient) => c.downloadDependencyComponent('conn', '1 0', 'account'),
      'version'
    ]
  ])('%s rejects a segment that changes the path, without a request', async (_label, call, field) => {
    const client = new IpmClient(makeSettings())

    await expect(call(client)).rejects.toThrow(`Invalid ${field}`)
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('encodes what it lets through', async () => {
    mockGet.mockResolvedValueOnce({ data: {} })
    const client = new IpmClient(makeSettings())

    await client.getAppInfo('acme@1.0')

    expect(mockGet).toHaveBeenCalledWith('/v3/info/acme%401.0')
  })
})
