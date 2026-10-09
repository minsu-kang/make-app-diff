import { afterEach, beforeEach, vi } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { inflateRawSync } from 'zlib'
import nock from 'nock'
import Pkr from 'pkr'
import type { IpcResult, IpmSettings } from '../../types'

type Handler = (event: unknown, ...args: unknown[]) => unknown

// Only the Electron shell, the key-value store backing and the OS tool launchers are faked. The IPC handlers,
// IpmClient (axios), PKR extraction, decompiler, diff and storage code all run for real against a faked IPM server.
const m = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  tmp: '',
  showOpenDialog: vi.fn(),
  writeBuffer: vi.fn(),
  showItemInFolder: vi.fn(),
  execFile: vi.fn(),
  enableMenuItems: vi.fn(),
  disableMenuItems: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: Handler) => m.handlers.set(channel, fn) },
  dialog: { showOpenDialog: m.showOpenDialog },
  shell: { showItemInFolder: m.showItemInFolder },
  clipboard: { writeBuffer: m.writeBuffer }
}))

vi.mock('electron-store', () => ({
  default: class MemoryStore {
    private data: Record<string, unknown>
    constructor({ defaults }: { defaults: Record<string, unknown> }) {
      this.data = structuredClone(defaults)
    }
    get(key: string): unknown {
      return this.data[key]
    }
    set(key: string, value: unknown): void {
      this.data[key] = structuredClone(value)
    }
  }
}))

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>()
  return { ...actual, tmpdir: () => m.tmp || actual.tmpdir() }
})

vi.mock('child_process', () => ({ execFile: m.execFile }))
vi.mock('../../index', () => ({ enableMenuItems: m.enableMenuItems, disableMenuItems: m.disableMenuItems }))

export const spies = {
  showOpenDialog: m.showOpenDialog,
  writeBuffer: m.writeBuffer,
  showItemInFolder: m.showItemInFolder,
  execFile: m.execFile,
  enableMenuItems: m.enableMenuItems,
  disableMenuItems: m.disableMenuItems
}

/** The temp directory every `os.tmpdir()` call returns while a test runs */
export function tmpRoot(): string {
  return m.tmp
}

export const PROD_HOST = 'ipm.integromat.com'

export const settings: IpmSettings = {
  host: PROD_HOST,
  ipmToken: 'token-prod',
  ipmeToken: 'token-staging',
  env: 'production',
  ipmVersion: '3.21.0'
}

/** Nock scope for an IPM host */
export function ipm(host: string = PROD_HOST): nock.Scope {
  return nock(`https://${host}`)
}

type PkrBuilder = new () => { files: { path: string; data: Buffer }[]; packSync(): Buffer }

/** Builds a real PKR archive from path -> content */
export function buildPkr(files: Record<string, string | Buffer>): Buffer {
  const pkr = new (Pkr as unknown as PkrBuilder)()
  for (const [filePath, data] of Object.entries(files)) {
    pkr.files.push({ path: filePath, data: Buffer.isBuffer(data) ? data : Buffer.from(data) })
  }
  return pkr.packSync()
}

export const binaryReply = { 'Content-Type': 'application/octet-stream' }

/** A valid 1x1 PNG, so image handling sees real image bytes */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

/** Reads a ZIP (entry name -> bytes) through its central directory, which also holds the sizes of streamed entries */
export function readZip(zip: Buffer): Record<string, Buffer> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = zip.readUInt16LE(end + 10)
  const entries: Record<string, Buffer> = {}
  let offset = zip.readUInt32LE(end + 16)
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(offset + 10)
    const size = zip.readUInt32LE(offset + 20)
    const nameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    const local = zip.readUInt32LE(offset + 42)
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength)
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    const data = zip.subarray(start, start + size)
    entries[name] = method === 8 ? inflateRawSync(data) : data
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

export function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

const realPlatform = process.platform

// The handlers swallow failed dependency downloads, so a request nobody declared must fail the test on its own
const unmatched: string[] = []
nock.emitter.on('no match', (req: { method?: string; path?: string; getHeader?: (name: string) => unknown }) => {
  unmatched.push(`${req.method} https://${req.getHeader?.('host') ?? 'unknown-host'}${req.path}`)
})

beforeEach(async () => {
  unmatched.length = 0
  m.tmp = ''
  m.tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'makediff-it-'))
  nock.disableNetConnect()
  m.handlers.clear()
  for (const spy of Object.values(spies)) spy.mockReset()
  // VS Code and PowerShell launch succeed unless a test says otherwise
  m.execFile.mockImplementation((...args: unknown[]) => {
    const callback = args.find((arg) => typeof arg === 'function') as (err: Error | null) => void
    callback(null)
  })
  m.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
})

afterEach(async () => {
  const pending = nock.pendingMocks()
  nock.cleanAll()
  nock.enableNetConnect()
  setPlatform(realPlatform)
  vi.useRealTimers()
  await fs.rm(m.tmp, { recursive: true, force: true })
  m.tmp = ''
  if (unmatched.length > 0) throw new Error(`IPM requests that were made but never declared:\n${unmatched.join('\n')}`)
  if (pending.length > 0) throw new Error(`IPM requests that were declared but never made:\n${pending.join('\n')}`)
})

/** Fresh module state (caches, client) for every test, then registers the real IPC handlers */
export async function startApp(options: { ipmBaseUrl?: string } = {}): Promise<void> {
  vi.resetModules()
  const { registerIpcHandlers } = await import('../../ipc-handlers')
  registerIpcHandlers(options)
}

export async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = m.handlers.get(channel)
  if (!handler) throw new Error(`No IPC handler registered for ${channel}`)
  return (await handler({}, ...args)) as T
}

/** Saves valid settings through the real `settings:save` handler (the connection test answers 200) */
export async function connect(overrides: Partial<IpmSettings> = {}): Promise<IpmSettings> {
  const next = { ...settings, ...overrides }
  ipm(next.host).get('/v3/info/google-drive').reply(200, {})
  const result = await invoke<IpcResult<void>>('settings:save', next)
  if (!result.success) throw new Error(`settings:save failed: ${result.error}`)
  return next
}

/** Declares the PKR download and the manifest of an app version; `token` also requires that x-imt-token */
export function mockApp(
  name: string,
  version: string,
  files: Record<string, string | Buffer>,
  manifest: object = {},
  token?: string
): void {
  const scope = (): nock.Scope => {
    const next = ipm()
    return token ? next.matchHeader('x-imt-token', token) : next
  }
  scope().get(`/v3/sync/app/${name}/${version}`).reply(200, buildPkr(files), binaryReply)
  scope()
    .get(`/manifest/app/${name}/${version}`)
    .reply(200, { name, ...manifest })
}
