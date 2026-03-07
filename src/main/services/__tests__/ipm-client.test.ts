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
  it('creates axios client with correct baseURL and headers for ipm host', () => {
    new IpmClient(makeSettings())
    expect(mockAxiosCreate).toHaveBeenCalledWith({
      baseURL: 'https://ipm.integromat.com',
      headers: {
        'x-imt-token': 'token-prod',
        'x-imt-ipm-version': '3.20.0',
        'x-imt-env': 'staging'
      }
    })
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
  it('creates a new client with updated settings', () => {
    const client = new IpmClient(makeSettings())
    expect(mockAxiosCreate).toHaveBeenCalledTimes(1)

    client.updateSettings(makeSettings({ host: 'ipme.integromat.com' }))
    expect(mockAxiosCreate).toHaveBeenCalledTimes(2)
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
