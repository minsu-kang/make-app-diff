import { describe, it, expect } from 'vitest'
import { isCustomApp, decompileApp, decompileAccount, decompileHook } from '../decompiler'
import { parseCompiledJs } from '../decompiler-sandbox'
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

  it('parses lib/app.js (real const api = <literal> + Object.defineProperty idiom) into module api.imljson', () => {
    const manifest = {
      name: 'app',
      actions: [{ name: 'myAction', parameters: [] }]
    }
    const appJs = `
      class MyAction extends ExecuteAction {
        constructor() {
          super();
          const api = { url: '/test', method: 'GET' };
          if (api) api.iml = {functions: require('./functions')};
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
        }
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

  it('reads api from the legacy this.api = <literal> assignment shape (defensive path, real compiler never emits it)', () => {
    const manifest = {
      name: 'app',
      actions: [{ name: 'act', parameters: [] }]
    }
    const appJs = `
      class Act extends ExecuteAction {
        constructor() {
          super();
          this.api = { url: '/legacy', method: 'GET' };
        }
      }
      module.exports = { act: Act };
    `
    const files: ExtractedFile[] = [
      { path: 'manifest.json', content: JSON.stringify(manifest) },
      { path: 'lib/app.js', content: appJs }
    ]
    const result = decompileApp(files, 'app')

    const api = parseFile(result, 'modules/act/api.imljson') as Record<string, unknown>
    expect(api.url).toBe('/legacy')
    expect(api.method).toBe('GET')
  })

  it('resolves the const api = null shape (real production shape, e.g. slack ExecuteHookTrigger classes) to an empty api.imljson', () => {
    const manifest = {
      name: 'app',
      actions: [{ name: 'watchInteractivityEvents', parameters: [] }]
    }
    const appJs = `
      class watchInteractivityEvents extends ExecuteHookTrigger {
        constructor() {
          super();
          const api = null;
          if (api) api.iml = {functions: require('./functions')};
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
        }
      }
      module.exports = { watchInteractivityEvents };
    `
    const files: ExtractedFile[] = [
      { path: 'manifest.json', content: JSON.stringify(manifest) },
      { path: 'lib/app.js', content: appJs }
    ]
    const result = decompileApp(files, 'app')

    const api = parseFile(result, 'modules/watchInteractivityEvents/api.imljson')
    expect(api).toEqual({})
  })

  it('falls back to raw compiled files, synchronously and without throwing, when app.js contains a non-static construct', () => {
    const manifest = {
      name: 'app',
      actions: [{ name: 'act', parameters: [] }]
    }
    const appJs = `
      class Act extends ExecuteAction {
        constructor() {
          super();
          const api = buildApi();
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
        }
      }
      module.exports = { act: Act };
    `
    const files: ExtractedFile[] = [
      { path: 'manifest.json', content: JSON.stringify(manifest) },
      { path: 'lib/app.js', content: appJs }
    ]

    const result = decompileApp(files, 'app')

    // buildApi() isn't statically resolvable, so the whole file bails to the raw
    // compiled input rather than a partially-decompiled SDK structure
    expect(result).toEqual(files)
    expect(findFile(result, 'modules/act/api.imljson')).toBeUndefined()
  })

  it('parseCompiledJs throws on the same non-static construct', () => {
    const appJs = `
      class Act extends ExecuteAction {
        constructor() {
          super();
          const api = buildApi();
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
        }
      }
      module.exports = { act: Act };
    `
    expect(() => parseCompiledJs(appJs)).toThrow()
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
      class A1 extends ExecuteAction {
        constructor() {
          super();
          const api = { baseUrl: 'https://api.example.com', url: '/a1', headers: { 'x-key': '123' } };
          if (api) api.iml = {functions: require('./functions')};
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
        }
      }
      class A2 extends ExecuteAction {
        constructor() {
          super();
          const api = { baseUrl: 'https://api.example.com', url: '/a2', headers: { 'x-key': '123' } };
          if (api) api.iml = {functions: require('./functions')};
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
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
      class A1 extends ExecuteAction {
        constructor() {
          super();
          const api = { url: '/a1', temp: { shared: 'val', unique1: 'x' } };
          if (api) api.iml = {functions: require('./functions')};
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
        }
      }
      class A2 extends ExecuteAction {
        constructor() {
          super();
          const api = { url: '/a2', temp: { shared: 'val', unique2: 'y' } };
          if (api) api.iml = {functions: require('./functions')};
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
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
      class Act extends ExecuteAction {
        constructor() {
          super();
          const api = { url: '/test', iml: { version: 1 } };
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
        }
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
      class Act extends ExecuteAction {
        constructor() {
          super();
          const api = { url: '/test', metadata: { deprecated: true } };
          if (api) api.iml = {functions: require('./functions')};
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
        }
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
      class Act extends ExecuteAction {
        constructor() {
          super();
          const api = {
            communication: [
              { url: '/step1', method: 'GET' },
              { url: '/step2', method: 'POST' }
            ]
          };
          if (api) api.iml = {functions: require('./functions')};
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
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

  it('reads expect.imljson from top-level rawItem.expect', () => {
    const manifest = {
      name: 'app',
      actions: [
        {
          name: 'act',
          parameters: [],
          expect: [{ name: 'text', type: 'text', label: 'Text' }]
        }
      ]
    }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileApp(files, 'app')

    const expectData = parseFile(result, 'modules/act/expect.imljson')
    expect(expectData).toEqual([{ name: 'text', type: 'text', label: 'Text' }])
  })

  it('prefers rawItem.expect over __IMTCONN__ nested.store when both present', () => {
    const manifest = {
      name: 'app',
      actions: [
        {
          name: 'act',
          parameters: [
            {
              name: '__IMTCONN__',
              type: 'account:conn',
              options: { nested: { store: [{ name: 'fromNestedStore', type: 'text' }] } }
            }
          ],
          expect: [{ name: 'fromRawExpect', type: 'text' }]
        }
      ]
    }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileApp(files, 'app')

    const expectFile = findFile(result, 'modules/act/expect.imljson')!
    expect(expectFile.content).toContain('fromRawExpect')
    expect(expectFile.content).not.toContain('fromNestedStore')
  })

  it('falls back to __IMTCONN__ nested.store when rawItem.expect is absent', () => {
    const manifest = {
      name: 'app',
      actions: [
        {
          name: 'act',
          parameters: [
            {
              name: '__IMTCONN__',
              type: 'account:conn',
              options: { nested: { store: [{ name: 'fromNestedStore', type: 'text' }] } }
            }
          ]
        }
      ]
    }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileApp(files, 'app')

    const expectData = parseFile(result, 'modules/act/expect.imljson')
    expect(expectData).toEqual([{ name: 'fromNestedStore', type: 'text' }])
  })

  it('falls back to __IMTCONN__ nested.store when rawItem.expect is an empty array', () => {
    const manifest = {
      name: 'app',
      actions: [
        {
          name: 'act',
          parameters: [
            {
              name: '__IMTCONN__',
              type: 'account:conn',
              options: { nested: { store: [{ name: 'fromNestedStore', type: 'text' }] } }
            }
          ],
          expect: []
        }
      ]
    }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileApp(files, 'app')

    const expectData = parseFile(result, 'modules/act/expect.imljson')
    expect(expectData).toEqual([{ name: 'fromNestedStore', type: 'text' }])
  })

  it.each([
    ['object', { foo: 'bar' }],
    ['string', 'not-an-array']
  ])('falls through to nested store when rawItem.expect is a non-array (%s)', (_label, expectValue) => {
    const manifest = {
      name: 'app',
      actions: [
        {
          name: 'act',
          parameters: [
            {
              name: '__IMTCONN__',
              type: 'account:conn',
              options: { nested: { store: [{ name: 'fromNestedStore', type: 'text' }] } }
            }
          ],
          expect: expectValue
        }
      ]
    }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileApp(files, 'app')

    const expectData = parseFile(result, 'modules/act/expect.imljson')
    expect(expectData).toEqual([{ name: 'fromNestedStore', type: 'text' }])
  })

  it('resolves to an empty array when rawItem.expect is non-array and no nested store exists', () => {
    const manifest = {
      name: 'app',
      actions: [
        {
          name: 'act',
          parameters: [],
          expect: { foo: 'bar' }
        }
      ]
    }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileApp(files, 'app')

    const expectData = parseFile(result, 'modules/act/expect.imljson')
    expect(expectData).toEqual([])
  })

  it('resolves the dominant anthropic-claude shape: empty top-level expect with fields in __IMTCONN__ nested.store', () => {
    const manifest = {
      name: 'anthropic-claude',
      actions: [
        {
          name: 'createAMessage',
          parameters: [
            {
              name: '__IMTCONN__',
              type: 'account:conn',
              options: {
                nested: {
                  store: [
                    { name: 'model', type: 'select' },
                    { name: 'maxTokens', type: 'number' },
                    { name: 'messages', type: 'array' }
                  ]
                }
              }
            }
          ],
          expect: []
        }
      ]
    }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileApp(files, 'anthropic-claude')

    const expectData = parseFile(result, 'modules/createAMessage/expect.imljson') as Record<string, unknown>[]
    expect(expectData.map((f) => f.name)).toEqual(['model', 'maxTokens', 'messages'])
  })

  it('transforms RPC references in a top-level rawItem.expect field', () => {
    const manifest = {
      name: 'anthropic-claude',
      actions: [
        {
          name: 'simpleTextPrompt',
          parameters: [],
          expect: [
            {
              name: 'model',
              type: 'select',
              options: { store: 'rpc://anthropic-claude@1/getTextPromptField' }
            }
          ]
        }
      ]
    }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileApp(files, 'anthropic-claude')

    const expectFile = findFile(result, 'modules/simpleTextPrompt/expect.imljson')!
    expect(expectFile.content).toContain('rpc://getTextPromptField')
    expect(expectFile.content).not.toContain('rpc://anthropic-claude@1/')
  })

  it('does not emit expect.imljson for trigger modules even when rawItem.expect is present', () => {
    const manifest = {
      name: 'app',
      triggers: [
        {
          name: 'trg',
          parameters: [],
          expect: [{ name: 'field', type: 'text' }]
        }
      ]
    }
    const files: ExtractedFile[] = [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
    const result = decompileApp(files, 'app')

    expect(findFile(result, 'modules/trg/expect.imljson')).toBeUndefined()
  })

  it('parses lib/rpc.js into rpcs/ directory', () => {
    const manifest = { name: 'app' }
    const rpcJs = `
      class ListItems extends ExecuteRpc {
        constructor() {
          super();
          const api = { url: '/rpc/items', method: 'GET' };
          if (api) api.iml = {functions: require('./functions')};
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
        }
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

  it('resolves a quoted-string-key rpc.js export map (real trello shape) with shorthand and colon-prefixed keys', () => {
    const manifest = {
      name: 'app',
      actions: [{ name: 'watchActivities', parameters: [] }]
    }
    const rpcJs = `
      class getBoardLists2 extends ExecuteRpc {
        constructor() {
          super();
          const api = { url: '/boards/lists', method: 'GET' };
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
        }
      }
      class epochModule44 extends ExecuteRpc {
        constructor() {
          super();
          const api = { url: '/activities/epoch', method: 'GET' };
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
        }
      }
      module.exports = {
        getBoardLists2,
        'epoch:watchActivities': epochModule44
      };
    `
    const files: ExtractedFile[] = [
      { path: 'manifest.json', content: JSON.stringify(manifest) },
      { path: 'lib/rpc.js', content: rpcJs }
    ]
    const result = decompileApp(files, 'app')

    const rpcApi = parseFile(result, 'rpcs/getBoardLists2/api.imljson') as Record<string, unknown>
    expect(rpcApi.url).toBe('/boards/lists')

    const epochApi = parseFile(result, 'modules/watchActivities/epoch.imljson') as Record<string, unknown>
    expect(epochApi.url).toBe('/activities/epoch')
  })

  it('parses lib/functions.js string-literal exports (real anthropic-claude shape) into functions/ directory', () => {
    const manifest = { name: 'app' }
    const funcJs = `
      module.exports = {
        buildFallbackModelOptions: "function buildFallbackModelOptions(model, models = []) { return models[0] || model; }"
      };
    `
    const files: ExtractedFile[] = [
      { path: 'manifest.json', content: JSON.stringify(manifest) },
      { path: 'lib/functions.js', content: funcJs }
    ]
    const result = decompileApp(files, 'app')

    const funcFile = findFile(result, 'functions/buildFallbackModelOptions/code.js')
    expect(funcFile).toBeDefined()
    expect(funcFile!.content).toBe(
      'function buildFallbackModelOptions(model, models = []) { return models[0] || model; }'
    )
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
      class A1 extends ExecuteAction {
        constructor() {
          super();
          const api = {
            baseUrl: 'https://api.example.com',
            url: '/a1',
            headers: { Authorization: 'Bearer {{connection.accessToken}}' },
            log: { sanitize: ['request.headers.authorization'] }
          };
          if (api) api.iml = {functions: require('./functions')};
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
        }
      }
      class A2 extends ExecuteAction {
        constructor() {
          super();
          const api = {
            baseUrl: 'https://api.example.com',
            url: '/a2',
            headers: { Authorization: 'Bearer {{connection.accessToken}}', 'X-Custom': 'val' },
            log: { sanitize: ['request.headers.authorization', 'response.body'] }
          };
          if (api) api.iml = {functions: require('./functions')};
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
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
      class A1 extends ExecuteAction {
        constructor() {
          super();
          const api = {
            url: '/a1',
            response: {
              temp: { errorMessages: ${JSON.stringify(errorMessages)}, uniqueA1: 'x' },
              output: '{{body}}'
            }
          };
          if (api) api.iml = {functions: require('./functions')};
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
        }
      }
      class A2 extends ExecuteAction {
        constructor() {
          super();
          const api = {
            url: '/a2',
            response: {
              temp: { errorMessages: ${JSON.stringify(errorMessages)}, uniqueA2: 'y' },
              output: '{{body}}'
            }
          };
          if (api) api.iml = {functions: require('./functions')};
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
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
      class A1 extends ExecuteAction {
        constructor() {
          super();
          const api = {
            url: '/a1',
            headers: { Authorization: 'Bearer {{connection.accessToken}}' }
          };
          if (api) api.iml = {functions: require('./functions')};
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
        }
      }
      class A2 extends ExecuteAction {
        constructor() {
          super();
          const api = {
            url: '/a2',
            headers: { Authorization: 'Bearer {{connection.accessToken}}' }
          };
          if (api) api.iml = {functions: require('./functions')};
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
        }
      }
      class A3 extends ExecuteAction {
        constructor() {
          super();
          const api = {
            url: '/a3',
            headers: { Authorization: 'Bearer {{connection.accessToken}}' }
          };
          if (api) api.iml = {functions: require('./functions')};
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
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

  it('extracts API from lib/account.js (real stripe single-class-export idiom)', () => {
    const manifest = { name: 'conn', label: 'Conn', type: 'basic' }
    const accountJs = `
      const Account = require('imt_accounts/app-runtime-basic');
      class Connection extends Account {
        constructor() {
          super();
          const api = { url: 'https://api.stripe.com/v1/balance', method: 'GET' };
          if (api) api.iml = {functions: require('./functions')};
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
        }
      }
      module.exports = Connection;
    `
    const files: ExtractedFile[] = [
      { path: 'manifest.json', content: JSON.stringify(manifest) },
      { path: 'lib/account.js', content: accountJs }
    ]
    const result = decompileAccount(files)

    const api = parseFile(result, 'api.imljson') as Record<string, unknown>
    expect(api.url).toBe('https://api.stripe.com/v1/balance')
    expect(api.method).toBe('GET')
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

  it('extracts API from lib/hook.js (real const api = <literal> + Object.defineProperty idiom)', () => {
    const manifest = { name: 'hook', label: 'Hook', type: 'web' }
    const hookJs = `
      const Base = require('imt_hooks/base');
      class Hook extends Base {
        constructor() {
          super();
          const api = { url: '/webhook', method: 'POST' };
          if (api) api.iml = {functions: require('./functions')};
          Object.defineProperty(this, 'api', {get: () => api, set: () => null});
        }
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
