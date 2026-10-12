import { describe, it, expect } from 'vitest'
import { buildTree, buildFlatList } from '../file-tree'
import type { FileDiff } from '../../shared/types'

const LOGO_PATH = 'icon/logo.png'

function makeDiff(filePath: string, status: FileDiff['status']): FileDiff {
  return { filePath, status, oldContent: '', newContent: '', unifiedDiff: '' }
}

describe('buildFlatList rows', () => {
  it('describes folder rows and file rows in full', () => {
    const changed = makeDiff('src/a.ts', 'modified')
    const readme = makeDiff('readme.md', 'added')
    const list = buildFlatList(buildTree([changed, readme]), new Set(['src']))

    expect(list).toEqual([
      {
        key: 'src',
        isFolder: true,
        name: 'src',
        fullPath: 'src',
        depth: 0,
        diff: null,
        folderStatus: 'modified',
        fileCount: 1,
        isExpanded: true
      },
      {
        key: 'src/a.ts',
        isFolder: false,
        name: 'a.ts',
        fullPath: 'src/a.ts',
        depth: 1,
        diff: changed,
        folderStatus: null,
        fileCount: 0,
        isExpanded: false
      },
      {
        key: 'readme.md',
        isFolder: false,
        name: 'readme.md',
        fullPath: 'readme.md',
        depth: 0,
        diff: readme,
        folderStatus: null,
        fileCount: 0,
        isExpanded: false
      }
    ])
  })

  it('marks a collapsed folder as not expanded and hides what is inside it', () => {
    const list = buildFlatList(buildTree([makeDiff('src/a.ts', 'deleted')]), new Set())

    expect(list).toEqual([
      {
        key: 'src',
        isFolder: true,
        name: 'src',
        fullPath: 'src',
        depth: 0,
        diff: null,
        folderStatus: 'deleted',
        fileCount: 1,
        isExpanded: false
      }
    ])
  })

  it('splits a path that is both a file and an expanded folder into a file row and a folder row', () => {
    const icon = makeDiff('icon', 'deleted')
    const logo = makeDiff(LOGO_PATH, 'added')
    const list = buildFlatList(buildTree([icon, logo]), new Set(['icon']))

    expect(list).toEqual([
      {
        key: 'icon::file',
        isFolder: false,
        name: 'icon',
        fullPath: 'icon',
        depth: 0,
        diff: icon,
        folderStatus: null,
        fileCount: 0,
        isExpanded: false
      },
      {
        key: 'icon',
        isFolder: true,
        name: 'icon',
        fullPath: 'icon',
        depth: 0,
        diff: null,
        folderStatus: 'added',
        fileCount: 1,
        isExpanded: true
      },
      {
        key: LOGO_PATH,
        isFolder: false,
        name: 'logo.png',
        fullPath: LOGO_PATH,
        depth: 1,
        diff: logo,
        folderStatus: null,
        fileCount: 0,
        isExpanded: false
      }
    ])
  })
})
