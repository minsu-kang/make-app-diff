import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc-handlers'

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
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 10 }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  buildMenu(mainWindow)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
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
