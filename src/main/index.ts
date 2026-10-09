import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc-handlers'
import { resolveIpmBaseUrl } from './services/ipm-base-url'
import { isWebUrl, openExternal } from './services/external-link'
import { loadRenderer } from './services/renderer-loader'

const RELEASES_URL = 'https://github.com/integromat/make-app-diff/releases'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 15, y: 10 } }
      : {})
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isWebUrl(details.url)) openExternal(details.url, (url) => shell.openExternal(url))
    return { action: 'deny' }
  })

  buildMenu(mainWindow)

  loadRenderer(
    mainWindow,
    {
      devUrl: is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined,
      file: join(__dirname, '../renderer/index.html')
    },
    (error) => {
      console.error('Failed to load the renderer', error)
      dialog.showErrorBox('MakeDiff', 'The app window failed to load. Please restart the app.')
    }
  )
}

const MENU_IDS = ['download-app', 'open-settings', 'about'] as const

function buildMenu(mainWindow: BrowserWindow): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' } as Electron.MenuItemConstructorOptions] : []),
    {
      label: 'File',
      submenu: [
        {
          id: 'download-app',
          label: 'Download App',
          accelerator: 'CmdOrCtrl+D',
          enabled: false,
          click: () => mainWindow.webContents.send('menu:download-app')
        },
        {
          id: 'open-settings',
          label: 'Open Settings',
          accelerator: 'CmdOrCtrl+,',
          enabled: false,
          click: () => mainWindow.webContents.send('menu:open-settings')
        },
        {
          id: 'about',
          label: 'About',
          accelerator: 'CmdOrCtrl+I',
          enabled: false,
          click: () => mainWindow.webContents.send('menu:show-info')
        },
        { type: 'separator' },
        {
          label: 'Open Releases Page',
          click: () => openExternal(RELEASES_URL, (url) => shell.openExternal(url))
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

export function enableMenuItems(): void {
  const menu = Menu.getApplicationMenu()
  if (!menu) return
  for (const id of MENU_IDS) {
    const item = menu.getMenuItemById(id)
    if (item) item.enabled = true
  }
}

export function disableMenuItems(): void {
  const menu = Menu.getApplicationMenu()
  if (!menu) return
  for (const id of MENU_IDS) {
    const item = menu.getMenuItemById(id)
    if (item) item.enabled = false
  }
}

app.whenReady().then(() => {
  registerIpcHandlers({ ipmBaseUrl: resolveIpmBaseUrl(app.isPackaged, process.env) })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
