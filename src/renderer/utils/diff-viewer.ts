interface PathFrame {
  segment: string
  isArray: boolean
  index: number
}

const NAMED_CONTAINERS = [
  { pattern: /^"([^"]+)"\s*:\s*\{/, closer: '}', isArray: false },
  { pattern: /^"([^"]+)"\s*:\s*\[/, closer: ']', isArray: true }
]

function currentPath(stack: PathFrame[]): string {
  return stack
    .map((s) => s.segment)
    .filter(Boolean)
    .join('.')
    .replace(/\.\[/g, '[')
}

// "key": { or "key": [ opens a named container, unless the line is self-contained ("key": {})
function pushNamedContainer(stack: PathFrame[], trimmed: string): void {
  for (const { pattern, closer, isArray } of NAMED_CONTAINERS) {
    const match = pattern.exec(trimmed)
    if (match && !trimmed.includes(closer)) {
      stack.push({ segment: match[1], isArray, index: 0 })
      return
    }
  }
}

// Bare { is an array element when directly inside an array
function pushBareObject(stack: PathFrame[]): void {
  const parent = stack.length > 0 ? stack[stack.length - 1] : null
  if (parent?.isArray) {
    stack.push({ segment: `[${parent.index}]`, isArray: false, index: 0 })
    parent.index++
  } else {
    stack.push({ segment: '', isArray: false, index: 0 })
  }
}

function updateStack(stack: PathFrame[], trimmed: string): void {
  if (trimmed.startsWith('}') || trimmed.startsWith(']')) stack.pop()
  else if (trimmed === '{') pushBareObject(stack)
  else if (trimmed === '[') stack.push({ segment: '', isArray: true, index: 0 })
  else pushNamedContainer(stack, trimmed)
}

// Build a map of line number -> JSON path for annotation
export function buildJsonPathMap(content: string): Map<number, string> {
  const pathMap = new Map<number, string>()
  try {
    JSON.parse(content)
  } catch {
    return pathMap
  }

  const lines = content.split('\n')
  const stack: PathFrame[] = []

  for (let i = 0; i < lines.length; i++) {
    updateStack(stack, lines[i].trim())
    pathMap.set(i + 1, currentPath(stack))
  }

  return pathMap
}

export function isValidDataUri(uri: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(uri)
}
