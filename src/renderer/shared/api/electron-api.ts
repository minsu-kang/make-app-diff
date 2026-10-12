import type { ElectronApi } from '../types'

export function getApi(): ElectronApi {
  return window.api
}

export function getMenuEvents(): Window['onMenu'] {
  return window.onMenu
}

export function getAppVersion(): Window['appVersion'] {
  return window.appVersion
}
