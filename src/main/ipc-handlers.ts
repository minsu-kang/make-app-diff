import { ipcMain, dialog, shell, clipboard, BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
import { createWriteStream } from 'fs'
import * as path from 'path'
import { tmpdir } from 'os'
import { exec } from 'child_process'
import archiver from 'archiver'
import { IpmClient } from './services/ipm-client'
import { extractPkr } from './services/pkr-extractor'
import { computeDiff } from './services/diff-service'
import {
  loadSettings,
  saveSettings,
  loadTheme,
  saveTheme,
  loadFavorites,
  saveFavorites,
  loadRecentApps,
  saveRecentApps
} from './services/storage'
import { isCustomApp, decompileApp, decompileAccount, decompileHook } from './services/decompiler'
import { IpmSettings, ComponentType, ExtractedFile } from './types'

function sanitizePath(baseDir: string, filePath: string): string {
  const normalized = path.normalize(filePath)
  if (path.isAbsolute(normalized) || normalized.startsWith('..')) {
    throw new Error(`Invalid file path: ${filePath}`)
  }
  const resolved = path.join(baseDir, normalized)
  if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) {
    throw new Error(`Path traversal detected: ${filePath}`)
  }
  return resolved
}

async function downloadDepsForVersion(
  client: IpmClient,
  depNames: string[],
  version: string,
  depType: 'account' | 'hook',
  isCustom: boolean
): Promise<ExtractedFile[]> {
  const decompileFn = depType === 'account' ? decompileAccount : decompileHook
  const compiledFolder = depType === 'account' ? 'accounts' : 'hooks'
  const sdkFolder = depType === 'account' ? 'connections' : 'webhooks'
  const results: ExtractedFile[] = []

  await Promise.all(
    depNames.map(async (depName) => {
      try {
        const buffer = await client.downloadDependencyComponent(depName, version, depType)
        let files = extractPkr(buffer).filter((f) => f.path !== 'lib/functions.js')
        const folder = isCustom ? sdkFolder : compiledFolder
        if (isCustom) files = decompileFn(files)
        results.push(...files.map((f) => ({ ...f, path: `${folder}/${depName}/${f.path}` })))
      } catch {
        /* skip */
      }
    })
  )

  return results
}

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
      info.label = ((manifest as Record<string, unknown>).label as string) || appName

      // Extract theme and iconHash from info.meta
      if (info.meta) {
        if (info.meta.theme) info.theme = info.meta.theme
        if (info.meta.iconHash) info.iconHash = info.meta.iconHash
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

      // Download dependencies for both versions in parallel
      const fromAccounts = fromManifest.dependencies?.accounts || []
      const toAccounts = toManifest.dependencies?.accounts || []
      const fromHooks = fromManifest.dependencies?.hooks || []
      const toHooks = toManifest.dependencies?.hooks || []
      const allAccounts = [...new Set([...fromAccounts, ...toAccounts])]
      const allHooks = [...new Set([...fromHooks, ...toHooks])]

      const [fromAccFiles, toAccFiles, fromHookFiles, toHookFiles] = await Promise.all([
        downloadDepsForVersion(
          ipmClient,
          allAccounts.filter((d) => fromAccounts.includes(d)),
          fromVersion,
          'account',
          fromIsCustom
        ),
        downloadDepsForVersion(
          ipmClient,
          allAccounts.filter((d) => toAccounts.includes(d)),
          toVersion,
          'account',
          toIsCustom
        ),
        downloadDepsForVersion(
          ipmClient,
          allHooks.filter((d) => fromHooks.includes(d)),
          fromVersion,
          'hook',
          fromIsCustom
        ),
        downloadDepsForVersion(
          ipmClient,
          allHooks.filter((d) => toHooks.includes(d)),
          toVersion,
          'hook',
          toIsCustom
        )
      ])
      fromFiles.push(...fromAccFiles, ...fromHookFiles)
      toFiles.push(...toAccFiles, ...toHookFiles)

      const diffResult = computeDiff('app', fromFiles, toFiles)
      return { success: true, data: diffResult }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('ipm:show-version', async (_event, appName: string, version: string) => {
    try {
      const [appBuffer, manifest] = await Promise.all([
        ipmClient.downloadComponent(appName, version, 'app'),
        ipmClient.getManifest(appName, version)
      ])

      let files: ExtractedFile[] = extractPkr(appBuffer)
      const isCustom = isCustomApp(files)
      if (isCustom) files = decompileApp(files, appName)

      // Download dependencies
      const accounts = manifest.dependencies?.accounts || []
      const hooks = manifest.dependencies?.hooks || []
      const [accFiles, hookFiles] = await Promise.all([
        downloadDepsForVersion(ipmClient, accounts, version, 'account', isCustom),
        downloadDepsForVersion(ipmClient, hooks, version, 'hook', isCustom)
      ])
      files.push(...accFiles, ...hookFiles)

      const diffResult = computeDiff('app', [], files)
      return { success: true, data: diffResult }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('shell:show-in-finder', (_event, fullPath: string) => {
    shell.showItemInFolder(fullPath)
  })

  ipcMain.handle('favorites:load', () => {
    return { success: true, data: loadFavorites() }
  })

  ipcMain.handle('favorites:save', (_event, favorites: FavoriteApp[]) => {
    saveFavorites(favorites)
    return { success: true }
  })

  ipcMain.handle('recent:load', () => {
    return { success: true, data: loadRecentApps() }
  })

  ipcMain.handle('recent:add', (_event, name: string, label: string) => {
    const recent = loadRecentApps().filter((r) => r.name !== name)
    recent.unshift({ name, label, lastViewed: Date.now() })
    const trimmed = recent.slice(0, 8)
    saveRecentApps(trimmed)
    return { success: true, data: trimmed }
  })

  ipcMain.handle(
    'editor:open-diff',
    async (
      _event,
      opts: {
        filePath: string
        fromVersion: string
        toVersion: string
        oldContent: string
        newContent: string
      }
    ) => {
      try {
        const tmpDir = path.join(tmpdir(), 'makediff')
        await fs.mkdir(tmpDir, { recursive: true })

        const ext = path.extname(opts.filePath)
        const base = path.basename(opts.filePath, ext)
        const oldFile = path.join(tmpDir, `${base}@${opts.fromVersion}${ext}`)
        const newFile = path.join(tmpDir, `${base}@${opts.toVersion}${ext}`)

        await fs.writeFile(oldFile, opts.oldContent, 'utf-8')
        await fs.writeFile(newFile, opts.newContent, 'utf-8')

        return new Promise((resolve) => {
          exec(`code --diff "${oldFile}" "${newFile}"`, (err) => {
            if (err) resolve({ success: false, error: 'VS Code not found. Install "code" CLI command.' })
            else resolve({ success: true })
          })
        })
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, error: message }
      }
    }
  )

  ipcMain.handle(
    'clipboard:copy-zip',
    async (
      _event,
      opts: {
        appName: string
        version: string
        files: { path: string; content: string }[]
      }
    ) => {
      try {
        const tmpDir = path.join(tmpdir(), 'makediff')
        await fs.mkdir(tmpDir, { recursive: true })

        const zipName = `${opts.appName}@${opts.version}.zip`
        const zipPath = path.join(tmpDir, zipName)

        await new Promise<void>((resolve, reject) => {
          const output = createWriteStream(zipPath)
          const archive = archiver('zip', { zlib: { level: 9 } })
          output.on('close', resolve)
          archive.on('error', reject)
          archive.pipe(output)
          for (const file of opts.files) {
            archive.append(file.content, { name: file.path })
          }
          archive.finalize()
        })

        // macOS clipboard: copy file reference via NSFilenamesPboardType
        const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><array><string>${zipPath}</string></array></plist>`
        clipboard.writeBuffer('NSFilenamesPboardType', Buffer.from(plist))

        return { success: true, data: zipPath }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, error: message }
      }
    }
  )

  ipcMain.handle('update:check', async () => {
    try {
      const { checkForUpdates } = await import('./index')
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
      if (win) await checkForUpdates(win, true)
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('update:open-release', (_event, version: string) => {
    const base = `https://github.com/minsu-kang/make-app-diff/releases/download/v${version}`
    let url: string
    if (process.platform === 'win32') {
      url = `${base}/MakeDiff.Setup.${version}.exe`
    } else {
      url = `${base}/MakeDiff-${version}-arm64.dmg`
    }
    shell.openExternal(url)
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

      // Download dependencies in parallel
      const accounts = manifest.dependencies?.accounts || []
      const hooks = manifest.dependencies?.hooks || []
      const [accFiles, hookFiles] = await Promise.all([
        downloadDepsForVersion(ipmClient, accounts, version, 'account', isCustom),
        downloadDepsForVersion(ipmClient, hooks, version, 'hook', isCustom)
      ])
      const allFiles = [...appFiles, ...accFiles, ...hookFiles]

      // Write all files to disk
      for (const file of allFiles) {
        const filePath = sanitizePath(baseDir, file.path)
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, file.content, 'utf-8')
      }

      return { success: true, data: baseDir }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })
}
