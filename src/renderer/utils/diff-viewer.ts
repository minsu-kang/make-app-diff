// Build a map of line number -> JSON path for annotation
export function buildJsonPathMap(content: string): Map<number, string> {
  const pathMap = new Map<number, string>()
  try {
    JSON.parse(content)
  } catch {
    return pathMap
  }

  const lines = content.split('\n')
  const stack: { segment: string; isArray: boolean; index: number }[] = []

  const currentPath = (): string =>
    stack
      .map((s) => s.segment)
      .filter(Boolean)
      .join('.')
      .replace(/\.\[/g, '[')

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()

    // Closing brace/bracket — pop before recording
    if (trimmed.startsWith('}') || trimmed.startsWith(']')) {
      if (stack.length > 0) stack.pop()
      pathMap.set(i + 1, currentPath())
      continue
    }

    // "key": { — named object container (skip self-contained "key": {})
    const objMatch = trimmed.match(/^"([^"]+)"\s*:\s*\{/)
    if (objMatch && !trimmed.includes('}')) {
      stack.push({ segment: objMatch[1], isArray: false, index: 0 })
      pathMap.set(i + 1, currentPath())
      continue
    }

    // "key": [ — named array container (skip self-contained "key": [])
    const arrMatch = trimmed.match(/^"([^"]+)"\s*:\s*\[/)
    if (arrMatch && !trimmed.includes(']')) {
      stack.push({ segment: arrMatch[1], isArray: true, index: 0 })
      pathMap.set(i + 1, currentPath())
      continue
    }

    // Bare { — array element
    if (trimmed === '{') {
      const parent = stack.length > 0 ? stack[stack.length - 1] : null
      if (parent?.isArray) {
        stack.push({ segment: `[${parent.index}]`, isArray: false, index: 0 })
        parent.index++
      } else {
        stack.push({ segment: '', isArray: false, index: 0 })
      }
      pathMap.set(i + 1, currentPath())
      continue
    }

    // Bare [ — anonymous array
    if (trimmed === '[') {
      stack.push({ segment: '', isArray: true, index: 0 })
      pathMap.set(i + 1, currentPath())
      continue
    }

    // Regular content line
    pathMap.set(i + 1, currentPath())
  }

  return pathMap
}

export function isValidDataUri(uri: string): boolean {
  return /^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+$/.test(uri)
}
