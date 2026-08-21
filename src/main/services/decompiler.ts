import { ExtractedFile } from '../types'
import { parseCompiledJs, parseFunctions } from './decompiler-sandbox'

// Scalar fields that belong in base.imljson (common across all modules). `method` is
// deliberately excluded: it must never be promoted to base or stripped from any
// module/step, regardless of whether it matches — every component keeps its own.
const BASE_TOP_FIELDS = ['baseUrl', 'timeout', 'body']
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

// RPC types that belong to webhooks, not modules
const HOOK_RPC_TYPES = new Set(['attach', 'detach', 'update'])

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
      // rawItem.expect wins only if a non-empty array; else falls through to __IMTCONN__ nested.store, else []
      const rawExpect = mod.rawItem.expect
      const hasRawExpect = Array.isArray(rawExpect) && rawExpect.length > 0
      let expect: unknown = hasRawExpect ? rawExpect : []
      if (!hasRawExpect && params && params.length > 0) {
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

  // Collect webhook names from instant_trigger modules
  const webhookNames = new Set(modules.filter((m) => m.webhook).map((m) => m.webhook!))

  // Generate RPC files
  for (const [name, api] of Object.entries(rpcApis)) {
    // RPC names like "epoch:WatchBoardItemsV2" → modules/WatchBoardItemsV2/epoch.imljson
    // Hook RPCs like "attach:hookName" → webhooks/hookName/attach.imljson
    if (name.includes(':')) {
      const colonIdx = name.indexOf(':')
      const fileBase = name.substring(0, colonIdx)
      const targetName = name.substring(colonIdx + 1)
      const cleaned = cleanApi(api, baseConfig)

      // Hook RPCs (attach/detach/update) go to webhooks/ directory
      const isHookRpc = HOOK_RPC_TYPES.has(fileBase) && webhookNames.has(targetName)
      if (isHookRpc) {
        const content = transformRpcReferences(stringify(cleaned), appName)
        result.push({ path: `webhooks/${targetName}/${fileBase}.imljson`, content })
        continue
      }

      // Module RPCs (epoch, etc.) — remove fields identical to the module's api.imljson
      const modApi = moduleCleanedApis[targetName]
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
      result.push({ path: `modules/${targetName}/${fileBase}.imljson`, content })
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
  // (app's rpc.js may override these via doDecompileApp into webhooks/{hookName}/)
  result.push(makeFile('attach.imljson', {}))
  result.push(makeFile('detach.imljson', {}))
  result.push(makeFile('update.imljson', {}))

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
    // Collect all values per module (a module may have multiple comm steps)
    const moduleValues: string[][] = []

    for (const api of apis) {
      const vals: string[] = []
      if (api[field] !== undefined) {
        vals.push(JSON.stringify(api[field]))
      } else {
        // Check inside ALL communication steps (not just [0])
        const comm = api.communication as Record<string, unknown>[] | undefined
        if (Array.isArray(comm)) {
          for (const step of comm) {
            if (step[field] !== undefined) {
              vals.push(JSON.stringify(step[field]))
            }
          }
        }
      }
      if (vals.length > 0) moduleValues.push(vals)
    }

    const bestVal = pluralityWinner(moduleValues, apis.length, SCALAR_MIN_VALUE_SHARE)
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
  const baseError = extractCommonObjectField(apis, (api) =>
    getAllResponseObjs(api)
      .map((r) => r.error)
      .filter(isPlainObj)
  )
  if (Object.keys(baseError).length > 0) {
    if (!base.response) base.response = {}
    ;(base.response as Record<string, unknown>).error = baseError
  }

  // response.valid is usually a scalar (boolean/template string) but is object-shaped for
  // some modules (e.g. { condition }); try the composite per-key path first, and only fall
  // back to a scalar plurality match if no object-shaped consensus was found.
  const baseValidObj = extractCommonObjectField(apis, (api) =>
    getAllResponseObjs(api)
      .map((r) => r.valid)
      .filter(isPlainObj)
  )
  if (Object.keys(baseValidObj).length > 0) {
    if (!base.response) base.response = {}
    ;(base.response as Record<string, unknown>).valid = baseValidObj
  } else {
    const moduleValues: string[][] = []
    for (const api of apis) {
      const vals: string[] = []
      for (const response of getAllResponseObjs(api)) {
        if (response.valid !== undefined) vals.push(JSON.stringify(response.valid))
      }
      if (vals.length > 0) moduleValues.push(vals)
    }
    const bestVal = pluralityWinner(moduleValues, apis.length, SCALAR_MIN_VALUE_SHARE)
    if (bestVal !== undefined) {
      if (!base.response) base.response = {}
      ;(base.response as Record<string, unknown>).valid = JSON.parse(bestVal)
    }
  }

  // Extract common temp sub-fields across all modules
  const baseTemp = extractCommonTemp(apis)
  if (Object.keys(baseTemp).length > 0) {
    base.temp = baseTemp
  }

  // Extract common response.temp sub-fields across all modules
  const baseResponseTemp = extractCommonResponseTemp(apis)
  if (Object.keys(baseResponseTemp).length > 0) {
    if (!base.response) base.response = {}
    ;(base.response as Record<string, unknown>).temp = baseResponseTemp
  }

  return base
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
  const temps: Record<string, unknown>[] = []
  for (const api of apis) {
    const responses = getAllResponseObjs(api)
    for (const response of responses) {
      const temp = response.temp as Record<string, unknown> | undefined
      if (temp && typeof temp === 'object') {
        temps.push(temp)
      }
    }
  }

  if (temps.length < 2) return {}

  // Collect ALL keys from all temps (not just the first)
  const allKeys = new Set<string>()
  for (const temp of temps) {
    for (const key of Object.keys(temp)) {
      allKeys.add(key)
    }
  }

  const common: Record<string, unknown> = {}
  for (const key of allKeys) {
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

/**
 * Find temp sub-fields that are common (identical value) across ALL modules that have temp.
 * Scans ALL communication steps. Checks all keys across all temps.
 */
function extractCommonTemp(apis: Record<string, unknown>[]): Record<string, unknown> {
  const temps: Record<string, unknown>[] = []
  for (const api of apis) {
    const temp = api.temp as Record<string, unknown> | undefined
    if (temp && typeof temp === 'object') {
      temps.push(temp)
      continue
    }
    const comm = api.communication as Record<string, unknown>[] | undefined
    if (Array.isArray(comm)) {
      for (const step of comm) {
        const commTemp = step.temp as Record<string, unknown> | undefined
        if (commTemp && typeof commTemp === 'object') {
          temps.push(commTemp)
        }
      }
    }
  }

  if (temps.length < 2) return {}

  // Collect ALL keys from all temps (not just the first)
  const allKeys = new Set<string>()
  for (const temp of temps) {
    for (const key of Object.keys(temp)) {
      allKeys.add(key)
    }
  }

  const common: Record<string, unknown> = {}
  for (const key of allKeys) {
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
  const moduleObjs: Record<string, unknown>[][] = []
  for (const api of apis) {
    const objs = collect(api)
    if (objs.length > 0) moduleObjs.push(objs)
  }

  if (moduleObjs.length === 0) return {}

  const allKeys = new Set<string>()
  for (const objs of moduleObjs) {
    for (const obj of objs) {
      for (const key of Object.keys(obj)) allKeys.add(key)
    }
  }

  const common: Record<string, unknown> = {}
  for (const key of allKeys) {
    const perModuleValues: string[][] = []
    for (const objs of moduleObjs) {
      const vals = objs.filter((o) => o[key] !== undefined).map((o) => JSON.stringify(o[key]))
      if (vals.length > 0) perModuleValues.push(vals)
    }

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
  const diffed: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    if (!(key in baseObj) || JSON.stringify(v) !== JSON.stringify(baseObj[key])) {
      diffed[key] = v
    }
  }
  return diffed
}

function removeBaseFields(api: Record<string, unknown>, baseConfig: Record<string, unknown>): Record<string, unknown> {
  const result = { ...api }

  // Only remove top-level base fields if their value matches the base value
  for (const field of BASE_TOP_FIELDS) {
    if (baseConfig[field] !== undefined && result[field] !== undefined) {
      if (JSON.stringify(result[field]) === JSON.stringify(baseConfig[field])) {
        delete result[field]
      }
      // If values differ, keep the module-specific value
    }
  }

  // Remove common composite-field sub-keys (whichever fields extraction found), keep module-specific ones
  for (const field of Object.keys(baseConfig)) {
    if (BASE_TOP_FIELDS.includes(field) || DEDICATED_FIELDS.has(field)) continue
    const baseFieldObj = baseConfig[field] as Record<string, unknown>
    const diffed = diffAgainstBaseObject(result[field], baseFieldObj)
    if (diffed !== undefined) {
      if (Object.keys(diffed).length > 0) {
        result[field] = diffed
      } else {
        delete result[field]
      }
    }
  }

  // Handle response: remove base response fields and common response.temp sub-fields
  const response = result.response as Record<string, unknown> | undefined
  const baseResponse = baseConfig.response as Record<string, unknown> | undefined
  if (response && baseResponse) {
    const moduleResponse: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(response)) {
      if (key === 'temp') {
        // Remove common response.temp sub-fields, keep module-specific ones
        const baseResponseTemp = baseResponse.temp as Record<string, unknown> | undefined
        if (baseResponseTemp && typeof value === 'object' && value !== null) {
          const moduleTemp: Record<string, unknown> = {}
          for (const [tKey, tValue] of Object.entries(value as Record<string, unknown>)) {
            if (!(tKey in baseResponseTemp) || JSON.stringify(tValue) !== JSON.stringify(baseResponseTemp[tKey])) {
              moduleTemp[tKey] = tValue
            }
          }
          if (Object.keys(moduleTemp).length > 0) {
            moduleResponse.temp = moduleTemp
          }
        } else {
          moduleResponse[key] = value
        }
      } else if (key === 'error') {
        // response.error is object-shaped (status code -> {type, message}); drop only the
        // sub-keys that match base, keeping this module's own overridden status codes
        const baseError = baseResponse.error as Record<string, unknown> | undefined
        if (baseError) {
          const diffed = diffAgainstBaseObject(value, baseError)
          if (diffed === undefined) {
            moduleResponse.error = value
          } else if (Object.keys(diffed).length > 0) {
            moduleResponse.error = diffed
          }
        } else {
          moduleResponse.error = value
        }
      } else if (key === 'valid') {
        // response.valid is usually a scalar but can be object-shaped for some modules;
        // diff per-key when base is object-shaped, otherwise fall back to a scalar match
        const baseValid = baseResponse.valid
        if (baseValid !== undefined) {
          if (isPlainObj(baseValid)) {
            const diffed = diffAgainstBaseObject(value, baseValid)
            if (diffed === undefined) {
              moduleResponse.valid = value
            } else if (Object.keys(diffed).length > 0) {
              moduleResponse.valid = diffed
            }
          } else if (JSON.stringify(value) !== JSON.stringify(baseValid)) {
            moduleResponse.valid = value
          }
        } else {
          moduleResponse.valid = value
        }
      } else {
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
        if (!(key in baseTemp) || JSON.stringify(value) !== JSON.stringify(baseTemp[key])) {
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
