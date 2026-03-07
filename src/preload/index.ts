import { contextBridge, ipcRenderer } from 'electron'
import type { IpmSettings, AppInfo, SearchAppResult, DiffResult, ExtractedFile } from '../main/types'

interface IpcResult<T> {
  success: boolean
  data?: T
  error?: string
}

const api = {
  showInFinder: (fullPath: string): Promise<void> => ipcRenderer.invoke('shell:show-in-finder', fullPath),
  settings: {
    load: (): Promise<IpmSettings> => ipcRenderer.invoke('settings:load'),
    save: (settings: IpmSettings): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('settings:save', settings)
  },
  theme: {
    load: (): Promise<string> => ipcRenderer.invoke('theme:load'),
    save: (theme: string): Promise<{ success: boolean }> => ipcRenderer.invoke('theme:save', theme)
  },
  ipm: {
    searchApps: (): Promise<IpcResult<SearchAppResult[]>> => ipcRenderer.invoke('ipm:search-apps'),
    getAppInfo: (appName: string): Promise<IpcResult<AppInfo>> => ipcRenderer.invoke('ipm:get-app-info', appName),
    getAppIcon: (appName: string): Promise<IpcResult<string>> => ipcRenderer.invoke('ipm:get-app-icon', appName),
    downloadAndExtract: (appName: string, version: string, type: ComponentType): Promise<IpcResult<ExtractedFile[]>> =>
      ipcRenderer.invoke('ipm:download-and-extract', appName, version, type),
    getDiff: (appName: string, fromVersion: string, toVersion: string): Promise<IpcResult<DiffResult>> =>
      ipcRenderer.invoke('ipm:get-diff', appName, fromVersion, toVersion),
    downloadVersion: (appName: string, version: string): Promise<IpcResult<string>> =>
      ipcRenderer.invoke('ipm:download-version', appName, version)
  }
}

export type ElectronApi = typeof api

contextBridge.exposeInMainWorld('api', api)

contextBridge.exposeInMainWorld('appVersion', {
  app: '1.0.0',
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node
})

contextBridge.exposeInMainWorld('onMenu', {
  downloadApp: (callback: () => void) => ipcRenderer.on('menu:download-app', callback),
  openSettings: (callback: () => void) => ipcRenderer.on('menu:open-settings', callback),
  showInfo: (callback: () => void) => ipcRenderer.on('menu:show-info', callback)
})
