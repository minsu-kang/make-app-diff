/// <reference types="vite/client" />

import type { ElectronApi } from '../preload/index'

declare global {
  interface Window {
    api: ElectronApi
    appVersion: {
      app: string
      electron: string
      chrome: string
      node: string
    }
    onMenu: {
      downloadApp: (callback: () => void) => () => void
      openSettings: (callback: () => void) => () => void
      showInfo: (callback: () => void) => () => void
    }
  }
}
