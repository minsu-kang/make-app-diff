import axios, { AxiosInstance } from 'axios'
import { IpmSettings, AppInfo, AppManifest, SearchAppResult, ComponentType } from '../types'

function getActiveToken(settings: IpmSettings): string {
  return settings.host === 'ipme.integromat.com' ? settings.ipmeToken : settings.ipmToken
}

export class IpmClient {
  private client: AxiosInstance

  constructor(private settings: IpmSettings) {
    this.client = this.createClient(settings)
  }

  private createClient(settings: IpmSettings): AxiosInstance {
    return axios.create({
      baseURL: `https://${settings.host}`,
      headers: {
        'x-imt-token': getActiveToken(settings),
        'x-imt-ipm-version': settings.ipmVersion || '3.20.0',
        'x-imt-env': settings.env || 'staging'
      }
    })
  }

  updateSettings(settings: IpmSettings): void {
    this.settings = settings
    this.client = this.createClient(settings)
  }

  async testConnection(): Promise<void> {
    const token = getActiveToken(this.settings)
    if (!token.trim()) {
      throw new Error('Token is required')
    }
    try {
      await this.client.get('/v3/info/google-drive')
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        const host = this.settings.host
        throw new Error(`Invalid token. Please check your token for ${host}.`)
      }
      throw err
    }
  }

  async searchApps(): Promise<SearchAppResult[]> {
    const response = await this.client.get('/search/apps')
    return response.data
  }

  async getAppInfo(appName: string): Promise<AppInfo> {
    const response = await this.client.get(`/v3/info/${appName}`)
    return response.data
  }

  async getManifest(appName: string, version: string): Promise<AppManifest> {
    const response = await this.client.get(`/manifest/app/${appName}/${version}`)
    return response.data
  }

  async getAppIcon(appName: string): Promise<Buffer> {
    const response = await this.client.get(`/admin/icon/apps/${appName}`, {
      responseType: 'arraybuffer'
    })
    return Buffer.from(response.data)
  }

  async downloadDependencyComponent(name: string, version: string, type: 'account' | 'hook'): Promise<Buffer> {
    const response = await this.client.get(`/v3/sync/${type}/${name}/${version}`, { responseType: 'arraybuffer' })
    return Buffer.from(response.data)
  }

  async downloadComponent(appName: string, version: string, type: ComponentType): Promise<Buffer> {
    const pathMap: Record<ComponentType, string> = {
      app: 'app',
      account: 'account',
      hook: 'hook'
    }
    const response = await this.client.get(`/v3/sync/${pathMap[type]}/${appName}/${version}`, {
      responseType: 'arraybuffer'
    })
    return Buffer.from(response.data)
  }
}
