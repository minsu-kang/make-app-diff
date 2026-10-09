import * as http from 'http'
import type { AddressInfo } from 'net'
import Pkr from 'pkr'

export const VALID_TOKEN = 'e2e-valid-token'

type PkrBuilder = new () => { files: { path: string; data: Buffer }[]; packSync(): Buffer }

function buildPkr(files: Record<string, string | Buffer>): Buffer {
  const pkr = new (Pkr as unknown as PkrBuilder)()
  for (const [filePath, data] of Object.entries(files)) {
    pkr.files.push({ path: filePath, data: Buffer.isBuffer(data) ? data : Buffer.from(data) })
  }
  return pkr.packSync()
}

/** A valid 1x1 PNG */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

interface FakeApp {
  name: string
  label: string
  theme: string
  versions: string[]
  files: Record<string, Record<string, string | Buffer>>
  accounts?: string[]
}

const acmeFiles = (limit: number, extra: Record<string, string>, drop: string[] = []) => {
  const files: Record<string, string | Buffer> = {
    'manifest.json': JSON.stringify({ name: 'acme', label: 'Acme CRM', version: limit }),
    'modules/list.json': JSON.stringify({ limit }),
    'modules/old.json': JSON.stringify({ gone: true }),
    'assets/icon.png': PNG,
    'readme.txt': 'same\n',
    ...extra
  }
  for (const name of drop) delete files[name]
  return files
}

const APPS: FakeApp[] = [
  {
    name: 'acme',
    label: 'Acme CRM',
    theme: '#ff6600',
    versions: ['1.0.0', '1.1.0', '1.2.0'],
    files: {
      '1.0.0': acmeFiles(10, {}),
      '1.1.0': acmeFiles(20, {}),
      '1.2.0': acmeFiles(50, { 'modules/new.json': JSON.stringify({ added: true }) }, ['modules/old.json'])
    }
  },
  {
    name: 'acme-mail',
    label: 'Acme Mail',
    theme: '#0066ff',
    versions: ['1.0.0'],
    files: { '1.0.0': acmeFiles(1, {}) },
    accounts: ['acme-conn']
  },
  {
    name: 'acme-docs',
    label: 'Acme Docs',
    theme: '#00aa66',
    versions: ['1.0.0'],
    files: { '1.0.0': acmeFiles(2, {}) }
  },
  { name: 'zeta', label: 'Zeta Tools', theme: '#aa00ff', versions: ['3.0.0'], files: { '3.0.0': acmeFiles(3, {}) } }
]

export interface FakeIpm {
  /** `http://127.0.0.1:<port>` */
  url: string
  /** How many apps `/search/apps` lists */
  appCount: number
  /** Every request as `GET /path`, in order */
  requests: string[]
  close(): Promise<void>
}

/** Serves the IPM endpoints the app uses, with real PKR archives. A request needs the valid token in x-imt-token */
export async function startFakeIpm(): Promise<FakeIpm> {
  const requests: string[] = []

  const server = http.createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    requests.push(`${req.method} ${path}`)
    const json = (status: number, body: unknown): void => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    const binary = (body: Buffer, type = 'application/octet-stream'): void => {
      res.writeHead(200, { 'Content-Type': type })
      res.end(body)
    }

    if (req.headers['x-imt-token'] !== VALID_TOKEN) return json(403, { error: 'invalid token' })

    if (path === '/v3/info/google-drive') return json(200, {})
    if (path === '/search/apps') {
      return json(
        200,
        APPS.map((a) => ({
          name: a.name,
          label: a.label,
          theme: a.theme,
          version: a.versions[a.versions.length - 1],
          availableVersions: a.versions
        }))
      )
    }
    const info = path.match(/^\/v3\/info\/([^/]+)$/)
    if (info) {
      const app = APPS.find((a) => a.name === info[1])
      if (!app) return json(404, {})
      return json(200, {
        name: app.name,
        label: app.label,
        description: `${app.label} for the E2E suite`,
        version: app.versions[app.versions.length - 1],
        versions: app.versions,
        meta: { theme: app.theme }
      })
    }
    const manifest = path.match(/^\/manifest\/app\/([^/]+)\/([^/]+)$/)
    if (manifest) {
      const app = APPS.find((a) => a.name === manifest[1])
      if (!app?.files[manifest[2]]) return json(404, {})
      return json(200, { name: app.name, label: app.label, dependencies: { accounts: app.accounts ?? [], hooks: [] } })
    }
    const sync = path.match(/^\/v3\/sync\/app\/([^/]+)\/([^/]+)$/)
    if (sync) {
      const files = APPS.find((a) => a.name === sync[1])?.files[sync[2]]
      if (!files) return json(404, {})
      return binary(buildPkr(files))
    }
    if (/^\/v3\/sync\/account\/[^/]+\/[^/]+$/.test(path)) return binary(buildPkr({ 'common.json': '[]' }))
    if (path.startsWith('/admin/icon/apps/')) return binary(PNG, 'image/png')
    return json(404, {})
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    appCount: APPS.length,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
