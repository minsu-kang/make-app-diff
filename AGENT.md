# Agent Guidelines for MakeDiff

## Project Overview

Electron desktop app for viewing diffs between Make.com app versions. Downloads PKR archives from IPM API, extracts files, and renders side-by-side diffs.

## Development Workflow

1. `npm run dev` to start — uses electron-vite with HMR for renderer
2. Main/preload changes require app restart; renderer changes hot reload
3. Build output goes to `out/` directory

## Architecture Rules

- **Main process**: Business logic only (API calls, file I/O, storage)
- **Preload**: Minimal bridge — expose IPC via `contextBridge`, nothing else
- **Renderer**: UI only — never access Node.js APIs directly

### Adding a new IPC channel

1. Add handler in `src/main/ipc-handlers.ts`
2. Expose in `src/preload/index.ts` via `window.api`
3. Call from renderer via `window.api.*`
4. Return `{ success, data?, error? }` pattern

### Adding a new menu item

1. Add to `buildMenu()` in `src/main/index.ts`
2. Send event via `mainWindow.webContents.send('menu:event-name')`
3. Register listener in preload `window.onMenu`
4. Handle in `App.tsx` useEffect

## IPM API Reference

**Hosts:** `ipm.integromat.com` (prod) / `ipme.integromat.com` (staging)

**Headers:**
- `x-imt-token` — Selected based on host (ipmeToken for ipme, ipmToken for ipm)
- `x-imt-ipm-version` — Defaults to `3.20.0`
- `x-imt-env` — Defaults to `staging`

**Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/search/apps` | List all available apps |
| GET | `/v3/info/{appName}` | App metadata and versions |
| GET | `/manifest/app/{appName}/{version}` | Manifest with dependencies |
| GET | `/v3/sync/app/{appName}/{version}` | Download app PKR (arraybuffer) |
| GET | `/v3/sync/account/{name}/{version}` | Download account component |
| GET | `/v3/sync/hook/{name}/{version}` | Download hook component |
| GET | `/admin/icon/apps/{appName}` | App icon image (arraybuffer) |
| GET | `/v3/info/google-drive` | Connection test (403 = invalid token) |

## IPC Channels

| Channel | Args | Returns |
|---------|------|---------|
| `settings:load` | — | `IpmSettings` |
| `settings:save` | `IpmSettings` | `{ success, error? }` |
| `theme:load` | — | `string` |
| `theme:save` | `string` | `{ success }` |
| `ipm:search-apps` | — | `IpcResult<SearchAppResult[]>` |
| `ipm:get-app-info` | `appName` | `IpcResult<AppInfo>` |
| `ipm:download-and-extract` | `appName, version, type` | `IpcResult<ExtractedFile[]>` |
| `ipm:get-diff` | `appName, from, to` | `IpcResult<DiffResult>` |
| `ipm:get-app-icon` | `appName` | `IpcResult<string>` (data URL) |
| `ipm:download-version` | `appName, version` | `IpcResult<string>` (dir path) |
| `ipm:show-version` | `appName, version` | `IpcResult<DiffResult>` |
| `shell:show-in-finder` | `fullPath` | `void` |
| `favorites:load` | — | `IpcResult<FavoriteApp[]>` |
| `favorites:save` | `FavoriteApp[]` | `{ success }` |
| `recent:load` | — | `IpcResult<RecentApp[]>` |
| `recent:add` | `name, label` | `IpcResult<RecentApp[]>` |

**Menu events:** `menu:download-app`, `menu:open-settings`, `menu:show-info`

## Preload Exposed Objects

- `window.api` — IPC interface (`settings`, `theme`, `ipm`, `favorites`, `recent`, `showInFinder` namespaces)
- `window.appVersion` — `{ app, electron, chrome, node }`
- `window.onMenu` — `{ downloadApp, openSettings, showInfo }` callback registration (each returns cleanup function)

## Data Flow Patterns

### Diff Comparison Flow
1. Download both app versions + manifests in parallel
2. Extract PKR files for both
3. **If custom app** (`lib/app.js` exists): decompile to SDK structure
4. Merge dependency lists (accounts, hooks) from both manifests
5. Download each dependency from both versions (skip missing silently)
6. **If custom app**: decompile accounts → `connections/`, hooks → `webhooks/`
7. Filter out `lib/functions.js` from dependencies
8. Compute full-context unified diff across all files

### Custom App Decompiler (`decompiler.ts`)
Transforms compiled custom apps (lib/app.js + manifest.json) into SDK structure:

**Detection:** `isCustomApp()` checks for `lib/app.js` existence

**Compiled → SDK mapping:**
| Compiled | SDK |
|----------|-----|
| `manifest.json` top fields | `metadata.json` |
| `lib/app.js` classes (vm) | `modules/{name}/api.imljson` |
| `lib/rpc.js` classes (vm) | `rpcs/{name}/api.imljson` |
| `lib/functions.js` exports | `functions/{name}/code.js` |
| Common fields across modules | `base.imljson` |
| `accounts/` (compiled) | `connections/` (SDK) |
| `hooks/` (compiled) | `webhooks/` (SDK) |

**Key behaviors:**
- JS parsed via Node.js `vm` module with mocked Make.com runtime classes
- `iml` field stripped from all extracted API objects
- `metadata` field stripped from module/RPC APIs (but kept in connections)
- `communication` arrays unwrapped: `{communication: [...]}` → `[...]`
- Base fields (`baseUrl`, `headers`, `timeout`, `log`, `response.error`, common `temp`) extracted to `base.imljson` and removed from each module/RPC
- Base extraction scans ALL modules including inside `communication[0]` blocks
- Common `temp` sub-fields: only fields with identical values across ALL modules go to base
- RPC references transformed: `rpc://{appName}@{N}/` → `rpc://`
- Module types from manifest sections: actions→action, searches→search, triggers→trigger
- `__IMTCONN__` param → connection reference, `__IMTHOOK__` param → webhook + instant_trigger
- Errors fall back to returning original unmodified files

### Version Grouping (Sidebar & DownloadModal)
- Groups versions by major version number (first segment before dot)
- Shows grouped entries if app has multiple major versions
- Limits filtered results to 50 entries (sidebar), 30 entries (download modal)

### Modal Pattern
- Overlay with `settings-overlay` class, click to close
- Panel with `settings-panel` class, `stopPropagation` prevents accidental close

## Type System

**Key types (`src/main/types.ts`):** All shared types are defined here and re-exported via `src/preload/index.ts`.
- `IpcResult<T>` — `{ success, data?, error? }` — standard IPC response wrapper
- `IpmSettings` — host, ipmToken, ipmeToken, env, ipmVersion
- `AppInfo` — name, label, description, version, versions, theme?, iconHash?, meta?
  - `meta` object contains: `theme` (hex color), `iconHash` (SHA-1), `label`, `tag` (`VersionTags`), `enabled`
- `AppManifest` — dependencies? `{ accounts[], hooks[], keys[] }`
- `ComponentType` — `'app' | 'account' | 'hook'`
- `ExtractedFile` — `{ path, content }`
- `ExtractedComponent` — `{ type: ComponentType, files: ExtractedFile[] }`
- `FileDiff` — `{ filePath, status, oldContent, newContent, unifiedDiff }`
- `DiffResult` — `{ type, diffs[], summary { added, deleted, modified, unchanged } }`
- `FavoriteApp` — `{ name, label, addedAt }`
- `RecentApp` — `{ name, label, lastViewed }`
- `VersionTags` — `{ staging[], production[], stable[] }`
- `SearchApp` — `{ name, label, version, availableVersions[] }`
- `SearchEntry` — `{ app: SearchApp, major, versions[] }`

## Code Style

- TypeScript strict mode enabled
- No default exports for services, default exports for React components
- Interfaces over type aliases
- Keep types in `src/main/types.ts` for shared types
- Component-local interfaces are OK for props
- CSS variables for all colors — never hardcode colors in components
- All themes defined in `:root` / `:root[data-theme='...']` in `global.css`

## CSS Conventions

**Naming:** kebab-case with hierarchical prefixes
- `.sidebar-*`, `.search-*`, `.btn-*`, `.version-*`
- `.tab-*`, `.tree-*`, `.file-tree-*`, `.diff-*`
- `.settings-*`, `.info-*`, `.download-*`
- `.code-*` for code viewer (show mode)
- `.toast-*` for toast notifications
- `.media-*` for image previews
- `.json-path-*` for JSON path annotations
- `.app-*` for app info/icon elements
- `.empty-state-*` for landing page
- `.d2h-*` for diff2html overrides

**Rules:**
- Global CSS only (no CSS modules)
- All colors via CSS custom properties
- macOS desktop only — no responsive/media queries
- `-webkit-app-region: drag` on header/drag areas
- `-webkit-app-region: no-drag` on interactive elements within drag areas

## Theming

Three themes: `dark` (default, Catppuccin-inspired), `make` (Make.com purple), `light` (Apple-inspired)
- Theme stored via electron-store, applied as `data-theme` attribute on `<html>`
- DiffViewer uses `d2h-dark-color-scheme` class for dark/make themes

## useIpc Hook

```ts
useIpcCall<T, A>(fn) → { data, loading, error, execute, setData }
```
- Auto-handles loading/error states
- Returns null on error (both `success: false` and exceptions)
- `setData` for imperative state overrides

## Electron Window Config

- Size: 1400x900 (min 1000x700)
- `titleBarStyle: 'hiddenInset'`, `trafficLightPosition: { x: 15, y: 10 }`
- `sandbox: false` in preload
- External links open via `shell.openExternal`

## Error Handling

- IPC: try/catch wrapping, `instanceof Error` check, return `{ success: false, error: message }`
- Connection test: catches 403 specifically for invalid token
- Dependency downloads: silently skipped on failure (empty catch)
- Download dialog cancel: returns `{ success: false, error: 'Cancelled' }`

## UI Components

### FileTree (`FileTree.tsx`)
- IDE-style folder tree with indent guides (vertical lines per depth level)
- CSS triangle chevrons for folders, SVG file icons by extension
- File/folder name color indicates status: green=added, yellow=modified, red=deleted
- Resizable panel (drag right edge, 180–600px range)
- Starts collapsed; user expands folders manually

### DiffViewer (`DiffViewer.tsx`)
- Side-by-side for modified files, unified (line-by-line) for added/deleted files
- Full file context (no line skipping)
- Cmd+A selects only the active side (left or right)
- Copy handler strips empty placeholder rows (no blank lines from the other side)
- `tab-size: 2` for compact indentation
- `user-select: text` overrides global `user-select: none`

### Sidebar (`Sidebar.tsx`)
- Search input with Cmd+K focus shortcut
- Favorites (star toggle) and Recents sections (collapsible)
- Version grouping by major version number

### VersionSelector (`VersionSelector.tsx`)
- From/To dropdowns with swap button, Compare button (Cmd+Enter)
- Inline download row with Show and Download buttons
- Version timeline toggle

### VersionTimeline (`VersionTimeline.tsx`)
- Horizontal timeline with drag-to-select from/to nodes
- Groups by major version, shows environment tags (staging/production/stable)
- Range highlighting between from and to

### ComponentTabs (`ComponentTabs.tsx`)
- App / Connection / Webhook tabs with colored change count badges

### DownloadModal (`DownloadModal.tsx`)
- Search + select app, pick version, download to folder
- Success state with Show in Finder action

### Settings (`Settings.tsx`)
- Connection (host, token), Appearance (theme picker), Advanced (IPM version)
- Dirty state tracking with discard warning; theme reverts on discard
- Enter saves, Escape closes (with dirty check)

### Toast (`Toast.tsx`)
- Global toast notifications via `showToast(text, type)` function
- Auto-dismiss after 4s, supports error/success/info types

### diff2html Overrides
- Compact line numbers (32px), minimal prefix/padding
- Empty placeholder cells: `user-select: none` via `.d2h-code-side-emptyplaceholder`
- File headers hidden, borders removed
- Dark theme via `d2h-dark-color-scheme` class

## Common Pitfalls

- `pkr` is a CommonJS module — use `require()` wrapper in `pkr-extractor.ts`
- Preload has `sandbox: false` — be careful with what gets exposed
- `tsconfig.web.json` only covers renderer; main uses `tsconfig.node.json`
- Traffic light buttons need `-webkit-app-region: drag` on header areas
- `AppInfo.label` is populated from manifest (not from `/v3/info/`), falls back to appName
- `lib/functions.js` is filtered out from dependency extractions
- `unpacked-app-files/` prefix is skipped during PKR extraction
- Main process changes (services, IPC handlers) require app restart — renderer hot reloads
- Compiled custom app functions.js exports strings, not function objects
- Some apps use `communication` array pattern (e.g. Google Drive) — base fields are inside each step
- `filterDiffs` in App.tsx must handle both compiled (`accounts/`, `hooks/`) and SDK (`connections/`, `webhooks/`) folder prefixes
- Electron `editMenu` role required for Cmd+A/C/V/X to work in renderer
