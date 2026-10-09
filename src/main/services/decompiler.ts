import { ExtractedFile } from '../types'
import { parseCompiledJs, parseFunctions } from './decompiler-sandbox'

// Scalar fields that belong in base.imljson (common across all modules). `method` is
// deliberately excluded: it must never be promoted to base or stripped from any
// module/step, regardless of whether it matches — every component keeps its own.
const BASE_TOP_FIELDS = new Set(['baseUrl', 'timeout', 'body'])
// Root-level fields with their own dedicated nested-aware extraction below (response's
// error/valid/temp sub-handling, temp's own extraction, body's scalar-vs-object handling
// via BASE_TOP_FIELDS above); excluded from the generic per-key composite-field
// discovery so they aren't processed twice.
const DEDICATED_FIELDS = new Set(['response', 'temp', 'metadata', 'body'])

/**
 * Check if extracted files represent a custom (compiled) app
 */
export function isCustomApp(files: ExtractedFile[]): boolean {
  return files.some((f) => f.path === 'lib/app.js')
}

/**
 * Decompile a compiled custom app into SDK structure.
 * On any construct the static extractor can't resolve, returns the original raw files.
 */
export function decompileApp(files: ExtractedFile[], appName: string): ExtractedFile[] {
  try {
    return doDecompileApp(files, appName)
  } catch (err) {
    logBail('app', appName, err)
    return files
  }
}

/**
 * Decompile account files into connection SDK structure.
 * On any construct the static extractor can't resolve, returns the original raw files.
 */
export function decompileAccount(files: ExtractedFile[]): ExtractedFile[] {
  try {
    return doDecompileAccount(files)
  } catch (err) {
    logBail('account', undefined, err)
    return files
  }
}

/**
 * Decompile hook files into webhook SDK structure.
 * On any construct the static extractor can't resolve, returns the original raw files.
 */
export function decompileHook(files: ExtractedFile[]): ExtractedFile[] {
  try {
    return doDecompileHook(files)
  } catch (err) {
    logBail('hook', undefined, err)
    return files
  }
}

function logBail(kind: 'app' | 'account' | 'hook', name: string | undefined, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  const label = name ? `${kind} "${name}"` : kind
  console.error(`[decompiler] static extraction could not decompile ${label}, showing raw compiled files: ${message}`)
}

// ---- App decompilation ----

// Fields that go into separate files, not metadata.json
const MODULE_SEPARATE_FIELDS = new Set(['parameters', 'interface', 'scope', 'expect'])

// Endpoint fields that go into separate files, not metadata.json
const ENDPOINT_SEPARATE_FIELDS = new Set(['inputParameters', 'outputParameters', 'context', 'scope', 'api'])

// RPC types that belong to webhooks, not modules
const HOOK_RPC_TYPES = new Set(['attach', 'detach', 'update'])

interface ModuleDef {
  name: string
  type: string
  connection: string | null
  webhook: string | null
  rawItem: Record<string, unknown>
}

// Shared by the per-module and per-RPC emitters; the module loop fills moduleCleanedApis for the RPC loop
interface AppContext {
  appName: string
  baseConfig: Record<string, unknown>
  moduleCleanedApis: Record<string, unknown>
  webhookNames: Set<string>
}

function doDecompileApp(files: ExtractedFile[], appName: string): ExtractedFile[] {
  const manifestFile = files.find((f) => f.path === 'manifest.json')
  if (!manifestFile) return files
  const manifest = JSON.parse(manifestFile.content)

  const result: ExtractedFile[] = [
    makeFile('.sdk', { version: 2 }),
    makeFile('metadata.json', buildAppMetadata(manifest))
  ]

  // groups.imljson
  if (manifest.groups && manifest.groups.length > 0) {
    result.push(makeFile('groups.imljson', manifest.groups))
  }

  // Parse compiled JS files
  const moduleApis = parseJsFile(files, 'lib/app.js', parseCompiledJs)
  const rpcApis = parseJsFile(files, 'lib/rpc.js', parseCompiledJs)
  const endpointApis = parseJsFile(files, 'lib/endpoints.js', parseCompiledJs)
  const functions = parseJsFile(files, 'lib/functions.js', parseFunctions)

  const modules = collectModuleDefs(manifest)

  // Extract base.imljson by scanning ALL modules' APIs
  const allApis = modules
    .map((m) => moduleApis[m.name] as Record<string, unknown> | undefined)
    .filter((a): a is Record<string, unknown> => !!a)
  const baseConfig = extractBaseFromAll(allApis)

  if (Object.keys(baseConfig).length > 0) {
    result.push(makeFile('base.imljson', baseConfig))
  }

  const ctx: AppContext = {
    appName,
    baseConfig,
    moduleCleanedApis: {},
    webhookNames: new Set(modules.flatMap((m) => (m.webhook ? [m.webhook] : [])))
  }

  for (const mod of modules) {
    result.push(...buildModuleFiles(mod, moduleApis, ctx))
  }

  // Generate endpoint files: manifest.endpoints[] (metadata/parameters/context/scope)
  // paired with lib/endpoints.js classes (api), same base.imljson as modules.
  const endpoints = (manifest.endpoints || []) as Record<string, unknown>[]
  for (const endpoint of endpoints) {
    result.push(...buildEndpointFiles(endpoint, endpointApis, baseConfig))
  }

  for (const [name, api] of Object.entries(rpcApis)) {
    result.push(...buildRpcFiles(name, api, ctx))
  }

  const extras = [
    ...Object.entries(functions).map(([name, code]) => ({ path: `functions/${name}/code.js`, content: code })),
    ...files.filter((file) => file.path.startsWith('assets/'))
  ]

  return result.concat(extras).sort((a, b) => a.path.localeCompare(b.path))
}

function parseJsFile<T>(
  files: ExtractedFile[],
  path: string,
  parse: (content: string) => Record<string, T>
): Record<string, T> {
  const file = files.find((f) => f.path === path)
  return file ? parse(file.content) : {}
}

// metadata.json: top-level fields + SDK version
function buildAppMetadata(manifest: Record<string, unknown>): Record<string, unknown> {
  const metadata: Record<string, unknown> = {}
  for (const key of ['name', 'label', 'description', 'theme']) {
    if (manifest[key] !== undefined) metadata[key] = manifest[key]
  }
  metadata.version = 2
  return metadata
}

function collectModuleDefs(manifest: Record<string, unknown>): ModuleDef[] {
  const modules: ModuleDef[] = []
  for (const [section, moduleType] of [
    ['actions', 'action'],
    ['searches', 'search'],
    ['triggers', 'trigger']
  ] as const) {
    for (const item of (manifest[section] || []) as Record<string, unknown>[]) {
      modules.push(toModuleDef(item, moduleType))
    }
  }
  return modules
}

// Extract connection/webhook reference from first parameter
function toModuleDef(item: Record<string, unknown>, moduleType: string): ModuleDef {
  let type = moduleType
  let connection: string | null = null
  let webhook: string | null = null

  const firstParam = ((item.parameters as unknown[] | undefined) || [])[0] as Record<string, unknown> | undefined
  if (firstParam) {
    const paramType = (firstParam.type as string) || ''
    if (firstParam.name === '__IMTCONN__' && paramType.startsWith('account:')) {
      connection = paramType.replace('account:', '')
    } else if (firstParam.name === '__IMTHOOK__' && paramType.startsWith('hook:')) {
      webhook = paramType.replace('hook:', '')
      type = 'instant_trigger'
    }
  }

  return { name: item.name as string, type, connection, webhook, rawItem: item }
}

function buildModuleFiles(mod: ModuleDef, moduleApis: Record<string, unknown>, ctx: AppContext): ExtractedFile[] {
  const prefix = `modules/${mod.name}`
  const isInstantTrigger = mod.type === 'instant_trigger'
  const params = mod.rawItem.parameters as unknown[] | undefined

  const files: ExtractedFile[] = [makeFile(`${prefix}/metadata.json`, buildModuleMetadata(mod))]

  // expect.imljson: only for actions/searches (not triggers)
  if (!isInstantTrigger && mod.type !== 'trigger') {
    const expectStr = transformRpcReferences(stringify(resolveExpect(mod.rawItem, params)), ctx.appName)
    files.push({ path: `${prefix}/expect.imljson`, content: expectStr })
  }

  // interface.imljson: transform RPC references
  const ifaceStr = transformRpcReferences(stringify(mod.rawItem.interface || []), ctx.appName)
  files.push({ path: `${prefix}/interface.imljson`, content: ifaceStr })

  // scope.imljson: only for actions/searches
  if (!isInstantTrigger) {
    files.push(makeFile(`${prefix}/scope.imljson`, mod.rawItem.scope || []))
  }

  // api.imljson: from app.js, unwrap communication, minus base fields
  const apiData = cleanApi(moduleApis[mod.name] || {}, ctx.baseConfig)
  ctx.moduleCleanedApis[mod.name] = apiData

  files.push(
    makeFile(`${prefix}/api.imljson`, apiData),
    moduleParametersFile(`${prefix}/parameters.imljson`, mod.type, params, ctx.appName),
    { path: `${prefix}/samples.imljson`, content: '{}' }
  )
  return files
}

// metadata.json: all manifest fields except those in separate files
function buildModuleMetadata(mod: ModuleDef): Record<string, unknown> {
  const modMeta: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(mod.rawItem)) {
    if (!MODULE_SEPARATE_FIELDS.has(key)) {
      modMeta[key] = value
    }
  }
  modMeta.connection = mod.connection
  modMeta.webhook = mod.webhook
  modMeta.type = mod.type
  return modMeta
}

// rawItem.expect wins only if a non-empty array; else falls through to __IMTCONN__ nested.store, else []
function resolveExpect(rawItem: Record<string, unknown>, params: unknown[] | undefined): unknown {
  const rawExpect = rawItem.expect
  if (Array.isArray(rawExpect) && rawExpect.length > 0) return rawExpect
  const nested = firstParamNested(params, '__IMTCONN__') as Record<string, unknown> | undefined
  return nested?.store || []
}

function firstParamNested(params: unknown[] | undefined, paramName: string): unknown {
  const fp = params && params.length > 0 ? (params[0] as Record<string, unknown> | undefined) : undefined
  if (fp?.name !== paramName) return undefined
  const options = fp.options as Record<string, unknown> | undefined
  return options?.nested
}

function nonEmptyArrayOrEmpty(value: unknown): unknown {
  return Array.isArray(value) && value.length > 0 ? value : []
}

// Instant triggers read __IMTHOOK__ options.nested and are not rpc:// transformed; regular triggers read
// __IMTCONN__ options.nested and are transformed; actions and searches always get []
function moduleParametersFile(
  path: string,
  type: string,
  params: unknown[] | undefined,
  appName: string
): ExtractedFile {
  if (type === 'instant_trigger') {
    return makeFile(path, nonEmptyArrayOrEmpty(firstParamNested(params, '__IMTHOOK__')))
  }
  if (type === 'trigger') {
    const triggerParams = nonEmptyArrayOrEmpty(firstParamNested(params, '__IMTCONN__'))
    return { path, content: transformRpcReferences(stringify(triggerParams), appName) }
  }
  return { path, content: '[]' }
}

// Real manifest.endpoints[] entries (google-email@4.19.2) carry no top-level `scope` or
// `api` field: accounts is a map keyed by account name (each with its own `scope`
// array), and api only exists compiled in lib/endpoints.js. metadata.json's `accounts`
// is flattened to just the account names; scope.imljson is the deduped union of every
// attached account's scope array (see extractAccountScopes for the multi-account caveat).
function buildEndpointFiles(
  endpoint: Record<string, unknown>,
  endpointApis: Record<string, unknown>,
  baseConfig: Record<string, unknown>
): ExtractedFile[] {
  const name = endpoint.name as string
  const prefix = `endpoints/${name}`

  const epMeta: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(endpoint)) {
    if (!ENDPOINT_SEPARATE_FIELDS.has(key)) {
      epMeta[key] = value
    }
  }
  if (isPlainObj(endpoint.accounts)) {
    epMeta.accounts = Object.keys(endpoint.accounts)
  }

  return [
    makeFile(`${prefix}/metadata.json`, epMeta),
    makeFile(`${prefix}/inputParameters.imljson`, endpoint.inputParameters || []),
    makeFile(`${prefix}/outputParameters.imljson`, endpoint.outputParameters || []),
    makeFile(`${prefix}/scope.imljson`, extractAccountScopes(endpoint.accounts)),
    { path: `${prefix}/context.md`, content: (endpoint.context as string) || '' },
    makeFile(`${prefix}/api.imljson`, cleanApi(endpointApis[name] || {}, baseConfig))
  ]
}

// RPC names like "epoch:WatchBoardItemsV2" → modules/WatchBoardItemsV2/epoch.imljson
// Hook RPCs like "attach:hookName" → webhooks/hookName/attach.imljson
function buildRpcFiles(name: string, api: unknown, ctx: AppContext): ExtractedFile[] {
  if (name.includes(':')) return [buildScopedRpcFile(name, api, ctx)]

  const prefix = `rpcs/${name}`
  return [
    makeFile(`${prefix}/metadata.json`, {
      name,
      label: camelToLabel(name),
      connection: null
    }),
    makeFile(`${prefix}/api.imljson`, cleanApi(api, ctx.baseConfig)),
    { path: `${prefix}/parameters.imljson`, content: '[]' }
  ]
}

function buildScopedRpcFile(name: string, api: unknown, ctx: AppContext): ExtractedFile {
  const colonIdx = name.indexOf(':')
  const fileBase = name.substring(0, colonIdx)
  const targetName = name.substring(colonIdx + 1)
  const cleaned = cleanApi(api, ctx.baseConfig)

  // Hook RPCs (attach/detach/update) go to webhooks/ directory
  if (HOOK_RPC_TYPES.has(fileBase) && ctx.webhookNames.has(targetName)) {
    const content = transformRpcReferences(stringify(cleaned), ctx.appName)
    return { path: `webhooks/${targetName}/${fileBase}.imljson`, content }
  }

  // Module RPCs (epoch, etc.): remove fields identical to the module's api.imljson
  const epochData = dedupeEpoch(cleaned, ctx.moduleCleanedApis[targetName])
  const content = transformRpcReferences(stringify(epochData), ctx.appName)
  return { path: `modules/${targetName}/${fileBase}.imljson`, content }
}

function dedupeEpoch(cleaned: unknown, modApi: unknown): unknown {
  if (isPlainObj(modApi) && isPlainObj(cleaned)) return removeCommonFields(cleaned, modApi)
  if (Array.isArray(modApi) && Array.isArray(cleaned)) return dedupeEpochArray(cleaned, modApi)
  return cleaned
}

// Per-index dedupe; if all elements end up identical, collapse to a single object
function dedupeEpochArray(cleaned: unknown[], modApi: unknown[]): unknown {
  const deduped = cleaned.map((item, i) => {
    const modItem = modApi[i]
    return isPlainObj(item) && isPlainObj(modItem) ? removeCommonFields(item, modItem) : item
  })
  if (deduped.length > 1 && deduped.every((el) => JSON.stringify(el) === JSON.stringify(deduped[0]))) {
    return deduped[0]
  }
  return deduped
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
  result.push(
    makeFile('metadata.json', metadata),
    makeFile('parameters.imljson', manifest.parameters || []),
    makeFile('scope.imljson', manifest.scope || []),
    makeFile('scopes.imljson', manifest.scopes || {})
  )

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
    const nested = options?.nested
    if (Array.isArray(nested) && nested.length > 0) {
      params = nested
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
  // (app's rpc.js may override these via doDecompileApp into webhooks/{hookName}/)
  result.push(makeFile('attach.imljson', {}), makeFile('detach.imljson', {}), makeFile('update.imljson', {}))

  return result
}

// ---- Base extraction ----

// Scalar fields (baseUrl, timeout, body, response.valid-as-scalar) only need a plurality
// of the vote; composite object sub-keys (headers.foo, qs.foo, response.error.429, ...)
// need near-unanimous agreement, since a coincidental partial match there is far more
// likely to be a per-module accident than a genuine app-wide convention. 0.9 (not a full
// 1.0) is a deliberate choice: real data across three apps shows genuine app-wide
// conventions land at 94.7%-100% (blocked by exactly one or two outlier modules out of
// 19-53), while genuine per-module accidents land at 14.3%-66.7% — 0.9 sits in the gap.
const SCALAR_MIN_VALUE_SHARE = 0.3
const COMPOSITE_MIN_VALUE_SHARE = 0.9

/**
 * Two-gate promotion check shared by scalar, response, and composite-field extraction.
 * Gate 1: the key must have some value in every one of the `totalComponents` in scope —
 * if even one component lacks it entirely, promotion is skipped, no vote is taken.
 * Gate 2: among those (now 100%-present) values, the plurality winner must hold at least
 * `minShare` of the vote; each component votes once per unique value it shows.
 */
function pluralityWinner(
  perComponentValues: string[][],
  totalComponents: number,
  minShare: number
): string | undefined {
  if (perComponentValues.length !== totalComponents) return undefined

  const freq = new Map<string, number>()
  for (const vals of perComponentValues) {
    const unique = new Set(vals)
    for (const v of unique) {
      freq.set(v, (freq.get(v) || 0) + 1)
    }
  }

  let bestVal: string | undefined
  let bestCount = 0
  for (const [v, count] of freq) {
    if (count > bestCount) {
      bestVal = v
      bestCount = count
    }
  }

  if (bestVal !== undefined && bestCount / totalComponents >= minShare) {
    return bestVal
  }
  return undefined
}

/**
 * Scan all module APIs to find base fields, using the two-gate `pluralityWinner` check
 * (100% presence, then plurality-of-value) for scalar, response, and composite fields.
 * response.temp / temp use their own dedicated identical-across-all-modules extraction.
 */
export function extractBaseFromAll(apis: Record<string, unknown>[]): Record<string, unknown> {
  const base: Record<string, unknown> = {}

  for (const field of BASE_TOP_FIELDS) {
    const bestVal = scalarPlurality(apis, (api) => collectScalarValues(api, field))
    if (bestVal !== undefined) {
      base[field] = JSON.parse(bestVal)
    }
  }

  // Extract common sub-keys of any other object-valued root field (headers, qs, ...
  // whatever a given app happens to use), discovered dynamically rather than by name
  for (const field of discoverCompositeFields(apis)) {
    const common = extractCommonObjectField(apis, (api) => collectFieldObjects(api, field))
    if (Object.keys(common).length > 0) {
      base[field] = common
    }
  }

  // response.error is always object-shaped (status code -> {type, message}); dedupe its
  // sub-keys the same way as headers/qs, not as one atomic blob — a per-step override of
  // a single status code shouldn't drag the other, genuinely shared, codes along with it.
  const baseError = extractCommonObjectField(apis, (api) => responseFieldObjects(api, 'error'))
  if (Object.keys(baseError).length > 0) {
    setResponseField(base, 'error', baseError)
  }

  const baseValid = extractBaseResponseValid(apis)
  if (baseValid !== undefined) {
    setResponseField(base, 'valid', baseValid)
  }

  // Extract common temp sub-fields across all modules
  const baseTemp = extractCommonTemp(apis)
  if (Object.keys(baseTemp).length > 0) {
    base.temp = baseTemp
  }

  // Extract common response.temp sub-fields across all modules
  const baseResponseTemp = extractCommonResponseTemp(apis)
  if (Object.keys(baseResponseTemp).length > 0) {
    setResponseField(base, 'temp', baseResponseTemp)
  }

  return base
}

/**
 * Serialized values of `field` for one module: the flat api value if present, otherwise the
 * value of every communication step that has it (not just [0]).
 */
function collectScalarValues(api: Record<string, unknown>, field: string): string[] {
  if (api[field] !== undefined) return [JSON.stringify(api[field])]
  const comm = api.communication as Record<string, unknown>[] | undefined
  if (!Array.isArray(comm)) return []
  return serializedValues(comm, field)
}

function serializedValues(objs: Record<string, unknown>[], key: string): string[] {
  return objs.filter((o) => o[key] !== undefined).map((o) => JSON.stringify(o[key]))
}

/** Plurality vote over the per-module serialized values; modules without a value do not vote. */
function scalarPlurality(
  apis: Record<string, unknown>[],
  collect: (api: Record<string, unknown>) => string[]
): string | undefined {
  const moduleValues = apis.map((api) => collect(api)).filter((vals) => vals.length > 0)
  return pluralityWinner(moduleValues, apis.length, SCALAR_MIN_VALUE_SHARE)
}

function responseFieldObjects(api: Record<string, unknown>, key: string): Record<string, unknown>[] {
  return getAllResponseObjs(api)
    .map((r) => r[key])
    .filter(isPlainObj)
}

/**
 * response.valid is usually a scalar (boolean/template string) but is object-shaped for
 * some modules (e.g. { condition }); try the composite per-key path first, and only fall
 * back to a scalar plurality match if no object-shaped consensus was found.
 */
function extractBaseResponseValid(apis: Record<string, unknown>[]): unknown {
  const baseValidObj = extractCommonObjectField(apis, (api) => responseFieldObjects(api, 'valid'))
  if (Object.keys(baseValidObj).length > 0) return baseValidObj
  const bestVal = scalarPlurality(apis, (api) => serializedValues(getAllResponseObjs(api), 'valid'))
  return bestVal === undefined ? undefined : JSON.parse(bestVal)
}

function setResponseField(base: Record<string, unknown>, key: string, value: unknown): void {
  if (!base.response) {
    base.response = {}
  }
  const response = base.response as Record<string, unknown>
  response[key] = value
}

/**
 * Get all response objects from an API (top-level or from ALL communication steps).
 */
function getAllResponseObjs(api: Record<string, unknown>): Record<string, unknown>[] {
  const response = api.response as Record<string, unknown> | undefined
  if (response) return [response]
  const comm = api.communication as Record<string, unknown>[] | undefined
  if (Array.isArray(comm)) {
    const results: Record<string, unknown>[] = []
    for (const step of comm) {
      const stepResponse = step.response as Record<string, unknown> | undefined
      if (stepResponse) results.push(stepResponse)
    }
    return results
  }
  return []
}

/**
 * Find response.temp sub-fields that are common (identical value) across ALL modules.
 * Scans ALL communication steps (not just [0]). Checks all keys across all temps.
 */
function extractCommonResponseTemp(apis: Record<string, unknown>[]): Record<string, unknown> {
  const temps = apis
    .flatMap((api) => getAllResponseObjs(api))
    .map((r) => r.temp)
    .filter(isObjectLike)
  return commonIdenticalKeys(temps)
}

/**
 * Find temp sub-fields that are common (identical value) across ALL modules that have temp.
 * Scans ALL communication steps. Checks all keys across all temps.
 */
function extractCommonTemp(apis: Record<string, unknown>[]): Record<string, unknown> {
  return commonIdenticalKeys(apis.flatMap((api) => collectTemps(api)))
}

/** The flat `temp` of an api if it is object-like, otherwise the object-like `temp` of every step. */
function collectTemps(api: Record<string, unknown>): Record<string, unknown>[] {
  const temp = api.temp
  if (isObjectLike(temp)) return [temp]
  const comm = api.communication as Record<string, unknown>[] | undefined
  if (!Array.isArray(comm)) return []
  return comm.map((step) => step.temp).filter(isObjectLike)
}

/** Keys (over the union of all temps) whose value is present and identical in every temp; needs 2+ temps. */
function commonIdenticalKeys(temps: Record<string, unknown>[]): Record<string, unknown> {
  if (temps.length < 2) return {}

  const common: Record<string, unknown> = {}
  for (const key of unionKeys(temps)) {
    const firstVal = temps.find((t) => t[key] !== undefined)
    if (!firstVal) continue
    const serialized = JSON.stringify(firstVal[key])
    const isCommon = temps.every((t) => t[key] !== undefined && JSON.stringify(t[key]) === serialized)
    if (isCommon) {
      common[key] = firstVal[key]
    }
  }

  return common
}

function unionKeys(objs: Record<string, unknown>[]): Set<string> {
  const keys = new Set<string>()
  for (const obj of objs) {
    for (const key of Object.keys(obj)) keys.add(key)
  }
  return keys
}

/**
 * Finds every root-level key across all module APIs (flat api or any communication step)
 * whose value is a plain object, excluding fields that already have dedicated handling.
 */
function discoverCompositeFields(apis: Record<string, unknown>[]): string[] {
  const fields = new Set<string>()
  for (const api of apis) {
    collectObjectKeys(api, fields)
    const comm = api.communication as Record<string, unknown>[] | undefined
    if (Array.isArray(comm)) {
      for (const step of comm) collectObjectKeys(step, fields)
    }
  }
  for (const excluded of DEDICATED_FIELDS) fields.delete(excluded)
  return [...fields]
}

function collectObjectKeys(obj: Record<string, unknown>, out: Set<string>): void {
  for (const [key, value] of Object.entries(obj)) {
    if (isPlainObj(value)) out.add(key)
  }
}

/**
 * Find sub-keys of an object-valued field (headers, qs, response.error, ...) that are
 * common across every module in the app, using the same `pluralityWinner` gate 1 as
 * scalar/response fields (a sub-key only reaches a vote if literally every module in
 * `apis` has it — gate 1 uses `apis.length`, not just the modules that have the parent
 * field at all, so a field used by only a handful of modules can never pass this) but a
 * stricter gate 2: COMPOSITE_MIN_VALUE_SHARE requires unanimous agreement, not just a
 * plurality, since a coincidental partial match on a composite sub-key is more likely a
 * per-module accident than an app-wide convention. A module with a different value for
 * the same key keeps that as an override (removeBaseFields). `collect` returns the
 * object-shaped occurrences of the field for one module's api — `collectFieldObjects`
 * for a plain root-level field, or a response-scoped getter for response.error/valid.
 */
function extractCommonObjectField(
  apis: Record<string, unknown>[],
  collect: (api: Record<string, unknown>) => Record<string, unknown>[]
): Record<string, unknown> {
  const moduleObjs = apis.map((api) => collect(api)).filter((objs) => objs.length > 0)

  if (moduleObjs.length === 0) return {}

  const common: Record<string, unknown> = {}
  for (const key of unionKeys(moduleObjs.flat())) {
    const perModuleValues = moduleObjs.map((objs) => serializedValues(objs, key)).filter((vals) => vals.length > 0)

    const bestVal = pluralityWinner(perModuleValues, apis.length, COMPOSITE_MIN_VALUE_SHARE)
    if (bestVal !== undefined) {
      common[key] = JSON.parse(bestVal)
    }
  }

  return common
}

/**
 * Gathers the object-valued occurrences of `field` for one module's api, checking both
 * the flat api and every communication step.
 */
function collectFieldObjects(api: Record<string, unknown>, field: string): Record<string, unknown>[] {
  const objs: Record<string, unknown>[] = []
  const val = api[field]
  if (isPlainObj(val)) {
    objs.push(val)
    return objs
  }
  const comm = api.communication as Record<string, unknown>[] | undefined
  if (Array.isArray(comm)) {
    for (const step of comm) {
      const stepVal = step[field]
      if (isPlainObj(stepVal)) objs.push(stepVal)
    }
  }
  return objs
}

/**
 * Unwrap communication array and remove base fields.
 * If api has `communication`, extract the array and remove base fields from each element.
 * Otherwise, remove base fields from the single object.
 */
export function cleanApi(raw: unknown, baseConfig: Record<string, unknown>): unknown {
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

/**
 * Diffs an object-shaped module value against the matching base object, keeping only the
 * sub-keys that don't match base. Returns undefined if `value` isn't a plain object (so
 * callers can fall back to keeping it as-is) rather than a scalar-vs-object mismatch.
 */
function diffAgainstBaseObject(value: unknown, baseObj: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!isPlainObj(value)) return undefined
  return diffKeys(value, baseObj)
}

function diffKeys(value: Record<string, unknown>, base: Record<string, unknown>): Record<string, unknown> {
  const diffed: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    if (!(key in base) || JSON.stringify(v) !== JSON.stringify(base[key])) {
      diffed[key] = v
    }
  }
  return diffed
}

function assignOrDelete(target: Record<string, unknown>, key: string, value: Record<string, unknown>): void {
  if (Object.keys(value).length > 0) {
    target[key] = value
  } else {
    delete target[key]
  }
}

function removeBaseFields(api: Record<string, unknown>, baseConfig: Record<string, unknown>): Record<string, unknown> {
  const result = { ...api }

  stripMatchingScalars(result, baseConfig)
  stripCompositeBaseKeys(result, baseConfig)

  // Handle response: remove base response fields and common response.temp sub-fields
  const response = result.response as Record<string, unknown> | undefined
  const baseResponse = baseConfig.response as Record<string, unknown> | undefined
  if (response && baseResponse) {
    assignOrDelete(result, 'response', diffResponse(response, baseResponse))
  }

  // Remove common temp sub-fields, keep module-specific ones
  const baseTemp = baseConfig.temp as Record<string, unknown> | undefined
  const temp = result.temp
  if (baseTemp && isObjectLike(temp)) {
    assignOrDelete(result, 'temp', diffKeys(temp, baseTemp))
  }

  return result
}

// Only remove top-level base fields if their value matches the base value; a differing value is a module override
function stripMatchingScalars(result: Record<string, unknown>, baseConfig: Record<string, unknown>): void {
  for (const field of BASE_TOP_FIELDS) {
    if (
      baseConfig[field] !== undefined &&
      result[field] !== undefined &&
      JSON.stringify(result[field]) === JSON.stringify(baseConfig[field])
    ) {
      delete result[field]
    }
  }
}

// Remove common composite-field sub-keys (whichever fields extraction found), keep module-specific ones
function stripCompositeBaseKeys(result: Record<string, unknown>, baseConfig: Record<string, unknown>): void {
  for (const field of Object.keys(baseConfig)) {
    if (BASE_TOP_FIELDS.has(field) || DEDICATED_FIELDS.has(field)) continue
    const baseFieldObj = baseConfig[field] as Record<string, unknown>
    const diffed = diffAgainstBaseObject(result[field], baseFieldObj)
    if (diffed !== undefined) {
      assignOrDelete(result, field, diffed)
    }
  }
}

function diffResponse(
  response: Record<string, unknown>,
  baseResponse: Record<string, unknown>
): Record<string, unknown> {
  const moduleResponse: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(response)) {
    if (key === 'temp') {
      applyResponseTemp(moduleResponse, value, baseResponse.temp as Record<string, unknown> | undefined)
    } else if (key === 'error') {
      // response.error is object-shaped (status code -> {type, message}); drop only the
      // sub-keys that match base, keeping this module's own overridden status codes
      applyObjectDiff(moduleResponse, 'error', value, baseResponse.error as Record<string, unknown> | undefined)
    } else if (key === 'valid') {
      applyResponseValid(moduleResponse, value, baseResponse.valid)
    } else {
      moduleResponse[key] = value
    }
  }
  return moduleResponse
}

// Remove common response.temp sub-fields, keep module-specific ones
function applyResponseTemp(
  out: Record<string, unknown>,
  value: unknown,
  baseTemp: Record<string, unknown> | undefined
): void {
  if (!baseTemp || !isObjectLike(value)) {
    out.temp = value
    return
  }
  const moduleTemp = diffKeys(value, baseTemp)
  if (Object.keys(moduleTemp).length > 0) {
    out.temp = moduleTemp
  }
}

/**
 * Keeps `value` as-is when there is no base object or `value` is not a plain object, keeps
 * only the differing sub-keys otherwise, and drops the key when nothing differs.
 */
function applyObjectDiff(
  out: Record<string, unknown>,
  key: string,
  value: unknown,
  baseObj: Record<string, unknown> | undefined
): void {
  const diffed = baseObj ? diffAgainstBaseObject(value, baseObj) : undefined
  if (diffed === undefined) {
    out[key] = value
  } else if (Object.keys(diffed).length > 0) {
    out[key] = diffed
  }
}

// response.valid is usually a scalar but can be object-shaped for some modules;
// diff per-key when base is object-shaped, otherwise fall back to a scalar match
function applyResponseValid(out: Record<string, unknown>, value: unknown, baseValid: unknown): void {
  if (isPlainObj(baseValid)) {
    applyObjectDiff(out, 'valid', value, baseValid)
  } else if (baseValid === undefined || JSON.stringify(value) !== JSON.stringify(baseValid)) {
    out.valid = value
  }
}

// ---- RPC reference transformation ----

function transformRpcReferences(content: string, appName: string): string {
  const escaped = appName.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
  const pattern = new RegExp(String.raw`rpc://${escaped}@\d+/`, 'g')
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

// Unlike isPlainObj this accepts arrays: the temp handling always treated an array temp as an object
function isObjectLike(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null
}

/**
 * Deduped union of scope arrays across every attached account. The one confirmed real
 * sample (google-email) only ever has a single account, so this is unverified for the
 * multi-account case — flagged as an assumption, not a confirmed shape.
 */
function extractAccountScopes(accounts: unknown): string[] {
  if (!isPlainObj(accounts)) return []
  const scopes = new Set<string>()
  for (const account of Object.values(accounts)) {
    if (!isPlainObj(account)) continue
    const scope = account.scope
    if (Array.isArray(scope)) {
      for (const s of scope) scopes.add(String(s))
    }
  }
  return [...scopes]
}

/**
 * Recursively remove fields from `epoch` that are identical to `modApi`.
 * For nested objects, recurse and keep only differing sub-fields.
 */
function removeCommonFields(epoch: Record<string, unknown>, modApi: Record<string, unknown>): Record<string, unknown> {
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
