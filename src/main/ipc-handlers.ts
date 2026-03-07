import { ipcMain, dialog, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { IpmClient } from './services/ipm-client'
import { extractPkr } from './services/pkr-extractor'
import { computeDiff } from './services/diff-service'
import { loadSettings, saveSettings, loadTheme, saveTheme } from './services/storage'
import { isCustomApp, decompileApp, decompileAccount, decompileHook } from './services/decompiler'
import { IpmSettings, ComponentType, ExtractedFile } from './types'

let ipmClient: IpmClient

export function registerIpcHandlers(): void {
  const settings = loadSettings()
  ipmClient = new IpmClient(settings)

  ipcMain.handle('settings:load', () => {
    return loadSettings()
  })

  ipcMain.handle('theme:load', () => {
    return loadTheme()
  })

  ipcMain.handle('theme:save', (_event, theme: string) => {
    saveTheme(theme)
    return { success: true }
  })

  ipcMain.handle('settings:save', async (_event, settings: IpmSettings) => {
    const testClient = new IpmClient(settings)
    try {
      await testClient.testConnection()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
    saveSettings(settings)
    ipmClient.updateSettings(settings)
    return { success: true }
  })

  ipcMain.handle('ipm:search-apps', async () => {
    try {
      const results = await ipmClient.searchApps()
      return { success: true, data: results }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('ipm:get-app-info', async (_event, appName: string) => {
    try {
      const info = await ipmClient.getAppInfo(appName)
      const manifest = await ipmClient.getManifest(appName, info.version)
      const m = manifest as Record<string, unknown>
      info.label = (m.label as string) || appName

      // Extract theme and iconHash from info.meta
      const meta = info.meta as Record<string, unknown> | undefined
      if (meta) {
        if (meta.theme) info.theme = meta.theme as string
        if (meta.iconHash) info.iconHash = meta.iconHash as string
      }

      return { success: true, data: info }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('ipm:get-app-icon', async (_event, appName: string) => {
    try {
      const buffer = await ipmClient.getAppIcon(appName)
      const base64 = buffer.toString('base64')
      let contentType = 'image/png'
      const header = buffer.toString('utf8', 0, Math.min(buffer.length, 100))
      if (header.includes('<svg') || header.includes('<?xml')) {
        contentType = 'image/svg+xml'
      }
      return { success: true, data: `data:${contentType};base64,${base64}` }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('ipm:download-and-extract', async (_event, appName: string, version: string, type: ComponentType) => {
    try {
      const buffer = await ipmClient.downloadComponent(appName, version, type)
      const files = extractPkr(buffer)
      return { success: true, data: files }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('ipm:get-diff', async (_event, appName: string, fromVersion: string, toVersion: string) => {
    try {
      // Download app + get manifests in parallel
      const [fromAppBuffer, toAppBuffer, fromManifest, toManifest] = await Promise.all([
        ipmClient.downloadComponent(appName, fromVersion, 'app'),
        ipmClient.downloadComponent(appName, toVersion, 'app'),
        ipmClient.getManifest(appName, fromVersion),
        ipmClient.getManifest(appName, toVersion)
      ])

      // App files — decompile if custom app
      let fromFiles: ExtractedFile[] = extractPkr(fromAppBuffer)
      let toFiles: ExtractedFile[] = extractPkr(toAppBuffer)
      const fromIsCustom = isCustomApp(fromFiles)
      const toIsCustom = isCustomApp(toFiles)
      if (fromIsCustom) fromFiles = decompileApp(fromFiles, appName)
      if (toIsCustom) toFiles = decompileApp(toFiles, appName)

      // Helper to download dependency files
      async function downloadDeps(depType: 'account' | 'hook', compiledFolder: string, sdkFolder: string) {
        const depKey = depType === 'account' ? 'accounts' : 'hooks'
        const decompileFn = depType === 'account' ? decompileAccount : decompileHook
        const fromDeps = fromManifest.dependencies?.[depKey] || []
        const toDeps = toManifest.dependencies?.[depKey] || []
        const allDeps = [...new Set([...fromDeps, ...toDeps])]

        await Promise.all(
          allDeps.map(async (depName) => {
            try {
              if (fromDeps.includes(depName)) {
                const buffer = await ipmClient.downloadDependencyComponent(depName, fromVersion, depType)
                let files = extractPkr(buffer).filter((f) => f.path !== 'lib/functions.js')
                const folder = fromIsCustom ? sdkFolder : compiledFolder
                if (fromIsCustom) files = decompileFn(files)
                fromFiles.push(...files.map((f) => ({ ...f, path: `${folder}/${depName}/${f.path}` })))
              }
            } catch {
              /* skip */
            }
            try {
              if (toDeps.includes(depName)) {
                const buffer = await ipmClient.downloadDependencyComponent(depName, toVersion, depType)
                let files = extractPkr(buffer).filter((f) => f.path !== 'lib/functions.js')
                const folder = toIsCustom ? sdkFolder : compiledFolder
                if (toIsCustom) files = decompileFn(files)
                toFiles.push(...files.map((f) => ({ ...f, path: `${folder}/${depName}/${f.path}` })))
              }
            } catch {
              /* skip */
            }
          })
        )
      }

      // Download accounts and hooks
      await Promise.all([downloadDeps('account', 'accounts', 'connections'), downloadDeps('hook', 'hooks', 'webhooks')])

      const diffResult = computeDiff('app', fromFiles, toFiles)
      return { success: true, data: diffResult }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('shell:show-in-finder', (_event, fullPath: string) => {
    shell.showItemInFolder(fullPath)
  })

  ipcMain.handle('ipm:download-version', async (_event, appName: string, version: string) => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: `Save ${appName}@${version}`,
        buttonLabel: 'Save',
        properties: ['openDirectory', 'createDirectory']
      })
      if (canceled || filePaths.length === 0) {
        return { success: false, error: 'Cancelled' }
      }

      const baseDir = path.join(filePaths[0], `${appName}@${version}`)

      // Download app + manifest in parallel
      const [appBuffer, manifest] = await Promise.all([
        ipmClient.downloadComponent(appName, version, 'app'),
        ipmClient.getManifest(appName, version)
      ])

      // Extract app files, decompile if custom app
      let appFiles = extractPkr(appBuffer)
      const isCustom = isCustomApp(appFiles)
      if (isCustom) {
        appFiles = decompileApp(appFiles, appName)
      }

      for (const file of appFiles) {
        const filePath = path.join(baseDir, file.path)
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, file.content, 'utf-8')
      }

      // Download accounts (custom apps → connections/ folder with decompilation)
      const accounts = manifest.dependencies?.accounts || []
      for (const depName of accounts) {
        try {
          const buffer = await ipmClient.downloadDependencyComponent(depName, version, 'account')
          let depFiles = extractPkr(buffer).filter((f) => f.path !== 'lib/functions.js')
          const folder = isCustom ? 'connections' : 'accounts'

          if (isCustom) {
            depFiles = decompileAccount(depFiles)
          }

          for (const file of depFiles) {
            const filePath = path.join(baseDir, folder, depName, file.path)
            fs.mkdirSync(path.dirname(filePath), { recursive: true })
            fs.writeFileSync(filePath, file.content, 'utf-8')
          }
        } catch {
          /* skip */
        }
      }

      // Download hooks (custom apps → webhooks/ folder with decompilation)
      const hooks = manifest.dependencies?.hooks || []
      for (const depName of hooks) {
        try {
          const buffer = await ipmClient.downloadDependencyComponent(depName, version, 'hook')
          let hookFiles = extractPkr(buffer).filter((f) => f.path !== 'lib/functions.js')
          const hookFolder = isCustom ? 'webhooks' : 'hooks'

          if (isCustom) {
            hookFiles = decompileHook(hookFiles)
          }

          for (const file of hookFiles) {
            const filePath = path.join(baseDir, hookFolder, depName, file.path)
            fs.mkdirSync(path.dirname(filePath), { recursive: true })
            fs.writeFileSync(filePath, file.content, 'utf-8')
          }
        } catch {
          /* skip */
        }
      }

      return { success: true, data: baseDir }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })
}
