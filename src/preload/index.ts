import { contextBridge, ipcRenderer } from 'electron'
import type {
  IpcResult,
  IpmSettings,
  AppInfo,
  SearchAppResult,
  ComponentType,
  DiffResult,
  ExtractedFile,
  FavoriteApp,
  RecentApp
} from '../main/types'

export type {
  IpcResult,
  IpmSettings,
  AppInfo,
  AppManifest,
  SearchAppResult,
  ComponentType,
  ExtractedFile,
  ExtractedComponent,
  FileDiff,
  DiffResult,
  FavoriteApp,
  RecentApp,
  VersionTags,
  SearchApp,
  SearchEntry
} from '../main/types'

const api = {
  showInFinder: (fullPath: string): Promise<void> => ipcRenderer.invoke('shell:show-in-finder', fullPath),
  editor: {
    openDiff: (opts: {
      filePath: string; fromVersion: string; toVersion: string
      oldContent: string; newContent: string
    }): Promise<IpcResult<void>> => ipcRenderer.invoke('editor:open-diff', opts)
  },
  clipboard: {
    copyZip: (opts: {
      appName: string; version: string; files: { path: string; content: string }[]
    }): Promise<IpcResult<string>> => ipcRenderer.invoke('clipboard:copy-zip', opts)
  },
  settings: {
    load: (): Promise<IpmSettings> => ipcRenderer.invoke('settings:load'),
    save: (settings: IpmSettings): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('settings:save', settings)
  },
  theme: {
    load: (): Promise<string> => ipcRenderer.invoke('theme:load'),
    save: (theme: string): Promise<{ success: boolean }> => ipcRenderer.invoke('theme:save', theme)
  },
  favorites: {
    load: (): Promise<IpcResult<FavoriteApp[]>> => ipcRenderer.invoke('favorites:load'),
    save: (favorites: FavoriteApp[]): Promise<{ success: boolean }> => ipcRenderer.invoke('favorites:save', favorites)
  },
  recent: {
    load: (): Promise<IpcResult<RecentApp[]>> => ipcRenderer.invoke('recent:load'),
    add: (name: string, label: string): Promise<IpcResult<RecentApp[]>> => ipcRenderer.invoke('recent:add', name, label)
  },
  update: {
    check: (): Promise<IpcResult<void>> => ipcRenderer.invoke('update:check'),
    openRelease: (): Promise<void> => ipcRenderer.invoke('update:open-release'),
    onAvailable: (cb: (version: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, version: string) => cb(version)
      ipcRenderer.on('update:available', handler)
      return () => ipcRenderer.removeListener('update:available', handler)
    }
  },
  ipm: {
    searchApps: (): Promise<IpcResult<SearchAppResult[]>> => ipcRenderer.invoke('ipm:search-apps'),
    getAppInfo: (appName: string): Promise<IpcResult<AppInfo>> => ipcRenderer.invoke('ipm:get-app-info', appName),
    getAppIcon: (appName: string): Promise<IpcResult<string>> => ipcRenderer.invoke('ipm:get-app-icon', appName),
    downloadAndExtract: (appName: string, version: string, type: ComponentType): Promise<IpcResult<ExtractedFile[]>> =>
      ipcRenderer.invoke('ipm:download-and-extract', appName, version, type),
    getDiff: (appName: string, fromVersion: string, toVersion: string): Promise<IpcResult<DiffResult>> =>
      ipcRenderer.invoke('ipm:get-diff', appName, fromVersion, toVersion),
    showVersion: (appName: string, version: string): Promise<IpcResult<DiffResult>> =>
      ipcRenderer.invoke('ipm:show-version', appName, version),
    downloadVersion: (appName: string, version: string): Promise<IpcResult<string>> =>
      ipcRenderer.invoke('ipm:download-version', appName, version)
  }
}

export type ElectronApi = typeof api

contextBridge.exposeInMainWorld('api', api)

const pkg = require('../../package.json')

contextBridge.exposeInMainWorld('appVersion', {
  app: pkg.version as string,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node
})

contextBridge.exposeInMainWorld('onMenu', {
  downloadApp: (callback: () => void) => {
    ipcRenderer.on('menu:download-app', callback)
    return () => ipcRenderer.removeListener('menu:download-app', callback)
  },
  openSettings: (callback: () => void) => {
    ipcRenderer.on('menu:open-settings', callback)
    return () => ipcRenderer.removeListener('menu:open-settings', callback)
  },
  showInfo: (callback: () => void) => {
    ipcRenderer.on('menu:show-info', callback)
    return () => ipcRenderer.removeListener('menu:show-info', callback)
  }
})
