import * as acorn from 'acorn'

/**
 * Statically recovers `.api` object literals and `module.exports` maps from compiled
 * PKR JavaScript (app.js/rpc.js/account.js/hook.js) via AST inspection only. No
 * `require`, `vm`, or any other execution of the source ever happens here. Anything
 * that isn't a plain, statically-resolvable literal throws — callers must treat that
 * as "cannot decompile this file" and fall back to raw compiled output, not execute it.
 */

type Node = acorn.Node & Record<string, unknown>

function parse(code: string): Node {
  return acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script' }) as unknown as Node
}

function evalStaticNode(node: Node): unknown {
  switch (node.type) {
    case 'Literal':
      return (node as unknown as { value: unknown }).value
    case 'ObjectExpression': {
      const obj: Record<string, unknown> = {}
      for (const prop of node.properties as Node[]) {
        if (prop.type !== 'Property' || prop.computed) {
          throw new Error(`unsupported object member: ${prop.type}`)
        }
        obj[staticPropertyKey(prop)] = evalStaticNode(prop.value as Node)
      }
      return obj
    }
    case 'ArrayExpression': {
      const arr: unknown[] = []
      for (const el of node.elements as (Node | null)[]) {
        if (el === null) {
          arr.push(null)
          continue
        }
        if (el.type === 'SpreadElement') throw new Error('unsupported spread element in array')
        arr.push(evalStaticNode(el))
      }
      return arr
    }
    case 'TemplateLiteral': {
      const expressions = node.expressions as Node[]
      if (expressions.length > 0) throw new Error('unsupported template literal with interpolation')
      const quasis = node.quasis as { value: { cooked: string | null } }[]
      return quasis.map((q) => q.value.cooked ?? '').join('')
    }
    case 'UnaryExpression': {
      const arg = node.argument as Node
      if (arg.type === 'Literal' && typeof (arg as unknown as { value: unknown }).value === 'number') {
        const num = (arg as unknown as { value: number }).value
        if (node.operator === '-') return -num
        if (node.operator === '+') return num
      }
      throw new Error('unsupported unary expression')
    }
    default:
      throw new Error(`unsupported expression: ${node.type}`)
  }
}

function staticPropertyKey(prop: Node): string {
  const key = prop.key as Node
  if (key.type === 'Identifier') return key.name as string
  if (key.type === 'Literal' && typeof (key as unknown as { value: unknown }).value === 'string') {
    return (key as unknown as { value: string }).value
  }
  throw new Error(`unsupported property key: ${key.type}`)
}

function isModuleExportsTarget(node: Node): boolean {
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    (node.object as Node).type === 'Identifier' &&
    (node.object as Node).name === 'module' &&
    (node.property as Node).type === 'Identifier' &&
    (node.property as Node).name === 'exports'
  )
}

function findModuleExports(program: Node): Node | undefined {
  for (const stmt of program.body as Node[]) {
    if (stmt.type !== 'ExpressionStatement') continue
    const expr = stmt.expression as Node
    if (expr.type !== 'AssignmentExpression' || expr.operator !== '=') continue
    if (isModuleExportsTarget(expr.left as Node)) return expr.right as Node
  }
  return undefined
}

function findClassDeclarations(program: Node): Map<string, Node> {
  const classes = new Map<string, Node>()
  for (const stmt of program.body as Node[]) {
    if (stmt.type === 'ClassDeclaration' && stmt.id) {
      classes.set((stmt.id as Node).name as string, stmt)
    }
  }
  return classes
}

function findConstructorBody(classNode: Node): Node[] | undefined {
  const body = (classNode.body as Node).body as Node[]
  for (const member of body) {
    if (member.type === 'MethodDefinition' && member.kind === 'constructor') {
      return ((member.value as Node).body as Node).body as Node[]
    }
  }
  return undefined
}

/**
 * Looks for `const api = <literal>` or the legacy `this.api = <literal>` at the top
 * level of a constructor body. Returns `{ found: false }` if neither shows up (the
 * class genuinely has no api, matching a falsy `instance.api` at runtime). Throws if
 * either shape is found but its value isn't a statically-resolvable literal.
 */
function extractClassApi(classNode: Node): { found: boolean; value?: unknown } {
  const statements = findConstructorBody(classNode)
  if (!statements) return { found: false }

  for (const stmt of statements) {
    if (stmt.type === 'VariableDeclaration') {
      for (const decl of stmt.declarations as Node[]) {
        if ((decl.id as Node).type === 'Identifier' && (decl.id as Node).name === 'api' && decl.init) {
          return { found: true, value: evalStaticNode(decl.init as Node) }
        }
      }
    }
    if (stmt.type === 'ExpressionStatement') {
      const expr = stmt.expression as Node
      if (expr.type === 'AssignmentExpression' && expr.operator === '=') {
        const left = expr.left as Node
        if (
          left.type === 'MemberExpression' &&
          !left.computed &&
          (left.object as Node).type === 'ThisExpression' &&
          (left.property as Node).type === 'Identifier' &&
          (left.property as Node).name === 'api'
        ) {
          return { found: true, value: evalStaticNode(expr.right as Node) }
        }
      }
    }
  }
  return { found: false }
}

function stripIml(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const rest = { ...(value as Record<string, unknown>) }
    delete rest.iml
    return rest
  }
  return value
}

/**
 * Evaluates compiled app.js/rpc.js (multi-class export map) or hook.js/account.js
 * (single-class export) source and extracts each class's api. Pure and synchronous:
 * takes a source string, returns plain serializable data. Throws on any construct it
 * cannot statically resolve — callers must not swallow that into a partial result.
 */
export function parseCompiledJs(code: string): Record<string, unknown> {
  const program = parse(code)
  const classes = findClassDeclarations(program)
  const exportsNode = findModuleExports(program)
  if (!exportsNode) throw new Error('module.exports not found')

  const resolveClass = (name: string): unknown => {
    const classNode = classes.get(name)
    if (!classNode) throw new Error(`export references unknown class: ${name}`)
    const api = extractClassApi(classNode)
    if (!api.found || !api.value) return undefined
    return stripIml(api.value)
  }

  // Single-class export: module.exports = ClassName
  if (exportsNode.type === 'Identifier') {
    const value = resolveClass(exportsNode.name as string)
    return value === undefined ? {} : { default: value }
  }

  // Multi-class export map: module.exports = { name: Class, 'attach:x': Class, ... }
  if (exportsNode.type === 'ObjectExpression') {
    const result: Record<string, unknown> = {}
    for (const prop of exportsNode.properties as Node[]) {
      if (prop.type !== 'Property' || prop.computed) {
        throw new Error(`unsupported export member: ${prop.type}`)
      }
      const exportName = staticPropertyKey(prop)
      if (exportName === 'RPC' || exportName === 'ENDPOINTS') continue
      const value = prop.value as Node
      if (value.type !== 'Identifier') throw new Error(`unsupported export value for ${exportName}`)
      const api = resolveClass(value.name as string)
      if (api !== undefined) result[exportName] = api
    }
    return result
  }

  throw new Error(`unsupported module.exports shape: ${exportsNode.type}`)
}

/**
 * Evaluates compiled functions.js source and extracts each export's function body.
 * Pure and synchronous. Real compiled output always exports string literals; a
 * genuine FunctionExpression is read via source-slice (equivalent to `.toString()`)
 * as cheap defensive coverage, since not every app has been surveyed.
 */
export function parseFunctions(code: string): Record<string, string> {
  const program = parse(code)
  const exportsNode = findModuleExports(program)
  if (!exportsNode) throw new Error('module.exports not found')
  if (exportsNode.type !== 'ObjectExpression') {
    throw new Error(`unsupported functions.js module.exports shape: ${exportsNode.type}`)
  }

  const result: Record<string, string> = {}
  for (const prop of exportsNode.properties as Node[]) {
    if (prop.type !== 'Property' || prop.computed) {
      throw new Error(`unsupported functions.js export member: ${prop.type}`)
    }
    const name = staticPropertyKey(prop)
    const value = prop.value as Node
    if (value.type === 'Literal' && typeof (value as unknown as { value: unknown }).value === 'string') {
      result[name] = (value as unknown as { value: string }).value
    } else if (value.type === 'FunctionExpression' || value.type === 'FunctionDeclaration') {
      result[name] = code.slice(value.start as number, value.end as number)
    } else {
      throw new Error(`unsupported functions.js export value for ${name}: ${value.type}`)
    }
  }
  return result
}
