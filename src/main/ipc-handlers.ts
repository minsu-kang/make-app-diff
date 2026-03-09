import { ipcMain, dialog, shell, clipboard, BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
import { createWriteStream } from 'fs'
import * as path from 'path'
import { tmpdir } from 'os'
import { exec, execFile } from 'child_process'
import archiver from 'archiver'
import { enableMenuItems } from './index'
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

interface RawDepEntry {
  depName: string
  files: ExtractedFile[]
}

interface CachedDiffData {
  appName: string
  fromVersion: string
  toVersion: string
  fromFiles: ExtractedFile[]
  toFiles: ExtractedFile[]
  fromIsCustom: boolean
  toIsCustom: boolean
  fromAccDeps: RawDepEntry[]
  toAccDeps: RawDepEntry[]
  fromHookDeps: RawDepEntry[]
  toHookDeps: RawDepEntry[]
}

interface CachedShowData {
  appName: string
  version: string
  files: ExtractedFile[]
  isCustom: boolean
  accDeps: RawDepEntry[]
  hookDeps: RawDepEntry[]
}

let diffCache: CachedDiffData | null = null
let showCache: CachedShowData | null = null

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

function cloneFiles(files: ExtractedFile[]): ExtractedFile[] {
  return files.map((f) => ({ path: f.path, content: f.content }))
}

async function downloadRawDeps(
  client: IpmClient,
  depNames: string[],
  version: string,
  depType: 'account' | 'hook'
): Promise<RawDepEntry[]> {
  const results: RawDepEntry[] = []

  await Promise.all(
    depNames.map(async (depName) => {
      try {
        const buffer = await client.downloadDependencyComponent(depName, version, depType)
        const files = extractPkr(buffer).filter((f) => f.path !== 'lib/functions.js')
        results.push({ depName, files: cloneFiles(files) })
      } catch {
        /* skip */
      }
    })
  )

  return results
}

function applyDepsDecompile(
  rawDeps: RawDepEntry[],
  depType: 'account' | 'hook',
  isCustom: boolean,
  decompile: boolean
): ExtractedFile[] {
  const decompileFn = depType === 'account' ? decompileAccount : decompileHook
  const compiledFolder = depType === 'account' ? 'accounts' : 'hooks'
  const sdkFolder = depType === 'account' ? 'connections' : 'webhooks'
  const results: ExtractedFile[] = []

  for (const { depName, files } of rawDeps) {
    let processed = cloneFiles(files)
    if (isCustom && decompile) {
      processed = decompileFn(processed)
      results.push(...processed.map((f) => ({ path: `${sdkFolder}/${depName}/${f.path}`, content: f.content })))
    } else {
      results.push(...processed.map((f) => ({ path: `${compiledFolder}/${depName}/${f.path}`, content: f.content })))
    }
  }

  return results
}

let ipmClient: IpmClient

/**
 * Register all IPC handlers used by the renderer to interact with the main process.
 *
 * Initializes application settings and the IPM client, then attaches handlers for settings and theme management,
 * IPM operations (search, manifest/icon download, component extraction, diff/show/version operations, and downloads),
 * filesystem and shell actions, favorites and recent lists, editor diff integration, clipboard zip copying, and update checks/releases.
 *
 * Handlers expose a stable IPC API for loading/saving configuration, querying and downloading app components and dependencies,
 * computing diffs or showing a single version, opening diffs in an external editor, copying packaged files to the clipboard,
 * and triggering update-related actions.
 */
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
    enableMenuItems()
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

  ipcMain.handle(
    'ipm:get-diff',
    async (_event, appName: string, fromVersion: string, toVersion: string, decompile: boolean = true) => {
      try {
        const cacheHit =
          diffCache &&
          diffCache.appName === appName &&
          diffCache.fromVersion === fromVersion &&
          diffCache.toVersion === toVersion

        let fromRawFiles: ExtractedFile[]
        let toRawFiles: ExtractedFile[]
        let fromIsCustom: boolean
        let toIsCustom: boolean
        let fromAccDeps: RawDepEntry[]
        let toAccDeps: RawDepEntry[]
        let fromHookDeps: RawDepEntry[]
        let toHookDeps: RawDepEntry[]

        if (cacheHit) {
          fromRawFiles = diffCache!.fromFiles
          toRawFiles = diffCache!.toFiles
          fromIsCustom = diffCache!.fromIsCustom
          toIsCustom = diffCache!.toIsCustom
          fromAccDeps = diffCache!.fromAccDeps
          toAccDeps = diffCache!.toAccDeps
          fromHookDeps = diffCache!.fromHookDeps
          toHookDeps = diffCache!.toHookDeps
        } else {
          // Download app + get manifests in parallel
          const [fromAppBuffer, toAppBuffer, fromManifest, toManifest] = await Promise.all([
            ipmClient.downloadComponent(appName, fromVersion, 'app'),
            ipmClient.downloadComponent(appName, toVersion, 'app'),
            ipmClient.getManifest(appName, fromVersion),
            ipmClient.getManifest(appName, toVersion)
          ])

          fromRawFiles = cloneFiles(extractPkr(fromAppBuffer))
          toRawFiles = cloneFiles(extractPkr(toAppBuffer))
          fromIsCustom = isCustomApp(fromRawFiles)
          toIsCustom = isCustomApp(toRawFiles)

          // Download raw dependencies for both versions in parallel
          const fromAccounts = fromManifest.dependencies?.accounts || []
          const toAccounts = toManifest.dependencies?.accounts || []
          const fromHooks = fromManifest.dependencies?.hooks || []
          const toHooks = toManifest.dependencies?.hooks || []
          const allAccounts = [...new Set([...fromAccounts, ...toAccounts])]
          const allHooks = [...new Set([...fromHooks, ...toHooks])]

          const depResults = await Promise.all([
            downloadRawDeps(
              ipmClient,
              allAccounts.filter((d) => fromAccounts.includes(d)),
              fromVersion,
              'account'
            ),
            downloadRawDeps(
              ipmClient,
              allAccounts.filter((d) => toAccounts.includes(d)),
              toVersion,
              'account'
            ),
            downloadRawDeps(
              ipmClient,
              allHooks.filter((d) => fromHooks.includes(d)),
              fromVersion,
              'hook'
            ),
            downloadRawDeps(
              ipmClient,
              allHooks.filter((d) => toHooks.includes(d)),
              toVersion,
              'hook'
            )
          ])
          fromAccDeps = depResults[0]
          toAccDeps = depResults[1]
          fromHookDeps = depResults[2]
          toHookDeps = depResults[3]

          // Save to cache
          diffCache = {
            appName,
            fromVersion,
            toVersion,
            fromFiles: fromRawFiles,
            toFiles: toRawFiles,
            fromIsCustom,
            toIsCustom,
            fromAccDeps,
            toAccDeps,
            fromHookDeps,
            toHookDeps
          }
        }

        // Apply decompile based on flag
        const fromFiles =
          fromIsCustom && decompile ? decompileApp(cloneFiles(fromRawFiles), appName) : cloneFiles(fromRawFiles)
        const toFiles = toIsCustom && decompile ? decompileApp(cloneFiles(toRawFiles), appName) : cloneFiles(toRawFiles)

        fromFiles.push(
          ...applyDepsDecompile(fromAccDeps, 'account', fromIsCustom, decompile),
          ...applyDepsDecompile(fromHookDeps, 'hook', fromIsCustom, decompile)
        )
        toFiles.push(
          ...applyDepsDecompile(toAccDeps, 'account', toIsCustom, decompile),
          ...applyDepsDecompile(toHookDeps, 'hook', toIsCustom, decompile)
        )

        const diffResult = computeDiff('app', fromFiles, toFiles)
        return {
          success: true,
          data: { ...diffResult, isCustomApp: fromIsCustom || toIsCustom }
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, error: message }
      }
    }
  )

  ipcMain.handle('ipm:show-version', async (_event, appName: string, version: string, decompile: boolean = true) => {
    try {
      const cacheHit = showCache && showCache.appName === appName && showCache.version === version

      let rawFiles: ExtractedFile[]
      let isCustom: boolean
      let accDeps: RawDepEntry[]
      let hookDeps: RawDepEntry[]

      if (cacheHit) {
        rawFiles = showCache!.files
        isCustom = showCache!.isCustom
        accDeps = showCache!.accDeps
        hookDeps = showCache!.hookDeps
      } else {
        const [appBuffer, manifest] = await Promise.all([
          ipmClient.downloadComponent(appName, version, 'app'),
          ipmClient.getManifest(appName, version)
        ])

        rawFiles = cloneFiles(extractPkr(appBuffer))
        isCustom = isCustomApp(rawFiles)

        const accounts = manifest.dependencies?.accounts || []
        const hooks = manifest.dependencies?.hooks || []
        const showDepResults = await Promise.all([
          downloadRawDeps(ipmClient, accounts, version, 'account'),
          downloadRawDeps(ipmClient, hooks, version, 'hook')
        ])
        accDeps = showDepResults[0]
        hookDeps = showDepResults[1]

        showCache = { appName, version, files: rawFiles, isCustom, accDeps, hookDeps }
      }

      const files = isCustom && decompile ? decompileApp(cloneFiles(rawFiles), appName) : cloneFiles(rawFiles)

      files.push(
        ...applyDepsDecompile(accDeps, 'account', isCustom, decompile),
        ...applyDepsDecompile(hookDeps, 'hook', isCustom, decompile)
      )

      const diffResult = computeDiff('app', [], files)
      return {
        success: true,
        data: { ...diffResult, isCustomApp: isCustom }
      }
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

        // Electron doesn't inherit shell PATH; try known VS Code CLI paths
        const codePaths =
          process.platform === 'darwin'
            ? [
                '/usr/local/bin/code',
                '/opt/homebrew/bin/code',
                '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
              ]
            : [
                'code',
                `${process.env.LOCALAPPDATA}\\Programs\\Microsoft VS Code\\bin\\code.cmd`,
                'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd'
              ]

        return new Promise((resolve) => {
          const tryNext = (i: number): void => {
            if (i >= codePaths.length) {
              resolve({ success: false, error: 'VS Code not found. Install "code" CLI command.' })
              return
            }
            exec(`"${codePaths[i]}" --diff "${oldFile}" "${newFile}"`, (err) => {
              if (err) tryNext(i + 1)
              else resolve({ success: true })
            })
          }
          tryNext(0)
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

        if (process.platform === 'darwin') {
          // macOS clipboard: copy file reference via NSFilenamesPboardType
          const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><array><string>${zipPath}</string></array></plist>`
          clipboard.writeBuffer('NSFilenamesPboardType', Buffer.from(plist))
        } else {
          // Windows clipboard: use PowerShell + .NET to set CF_HDROP file drop list
          const escaped = zipPath.replace(/'/g, "''")
          const command = [
            'Add-Type -AssemblyName System.Windows.Forms',
            '$col = New-Object System.Collections.Specialized.StringCollection',
            `$null = $col.Add('${escaped}')`,
            '[System.Windows.Forms.Clipboard]::SetFileDropList($col)'
          ].join('; ')
          await new Promise<void>((resolve, reject) => {
            execFile(
              'powershell.exe',
              ['-NoProfile', '-NonInteractive', '-Command', command],
              { windowsHide: true },
              (err) => (err ? reject(err) : resolve())
            )
          })
        }

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
    try {
      const base = `https://github.com/minsu-kang/make-app-diff/releases/download/v${version}`
      let url: string
      if (process.platform === 'win32') {
        url = `${base}/MakeDiff.Setup.${version}.exe`
      } else {
        const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
        url = `${base}/MakeDiff-${version}-${arch}.dmg`
      }
      shell.openExternal(url)
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
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
