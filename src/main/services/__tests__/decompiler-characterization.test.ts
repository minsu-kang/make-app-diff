import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanApi, decompileAccount, decompileApp, decompileHook, extractBaseFromAll } from '../decompiler'
import type { ExtractedFile } from '../../types'
import {
  BOARD_ACCOUNT_EXPECTED,
  BOARD_EXPECTED,
  BOARD_HOOK_EXPECTED,
  CRM_EXPECTED,
  TINY_EXPECTED
} from './decompiler-golden-expected'
import {
  type Api,
  boardAccountFiles,
  boardFiles,
  boardHookFiles,
  compiledJs,
  crmFiles,
  functionsJs,
  jsFile,
  manifestFile,
  singleClassJs,
  tinyFiles
} from './decompiler-golden-fixtures'

// Characterization tests for the base extraction and the app decompiler. They pin what the code does today
// (including the quirks listed under "pinned oddities") so a behavior-preserving refactor can be proven.

const ser = (value: unknown): string => JSON.stringify(value)

function contentOf(files: ExtractedFile[], path: string): string | undefined {
  return files.find((f) => f.path === path)?.content
}

function jsonOf(files: ExtractedFile[], path: string): unknown {
  const content = contentOf(files, path)
  if (content === undefined) throw new Error(`File not found: ${path}`)
  return JSON.parse(content)
}

function pathsOf(files: ExtractedFile[]): string[] {
  return files.map((f) => f.path)
}

function repeat(count: number, make: (i: number) => Api): Api[] {
  return Array.from({ length: count }, (_, i) => make(i))
}

const CONN_PARAM = { name: '__IMTCONN__', type: 'account:acc' }
const HOOK_PARAM = { name: '__IMTHOOK__', type: 'hook:hk' }
const FALSY_VALUES: [unknown][] = [[null], [false], [0], ['']]

/** An app whose manifest lists one parameterless action per api, with the apis compiled into lib/app.js */
function decompileApis(apis: Record<string, unknown>, manifest: Api = {}, appName = 'app'): ExtractedFile[] {
  const actions = Object.keys(apis).map((name) => ({ name, parameters: [] }))
  const files = [manifestFile({ name: appName, actions, ...manifest }), jsFile('lib/app.js', compiledJs(apis))]
  return decompileApp(files, appName)
}

/** Modules in lib/app.js plus RPCs in lib/rpc.js; every module is a parameterless action */
function decompileWithRpcs(modules: Record<string, unknown>, rpcs: Record<string, unknown>, manifest: Api = {}) {
  const actions = Object.keys(modules).map((name) => ({ name, parameters: [] }))
  const files = [
    manifestFile({ name: 'app', actions, ...manifest }),
    jsFile('lib/app.js', compiledJs(modules)),
    jsFile('lib/rpc.js', compiledJs(rpcs, 'ExecuteRpc'))
  ]
  return decompileApp(files, 'app')
}

function decompileManifest(manifest: Api, appName = 'app'): ExtractedFile[] {
  return decompileApp([manifestFile(manifest)], appName)
}

afterEach(() => {
  vi.restoreAllMocks()
})

// ---- extractBaseFromAll: scalar fields ----

describe('extractBaseFromAll scalar fields', () => {
  it('returns an empty base for no modules', () => {
    expect(extractBaseFromAll([])).toEqual({})
  })

  it('emits baseUrl, timeout and body in that order whatever the order inside the api', () => {
    const api = { body: 'B', timeout: 5, baseUrl: 'U', url: '/x' }
    expect(ser(extractBaseFromAll([api, { ...api }]))).toBe('{"baseUrl":"U","timeout":5,"body":"B"}')
  })

  it('never promotes method, url or any other plain scalar', () => {
    const api = { url: '/x', method: 'GET', name: 'n' }
    expect(extractBaseFromAll([api, { ...api }])).toEqual({})
  })

  it.each([[0], [null]])('promotes a defined but falsy timeout (%s) from a flat api', (value) => {
    expect(extractBaseFromAll([{ timeout: value }, { timeout: value }])).toEqual({ timeout: value })
  })

  it.each([[0], [null]])('promotes a defined but falsy timeout (%s) from a communication step', (value) => {
    const api = { communication: [{ timeout: value }] }
    expect(extractBaseFromAll([api, { communication: [{ timeout: value }] }])).toEqual({ timeout: value })
  })

  it('prefers the top-level value over the communication steps of the same module', () => {
    const apis = [{ baseUrl: 'A', communication: [{ baseUrl: 'B' }] }, { baseUrl: 'B' }]
    expect(extractBaseFromAll(apis)).toEqual({ baseUrl: 'A' })
  })

  it('reads every communication step, not only the first one', () => {
    const apis = [{ communication: [{ url: '/a' }, { url: '/b', baseUrl: 'B' }] }, { baseUrl: 'B' }]
    expect(extractBaseFromAll(apis)).toEqual({ baseUrl: 'B' })
  })

  it('ignores communication that is not an array', () => {
    expect(extractBaseFromAll([{ communication: { baseUrl: 'B' } }, { baseUrl: 'B' }])).toEqual({})
  })

  it('lets a module vote once per distinct value, however many steps repeat it', () => {
    const apis = [
      { communication: [{ baseUrl: 'A' }, { baseUrl: 'A' }, { baseUrl: 'A' }] },
      { baseUrl: 'B' },
      { baseUrl: 'B' }
    ]
    expect(extractBaseFromAll(apis)).toEqual({ baseUrl: 'B' })
  })

  it('breaks a tie in favour of the value seen first', () => {
    expect(extractBaseFromAll([{ baseUrl: 'A' }, { baseUrl: 'B' }])).toEqual({ baseUrl: 'A' })
    expect(extractBaseFromAll([{ baseUrl: 'B' }, { baseUrl: 'A' }])).toEqual({ baseUrl: 'B' })
  })

  it('breaks a numeric tie in favour of the value seen first', () => {
    expect(extractBaseFromAll([{ timeout: 20 }, { timeout: 10 }])).toEqual({ timeout: 20 })
  })

  it.each([
    [{ baseUrl: 'A' }, { baseUrl: 'A' }, { baseUrl: 'A' }, { url: '/x' }],
    [{ timeout: 1 }, { timeout: 1 }, { timeout: 1 }, { url: '/x' }],
    [{ body: 'b' }, { body: 'b' }, { body: 'b' }, { url: '/x' }]
  ])('needs the field in every module (%j, %j, %j, %j)', (...apis) => {
    expect(extractBaseFromAll(apis)).toEqual({})
  })

  it.each([
    [10, 3, true],
    [11, 3, false],
    [10, 2, false],
    [5, 5, true]
  ])('with %i modules and %i of them agreeing the scalar is promoted: %s', (total, agreeing, promoted) => {
    const apis = repeat(total, (i) => ({ baseUrl: i < agreeing ? 'A' : `other${i}` }))
    expect(extractBaseFromAll(apis)).toEqual(promoted ? { baseUrl: 'A' } : {})
  })

  it('treats an object-shaped body as one atomic value and never runs it through the composite path', () => {
    const base = extractBaseFromAll([{ body: { a: 1, b: 2 } }, { body: { a: 1, b: 3 } }])
    expect(ser(base)).toBe('{"body":{"a":1,"b":2}}')
  })
})

// ---- extractBaseFromAll: composite fields ----

describe('extractBaseFromAll composite fields', () => {
  it('finds composite fields by name in the communication steps, in the order the steps list them', () => {
    const apis = [
      { communication: [{ headers: { h: '1' }, cookies: { c: '1' } }] },
      { communication: [{ cookies: { c: '1' }, headers: { h: '1' } }] }
    ]
    expect(ser(extractBaseFromAll(apis))).toBe('{"headers":{"h":"1"},"cookies":{"c":"1"}}')
  })

  it('discovers the root-level fields of an api before those of its steps', () => {
    const api = { communication: [{ headers: { h: '1' } }], qs: { q: '1' } }
    expect(ser(extractBaseFromAll([api, { ...api }]))).toBe('{"qs":{"q":"1"},"headers":{"h":"1"}}')
  })

  it('emits composite fields in discovery order, after the scalars and before response and temp', () => {
    const api = {
      temp: { t: 1 },
      response: { error: { default: { m: 1 } } },
      qs: { q: '1' },
      baseUrl: 'U',
      headers: { h: '1' }
    }
    const base = extractBaseFromAll([api, { ...api }])
    expect(ser(base)).toBe(
      '{"baseUrl":"U","qs":{"q":"1"},"headers":{"h":"1"},"response":{"error":{"default":{"m":1}}},"temp":{"t":1}}'
    )
  })

  it('promotes the sub-keys every module agrees on and keeps the first module sub-key order', () => {
    const apis = [{ headers: { B: '2', A: '1', X: 'x' } }, { headers: { A: '1', B: '2', Y: 'y' } }]
    expect(ser(extractBaseFromAll(apis))).toBe('{"headers":{"B":"2","A":"1"}}')
  })

  it.each([
    [10, 9, true],
    [10, 8, false],
    [20, 18, true],
    [19, 17, false]
  ])('with %i modules and %i of them agreeing on a header the sub-key is promoted: %s', (total, agreeing, promoted) => {
    const apis = repeat(total, (i) => ({ headers: { 'X-V': i < agreeing ? 'same' : `other${i}` } }))
    expect(extractBaseFromAll(apis)).toEqual(promoted ? { headers: { 'X-V': 'same' } } : {})
  })

  it.each([
    ['has other sub-keys only', { headers: { other: 'x' } }],
    ['has no such field at all', { url: '/x' }]
  ])('needs the sub-key in every module even when nine agree: the tenth %s', (_label, odd) => {
    const apis = [...repeat(9, () => ({ headers: { k: 'v' } })), odd]
    expect(extractBaseFromAll(apis)).toEqual({})
  })

  it('does not promote a field that is an object in one module and a string in another', () => {
    expect(extractBaseFromAll([{ qs: { a: '1' } }, { qs: 'a=1' }])).toEqual({})
  })

  it('does not treat an array-valued root field as a composite', () => {
    expect(extractBaseFromAll([{ qs: ['a'] }, { qs: ['a'] }])).toEqual({})
  })

  it('skips the steps whose value for the field is not an object', () => {
    const apis = [
      { communication: [{ qs: { a: '1' } }, { qs: 'raw' }, { url: '/c' }] },
      { communication: [{ qs: { a: '1' } }] }
    ]
    expect(extractBaseFromAll(apis)).toEqual({ qs: { a: '1' } })
  })

  it('lets every step of a module vote once per distinct value, the first value winning inside one module', () => {
    const steps = { communication: [{ qs: { v: '1' } }, { qs: { v: '2' } }] }
    expect(extractBaseFromAll([steps])).toEqual({ qs: { v: '1' } })
    expect(extractBaseFromAll([steps, { communication: [{ qs: { v: '2' } }] }])).toEqual({ qs: { v: '2' } })
  })

  it('collects the sub-keys of every step of a module, including keys that only a later step has', () => {
    const apis = [{ communication: [{ qs: { a: '1' } }, { qs: { b: '2' } }] }]
    expect(ser(extractBaseFromAll(apis))).toBe('{"qs":{"a":"1","b":"2"}}')
  })

  it('does not read steps from communication that is not an array when collecting a composite field', () => {
    expect(extractBaseFromAll([{ qs: { a: '1' } }, { communication: { qs: { a: '1' } } }])).toEqual({})
  })

  it('reads a root-level object before the steps of the same module', () => {
    const apis = [{ headers: { a: '1' }, communication: [{ headers: { a: '2' } }] }, { headers: { a: '2' } }]
    expect(extractBaseFromAll(apis)).toEqual({})
  })

  it('compares values by their JSON text, so another key order is another value', () => {
    const apis = [{ headers: { a: { x: 1, y: 2 } } }, { headers: { a: { y: 2, x: 1 } } }]
    expect(extractBaseFromAll(apis)).toEqual({})
  })

  it('promotes the single sub-keys of a lone module', () => {
    expect(extractBaseFromAll([{ headers: { a: '1' }, qs: { b: '2' } }])).toEqual({
      headers: { a: '1' },
      qs: { b: '2' }
    })
  })

  it.each([
    ['metadata', { note: 'x' }],
    ['response', { output: '{{body}}' }]
  ])('never promotes %s through the composite path', (field, value) => {
    expect(extractBaseFromAll([{ [field]: value }, { [field]: value }])).toEqual({})
  })

  it('keeps temp out of the composite path: 9 of 10 modules agreeing is not enough', () => {
    const apis = repeat(10, (i) => ({ temp: { a: i === 9 ? 'other' : 'same' } }))
    expect(extractBaseFromAll(apis)).toEqual({})
  })
})

// ---- extractBaseFromAll: response.error ----

describe('extractBaseFromAll response.error', () => {
  const error = (extra: Api = {}): Api => ({ '401': { type: 'Auth' }, default: { message: 'm' }, ...extra })

  it('promotes the status codes every module agrees on and drops the others', () => {
    const apis = [
      { response: { error: error({ '404': { type: 'X' } }) } },
      { response: { error: error({ '404': { type: 'Y' } }) } },
      { response: { error: error({ '404': { type: 'Z' } }) } }
    ]
    expect(ser(extractBaseFromAll(apis))).toBe(
      '{"response":{"error":{"401":{"type":"Auth"},"default":{"message":"m"}}}}'
    )
  })

  it('keeps a status code shared by 9 of 10 modules and lets the tenth override it', () => {
    const apis = repeat(10, (i) => ({ response: { error: { '429': { type: i === 9 ? 'Slow' : 'Rate' } } } }))
    expect(extractBaseFromAll(apis)).toEqual({ response: { error: { '429': { type: 'Rate' } } } })
  })

  it('reads the responses of communication steps and skips steps without one', () => {
    const apis = [
      { communication: [{ response: { error: error() } }, { url: '/b' }] },
      { communication: [{ response: { error: error() } }] }
    ]
    expect(extractBaseFromAll(apis)).toEqual({ response: { error: error() } })
  })

  it('looks at the top-level response only when there is one, even an empty one', () => {
    const apis = [{ response: {}, communication: [{ response: { error: error() } }] }, { response: { error: error() } }]
    expect(extractBaseFromAll(apis)).toEqual({})
  })

  it('falls back to the steps when the top-level response is null', () => {
    const apis = [
      { response: null, communication: [{ response: { error: error() } }] },
      { response: { error: error() } }
    ]
    expect(extractBaseFromAll(apis)).toEqual({ response: { error: error() } })
  })

  it('ignores communication that is not an array when looking for responses', () => {
    const apis = [{ communication: { response: { error: error() } } }, { response: { error: error() } }]
    expect(extractBaseFromAll(apis)).toEqual({})
  })

  it.each([
    ['a string', 'boom'],
    ['an array', ['boom']],
    ['null', null]
  ])('does not promote a response.error that is %s', (_label, value) => {
    expect(extractBaseFromAll([{ response: { error: value } }, { response: { error: value } }])).toEqual({})
  })

  it('does not promote a response.error that only some modules have', () => {
    const apis = [{ response: { error: error() } }, { response: { error: error() } }, { response: { output: 'o' } }]
    expect(extractBaseFromAll(apis)).toEqual({})
  })

  it('promotes the response.error of a lone module', () => {
    expect(extractBaseFromAll([{ response: { error: error() } }])).toEqual({ response: { error: error() } })
  })
})

// ---- extractBaseFromAll: response.valid ----

describe('extractBaseFromAll response.valid', () => {
  const valid = (value: unknown): Api => ({ response: { valid: value } })

  it.each([
    ['a string', '{{statusCode < 400}}'],
    ['false', false],
    ['null', null]
  ])('promotes a scalar valid that is %s in every module', (_label, value) => {
    expect(extractBaseFromAll([valid(value), valid(value)])).toEqual({ response: { valid: value } })
  })

  it('promotes the keys of an object-shaped valid per key', () => {
    const apis = [valid({ condition: 'c', extra: 1 }), valid({ condition: 'c' })]
    expect(ser(extractBaseFromAll(apis))).toBe('{"response":{"valid":{"condition":"c"}}}')
  })

  it('falls back to the whole object when the modules agree on no single key', () => {
    const apis = [valid({ a: 1 }), valid({ a: 2 })]
    expect(extractBaseFromAll(apis)).toEqual({ response: { valid: { a: 1 } } })
  })

  it('falls back to the plurality of whole values when scalar and object valid are mixed', () => {
    expect(extractBaseFromAll([valid('x'), valid({ a: 1 })])).toEqual({ response: { valid: 'x' } })
    expect(extractBaseFromAll([valid({ a: 1 }), valid('x')])).toEqual({ response: { valid: { a: 1 } } })
  })

  it.each([
    [10, 3, true],
    [10, 2, false],
    [11, 3, false],
    [10, 5, true]
  ])('with %i modules and %i of them agreeing a scalar valid is promoted: %s', (total, agreeing, promoted) => {
    const apis = repeat(total, (i) => valid(i < agreeing ? 'ok' : `other${i}`))
    expect(extractBaseFromAll(apis)).toEqual(promoted ? { response: { valid: 'ok' } } : {})
  })

  it('does not promote a valid that only some modules have', () => {
    expect(extractBaseFromAll([valid('ok'), valid('ok'), { response: { output: 'o' } }])).toEqual({})
  })

  it('reads valid from communication steps and lets a module vote once per distinct value', () => {
    const apis = [
      { communication: [valid('ok'), valid('ok'), valid('ok')] },
      { communication: [valid('other')] },
      { communication: [valid('other')] }
    ]
    expect(extractBaseFromAll(apis)).toEqual({ response: { valid: 'other' } })
  })

  it('breaks a tie between scalar valid values in favour of the first module', () => {
    expect(extractBaseFromAll([valid('a'), valid('b')])).toEqual({ response: { valid: 'a' } })
    expect(extractBaseFromAll([valid('b'), valid('a')])).toEqual({ response: { valid: 'b' } })
  })

  it('promotes the valid of a lone module', () => {
    expect(extractBaseFromAll([valid('ok')])).toEqual({ response: { valid: 'ok' } })
  })
})

// ---- extractBaseFromAll: temp and response.temp ----

describe('extractBaseFromAll temp', () => {
  const temp = (value: unknown): Api => ({ temp: value })

  it('promotes the keys with an identical value in every temp, in first-seen key order', () => {
    const apis = [temp({ b: 1, a: { x: 1 }, c: 3, only1: 1 }), temp({ a: { x: 1 }, d: 4, b: 1, c: 'changed' })]
    expect(ser(extractBaseFromAll(apis))).toBe('{"temp":{"b":1,"a":{"x":1}}}')
  })

  it('needs at least two temps: a lone temp is not promoted', () => {
    expect(extractBaseFromAll([temp({ a: 1 })])).toEqual({})
    expect(extractBaseFromAll([temp({ a: 1 }), { url: '/x' }])).toEqual({})
  })

  it('does not count modules that have no temp', () => {
    const apis = [temp({ a: 1, b: 1 }), { url: '/x' }, temp({ a: 1, b: 2 })]
    expect(extractBaseFromAll(apis)).toEqual({ temp: { a: 1 } })
  })

  it('needs the key in every temp, not just a matching value where it is present', () => {
    expect(extractBaseFromAll([temp({ a: 1, b: 2 }), temp({ a: 1 }), temp({ a: 1, b: 2 })])).toEqual({ temp: { a: 1 } })
  })

  it('collects temps from the communication steps of a module without a top-level temp', () => {
    const apis = [
      { communication: [temp({ a: 1, b: 1 }), { url: '/b' }, temp({ a: 1, b: 2 })] },
      { communication: [temp({ a: 1 })] }
    ]
    expect(extractBaseFromAll(apis)).toEqual({ temp: { a: 1 } })
  })

  it('counts two steps of one module as two temps', () => {
    const apis = [{ communication: [temp({ a: 1, b: 1 }), temp({ a: 1, b: 2 })] }]
    expect(extractBaseFromAll(apis)).toEqual({ temp: { a: 1 } })
  })

  it('reads the top-level temp only when a module has one, ignoring its steps', () => {
    const apis = [
      { temp: { a: 1 }, communication: [temp({ a: 2 })] },
      { temp: { a: 1 }, communication: [temp({ a: 3 })] }
    ]
    expect(extractBaseFromAll(apis)).toEqual({ temp: { a: 1 } })
  })

  it.each([
    ['a string', 'x'],
    ['null', null],
    ['a number', 7]
  ])('ignores a top-level temp that is %s and reads the steps instead', (_label, value) => {
    const apis = [
      { temp: value, communication: [temp({ a: 1 })] },
      { temp: value, communication: [temp({ a: 1 })] }
    ]
    expect(extractBaseFromAll(apis)).toEqual({ temp: { a: 1 } })
  })

  it('skips a key that is undefined in every temp (synthetic input: parsed apps never have one)', () => {
    const apis = [temp({ a: undefined, b: 1 }), temp({ a: undefined, b: 1 })]
    expect(ser(extractBaseFromAll(apis))).toBe('{"temp":{"b":1}}')
  })

  it('treats an array temp like an object whose keys are the indexes (pinned oddity)', () => {
    expect(extractBaseFromAll([temp(['a', 'b']), temp(['a', 'c'])])).toEqual({ temp: { '0': 'a' } })
  })

  it('treats the array temp of a communication step like an object whose keys are the indexes (pinned oddity)', () => {
    const apis = [{ communication: [temp(['a', 'b'])] }, { communication: [temp(['a', 'c'])] }]
    expect(extractBaseFromAll(apis)).toEqual({ temp: { '0': 'a' } })
  })

  it('does not use the share rules for temp: 9 of 10 identical temps is not enough', () => {
    const apis = repeat(10, (i) => temp({ a: i === 9 ? 'other' : 'same' }))
    expect(extractBaseFromAll(apis)).toEqual({})
  })
})

describe('extractBaseFromAll response.temp', () => {
  const respTemp = (value: unknown): Api => ({ response: { temp: value } })

  it('promotes the keys with an identical value in every response.temp, in first-seen key order', () => {
    const apis = [respTemp({ b: 1, a: [1], c: 3, only1: 1 }), respTemp({ a: [1], d: 4, b: 1, c: 'changed' })]
    expect(ser(extractBaseFromAll(apis))).toBe('{"response":{"temp":{"b":1,"a":[1]}}}')
  })

  it('needs at least two temps: a lone response.temp is not promoted', () => {
    expect(extractBaseFromAll([respTemp({ a: 1 })])).toEqual({})
    expect(extractBaseFromAll([respTemp({ a: 1 }), { url: '/x' }])).toEqual({})
  })

  it('does not count modules that have no response.temp', () => {
    const apis = [respTemp({ a: 1, b: 1 }), { response: { output: 'o' } }, respTemp({ a: 1, b: 2 })]
    expect(extractBaseFromAll(apis)).toEqual({ response: { temp: { a: 1 } } })
  })

  it('needs the key in every temp', () => {
    const apis = [respTemp({ a: 1, b: 2 }), respTemp({ a: 1 }), respTemp({ a: 1, b: 2 })]
    expect(extractBaseFromAll(apis)).toEqual({ response: { temp: { a: 1 } } })
  })

  it('collects every step response of a module: two steps count as two temps', () => {
    const apis = [{ communication: [respTemp({ a: 1, b: 1 }), respTemp({ a: 1, b: 2 })] }]
    expect(extractBaseFromAll(apis)).toEqual({ response: { temp: { a: 1 } } })
  })

  it('reads the top-level response only when a module has one', () => {
    const apis = [
      { response: { output: 'o' }, communication: [respTemp({ a: 1 })] },
      { response: { output: 'o' }, communication: [respTemp({ a: 1 })] }
    ]
    expect(extractBaseFromAll(apis)).toEqual({})
  })

  it.each([
    ['a string', 'x'],
    ['null', null]
  ])('ignores a response.temp that is %s', (_label, value) => {
    expect(extractBaseFromAll([respTemp(value), respTemp({ a: 1 }), respTemp({ a: 1 })])).toEqual({
      response: { temp: { a: 1 } }
    })
  })

  it('skips a key that is undefined in every response.temp (synthetic input: parsed apps never have one)', () => {
    const apis = [respTemp({ a: undefined, b: 1 }), respTemp({ a: undefined, b: 1 })]
    expect(ser(extractBaseFromAll(apis))).toBe('{"response":{"temp":{"b":1}}}')
  })

  it('treats an array response.temp like an object whose keys are the indexes (pinned oddity)', () => {
    expect(extractBaseFromAll([respTemp(['a', 'b']), respTemp(['a', 'c'])])).toEqual({
      response: { temp: { '0': 'a' } }
    })
  })

  it('does not use the share rules for response.temp: 9 of 10 identical temps is not enough', () => {
    const apis = repeat(10, (i) => respTemp({ a: i === 9 ? 'other' : 'same' }))
    expect(extractBaseFromAll(apis)).toEqual({})
  })
})

describe('extractBaseFromAll key order of the response and temp entries', () => {
  const full = {
    temp: { t: 1 },
    response: { temp: { rt: 1 }, valid: 'ok', error: { default: { m: 1 } } }
  }

  it('builds response as error, valid, temp and puts temp after response', () => {
    const base = extractBaseFromAll([full, { ...full }])
    expect(ser(base)).toBe('{"response":{"error":{"default":{"m":1}},"valid":"ok","temp":{"rt":1}},"temp":{"t":1}}')
  })

  it('puts temp before response when response only comes into being through response.temp', () => {
    const api = { response: { temp: { rt: 1 } }, temp: { t: 1 } }
    expect(ser(extractBaseFromAll([api, { ...api }]))).toBe('{"temp":{"t":1},"response":{"temp":{"rt":1}}}')
  })

  it('adds an object-shaped valid next to the error in the same response', () => {
    const api = { response: { valid: { condition: 'c' }, error: { default: { m: 1 } } } }
    expect(ser(extractBaseFromAll([api, { ...api }]))).toBe(
      '{"response":{"error":{"default":{"m":1}},"valid":{"condition":"c"}}}'
    )
  })

  it('adds a fallback scalar valid and response.temp to a response that already holds the error', () => {
    const api = { response: { error: { default: { m: 1 } }, valid: 'ok', temp: { rt: 1 } } }
    expect(ser(extractBaseFromAll([api, { ...api }]))).toBe(
      '{"response":{"error":{"default":{"m":1}},"valid":"ok","temp":{"rt":1}}}'
    )
  })
})

// ---- cleanApi ----

describe('cleanApi without a base', () => {
  it('returns a flat api without its metadata', () => {
    expect(cleanApi({ url: '/x', metadata: { a: 1 }, qs: { q: 1 } }, {})).toEqual({ url: '/x', qs: { q: 1 } })
  })

  it('unwraps communication into the steps without their metadata and drops the keys next to it', () => {
    const raw = {
      baseUrl: 'dropped',
      communication: [{ url: '/a', metadata: { n: 1 }, baseUrl: 'B' }, { url: '/b' }]
    }
    expect(ser(cleanApi(raw, {}))).toBe('[{"url":"/a","baseUrl":"B"},{"url":"/b"}]')
  })

  it.each([
    ['an empty communication list', { url: '/x', communication: [] }, []],
    ['a null step', { communication: [null] }, [{}]]
  ])('unwraps %s into an array', (_label, raw, expected) => {
    expect(cleanApi(raw, {})).toEqual(expected)
  })

  it('treats communication that is not an array as an ordinary key', () => {
    expect(cleanApi({ url: '/x', communication: { a: 1 } }, {})).toEqual({ url: '/x', communication: { a: 1 } })
    expect(cleanApi({ url: '/x', communication: { a: 1 } }, { baseUrl: 'B' })).toEqual({
      url: '/x',
      communication: { a: 1 }
    })
  })

  it('does not modify the api it is given besides dropping its metadata', () => {
    const raw = { url: '/x', baseUrl: 'B', headers: { a: '1', b: '2' }, response: { error: { e: 1 } }, temp: { t: 1 } }
    const snapshot = structuredClone(raw)
    const base = { baseUrl: 'B', headers: { a: '1' }, response: { error: { e: 1 } }, temp: { t: 1 } }
    cleanApi(raw, base)
    expect(raw).toEqual(snapshot)
  })

  it('does not modify the steps it is given', () => {
    const step = { url: '/a', metadata: { n: 1 } }
    cleanApi({ communication: [step] }, {})
    expect(step).toEqual({ url: '/a', metadata: { n: 1 } })
  })
})

describe('cleanApi top-level scalars', () => {
  it('removes a scalar that equals base, keeps one that differs and keeps the key order', () => {
    const raw = { url: '/x', timeout: 1, baseUrl: 'B', body: 'b', method: 'GET' }
    const base = { baseUrl: 'B', timeout: 2, body: 'b' }
    expect(ser(cleanApi(raw, base))).toBe('{"url":"/x","timeout":1,"method":"GET"}')
  })

  it('leaves a scalar alone when base does not have it', () => {
    expect(ser(cleanApi({ url: '/x', timeout: 1 }, { baseUrl: 'B' }))).toBe('{"url":"/x","timeout":1}')
  })

  it('does not create a scalar the module does not have', () => {
    expect(ser(cleanApi({ url: '/x' }, { baseUrl: 'B', timeout: 1 }))).toBe('{"url":"/x"}')
  })

  it('removes a falsy scalar that equals base', () => {
    expect(ser(cleanApi({ url: '/x', timeout: 0 }, { timeout: 0 }))).toBe('{"url":"/x"}')
  })

  it('compares an object body whole: an equal one goes, a partial match stays untouched', () => {
    const base = { body: { a: 1 } }
    expect(ser(cleanApi({ url: '/x', body: { a: 1 } }, base))).toBe('{"url":"/x"}')
    expect(ser(cleanApi({ url: '/x', body: { a: 1, b: 2 } }, base))).toBe('{"url":"/x","body":{"a":1,"b":2}}')
  })

  it('does not diff a scalar field per key even when the module value is an object', () => {
    expect(cleanApi({ baseUrl: { a: 1 } }, { baseUrl: 'B' })).toEqual({ baseUrl: { a: 1 } })
  })
})

describe('cleanApi composite fields', () => {
  const base = { headers: { a: '1', b: '2' } }

  it('removes the field when every sub-key matches base', () => {
    expect(ser(cleanApi({ url: '/x', headers: { b: '2', a: '1' } }, base))).toBe('{"url":"/x"}')
  })

  it('keeps only the sub-keys that are missing from base or have another value, in module order', () => {
    const raw = { url: '/x', headers: { z: '9', a: '1', b: 'changed', y: '8' }, qs: { q: 1 } }
    expect(ser(cleanApi(raw, base))).toBe('{"url":"/x","headers":{"z":"9","b":"changed","y":"8"},"qs":{"q":1}}')
  })

  it('compares sub-key values by JSON text', () => {
    const nested = { headers: { a: { x: 1, y: 2 } } }
    expect(ser(cleanApi({ headers: { a: { y: 2, x: 1 } } }, nested))).toBe('{"headers":{"a":{"y":2,"x":1}}}')
    expect(ser(cleanApi({ headers: { a: { x: 1, y: 2 } } }, nested))).toBe('{}')
  })

  it.each([
    ['a string', 'raw'],
    ['an array', ['a']],
    ['null', null]
  ])('keeps a module value that is %s as it is', (_label, value) => {
    expect(cleanApi({ headers: value }, base)).toEqual({ headers: value })
  })

  it('does not create the field when the module does not have it', () => {
    expect(ser(cleanApi({ url: '/x' }, base))).toBe('{"url":"/x"}')
  })

  it('keeps the position of the field when only some sub-keys are removed', () => {
    expect(ser(cleanApi({ headers: { a: '1', c: '3' }, url: '/x' }, base))).toBe('{"headers":{"c":"3"},"url":"/x"}')
  })

  it('treats every base key besides the scalars and the dedicated ones as composite', () => {
    const raw = { url: '/x', log: { sanitize: ['a'], extra: 1 }, pagination: { c: 1 } }
    const merged = { log: { sanitize: ['a'] }, pagination: { c: 1 } }
    expect(ser(cleanApi(raw, merged))).toBe('{"url":"/x","log":{"extra":1}}')
  })
})

describe('cleanApi response', () => {
  const baseError = { '401': { t: 'A' }, '429': { t: 'B' } }

  it('returns the module response untouched when base has no response', () => {
    const raw = { response: { error: baseError, temp: { a: 1 }, valid: 'ok' } }
    expect(cleanApi(raw, { baseUrl: 'B' })).toEqual({ response: { error: baseError, temp: { a: 1 }, valid: 'ok' } })
  })

  it('does not create a response the module does not have', () => {
    expect(ser(cleanApi({ url: '/x' }, { response: { error: baseError } }))).toBe('{"url":"/x"}')
  })

  it('keeps the other keys in module order and the position of response', () => {
    const raw = { response: { output: 'o', error: baseError, iterate: 'i', valid: 'ok' }, url: '/x' }
    const base = { response: { error: baseError, valid: 'ok' } }
    expect(ser(cleanApi(raw, base))).toBe('{"response":{"output":"o","iterate":"i"},"url":"/x"}')
  })

  it('removes the response when nothing is left of it', () => {
    const raw = { url: '/x', response: { error: baseError, valid: 'ok', temp: { a: 1 } } }
    const base = { response: { error: baseError, valid: 'ok', temp: { a: 1 } } }
    expect(ser(cleanApi(raw, base))).toBe('{"url":"/x"}')
  })

  it('removes a module response that is empty to begin with', () => {
    expect(ser(cleanApi({ url: '/x', response: {} }, { response: { valid: 'ok' } }))).toBe('{"url":"/x"}')
  })
})

describe('cleanApi response.error', () => {
  const base = { response: { error: { '401': { t: 'A' }, '429': { t: 'B' } } } }
  const respond = (error: unknown): Api => ({ url: '/x', response: { error, output: 'o' } })

  it.each([
    ['equals base', { '401': { t: 'A' }, '429': { t: 'B' } }, '{"url":"/x","response":{"output":"o"}}'],
    [
      'has an extra status code',
      { '401': { t: 'A' }, '404': { t: 'N' } },
      '{"url":"/x","response":{"error":{"404":{"t":"N"}},"output":"o"}}'
    ],
    [
      'overrides a status code',
      { '401': { t: 'Z' }, '429': { t: 'B' } },
      '{"url":"/x","response":{"error":{"401":{"t":"Z"}},"output":"o"}}'
    ],
    ['has only the other status code', { '404': 1 }, '{"url":"/x","response":{"error":{"404":1},"output":"o"}}']
  ])('keeps only the status codes of an error object that %s', (_label, error, expected) => {
    expect(ser(cleanApi(respond(error), base))).toBe(expected)
  })

  it.each([
    ['a string', 'boom'],
    ['an array', ['boom']],
    ['null', null]
  ])('keeps an error that is %s as it is', (_label, error) => {
    expect(cleanApi(respond(error), base)).toEqual({ url: '/x', response: { error, output: 'o' } })
  })

  it('keeps the module error whole when base has no error', () => {
    const noError = { response: { valid: 'ok' } }
    expect(cleanApi(respond({ '401': { t: 'A' } }), noError)).toEqual({
      url: '/x',
      response: { error: { '401': { t: 'A' } }, output: 'o' }
    })
  })
})

describe('cleanApi response.valid', () => {
  const respond = (valid: unknown): Api => ({ url: '/x', response: { valid, output: 'o' } })
  const withValid = (valid: unknown): Api => ({ response: { valid } })
  const kept = (valid: unknown): string => ser({ url: '/x', response: { valid, output: 'o' } })
  const dropped = '{"url":"/x","response":{"output":"o"}}'

  it.each([
    ['equal scalar', 'ok', 'ok', false],
    ['different scalar', 'bad', 'ok', true],
    ['object against a scalar base', { a: 1 }, 'ok', true],
    ['scalar against an object base', 'ok', { a: 1 }, true],
    ['array against an object base', ['a'], { a: 1 }, true],
    ['false against false', false, false, false],
    ['true against false', true, false, true],
    ['null against null', null, null, false],
    ['equal array', ['a'], ['a'], false],
    ['different array', ['b'], ['a'], true],
    ['zero against null', 0, null, true]
  ])('compares a %s whole', (_label, module, baseValid, isKept) => {
    expect(ser(cleanApi(respond(module), withValid(baseValid)))).toBe(isKept ? kept(module) : dropped)
  })

  it('keeps the module valid when base has none', () => {
    expect(ser(cleanApi(respond('ok'), { response: { error: { a: 1 } } }))).toBe(kept('ok'))
  })

  it('removes an object valid that equals the object base and diffs a partial one per key', () => {
    const base = withValid({ condition: 'c', extra: 1 })
    expect(ser(cleanApi(respond({ condition: 'c', extra: 1 }), base))).toBe(dropped)
    expect(ser(cleanApi(respond({ condition: 'c', own: 2, extra: 'x' }), base))).toBe(kept({ own: 2, extra: 'x' }))
  })

  it('keeps all keys of an object valid that shares none with the object base', () => {
    expect(ser(cleanApi(respond({ own: 2 }), withValid({ condition: 'c' })))).toBe(kept({ own: 2 }))
  })
})

describe('cleanApi response.temp', () => {
  const base = { response: { temp: { shared: 1, nested: { a: 1 } } } }
  const respond = (temp: unknown): Api => ({ url: '/x', response: { temp, output: 'o' } })
  const dropped = '{"url":"/x","response":{"output":"o"}}'

  it('removes a response.temp that equals base', () => {
    expect(ser(cleanApi(respond({ shared: 1, nested: { a: 1 } }), base))).toBe(dropped)
  })

  it('keeps only the sub-keys that are missing from base or differ, in module order', () => {
    const temp = { own: 1, shared: 1, nested: { a: 2 }, other: 2 }
    expect(ser(cleanApi(respond(temp), base))).toBe(
      '{"url":"/x","response":{"temp":{"own":1,"nested":{"a":2},"other":2},"output":"o"}}'
    )
  })

  it.each([
    ['a string', 'raw'],
    ['null', null],
    ['a number', 5]
  ])('keeps a response.temp that is %s as it is', (_label, temp) => {
    expect(cleanApi(respond(temp), base)).toEqual({ url: '/x', response: { temp, output: 'o' } })
  })

  it('keeps the module response.temp when base has none', () => {
    const noTemp = { response: { valid: 'ok' } }
    expect(cleanApi(respond({ shared: 1 }), noTemp)).toEqual({
      url: '/x',
      response: { temp: { shared: 1 }, output: 'o' }
    })
  })

  it('turns an array response.temp into an object keyed by index when base has a response.temp (pinned oddity)', () => {
    expect(ser(cleanApi(respond(['a', 'b']), base))).toBe(
      '{"url":"/x","response":{"temp":{"0":"a","1":"b"},"output":"o"}}'
    )
  })
})

describe('cleanApi temp', () => {
  const base = { temp: { shared: 1, nested: { a: 1 } } }

  it('removes a temp that equals base', () => {
    expect(ser(cleanApi({ url: '/x', temp: { nested: { a: 1 }, shared: 1 } }, base))).toBe('{"url":"/x"}')
  })

  it('keeps only the sub-keys that are missing from base or differ, in module order', () => {
    const raw = { url: '/x', temp: { own: 1, shared: 1, nested: { a: 2 } }, qs: { q: 1 } }
    expect(ser(cleanApi(raw, base))).toBe('{"url":"/x","temp":{"own":1,"nested":{"a":2}},"qs":{"q":1}}')
  })

  it.each([
    ['a string', 'raw'],
    ['null', null],
    ['a number', 5]
  ])('keeps a temp that is %s as it is', (_label, temp) => {
    expect(cleanApi({ url: '/x', temp }, base)).toEqual({ url: '/x', temp })
  })

  it('does not create a temp the module does not have', () => {
    expect(ser(cleanApi({ url: '/x' }, base))).toBe('{"url":"/x"}')
  })

  it('keeps the module temp untouched when base has none', () => {
    expect(cleanApi({ temp: { shared: 1 } }, { baseUrl: 'B' })).toEqual({ temp: { shared: 1 } })
  })

  it('turns an array temp into an object keyed by index when base has a temp (pinned oddity)', () => {
    expect(ser(cleanApi({ temp: ['a', 'b'] }, base))).toBe('{"temp":{"0":"a","1":"b"}}')
  })
})

describe('cleanApi communication steps with a base', () => {
  it('strips every step on its own, without metadata, and keeps the step order', () => {
    const base = {
      baseUrl: 'B',
      headers: { a: '1' },
      response: { error: { '401': { t: 'A' } }, valid: 'ok', temp: { rt: 1 } },
      temp: { t: 1 }
    }
    const raw = {
      communication: [
        {
          url: '/1',
          metadata: { n: 1 },
          baseUrl: 'B',
          headers: { a: '1', own: '2' },
          response: { error: { '401': { t: 'A' } }, valid: 'ok', temp: { rt: 1, own: 1 }, output: 'o' },
          temp: { t: 1, own: 1 }
        },
        { url: '/2', baseUrl: 'other', response: { valid: 'bad' } }
      ]
    }
    expect(ser(cleanApi(raw, base))).toBe(
      '[{"url":"/1","headers":{"own":"2"},"response":{"temp":{"own":1},"output":"o"},"temp":{"own":1}},' +
        '{"url":"/2","baseUrl":"other","response":{"valid":"bad"}}]'
    )
  })
})

// ---- decompileApp: manifest, metadata, groups ----

describe('decompileApp metadata and groups', () => {
  it('emits .sdk and metadata.json with the four manifest keys in a fixed order, then the SDK version', () => {
    const manifest = { theme: '#000', description: '', version: 9, label: 'L', name: 'n', extra: 'x' }
    const result = decompileManifest(manifest)
    expect(contentOf(result, 'metadata.json')).toBe(
      '{\n    "name": "n",\n    "label": "L",\n    "description": "",\n    "theme": "#000",\n    "version": 2\n}'
    )
    expect(contentOf(result, '.sdk')).toBe('{\n    "version": 2\n}')
  })

  it('skips the metadata keys the manifest does not have', () => {
    const result = decompileManifest({ label: 'L' })
    expect(contentOf(result, 'metadata.json')).toBe('{\n    "label": "L",\n    "version": 2\n}')
  })

  it('emits only .sdk and metadata.json for a manifest without modules', () => {
    expect(pathsOf(decompileManifest({ name: 'n' }))).toEqual(['.sdk', 'metadata.json'])
  })

  it('emits groups.imljson as given when there are groups', () => {
    const result = decompileManifest({ name: 'n', groups: [{ name: 'g', label: 'G' }] })
    expect(contentOf(result, 'groups.imljson')).toBe('[\n    {\n        "name": "g",\n        "label": "G"\n    }\n]')
  })

  it.each([
    ['an empty array', []],
    ['an object', { a: 1 }],
    ['null', null],
    ['an empty string', '']
  ])('emits no groups.imljson when groups is %s', (_label, groups) => {
    expect(pathsOf(decompileManifest({ name: 'n', groups }))).toEqual(['.sdk', 'metadata.json'])
  })

  it('returns the very same files when there is no manifest', () => {
    const files = [jsFile('lib/app.js', 'x')]
    expect(decompileApp(files, 'app')).toBe(files)
  })

  it('does not look at files other than the manifest and lib/*.js and assets/', () => {
    const files = [
      manifestFile({ name: 'n' }),
      jsFile('readme.md', 'x'),
      jsFile('lib/other.js', 'y'),
      jsFile('modules/m.json', '{}')
    ]
    expect(pathsOf(decompileApp(files, 'app'))).toEqual(['.sdk', 'metadata.json'])
  })
})

// ---- decompileApp: module types, connections and webhooks ----

describe('decompileApp module typing', () => {
  it.each([
    ['actions', [CONN_PARAM], 'action', 'acc', null],
    ['searches', [CONN_PARAM], 'search', 'acc', null],
    ['triggers', [CONN_PARAM], 'trigger', 'acc', null],
    ['actions', [HOOK_PARAM], 'instant_trigger', null, 'hk'],
    ['searches', [HOOK_PARAM], 'instant_trigger', null, 'hk'],
    ['triggers', [HOOK_PARAM], 'instant_trigger', null, 'hk'],
    ['actions', [{ name: '__IMTCONN__', type: 'hook:hk' }], 'action', null, null],
    ['actions', [{ name: '__IMTCONN__' }], 'action', null, null],
    ['actions', [{ name: '__IMTCONN__', type: 'account' }], 'action', null, null],
    ['actions', [{ name: '__IMTHOOK__', type: 'hook' }], 'action', null, null],
    ['actions', [{ name: '__IMTHOOK__', type: 'account:acc' }], 'action', null, null],
    ['actions', [{ name: '__IMTHOOK__' }], 'action', null, null],
    ['actions', [{ name: 'other', type: 'account:acc' }], 'action', null, null],
    ['actions', [{ name: 'first' }, CONN_PARAM], 'action', null, null],
    ['actions', [], 'action', null, null],
    ['triggers', [{ name: 'first' }, HOOK_PARAM], 'trigger', null, null]
  ])(
    'a module in %s whose parameters are %j is a %s (connection %s, webhook %s)',
    (section, parameters, type, connection, webhook) => {
      const result = decompileManifest({ name: 'app', [section]: [{ name: 'm', parameters }] })
      const meta = jsonOf(result, 'modules/m/metadata.json') as Api
      expect({ type: meta.type, connection: meta.connection, webhook: meta.webhook }).toEqual({
        type,
        connection,
        webhook
      })
    }
  )

  it('treats a module without a parameters key like one with no parameters', () => {
    const result = decompileManifest({ name: 'app', actions: [{ name: 'm' }] })
    expect(contentOf(result, 'modules/m/metadata.json')).toBe(
      '{\n    "name": "m",\n    "connection": null,\n    "webhook": null,\n    "type": "action"\n}'
    )
  })

  it('writes the module metadata in manifest order, overriding connection, webhook and type in place', () => {
    const item = {
      label: 'L',
      name: 'm',
      connection: 'old',
      webhook: 'oldHook',
      type: 'weird',
      parameters: [CONN_PARAM],
      expect: [{ name: 'e' }],
      interface: [{ name: 'i' }],
      scope: ['s'],
      custom: true
    }
    const result = decompileManifest({ name: 'app', actions: [item] })
    expect(contentOf(result, 'modules/m/metadata.json')).toBe(
      '{\n    "label": "L",\n    "name": "m",\n    "connection": "acc",\n    "webhook": null,\n    "type": "action",\n    "custom": true\n}'
    )
  })

  it('lets the first module win a tie over a scalar: actions before searches before triggers', () => {
    const apis = { a: { baseUrl: 'A' }, s: { baseUrl: 'S' }, t: { baseUrl: 'T' } }
    const manifest = {
      name: 'app',
      triggers: [{ name: 't' }],
      searches: [{ name: 's' }],
      actions: [{ name: 'a' }]
    }
    const files = [manifestFile(manifest), jsFile('lib/app.js', compiledJs(apis))]
    expect(jsonOf(decompileApp(files, 'app'), 'base.imljson')).toEqual({ baseUrl: 'A' })
    const noActions = { name: 'app', triggers: [{ name: 't' }], searches: [{ name: 's' }] }
    const searchFirst = [manifestFile(noActions), jsFile('lib/app.js', compiledJs(apis))]
    expect(jsonOf(decompileApp(searchFirst, 'app'), 'base.imljson')).toEqual({ baseUrl: 'S' })
  })
})

// ---- decompileApp: per-module files ----

describe('decompileApp module files', () => {
  const rpcRef = (name: string): string => `rpc://app@1/${name}`
  const item = (extra: Api): Api => ({ name: 'm', parameters: [CONN_PARAM], ...extra })

  it('emits api, expect, interface, metadata, parameters, samples and scope for an action', () => {
    const result = decompileManifest({ name: 'app', actions: [item({})] })
    expect(pathsOf(result)).toEqual([
      '.sdk',
      'metadata.json',
      'modules/m/api.imljson',
      'modules/m/expect.imljson',
      'modules/m/interface.imljson',
      'modules/m/metadata.json',
      'modules/m/parameters.imljson',
      'modules/m/samples.imljson',
      'modules/m/scope.imljson'
    ])
  })

  it('emits no expect.imljson for a trigger and no expect or scope for an instant trigger', () => {
    const trigger = decompileManifest({ name: 'app', triggers: [item({})] })
    const instant = decompileManifest({ name: 'app', triggers: [item({ parameters: [HOOK_PARAM] })] })
    expect(pathsOf(trigger).filter((p) => p.startsWith('modules/'))).toEqual([
      'modules/m/api.imljson',
      'modules/m/interface.imljson',
      'modules/m/metadata.json',
      'modules/m/parameters.imljson',
      'modules/m/samples.imljson',
      'modules/m/scope.imljson'
    ])
    expect(pathsOf(instant).filter((p) => p.startsWith('modules/'))).toEqual([
      'modules/m/api.imljson',
      'modules/m/interface.imljson',
      'modules/m/metadata.json',
      'modules/m/parameters.imljson',
      'modules/m/samples.imljson'
    ])
  })

  it('writes scope.imljson for a regular trigger although the code comment says only actions and searches (pinned oddity)', () => {
    const result = decompileManifest({ name: 'app', triggers: [item({ scope: ['read'] })] })
    expect(contentOf(result, 'modules/m/scope.imljson')).toBe('[\n    "read"\n]')
  })

  it.each([['actions'], ['searches']])(
    'writes the scope, interface and samples of a %s and defaults them to empty',
    (section) => {
      const full = decompileManifest({
        name: 'app',
        [section]: [item({ scope: ['a', 'b'], interface: [{ name: 'i' }] })]
      })
      expect(contentOf(full, 'modules/m/scope.imljson')).toBe('[\n    "a",\n    "b"\n]')
      expect(contentOf(full, 'modules/m/interface.imljson')).toBe('[\n    {\n        "name": "i"\n    }\n]')
      const bare = decompileManifest({ name: 'app', [section]: [item({})] })
      expect(contentOf(bare, 'modules/m/scope.imljson')).toBe('[]')
      expect(contentOf(bare, 'modules/m/interface.imljson')).toBe('[]')
      expect(contentOf(bare, 'modules/m/samples.imljson')).toBe('{}')
    }
  )

  it.each(FALSY_VALUES)(
    'defaults expect, interface and scope to empty lists when they and the store are %j',
    (value) => {
      const parameters = [{ ...CONN_PARAM, options: { nested: { store: value } } }]
      const result = decompileManifest({ name: 'app', actions: [item({ parameters, interface: value, scope: value })] })
      const files = ['expect', 'interface', 'scope'].map((name) => contentOf(result, `modules/m/${name}.imljson`))
      expect(files).toEqual(['[]', '[]', '[]'])
    }
  )

  it('removes the separate-file keys from the module metadata and keeps the rest', () => {
    const result = decompileManifest({
      name: 'app',
      actions: [
        item({ label: 'L', description: 'D', expect: [{ name: 'e' }], interface: [], scope: [], extra: { k: 1 } })
      ]
    })
    expect(Object.keys(jsonOf(result, 'modules/m/metadata.json') as Api)).toEqual([
      'name',
      'label',
      'description',
      'extra',
      'connection',
      'webhook',
      'type'
    ])
  })

  it.each([['actions'], ['searches']])(
    'writes parameters.imljson of a %s as an empty list even when the connection has nested parameters',
    (section) => {
      const parameters = [{ ...CONN_PARAM, options: { nested: [{ name: 'p' }] } }]
      const result = decompileManifest({ name: 'app', [section]: [item({ parameters })] })
      expect(contentOf(result, 'modules/m/parameters.imljson')).toBe('[]')
    }
  )

  it('takes the parameters of a regular trigger from the connection nested list and transforms rpc references', () => {
    const nested = [{ name: 'p', options: { store: rpcRef('list') } }]
    const parameters = [{ ...CONN_PARAM, options: { nested } }]
    const result = decompileManifest({ name: 'app', triggers: [item({ parameters })] })
    expect(contentOf(result, 'modules/m/parameters.imljson')).toBe(
      '[\n    {\n        "name": "p",\n        "options": {\n            "store": "rpc://list"\n        }\n    }\n]'
    )
  })

  it('writes empty parameters for a regular trigger whose first parameter is not the connection', () => {
    const parameters = [{ name: 'other', options: { nested: [{ name: 'p' }] } }]
    const result = decompileManifest({ name: 'app', triggers: [item({ parameters })] })
    expect(contentOf(result, 'modules/m/parameters.imljson')).toBe('[]')
  })

  it('writes empty parameters for a regular trigger without parameters', () => {
    const result = decompileManifest({ name: 'app', triggers: [{ name: 'm' }] })
    expect(contentOf(result, 'modules/m/parameters.imljson')).toBe('[]')
  })

  it('leaves rpc references of instant trigger parameters alone while a regular trigger transforms them (pinned oddity)', () => {
    const nested = [{ name: 'p', options: { store: rpcRef('list') } }]
    const hook = [{ ...HOOK_PARAM, options: { nested } }]
    const result = decompileManifest({ name: 'app', triggers: [item({ parameters: hook })] })
    expect(contentOf(result, 'modules/m/parameters.imljson')).toContain('rpc://app@1/list')
  })

  it('writes empty parameters for an instant trigger whose nested list is not a non-empty array', () => {
    const hook = [{ ...HOOK_PARAM, options: { nested: { store: [{ name: 'p' }] } } }]
    const result = decompileManifest({ name: 'app', triggers: [item({ parameters: hook })] })
    expect(contentOf(result, 'modules/m/parameters.imljson')).toBe('[]')
  })

  it('classifies a module by parameters[0] even when parameters is an object, then finds no nested list (pinned oddity)', () => {
    const parameters = { '0': { ...HOOK_PARAM, options: { nested: [{ name: 'p' }] } } }
    const result = decompileManifest({ name: 'app', triggers: [item({ parameters })] })
    const meta = jsonOf(result, 'modules/m/metadata.json') as Api
    expect({ type: meta.type, webhook: meta.webhook }).toEqual({ type: 'instant_trigger', webhook: 'hk' })
    expect(contentOf(result, 'modules/m/parameters.imljson')).toBe('[]')
  })

  it('writes the same files for an action carrying a hook parameter as for any instant trigger', () => {
    const hook = [{ ...HOOK_PARAM, options: { nested: [{ name: 'p' }] } }]
    const result = decompileManifest({ name: 'app', actions: [item({ parameters: hook })] })
    expect(pathsOf(result).filter((p) => p.startsWith('modules/'))).toEqual([
      'modules/m/api.imljson',
      'modules/m/interface.imljson',
      'modules/m/metadata.json',
      'modules/m/parameters.imljson',
      'modules/m/samples.imljson'
    ])
  })

  it.each([
    [
      'a first parameter that is not the connection',
      [{ name: 'other', options: { nested: { store: [{ name: 'x' }] } } }]
    ],
    ['no nested list', [{ ...CONN_PARAM, options: {} }]],
    ['no options', [CONN_PARAM]],
    ['no store', [{ ...CONN_PARAM, options: { nested: {} } }]],
    ['a null store', [{ ...CONN_PARAM, options: { nested: { store: null } } }]],
    ['an empty parameter list', []]
  ])('writes an empty expect.imljson for %s', (_label, parameters) => {
    const result = decompileManifest({ name: 'app', actions: [item({ parameters })] })
    expect(contentOf(result, 'modules/m/expect.imljson')).toBe('[]')
  })

  it('prefers a non-empty rawItem.expect over the connection nested store', () => {
    const store = [{ name: 'fromStore' }]
    const parameters = [{ ...CONN_PARAM, options: { nested: { store } } }]
    const result = decompileManifest({ name: 'app', actions: [item({ parameters, expect: [{ name: 'fromExpect' }] })] })
    expect(jsonOf(result, 'modules/m/expect.imljson')).toEqual([{ name: 'fromExpect' }])
  })

  it('takes the connection nested store as expect only when it is the first parameter', () => {
    const second = [{ name: 'first' }, { ...CONN_PARAM, options: { nested: { store: [{ name: 'x' }] } } }]
    const result = decompileManifest({ name: 'app', actions: [item({ parameters: second })] })
    expect(contentOf(result, 'modules/m/expect.imljson')).toBe('[]')
  })

  it('transforms rpc references in interface.imljson and in expect.imljson from either source', () => {
    const store = [{ name: 'x', options: { store: rpcRef('stores') } }]
    const parameters = [{ ...CONN_PARAM, options: { nested: { store } } }]
    const viaStore = decompileManifest({
      name: 'app',
      actions: [item({ parameters, interface: [{ name: 'i', options: { store: rpcRef('ifaces') } }] })]
    })
    expect(contentOf(viaStore, 'modules/m/expect.imljson')).toContain('rpc://stores')
    expect(contentOf(viaStore, 'modules/m/interface.imljson')).toContain('rpc://ifaces')
    const viaExpect = decompileManifest({
      name: 'app',
      actions: [item({ expect: [{ name: 'x', options: { store: rpcRef('direct') } }] })]
    })
    expect(contentOf(viaExpect, 'modules/m/expect.imljson')).toContain('rpc://direct')
  })

  it('transforms rpc references of an instant trigger interface', () => {
    const iface = [{ name: 'i', options: { store: rpcRef('ifaces') } }]
    const result = decompileManifest({ name: 'app', triggers: [item({ parameters: [HOOK_PARAM], interface: iface })] })
    expect(contentOf(result, 'modules/m/interface.imljson')).toContain('rpc://ifaces')
  })

  it('writes an empty api.imljson for a module without a class in lib/app.js and leaves it out of base extraction', () => {
    const manifest = { name: 'app', actions: [{ name: 'a' }, { name: 'ghost' }, { name: 'b' }] }
    const apis = { a: { baseUrl: 'U', headers: { h: '1' } }, b: { baseUrl: 'U', headers: { h: '1' } } }
    const result = decompileApp([manifestFile(manifest), jsFile('lib/app.js', compiledJs(apis))], 'app')
    expect(jsonOf(result, 'base.imljson')).toEqual({ baseUrl: 'U', headers: { h: '1' } })
    expect(contentOf(result, 'modules/ghost/api.imljson')).toBe('{}')
    expect(contentOf(result, 'modules/a/api.imljson')).toBe('{}')
  })

  it('writes an empty api.imljson for a class whose api is null', () => {
    const result = decompileApis({ a: null, b: { url: '/b' } })
    expect(contentOf(result, 'modules/a/api.imljson')).toBe('{}')
    expect(contentOf(result, 'modules/b/api.imljson')).toBe('{\n    "url": "/b"\n}')
  })

  it('writes the api of a module without a lib/app.js as empty and emits no base', () => {
    const result = decompileManifest({ name: 'app', actions: [{ name: 'm' }] })
    expect(contentOf(result, 'modules/m/api.imljson')).toBe('{}')
    expect(pathsOf(result)).not.toContain('base.imljson')
  })

  it('emits modules that share a name twice, the earlier section first (sort ties keep the push order)', () => {
    const manifest = { name: 'app', actions: [{ name: 'dup' }], triggers: [{ name: 'dup' }] }
    const result = decompileManifest(manifest)
    const types = result
      .filter((f) => f.path === 'modules/dup/metadata.json')
      .map((f) => (JSON.parse(f.content) as Api).type)
    expect(types).toEqual(['action', 'trigger'])
  })

  it('orders the paths with localeCompare, not by code point: alpha before Beta', () => {
    const result = decompileManifest({ name: 'app', actions: [{ name: 'Beta' }, { name: 'alpha' }] })
    const apis = pathsOf(result).filter((p) => p.endsWith('/api.imljson'))
    expect(apis).toEqual(['modules/alpha/api.imljson', 'modules/Beta/api.imljson'])
  })
})

// ---- decompileApp: base extraction end to end ----

describe('decompileApp base extraction', () => {
  it('promotes everything a lone module has in common with itself (pinned: one module, one vote)', () => {
    const api = {
      url: '/x',
      method: 'GET',
      baseUrl: 'U',
      timeout: 5,
      headers: { h: '1' },
      qs: { q: '1' },
      response: { error: { default: { m: 1 } }, valid: 'ok', temp: { rt: 1 }, output: 'o' },
      temp: { t: 1 },
      log: { sanitize: ['a'] }
    }
    const result = decompileApis({ only: api })
    expect(jsonOf(result, 'base.imljson')).toEqual({
      baseUrl: 'U',
      timeout: 5,
      headers: { h: '1' },
      qs: { q: '1' },
      log: { sanitize: ['a'] },
      response: { error: { default: { m: 1 } }, valid: 'ok' }
    })
    expect(contentOf(result, 'modules/only/api.imljson')).toBe(
      '{\n    "url": "/x",\n    "method": "GET",\n    "response": {\n        "temp": {\n            "rt": 1\n        },\n        "output": "o"\n    },\n    "temp": {\n        "t": 1\n    }\n}'
    )
  })

  it('keeps method in every module although it is identical everywhere', () => {
    const result = decompileApis({ a: { url: '/a', method: 'GET' }, b: { url: '/b', method: 'GET' } })
    expect(pathsOf(result)).not.toContain('base.imljson')
    expect(contentOf(result, 'modules/a/api.imljson')).toBe('{\n    "url": "/a",\n    "method": "GET"\n}')
  })

  it('emits base.imljson only when something was promoted', () => {
    const plain = decompileApis({ a: { url: '/a' }, b: { url: '/b' } })
    const shared = decompileApis({ a: { url: '/a', baseUrl: 'U' }, b: { url: '/b', baseUrl: 'U' } })
    expect(pathsOf(plain).filter((p) => p === '.sdk' || p === 'base.imljson')).toEqual(['.sdk'])
    expect(pathsOf(shared).filter((p) => p === '.sdk' || p === 'base.imljson')).toEqual(['.sdk', 'base.imljson'])
  })

  it('strips base fields from the step objects of a communication module and writes them as an array', () => {
    const step = (url: string): Api => ({ url, baseUrl: 'U', headers: { h: '1', [url]: '2' } })
    const result = decompileApis({
      a: { communication: [step('/1'), step('/2')] },
      b: { baseUrl: 'U', headers: { h: '1' } }
    })
    expect(jsonOf(result, 'base.imljson')).toEqual({ baseUrl: 'U', headers: { h: '1' } })
    expect(contentOf(result, 'modules/a/api.imljson')).toBe(
      '[\n    {\n        "url": "/1",\n        "headers": {\n            "/1": "2"\n        }\n    },\n    {\n        "url": "/2",\n        "headers": {\n            "/2": "2"\n        }\n    }\n]'
    )
  })

  it('keeps a response.error status code override in the module that overrides it', () => {
    const error = (message: string): Api => ({ default: { message }, '429': { message: 'rate' } })
    const apis = repeat(10, (i) => ({ url: `/m${i}`, response: { error: error(i === 3 ? 'custom' : 'standard') } }))
    const named = Object.fromEntries(apis.map((api, i) => [`m${i}`, api]))
    const result = decompileApis(named)
    expect(jsonOf(result, 'base.imljson')).toEqual({ response: { error: error('standard') } })
    expect(jsonOf(result, 'modules/m3/api.imljson')).toEqual({
      url: '/m3',
      response: { error: { default: { message: 'custom' } } }
    })
    expect(jsonOf(result, 'modules/m4/api.imljson')).toEqual({ url: '/m4' })
  })

  it('does not put the metadata of an api into base even when every module has the same', () => {
    const api = (url: string): Api => ({ url, metadata: { author: 'x' } })
    const result = decompileApis({ a: api('/a'), b: api('/b') })
    expect(pathsOf(result)).not.toContain('base.imljson')
    expect(contentOf(result, 'modules/a/api.imljson')).toBe('{\n    "url": "/a"\n}')
  })
})

// ---- decompileApp: endpoints ----

describe('decompileApp endpoints', () => {
  const endpointFiles = (endpoints: Api[], endpointApis?: Record<string, unknown>): ExtractedFile[] => {
    const files = [manifestFile({ name: 'app', endpoints })]
    if (endpointApis) files.push(jsFile('lib/endpoints.js', compiledJs(endpointApis, 'ExecuteRpc')))
    return files
  }

  it('emits metadata, input and output parameters, scope, context and api per endpoint', () => {
    const result = decompileApp(endpointFiles([{ name: 'ep' }]), 'app')
    expect(pathsOf(result)).toEqual([
      '.sdk',
      'endpoints/ep/api.imljson',
      'endpoints/ep/context.md',
      'endpoints/ep/inputParameters.imljson',
      'endpoints/ep/metadata.json',
      'endpoints/ep/outputParameters.imljson',
      'endpoints/ep/scope.imljson',
      'metadata.json'
    ])
    expect(contentOf(result, 'endpoints/ep/api.imljson')).toBe('{}')
    expect(contentOf(result, 'endpoints/ep/context.md')).toBe('')
    expect(contentOf(result, 'endpoints/ep/inputParameters.imljson')).toBe('[]')
    expect(contentOf(result, 'endpoints/ep/outputParameters.imljson')).toBe('[]')
    expect(contentOf(result, 'endpoints/ep/scope.imljson')).toBe('[]')
    expect(contentOf(result, 'endpoints/ep/metadata.json')).toBe('{\n    "name": "ep"\n}')
  })

  it('removes the separate-file keys from the endpoint metadata and flattens accounts to their names', () => {
    const endpoint = {
      label: 'L',
      name: 'ep',
      scope: ['dropped'],
      api: { dropped: true },
      accounts: { b: { scope: [] }, a: { scope: [] } },
      inputParameters: [],
      outputParameters: [],
      context: 'ctx',
      schemaVersion: 1
    }
    const result = decompileApp(endpointFiles([endpoint]), 'app')
    expect(contentOf(result, 'endpoints/ep/metadata.json')).toBe(
      '{\n    "label": "L",\n    "name": "ep",\n    "accounts": [\n        "b",\n        "a"\n    ],\n    "schemaVersion": 1\n}'
    )
    expect(contentOf(result, 'endpoints/ep/context.md')).toBe('ctx')
  })

  it.each([
    ['an array', ['x']],
    ['a string', 'acc'],
    ['null', null]
  ])('keeps accounts as it is in the metadata when it is %s and emits an empty scope', (_label, accounts) => {
    const result = decompileApp(endpointFiles([{ name: 'ep', accounts }]), 'app')
    expect((jsonOf(result, 'endpoints/ep/metadata.json') as Api).accounts).toEqual(accounts)
    expect(contentOf(result, 'endpoints/ep/scope.imljson')).toBe('[]')
  })

  it('unions the scopes of the accounts in first-seen order, skipping what is not a scope list', () => {
    const accounts = {
      a: { scope: ['s1', 's2'] },
      b: { scope: ['s2', 3, 's3'] },
      c: { scope: 'not-a-list' },
      d: 'not-an-account',
      e: null,
      f: {}
    }
    const result = decompileApp(endpointFiles([{ name: 'ep', accounts }]), 'app')
    expect(jsonOf(result, 'endpoints/ep/scope.imljson')).toEqual(['s1', 's2', '3', 's3'])
  })

  it.each(FALSY_VALUES)(
    'defaults the parameters to empty lists and the context to empty text when they are %j',
    (value) => {
      const result = decompileApp(
        endpointFiles([{ name: 'ep', inputParameters: value, outputParameters: value, context: value }]),
        'app'
      )
      const paths = ['inputParameters.imljson', 'outputParameters.imljson', 'context.md']
      expect(paths.map((path) => contentOf(result, `endpoints/ep/${path}`))).toEqual(['[]', '[]', ''])
    }
  )

  it('passes the input and output parameters through', () => {
    const endpoint = { name: 'ep', inputParameters: [{ name: 'i' }], outputParameters: [{ name: 'o' }] }
    const result = decompileApp(endpointFiles([endpoint]), 'app')
    expect(jsonOf(result, 'endpoints/ep/inputParameters.imljson')).toEqual([{ name: 'i' }])
    expect(jsonOf(result, 'endpoints/ep/outputParameters.imljson')).toEqual([{ name: 'o' }])
  })

  it('writes an empty api for an endpoint that lib/endpoints.js has no class for', () => {
    const result = decompileApp(endpointFiles([{ name: 'ep' }, { name: 'other' }], { other: { url: '/o' } }), 'app')
    expect(contentOf(result, 'endpoints/ep/api.imljson')).toBe('{}')
    expect(contentOf(result, 'endpoints/other/api.imljson')).toBe('{\n    "url": "/o"\n}')
  })

  it('strips the base of the modules from the endpoint api and does not feed endpoints into the base', () => {
    const modules = { a: { url: '/a', baseUrl: 'U' }, b: { url: '/b', baseUrl: 'U' } }
    const files = [
      manifestFile({ name: 'app', actions: [{ name: 'a' }, { name: 'b' }], endpoints: [{ name: 'ep' }] }),
      jsFile('lib/app.js', compiledJs(modules)),
      jsFile('lib/endpoints.js', compiledJs({ ep: { url: '/e', baseUrl: 'V' } }, 'ExecuteRpc'))
    ]
    const result = decompileApp(files, 'app')
    expect(jsonOf(result, 'base.imljson')).toEqual({ baseUrl: 'U' })
    expect(jsonOf(result, 'endpoints/ep/api.imljson')).toEqual({ url: '/e', baseUrl: 'V' })
  })

  it('does not transform rpc references in an endpoint api', () => {
    const files = endpointFiles([{ name: 'ep' }], { ep: { url: 'rpc://app@1/x' } })
    expect(contentOf(decompileApp(files, 'app'), 'endpoints/ep/api.imljson')).toContain('rpc://app@1/x')
  })
})

// ---- decompileApp: RPCs ----

describe('decompileApp plain RPCs', () => {
  it.each([
    ['listItems', 'List Items'],
    ['ping', 'Ping'],
    ['getURLValue', 'Get U R L Value'],
    ['Already', 'Already'],
    ['getBoardLists2', 'Get Board Lists2']
  ])('labels the rpc %s as "%s"', (name, label) => {
    const result = decompileWithRpcs({}, { [name]: { url: '/x' } })
    expect(contentOf(result, `rpcs/${name}/metadata.json`)).toBe(
      `{\n    "name": "${name}",\n    "label": "${label}",\n    "connection": null\n}`
    )
  })

  it('writes metadata, api and empty parameters for an rpc, with the base of the modules stripped from the api', () => {
    const modules = { a: { url: '/a', baseUrl: 'U' }, b: { url: '/b', baseUrl: 'U' } }
    const result = decompileWithRpcs(modules, { list: { url: '/list', baseUrl: 'U', method: 'GET' } })
    expect(contentOf(result, 'rpcs/list/api.imljson')).toBe('{\n    "url": "/list",\n    "method": "GET"\n}')
    expect(contentOf(result, 'rpcs/list/parameters.imljson')).toBe('[]')
  })

  it('does not feed rpcs into the base and does not transform their rpc references', () => {
    const modules = { a: { url: '/a', baseUrl: 'U' }, b: { url: '/b', baseUrl: 'U' } }
    const result = decompileWithRpcs(modules, { list: { url: 'rpc://app@1/x', baseUrl: 'V' } })
    expect(jsonOf(result, 'base.imljson')).toEqual({ baseUrl: 'U' })
    expect(jsonOf(result, 'rpcs/list/api.imljson')).toEqual({ url: 'rpc://app@1/x', baseUrl: 'V' })
  })

  it('unwraps a communication rpc into an array', () => {
    const result = decompileWithRpcs({}, { list: { communication: [{ url: '/1' }, { url: '/2' }] } })
    expect(jsonOf(result, 'rpcs/list/api.imljson')).toEqual([{ url: '/1' }, { url: '/2' }])
  })
})

describe('decompileApp hook and module RPCs', () => {
  const hookManifest = (): Api => ({
    name: 'app',
    triggers: [{ name: 'instant', parameters: [{ name: '__IMTHOOK__', type: 'hook:hk' }] }],
    actions: [{ name: 'act' }]
  })
  const rpcApi = (url: string): Api => ({ url, body: { ref: 'rpc://app@2/ref' } })

  function decompileHooked(rpcs: Record<string, unknown>) {
    const files = [
      manifestFile(hookManifest()),
      jsFile('lib/app.js', compiledJs({ instant: { url: '/i' }, act: { url: '/a' } })),
      jsFile('lib/rpc.js', compiledJs(rpcs, 'ExecuteRpc'))
    ]
    return decompileApp(files, 'app')
  }

  it.each(['attach', 'detach', 'update'])(
    'routes %s:<webhook> to webhooks/<webhook>/ and transforms rpc references',
    (kind) => {
      const result = decompileHooked({ [`${kind}:hk`]: rpcApi('/hook') })
      expect(contentOf(result, `webhooks/hk/${kind}.imljson`)).toBe(
        '{\n    "url": "/hook",\n    "body": {\n        "ref": "rpc://ref"\n    }\n}'
      )
      expect(pathsOf(result).filter((p) => p.startsWith('modules/act/') && p.includes(kind))).toEqual([])
    }
  )

  it.each(['attach', 'detach', 'update'])(
    'routes %s:<name> to modules/<name>/ when no webhook has that name',
    (kind) => {
      const result = decompileHooked({ [`${kind}:act`]: rpcApi('/act') })
      expect(pathsOf(result).filter((p) => p.endsWith(`/${kind}.imljson`))).toEqual([`modules/act/${kind}.imljson`])
    }
  )

  it('does not look at module names for hook rpcs: the target must be a webhook name', () => {
    const result = decompileHooked({ 'attach:instant': rpcApi('/x') })
    expect(pathsOf(result).filter((p) => p.endsWith('/attach.imljson'))).toEqual(['modules/instant/attach.imljson'])
  })

  it('routes other rpc kinds to the module even when the target names a webhook', () => {
    const result = decompileHooked({ 'epoch:hk': rpcApi('/x'), 'custom:hk': rpcApi('/y') })
    expect(pathsOf(result).filter((p) => p.startsWith('modules/hk/'))).toEqual([
      'modules/hk/custom.imljson',
      'modules/hk/epoch.imljson'
    ])
  })

  it('splits the rpc name at the first colon', () => {
    const result = decompileHooked({ 'epoch:a:b': rpcApi('/x') })
    expect(pathsOf(result)).toContain('modules/a:b/epoch.imljson')
  })

  it('sends only webhooks that an instant trigger declares to webhooks/', () => {
    const files = [
      manifestFile({ name: 'app', triggers: [{ name: 'plain', parameters: [CONN_PARAM] }] }),
      jsFile('lib/rpc.js', compiledJs({ 'attach:acc': { url: '/x' } }, 'ExecuteRpc'))
    ]
    expect(pathsOf(decompileApp(files, 'app')).filter((p) => p.endsWith('attach.imljson'))).toEqual([
      'modules/acc/attach.imljson'
    ])
  })

  it('strips the base from hook rpc content', () => {
    const files = [
      manifestFile({
        name: 'app',
        triggers: [
          { name: 'i', parameters: [HOOK_PARAM] },
          { name: 'j', parameters: [HOOK_PARAM] }
        ]
      }),
      jsFile('lib/app.js', compiledJs({ i: { baseUrl: 'U' }, j: { baseUrl: 'U' } })),
      jsFile('lib/rpc.js', compiledJs({ 'attach:hk': { baseUrl: 'U', url: '/h' } }, 'ExecuteRpc'))
    ]
    expect(contentOf(decompileApp(files, 'app'), 'webhooks/hk/attach.imljson')).toBe('{\n    "url": "/h"\n}')
  })
})

describe('decompileApp epoch RPCs', () => {
  // a second module without any of the fields blocks every base promotion, so the epoch is compared with a raw api
  const decoy = { decoy: { url: '/decoy' } }

  it('removes from an object epoch every field that equals the module api, recursively', () => {
    const modules = {
      m: {
        url: '/m',
        method: 'GET',
        qs: { a: '1', b: '2' },
        response: { output: 'o', temp: { x: 1, y: 2 } },
        body: { k: [1] }
      },
      ...decoy
    }
    const epoch = {
      url: '/m',
      method: 'POST',
      qs: { a: '1', b: 'changed', c: '3' },
      response: { output: 'o', temp: { x: 1, y: 'changed' }, extra: 1 },
      body: { k: [1] },
      own: true
    }
    const result = decompileWithRpcs(modules, { 'epoch:m': epoch })
    expect(contentOf(result, 'modules/m/epoch.imljson')).toBe(
      '{\n    "method": "POST",\n    "qs": {\n        "b": "changed",\n        "c": "3"\n    },\n    "response": {\n        "temp": {\n            "y": "changed"\n        },\n        "extra": 1\n    },\n    "own": true\n}'
    )
  })

  it('keeps a nested value whole when it is an object in one api and something else in the other', () => {
    const modules = { m: { qs: { a: 1 }, headers: 'raw', body: ['x'], extra: { a: 1 } }, ...decoy }
    const epoch = { qs: 'a=1', headers: { h: 1 }, body: { x: 1 }, extra: ['a'] }
    const result = decompileWithRpcs(modules, { 'epoch:m': epoch })
    expect(jsonOf(result, 'modules/m/epoch.imljson')).toEqual(epoch)
  })

  it('compares arrays inside an object epoch whole', () => {
    const modules = { m: { pagination: { stop: ['a', 'b'], keep: ['a'] } }, ...decoy }
    const epoch = { pagination: { stop: ['a', 'b'], keep: ['a', 'c'] } }
    const result = decompileWithRpcs(modules, { 'epoch:m': epoch })
    expect(jsonOf(result, 'modules/m/epoch.imljson')).toEqual({ pagination: { keep: ['a', 'c'] } })
  })

  it('drops a nested object that has nothing left, while an identical one is dropped as a whole', () => {
    const modules = { m: { url: '/m', qs: { a: 1, b: 2 }, headers: { h: 1 } }, ...decoy }
    const epoch = { url: '/m', qs: { a: 1 }, headers: { h: 1 } }
    const result = decompileWithRpcs(modules, { 'epoch:m': epoch })
    expect(contentOf(result, 'modules/m/epoch.imljson')).toBe('{}')
  })

  it('compares against the module api after the base was removed from it', () => {
    const modules = { a: { baseUrl: 'U', url: '/a' }, b: { baseUrl: 'U', url: '/b' } }
    const result = decompileWithRpcs(modules, { 'epoch:a': { baseUrl: 'U', url: '/a', qs: { limit: 1 } } })
    expect(jsonOf(result, 'modules/a/epoch.imljson')).toEqual({ qs: { limit: 1 } })
  })

  it('transforms rpc references in the epoch after removing the common fields', () => {
    const modules = { m: { url: '/m' } }
    const result = decompileWithRpcs(modules, { 'epoch:m': { url: '/m', body: { ref: 'rpc://app@7/ref' } } })
    expect(contentOf(result, 'modules/m/epoch.imljson')).toBe('{\n    "body": {\n        "ref": "rpc://ref"\n    }\n}')
  })

  it('writes the cleaned epoch as it is when no module has that name', () => {
    const result = decompileWithRpcs({ m: { url: '/m' } }, { 'epoch:ghost': { url: '/m', baseUrl: 'U' } })
    expect(jsonOf(result, 'modules/ghost/epoch.imljson')).toEqual({ url: '/m', baseUrl: 'U' })
  })

  it('removes the common fields per step index when both module and epoch are communication arrays', () => {
    const modules = {
      m: {
        communication: [
          { url: '/1', qs: { a: 1 } },
          { url: '/2', qs: { b: 2 } }
        ]
      },
      ...decoy
    }
    const epoch = {
      communication: [
        { url: '/1', qs: { a: 1, limit: 1 } },
        { url: '/2', method: 'POST' }
      ]
    }
    const result = decompileWithRpcs(modules, { 'epoch:m': epoch })
    expect(jsonOf(result, 'modules/m/epoch.imljson')).toEqual([{ qs: { limit: 1 } }, { method: 'POST' }])
  })

  it('collapses an epoch array whose elements are all identical after the removal into one object', () => {
    const modules = { m: { communication: [{ url: '/m' }, { url: '/m' }, { url: '/m' }] }, ...decoy }
    const epoch = { communication: [1, 2, 3].map(() => ({ url: '/m', qs: { limit: 1 } })) }
    const result = decompileWithRpcs(modules, { 'epoch:m': epoch })
    expect(contentOf(result, 'modules/m/epoch.imljson')).toBe('{\n    "qs": {\n        "limit": 1\n    }\n}')
  })

  it('keeps an epoch array when the elements differ, even if only the last one does', () => {
    const modules = { m: { communication: [{ url: '/m' }, { url: '/m' }, { url: '/m' }] }, ...decoy }
    const epoch = { communication: [{ qs: 1 }, { qs: 1 }, { qs: 2 }].map((step) => ({ url: '/m', ...step })) }
    const result = decompileWithRpcs(modules, { 'epoch:m': epoch })
    expect(jsonOf(result, 'modules/m/epoch.imljson')).toEqual([{ qs: 1 }, { qs: 1 }, { qs: 2 }])
  })

  it('does not collapse an epoch array with a single element', () => {
    const modules = { m: { communication: [{ url: '/m' }] }, ...decoy }
    const result = decompileWithRpcs(modules, { 'epoch:m': { communication: [{ url: '/m', qs: { limit: 1 } }] } })
    expect(contentOf(result, 'modules/m/epoch.imljson')).toBe(
      '[\n    {\n        "qs": {\n            "limit": 1\n        }\n    }\n]'
    )
  })

  it('keeps an epoch step as it is when the module has fewer steps', () => {
    const modules = { m: { communication: [{ url: '/1' }] }, ...decoy }
    const epoch = {
      communication: [
        { url: '/1', qs: 1 },
        { url: '/2', qs: 2 }
      ]
    }
    const result = decompileWithRpcs(modules, { 'epoch:m': epoch })
    expect(jsonOf(result, 'modules/m/epoch.imljson')).toEqual([{ qs: 1 }, { url: '/2', qs: 2 }])
  })

  it('keeps the epoch as it is when the module api is an array and the epoch an object, and the other way round', () => {
    const modules = { arr: { communication: [{ url: '/m' }] }, obj: { url: '/m' }, ...decoy }
    const rpcs = {
      'epoch:arr': { url: '/m', qs: 1 },
      'epoch:obj': { communication: [{ url: '/m', qs: 1 }] }
    }
    const result = decompileWithRpcs(modules, rpcs)
    expect(jsonOf(result, 'modules/arr/epoch.imljson')).toEqual({ url: '/m', qs: 1 })
    expect(jsonOf(result, 'modules/obj/epoch.imljson')).toEqual([{ url: '/m', qs: 1 }])
  })

  it('treats the module without a class as an empty object api', () => {
    const files = [
      manifestFile({ name: 'app', actions: [{ name: 'ghost' }] }),
      jsFile('lib/rpc.js', compiledJs({ 'epoch:ghost': { url: '/g' } }, 'ExecuteRpc'))
    ]
    expect(jsonOf(decompileApp(files, 'app'), 'modules/ghost/epoch.imljson')).toEqual({ url: '/g' })
  })
})

// ---- decompileApp: rpc reference transformation ----

describe('decompileApp rpc reference transformation', () => {
  const ref = (app: string, n: number | string, name: string): string => `rpc://${app}@${n}/${name}`

  it.each([
    ['my.app', 'rpc://myXapp@1/x'],
    ['a+b', 'rpc://aab@1/x'],
    ['x(y)', 'rpc://xy@1/x'],
    ['p[q]', 'rpc://pq@1/x'],
    ['m$n', 'rpc://mn@1/x']
  ])('escapes the special characters of the app name %s', (appName, lookalike) => {
    const store = [{ options: { store: ref(appName, 3, 'real') }, other: lookalike }]
    const result = decompileManifest({ name: appName, actions: [{ name: 'm', interface: store }] }, appName)
    const iface = contentOf(result, 'modules/m/interface.imljson')
    expect(iface).toContain('"store": "rpc://real"')
    expect(iface).toContain(lookalike)
  })

  it('replaces every occurrence, with any number of digits, and leaves other references alone', () => {
    const text = [
      ref('app', 1, 'one'),
      ref('app', 12, 'two'),
      ref('app', 'x', 'bad'),
      'rpc://app@/missing',
      ref('app2', 1, 'other'),
      ref('other', 1, 'foreign'),
      'app@1/plain'
    ]
    const result = decompileManifest({ name: 'app', actions: [{ name: 'm', interface: text }] })
    expect(jsonOf(result, 'modules/m/interface.imljson')).toEqual([
      'rpc://one',
      'rpc://two',
      'rpc://app@x/bad',
      'rpc://app@/missing',
      'rpc://app2@1/other',
      'rpc://other@1/foreign',
      'app@1/plain'
    ])
  })

  it.each([['rpc://APP@1/x'], ['RPC://app@1/x']])(
    'matches the app name and the scheme case-sensitively: %s',
    (text) => {
      const result = decompileManifest({ name: 'app', actions: [{ name: 'm', interface: [text] }] })
      expect(contentOf(result, 'modules/m/interface.imljson')).toBe(`[\n    "${text}"\n]`)
    }
  )

  it('replaces two references inside one string', () => {
    const text = `${ref('app', 1, 'a')} and ${ref('app', 2, 'b')}`
    const result = decompileManifest({ name: 'app', actions: [{ name: 'm', interface: [text] }] })
    expect(jsonOf(result, 'modules/m/interface.imljson')).toEqual(['rpc://a and rpc://b'])
  })

  const raw = ref('app', 1, 'x')
  const manifest = {
    name: 'app',
    label: raw,
    groups: [{ name: raw }],
    actions: [
      {
        name: 'act',
        note: raw,
        scope: [raw],
        interface: [raw],
        expect: [raw],
        parameters: [{ ...CONN_PARAM, options: { nested: [raw] } }]
      }
    ],
    triggers: [
      { name: 'trg', scope: [raw], interface: [raw], parameters: [{ ...CONN_PARAM, options: { nested: [raw] } }] },
      { name: 'ins', scope: [raw], interface: [raw], parameters: [{ ...HOOK_PARAM, options: { nested: [raw] } }] }
    ],
    endpoints: [{ name: 'ep', inputParameters: [raw], outputParameters: [raw], context: raw, description: raw }]
  }
  const files = [
    manifestFile(manifest),
    jsFile('lib/app.js', compiledJs({ act: { url: raw }, trg: { url: raw }, ins: { url: raw } })),
    jsFile(
      'lib/rpc.js',
      compiledJs({ plain: { url: raw }, 'attach:hk': { url: raw }, 'epoch:act': { url: raw, qs: raw } }, 'ExecuteRpc')
    ),
    jsFile('lib/endpoints.js', compiledJs({ ep: { url: raw } }, 'ExecuteRpc'))
  ]
  const result = decompileApp(files, 'app')

  it.each([
    'modules/act/expect.imljson',
    'modules/act/interface.imljson',
    'modules/trg/interface.imljson',
    'modules/trg/parameters.imljson',
    'modules/ins/interface.imljson',
    'modules/act/epoch.imljson',
    'webhooks/hk/attach.imljson'
  ])('%s has its rpc references transformed', (path) => {
    expect(contentOf(result, path)).toMatch(/rpc:\/\/x(?!\w)/)
    expect(contentOf(result, path)).not.toContain(raw)
  })

  it.each([
    'modules/ins/parameters.imljson',
    'modules/act/api.imljson',
    'modules/act/scope.imljson',
    'modules/act/metadata.json',
    'modules/trg/scope.imljson',
    'rpcs/plain/api.imljson',
    'endpoints/ep/api.imljson',
    'endpoints/ep/inputParameters.imljson',
    'endpoints/ep/outputParameters.imljson',
    'endpoints/ep/context.md',
    'endpoints/ep/metadata.json',
    'groups.imljson',
    'metadata.json'
  ])('%s keeps its rpc references as they are', (path) => {
    expect(contentOf(result, path)).toContain(raw)
  })
})

// ---- decompileApp: functions and assets ----

describe('decompileApp functions and assets', () => {
  it('writes every function export to functions/<name>/code.js verbatim', () => {
    const functions = {
      first: 'function first() {\n  return 1;\n}',
      second: 'function second(a) { return a; }',
      padded: '\n  function padded() {}\n\n'
    }
    const files = [manifestFile({ name: 'app' }), jsFile('lib/functions.js', functionsJs(functions))]
    const result = decompileApp(files, 'app')
    expect(contentOf(result, 'functions/first/code.js')).toBe('function first() {\n  return 1;\n}')
    expect(contentOf(result, 'functions/second/code.js')).toBe('function second(a) { return a; }')
    expect(contentOf(result, 'functions/padded/code.js')).toBe('\n  function padded() {}\n\n')
  })

  it('slices the source of a function expression export', () => {
    const source = 'module.exports = { twice: function (n) { return n * 2 } };'
    const result = decompileApp([manifestFile({ name: 'app' }), jsFile('lib/functions.js', source)], 'app')
    expect(contentOf(result, 'functions/twice/code.js')).toBe('function (n) { return n * 2 }')
  })

  it('emits no function files without lib/functions.js', () => {
    expect(pathsOf(decompileManifest({ name: 'app' }))).toEqual(['.sdk', 'metadata.json'])
  })

  it('copies only files under assets/, byte for byte, including nested ones', () => {
    const files = [
      manifestFile({ name: 'app' }),
      jsFile('assets/icon.png', 'data:image/png;base64,AAAA'),
      jsFile('assets/deep/er/file.txt', 'text'),
      jsFile('assets', 'not-a-folder'),
      jsFile('lib/assets/icon.png', 'nested-lib'),
      jsFile('xassets/icon.png', 'other'),
      jsFile('readme.md', 'readme')
    ]
    const result = decompileApp(files, 'app')
    expect(pathsOf(result)).toEqual(['.sdk', 'assets/deep/er/file.txt', 'assets/icon.png', 'metadata.json'])
    expect(contentOf(result, 'assets/icon.png')).toBe('data:image/png;base64,AAAA')
  })
})

// ---- decompileApp: raw fallback ----

describe('decompileApp raw fallback', () => {
  const nonStatic = `
    class Bad extends ExecuteAction {
      constructor() {
        super();
        const api = buildApi();
        Object.defineProperty(this, 'api', {get: () => api, set: () => null});
      }
    }
    module.exports = { bad: Bad };
  `

  it.each([
    ['lib/app.js', 'unsupported expression: CallExpression'],
    ['lib/rpc.js', 'unsupported expression: CallExpression'],
    ['lib/endpoints.js', 'unsupported expression: CallExpression']
  ])('returns the very same raw files and logs when %s cannot be read statically', (path, message) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const files = [manifestFile({ name: 'app', actions: [{ name: 'bad' }] }), jsFile(path, nonStatic)]
    expect(decompileApp(files, 'my-app')).toBe(files)
    expect(spy).toHaveBeenCalledWith(
      `[decompiler] static extraction could not decompile app "my-app", showing raw compiled files: ${message}`
    )
  })

  it('returns the raw files when lib/functions.js exports something that is not a string or a function', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const files = [manifestFile({ name: 'app' }), jsFile('lib/functions.js', 'module.exports = { n: 5 };')]
    expect(decompileApp(files, 'app')).toBe(files)
  })

  it('returns the raw files, not a half-decompiled app, when a later module cannot be read', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const files = [manifestFile({ name: 'app' }), jsFile('lib/rpc.js', nonStatic), jsFile('assets/icon.png', 'x')]
    expect(pathsOf(decompileApp(files, 'app'))).toEqual(['manifest.json', 'lib/rpc.js', 'assets/icon.png'])
  })

  it('returns the raw files when the manifest is not an object that can be read', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const files = [jsFile('manifest.json', 'null')]
    expect(decompileApp(files, 'app')).toBe(files)
  })

  it('logs the message of the error that made it bail', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    decompileApp([jsFile('manifest.json', '{oops')], 'app')
    expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\[decompiler\] static extraction could not decompile app "app", showing raw compiled files: /
      )
    )
  })
})

// ---- decompileAccount ----

describe('decompileAccount details', () => {
  it('emits metadata, parameters, scope, scopes and api in that order, unsorted', () => {
    const result = decompileAccount([manifestFile({ name: 'c' })])
    expect(pathsOf(result)).toEqual([
      'metadata.json',
      'parameters.imljson',
      'scope.imljson',
      'scopes.imljson',
      'api.imljson'
    ])
  })

  it('keeps a defined but empty label', () => {
    const result = decompileAccount([manifestFile({ name: 'n', label: '', type: 'basic' })])
    expect(contentOf(result, 'metadata.json')).toBe('{\n    "name": "n",\n    "label": "",\n    "type": "basic"\n}')
  })

  it('copies name, label and type in that order and skips the missing ones', () => {
    const manifest = { type: 'basic', extra: 1, label: 'L', name: 'n' }
    expect(contentOf(decompileAccount([manifestFile(manifest)]), 'metadata.json')).toBe(
      '{\n    "name": "n",\n    "label": "L",\n    "type": "basic"\n}'
    )
    expect(contentOf(decompileAccount([manifestFile({ type: 'basic' })]), 'metadata.json')).toBe(
      '{\n    "type": "basic"\n}'
    )
  })

  it('defaults the parameters, scope and scopes and takes the first class of lib/account.js', () => {
    const files = [
      manifestFile({ name: 'c' }),
      jsFile('lib/account.js', singleClassJs({ info: { url: '/me' } }, 'Account'))
    ]
    const result = decompileAccount(files)
    expect(contentOf(result, 'parameters.imljson')).toBe('[]')
    expect(contentOf(result, 'scope.imljson')).toBe('[]')
    expect(contentOf(result, 'scopes.imljson')).toBe('{}')
    expect(contentOf(result, 'api.imljson')).toBe('{\n    "info": {\n        "url": "/me"\n    }\n}')
  })

  it.each(FALSY_VALUES)('defaults the parameters, scope and scopes when they are %j', (value) => {
    const result = decompileAccount([manifestFile({ name: 'c', parameters: value, scope: value, scopes: value })])
    const paths = ['parameters.imljson', 'scope.imljson', 'scopes.imljson']
    expect(paths.map((path) => contentOf(result, path))).toEqual(['[]', '[]', '{}'])
  })

  it('writes an empty api when lib/account.js has no api', () => {
    const files = [manifestFile({ name: 'c' }), jsFile('lib/account.js', singleClassJs(null, 'Account'))]
    expect(contentOf(decompileAccount(files), 'api.imljson')).toBe('{}')
  })

  it('does not transform rpc references or strip metadata from the api', () => {
    const api = { url: 'rpc://c@1/x', metadata: { a: 1 } }
    const files = [manifestFile({ name: 'c' }), jsFile('lib/account.js', singleClassJs(api, 'Account'))]
    expect(jsonOf(decompileAccount(files), 'api.imljson')).toEqual(api)
  })

  it('returns the very same raw files and logs without a name when lib/account.js is not static', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const bad = 'class A { constructor() { const api = f(); } }\nmodule.exports = A;'
    const files = [manifestFile({ name: 'c' }), jsFile('lib/account.js', bad)]
    expect(decompileAccount(files)).toBe(files)
    expect(spy).toHaveBeenCalledWith(
      '[decompiler] static extraction could not decompile account, showing raw compiled files: unsupported expression: CallExpression'
    )
  })

  it('returns the very same files when the manifest is invalid JSON', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const files = [jsFile('manifest.json', '{')]
    expect(decompileAccount(files)).toBe(files)
  })
})

// ---- decompileHook ----

describe('decompileHook details', () => {
  const hookOf = (parameters: unknown, extra: Api = {}): ExtractedFile[] =>
    decompileHook([manifestFile({ name: 'h', label: 'H', type: 'web', parameters, ...extra })])

  it('emits metadata, parameters, scope, api, attach, detach and update in that order, unsorted', () => {
    expect(pathsOf(hookOf([]))).toEqual([
      'metadata.json',
      'parameters.imljson',
      'scope.imljson',
      'api.imljson',
      'attach.imljson',
      'detach.imljson',
      'update.imljson'
    ])
  })

  it('writes the metadata as name, label, connection, type', () => {
    const parameters = [{ ...CONN_PARAM }]
    expect(contentOf(hookOf(parameters), 'metadata.json')).toBe(
      '{\n    "name": "h",\n    "label": "H",\n    "connection": "acc",\n    "type": "web"\n}'
    )
  })

  it('leaves out a missing name, label or type and writes a null connection', () => {
    const result = decompileHook([manifestFile({})])
    expect(contentOf(result, 'metadata.json')).toBe('{\n    "connection": null\n}')
  })

  it.each([
    ['the type is not an account', [{ name: '__IMTCONN__', type: 'hook:x' }]],
    ['the type is missing', [{ name: '__IMTCONN__' }]],
    ['the type is account without a colon', [{ name: '__IMTCONN__', type: 'account' }]],
    ['the first parameter is something else', [{ name: 'other', type: 'account:acc' }]],
    ['the connection is the second parameter', [{ name: 'first' }, CONN_PARAM]],
    ['there are no parameters', []]
  ])('writes a null connection when %s', (_label, parameters) => {
    expect((jsonOf(hookOf(parameters), 'metadata.json') as Api).connection).toBeNull()
  })

  it('writes a null connection when the manifest has no parameters at all', () => {
    const result = decompileHook([manifestFile({ name: 'h' })])
    expect((jsonOf(result, 'metadata.json') as Api).connection).toBeNull()
  })

  it('takes the parameters from the nested list of the first parameter only when it is the connection', () => {
    const nested = [{ name: 'p' }]
    expect(jsonOf(hookOf([{ ...CONN_PARAM, options: { nested } }]), 'parameters.imljson')).toEqual(nested)
    expect(jsonOf(hookOf([{ name: 'other', options: { nested } }]), 'parameters.imljson')).toEqual([])
    expect(jsonOf(hookOf([{ name: 'first' }, { ...CONN_PARAM, options: { nested } }]), 'parameters.imljson')).toEqual(
      []
    )
  })

  it('does not transform rpc references in the hook parameters', () => {
    const nested = [{ name: 'p', options: { store: 'rpc://app@1/list' } }]
    expect(contentOf(hookOf([{ ...CONN_PARAM, options: { nested } }]), 'parameters.imljson')).toContain(
      'rpc://app@1/list'
    )
  })

  it.each([
    ['a list', ['a', 'b']],
    ['a string', 'read'],
    ['null', null],
    ['an empty string', ''],
    ['zero', 0],
    ['false', false]
  ])('takes any defined scope as it is: %s', (_label, scope) => {
    const result = hookOf([{ ...CONN_PARAM, options: { scope } }])
    expect(jsonOf(result, 'scope.imljson')).toEqual(scope)
  })

  it.each([
    ['no scope', [{ ...CONN_PARAM, options: {} }]],
    ['no options', [CONN_PARAM]],
    ['another first parameter', [{ name: 'other', options: { scope: ['x'] } }]],
    ['the connection as second parameter', [{ name: 'first' }, { ...CONN_PARAM, options: { scope: ['x'] } }]]
  ])('writes an empty scope for %s', (_label, parameters) => {
    expect(contentOf(hookOf(parameters), 'scope.imljson')).toBe('[]')
  })

  it('writes empty objects for attach, detach and update and takes the first class of lib/hook.js as api', () => {
    const files = [manifestFile({ name: 'h' }), jsFile('lib/hook.js', singleClassJs({ url: '/in' }, 'Base'))]
    const result = decompileHook(files)
    expect(contentOf(result, 'api.imljson')).toBe('{\n    "url": "/in"\n}')
    expect(contentOf(result, 'attach.imljson')).toBe('{}')
    expect(contentOf(result, 'detach.imljson')).toBe('{}')
    expect(contentOf(result, 'update.imljson')).toBe('{}')
  })

  it('writes an empty api without lib/hook.js and when the hook class has no api', () => {
    expect(contentOf(decompileHook([manifestFile({ name: 'h' })]), 'api.imljson')).toBe('{}')
    const files = [manifestFile({ name: 'h' }), jsFile('lib/hook.js', singleClassJs(null, 'Base'))]
    expect(contentOf(decompileHook(files), 'api.imljson')).toBe('{}')
  })

  it('returns the very same raw files and logs without a name when lib/hook.js is not static', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const bad = 'class A { constructor() { const api = f(); } }\nmodule.exports = A;'
    const files = [manifestFile({ name: 'h' }), jsFile('lib/hook.js', bad)]
    expect(decompileHook(files)).toBe(files)
    expect(spy).toHaveBeenCalledWith(
      '[decompiler] static extraction could not decompile hook, showing raw compiled files: unsupported expression: CallExpression'
    )
  })

  it('returns the very same files when there is no manifest', () => {
    const files = [jsFile('lib/hook.js', 'x')]
    expect(decompileHook(files)).toBe(files)
  })
})

// ---- golden output ----

describe.each([
  [
    'acme-crm: ten modules sharing base fields, with per-module overrides',
    () => decompileApp(crmFiles(), 'acme-crm'),
    CRM_EXPECTED
  ],
  [
    'boardly: rpcs, webhooks, epochs, endpoints, functions and assets',
    () => decompileApp(boardFiles(), 'boardly'),
    BOARD_EXPECTED
  ],
  ['tiny: the smallest app', () => decompileApp(tinyFiles(), 'tiny'), TINY_EXPECTED],
  ['boardly-oauth: an account', () => decompileAccount(boardAccountFiles()), BOARD_ACCOUNT_EXPECTED],
  ['boardly-board-hook: a hook', () => decompileHook(boardHookFiles()), BOARD_HOOK_EXPECTED]
])('golden %s', (_name, run, expected) => {
  const result = run()

  it('emits exactly these files in this order', () => {
    expect(pathsOf(result)).toEqual(expected.map((f) => f.path))
  })

  it.each(expected.map((f) => [f.path, f.content]))('%s has exactly this content', (path, content) => {
    expect(contentOf(result, path)).toBe(content)
  })
})
