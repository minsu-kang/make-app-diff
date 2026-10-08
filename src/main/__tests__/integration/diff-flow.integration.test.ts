import { describe, it, expect } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import type { DiffResult, FileDiff, IpcResult } from '../../types'
import {
  PNG,
  binaryReply,
  buildPkr,
  connect,
  invoke,
  ipm,
  mockApp,
  readZip,
  setPlatform,
  spies,
  startApp,
  tmpRoot
} from './harness'

const PNG_URI = `data:image/png;base64,${PNG.toString('base64')}`

const regularV1 = {
  'manifest.json': '{"name":"demo","label":"Demo","version":1}\n',
  'modules/list.json': '{"limit":10}\n',
  'modules/old.json': '{"gone":true}\n',
  'assets/icon.png': PNG,
  'readme.txt': 'same\n'
}

const regularV2 = {
  'manifest.json': '{"name":"demo","label":"Demo","version":2}\n',
  'modules/list.json': '{"limit":50}\n',
  'modules/new.json': '{"added":true}\n',
  'assets/icon.png': PNG,
  'readme.txt': 'same\n'
}

function customApp(url: string): Record<string, string> {
  return {
    'manifest.json': JSON.stringify({
      name: 'custom',
      label: 'Custom',
      actions: [{ name: 'myAction', parameters: [] }]
    }),
    'lib/app.js': `
      class MyAction extends ExecuteAction {
        constructor() {
          super();
          const api = { url: '${url}' };
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
        }
      }
      module.exports = { myAction: MyAction };
    `
  }
}

function mockDependency(
  type: 'account' | 'hook',
  name: string,
  version: string,
  files: Record<string, string> | number
): void {
  const request = ipm().get(`/v3/sync/${type}/${name}/${version}`)
  if (typeof files === 'number') request.reply(files, {})
  else request.reply(200, buildPkr(files), binaryReply)
}

/** A promise that stays pending until `release()` is called */
function holdBack(): { gate: Promise<void>; release: () => void } {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  return { gate, release }
}

/** Like `mockApp`, but the PKR download is only answered once `gate` resolves */
function mockAppHeldBack(
  name: string,
  version: string,
  files: Record<string, string | Buffer>,
  gate: Promise<void>
): void {
  ipm()
    .get(`/v3/sync/app/${name}/${version}`)
    .reply(async () => {
      await gate
      return [200, buildPkr(files), binaryReply]
    })
  ipm().get(`/manifest/app/${name}/${version}`).reply(200, { name })
}

function byPath(result: IpcResult<DiffResult>): Record<string, FileDiff> {
  return Object.fromEntries((result.data?.diffs ?? []).map((d) => [d.filePath, d]))
}

describe('ipm:get-diff', () => {
  it('compares two versions of a compiled app file by file', async () => {
    await startApp()
    await connect()
    mockApp('demo', '1.0.0', regularV1)
    mockApp('demo', '2.0.0', regularV2)

    const result = await invoke<IpcResult<DiffResult>>('ipm:get-diff', 'demo', '1.0.0', '2.0.0')

    expect(result.success).toBe(true)
    expect(result.data?.summary).toEqual({ added: 1, deleted: 1, modified: 2, unchanged: 2 })
    expect(result.data?.isCustomApp).toBe(false)
    const files = byPath(result)
    expect(files['modules/new.json'].status).toBe('added')
    expect(files['modules/old.json'].status).toBe('deleted')
    expect(files['modules/list.json'].status).toBe('modified')
    expect(files['modules/list.json'].unifiedDiff).toMatch(/^-\s+"limit": 10$/m)
    expect(files['modules/list.json'].unifiedDiff).toMatch(/^\+\s+"limit": 50$/m)
    expect(files['assets/icon.png']).toBeUndefined()
    expect(files['readme.txt']).toBeUndefined()
  })

  it('merges account and hook dependencies of both versions and skips one that fails to download', async () => {
    await startApp()
    await connect()
    mockApp('demo', '1.0.0', regularV1, { dependencies: { accounts: ['acc1'], hooks: ['hook1'] } })
    mockApp('demo', '2.0.0', regularV2, { dependencies: { accounts: ['acc1', 'acc2'], hooks: ['hook1'] } })
    mockDependency('account', 'acc1', '1.0.0', { 'manifest.json': '{"v":1}', 'lib/functions.js': 'ignored' })
    mockDependency('account', 'acc1', '2.0.0', { 'manifest.json': '{"v":2}' })
    mockDependency('account', 'acc2', '2.0.0', { 'manifest.json': '{"v":2}' })
    mockDependency('hook', 'hook1', '1.0.0', { 'manifest.json': '{"hook":1}' })
    mockDependency('hook', 'hook1', '2.0.0', 500)

    const result = await invoke<IpcResult<DiffResult>>('ipm:get-diff', 'demo', '1.0.0', '2.0.0')

    expect(result.success).toBe(true)
    const files = byPath(result)
    expect(files['accounts/acc1/manifest.json'].status).toBe('modified')
    expect(files['accounts/acc2/manifest.json'].status).toBe('added')
    expect(files['hooks/hook1/manifest.json'].status).toBe('deleted')
    expect(files['accounts/acc1/lib/functions.js']).toBeUndefined()
  })

  it('decompiles a custom app by default and shows the compiled files when asked', async () => {
    await startApp()
    await connect()
    mockApp('custom', '1.0.0', customApp('/v1'))
    mockApp('custom', '2.0.0', customApp('/v2'))

    const decompiled = await invoke<IpcResult<DiffResult>>('ipm:get-diff', 'custom', '1.0.0', '2.0.0')
    // Same versions again: the raw files come from the cache, no request is made
    const compiled = await invoke<IpcResult<DiffResult>>('ipm:get-diff', 'custom', '1.0.0', '2.0.0', false)

    expect(decompiled.data?.isCustomApp).toBe(true)
    const sdkFiles = byPath(decompiled)
    expect(sdkFiles['lib/app.js']).toBeUndefined()
    expect(decompiled.data?.summary.unchanged).toBeGreaterThan(0)
    expect(sdkFiles['modules/myAction/api.imljson'].status).toBe('modified')
    expect(sdkFiles['modules/myAction/api.imljson'].newContent).toContain('/v2')
    const rawFiles = byPath(compiled)
    expect(rawFiles['lib/app.js'].status).toBe('modified')
    expect(rawFiles['modules/myAction/api.imljson']).toBeUndefined()
  })

  it('serves a repeated request from the cache and downloads again after the settings change', async () => {
    await startApp()
    await connect()
    mockApp('demo', '1.0.0', regularV1)
    mockApp('demo', '2.0.0', regularV2)

    const first = await invoke<IpcResult<DiffResult>>('ipm:get-diff', 'demo', '1.0.0', '2.0.0')
    expect(first.success).toBe(true)
    // No interceptor is left: any request here would fail because the network is closed
    const second = await invoke<IpcResult<DiffResult>>('ipm:get-diff', 'demo', '1.0.0', '2.0.0')
    expect(second).toEqual(first)

    await connect({ ipmToken: 'another-token' })
    mockApp('demo', '1.0.0', regularV1, {}, 'another-token')
    mockApp('demo', '2.0.0', regularV2, {}, 'another-token')
    const third = await invoke<IpcResult<DiffResult>>('ipm:get-diff', 'demo', '1.0.0', '2.0.0')
    expect(third).toEqual(first)
  })

  it('returns the server error when a version cannot be downloaded', async () => {
    await startApp()
    await connect()
    mockApp('demo', '1.0.0', regularV1)
    ipm().get('/v3/sync/app/demo/9.9.9').reply(404, {})
    ipm().get('/manifest/app/demo/9.9.9').reply(200, {})

    const result = await invoke<IpcResult<DiffResult>>('ipm:get-diff', 'demo', '1.0.0', '9.9.9')

    expect(result).toEqual({ success: false, error: 'Request failed with status code 404' })
  })

  it('does not cache a diff whose download started before the settings changed', async () => {
    await startApp()
    await connect()
    const released = holdBack()
    mockAppHeldBack('demo', '1.0.0', regularV1, released.gate)
    mockAppHeldBack('demo', '2.0.0', regularV2, released.gate)

    const inFlight = invoke<IpcResult<DiffResult>>('ipm:get-diff', 'demo', '1.0.0', '2.0.0')
    // The settings change while the downloads are still running, so those files belong to the old settings
    await connect({ ipmToken: 'another-token' })
    released.release()
    expect((await inFlight).success).toBe(true)

    mockApp('demo', '1.0.0', regularV1)
    mockApp('demo', '2.0.0', { ...regularV2, 'modules/list.json': '{"limit":99}\n' })
    const next = await invoke<IpcResult<DiffResult>>('ipm:get-diff', 'demo', '1.0.0', '2.0.0')

    expect(byPath(next)['modules/list.json'].newContent).toContain('99')
  })
})

describe('ipm:show-version', () => {
  it('lists every file of one version as added, with its dependencies', async () => {
    await startApp()
    await connect()
    mockApp('demo', '2.0.0', regularV2, { dependencies: { accounts: ['acc1'], hooks: [] } })
    mockDependency('account', 'acc1', '2.0.0', { 'manifest.json': '{"v":2}' })

    const result = await invoke<IpcResult<DiffResult>>('ipm:show-version', 'demo', '2.0.0')

    expect(result.success).toBe(true)
    expect(result.data?.summary).toEqual({ added: 6, deleted: 0, modified: 0, unchanged: 0 })
    expect(JSON.parse(byPath(result)['accounts/acc1/manifest.json'].newContent)).toEqual({ v: 2 })
    expect(byPath(result)['assets/icon.png'].newContent).toBe(PNG_URI)
  })

  it('decompiles the dependencies of a custom app', async () => {
    await startApp()
    await connect()
    mockApp('custom', '1.0.0', customApp('/v1'), { dependencies: { accounts: ['acc1'], hooks: [] } })
    mockDependency('account', 'acc1', '1.0.0', { 'manifest.json': '{"name":"acc1","label":"Acc","type":"basic"}' })

    const result = await invoke<IpcResult<DiffResult>>('ipm:show-version', 'custom', '1.0.0')

    const files = byPath(result)
    expect(JSON.parse(files['connections/acc1/metadata.json'].newContent)).toMatchObject({ name: 'acc1' })
    expect(files['accounts/acc1/manifest.json']).toBeUndefined()
  })

  it('does not cache a version whose download started before the settings changed', async () => {
    await startApp()
    await connect()
    const released = holdBack()
    mockAppHeldBack('demo', '2.0.0', regularV2, released.gate)

    const inFlight = invoke<IpcResult<DiffResult>>('ipm:show-version', 'demo', '2.0.0')
    await connect({ ipmToken: 'another-token' })
    released.release()
    expect((await inFlight).success).toBe(true)

    mockApp('demo', '2.0.0', { ...regularV2, 'modules/list.json': '{"limit":99}\n' })
    const next = await invoke<IpcResult<DiffResult>>('ipm:show-version', 'demo', '2.0.0')

    expect(byPath(next)['modules/list.json'].newContent).toContain('99')
  })
})

describe('exports', () => {
  it('downloads a version to the chosen folder with its dependencies and image bytes', async () => {
    await startApp()
    await connect()
    const target = path.join(tmpRoot(), 'chosen')
    await fs.mkdir(target)
    spies.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [target] })
    mockApp('demo', '2.0.0', regularV2, { dependencies: { accounts: ['acc1'], hooks: [] } })
    mockDependency('account', 'acc1', '2.0.0', { 'manifest.json': '{"v":2}' })

    const result = await invoke<IpcResult<string>>('ipm:download-version', 'demo', '2.0.0')

    const baseDir = path.join(target, 'demo@2.0.0')
    expect(result).toEqual({ success: true, data: baseDir })
    expect(await fs.readFile(path.join(baseDir, 'assets/icon.png'))).toEqual(PNG)
    expect(await fs.readFile(path.join(baseDir, 'modules/list.json'), 'utf8')).toBe('{"limit":50}\n')
    expect(await fs.readFile(path.join(baseDir, 'accounts/acc1/manifest.json'), 'utf8')).toBe('{"v":2}')
  })

  it('decompiles a custom app when downloading it', async () => {
    await startApp()
    await connect()
    const target = path.join(tmpRoot(), 'chosen')
    await fs.mkdir(target)
    spies.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [target] })
    mockApp('custom', '1.0.0', customApp('/v1'))

    const result = await invoke<IpcResult<string>>('ipm:download-version', 'custom', '1.0.0')

    expect(result.success).toBe(true)
    const api = await fs.readFile(path.join(target, 'custom@1.0.0', 'modules/myAction/api.imljson'), 'utf8')
    expect(api).toContain('/v1')
    await expect(fs.access(path.join(target, 'custom@1.0.0', 'lib/app.js'))).rejects.toThrow()
  })

  it('decompiles the dependencies of a custom app when downloading it', async () => {
    await startApp()
    await connect()
    const target = path.join(tmpRoot(), 'chosen')
    await fs.mkdir(target)
    spies.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [target] })
    mockApp('custom', '1.0.0', customApp('/v1'), { dependencies: { accounts: ['acc1'], hooks: ['hook1'] } })
    mockDependency('account', 'acc1', '1.0.0', { 'manifest.json': '{"name":"acc1","label":"Acc","type":"basic"}' })
    mockDependency('hook', 'hook1', '1.0.0', { 'manifest.json': '{"name":"hook1","label":"Hook","type":"web"}' })

    const result = await invoke<IpcResult<string>>('ipm:download-version', 'custom', '1.0.0')

    expect(result.success).toBe(true)
    const baseDir = path.join(target, 'custom@1.0.0')
    const account = await fs.readFile(path.join(baseDir, 'connections/acc1/metadata.json'), 'utf8')
    expect(JSON.parse(account)).toMatchObject({ name: 'acc1', label: 'Acc' })
    const hook = await fs.readFile(path.join(baseDir, 'webhooks/hook1/metadata.json'), 'utf8')
    expect(JSON.parse(hook)).toMatchObject({ name: 'hook1', label: 'Hook' })
    await expect(fs.access(path.join(baseDir, 'connections/acc1/manifest.json'))).rejects.toThrow()
    await expect(fs.access(path.join(baseDir, 'webhooks/hook1/manifest.json'))).rejects.toThrow()
  })

  it('does nothing when the folder dialog is cancelled', async () => {
    await startApp()
    await connect()

    const result = await invoke<IpcResult<string>>('ipm:download-version', 'demo', '2.0.0')

    expect(result).toEqual({ success: false, error: 'Cancelled' })
  })

  it('rejects an app name that would leave the target folder before asking where to save', async () => {
    await startApp()
    await connect()

    const result = await invoke<IpcResult<string>>('ipm:download-version', '../escape', '1.0.0')

    expect(result).toEqual({ success: false, error: 'Invalid appName' })
    expect(spies.showOpenDialog).not.toHaveBeenCalled()
  })

  it('refuses a PKR whose file path points outside the target folder and writes nothing there', async () => {
    await startApp()
    await connect()
    const target = path.join(tmpRoot(), 'chosen')
    await fs.mkdir(target)
    spies.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [target] })
    mockApp('evil', '1.0.0', { 'manifest.json': '{}', '../escape.txt': 'pwned' })

    const result = await invoke<IpcResult<string>>('ipm:download-version', 'evil', '1.0.0')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Invalid file path|Path traversal/)
    await expect(fs.access(path.join(target, 'escape.txt'))).rejects.toThrow()
    await expect(fs.access(path.join(tmpRoot(), 'escape.txt'))).rejects.toThrow()
  })

  it('builds a ZIP with sanitized entry names and puts it on the macOS clipboard', async () => {
    await startApp()
    setPlatform('darwin')

    const result = await invoke<IpcResult<string>>('clipboard:copy-zip', {
      appName: 'demo',
      version: '2.0.0',
      files: [
        { path: 'modules/list.json', content: '{"limit":50}' },
        { path: '../../evil.txt', content: 'x' },
        { path: 'assets/icon.png', content: PNG_URI }
      ]
    })

    const zipPath = path.join(tmpRoot(), 'makediff', 'demo@2.0.0.zip')
    expect(result).toEqual({ success: true, data: zipPath })
    const entries = readZip(await fs.readFile(zipPath))
    expect(Object.keys(entries).sort()).toEqual(['assets/icon.png', 'evil.txt', 'modules/list.json'])
    expect(entries['modules/list.json'].toString()).toBe('{"limit":50}')
    expect(entries['assets/icon.png']).toEqual(PNG)
    const [format, plist] = spies.writeBuffer.mock.calls[0]
    expect(format).toBe('NSFilenamesPboardType')
    expect(plist.toString()).toContain(`<string>${zipPath}</string>`)
    expect(spies.execFile).not.toHaveBeenCalled()
  })

  it('stores the image bytes and entry names without ".." segments in the ZIP', async () => {
    await startApp()
    setPlatform('darwin')

    const result = await invoke<IpcResult<string>>('clipboard:copy-zip', {
      appName: 'demo',
      version: '2.0.0',
      files: [
        { path: 'assets/icon.png', content: PNG_URI },
        { path: 'nested/../../evil.txt', content: 'x' }
      ]
    })

    const entries = readZip(await fs.readFile(result.data as string))
    expect(Object.keys(entries).sort()).toEqual(['assets/icon.png', 'evil.txt'])
    expect(entries['assets/icon.png']).toEqual(PNG)
    expect(entries['evil.txt'].toString()).toBe('x')
  })

  it('puts the ZIP on the Windows clipboard through PowerShell', async () => {
    await startApp()
    setPlatform('win32')

    const result = await invoke<IpcResult<string>>('clipboard:copy-zip', {
      appName: 'demo',
      version: '2.0.0',
      files: [{ path: 'a.txt', content: 'a' }]
    })

    expect(result.success).toBe(true)
    const [command, args] = spies.execFile.mock.calls[0]
    expect(command).toBe('powershell.exe')
    expect(args.at(-1)).toContain(`$col.Add('${result.data}')`)
    expect(spies.writeBuffer).not.toHaveBeenCalled()
  })

  it('writes a version to a temp folder and opens it in VS Code', async () => {
    await startApp()
    setPlatform('darwin')

    const result = await invoke<IpcResult<void>>('editor:open-in-vscode', {
      appName: 'demo',
      version: '2.0.0',
      files: [
        { path: 'modules/list.json', content: '{"limit":50}' },
        { path: 'assets/icon.png', content: PNG_URI }
      ]
    })

    const dir = path.join(tmpRoot(), 'makediff', 'demo@2.0.0')
    expect(result).toEqual({ success: true })
    expect(await fs.readFile(path.join(dir, 'modules/list.json'), 'utf8')).toBe('{"limit":50}')
    expect(await fs.readFile(path.join(dir, 'assets/icon.png'))).toEqual(PNG)
    expect(spies.execFile.mock.calls[0].slice(0, 2)).toEqual(['/usr/local/bin/code', [dir]])
  })

  it('reports a missing VS Code after trying every known location', async () => {
    await startApp()
    setPlatform('darwin')
    spies.execFile.mockImplementation((...args: unknown[]) => {
      const callback = args.find((arg) => typeof arg === 'function') as (err: Error) => void
      callback(Object.assign(new Error('not found'), { code: 'ENOENT' }))
    })

    const result = await invoke<IpcResult<void>>('editor:open-in-vscode', {
      appName: 'demo',
      version: '2.0.0',
      files: []
    })

    expect(result).toEqual({ success: false, error: 'VS Code not found. Install "code" CLI command.' })
    expect(spies.execFile).toHaveBeenCalledTimes(3)
  })

  it('refuses a file path that leaves the temp folder when opening in VS Code', async () => {
    await startApp()

    const result = await invoke<IpcResult<void>>('editor:open-in-vscode', {
      appName: 'demo',
      version: '2.0.0',
      files: [{ path: '../../escape.txt', content: 'x' }]
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Invalid file path/)
    expect(spies.execFile).not.toHaveBeenCalled()
  })

  const diffOpts = { filePath: 'a.json', fromVersion: '1.0.0', toVersion: '2.0.0', oldContent: '', newContent: '' }
  const zipOpts = { appName: 'demo', version: '2.0.0', files: [] }
  it.each([
    ['editor:open-in-vscode', 'appName', { ...zipOpts, appName: '../escape' }],
    ['editor:open-in-vscode', 'version', { ...zipOpts, version: '../escape' }],
    ['clipboard:copy-zip', 'appName', { ...zipOpts, appName: '../escape' }],
    ['clipboard:copy-zip', 'version', { ...zipOpts, version: '../escape' }],
    ['editor:open-diff', 'fromVersion', { ...diffOpts, fromVersion: '../escape' }],
    ['editor:open-diff', 'toVersion', { ...diffOpts, toVersion: '../escape' }]
  ])('%s rejects an invalid %s before writing anything', async (channel, field, opts) => {
    await startApp()

    const result = await invoke(channel, opts)

    expect(result).toEqual({ success: false, error: `Invalid ${field}` })
    expect(await fs.readdir(tmpRoot())).toEqual([])
    expect(spies.execFile).not.toHaveBeenCalled()
    expect(spies.writeBuffer).not.toHaveBeenCalled()
  })

  it('opens a VS Code diff of one file between two versions', async () => {
    await startApp()
    setPlatform('darwin')

    const result = await invoke<IpcResult<void>>('editor:open-diff', {
      filePath: 'modules/list.json',
      fromVersion: '1.0.0',
      toVersion: '2.0.0',
      oldContent: '{"limit":10}',
      newContent: '{"limit":50}'
    })

    const dir = path.join(tmpRoot(), 'makediff')
    expect(result).toEqual({ success: true })
    expect(await fs.readFile(path.join(dir, 'list@1.0.0.json'), 'utf8')).toBe('{"limit":10}')
    expect(await fs.readFile(path.join(dir, 'list@2.0.0.json'), 'utf8')).toBe('{"limit":50}')
    expect(spies.execFile.mock.calls[0].slice(0, 2)).toEqual([
      '/usr/local/bin/code',
      ['--diff', path.join(dir, 'list@1.0.0.json'), path.join(dir, 'list@2.0.0.json')]
    ])
  })
})
