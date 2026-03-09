import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import axios from 'axios'
import { registerIpcHandlers } from './ipc-handlers'
import { loadSettings } from './services/storage'

const REPO_OWNER = 'minsu-kang'
const REPO_NAME = 'make-app-diff'
const UPDATE_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

let updateCache: { version: string; timestamp: number } | null = null

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
  // Use cached response if still fresh
  if (updateCache && Date.now() - updateCache.timestamp < UPDATE_CACHE_TTL) {
    const current = app.getVersion()
    if (updateCache.version !== current) {
      mainWindow.webContents.send('update:available', updateCache.version)
    } else if (manual) {
      mainWindow.webContents.send('update:up-to-date')
    }
    return
  }

  try {
    const { data } = await axios.get(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
      timeout: 10000
    })
    const latest = (data.tag_name as string).replace(/^v/, '')
    updateCache = { version: latest, timestamp: Date.now() }
    const current = app.getVersion()
    if (latest !== current) {
      mainWindow.webContents.send('update:available', latest)
    } else if (manual) {
      mainWindow.webContents.send('update:up-to-date')
    }
  } catch (error: unknown) {
    if (manual) {
      const isRateLimit = axios.isAxiosError(error) && error.response?.status === 403
      const message = isRateLimit
        ? 'GitHub API rate limit exceeded. Please try again later.'
        : 'Could not check for updates'
      mainWindow.webContents.send('update:error', message)
    }
  }
}

const MENU_IDS = ['download-app', 'open-settings', 'about'] as const

function buildMenu(mainWindow: BrowserWindow): void {
  const settings = loadSettings()
  const hasTokens = !!(settings.ipmToken || settings.ipmeToken)

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' } as Electron.MenuItemConstructorOptions] : []),
    {
      label: 'File',
      submenu: [
        {
          id: 'download-app',
          label: 'Download App',
          accelerator: 'CmdOrCtrl+D',
          enabled: hasTokens,
          click: () => mainWindow.webContents.send('menu:download-app')
        },
        {
          id: 'open-settings',
          label: 'Open Settings',
          accelerator: 'CmdOrCtrl+,',
          enabled: hasTokens,
          click: () => mainWindow.webContents.send('menu:open-settings')
        },
        {
          id: 'about',
          label: 'About',
          accelerator: 'CmdOrCtrl+I',
          enabled: hasTokens,
          click: () => mainWindow.webContents.send('menu:show-info')
        },
        { type: 'separator' },
        {
          label: 'Check for Updates',
          click: () => checkForUpdates(mainWindow, true)
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
