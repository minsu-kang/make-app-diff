import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc-handlers'

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
    const url = new URL(details.url)
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  buildMenu(mainWindow)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
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
          click: () => shell.openExternal(RELEASES_URL)
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
  registerIpcHandlers()
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
