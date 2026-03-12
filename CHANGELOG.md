# Changelog

## [1.5.0](https://github.com/minsu-kang/make-app-diff/compare/v1.4.5...v1.5.0) (2026-03-12)


### Features

* add 48-hour session timeout for token security ([cb0e047](https://github.com/minsu-kang/make-app-diff/commit/cb0e04767f00c1a28a87642bcf8b241e3a5f2122))
* add Open in VS Code button for show mode ([dbb7556](https://github.com/minsu-kang/make-app-diff/commit/dbb7556789fc4b7a30868b2cc939cdc0ddae54c3))


### Bug Fixes

* hook RPC routing and various improvements ([28dbf1b](https://github.com/minsu-kang/make-app-diff/commit/28dbf1badf44fc8ec79eda70fb4d84cd6a91a143))
* prevent hook dep defaults from overwriting app rpc.js data ([ba64df8](https://github.com/minsu-kang/make-app-diff/commit/ba64df850d6f4b8fd476bf770d9d2ed986af115d))
* quit app on macOS when all windows are closed ([5ba6aa3](https://github.com/minsu-kang/make-app-diff/commit/5ba6aa39ca9695935913ff1d9618742a36b2b902))
* route hook RPCs (attach/detach/update) to webhooks/ directory ([8fa22e9](https://github.com/minsu-kang/make-app-diff/commit/8fa22e9466f3b3ce2bcf1d70f1cf5a7e233f0e6d))

## [1.4.5](https://github.com/minsu-kang/make-app-diff/compare/v1.4.4...v1.4.5) (2026-03-11)


### Bug Fixes

* address review feedback on version handling edge cases ([69f8b72](https://github.com/minsu-kang/make-app-diff/commit/69f8b720e3e9ba6a3025492315ea9c1436e5e106))
* sort versions by semver and use full version list from API ([e97ef62](https://github.com/minsu-kang/make-app-diff/commit/e97ef6269bc1a38b4a56363c51b94a808a3227f1))
* sort versions by semver and use full version list from API ([672390e](https://github.com/minsu-kang/make-app-diff/commit/672390e4981dbbbc9f6c4153e5cef278d74f6ec4))

## [1.4.4](https://github.com/minsu-kang/make-app-diff/compare/v1.4.3...v1.4.4) (2026-03-10)


### Bug Fixes

* sync editor hideUnchangedRegions on file switch and extract config constant ([215156d](https://github.com/minsu-kang/make-app-diff/commit/215156deeebacc4c208f6406c1114073cbe01d8f))
* toggle Expand All / Collapse All button ([081ee40](https://github.com/minsu-kang/make-app-diff/commit/081ee406634079882922c0968d7f3ee507383958))
* toggle Expand All button to Collapse All after click ([c0f884a](https://github.com/minsu-kang/make-app-diff/commit/c0f884a78ecd7226a8c6b830bde63ca779a61769))

## [1.4.3](https://github.com/minsu-kang/make-app-diff/compare/v1.4.2...v1.4.3) (2026-03-10)


### Bug Fixes

* track major version in favorites/recents and harden IPC ([6cb9b84](https://github.com/minsu-kang/make-app-diff/commit/6cb9b843b6238e5e623b90b84563efbb6b9d72f1))
* track major version in favorites/recents and harden IPC inputs ([f30bdbd](https://github.com/minsu-kang/make-app-diff/commit/f30bdbd33448345adc589a1ae87dc3920394a6c7))
* wrap favorites:save handler in try/catch per IPC convention ([44bbbac](https://github.com/minsu-kang/make-app-diff/commit/44bbbac0463ac15363338986f6634c75746dc986))

## [1.4.2](https://github.com/minsu-kang/make-app-diff/compare/v1.4.1...v1.4.2) (2026-03-09)


### Bug Fixes

* cache update check and show rate limit error ([3dac11d](https://github.com/minsu-kang/make-app-diff/commit/3dac11d03c290dffac18c1220edce9aaf877f4f4))
* cache update check response and show specific rate limit error ([3986540](https://github.com/minsu-kang/make-app-diff/commit/3986540433b4aa9af66836f29cea15fb8c520297)), closes [#28](https://github.com/minsu-kang/make-app-diff/issues/28)

## [1.4.1](https://github.com/minsu-kang/make-app-diff/compare/v1.4.0...v1.4.1) (2026-03-09)


### Bug Fixes

* resolve VS Code CLI path and fix find widget tooltip flicker ([c517740](https://github.com/minsu-kang/make-app-diff/commit/c5177405905a77d110beee35b1733b1b84314cf5))
* resolve VS Code CLI path and fix find widget tooltip flicker ([0afa8ce](https://github.com/minsu-kang/make-app-diff/commit/0afa8ceaf4ec1f7978d122084996bcba73baf7b5))
* use execFile to prevent shell injection, narrow tooltip suppression ([8542db9](https://github.com/minsu-kang/make-app-diff/commit/8542db931d90377299458696782da366214ca747))

## [1.4.0](https://github.com/minsu-kang/make-app-diff/compare/v1.3.2...v1.4.0) (2026-03-09)


### Features

* replace diff2html with Monaco DiffEditor ([c0e8a2b](https://github.com/minsu-kang/make-app-diff/commit/c0e8a2b72f8486528c60a73a6ef3b10f1f7646fc))
* replace diff2html with Monaco DiffEditor for accurate diffs ([a494eb8](https://github.com/minsu-kang/make-app-diff/commit/a494eb80e11c0f169d89bb62b1e68e9c1b40a181))


### Bug Fixes

* address CodeRabbit review feedback ([28a4d5e](https://github.com/minsu-kang/make-app-diff/commit/28a4d5e5e190b181d9029d75e70177bdf943bbfc))
* make app icon background transparent ([e14fb77](https://github.com/minsu-kang/make-app-diff/commit/e14fb77b33b6159c5ecad9c3377f08b9b8805f15))

## [1.3.2](https://github.com/minsu-kang/make-app-diff/compare/v1.3.1...v1.3.2) (2026-03-08)


### Bug Fixes

* support Windows for clipboard copy ZIP and app menu ([69fdb63](https://github.com/minsu-kang/make-app-diff/commit/69fdb639ae671e6a4cbf56f526d10eac57e255aa))
* support Windows for clipboard copy ZIP and app menu ([2d70dce](https://github.com/minsu-kang/make-app-diff/commit/2d70dce131f228594ff802048f19411f4c722f83))
* use execFile for PowerShell clipboard and fix AGENT.md menu docs ([e1e7417](https://github.com/minsu-kang/make-app-diff/commit/e1e7417ab6d0c4d0cf21e23c5fd2cc072e7cab91))

## [1.3.1](https://github.com/minsu-kang/make-app-diff/compare/v1.3.0...v1.3.1) (2026-03-08)


### Bug Fixes

* disable File menu items until settings are validated ([0441fb9](https://github.com/minsu-kang/make-app-diff/commit/0441fb9511db69a2060a7120817147f7581f9531))
* disable File menu items until settings are validated ([83b1630](https://github.com/minsu-kang/make-app-diff/commit/83b1630cb3ea6f4d4d8c5c00957192739cfe513e))

## [1.3.0](https://github.com/minsu-kang/make-app-diff/compare/v1.2.4...v1.3.0) (2026-03-08)


### Features

* show brew upgrade button only on macOS and improve command ([beaf150](https://github.com/minsu-kang/make-app-diff/commit/beaf150e583071e92f6de87cfa3fe927220275ca))


### Bug Fixes

* format App.tsx with Prettier ([710d88b](https://github.com/minsu-kang/make-app-diff/commit/710d88b39ebe0dec43415309cadee29c80ca8416))
* show brew upgrade button only on macOS and improve command ([9c2fb84](https://github.com/minsu-kang/make-app-diff/commit/9c2fb840b15a024be3f594def858adb0b30b2509))

## [1.2.4](https://github.com/minsu-kang/make-app-diff/compare/v1.2.3...v1.2.4) (2026-03-08)


### Bug Fixes

* add brew upgrade command to update banner and README ([62dc48a](https://github.com/minsu-kang/make-app-diff/commit/62dc48aeec3f21e3a0d53306bc40c028c1953fd8))

## [1.2.3](https://github.com/minsu-kang/make-app-diff/compare/v1.2.2...v1.2.3) (2026-03-08)


### Features

* add Homebrew tap support ([1c7c778](https://github.com/minsu-kang/make-app-diff/commit/1c7c7788d96cb6aa4595136dad0c5c3adeb3c2fc))
* add Homebrew tap support with auto-update workflow and brew upgrade button ([ed92d4b](https://github.com/minsu-kang/make-app-diff/commit/ed92d4b58ae4b1c48757794360873539fe5f1a70))

## [1.2.2](https://github.com/minsu-kang/make-app-diff/compare/v1.2.1...v1.2.2) (2026-03-08)


### Bug Fixes

* add actor check to release-please skip conditions ([414c35c](https://github.com/minsu-kang/make-app-diff/commit/414c35c89fc665f2087c7f18d5cbc9b207316ca6))
* update banner improvements and skip checks on release-please ([2072b8b](https://github.com/minsu-kang/make-app-diff/commit/2072b8b0d3e00481a09bb7088c668fb4e87402fc))
* upgrade electron 31.7.7 → 35.7.5 (security patch) ([325ac7c](https://github.com/minsu-kang/make-app-diff/commit/325ac7c6af78c03dfb9ec27a44e6cfc15ebe4281))

## [1.2.1](https://github.com/minsu-kang/make-app-diff/compare/v1.2.0...v1.2.1) (2026-03-08)


### Bug Fixes

* add feedback for Check for Updates ([fa020cd](https://github.com/minsu-kang/make-app-diff/commit/fa020cd37cde8c9afd51c0cf2a24001d230fb658))
* align update:open-release with IpcResult contract ([5585074](https://github.com/minsu-kang/make-app-diff/commit/5585074f0cb4ecc5989be76feaa44c1bcfa4ccf2))
* correct CodeRabbit config schema (move tools under reviews) ([f621b2c](https://github.com/minsu-kang/make-app-diff/commit/f621b2ced90b4a113fd4ebe2f70515ad9b683211))
* update banner direct download and button clickability ([15d2767](https://github.com/minsu-kang/make-app-diff/commit/15d276793ed5f7222d77a9be5ea12c29203de71b))
* update banner direct download and button clickability ([b13dc83](https://github.com/minsu-kang/make-app-diff/commit/b13dc83985b888bf623a01f9248a10a105bd2d0f))

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
