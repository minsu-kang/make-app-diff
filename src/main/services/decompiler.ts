import * as vm from 'vm'
import { ExtractedFile } from '../types'

// Fields that belong in base.imljson (common across all modules)
const BASE_TOP_FIELDS = ['baseUrl', 'headers', 'timeout', 'log']
const BASE_RESPONSE_FIELDS = ['error']

/**
 * Check if extracted files represent a custom (compiled) app
 */
export function isCustomApp(files: ExtractedFile[]): boolean {
  return files.some((f) => f.path === 'lib/app.js')
}

/**
 * Decompile a compiled custom app into SDK structure.
 * On error, returns original files as fallback.
 */
export function decompileApp(files: ExtractedFile[], appName: string): ExtractedFile[] {
  try {
    return doDecompileApp(files, appName)
  } catch {
    return files
  }
}

/**
 * Decompile account files into connection SDK structure.
 * On error, returns original files as fallback.
 */
export function decompileAccount(files: ExtractedFile[]): ExtractedFile[] {
  try {
    return doDecompileAccount(files)
  } catch {
    return files
  }
}

/**
 * Decompile hook files into webhook SDK structure.
 * On error, returns original files as fallback.
 */
export function decompileHook(files: ExtractedFile[]): ExtractedFile[] {
  try {
    return doDecompileHook(files)
  } catch {
    return files
  }
}

// ---- App decompilation ----

// Fields that go into separate files, not metadata.json
const MODULE_SEPARATE_FIELDS = new Set(['parameters', 'interface', 'scope', 'expect'])

interface ModuleDef {
  name: string
  type: string
  connection: string | null
  webhook: string | null
  rawItem: Record<string, unknown>
}

function doDecompileApp(files: ExtractedFile[], appName: string): ExtractedFile[] {
  const result: ExtractedFile[] = []

  const manifestFile = files.find((f) => f.path === 'manifest.json')
  if (!manifestFile) return files
  const manifest = JSON.parse(manifestFile.content)

  // .sdk
  result.push(makeFile('.sdk', { version: 2 }))

  // metadata.json — top-level fields + SDK version
  const metadata: Record<string, unknown> = {}
  for (const key of ['name', 'label', 'description', 'theme']) {
    if (manifest[key] !== undefined) metadata[key] = manifest[key]
  }
  metadata.version = 2
  result.push(makeFile('metadata.json', metadata))

  // groups.imljson
  if (manifest.groups && manifest.groups.length > 0) {
    result.push(makeFile('groups.imljson', manifest.groups))
  }

  // Parse compiled JS files
  const appJsFile = files.find((f) => f.path === 'lib/app.js')
  const moduleApis = appJsFile ? parseCompiledJs(appJsFile.content) : {}

  const rpcJsFile = files.find((f) => f.path === 'lib/rpc.js')
  const rpcApis = rpcJsFile ? parseCompiledJs(rpcJsFile.content) : {}

  const functionsJsFile = files.find((f) => f.path === 'lib/functions.js')
  const functions = functionsJsFile ? parseFunctions(functionsJsFile.content) : {}

  // Collect module definitions from manifest
  const modules: ModuleDef[] = []

  for (const [section, moduleType] of [
    ['actions', 'action'],
    ['searches', 'search'],
    ['triggers', 'trigger']
  ] as const) {
    for (const item of manifest[section] || []) {
      let type = moduleType as string
      let connection: string | null = null
      let webhook: string | null = null

      // Extract connection/webhook reference from first parameter
      const firstParam = (item.parameters || [])[0] as Record<string, unknown> | undefined
      if (firstParam) {
        const paramType = (firstParam.type as string) || ''
        if (firstParam.name === '__IMTCONN__' && paramType.startsWith('account:')) {
          connection = paramType.replace('account:', '')
        } else if (firstParam.name === '__IMTHOOK__' && paramType.startsWith('hook:')) {
          webhook = paramType.replace('hook:', '')
          type = 'instant_trigger'
        }
      }

      modules.push({
        name: item.name,
        type,
        connection,
        webhook,
        rawItem: item
      })
    }
  }

  // Extract base.imljson by scanning ALL modules' APIs
  const allApis = modules
    .map((m) => moduleApis[m.name] as Record<string, unknown> | undefined)
    .filter((a): a is Record<string, unknown> => !!a)
  const baseConfig = extractBaseFromAll(allApis)

  if (Object.keys(baseConfig).length > 0) {
    result.push(makeFile('base.imljson', baseConfig))
  }

  // Store cleaned module APIs for epoch deduplication
  const moduleCleanedApis: Record<string, unknown> = {}

  // Generate module files
  for (const mod of modules) {
    const prefix = `modules/${mod.name}`
    const isInstantTrigger = mod.type === 'instant_trigger'

    // metadata.json — all manifest fields except those in separate files
    const modMeta: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(mod.rawItem)) {
      if (!MODULE_SEPARATE_FIELDS.has(key)) {
        modMeta[key] = value
      }
    }
    modMeta.connection = mod.connection
    modMeta.webhook = mod.webhook
    modMeta.type = mod.type
    result.push(makeFile(`${prefix}/metadata.json`, modMeta))

    // expect.imljson — only for actions/searches (not triggers)
    const params = mod.rawItem.parameters as unknown[] | undefined
    if (!isInstantTrigger && mod.type !== 'trigger') {
      let expect: unknown = []
      if (params && params.length > 0) {
        const fp = params[0] as Record<string, unknown> | undefined
        if (fp?.name === '__IMTCONN__') {
          const options = fp.options as Record<string, unknown> | undefined
          const nested = options?.nested as Record<string, unknown> | undefined
          if (nested?.store) {
            expect = nested.store
          }
        }
      }
      const expectStr = transformRpcReferences(stringify(expect), appName)
      result.push({ path: `${prefix}/expect.imljson`, content: expectStr })
    }

    // interface.imljson — transform RPC references
    const ifaceStr = transformRpcReferences(stringify(mod.rawItem.interface || []), appName)
    result.push({ path: `${prefix}/interface.imljson`, content: ifaceStr })

    // scope.imljson — only for actions/searches
    if (!isInstantTrigger) {
      result.push(makeFile(`${prefix}/scope.imljson`, mod.rawItem.scope || []))
    }

    // api.imljson — from app.js, unwrap communication, minus base fields
    const apiData = cleanApi(moduleApis[mod.name] || {}, baseConfig)
    moduleCleanedApis[mod.name] = apiData
    result.push(makeFile(`${prefix}/api.imljson`, apiData))

    // parameters.imljson
    if (isInstantTrigger) {
      // For instant triggers, params come from __IMTHOOK__ options.nested
      let triggerParams: unknown = []
      if (params && params.length > 0) {
        const fp = params[0] as Record<string, unknown> | undefined
        if (fp?.name === '__IMTHOOK__') {
          const options = fp.options as Record<string, unknown> | undefined
          if (Array.isArray(options?.nested) && (options!.nested as unknown[]).length > 0) {
            triggerParams = options!.nested
          }
        }
      }
      result.push(makeFile(`${prefix}/parameters.imljson`, triggerParams))
    } else if (mod.type === 'trigger') {
      // For regular triggers, params come from __IMTCONN__ options.nested
      let triggerParams: unknown = []
      if (params && params.length > 0) {
        const fp = params[0] as Record<string, unknown> | undefined
        if (fp?.name === '__IMTCONN__') {
          const options = fp.options as Record<string, unknown> | undefined
          if (Array.isArray(options?.nested) && (options!.nested as unknown[]).length > 0) {
            triggerParams = options!.nested
          }
        }
      }
      const paramsStr = transformRpcReferences(stringify(triggerParams), appName)
      result.push({ path: `${prefix}/parameters.imljson`, content: paramsStr })
    } else {
      result.push({ path: `${prefix}/parameters.imljson`, content: '[]' })
    }

    // samples.imljson (always empty)
    result.push({ path: `${prefix}/samples.imljson`, content: '{}' })
  }

  // Generate RPC files
  for (const [name, api] of Object.entries(rpcApis)) {
    // RPC names like "epoch:WatchBoardItemsV2" → modules/WatchBoardItemsV2/epoch.imljson
    if (name.includes(':')) {
      const colonIdx = name.indexOf(':')
      const fileBase = name.substring(0, colonIdx)
      const moduleName = name.substring(colonIdx + 1)
      const cleaned = cleanApi(api, baseConfig)

      // Remove fields identical to the module's api.imljson (deep)
      const modApi = moduleCleanedApis[moduleName]
      let epochData = cleaned
      if (modApi && isPlainObj(modApi) && isPlainObj(cleaned)) {
        epochData = removeCommonFields(cleaned, modApi)
      } else if (Array.isArray(modApi) && Array.isArray(cleaned)) {
        const deduped = cleaned.map((item, i) => {
          const modItem = modApi[i]
          if (isPlainObj(item) && isPlainObj(modItem)) {
            return removeCommonFields(item as Record<string, unknown>, modItem as Record<string, unknown>)
          }
          return item
        })
        // If all elements are identical, collapse to single object
        if (deduped.length > 1 && deduped.every((el) => JSON.stringify(el) === JSON.stringify(deduped[0]))) {
          epochData = deduped[0]
        } else {
          epochData = deduped
        }
      }

      const content = transformRpcReferences(stringify(epochData), appName)
      result.push({ path: `modules/${moduleName}/${fileBase}.imljson`, content })
      continue
    }

    const prefix = `rpcs/${name}`
    result.push(
      makeFile(`${prefix}/metadata.json`, {
        name,
        label: camelToLabel(name),
        connection: null
      })
    )
    const rpcApiData = cleanApi(api, baseConfig)
    result.push(makeFile(`${prefix}/api.imljson`, rpcApiData))
    result.push({ path: `${prefix}/parameters.imljson`, content: '[]' })
  }

  // Generate function files
  for (const [name, code] of Object.entries(functions)) {
    result.push({ path: `functions/${name}/code.js`, content: code })
  }

  // Copy asset files
  for (const file of files) {
    if (file.path.startsWith('assets/')) {
      result.push(file)
    }
  }

  return result.sort((a, b) => a.path.localeCompare(b.path))
}

// ---- Account → Connection ----

function doDecompileAccount(files: ExtractedFile[]): ExtractedFile[] {
  const result: ExtractedFile[] = []

  const manifestFile = files.find((f) => f.path === 'manifest.json')
  if (!manifestFile) return files
  const manifest = JSON.parse(manifestFile.content)

  // metadata.json
  const metadata: Record<string, unknown> = {}
  for (const key of ['name', 'label', 'type']) {
    if (manifest[key] !== undefined) metadata[key] = manifest[key]
  }
  result.push(makeFile('metadata.json', metadata))

  // parameters.imljson
  result.push(makeFile('parameters.imljson', manifest.parameters || []))

  // scope.imljson
  result.push(makeFile('scope.imljson', manifest.scope || []))

  // scopes.imljson
  result.push(makeFile('scopes.imljson', manifest.scopes || {}))

  // api.imljson from account.js
  const accountJs = files.find((f) => f.path === 'lib/account.js')
  if (accountJs) {
    const apis = parseCompiledJs(accountJs.content)
    const firstApi = Object.values(apis)[0]
    result.push(makeFile('api.imljson', firstApi || {}))
  } else {
    result.push(makeFile('api.imljson', {}))
  }

  return result
}

// ---- Hook → Webhook ----

function doDecompileHook(files: ExtractedFile[]): ExtractedFile[] {
  const result: ExtractedFile[] = []

  const manifestFile = files.find((f) => f.path === 'manifest.json')
  if (!manifestFile) return files
  const manifest = JSON.parse(manifestFile.content)

  // Extract connection from __IMTCONN__ parameter type
  let connection: string | null = null
  const firstParam = (manifest.parameters || [])[0] as Record<string, unknown> | undefined
  if (firstParam?.name === '__IMTCONN__') {
    const paramType = (firstParam.type as string) || ''
    if (paramType.startsWith('account:')) {
      connection = paramType.replace('account:', '')
    }
  }

  // metadata.json
  result.push(
    makeFile('metadata.json', {
      name: manifest.name,
      label: manifest.label,
      connection,
      type: manifest.type
    })
  )

  // parameters.imljson — from __IMTCONN__ options.nested
  let params: unknown = []
  if (firstParam?.name === '__IMTCONN__') {
    const options = firstParam.options as Record<string, unknown> | undefined
    if (Array.isArray(options?.nested) && (options!.nested as unknown[]).length > 0) {
      params = options!.nested
    }
  }
  result.push(makeFile('parameters.imljson', params))

  // scope.imljson — from __IMTCONN__ options.scope
  let scope: unknown = []
  if (firstParam?.name === '__IMTCONN__') {
    const options = firstParam.options as Record<string, unknown> | undefined
    if (options?.scope !== undefined) {
      scope = options.scope
    }
  }
  result.push(makeFile('scope.imljson', scope))

  // api.imljson from hook.js
  const hookJs = files.find((f) => f.path === 'lib/hook.js')
  if (hookJs) {
    const apis = parseCompiledJs(hookJs.content)
    const firstApi = Object.values(apis)[0]
    result.push(makeFile('api.imljson', firstApi || {}))
  } else {
    result.push(makeFile('api.imljson', {}))
  }

  // attach.imljson, detach.imljson, update.imljson — default empty
  result.push(makeFile('attach.imljson', {}))
  result.push(makeFile('detach.imljson', {}))
  result.push(makeFile('update.imljson', {}))

  return result
}

// ---- JS Parsing via vm ----

function createRuntimeMock(): Record<string, unknown> {
  class Base {}
  const rpcClasses: Record<string, unknown> = {
    ExecuteRpc: Base,
    GetVariableRpc: Base,
    SetVariableRpc: Base,
    RpcAttachHook: Base,
    RpcDetachHook: Base,
    RpcUpdateHook: Base
  }
  return {
    ExecuteAction: Base,
    ExecuteSearch: Base,
    ExecuteTrigger: Base,
    ExecuteHookTrigger: Base,
    ExecuteInstantTrigger: Base,
    Account: Base,
    BasicAccount: Base,
    OAuth2Account: Base,
    RPC: rpcClasses,
    ...rpcClasses,
    default: {
      ExecuteAction: Base,
      ExecuteSearch: Base
    }
  }
}

function parseCompiledJs(code: string): Record<string, unknown> {
  const mock = createRuntimeMock()
  class SingleBase {}
  const moduleExports: Record<string, unknown> = {}
  const sandbox: Record<string, unknown> = {
    module: { exports: moduleExports },
    exports: moduleExports,
    require: (name: string) => {
      // Hook/account runtimes export a single base class
      if (name.includes('imt_hooks/') || name.includes('imt_accounts/')) {
        return SingleBase
      }
      // App module runtimes export named classes
      if (name.includes('app-runtime') || name.includes('imt_modules/')) {
        return mock
      }
      if (name === './functions' || name === './rpc') return {}
      return {}
    },
    console: { log: noop, warn: noop, error: noop, info: noop, debug: noop },
    setTimeout: noop,
    clearTimeout: noop,
    setInterval: noop,
    clearInterval: noop,
    Buffer,
    process: { env: {} },
    global: {}
  }

  try {
    vm.runInNewContext(code, sandbox, { timeout: 5000 })
  } catch {
    return {}
  }

  const exportsObj = (sandbox.module as Record<string, unknown>).exports

  // Handle single-class export (hook.js, account.js): module.exports = Class
  if (typeof exportsObj === 'function') {
    return extractApiFromClass(exportsObj)
  }

  // Handle multi-class export (app.js, rpc.js): module.exports = { name: Class, ... }
  const result: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(exportsObj as Record<string, unknown>)) {
    // Skip non-module exports (e.g., RPC: require('./rpc') in app.js)
    if (name === 'RPC') continue
    if (typeof value === 'function') {
      const apis = extractApiFromClass(value, name)
      Object.assign(result, apis)
    }
  }
  return result
}

function extractApiFromClass(ClassRef: unknown, name?: string): Record<string, unknown> {
  try {
    const instance = new (ClassRef as new () => Record<string, unknown>)()
    if (instance.api) {
      const api = { ...(instance.api as Record<string, unknown>) }
      // Strip compile-time iml field
      delete api.iml
      const key = name || 'default'
      return { [key]: api }
    }
  } catch {
    /* skip classes that fail to instantiate */
  }
  return {}
}

function parseFunctions(code: string): Record<string, string> {
  const moduleExports: Record<string, unknown> = {}
  const sandbox: Record<string, unknown> = {
    module: { exports: moduleExports },
    exports: moduleExports,
    require: () => ({}),
    console: { log: noop, warn: noop, error: noop, info: noop, debug: noop },
    Buffer
  }

  try {
    vm.runInNewContext(code, sandbox, { timeout: 5000 })
  } catch {
    return {}
  }

  const result: Record<string, string> = {}
  const exportsObj = (sandbox.module as Record<string, unknown>).exports as Record<string, unknown>

  for (const [name, value] of Object.entries(exportsObj)) {
    if (typeof value === 'string') {
      // Compiled functions are exported as strings — extract the function body
      result[name] = value
    } else if (typeof value === 'function') {
      result[name] = value.toString()
    }
  }

  return result
}

// ---- Base extraction ----

/**
 * Scan all module APIs to find base fields.
 * Checks top-level fields first, then falls back to communication[0] blocks
 * for apps that use the communication pattern (e.g., Google Drive).
 */
function extractBaseFromAll(apis: Record<string, unknown>[]): Record<string, unknown> {
  const base: Record<string, unknown> = {}

  // For each base field, find it in any module's API (top-level or communication[0])
  for (const field of BASE_TOP_FIELDS) {
    for (const api of apis) {
      if (api[field] !== undefined) {
        base[field] = api[field]
        break
      }
      // Check inside communication[0]
      const comm = api.communication as Record<string, unknown>[] | undefined
      if (Array.isArray(comm) && comm.length > 0 && comm[0][field] !== undefined) {
        base[field] = comm[0][field]
        break
      }
    }
  }

  // Extract response.error — check top-level response, then communication[0].response
  for (const api of apis) {
    const response = api.response as Record<string, unknown> | undefined
    if (response) {
      const baseResponse: Record<string, unknown> = {}
      for (const field of BASE_RESPONSE_FIELDS) {
        if (response[field] !== undefined) {
          baseResponse[field] = response[field]
        }
      }
      if (Object.keys(baseResponse).length > 0) {
        base.response = baseResponse
        break
      }
    }
    // Check inside communication[0].response
    const comm = api.communication as Record<string, unknown>[] | undefined
    if (Array.isArray(comm) && comm.length > 0) {
      const commResponse = comm[0].response as Record<string, unknown> | undefined
      if (commResponse) {
        const baseResponse: Record<string, unknown> = {}
        for (const field of BASE_RESPONSE_FIELDS) {
          if (commResponse[field] !== undefined) {
            baseResponse[field] = commResponse[field]
          }
        }
        if (Object.keys(baseResponse).length > 0) {
          base.response = baseResponse
          break
        }
      }
    }
  }

  // Extract common temp sub-fields across all modules
  const baseTemp = extractCommonTemp(apis)
  if (Object.keys(baseTemp).length > 0) {
    base.temp = baseTemp
  }

  return base
}

/**
 * Find temp sub-fields that are common (identical value) across ALL modules that have temp.
 * These go into base.imljson; module-specific sub-fields stay in each module's api.imljson.
 */
function extractCommonTemp(apis: Record<string, unknown>[]): Record<string, unknown> {
  // Collect all temp objects (from top-level or communication[0])
  const temps: Record<string, unknown>[] = []
  for (const api of apis) {
    const temp = api.temp as Record<string, unknown> | undefined
    if (temp && typeof temp === 'object') {
      temps.push(temp)
      continue
    }
    const comm = api.communication as Record<string, unknown>[] | undefined
    if (Array.isArray(comm) && comm.length > 0) {
      const commTemp = comm[0].temp as Record<string, unknown> | undefined
      if (commTemp && typeof commTemp === 'object') {
        temps.push(commTemp)
      }
    }
  }

  if (temps.length < 2) return {}

  // Find sub-fields present in ALL temp objects with identical JSON values
  const firstTemp = temps[0]
  const common: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(firstTemp)) {
    const serialized = JSON.stringify(value)
    const isCommon = temps.every((t) => t[key] !== undefined && JSON.stringify(t[key]) === serialized)
    if (isCommon) {
      common[key] = value
    }
  }

  return common
}

/**
 * Unwrap communication array and remove base fields.
 * If api has `communication`, extract the array and remove base fields from each element.
 * Otherwise, remove base fields from the single object.
 */
function cleanApi(raw: unknown, baseConfig: Record<string, unknown>): unknown {
  const hasBase = Object.keys(baseConfig).length > 0
  const api = raw as Record<string, unknown>

  // Remove metadata (runtime-only, not part of SDK)
  delete api.metadata

  // communication pattern: { communication: [{...}, {...}] }
  const comm = api.communication as unknown[] | undefined
  if (Array.isArray(comm)) {
    const cleaned = comm.map((step) => {
      const s = { ...(step as Record<string, unknown>) }
      delete s.metadata
      return hasBase ? removeBaseFields(s, baseConfig) : s
    })
    return cleaned
  }

  // flat pattern: { url, method, response, ... }
  if (hasBase) return removeBaseFields(api, baseConfig)
  return api
}

function removeBaseFields(api: Record<string, unknown>, baseConfig: Record<string, unknown>): Record<string, unknown> {
  const result = { ...api }

  for (const field of BASE_TOP_FIELDS) {
    delete result[field]
  }

  const response = result.response as Record<string, unknown> | undefined
  if (response) {
    const moduleResponse: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(response)) {
      if (!BASE_RESPONSE_FIELDS.includes(key)) {
        moduleResponse[key] = value
      }
    }
    if (Object.keys(moduleResponse).length > 0) {
      result.response = moduleResponse
    } else {
      delete result.response
    }
  }

  // Remove common temp sub-fields, keep module-specific ones
  const baseTemp = baseConfig.temp as Record<string, unknown> | undefined
  if (baseTemp) {
    const temp = result.temp as Record<string, unknown> | undefined
    if (temp && typeof temp === 'object') {
      const moduleTemp: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(temp)) {
        if (!(key in baseTemp)) {
          moduleTemp[key] = value
        }
      }
      if (Object.keys(moduleTemp).length > 0) {
        result.temp = moduleTemp
      } else {
        delete result.temp
      }
    }
  }

  return result
}

// ---- RPC reference transformation ----

function transformRpcReferences(content: string, appName: string): string {
  const escaped = appName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`rpc://${escaped}@\\d+/`, 'g')
  return content.replace(pattern, 'rpc://')
}

// ---- Utilities ----

function stringify(obj: unknown): string {
  return JSON.stringify(obj, null, 4)
}

function makeFile(filePath: string, data: unknown): ExtractedFile {
  return { path: filePath, content: stringify(data) }
}

function camelToLabel(name: string): string {
  const words = name
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(' ')
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function isPlainObj(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

/**
 * Recursively remove fields from `epoch` that are identical to `modApi`.
 * For nested objects, recurse and keep only differing sub-fields.
 */
function removeCommonFields(
  epoch: Record<string, unknown>,
  modApi: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(epoch)) {
    if (!(key in modApi)) {
      result[key] = value
      continue
    }
    const modValue = modApi[key]
    if (JSON.stringify(value) === JSON.stringify(modValue)) continue
    if (isPlainObj(value) && isPlainObj(modValue)) {
      const nested = removeCommonFields(value, modValue)
      if (Object.keys(nested).length > 0) result[key] = nested
      continue
    }
    result[key] = value
  }
  return result
}

function noop(): void {}
