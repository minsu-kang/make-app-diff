// Folders whose subfolders are components: a module, an RPC, a function, an endpoint, a connection or a webhook
// (compiled apps use accounts/ and hooks/ for the last two)
const COMPONENT_DIRS = new Set([
  'modules',
  'rpcs',
  'functions',
  'endpoints',
  'connections',
  'webhooks',
  'accounts',
  'hooks'
])

/** The component a file belongs to; a file outside the component folders counts as a component of its own */
export function componentKey(filePath: string): string {
  const parts = filePath.split('/')
  return parts.length >= 3 && COMPONENT_DIRS.has(parts[0]) ? `${parts[0]}/${parts[1]}` : filePath
}

export function isInsideComponent(folderPath: string): boolean {
  const parts = folderPath.split('/')
  return parts.length >= 2 && COMPONENT_DIRS.has(parts[0])
}

export function mergeStatuses(statuses: ReadonlySet<string>): 'added' | 'deleted' | 'modified' | null {
  if (statuses.has('modified')) return 'modified'
  if (statuses.has('added') && statuses.has('deleted')) return 'modified'
  if (statuses.has('added')) return 'added'
  if (statuses.has('deleted')) return 'deleted'
  return null
}
