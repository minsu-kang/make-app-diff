import { describe, it, expect } from 'vitest'
import { buildTree, getFolderStatus, collectStatuses, countFiles, buildFlatList } from '../file-tree'
import type { FileDiff } from '../../shared/types'

function makeDiff(filePath: string, status: FileDiff['status']): FileDiff {
  return { filePath, status, oldContent: '', newContent: '', unifiedDiff: '' }
}

describe('buildTree', () => {
  it('returns empty root for empty input', () => {
    const root = buildTree([])
    expect(root.children.size).toBe(0)
    expect(root.file).toBeNull()
  })

  it('builds single-level file nodes', () => {
    const root = buildTree([makeDiff('file.txt', 'added')])
    expect(root.children.size).toBe(1)
    const node = root.children.get('file.txt')!
    expect(node.name).toBe('file.txt')
    expect(node.file?.status).toBe('added')
    expect(node.children.size).toBe(0)
  })

  it('builds nested folder structure', () => {
    const root = buildTree([makeDiff('src/utils/helper.ts', 'modified')])
    expect(root.children.size).toBe(1)
    const src = root.children.get('src')!
    expect(src.name).toBe('src')
    expect(src.fullPath).toBe('src')
    const utils = src.children.get('utils')!
    expect(utils.fullPath).toBe('src/utils')
    const helper = utils.children.get('helper.ts')!
    expect(helper.file?.status).toBe('modified')
  })

  it('merges files into existing folder nodes', () => {
    const root = buildTree([makeDiff('src/a.ts', 'added'), makeDiff('src/b.ts', 'deleted')])
    const src = root.children.get('src')!
    expect(src.children.size).toBe(2)
    expect(src.children.has('a.ts')).toBe(true)
    expect(src.children.has('b.ts')).toBe(true)
  })
})

describe('collectStatuses', () => {
  it('collects statuses from nested tree', () => {
    const root = buildTree([makeDiff('a/x.ts', 'added'), makeDiff('a/y.ts', 'deleted'), makeDiff('b.ts', 'modified')])
    const s = new Set<string>()
    collectStatuses(root, s)
    expect(s).toContain('added')
    expect(s).toContain('deleted')
    expect(s).toContain('modified')
  })

  it('returns empty set for empty tree', () => {
    const root = buildTree([])
    const s = new Set<string>()
    collectStatuses(root, s)
    expect(s.size).toBe(0)
  })
})

describe('getFolderStatus', () => {
  it('returns modified if any child is modified', () => {
    const root = buildTree([makeDiff('dir/a.ts', 'modified'), makeDiff('dir/b.ts', 'added')])
    const dir = root.children.get('dir')!
    expect(getFolderStatus(dir)).toBe('modified')
  })

  it('returns modified if folder has both added and deleted', () => {
    const root = buildTree([makeDiff('dir/new.ts', 'added'), makeDiff('dir/old.ts', 'deleted')])
    const dir = root.children.get('dir')!
    expect(getFolderStatus(dir)).toBe('modified')
  })

  it('returns added if all children are added', () => {
    const root = buildTree([makeDiff('dir/a.ts', 'added'), makeDiff('dir/b.ts', 'added')])
    const dir = root.children.get('dir')!
    expect(getFolderStatus(dir)).toBe('added')
  })

  it('returns deleted if all children are deleted', () => {
    const root = buildTree([makeDiff('dir/a.ts', 'deleted'), makeDiff('dir/b.ts', 'deleted')])
    const dir = root.children.get('dir')!
    expect(getFolderStatus(dir)).toBe('deleted')
  })

  it('returns null for root with no files', () => {
    const root = buildTree([])
    expect(getFolderStatus(root)).toBeNull()
  })
})

describe('countFiles', () => {
  it('counts files in nested tree', () => {
    const root = buildTree([makeDiff('a/x.ts', 'added'), makeDiff('a/b/y.ts', 'modified'), makeDiff('c.ts', 'deleted')])
    expect(countFiles(root)).toBe(3)
    expect(countFiles(root.children.get('a')!)).toBe(2)
  })

  it('returns 0 for empty tree', () => {
    const root = buildTree([])
    expect(countFiles(root)).toBe(0)
  })
})

describe('buildFlatList', () => {
  it('returns empty array for empty tree', () => {
    const root = buildTree([])
    expect(buildFlatList(root, new Set())).toEqual([])
  })

  it('lists folders before files, sorted alphabetically', () => {
    const root = buildTree([makeDiff('z.ts', 'added'), makeDiff('dir/a.ts', 'modified'), makeDiff('a.ts', 'deleted')])
    const items = buildFlatList(root, new Set())
    expect(items[0].name).toBe('dir')
    expect(items[0].isFolder).toBe(true)
    expect(items[1].name).toBe('a.ts')
    expect(items[1].isFolder).toBe(false)
    expect(items[2].name).toBe('z.ts')
  })

  it('expands folders that are in expandedFolders set', () => {
    const root = buildTree([makeDiff('src/index.ts', 'added'), makeDiff('src/utils/helper.ts', 'modified')])
    const items = buildFlatList(root, new Set(['src']))
    // src (expanded) → src/utils (collapsed), src/index.ts
    const names = items.map((i) => i.name)
    expect(names).toContain('src')
    expect(names).toContain('utils')
    expect(names).toContain('index.ts')
  })

  it('does not show children of collapsed folders', () => {
    const root = buildTree([makeDiff('src/index.ts', 'added'), makeDiff('src/utils/helper.ts', 'modified')])
    const items = buildFlatList(root, new Set())
    expect(items).toHaveLength(1) // only 'src' folder
    expect(items[0].name).toBe('src')
    expect(items[0].isExpanded).toBe(false)
  })

  it('sets correct depth for nested items', () => {
    const root = buildTree([makeDiff('a/b/c.ts', 'added')])
    const items = buildFlatList(root, new Set(['a', 'a/b']))
    expect(items[0].depth).toBe(0) // a
    expect(items[1].depth).toBe(1) // b
    expect(items[2].depth).toBe(2) // c.ts
  })

  it('includes folder metadata (folderStatus, fileCount)', () => {
    const root = buildTree([makeDiff('dir/a.ts', 'added'), makeDiff('dir/b.ts', 'added')])
    const items = buildFlatList(root, new Set())
    expect(items[0].folderStatus).toBe('added')
    expect(items[0].fileCount).toBe(2)
  })

  describe('a path that is both a file and a folder', () => {
    const diffs = [makeDiff('assets/icon', 'deleted'), makeDiff('assets/icon/logo.png', 'added')]

    it('emits a selectable file row and a folder row with distinct keys', () => {
      const items = buildFlatList(buildTree(diffs), new Set(['assets']))
      expect(items.map((i) => [i.key, i.isFolder])).toEqual([
        ['assets', true],
        ['assets/icon::file', false],
        ['assets/icon', true]
      ])
      const file = items[1]
      expect(file.diff?.filePath).toBe('assets/icon')
      expect(file.diff?.status).toBe('deleted')
      expect(file.depth).toBe(1)
    })

    it('keeps the file diff off the folder row and counts only the folder contents', () => {
      const items = buildFlatList(buildTree(diffs), new Set(['assets']))
      const folder = items[2]
      expect(folder.diff).toBeNull()
      expect(folder.fileCount).toBe(1)
      expect(folder.folderStatus).toBe('added')
    })

    it('shows the folder children after the folder row when it is expanded', () => {
      const items = buildFlatList(buildTree(diffs), new Set(['assets', 'assets/icon']))
      expect(items.map((i) => i.key)).toEqual(['assets', 'assets/icon::file', 'assets/icon', 'assets/icon/logo.png'])
    })

    it('makes every changed path reachable by selection', () => {
      const items = buildFlatList(buildTree(diffs), new Set(['assets', 'assets/icon']))
      const selectable = items.filter((i) => !i.isFolder && i.diff).map((i) => i.diff!.filePath)
      expect(selectable.sort()).toEqual(['assets/icon', 'assets/icon/logo.png'])
    })

    it('behaves the same when the folder entry comes before the file entry', () => {
      const items = buildFlatList(buildTree([...diffs].reverse()), new Set(['assets']))
      expect(items.map((i) => i.key)).toEqual(['assets', 'assets/icon::file', 'assets/icon'])
    })
  })
})
