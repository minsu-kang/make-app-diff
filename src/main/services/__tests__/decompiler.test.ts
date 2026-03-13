import { describe, it, expect } from 'vitest'
import { isCustomApp, decompileApp, decompileAccount, decompileHook } from '../decompiler'
import { ExtractedFile } from '../../types'

// Helper to find a file from result by path
function findFile(files: ExtractedFile[], path: string): ExtractedFile | undefined {
  return files.find((f) => f.path === path)
}

// Helper to parse file content as JSON
function parseFile(files: ExtractedFile[], path: string): unknown {
  const file = findFile(files, path)
  if (!file) throw new Error(`File not found: ${path}`)
  return JSON.parse(file.content)
}

// ---- isCustomApp ----

describe('isCustomApp', () => {
  it('returns true when lib/app.js exists', () => {
    expect(isCustomApp([{ path: 'lib/app.js', content: '' }])).toBe(true)
  })

  it('returns false when lib/app.js is absent', () => {
    expect(isCustomApp([{ path: 'manifest.json', content: '{}' }])).toBe(false)
  })

  it('returns false for empty array', () => {
    expect(isCustomApp([])).toBe(false)
  })
})

// ---- decompileApp ----

describe('decompileApp', () => {
  it('returns original files when manifest.json is missing', () => {
    const files: ExtractedFile[] = [{ path: 'lib/app.js', content: '' }]
    expect(decompileApp(files, 'test')).toEqual(files)
  })

  it('returns original files when manifest is invalid JSON', () => {
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: 'not json' }]
    expect(decompileApp(files, 'test')).toEqual(files)
  })

  it('generates .sdk and metadata.json from manifest', () => {
    const manifest = {
      name: 'my-app',
      label: 'My App',
      description: 'Test app',
      theme: '#FF0000'
    }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileApp(files, 'my-app')

    const sdk = parseFile(result, '.sdk')
    expect(sdk).toEqual({ version: 2 })

    const meta = parseFile(result, 'metadata.json') as Record<string, unknown>
    expect(meta.name).toBe('my-app')
    expect(meta.label).toBe('My App')
    expect(meta.description).toBe('Test app')
    expect(meta.theme).toBe('#FF0000')
    expect(meta.version).toBe(2)
  })

  it('generates groups.imljson when groups exist', () => {
    const manifest = {
      name: 'app',
      groups: [{ name: 'g1', label: 'Group 1' }]
    }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileApp(files, 'app')

    const groups = parseFile(result, 'groups.imljson')
    expect(groups).toEqual([{ name: 'g1', label: 'Group 1' }])
  })

  it('does not generate groups.imljson when groups is empty', () => {
    const manifest = { name: 'app', groups: [] }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileApp(files, 'app')

    expect(findFile(result, 'groups.imljson')).toBeUndefined()
  })

  it('separates module metadata from parameters/interface/scope', () => {
    const manifest = {
      name: 'app',
      actions: [
        {
          name: 'doSomething',
          label: 'Do Something',
          parameters: [],
          interface: [{ name: 'id', type: 'text' }],
          scope: ['some:scope']
        }
      ]
    }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileApp(files, 'app')

    const meta = parseFile(result, 'modules/doSomething/metadata.json') as Record<string, unknown>
    expect(meta.name).toBe('doSomething')
    expect(meta.label).toBe('Do Something')
    expect(meta.type).toBe('action')
    // parameters, interface, scope should NOT be in metadata
    expect(meta.parameters).toBeUndefined()
    expect(meta.interface).toBeUndefined()
    expect(meta.scope).toBeUndefined()
  })

  it('assigns correct types from manifest sections', () => {
    const manifest = {
      name: 'app',
      actions: [{ name: 'act', parameters: [] }],
      searches: [{ name: 'srch', parameters: [] }],
      triggers: [{ name: 'trg', parameters: [] }]
    }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileApp(files, 'app')

    expect((parseFile(result, 'modules/act/metadata.json') as Record<string, unknown>).type).toBe('action')
    expect((parseFile(result, 'modules/srch/metadata.json') as Record<string, unknown>).type).toBe('search')
    expect((parseFile(result, 'modules/trg/metadata.json') as Record<string, unknown>).type).toBe('trigger')
  })

  it('extracts __IMTCONN__ as connection reference', () => {
    const manifest = {
      name: 'app',
      actions: [
        {
          name: 'act',
          parameters: [{ name: '__IMTCONN__', type: 'account:my-account' }]
        }
      ]
    }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileApp(files, 'app')

    const meta = parseFile(result, 'modules/act/metadata.json') as Record<string, unknown>
    expect(meta.connection).toBe('my-account')
    expect(meta.type).toBe('action')
  })

  it('extracts __IMTHOOK__ as webhook + instant_trigger type', () => {
    const manifest = {
      name: 'app',
      triggers: [
        {
          name: 'hookTrigger',
          parameters: [
            {
              name: '__IMTHOOK__',
              type: 'hook:my-hook',
              options: { nested: [{ name: 'param1', type: 'text' }] }
            }
          ]
        }
      ]
    }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileApp(files, 'app')

    const meta = parseFile(result, 'modules/hookTrigger/metadata.json') as Record<string, unknown>
    expect(meta.type).toBe('instant_trigger')
    expect(meta.webhook).toBe('my-hook')

    // instant triggers get parameters from __IMTHOOK__ options.nested
    const params = parseFile(result, 'modules/hookTrigger/parameters.imljson')
    expect(params).toEqual([{ name: 'param1', type: 'text' }])
  })

  it('parses lib/app.js via VM and generates module api.imljson', () => {
    const manifest = {
      name: 'app',
      actions: [{ name: 'myAction', parameters: [] }]
    }
    const appJs = `
      const runtime = require('app-runtime');
      class MyAction extends runtime.ExecuteAction {
        constructor() { super(); this.api = { url: '/test', method: 'GET' }; }
      }
      module.exports = { myAction: MyAction };
    `
    const files: ExtractedFile[] = [
      { path: 'manifest.json', content: JSON.stringify(manifest) },
      { path: 'lib/app.js', content: appJs }
    ]
    const result = decompileApp(files, 'app')

    const api = parseFile(result, 'modules/myAction/api.imljson') as Record<string, unknown>
    expect(api.url).toBe('/test')
    expect(api.method).toBe('GET')
  })

  it('extracts base fields from module APIs into base.imljson', () => {
    const manifest = {
      name: 'app',
      actions: [
        { name: 'a1', parameters: [] },
        { name: 'a2', parameters: [] }
      ]
    }
    const appJs = `
      const rt = require('app-runtime');
      class A1 extends rt.ExecuteAction {
        constructor() { super(); this.api = { baseUrl: 'https://api.example.com', url: '/a1', headers: { 'x-key': '123' } }; }
      }
      class A2 extends rt.ExecuteAction {
        constructor() { super(); this.api = { baseUrl: 'https://api.example.com', url: '/a2', headers: { 'x-key': '123' } }; }
      }
      module.exports = { a1: A1, a2: A2 };
    `
    const files: ExtractedFile[] = [
      { path: 'manifest.json', content: JSON.stringify(manifest) },
      { path: 'lib/app.js', content: appJs }
    ]
    const result = decompileApp(files, 'app')

    const base = parseFile(result, 'base.imljson') as Record<string, unknown>
    expect(base.baseUrl).toBe('https://api.example.com')
    expect(base.headers).toEqual({ 'x-key': '123' })

    // Module APIs should NOT contain base fields
    const a1Api = parseFile(result, 'modules/a1/api.imljson') as Record<string, unknown>
    expect(a1Api.baseUrl).toBeUndefined()
    expect(a1Api.headers).toBeUndefined()
    expect(a1Api.url).toBe('/a1')
  })

  it('extracts common temp sub-fields to base', () => {
    const manifest = {
      name: 'app',
      actions: [
        { name: 'a1', parameters: [] },
        { name: 'a2', parameters: [] }
      ]
    }
    const appJs = `
      const rt = require('app-runtime');
      class A1 extends rt.ExecuteAction {
        constructor() { super(); this.api = { url: '/a1', temp: { shared: 'val', unique1: 'x' } }; }
      }
      class A2 extends rt.ExecuteAction {
        constructor() { super(); this.api = { url: '/a2', temp: { shared: 'val', unique2: 'y' } }; }
      }
      module.exports = { a1: A1, a2: A2 };
    `
    const files: ExtractedFile[] = [
      { path: 'manifest.json', content: JSON.stringify(manifest) },
      { path: 'lib/app.js', content: appJs }
    ]
    const result = decompileApp(files, 'app')

    const base = parseFile(result, 'base.imljson') as Record<string, unknown>
    expect((base.temp as Record<string, unknown>).shared).toBe('val')

    // Module-specific temp fields remain
    const a1Api = parseFile(result, 'modules/a1/api.imljson') as Record<string, unknown>
    expect((a1Api.temp as Record<string, unknown>).unique1).toBe('x')
    expect((a1Api.temp as Record<string, unknown>)?.shared).toBeUndefined()
  })

  it('strips iml field from API objects', () => {
    const manifest = {
      name: 'app',
      actions: [{ name: 'act', parameters: [] }]
    }
    const appJs = `
      const rt = require('app-runtime');
      class Act extends rt.ExecuteAction {
        constructor() { super(); this.api = { url: '/test', iml: { version: 1 } }; }
      }
      module.exports = { act: Act };
    `
    const files: ExtractedFile[] = [
      { path: 'manifest.json', content: JSON.stringify(manifest) },
      { path: 'lib/app.js', content: appJs }
    ]
    const result = decompileApp(files, 'app')

    const api = parseFile(result, 'modules/act/api.imljson') as Record<string, unknown>
    expect(api.iml).toBeUndefined()
  })

  it('strips metadata field from module APIs', () => {
    const manifest = {
      name: 'app',
      actions: [{ name: 'act', parameters: [] }]
    }
    const appJs = `
      const rt = require('app-runtime');
      class Act extends rt.ExecuteAction {
        constructor() { super(); this.api = { url: '/test', metadata: { deprecated: true } }; }
      }
      module.exports = { act: Act };
    `
    const files: ExtractedFile[] = [
      { path: 'manifest.json', content: JSON.stringify(manifest) },
      { path: 'lib/app.js', content: appJs }
    ]
    const result = decompileApp(files, 'app')

    const api = parseFile(result, 'modules/act/api.imljson') as Record<string, unknown>
    expect(api.metadata).toBeUndefined()
  })

  it('unwraps communication arrays', () => {
    const manifest = {
      name: 'app',
      actions: [{ name: 'act', parameters: [] }]
    }
    const appJs = `
      const rt = require('app-runtime');
      class Act extends rt.ExecuteAction {
        constructor() {
          super();
          this.api = {
            communication: [
              { url: '/step1', method: 'GET' },
              { url: '/step2', method: 'POST' }
            ]
          };
        }
      }
      module.exports = { act: Act };
    `
    const files: ExtractedFile[] = [
      { path: 'manifest.json', content: JSON.stringify(manifest) },
      { path: 'lib/app.js', content: appJs }
    ]
    const result = decompileApp(files, 'app')

    const api = parseFile(result, 'modules/act/api.imljson')
    // Should be unwrapped to array directly
    expect(Array.isArray(api)).toBe(true)
    expect((api as Record<string, unknown>[]).length).toBe(2)
    expect((api as Record<string, unknown>[])[0].url).toBe('/step1')
  })

  it('transforms RPC references in interface/expect', () => {
    const manifest = {
      name: 'my-app',
      actions: [
        {
          name: 'act',
          parameters: [
            {
              name: '__IMTCONN__',
              type: 'account:conn',
              options: { nested: { store: [{ name: 'field', rpc: 'rpc://my-app@1/listItems' }] } }
            }
          ],
          interface: [{ name: 'out', rpc: 'rpc://my-app@2/getFields' }]
        }
      ]
    }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileApp(files, 'my-app')

    const expectFile = findFile(result, 'modules/act/expect.imljson')!
    expect(expectFile.content).toContain('rpc://listItems')
    expect(expectFile.content).not.toContain('rpc://my-app@1/')

    const ifaceFile = findFile(result, 'modules/act/interface.imljson')!
    expect(ifaceFile.content).toContain('rpc://getFields')
    expect(ifaceFile.content).not.toContain('rpc://my-app@2/')
  })

  it('parses lib/rpc.js into rpcs/ directory', () => {
    const manifest = { name: 'app' }
    const rpcJs = `
      const rt = require('app-runtime');
      class ListItems extends rt.RPC.ExecuteRpc {
        constructor() { super(); this.api = { url: '/rpc/items', method: 'GET' }; }
      }
      module.exports = { listItems: ListItems };
    `
    const files: ExtractedFile[] = [
      { path: 'manifest.json', content: JSON.stringify(manifest) },
      { path: 'lib/rpc.js', content: rpcJs }
    ]
    const result = decompileApp(files, 'app')

    const rpcMeta = parseFile(result, 'rpcs/listItems/metadata.json') as Record<string, unknown>
    expect(rpcMeta.name).toBe('listItems')
    expect(rpcMeta.label).toBe('List Items')

    const rpcApi = parseFile(result, 'rpcs/listItems/api.imljson') as Record<string, unknown>
    expect(rpcApi.url).toBe('/rpc/items')
  })

  it('parses lib/functions.js into functions/ directory', () => {
    const manifest = { name: 'app' }
    const funcJs = `
      module.exports = {
        myFunc: 'function myFunc(a, b) { return a + b; }'
      };
    `
    const files: ExtractedFile[] = [
      { path: 'manifest.json', content: JSON.stringify(manifest) },
      { path: 'lib/functions.js', content: funcJs }
    ]
    const result = decompileApp(files, 'app')

    const funcFile = findFile(result, 'functions/myFunc/code.js')
    expect(funcFile).toBeDefined()
    expect(funcFile!.content).toBe('function myFunc(a, b) { return a + b; }')
  })

  it('copies asset files as-is', () => {
    const manifest = { name: 'app' }
    const files: ExtractedFile[] = [
      { path: 'manifest.json', content: JSON.stringify(manifest) },
      { path: 'assets/icon.png', content: 'binary-data' }
    ]
    const result = decompileApp(files, 'app')

    const asset = findFile(result, 'assets/icon.png')
    expect(asset).toBeDefined()
    expect(asset!.content).toBe('binary-data')
  })

  it('sorts result files alphabetically by path', () => {
    const manifest = {
      name: 'app',
      actions: [{ name: 'zAction', parameters: [] }],
      searches: [{ name: 'aSearch', parameters: [] }]
    }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileApp(files, 'app')

    const paths = result.map((f) => f.path)
    const sorted = [...paths].sort()
    expect(paths).toEqual(sorted)
  })

  it('preserves module-specific headers/log that differ from base', () => {
    const manifest = {
      name: 'app',
      actions: [
        { name: 'a1', parameters: [] },
        { name: 'a2', parameters: [] }
      ]
    }
    const appJs = `
      const rt = require('app-runtime');
      class A1 extends rt.ExecuteAction {
        constructor() {
          super();
          this.api = {
            baseUrl: 'https://api.example.com',
            url: '/a1',
            headers: { Authorization: 'Bearer {{connection.accessToken}}' },
            log: { sanitize: ['request.headers.authorization'] }
          };
        }
      }
      class A2 extends rt.ExecuteAction {
        constructor() {
          super();
          this.api = {
            baseUrl: 'https://api.example.com',
            url: '/a2',
            headers: { Authorization: 'Bearer {{connection.accessToken}}', 'X-Custom': 'val' },
            log: { sanitize: ['request.headers.authorization', 'response.body'] }
          };
        }
      }
      module.exports = { a1: A1, a2: A2 };
    `
    const files: ExtractedFile[] = [
      { path: 'manifest.json', content: JSON.stringify(manifest) },
      { path: 'lib/app.js', content: appJs }
    ]
    const result = decompileApp(files, 'app')

    const base = parseFile(result, 'base.imljson') as Record<string, unknown>
    // headers and log differ across modules, so they should NOT be in base
    expect(base.headers).toBeUndefined()
    expect(base.log).toBeUndefined()
    // baseUrl is identical, so it goes to base
    expect(base.baseUrl).toBe('https://api.example.com')

    // Module APIs should preserve their own headers and log
    const a1Api = parseFile(result, 'modules/a1/api.imljson') as Record<string, unknown>
    expect(a1Api.headers).toEqual({ Authorization: 'Bearer {{connection.accessToken}}' })
    expect(a1Api.log).toEqual({ sanitize: ['request.headers.authorization'] })

    const a2Api = parseFile(result, 'modules/a2/api.imljson') as Record<string, unknown>
    expect(a2Api.headers).toEqual({
      Authorization: 'Bearer {{connection.accessToken}}',
      'X-Custom': 'val'
    })
    expect(a2Api.log).toEqual({
      sanitize: ['request.headers.authorization', 'response.body']
    })
  })

  it('extracts response.temp.errorMessages to base when common across modules', () => {
    const manifest = {
      name: 'app',
      actions: [
        { name: 'a1', parameters: [] },
        { name: 'a2', parameters: [] }
      ]
    }
    const errorMessages = {
      '190': 'Invalid OAuth token',
      '200': 'Permissions error'
    }
    const appJs = `
      const rt = require('app-runtime');
      class A1 extends rt.ExecuteAction {
        constructor() {
          super();
          this.api = {
            url: '/a1',
            response: {
              temp: { errorMessages: ${JSON.stringify(errorMessages)}, uniqueA1: 'x' },
              output: '{{body}}'
            }
          };
        }
      }
      class A2 extends rt.ExecuteAction {
        constructor() {
          super();
          this.api = {
            url: '/a2',
            response: {
              temp: { errorMessages: ${JSON.stringify(errorMessages)}, uniqueA2: 'y' },
              output: '{{body}}'
            }
          };
        }
      }
      module.exports = { a1: A1, a2: A2 };
    `
    const files: ExtractedFile[] = [
      { path: 'manifest.json', content: JSON.stringify(manifest) },
      { path: 'lib/app.js', content: appJs }
    ]
    const result = decompileApp(files, 'app')

    const base = parseFile(result, 'base.imljson') as Record<string, unknown>
    const baseResponse = base.response as Record<string, unknown>
    expect(baseResponse).toBeDefined()
    const baseResponseTemp = baseResponse.temp as Record<string, unknown>
    expect(baseResponseTemp).toBeDefined()
    expect(baseResponseTemp.errorMessages).toEqual(errorMessages)

    // Module APIs should NOT have errorMessages in response.temp (it's in base)
    // but should keep module-specific response.temp fields
    const a1Api = parseFile(result, 'modules/a1/api.imljson') as Record<string, unknown>
    const a1Response = a1Api.response as Record<string, unknown>
    expect(a1Response).toBeDefined()
    const a1Temp = a1Response.temp as Record<string, unknown>
    expect(a1Temp.uniqueA1).toBe('x')
    expect(a1Temp.errorMessages).toBeUndefined()

    const a2Api = parseFile(result, 'modules/a2/api.imljson') as Record<string, unknown>
    const a2Response = a2Api.response as Record<string, unknown>
    const a2Temp = a2Response.temp as Record<string, unknown>
    expect(a2Temp.uniqueA2).toBe('y')
    expect(a2Temp.errorMessages).toBeUndefined()
  })

  it('only extracts base headers when identical across all modules', () => {
    const manifest = {
      name: 'app',
      actions: [
        { name: 'a1', parameters: [] },
        { name: 'a2', parameters: [] },
        { name: 'a3', parameters: [] }
      ]
    }
    const appJs = `
      const rt = require('app-runtime');
      class A1 extends rt.ExecuteAction {
        constructor() {
          super();
          this.api = {
            url: '/a1',
            headers: { Authorization: 'Bearer {{connection.accessToken}}' }
          };
        }
      }
      class A2 extends rt.ExecuteAction {
        constructor() {
          super();
          this.api = {
            url: '/a2',
            headers: { Authorization: 'Bearer {{connection.accessToken}}' }
          };
        }
      }
      class A3 extends rt.ExecuteAction {
        constructor() {
          super();
          this.api = {
            url: '/a3',
            headers: { Authorization: 'Bearer {{connection.accessToken}}' }
          };
        }
      }
      module.exports = { a1: A1, a2: A2, a3: A3 };
    `
    const files: ExtractedFile[] = [
      { path: 'manifest.json', content: JSON.stringify(manifest) },
      { path: 'lib/app.js', content: appJs }
    ]
    const result = decompileApp(files, 'app')

    const base = parseFile(result, 'base.imljson') as Record<string, unknown>
    // All modules have identical headers, so it should be in base
    expect(base.headers).toEqual({ Authorization: 'Bearer {{connection.accessToken}}' })

    // Modules should not have headers since they match base
    const a1Api = parseFile(result, 'modules/a1/api.imljson') as Record<string, unknown>
    expect(a1Api.headers).toBeUndefined()
  })
})

// ---- decompileAccount ----

describe('decompileAccount', () => {
  it('returns original files when manifest.json is missing', () => {
    const files: ExtractedFile[] = [{ path: 'lib/account.js', content: '' }]
    expect(decompileAccount(files)).toEqual(files)
  })

  it('extracts metadata, parameters, scope from manifest', () => {
    const manifest = {
      name: 'my-conn',
      label: 'My Connection',
      type: 'oauth2',
      parameters: [{ name: 'apiKey', type: 'text' }],
      scope: ['read', 'write'],
      scopes: { read: 'Read access', write: 'Write access' }
    }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileAccount(files)

    const meta = parseFile(result, 'metadata.json') as Record<string, unknown>
    expect(meta.name).toBe('my-conn')
    expect(meta.label).toBe('My Connection')
    expect(meta.type).toBe('oauth2')

    expect(parseFile(result, 'parameters.imljson')).toEqual([{ name: 'apiKey', type: 'text' }])
    expect(parseFile(result, 'scope.imljson')).toEqual(['read', 'write'])
    expect(parseFile(result, 'scopes.imljson')).toEqual({ read: 'Read access', write: 'Write access' })
  })

  it('extracts API from lib/account.js via VM', () => {
    const manifest = { name: 'conn', label: 'Conn', type: 'basic' }
    const accountJs = `
      const Base = require('imt_accounts/base');
      class Account extends Base {
        constructor() { super(); this.api = { url: '/auth', method: 'POST' }; }
      }
      module.exports = Account;
    `
    const files: ExtractedFile[] = [
      { path: 'manifest.json', content: JSON.stringify(manifest) },
      { path: 'lib/account.js', content: accountJs }
    ]
    const result = decompileAccount(files)

    const api = parseFile(result, 'api.imljson') as Record<string, unknown>
    expect(api.url).toBe('/auth')
    expect(api.method).toBe('POST')
  })

  it('defaults to empty objects/arrays for missing fields', () => {
    const manifest = { name: 'conn' }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileAccount(files)

    expect(parseFile(result, 'parameters.imljson')).toEqual([])
    expect(parseFile(result, 'scope.imljson')).toEqual([])
    expect(parseFile(result, 'scopes.imljson')).toEqual({})
    expect(parseFile(result, 'api.imljson')).toEqual({})
  })
})

// ---- decompileHook ----

describe('decompileHook', () => {
  it('returns original files when manifest.json is missing', () => {
    const files: ExtractedFile[] = [{ path: 'lib/hook.js', content: '' }]
    expect(decompileHook(files)).toEqual(files)
  })

  it('extracts __IMTCONN__ connection from parameters', () => {
    const manifest = {
      name: 'my-hook',
      label: 'My Hook',
      type: 'web',
      parameters: [
        {
          name: '__IMTCONN__',
          type: 'account:my-conn',
          options: {
            nested: [{ name: 'url', type: 'text' }],
            scope: ['webhook']
          }
        }
      ]
    }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileHook(files)

    const meta = parseFile(result, 'metadata.json') as Record<string, unknown>
    expect(meta.connection).toBe('my-conn')
    expect(meta.name).toBe('my-hook')
    expect(meta.type).toBe('web')

    expect(parseFile(result, 'parameters.imljson')).toEqual([{ name: 'url', type: 'text' }])
    expect(parseFile(result, 'scope.imljson')).toEqual(['webhook'])
  })

  it('generates default attach/detach/update files', () => {
    const manifest = { name: 'hook', label: 'Hook', type: 'web' }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileHook(files)

    expect(parseFile(result, 'attach.imljson')).toEqual({})
    expect(parseFile(result, 'detach.imljson')).toEqual({})
    expect(parseFile(result, 'update.imljson')).toEqual({})
  })

  it('extracts API from lib/hook.js via VM', () => {
    const manifest = { name: 'hook', label: 'Hook', type: 'web' }
    const hookJs = `
      const Base = require('imt_hooks/base');
      class Hook extends Base {
        constructor() { super(); this.api = { url: '/webhook', method: 'POST' }; }
      }
      module.exports = Hook;
    `
    const files: ExtractedFile[] = [
      { path: 'manifest.json', content: JSON.stringify(manifest) },
      { path: 'lib/hook.js', content: hookJs }
    ]
    const result = decompileHook(files)

    const api = parseFile(result, 'api.imljson') as Record<string, unknown>
    expect(api.url).toBe('/webhook')
  })

  it('defaults to null connection when no __IMTCONN__', () => {
    const manifest = { name: 'hook', label: 'Hook', type: 'web', parameters: [] }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileHook(files)

    const meta = parseFile(result, 'metadata.json') as Record<string, unknown>
    expect(meta.connection).toBeNull()
  })
})
