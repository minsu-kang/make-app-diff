import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import axios from 'axios'
import { registerIpcHandlers } from './ipc-handlers'

const REPO_OWNER = 'minsu-kang'
const REPO_NAME = 'make-app-diff'

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
  checkForUpdates(mainWindow)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

export async function checkForUpdates(mainWindow: BrowserWindow, manual = false): Promise<void> {
  try {
    const { data } = await axios.get(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
      timeout: 10000
    })
    const latest = (data.tag_name as string).replace(/^v/, '')
    const current = app.getVersion()
    if (latest !== current) {
      mainWindow.webContents.send('update:available', latest)
    } else if (manual) {
      mainWindow.webContents.send('update:up-to-date')
    }
  } catch {
    if (manual) {
      mainWindow.webContents.send('update:error')
    }
  }
}

function buildMenu(mainWindow: BrowserWindow): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        {
          label: 'Download App',
          accelerator: 'CmdOrCtrl+D',
          click: () => mainWindow.webContents.send('menu:download-app')
        },
        {
          label: 'Open Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow.webContents.send('menu:open-settings')
        },
        {
          label: 'About',
          accelerator: 'CmdOrCtrl+I',
          click: () => mainWindow.webContents.send('menu:show-info')
        },
        { type: 'separator' },
        {
          label: 'Check for Updates',
          click: () => checkForUpdates(mainWindow, true)
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
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
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
