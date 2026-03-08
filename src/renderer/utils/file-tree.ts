import type { FileDiff } from '../../preload/index'

export interface TreeNode {
  name: string
  fullPath: string
  children: Map<string, TreeNode>
  file: FileDiff | null
}

export interface FlatItem {
  key: string
  isFolder: boolean
  name: string
  fullPath: string
  depth: number
  diff: FileDiff | null
  folderStatus: string | null
  fileCount: number
  isExpanded: boolean
}

export function buildTree(diffs: FileDiff[]): TreeNode {
  const root: TreeNode = { name: '', fullPath: '', children: new Map(), file: null }
  for (const diff of diffs) {
    const parts = diff.filePath.split('/')
    let node = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (!node.children.has(part)) {
        node.children.set(part, {
          name: part,
          fullPath: parts.slice(0, i + 1).join('/'),
          children: new Map(),
          file: null
        })
      }
      node = node.children.get(part)!
      if (i === parts.length - 1) node.file = diff
    }
  }
  return root
}

export function collectStatuses(node: TreeNode, s: Set<string>): void {
  if (node.file) s.add(node.file.status)
  for (const child of node.children.values()) collectStatuses(child, s)
}

export function getFolderStatus(node: TreeNode): string | null {
  const s = new Set<string>()
  collectStatuses(node, s)
  if (s.has('modified')) return 'modified'
  if (s.has('added') && s.has('deleted')) return 'modified'
  if (s.has('added')) return 'added'
  if (s.has('deleted')) return 'deleted'
  return null
}

export function countFiles(node: TreeNode): number {
  let c = 0
  if (node.file) c++
  for (const child of node.children.values()) c += countFiles(child)
  return c
}

export function buildFlatList(root: TreeNode, expandedFolders: Set<string>): FlatItem[] {
  const items: FlatItem[] = []
  function visit(node: TreeNode, depth: number): void {
    const children = Array.from(node.children.values()).sort((a, b) => {
      const af = a.children.size > 0
      const bf = b.children.size > 0
      if (af && !bf) return -1
      if (!af && bf) return 1
      return a.name.localeCompare(b.name)
    })
    for (const child of children) {
      const isFolder = child.children.size > 0
      const isExpanded = expandedFolders.has(child.fullPath)
      items.push({
        key: child.fullPath,
        isFolder,
        name: child.name,
        fullPath: child.fullPath,
        depth,
        diff: child.file,
        folderStatus: isFolder ? getFolderStatus(child) : null,
        fileCount: isFolder ? countFiles(child) : 0,
        isExpanded
      })
      if (isFolder && isExpanded) visit(child, depth + 1)
    }
  }
  visit(root, 0)
  return items
}
