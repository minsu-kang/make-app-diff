import { createTwoFilesPatch } from 'diff'
import { ExtractedFile, FileDiff, DiffResult, ComponentType } from '../types'

// Schema-aware key ordering for IMLJSON communication objects
interface KeyOrder {
  keys: string[]
  children?: Record<string, KeyOrder>
}

const IMLJSON_KEY_ORDER: KeyOrder = {
  keys: [
    'temp',
    'condition',
    'url',
    'encodeUrl',
    'method',
    'headers',
    'qs',
    'body',
    'type',
    'ca',
    'gzip',
    'aws',
    'response',
    'pagination',
    'log',
    'repeat'
  ],
  children: {
    aws: {
      keys: ['key', 'secret', 'session', 'bucket', 'sign_version']
    },
    response: {
      keys: ['temp', 'valid', 'type', 'iterate', 'trigger', 'output', 'wrapper', 'error'],
      children: {
        iterate: { keys: ['container', 'condition'] },
        trigger: { keys: ['id', 'date', 'type', 'order'] },
        error: { keys: ['message', 'type'] }
      }
    },
    pagination: {
      keys: ['mergeWithParent', 'url', 'method', 'headers', 'qs', 'body', 'condition']
    },
    log: { keys: ['sanitize'] },
    repeat: { keys: ['condition', 'delay', 'limit'] }
  }
}

function sortKeysRecursive(obj: unknown, order?: KeyOrder): unknown {
  if (Array.isArray(obj)) return obj.map((item) => sortKeysRecursive(item, order))
  if (obj !== null && typeof obj === 'object') {
    const record = obj as Record<string, unknown>
    const keys = Object.keys(record)

    let sortedKeys: string[]
    if (order) {
      const orderMap = new Map(order.keys.map((k, i) => [k, i]))
      sortedKeys = [...keys].sort((a, b) => {
        const ai = orderMap.has(a) ? orderMap.get(a)! : Infinity
        const bi = orderMap.has(b) ? orderMap.get(b)! : Infinity
        if (ai !== Infinity || bi !== Infinity) return ai - bi
        return a.localeCompare(b)
      })
    } else {
      sortedKeys = [...keys].sort()
    }

    const sorted: Record<string, unknown> = {}
    for (const key of sortedKeys) {
      sorted[key] = sortKeysRecursive(record[key], order?.children?.[key])
    }
    return sorted
  }
  return obj
}

function normalizeJsonContent(content: string, filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase()
  if (ext !== 'json' && ext !== 'imljson') return content
  try {
    const parsed = JSON.parse(content)
    const order = ext === 'imljson' ? IMLJSON_KEY_ORDER : undefined
    return JSON.stringify(sortKeysRecursive(parsed, order), null, 4)
  } catch {
    return content
  }
}

export function computeDiff(type: ComponentType, oldFiles: ExtractedFile[], newFiles: ExtractedFile[]): DiffResult {
  const oldMap = new Map(oldFiles.map((f) => [f.path, f.content]))
  const newMap = new Map(newFiles.map((f) => [f.path, f.content]))

  const allPaths = new Set([...oldMap.keys(), ...newMap.keys()])
  const diffs: FileDiff[] = []

  for (const filePath of Array.from(allPaths).sort()) {
    let oldContent = oldMap.get(filePath) ?? ''
    let newContent = newMap.get(filePath) ?? ''

    oldContent = normalizeJsonContent(oldContent, filePath)
    newContent = normalizeJsonContent(newContent, filePath)

    let status: FileDiff['status']
    if (!oldMap.has(filePath)) {
      status = 'added'
    } else if (!newMap.has(filePath)) {
      status = 'deleted'
    } else if (oldContent === newContent) {
      status = 'unchanged'
    } else {
      status = 'modified'
    }

    if (status === 'unchanged') continue

    // Binary files (base64 data URLs) — skip text diff
    const isBinary = oldContent.startsWith('data:') || newContent.startsWith('data:')
    const unifiedDiff = isBinary
      ? ''
      : createTwoFilesPatch(`a/${filePath}`, `b/${filePath}`, oldContent, newContent, '', '', {
          context: Math.max(oldContent.split('\n').length, newContent.split('\n').length)
        })

    diffs.push({ filePath, status, oldContent, newContent, unifiedDiff })
  }

  const summary = {
    added: diffs.filter((d) => d.status === 'added').length,
    deleted: diffs.filter((d) => d.status === 'deleted').length,
    modified: diffs.filter((d) => d.status === 'modified').length,
    unchanged: Array.from(allPaths).length - diffs.length
  }

  return { type, diffs, summary }
}
