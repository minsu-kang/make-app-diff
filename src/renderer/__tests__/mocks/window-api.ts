import { vi, type Mock } from 'vitest'
import type { ElectronApi, IpcResult } from '../../shared/types'

export type Mocked<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : Mocked<T[K]>
}

export type ApiMock = Mocked<ElectronApi>

export interface MenuMock {
  downloadApp: Mock<(callback: () => void) => () => void>
  openSettings: Mock<(callback: () => void) => () => void>
  showInfo: Mock<(callback: () => void) => () => void>
  emit: (event: 'downloadApp' | 'openSettings' | 'showInfo') => void
}

export function ok<T>(data: T): IpcResult<T> {
  return { success: true, data }
}

export function fail(error: string): IpcResult<never> {
  return { success: false, error }
}

export function createApiMock(): ApiMock {
  return {
    session: { check: vi.fn<ElectronApi['session']['check']>().mockResolvedValue({ expired: false }) },
    menu: { setEnabled: vi.fn<ElectronApi['menu']['setEnabled']>().mockResolvedValue(undefined) },
    showInFinder: vi.fn<ElectronApi['showInFinder']>().mockResolvedValue(undefined),
    editor: {
      openDiff: vi.fn<ElectronApi['editor']['openDiff']>().mockResolvedValue({ success: true }),
      openInVscode: vi.fn<ElectronApi['editor']['openInVscode']>().mockResolvedValue({ success: true })
    },
    clipboard: { copyZip: vi.fn<ElectronApi['clipboard']['copyZip']>().mockResolvedValue(ok('/tmp/app@1.zip')) },
    settings: {
      load: vi.fn<ElectronApi['settings']['load']>().mockResolvedValue({
        host: 'ipm.integromat.com',
        ipmToken: 'token',
        ipmeToken: '',
        env: 'staging',
        ipmVersion: '3.20.0'
      }),
      save: vi.fn<ElectronApi['settings']['save']>().mockResolvedValue({ success: true })
    },
    theme: {
      load: vi.fn<ElectronApi['theme']['load']>().mockResolvedValue('dark'),
      save: vi.fn<ElectronApi['theme']['save']>().mockResolvedValue({ success: true })
    },
    favorites: {
      load: vi.fn<ElectronApi['favorites']['load']>().mockResolvedValue(ok([])),
      save: vi.fn<ElectronApi['favorites']['save']>().mockResolvedValue({ success: true })
    },
    recent: {
      load: vi.fn<ElectronApi['recent']['load']>().mockResolvedValue(ok([])),
      add: vi.fn<ElectronApi['recent']['add']>().mockResolvedValue(ok([]))
    },
    ipm: {
      searchApps: vi.fn<ElectronApi['ipm']['searchApps']>().mockResolvedValue(ok([])),
      getAppInfo: vi.fn<ElectronApi['ipm']['getAppInfo']>().mockResolvedValue(fail('not mocked')),
      getAppIcon: vi.fn<ElectronApi['ipm']['getAppIcon']>().mockResolvedValue(fail('no icon')),
      downloadAndExtract: vi.fn<ElectronApi['ipm']['downloadAndExtract']>().mockResolvedValue(ok([])),
      getDiff: vi.fn<ElectronApi['ipm']['getDiff']>().mockResolvedValue(fail('not mocked')),
      showVersion: vi.fn<ElectronApi['ipm']['showVersion']>().mockResolvedValue(fail('not mocked')),
      downloadVersion: vi.fn<ElectronApi['ipm']['downloadVersion']>().mockResolvedValue(ok('/tmp/app/1.0.0'))
    }
  }
}

export function createMenuMock(): MenuMock {
  const listeners: Record<'downloadApp' | 'openSettings' | 'showInfo', Set<() => void>> = {
    downloadApp: new Set(),
    openSettings: new Set(),
    showInfo: new Set()
  }
  const register = (event: keyof typeof listeners) =>
    vi.fn((callback: () => void) => {
      listeners[event].add(callback)
      return () => {
        listeners[event].delete(callback)
      }
    })
  return {
    downloadApp: register('downloadApp'),
    openSettings: register('openSettings'),
    showInfo: register('showInfo'),
    emit: (event) => listeners[event].forEach((callback) => callback())
  }
}

export function installWindowMocks(): { api: ApiMock; menu: MenuMock } {
  const api = createApiMock()
  const menu = createMenuMock()
  Object.assign(window, {
    api,
    onMenu: menu,
    appVersion: { app: '0.0.0-test', electron: '0.0.0', chrome: '0.0.0', node: '0.0.0' }
  })
  return { api, menu }
}

export function mockApi(): ApiMock {
  return window.api as unknown as ApiMock
}

export function mockMenu(): MenuMock {
  return window.onMenu as unknown as MenuMock
}
