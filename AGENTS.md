# Agent Guidelines for MakeDiff

## Project Overview

Electron desktop app for viewing diffs between Make.com app versions. Downloads PKR archives from IPM API, extracts files, and renders side-by-side diffs.

## Development Workflow

1. Create feature branch (`git checkout -b feat/something`)
2. `npm run dev` to start — uses electron-vite with HMR for renderer
3. Main/preload changes require app restart; renderer changes hot reload
4. Commit with Conventional Commits (`feat:`, `fix:`, `chore:`, etc.)
5. Push and create PR to master → CI runs (lint, format, test, coverage)
6. Merge → release-please auto-creates a draft Release PR with CHANGELOG + version bump
7. Build output goes to `out/` directory

## Architecture Rules

- **Main process**: Business logic only (API calls, file I/O, storage)
- **Preload**: Minimal bridge — expose IPC via `contextBridge`, nothing else
- **Renderer**: UI only — never access Node.js APIs directly. It reaches the bridge only through `src/renderer/shared/api` (`getApi()`, `getMenuEvents()`, `getAppVersion()`, each reads `window` at call time) and takes types only from `src/renderer/shared/types`. ESLint enforces both, and also keeps `shared/` and `monaco/` from importing the layers above them and a feature from importing another feature (see Renderer Structure)

### Adding a new IPC channel

1. Add handler in `src/main/ipc-handlers.ts`
2. Expose in `src/preload/index.ts` via `window.api`
3. Call from renderer via `getApi().*` (`shared/api`)
4. Return `{ success, data?, error? }` pattern

### Adding a new menu item

1. Add to `buildMenu()` in `src/main/index.ts`
2. Send event via `mainWindow.webContents.send('menu:event-name')`
3. Register listener in preload `window.onMenu`
4. Handle in `app/App.tsx` useEffect

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
| `ipm:get-app-info` | `appName, version?` | `IpcResult<AppInfo>` |
| `ipm:download-and-extract` | `appName, version, type` | `IpcResult<ExtractedFile[]>` |
| `ipm:get-diff` | `appName, from, to` | `IpcResult<DiffResult>` |
| `ipm:get-app-icon` | `appName` | `IpcResult<string>` (data URL) |
| `ipm:download-version` | `appName, version` | `IpcResult<string>` (dir path) |
| `ipm:show-version` | `appName, version` | `IpcResult<DiffResult>` |
| `shell:show-in-finder` | `fullPath` | `void` |
| `favorites:load` | — | `IpcResult<FavoriteApp[]>` |
| `favorites:save` | `FavoriteApp[]` | `{ success }` |
| `recent:load` | — | `IpcResult<RecentApp[]>` |
| `recent:add` | `name, label, major` | `IpcResult<RecentApp[]>` |
| `editor:open-diff` | `{ filePath, fromVersion, toVersion, oldContent, newContent }` | `IpcResult<void>` |
| `clipboard:copy-zip` | `{ appName, version, files: {path,content}[] }` | `IpcResult<string>` (zip path) |

**Menu events:** `menu:download-app`, `menu:open-settings`, `menu:show-info`

## Preload Exposed Objects

- `window.api` — IPC interface (`settings`, `theme`, `ipm`, `favorites`, `recent`, `editor`, `clipboard`, `showInFinder` namespaces)
- `window.appVersion` — `{ app, electron, chrome, node }`
- `window.onMenu` — `{ downloadApp, openSettings, showInfo }` callback registration (each returns cleanup function)

The renderer never reads these three objects from `window` directly. `src/renderer/shared/api/electron-api.ts` exposes them as `getApi()`, `getMenuEvents()` and `getAppVersion()`; tests keep installing the fakes on `window` (`__tests__/mocks/window-api.ts`), and the getters read `window` on every call, so they see the fake of the current test. Do not call a getter at module scope or store its result in a module-level constant (ESLint rejects a direct call there)

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
9. Normalize JSON/IMLJSON keys via schema-aware sorting (`IMLJSON_KEY_ORDER` in `diff-service.ts`)

### Diff Service (`diff-service.ts`)
- `computeDiff()` normalizes all `.json` and `.imljson` files before diffing
- `.imljson` files: keys sorted by `IMLJSON_KEY_ORDER` schema (e.g., `baseUrl` → `url` → `method` → `headers` → `qs` → `body` → `response` → `pagination` → `log`)
- `.json` files: keys sorted alphabetically
- Nested objects (`response`, `pagination`, `log`, `aws`, `repeat`) have their own child key orders
- Keys not in the schema fall back to alphabetical sort after known keys

### Custom App Decompiler (`decompiler.ts`)
Transforms compiled custom apps (lib/app.js + manifest.json) into SDK structure:

**Detection:** `isCustomApp()` checks for `lib/app.js` existence

**Compiled → SDK mapping:**
| Compiled | SDK |
|----------|-----|
| `manifest.json` top fields | `metadata.json` |
| `lib/app.js` classes (static parse) | `modules/{name}/api.imljson` |
| `lib/rpc.js` classes (static parse) | `rpcs/{name}/api.imljson` |
| `lib/functions.js` exports | `functions/{name}/code.js` |
| Common fields across modules | `base.imljson` |
| `accounts/` (compiled) | `connections/` (SDK) |
| `hooks/` (compiled) | `webhooks/` (SDK) |

**Key behaviors:**
- JS is read as an AST with acorn (`decompiler-sandbox.ts`) and never executed; a construct that is not a plain literal makes the decompiler fall back to the raw compiled files
- `iml` field stripped from all extracted API objects
- `metadata` field stripped from module/RPC APIs (but kept in connections)
- `communication` arrays unwrapped: `{communication: [...]}` → `[...]`
- Base fields (`baseUrl`, `headers`, `timeout`, `log`, `response.error`, common `temp`, common `response.temp`) extracted to `base.imljson` and removed from each module/RPC
- Base extraction scans ALL communication steps (not just `[0]`) of ALL modules and promotes a field only if every module has it and its most common value holds a large enough share of the modules: 30% for scalar fields (`baseUrl`, `timeout`, `body`, scalar `response.valid`), 90% for the sub-keys of object fields (headers, qs, `response.error`)
- Module-specific overrides preserved: if a module's field value differs from base, it stays in the module
- Common `temp` / `response.temp` sub-fields: only sub-fields with identical values across ALL modules go to base; module-specific sub-fields stay in each module
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

**Key types (`src/main/types.ts`):** All shared types are defined here and re-exported via `src/preload/index.ts`. The renderer imports them from `src/renderer/shared/types` (`export type *` of the preload exports), never from `preload` or `main`.
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
- `FavoriteApp` — `{ name, label, major, addedAt }`
- `RecentApp` — `{ name, label, major, lastViewed }`
- `VersionTags` — `{ staging[], production[], stable[] }`
- `SearchApp` — `{ name, label, version, availableVersions[] }`
- `SearchEntry` — `{ app: SearchApp, major, versions[] }`

## Code Style

- TypeScript strict mode enabled
- No non-null assertions (`!`): narrow with a check, `??` or `flatMap` (ESLint errors outside `__tests__`)
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
- `.toast-*` for toast notifications
- `.media-*` for image previews
- `.app-*` for app info/icon elements
- `.empty-state-*` for landing page

**Rules:**
- Global CSS only (no CSS modules)
- All colors via CSS custom properties
- macOS + Windows desktop — no responsive/media queries
- `-webkit-app-region: drag` on header/drag areas
- `-webkit-app-region: no-drag` on interactive elements within drag areas

## Theming

Three themes: `dark` (default, Catppuccin-inspired), `make` (Make.com purple), `light` (Apple-inspired)
- Theme stored via electron-store, applied as `data-theme` attribute on `<html>`
- CSS variables in `global.css` for layout/UI colors
- Monaco editor themes defined in `monaco/themes/monaco-themes.ts` (`makediff-dark`, `makediff-make`, `makediff-light`)
- DiffViewer observes `data-theme` changes and calls `getMonacoTheme()` to sync

## Renderer Structure

`src/renderer/` has four layers and a few root files:

- `app/`: `App.tsx`, the root component and its state, with `EmptyState` and `AboutModal`, the parts that have no state of their own
- `features/<name>/`: one folder per feature (`sidebar`, `version-selector`, `diff`, `settings`, `download`) with its components, helpers and a `__tests__/` folder
- `shared/`: `api/` (the only code that reads the preload bridge objects on `window`), `types/` (the only import point for preload and main types), `ui/` (`Toast`, `MakeLogo`) and `utils/`
- `monaco/`: `monaco-setup.ts`, the IMLJSON tokenizer in `languages/` and the themes in `themes/`
- Root: `main.tsx`, `index.html`, `env.d.ts`, `styles/global.css`, and `__tests__/` with the test setup and the `window` fakes

Imports go down only. `app` uses `features`, `shared` and `monaco`; a feature uses `shared` and `monaco`; `monaco` uses `shared`; `shared` imports nothing from the other layers; a feature imports no other feature, so code that two features need moves to `shared/`. ESLint enforces this for static imports (`eslint.config.mjs`). The per-feature rules are generated from the folders in `features/`, so a new feature folder is covered without a config change. A test sits in the `__tests__/` folder next to the code it covers.

## Electron Window Config

- Size: 1400x900 (min 1000x700)
- macOS: `titleBarStyle: 'hiddenInset'`, `trafficLightPosition: { x: 15, y: 10 }` (conditional on `process.platform === 'darwin'`)
- Windows: default window frame
- `sandbox: false` in preload
- External links open via `shell.openExternal`

## Error Handling

- IPC: try/catch wrapping, `instanceof Error` check, return `{ success: false, error: message }`
- IPC input validation: `assertString`/`assertNumber` guards on key handlers (`get-app-info`, `recent:add`, `favorites:save`); `assertPathSegment` (`services/path-segment.ts`) on every handler that puts `appName`/`version` into a local path (`download-version`, `open-in-vscode`, `open-diff`, `copy-zip`), and in `IpmClient` for every name, version and type that goes into a request path
- Exports: image files are held as `data:` URIs in `ExtractedFile.content`; `toFileData` turns them back into bytes when writing to disk or a ZIP
- Requests: `get-diff`/`show-version`/`download-version` use one client and one dependency limiter (4 at a time) per request; the caches are cleared on settings save and session expiry
- Renderer: a Show/Compare response is dropped if the app or version selection changed while it was pending; clickable list rows use `role`, `tabIndex` and `onActivateKey` for keyboard access (combobox options such as the DownloadModal results are reached through `aria-activedescendant` instead)
- Favorites/recents: legacy entries without `major` field filtered out on load
- Connection test: catches 403 specifically for invalid token
- Dependency downloads: silently skipped on failure (empty catch)
- Download dialog cancel: returns `{ success: false, error: 'Cancelled' }`

## UI Components

### FileTree (`features/diff/FileTree.tsx`)
- IDE-style folder tree with indent guides (vertical lines per depth level)
- CSS triangle chevrons for folders, SVG file icons by extension
- File/folder name color indicates status: green=added, yellow=modified, red=deleted
- Resizable panel (drag right edge, 180–600px range)
- Starts collapsed; user expands folders manually

### DiffViewer (`features/diff/DiffViewer.tsx`)
- Uses Monaco DiffEditor (`@monaco-editor/react`) for all diff/code views
- Diff mode + modified: `DiffEditor` side-by-side (`renderSideBySide: true`)
- Diff mode + added/deleted: `DiffEditor` inline (`renderSideBySide: false`)
- Show mode: `Editor` (read-only single file view)
- Image files: custom JSX preview (data:image/* detection via `isValidDataUri`)
- Search (Cmd+F), scroll sync, code folding, word diff: all Monaco native
- Unchanged region collapsing: `hideUnchangedRegions` (UI-only, full content still in model; Expand All disables collapsing)
- Copy button: copies file content (show mode) or unified diff (diff mode)
- Open in VS Code button: writes temp files and runs `code --diff` via `editor:open-diff`
- Expand All button: reveals all collapsed unchanged regions
- Theme synced via MutationObserver on `data-theme` attribute → `getMonacoTheme()`

### Sidebar (`features/sidebar/Sidebar.tsx`)
- Search input with Cmd+K focus shortcut
- Favorites (star toggle) and Recents sections (collapsible)
- Version grouping by major version number

### VersionSelector (`features/version-selector/VersionSelector.tsx`)
- From/To dropdowns with swap button, Compare button (Cmd+Enter)
- Inline download row with Show, Download, and Copy ZIP buttons
- Copy ZIP: creates ZIP archive → copies file reference to clipboard (macOS: `NSFilenamesPboardType`, Windows: PowerShell `CF_HDROP`)
- Version timeline toggle

### VersionTimeline (`features/version-selector/VersionTimeline.tsx`)
- Horizontal timeline with drag-to-select from/to nodes
- Groups by major version, shows environment tags (staging/production/stable)
- Range highlighting between from and to

### ComponentTabs (`features/diff/ComponentTabs.tsx`)
- App / Connection / Webhook tabs with colored change count badges

### DownloadModal (`features/download/DownloadModal.tsx`)
- Search + select app, pick version, download to folder
- Search input is an ARIA combobox: the listbox is driven from the input (ArrowUp/Down, Enter) via `aria-activedescendant`, and the highlighted row scrolls into view
- Success state with Show in Finder action

### Settings (`features/settings/Settings.tsx`)
- Connection (host, token), Appearance (theme picker), Advanced (IPM version)
- Dirty state tracking with discard warning; theme reverts on discard
- Enter saves, Escape closes (with dirty check)

### Toast (`shared/ui/Toast.tsx`)
- Global toast notifications via `showToast(text, type)` function
- Auto-dismiss after 4s, supports error/success/info types

### Monaco Setup (`monaco/monaco-setup.ts`)
- Local Monaco loading via `loader.config({ monaco })` — no CDN, Electron offline support
- Workers: `editor.worker` (default), `json.worker` (JSON/IMLJSON), `ts.worker` (JS/TS), `css.worker`, `html.worker`. JS/TS/CSS diagnostics are off (read-only viewer, no error underlines)
- IMLJSON language: Monarch tokenizer in `monaco/languages/imljson.ts` (JSON + `{{IML}}` + `rpc://`)
- 3 themes in `monaco/themes/monaco-themes.ts`: `makediff-dark`, `makediff-make`, `makediff-light`
- Helpers: `getMonacoTheme()` (reads `data-theme`), `getLanguageForFile(path)` (ext→language map)

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
- `filterDiffs` in `app/App.tsx` must handle both compiled (`accounts/`, `hooks/`) and SDK (`connections/`, `webhooks/`) folder prefixes
- Electron `editMenu` role required for Cmd+A/C/V/X to work in renderer
- Platform-conditional window config: `titleBarStyle`/`trafficLightPosition` only on macOS
- Menu items `download-app`, `open-settings`, `about` disabled until settings are validated via `enableMenuItems()`

## Platform-Specific Behaviors

| Feature | macOS | Windows |
|---------|-------|---------|
| Window frame | `hiddenInset` + custom traffic light position | Default system frame |
| Clipboard copy ZIP | `NSFilenamesPboardType` plist buffer | PowerShell `Clipboard.SetFileDropList()` (`CF_HDROP`) |
| App quit on all windows closed | No (stays in dock) | Yes (`app.quit()`) |

## Temp Files

- Temp directory: `os.tmpdir()/makediff/`
- `editor:open-diff` writes `{base}@{version}{ext}` pairs, opens `code --diff`
- `clipboard:copy-zip` writes `{appName}@{version}.zip`

## Testing

- `npm run test` and `npm run test:coverage` run the unit tests in two vitest projects: `node` (`src/main/__tests__/**`, `src/main/services/__tests__/**` and `src/renderer/**/__tests__/**/*.test.ts`, minus `*.integration.test.ts`) and `renderer` (`src/renderer/**/__tests__/**/*.test.tsx`, jsdom, React Testing Library). One coverage report with one set of thresholds covers `src/main/services`, `src/renderer/app`, `src/renderer/features` and `src/renderer/shared`
- Renderer tests install fresh `window.api`, `window.onMenu` and `window.appVersion` mocks before every test (`src/renderer/__tests__/mocks/window-api.ts`, typed against the preload API, so a new IPC method breaks the typecheck until the factory has it). Read and override them with `mockApi()` and `mockMenu()`. `setup.ts` also mocks `@monaco-editor/react` and `monaco-editor` for every test, because jsdom cannot load the real editor, and stubs `scrollIntoView`. It also clears all mocks before and restores all spies after every test. `Toast` keeps one module-level handler, so a test renders one `ToastContainer` at a time
- A renderer test file must import nothing that needs Chromium layout or workers; use the e2e tests for that. A renderer `.test.ts` runs in the `node` project, so it can use neither `window` nor React; a test that needs either is a `.test.tsx` and runs in jsdom. `esbuild.jsx` is `automatic` in the `renderer` project because only `tsconfig.web.json` sets `jsx`
- `npm run test:integration` runs `src/main/__tests__/integration/*.integration.test.ts` (separate vitest config, `integration` CI job). They register the real IPC handlers and run the real `IpmClient`, PKR extraction, decompiler, diff and storage code against a faked IPM server (`nock` with the network closed, PKR archives built with `packSync`)
- Only Electron, `electron-store`, `child_process`, `os.tmpdir()` and the menu callbacks of `src/main/index.ts` are faked, in `integration/harness.ts` (plus `process.platform` and `Date` where a test sets them). A declared IPM request that no code made, or a request nobody declared, fails the test
- New scenario: declare the IPM responses (`mockApp`, `ipm()`), call `invoke(channel, ...)`, assert on the result, the files written under the temp folder or the requests made
- `npm run test:e2e` builds the app and runs the Playwright tests in `src/e2e/*.spec.ts` against the real Electron window (`e2e` CI job, run under `xvfb-run` on Linux). Each test starts the built app (`out/main/index.js`) with an empty `--user-data-dir` and a local fake IPM server (`src/e2e/fake-ipm.ts`, real PKR archives). `MAKEDIFF_IPM_URL` points the app at that server; `resolveIpmBaseUrl` ignores it in a packaged app and accepts only a local http URL. Local runs open real windows
- `sonar-project.properties` configures the SonarQube scan of the `sonarqube` CI job (project `make-app-diff` on `sonarqube.mgmt.integromat.org`). The job runs the unit tests (`coverage/lcov.info`) and the integration tests (`coverage-integration/lcov.info`) and passes both reports to the scan; tests and `src/e2e` are not analysed as source, but Sonar analyses them as test code with its TEST-scope rules (for example no `act()` around Testing Library calls, a direct `expect` in every test, no generic `.length` assertions), and an issue there counts as new code in the PR scan. The server ignores `NOSONAR` comments, so findings that are accepted on purpose are listed with their reason in `sonar.issue.ignore.multicriteria`. Those entries cover a whole file, so Sonar no longer reports new findings of those rules there (path traversal and command arguments in `ipc-handlers.ts`, request forgery in `ipm-client.ts`, click and pointer handlers on non-native elements (S6848) in `AboutModal`, `DownloadModal`, `FileTree`, `Settings`, `VersionSelector` and `VersionTimeline`, handlers and `role="button"` list items in `Sidebar` (S6847, S6819), the dialog `autoFocus` in `DownloadModal` (S9379), the Monarch regex in `imljson.ts` (S8786)): check them by hand in review
- New E2E scenario: use the `launch` fixture, call `signIn(page)`, then prefer role, label or visible text and keep CSS-class selectors in the helpers of `fixtures.ts`; stub native dialogs with `app.evaluate` (see `openDownloadDialog`)

## CI/CD

**Workflows (`.github/workflows/`):**

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | push to master, PR to master | Jobs `lint`, `format`, `typecheck`, `unit` (vitest with coverage thresholds), `integration` (IPC flows against a faked IPM server), `e2e` (Playwright against the Electron window), `sonarqube` (unit and integration coverage, then the SonarQube scan), `build`. The required checks are declared in mono (`requiredCiJobs`) |
| `release-assets.yml` | GitHub Release published, workflow_dispatch (`tag_name`) | Builds the DMG (macOS) and EXE (Windows) and uploads them to the Release |
| `release-please.yml` | push to master, workflow_dispatch | Generated by mono. Opens the draft Release PR (CHANGELOG + version bump), then creates the tag and GitHub Release when it is merged |
| `validate-pr.yml` | PR events, merge_group | Generated by mono. `Validate PR` check (required): PR title must follow Conventional Commits and the description must be at least 50 characters |
| `refresh-context-file.yaml` | PR opened, workflow_dispatch | Generated by mono. Suggests `AGENTS.md` updates when a PR changes the structure |
| `enhance-dependency-pr.yml` | PR events | Generated by mono. Analyzes Renovate dependency PRs |

Files marked "Generated by mono" are written by `libs/github-resources`. Change them there, not in this repository.

**Release flow:**
1. Merge PR to master → release-please opens a draft Release PR (CHANGELOG.md + version bump)
2. Mark the Release PR ready and merge it → tag `vX.Y.Z` and GitHub Release are created (`actions-toolkit.config.mjs` sets the `v` prefix)
3. The published Release triggers `release-assets.yml`: `build-mac` + `build-win` run in parallel and upload the DMG + EXE

**Updates:** There is no in-app update check. File > Open Releases Page opens the Releases page in the browser, and releases are installed manually.

**Dependencies:** The Make Renovate bot opens dependency PRs using the org preset in `renovate.json`. Dependabot is not used.

**Review:** Make Review, the org GitHub App, reviews pull requests automatically. No repository configuration is needed.

**Ownership:** Repository access, CODEOWNERS and the generated workflows are declared in mono (`libs/github-resources`, owner: athena team). Do not add a root `CODEOWNERS` file.
