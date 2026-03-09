export interface IpcResult<T> {
  success: boolean
  data?: T
  error?: string
}

export interface IpmSettings {
  host: string
  ipmToken: string
  ipmeToken: string
  env: string
  ipmVersion: string
}

export interface AppInfo {
  name: string
  label: string
  description: string
  version: string
  versions: string[]
  theme?: string
  iconHash?: string
  meta?: {
    theme?: string
    iconHash?: string
    label?: string
    tag?: VersionTags
    enabled?: boolean
  }
  [key: string]: unknown
}

export interface AppManifest {
  dependencies?: {
    accounts: string[]
    hooks: string[]
    keys: string[]
  }
  [key: string]: unknown
}

export interface SearchAppResult {
  name: string
  label: string
  theme: string
  version: string
  availableVersions: string[]
}

export type ComponentType = 'app' | 'account' | 'hook'

export interface ExtractedFile {
  path: string
  content: string
}

export interface ExtractedComponent {
  type: ComponentType
  files: ExtractedFile[]
}

export interface FileDiff {
  filePath: string
  status: 'added' | 'deleted' | 'modified' | 'unchanged'
  oldContent: string
  newContent: string
  unifiedDiff: string
}

export interface DiffResult {
  type: ComponentType
  diffs: FileDiff[]
  summary: {
    added: number
    deleted: number
    modified: number
    unchanged: number
  }
  isCustomApp?: boolean
}

export interface FavoriteApp {
  name: string
  label: string
  addedAt: number
}

export interface RecentApp {
  name: string
  label: string
  lastViewed: number
}

export interface VersionTags {
  staging: string[]
  production: string[]
  stable: string[]
}

export interface SearchApp {
  name: string
  label: string
  version: string
  availableVersions: string[]
}

export interface SearchEntry {
  app: SearchApp
  major: number
  versions: string[]
}
