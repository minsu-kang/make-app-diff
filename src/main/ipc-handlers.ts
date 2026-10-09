import { ipcMain, dialog, shell, clipboard } from 'electron'
import * as fs from 'fs/promises'
import { createWriteStream } from 'fs'
import * as path from 'path'
import { tmpdir } from 'os'
import { execFile } from 'child_process'
import archiver from 'archiver'
import { enableMenuItems, disableMenuItems } from './index'
import { IpmClient } from './services/ipm-client'
import { extractPkr, toFileData } from './services/pkr-extractor'
import { computeDiff } from './services/diff-service'
import { createLimiter, type Limiter } from './services/concurrency'
import {
  loadSettings,
  saveSettings,
  loadTheme,
  saveTheme,
  loadFavorites,
  saveFavorites,
  loadRecentApps,
  saveRecentApps,
  touchActivity,
  isSessionExpired,
  clearTokens
} from './services/storage'
import { isCustomApp, decompileApp, decompileAccount, decompileHook } from './services/decompiler'
import { IpmSettings, ComponentType, ExtractedFile, FavoriteApp } from './types'

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid ${name}: expected non-empty string`)
  }
}

function compareSemverDesc(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na !== nb) return nb - na
  }
  return 0
}

function assertNumber(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid ${name}: expected finite number`)
  }
}

// Rejects path separators and `..`/`.` so appName/version can't escape the tmpdir prefix via path.join
function assertPathSegment(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._@-]+$/.test(value) || value === '.' || value === '..') {
    throw new Error(`Invalid ${name}`)
  }
}

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

/** Strips absolute-path markers and leading `..` segments so a PKR-supplied path can't zip-slip out of the archive root */
function sanitizeZipEntryName(filePath: string): string {
  const normalized = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '')
  return normalized.replace(/^([/\\]+|[a-zA-Z]:[/\\]?)/, '')
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

// Caches are keyed by app and version only: drop them when host or tokens change, and let a request that
// started before the drop skip its cache write (generation)
let cacheGeneration = 0

function clearCaches(): void {
  cacheGeneration++
  diffCache = null
  showCache = null
}

const DEP_DOWNLOAD_CONCURRENCY = 4

async function downloadDepsForVersion(
  client: IpmClient,
  depNames: string[],
  version: string,
  depType: 'account' | 'hook',
  isCustom: boolean,
  limit: Limiter
): Promise<ExtractedFile[]> {
  const decompileFn = depType === 'account' ? decompileAccount : decompileHook
  const compiledFolder = depType === 'account' ? 'accounts' : 'hooks'
  const sdkFolder = depType === 'account' ? 'connections' : 'webhooks'
  const results: ExtractedFile[] = []

  await Promise.all(
    depNames.map((depName) =>
      limit(async () => {
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
  )

  return results
}

function cloneFiles(files: ExtractedFile[]): ExtractedFile[] {
  return files.map((f) => ({ path: f.path, content: f.content }))
}

/** Push files into target, skipping paths that already exist (app rpc.js data wins over hook defaults) */
function pushNewFiles(target: ExtractedFile[], source: ExtractedFile[]): void {
  const existing = new Set(target.map((f) => f.path))
  for (const file of source) {
    if (!existing.has(file.path)) {
      target.push(file)
      existing.add(file.path)
    }
  }
}

async function downloadRawDeps(
  client: IpmClient,
  depNames: string[],
  version: string,
  depType: 'account' | 'hook',
  limit: Limiter
): Promise<RawDepEntry[]> {
  const results: RawDepEntry[] = []

  await Promise.all(
    depNames.map((depName) =>
      limit(async () => {
        try {
          const buffer = await client.downloadDependencyComponent(depName, version, depType)
          const files = extractPkr(buffer).filter((f) => f.path !== 'lib/functions.js')
          results.push({ depName, files: cloneFiles(files) })
        } catch {
          /* skip */
        }
      })
    )
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
let ipmBaseUrl: string | undefined

export function registerIpcHandlers(options: { ipmBaseUrl?: string } = {}): void {
  ipmBaseUrl = options.ipmBaseUrl
  const settings = loadSettings()
  ipmClient = new IpmClient(settings, ipmBaseUrl)

  ipcMain.handle('session:check', () => {
    if (isSessionExpired()) {
      clearTokens()
      ipmClient = new IpmClient(loadSettings(), ipmBaseUrl)
      clearCaches()
      disableMenuItems()
      return { expired: true }
    }
    return { expired: false }
  })

  ipcMain.handle('menu:set-enabled', (_event, enabled: boolean) => {
    if (enabled) {
      enableMenuItems()
    } else {
      disableMenuItems()
    }
  })

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
    const testClient = new IpmClient(settings, ipmBaseUrl)
    try {
      await testClient.testConnection()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
    saveSettings(settings)
    ipmClient = testClient
    clearCaches()
    touchActivity()
    enableMenuItems()
    return { success: true }
  })

  ipcMain.handle('ipm:search-apps', async () => {
    try {
      const results = await ipmClient.searchApps()
      touchActivity()
      for (const app of results) {
        app.availableVersions.sort(compareSemverDesc)
      }
      return { success: true, data: results }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('ipm:get-app-info', async (_event, appName: string, version?: string) => {
    try {
      assertString(appName, 'appName')
      if (version !== undefined) assertString(version, 'version')
      const info = await ipmClient.getAppInfo(appName)
      info.versions.sort(compareSemverDesc)
      const manifestVersion = version ?? info.versions[0] ?? info.version
      info.version = manifestVersion
      const manifest = await ipmClient.getManifest(appName, manifestVersion)
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
        const cached =
          diffCache &&
          diffCache.appName === appName &&
          diffCache.fromVersion === fromVersion &&
          diffCache.toVersion === toVersion
            ? diffCache
            : null

        let fromRawFiles: ExtractedFile[]
        let toRawFiles: ExtractedFile[]
        let fromIsCustom: boolean
        let toIsCustom: boolean
        let fromAccDeps: RawDepEntry[]
        let toAccDeps: RawDepEntry[]
        let fromHookDeps: RawDepEntry[]
        let toHookDeps: RawDepEntry[]

        if (cached) {
          fromRawFiles = cached.fromFiles
          toRawFiles = cached.toFiles
          fromIsCustom = cached.fromIsCustom
          toIsCustom = cached.toIsCustom
          fromAccDeps = cached.fromAccDeps
          toAccDeps = cached.toAccDeps
          fromHookDeps = cached.fromHookDeps
          toHookDeps = cached.toHookDeps
        } else {
          const client = ipmClient
          const generation = cacheGeneration
          const limit = createLimiter(DEP_DOWNLOAD_CONCURRENCY)

          // Download app + get manifests in parallel
          const [fromAppBuffer, toAppBuffer, fromManifest, toManifest] = await Promise.all([
            client.downloadComponent(appName, fromVersion, 'app'),
            client.downloadComponent(appName, toVersion, 'app'),
            client.getManifest(appName, fromVersion),
            client.getManifest(appName, toVersion)
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
              client,
              allAccounts.filter((d) => fromAccounts.includes(d)),
              fromVersion,
              'account',
              limit
            ),
            downloadRawDeps(
              client,
              allAccounts.filter((d) => toAccounts.includes(d)),
              toVersion,
              'account',
              limit
            ),
            downloadRawDeps(
              client,
              allHooks.filter((d) => fromHooks.includes(d)),
              fromVersion,
              'hook',
              limit
            ),
            downloadRawDeps(
              client,
              allHooks.filter((d) => toHooks.includes(d)),
              toVersion,
              'hook',
              limit
            )
          ])
          fromAccDeps = depResults[0]
          toAccDeps = depResults[1]
          fromHookDeps = depResults[2]
          toHookDeps = depResults[3]

          if (generation === cacheGeneration) {
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
        }

        // Apply decompile based on flag
        const fromFiles =
          fromIsCustom && decompile ? decompileApp(cloneFiles(fromRawFiles), appName) : cloneFiles(fromRawFiles)
        const toFiles = toIsCustom && decompile ? decompileApp(cloneFiles(toRawFiles), appName) : cloneFiles(toRawFiles)

        pushNewFiles(fromFiles, applyDepsDecompile(fromAccDeps, 'account', fromIsCustom, decompile))
        pushNewFiles(fromFiles, applyDepsDecompile(fromHookDeps, 'hook', fromIsCustom, decompile))
        pushNewFiles(toFiles, applyDepsDecompile(toAccDeps, 'account', toIsCustom, decompile))
        pushNewFiles(toFiles, applyDepsDecompile(toHookDeps, 'hook', toIsCustom, decompile))

        const diffResult = computeDiff('app', fromFiles, toFiles)
        touchActivity()
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
      const cached = showCache && showCache.appName === appName && showCache.version === version ? showCache : null

      let rawFiles: ExtractedFile[]
      let isCustom: boolean
      let accDeps: RawDepEntry[]
      let hookDeps: RawDepEntry[]

      if (cached) {
        rawFiles = cached.files
        isCustom = cached.isCustom
        accDeps = cached.accDeps
        hookDeps = cached.hookDeps
      } else {
        const client = ipmClient
        const generation = cacheGeneration
        const limit = createLimiter(DEP_DOWNLOAD_CONCURRENCY)

        const [appBuffer, manifest] = await Promise.all([
          client.downloadComponent(appName, version, 'app'),
          client.getManifest(appName, version)
        ])

        rawFiles = cloneFiles(extractPkr(appBuffer))
        isCustom = isCustomApp(rawFiles)

        const accounts = manifest.dependencies?.accounts || []
        const hooks = manifest.dependencies?.hooks || []
        const showDepResults = await Promise.all([
          downloadRawDeps(client, accounts, version, 'account', limit),
          downloadRawDeps(client, hooks, version, 'hook', limit)
        ])
        accDeps = showDepResults[0]
        hookDeps = showDepResults[1]

        if (generation === cacheGeneration) {
          showCache = { appName, version, files: rawFiles, isCustom, accDeps, hookDeps }
        }
      }

      const files = isCustom && decompile ? decompileApp(cloneFiles(rawFiles), appName) : cloneFiles(rawFiles)

      pushNewFiles(files, applyDepsDecompile(accDeps, 'account', isCustom, decompile))
      pushNewFiles(files, applyDepsDecompile(hookDeps, 'hook', isCustom, decompile))

      const diffResult = computeDiff('app', [], files)
      touchActivity()
      return {
        success: true,
        data: { ...diffResult, isCustomApp: isCustom }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle(
    'editor:open-in-vscode',
    async (_event, opts: { appName: string; version: string; files: { path: string; content: string }[] }) => {
      try {
        assertPathSegment(opts.appName, 'appName')
        assertPathSegment(opts.version, 'version')
        const tmpDir = path.join(tmpdir(), 'makediff', `${opts.appName}@${opts.version}`)
        await fs.rm(tmpDir, { recursive: true, force: true })
        await fs.mkdir(tmpDir, { recursive: true })

        for (const file of opts.files) {
          const filePath = sanitizePath(tmpDir, file.path)
          await fs.mkdir(path.dirname(filePath), { recursive: true })
          await fs.writeFile(filePath, toFileData(file.path, file.content))
        }

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
            execFile(codePaths[i], [tmpDir], (err) => {
              if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') tryNext(i + 1)
              else if (err) resolve({ success: false, error: err.message })
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

  ipcMain.handle('shell:show-in-finder', (_event, fullPath: string) => {
    shell.showItemInFolder(fullPath)
  })

  ipcMain.handle('favorites:load', () => {
    const all = loadFavorites()
    const valid = all.filter((f) => f.major != null)
    if (valid.length !== all.length) saveFavorites(valid)
    return { success: true, data: valid }
  })

  ipcMain.handle('favorites:save', (_event, favorites: FavoriteApp[]) => {
    try {
      if (!Array.isArray(favorites)) throw new Error('Invalid favorites: expected array')
      for (const f of favorites) {
        assertString(f.name, 'favorite.name')
        assertString(f.label, 'favorite.label')
        assertNumber(f.major, 'favorite.major')
      }
      saveFavorites(favorites)
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('recent:load', () => {
    const all = loadRecentApps()
    const valid = all.filter((r) => r.major != null)
    if (valid.length !== all.length) saveRecentApps(valid)
    return { success: true, data: valid }
  })

  ipcMain.handle('recent:add', (_event, name: string, label: string, major: number) => {
    assertString(name, 'name')
    assertString(label, 'label')
    assertNumber(major, 'major')
    const recent = loadRecentApps()
      .filter((r) => r.major != null)
      .filter((r) => !(r.name === name && r.major === major))
    recent.unshift({ name, label, major, lastViewed: Date.now() })
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
        assertPathSegment(opts.fromVersion, 'fromVersion')
        assertPathSegment(opts.toVersion, 'toVersion')
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
            execFile(codePaths[i], ['--diff', oldFile, newFile], (err) => {
              if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') tryNext(i + 1)
              else if (err) resolve({ success: false, error: err.message })
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
        assertPathSegment(opts.appName, 'appName')
        assertPathSegment(opts.version, 'version')
        const tmpDir = path.join(tmpdir(), 'makediff')
        await fs.mkdir(tmpDir, { recursive: true })

        const zipName = `${opts.appName}@${opts.version}.zip`
        const zipPath = path.join(tmpDir, zipName)

        await new Promise<void>((resolve, reject) => {
          const output = createWriteStream(zipPath)
          const archive = archiver('zip', { zlib: { level: 9 } })
          output.on('close', resolve)
          output.on('error', reject)
          archive.on('error', reject)
          archive.pipe(output)
          for (const file of opts.files) {
            archive.append(toFileData(file.path, file.content), { name: sanitizeZipEntryName(file.path) })
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

  ipcMain.handle('ipm:download-version', async (_event, appName: string, version: string) => {
    try {
      assertPathSegment(appName, 'appName')
      assertPathSegment(version, 'version')
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: `Save ${appName}@${version}`,
        buttonLabel: 'Save',
        properties: ['openDirectory', 'createDirectory']
      })
      if (canceled || filePaths.length === 0) {
        return { success: false, error: 'Cancelled' }
      }

      const baseDir = path.join(filePaths[0], `${appName}@${version}`)
      const client = ipmClient
      const limit = createLimiter(DEP_DOWNLOAD_CONCURRENCY)

      // Download app + manifest in parallel
      const [appBuffer, manifest] = await Promise.all([
        client.downloadComponent(appName, version, 'app'),
        client.getManifest(appName, version)
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
        downloadDepsForVersion(client, accounts, version, 'account', isCustom, limit),
        downloadDepsForVersion(client, hooks, version, 'hook', isCustom, limit)
      ])
      const allFiles = [...appFiles]
      pushNewFiles(allFiles, accFiles)
      pushNewFiles(allFiles, hookFiles)

      // Write all files to disk
      for (const file of allFiles) {
        const filePath = sanitizePath(baseDir, file.path)
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, toFileData(file.path, file.content))
      }

      return { success: true, data: baseDir }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })
}
