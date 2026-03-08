# Changelog

## [1.2.0](https://github.com/minsu-kang/make-app-diff/compare/v1.1.0...v1.2.0) (2026-03-08)


### Features

* add Windows support and CI improvements ([054b491](https://github.com/minsu-kang/make-app-diff/commit/054b491ae939d1e80c4e404d13250585cbde7413))
* add Windows support and CI improvements ([a3ee558](https://github.com/minsu-kang/make-app-diff/commit/a3ee558f1254bb65ff1b4e80397ba04563564f9e))

## [1.1.0](https://github.com/minsu-kang/make-app-diff/compare/v1.0.0...v1.1.0) (2026-03-08)


### Features

* add update version check notification ([e87c373](https://github.com/minsu-kang/make-app-diff/commit/e87c3730dd1838f94a168818e606feb7abf44664))
* various UI/UX improvements and new features ([c08a032](https://github.com/minsu-kang/make-app-diff/commit/c08a032a84a7e58cb6e76755f20b145e7e160b65))

## v1.0.0

### Core Features

- **Version Diff Comparison** — Side-by-side diff view for comparing two versions of Make.com apps
- **Single Version View** — Browse all files of a specific app version
- **Custom App Decompilation** — Compiled apps (lib/app.js) are automatically decompiled into SDK folder structure
  - Module extraction (actions, searches, triggers) with metadata/parameters/interface/api separation
  - RPC extraction from lib/rpc.js with reference transformation (`rpc://app@1/Name` → `rpc://Name`)
  - Function extraction from lib/functions.js
  - Base field extraction (common baseUrl, headers, error handling → base.imljson)
  - Common temp field deduplication across modules
  - Trigger parameter extraction from `__IMTCONN__`/`__IMTHOOK__` nested options
  - Epoch RPC (`epoch:ModuleName`) placed as module-level epoch.imljson with deep deduplication against api.imljson
  - Communication array unwrapping
- **Account/Hook Decompilation** — Connection and webhook components decompiled to SDK structure
- **PKR Archive Extraction** — Extracts .pkr package contents for viewing

### UI

- **Sidebar** — App search with keyboard navigation (Arrow keys, Enter, Escape), Cmd+K to focus
- **Favorites** — Star apps for quick access, persisted across sessions
- **Recent Apps** — Last 8 viewed apps with auto-ordering
- **File Tree** — Hierarchical folder/file view with status colors (green/red/yellow), collapsible folders, resizable panel (180-600px), file type icons
- **Version Selector** — From/To dropdowns filtered by active major version, swap button, version timeline with drag-to-select
- **Component Tabs** — App / Connection / Webhook tabs with change count badges (+added, -deleted, ~modified)
- **Settings Panel** — Host selection, token management, IPM version config, forced setup on first launch
- **Download Modal** — Search and download any app version to disk
- **About Modal** — Version info (App, Electron, Chrome, Node)
- **Toast Notifications** — Success/error/info messages with auto-dismiss

### Diff Viewer

- **Syntax Highlighting** — JSON, IMLJSON, JavaScript, TypeScript, CSS, XML, Markdown
- **Custom IMLJSON Highlighting** — IML `{{expressions}}`, built-in variables, `rpc://` references
- **Code Folding** — Collapsible blocks with fold indicators, auto-collapse long unchanged sections (8+ lines)
- **Scroll Sync** — Synchronized scrolling between left/right panels in side-by-side mode
- **Search** — Cmd+F with match counting, prev/next navigation, auto-fill from selection
- **JSON Path Annotations** — Shows JSON structure path for each line
- **Binary/Image Support** — Side-by-side image comparison for PNG, SVG, etc.
- **Copy Content** — Copy file content or unified diff to clipboard
- **VS Code Integration** — Open diff in VS Code (`code --diff`)
- **Cmd+A** — Selects only the active side (left/right)

### Themes

- **Dark** — Default theme (Catppuccin-inspired)
- **Make** — Brand purple theme
- **Light** — Clean light theme

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+K | Focus search |
| Cmd+F | Search in diff |
| Cmd+Enter | Compare versions |
| Cmd+, | Settings |
| Cmd+D | Download app |
| Cmd+I | About |
| Cmd+A | Select active side |

### Technical

- Electron 31 + React 18 + TypeScript 5.5
- electron-vite build system
- macOS native title bar (hiddenInset)
- Parallel version downloading for performance
- Deferred syntax highlighting via requestAnimationFrame
- electron-store for persistent settings/theme/favorites/recents
- IMLJSON-aware JSON key ordering in diffs
