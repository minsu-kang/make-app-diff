import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import * as path from 'path'
import { tmpdir } from 'os'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const m = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  rm: vi.fn(),
  execFile: vi.fn(),
  createWriteStream: vi.fn(),
  archiver: vi.fn(),
  append: vi.fn(),
  writeBuffer: vi.fn(),
  showOpenDialog: vi.fn(),
  tmpdirOverride: undefined as string | undefined,
  testConnection: vi.fn(),
  downloadComponent: vi.fn(),
  getManifest: vi.fn(),
  downloadDependencyComponent: vi.fn(),
  loadSettings: vi.fn(),
  loadFavorites: vi.fn(),
  saveFavorites: vi.fn(),
  loadRecentApps: vi.fn(),
  saveRecentApps: vi.fn(),
  isSessionExpired: vi.fn(),
  extractPkr: vi.fn(),
  computeDiff: vi.fn(),
  isCustomApp: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: Handler) => m.handlers.set(channel, fn) },
  dialog: { showOpenDialog: m.showOpenDialog },
  shell: {},
  clipboard: { writeBuffer: m.writeBuffer }
}))
vi.mock('fs/promises', () => ({ mkdir: m.mkdir, writeFile: m.writeFile, rm: m.rm }))
vi.mock('fs', () => ({ createWriteStream: m.createWriteStream }))
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>()
  return { ...actual, tmpdir: () => m.tmpdirOverride ?? actual.tmpdir() }
})
vi.mock('child_process', () => ({ execFile: m.execFile }))
vi.mock('archiver', () => ({ default: m.archiver }))
vi.mock('../index', () => ({ enableMenuItems: vi.fn(), disableMenuItems: vi.fn() }))
// Every call carries the host of the client that made it, so tests can tell which settings a request used
vi.mock('../services/ipm-client', () => ({
  IpmClient: class {
    constructor(private settings: { host: string }) {}
    testConnection = m.testConnection
    downloadComponent = (...args: unknown[]) => m.downloadComponent(this.settings.host, ...args)
    getManifest = (...args: unknown[]) => m.getManifest(this.settings.host, ...args)
    downloadDependencyComponent = (...args: unknown[]) => m.downloadDependencyComponent(this.settings.host, ...args)
  }
}))
vi.mock('pkr', () => ({ default: { unpackSync: vi.fn() } }))
vi.mock('../services/pkr-extractor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/pkr-extractor')>()),
  extractPkr: m.extractPkr
}))
vi.mock('../services/diff-service', () => ({ computeDiff: m.computeDiff }))
vi.mock('../services/decompiler', () => ({
  isCustomApp: m.isCustomApp,
  decompileApp: vi.fn((files: unknown) => files),
  decompileAccount: vi.fn((files: unknown) => files),
  decompileHook: vi.fn((files: unknown) => files)
}))
vi.mock('../services/storage', () => ({
  loadSettings: m.loadSettings,
  saveSettings: vi.fn(),
  loadTheme: vi.fn(),
  saveTheme: vi.fn(),
  loadFavorites: m.loadFavorites,
  saveFavorites: m.saveFavorites,
  loadRecentApps: m.loadRecentApps,
  saveRecentApps: m.saveRecentApps,
  touchActivity: vi.fn(),
  isSessionExpired: m.isSessionExpired,
  clearTokens: vi.fn()
}))

const settings = { host: 'ipm.integromat.com', ipmToken: 'tok', ipmeToken: '', env: 'production', ipmVersion: '4.0.0' }

async function setup(): Promise<void> {
  vi.resetModules()
  m.handlers.clear()
  const { registerIpcHandlers } = await import('../ipc-handlers')
  registerIpcHandlers()
}

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = m.handlers.get(channel)
  if (!handler) throw new Error(`No handler registered for ${channel}`)
  return Promise.resolve(handler(undefined, ...args))
}

beforeEach(async () => {
  vi.resetAllMocks()
  m.loadSettings.mockReturnValue(settings)
  m.loadFavorites.mockReturnValue([])
  m.loadRecentApps.mockReturnValue([])
  m.isSessionExpired.mockReturnValue(false)
  m.testConnection.mockResolvedValue(undefined)
  m.downloadComponent.mockResolvedValue(Buffer.from(''))
  m.getManifest.mockResolvedValue({ dependencies: { accounts: [], hooks: [] } })
  m.extractPkr.mockReturnValue([])
  m.computeDiff.mockReturnValue({ files: [] })
  m.isCustomApp.mockReturnValue(false)
  await setup()
})

describe('ipm:show-version cache', () => {
  it('serves the second request for the same app and version from the cache', async () => {
    await invoke('ipm:show-version', 'my-app', '1.0.0')
    await invoke('ipm:show-version', 'my-app', '1.0.0')
    expect(m.downloadComponent).toHaveBeenCalledTimes(1)
  })

  it('downloads again after the settings are saved', async () => {
    await invoke('ipm:show-version', 'my-app', '1.0.0')
    expect(await invoke('settings:save', { ...settings, host: 'ipme.integromat.com' })).toEqual({ success: true })
    await invoke('ipm:show-version', 'my-app', '1.0.0')
    expect(m.downloadComponent).toHaveBeenCalledTimes(2)
  })

  it('keeps the cache when saving the settings fails the connection test', async () => {
    await invoke('ipm:show-version', 'my-app', '1.0.0')
    m.testConnection.mockRejectedValueOnce(new Error('Invalid token'))
    expect(await invoke('settings:save', settings)).toEqual({ success: false, error: 'Invalid token' })
    await invoke('ipm:show-version', 'my-app', '1.0.0')
    expect(m.downloadComponent).toHaveBeenCalledTimes(1)
  })

  it('downloads again after the session expires', async () => {
    await invoke('ipm:show-version', 'my-app', '1.0.0')
    m.isSessionExpired.mockReturnValueOnce(true)
    expect(await invoke('session:check')).toEqual({ expired: true })
    await invoke('ipm:show-version', 'my-app', '1.0.0')
    expect(m.downloadComponent).toHaveBeenCalledTimes(2)
  })

  it('keeps the cache while the session is still valid', async () => {
    await invoke('ipm:show-version', 'my-app', '1.0.0')
    expect(await invoke('session:check')).toEqual({ expired: false })
    await invoke('ipm:show-version', 'my-app', '1.0.0')
    expect(m.downloadComponent).toHaveBeenCalledTimes(1)
  })
})

describe('editor:open-diff', () => {
  const opts = { filePath: 'src/app.js', fromVersion: '1.0.0', toVersion: '2.0.0', oldContent: 'a', newContent: 'b' }

  it.each(['/../../x', '../x', 'a/b', '..', '.', ''])(
    'rejects fromVersion %j and writes nothing',
    async (fromVersion) => {
      expect(await invoke('editor:open-diff', { ...opts, fromVersion })).toEqual({
        success: false,
        error: 'Invalid fromVersion'
      })
      expect(m.writeFile).not.toHaveBeenCalled()
    }
  )

  it.each(['/../../x', '../x', 'a/b', '..', '.', ''])('rejects toVersion %j and writes nothing', async (toVersion) => {
    expect(await invoke('editor:open-diff', { ...opts, toVersion })).toEqual({
      success: false,
      error: 'Invalid toVersion'
    })
    expect(m.writeFile).not.toHaveBeenCalled()
  })

  it('writes both files inside the makediff temp directory for valid versions', async () => {
    m.execFile.mockImplementation((_cmd: string, _args: string[], callback: (error: Error | null) => void) =>
      callback(null)
    )
    expect(await invoke('editor:open-diff', opts)).toEqual({ success: true })

    const dir = path.join(tmpdir(), 'makediff')
    expect(m.writeFile).toHaveBeenCalledTimes(2)
    expect(m.writeFile).toHaveBeenCalledWith(path.join(dir, 'app@1.0.0.js'), 'a', 'utf-8')
    expect(m.writeFile).toHaveBeenCalledWith(path.join(dir, 'app@2.0.0.js'), 'b', 'utf-8')
  })
})

describe('editor:open-in-vscode', () => {
  const opts = { appName: 'my-app', version: '1.0.0', files: [{ path: 'lib/app.js', content: 'x' }] }

  it.each(['..', '.', 'a/b', '../x', ''])('rejects appName %j before touching the file system', async (appName) => {
    expect(await invoke('editor:open-in-vscode', { ...opts, appName })).toEqual({
      success: false,
      error: 'Invalid appName'
    })
    expect(m.rm).not.toHaveBeenCalled()
    expect(m.mkdir).not.toHaveBeenCalled()
    expect(m.writeFile).not.toHaveBeenCalled()
  })

  it.each(['..', '.', 'a/b', '../x', ''])('rejects version %j before touching the file system', async (version) => {
    expect(await invoke('editor:open-in-vscode', { ...opts, version })).toEqual({
      success: false,
      error: 'Invalid version'
    })
    expect(m.rm).not.toHaveBeenCalled()
    expect(m.mkdir).not.toHaveBeenCalled()
    expect(m.writeFile).not.toHaveBeenCalled()
  })

  it.each(['../../evil', '/etc/passwd', 'a/../../x'])('rejects file path %j and writes nothing', async (filePath) => {
    const result = (await invoke('editor:open-in-vscode', {
      ...opts,
      files: [{ path: filePath, content: 'x' }]
    })) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Invalid file path|Path traversal detected/)
    expect(m.writeFile).not.toHaveBeenCalled()
  })

  it('writes files inside the app temp directory', async () => {
    m.execFile.mockImplementation((_cmd: string, _args: string[], callback: (error: Error | null) => void) =>
      callback(null)
    )
    expect(await invoke('editor:open-in-vscode', opts)).toEqual({ success: true })
    expect(m.writeFile).toHaveBeenCalledWith(path.join(tmpdir(), 'makediff', 'my-app@1.0.0', 'lib/app.js'), 'x')
  })
})

describe('clipboard:copy-zip', () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
  const opts = { appName: 'my-app', version: '1.0.0', files: [{ path: 'lib/app.js', content: 'x' }] }
  let output: EventEmitter

  function mockArchive(finish: () => void): void {
    m.archiver.mockReturnValue({ on: vi.fn(), pipe: vi.fn(), append: m.append, finalize: () => setTimeout(finish, 0) })
  }

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    output = new EventEmitter()
    m.createWriteStream.mockReturnValue(output)
    mockArchive(() => output.emit('close'))
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', platform)
  })

  it('strips traversal and absolute prefixes from zip entry names', async () => {
    const files = ['../x', '/abs', 'C:\\x', '../../a/../b', 'ok/file.js'].map((p) => ({ path: p, content: 'c' }))
    expect(await invoke('clipboard:copy-zip', { ...opts, files })).toEqual({
      success: true,
      data: path.join(tmpdir(), 'makediff', 'my-app@1.0.0.zip')
    })
    expect(m.append.mock.calls.map(([, entry]) => (entry as { name: string }).name)).toEqual([
      'x',
      'abs',
      'x',
      'b',
      'ok/file.js'
    ])
    expect(m.writeBuffer).toHaveBeenCalledTimes(1)
  })

  it('returns the error when the zip output stream fails', async () => {
    mockArchive(() => output.emit('error', new Error('disk full')))
    expect(await invoke('clipboard:copy-zip', opts)).toEqual({ success: false, error: 'disk full' })
    expect(m.writeBuffer).not.toHaveBeenCalled()
  })

  it('appends image files as bytes and text files as text', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
    const files = [
      { path: 'assets/icon.png', content: `data:image/png;base64,${png.toString('base64')}` },
      { path: 'lib/app.js', content: 'const a = 1' }
    ]
    await invoke('clipboard:copy-zip', { ...opts, files })
    const [icon, script] = m.append.mock.calls.map(([data]) => data as Buffer | string)
    expect(Buffer.isBuffer(icon) && icon.equals(png)).toBe(true)
    expect(script).toBe('const a = 1')
  })

  it('does not run PowerShell on macOS', async () => {
    await invoke('clipboard:copy-zip', opts)
    expect(m.execFile).not.toHaveBeenCalled()
  })

  describe('on Windows', () => {
    type ExecCallback = (error: Error | null) => void
    const succeed = (_command: string, _args: string[], _options: object, callback: ExecCallback): void =>
      callback(null)

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32' })
    })

    afterEach(() => {
      m.tmpdirOverride = undefined
    })

    it('copies the zip as a file drop list through PowerShell', async () => {
      const zipPath = path.join(tmpdir(), 'makediff', 'my-app@1.0.0.zip')
      m.execFile.mockImplementation(succeed)
      expect(await invoke('clipboard:copy-zip', opts)).toEqual({ success: true, data: zipPath })

      const [command, args, options] = m.execFile.mock.calls[0] as [string, string[], object]
      expect(command).toBe('powershell.exe')
      expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-Command'])
      expect(args[3]).toContain(`$null = $col.Add('${zipPath}')`)
      expect(args[3]).toContain('[System.Windows.Forms.Clipboard]::SetFileDropList($col)')
      expect(options).toEqual({ windowsHide: true })
      expect(m.writeBuffer).not.toHaveBeenCalled()
    })

    it('doubles single quotes in the zip path', async () => {
      m.tmpdirOverride = "/tmp/O'Brien"
      m.execFile.mockImplementation(succeed)
      await invoke('clipboard:copy-zip', opts)
      const [, args] = m.execFile.mock.calls[0] as [string, string[]]
      expect(args[3]).toContain("$col.Add('/tmp/O''Brien/makediff/my-app@1.0.0.zip')")
    })

    it('returns the PowerShell error', async () => {
      m.execFile.mockImplementation((_command: string, _args: string[], _options: object, callback: ExecCallback) =>
        callback(new Error('clipboard unavailable'))
      )
      expect(await invoke('clipboard:copy-zip', opts)).toEqual({ success: false, error: 'clipboard unavailable' })
    })
  })

  it.each(['..', '.', 'a/b', '../x', ''])('rejects appName %j before creating the zip', async (appName) => {
    expect(await invoke('clipboard:copy-zip', { ...opts, appName })).toEqual({
      success: false,
      error: 'Invalid appName'
    })
    expect(m.createWriteStream).not.toHaveBeenCalled()
    expect(m.mkdir).not.toHaveBeenCalled()
  })

  it.each(['..', '.', 'a/b', '../x', ''])('rejects version %j before creating the zip', async (version) => {
    expect(await invoke('clipboard:copy-zip', { ...opts, version })).toEqual({
      success: false,
      error: 'Invalid version'
    })
    expect(m.createWriteStream).not.toHaveBeenCalled()
    expect(m.mkdir).not.toHaveBeenCalled()
    expect(m.writeBuffer).not.toHaveBeenCalled()
  })
})

describe('ipm:download-version', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])

  it.each(['..', '.', 'a/b', '../x', ''])('rejects appName %j before opening the folder dialog', async (appName) => {
    expect(await invoke('ipm:download-version', appName, '1.0.0')).toEqual({
      success: false,
      error: 'Invalid appName'
    })
    expect(m.showOpenDialog).not.toHaveBeenCalled()
    expect(m.writeFile).not.toHaveBeenCalled()
  })

  it.each(['..', '.', 'a/b', '../x', ''])('rejects version %j before opening the folder dialog', async (version) => {
    expect(await invoke('ipm:download-version', 'my-app', version)).toEqual({
      success: false,
      error: 'Invalid version'
    })
    expect(m.showOpenDialog).not.toHaveBeenCalled()
    expect(m.writeFile).not.toHaveBeenCalled()
  })

  it('writes image files as bytes and text files as text', async () => {
    m.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/out'] })
    m.extractPkr.mockReturnValue([
      { path: 'assets/icon.png', content: `data:image/png;base64,${png.toString('base64')}` },
      { path: 'lib/app.js', content: 'const a = 1' }
    ])
    expect(await invoke('ipm:download-version', 'my-app', '1.0.0')).toEqual({
      success: true,
      data: path.join('/out', 'my-app@1.0.0')
    })
    const writes = new Map(m.writeFile.mock.calls.map(([file, data]) => [file as string, data as Buffer | string]))
    const icon = writes.get(path.join('/out', 'my-app@1.0.0', 'assets/icon.png'))
    expect(Buffer.isBuffer(icon) && icon.equals(png)).toBe(true)
    expect(writes.get(path.join('/out', 'my-app@1.0.0', 'lib/app.js'))).toBe('const a = 1')
  })

  it.each(['../../evil', '/etc/passwd', 'a/../../x'])(
    'rejects the extracted file path %j and writes nothing',
    async (filePath) => {
      m.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/out'] })
      m.extractPkr.mockReturnValue([{ path: filePath, content: 'x' }])
      const result = (await invoke('ipm:download-version', 'my-app', '1.0.0')) as { success: boolean; error?: string }
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/Invalid file path|Path traversal detected/)
      expect(m.writeFile).not.toHaveBeenCalled()
    }
  )

  it('does nothing when the folder dialog is cancelled', async () => {
    m.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    expect(await invoke('ipm:download-version', 'my-app', '1.0.0')).toEqual({ success: false, error: 'Cancelled' })
    expect(m.writeFile).not.toHaveBeenCalled()
  })
})

describe('editor:open-in-vscode image files', () => {
  it('writes image files as bytes and text files as text', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
    m.execFile.mockImplementation((_cmd: string, _args: string[], callback: (error: Error | null) => void) =>
      callback(null)
    )
    const files = [
      { path: 'assets/icon.png', content: `data:image/png;base64,${png.toString('base64')}` },
      { path: 'lib/app.js', content: 'const a = 1' }
    ]
    await invoke('editor:open-in-vscode', { appName: 'my-app', version: '1.0.0', files })
    const dir = path.join(tmpdir(), 'makediff', 'my-app@1.0.0')
    const writes = new Map(m.writeFile.mock.calls.map(([file, data]) => [file as string, data as Buffer | string]))
    const icon = writes.get(path.join(dir, 'assets/icon.png'))
    expect(Buffer.isBuffer(icon) && icon.equals(png)).toBe(true)
    expect(writes.get(path.join(dir, 'lib/app.js'))).toBe('const a = 1')
  })
})

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('requests that are in flight when the settings change', () => {
  const otherSettings = { ...settings, host: 'ipme.integromat.com' }

  it('does not refill the show-version cache with the old host data', async () => {
    const appDownload = deferred<Buffer>()
    m.downloadComponent.mockImplementationOnce(() => appDownload.promise)
    const inFlight = invoke('ipm:show-version', 'my-app', '1.0.0')
    await invoke('settings:save', otherSettings)
    appDownload.resolve(Buffer.from(''))
    await inFlight

    await invoke('ipm:show-version', 'my-app', '1.0.0')
    expect(m.downloadComponent).toHaveBeenCalledTimes(2)
    expect(m.downloadComponent.mock.calls[1][0]).toBe('ipme.integromat.com')
  })

  it('does not refill the get-diff cache with the old host data', async () => {
    const appDownload = deferred<Buffer>()
    m.downloadComponent.mockImplementationOnce(() => appDownload.promise)
    const inFlight = invoke('ipm:get-diff', 'my-app', '1.0.0', '2.0.0')
    await invoke('settings:save', otherSettings)
    appDownload.resolve(Buffer.from(''))
    await inFlight

    m.downloadComponent.mockClear()
    await invoke('ipm:get-diff', 'my-app', '1.0.0', '2.0.0')
    expect(m.downloadComponent).toHaveBeenCalledTimes(2)
  })

  it('uses one client for the app and the dependency downloads of a request', async () => {
    const appDownload = deferred<Buffer>()
    m.downloadComponent.mockImplementationOnce(() => appDownload.promise)
    m.getManifest.mockResolvedValue({ dependencies: { accounts: ['acc'], hooks: ['hook'] } })
    m.downloadDependencyComponent.mockResolvedValue(Buffer.from(''))
    const inFlight = invoke('ipm:show-version', 'my-app', '1.0.0')
    await invoke('settings:save', otherSettings)
    appDownload.resolve(Buffer.from(''))
    await inFlight

    expect(m.downloadDependencyComponent.mock.calls.map(([host]) => host)).toEqual([
      'ipm.integromat.com',
      'ipm.integromat.com'
    ])
  })

  it('still caches the result of a request that was not interrupted', async () => {
    await invoke('ipm:show-version', 'my-app', '1.0.0')
    await invoke('ipm:show-version', 'my-app', '1.0.0')
    expect(m.downloadComponent).toHaveBeenCalledTimes(1)
  })
})

describe('dependency downloads', () => {
  const deps = {
    dependencies: { accounts: ['a1', 'a2', 'a3', 'a4', 'a5'], hooks: ['h1', 'h2', 'h3', 'h4', 'h5'] }
  }
  let maxActive = 0

  beforeEach(() => {
    maxActive = 0
    let active = 0
    m.getManifest.mockResolvedValue(deps)
    m.downloadDependencyComponent.mockImplementation(async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 3))
      active--
      return Buffer.from('')
    })
  })

  it('share one limit of 4 across all lists of a comparison', async () => {
    await invoke('ipm:get-diff', 'my-app', '1.0.0', '2.0.0')
    expect(m.downloadDependencyComponent).toHaveBeenCalledTimes(20)
    expect(maxActive).toBe(4)
  })

  it('share one limit of 4 across the account and hook lists of show-version', async () => {
    await invoke('ipm:show-version', 'my-app', '1.0.0')
    expect(m.downloadDependencyComponent).toHaveBeenCalledTimes(10)
    expect(maxActive).toBe(4)
  })

  it('share one limit of 4 across the account and hook lists of a download', async () => {
    m.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/out'] })
    await invoke('ipm:download-version', 'my-app', '1.0.0')
    expect(m.downloadDependencyComponent).toHaveBeenCalledTimes(10)
    expect(maxActive).toBe(4)
  })
})

describe('dependency files in a comparison', () => {
  type Files = { path: string }[]

  beforeEach(() => {
    m.getManifest.mockResolvedValue({ dependencies: { accounts: ['good', 'bad'], hooks: ['hook1'] } })
    m.downloadComponent.mockResolvedValue(Buffer.from('app'))
    m.downloadDependencyComponent.mockImplementation(async (_host: string, dep: string) => {
      if (dep === 'bad') throw new Error('download failed')
      return Buffer.from('dep')
    })
    m.extractPkr.mockImplementation((buffer: Buffer) =>
      buffer.toString() === 'app'
        ? [{ path: 'manifest.json', content: '{}' }]
        : [
            { path: 'lib/functions.js', content: 'filtered out' },
            { path: 'lib/account.js', content: 'code' }
          ]
    )
  })

  it('skips a dependency whose download fails and still returns the diff', async () => {
    expect(await invoke('ipm:get-diff', 'my-app', '1.0.0', '2.0.0')).toMatchObject({ success: true })
    expect(m.downloadDependencyComponent.mock.calls.map(([, dep]) => dep)).toContain('bad')
    const [, from, to] = m.computeDiff.mock.calls[0] as [string, Files, Files]
    for (const files of [from, to]) {
      expect(files.map((f) => f.path).sort()).toEqual([
        'accounts/good/lib/account.js',
        'hooks/hook1/lib/account.js',
        'manifest.json'
      ])
    }
  })

  it('leaves lib/functions.js out and puts dependency files under accounts/ and hooks/ in show-version', async () => {
    expect(await invoke('ipm:show-version', 'my-app', '1.0.0')).toMatchObject({ success: true })
    const [, from, to] = m.computeDiff.mock.calls[0] as [string, Files, Files]
    expect(from).toEqual([])
    expect(to.map((f) => f.path).sort()).toEqual([
      'accounts/good/lib/account.js',
      'hooks/hook1/lib/account.js',
      'manifest.json'
    ])
  })
})

describe('recent:add', () => {
  const entry = (name: string, major: number, lastViewed = 1): Record<string, unknown> => ({
    name,
    label: name.toUpperCase(),
    major,
    lastViewed
  })
  const rejects = (...args: unknown[]): Promise<unknown> => Promise.resolve().then(() => invoke('recent:add', ...args))

  it('puts a new entry first and saves the list', async () => {
    m.loadRecentApps.mockReturnValue([entry('slack', 1)])
    const result = (await invoke('recent:add', 'gmail', 'Gmail', 2)) as { success: boolean; data: unknown[] }
    expect(result.success).toBe(true)
    expect(result.data).toEqual([
      { name: 'gmail', label: 'Gmail', major: 2, lastViewed: expect.any(Number) },
      entry('slack', 1)
    ])
    expect(m.saveRecentApps).toHaveBeenCalledWith(result.data)
  })

  it('moves a re-added entry to the front without duplicating it', async () => {
    m.loadRecentApps.mockReturnValue([entry('slack', 1), entry('gmail', 2), entry('jira', 1)])
    const result = (await invoke('recent:add', 'gmail', 'Gmail', 2)) as { data: { name: string }[] }
    expect(result.data.map((r) => r.name)).toEqual(['gmail', 'slack', 'jira'])
  })

  it('keeps the same app at another major version as a separate entry', async () => {
    m.loadRecentApps.mockReturnValue([entry('gmail', 1)])
    const result = (await invoke('recent:add', 'gmail', 'Gmail', 2)) as { data: { major: number }[] }
    expect(result.data.map((r) => r.major)).toEqual([2, 1])
  })

  it('keeps at most 8 entries and drops the oldest', async () => {
    m.loadRecentApps.mockReturnValue(Array.from({ length: 8 }, (_, i) => entry(`app${i}`, 1)))
    const result = (await invoke('recent:add', 'new', 'New', 1)) as { data: { name: string }[] }
    expect(result.data).toHaveLength(8)
    expect(result.data[0].name).toBe('new')
    expect(result.data.map((r) => r.name)).not.toContain('app7')
  })

  it('drops legacy entries that have no major', async () => {
    m.loadRecentApps.mockReturnValue([{ name: 'old', label: 'Old', lastViewed: 1 }, entry('slack', 1)])
    const result = (await invoke('recent:add', 'gmail', 'Gmail', 2)) as { data: { name: string }[] }
    expect(result.data.map((r) => r.name)).toEqual(['gmail', 'slack'])
  })

  it.each([
    ['name', ['', 'Gmail', 2]],
    ['name', [undefined, 'Gmail', 2]],
    ['label', ['gmail', '', 2]],
    ['label', ['gmail', 5, 2]],
    ['major', ['gmail', 'Gmail', '2']],
    ['major', ['gmail', 'Gmail', Number.NaN]],
    ['major', ['gmail', 'Gmail', Number.POSITIVE_INFINITY]]
  ])('rejects an invalid %s before saving: %j', async (field, args) => {
    await expect(rejects(...args)).rejects.toThrow(`Invalid ${field}`)
    expect(m.saveRecentApps).not.toHaveBeenCalled()
  })
})

describe('favorites:save', () => {
  const valid = { name: 'gmail', label: 'Gmail', major: 2, addedAt: 1 }

  it('saves a valid list, including an empty one', async () => {
    expect(await invoke('favorites:save', [valid])).toEqual({ success: true })
    expect(m.saveFavorites).toHaveBeenLastCalledWith([valid])
    expect(await invoke('favorites:save', [])).toEqual({ success: true })
    expect(m.saveFavorites).toHaveBeenLastCalledWith([])
  })

  it.each([null, undefined, 'gmail', { 0: valid }, 42])('rejects a non-array payload %j', async (payload) => {
    expect(await invoke('favorites:save', payload)).toEqual({
      success: false,
      error: 'Invalid favorites: expected array'
    })
    expect(m.saveFavorites).not.toHaveBeenCalled()
  })

  it.each([
    ['favorite.name', { ...valid, name: '' }],
    ['favorite.name', { ...valid, name: 7 }],
    ['favorite.label', { ...valid, label: '' }],
    ['favorite.label', { ...valid, label: null }],
    ['favorite.major', { ...valid, major: '2' }],
    ['favorite.major', { ...valid, major: Number.NaN }],
    ['favorite.major', { ...valid, major: Number.POSITIVE_INFINITY }]
  ])('rejects an entry with an invalid %s', async (field, bad) => {
    const result = (await invoke('favorites:save', [valid, bad])) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain(`Invalid ${field}`)
    expect(m.saveFavorites).not.toHaveBeenCalled()
  })
})

describe('favorites:load and recent:load', () => {
  it('drops legacy favorites without a major and saves the cleaned list', async () => {
    const good = { name: 'gmail', label: 'Gmail', major: 2, addedAt: 1 }
    m.loadFavorites.mockReturnValue([{ name: 'old', label: 'Old', addedAt: 1 }, good])
    expect(await invoke('favorites:load')).toEqual({ success: true, data: [good] })
    expect(m.saveFavorites).toHaveBeenCalledWith([good])
  })

  it('does not rewrite favorites that are already clean', async () => {
    m.loadFavorites.mockReturnValue([{ name: 'gmail', label: 'Gmail', major: 2, addedAt: 1 }])
    await invoke('favorites:load')
    expect(m.saveFavorites).not.toHaveBeenCalled()
  })

  it('drops legacy recent apps without a major and saves the cleaned list', async () => {
    const good = { name: 'gmail', label: 'Gmail', major: 2, lastViewed: 1 }
    m.loadRecentApps.mockReturnValue([{ name: 'old', label: 'Old', lastViewed: 1 }, good])
    expect(await invoke('recent:load')).toEqual({ success: true, data: [good] })
    expect(m.saveRecentApps).toHaveBeenCalledWith([good])
  })

  it('does not rewrite recent apps that are already clean', async () => {
    m.loadRecentApps.mockReturnValue([{ name: 'gmail', label: 'Gmail', major: 2, lastViewed: 1 }])
    await invoke('recent:load')
    expect(m.saveRecentApps).not.toHaveBeenCalled()
  })
})

describe('cache keys', () => {
  it('serves a repeated comparison from the get-diff cache', async () => {
    await invoke('ipm:get-diff', 'my-app', '1.0.0', '2.0.0')
    await invoke('ipm:get-diff', 'my-app', '1.0.0', '2.0.0')
    expect(m.downloadComponent).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['another app', ['other-app', '1.0.0', '2.0.0']],
    ['another from version', ['my-app', '1.0.1', '2.0.0']],
    ['another to version', ['my-app', '1.0.0', '2.0.1']]
  ])('downloads again for %s in get-diff', async (_label, args) => {
    await invoke('ipm:get-diff', 'my-app', '1.0.0', '2.0.0')
    await invoke('ipm:get-diff', ...args)
    expect(m.downloadComponent).toHaveBeenCalledTimes(4)
  })

  it.each([
    ['another app', ['other-app', '1.0.0']],
    ['another version', ['my-app', '1.0.1']]
  ])('downloads again for %s in show-version', async (_label, args) => {
    await invoke('ipm:show-version', 'my-app', '1.0.0')
    await invoke('ipm:show-version', ...args)
    expect(m.downloadComponent).toHaveBeenCalledTimes(2)
  })
})
