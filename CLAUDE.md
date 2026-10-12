# MakeDiff

> **Always read `AGENTS.md` before starting work.** It contains detailed architecture rules, IPM API reference, IPC channels, data flow patterns, and code conventions.

Electron desktop app for viewing diffs between Make.com app versions.

## Tech Stack

- **Electron** 43.4.1 + **React** ^18.3 + **TypeScript** ^5.5
- **Node** 24 for local development and every CI job
- **electron-vite** ^2.3 (build), **monaco-editor** + **@monaco-editor/react** (diff rendering), **electron-store** (persistent storage)
- macOS (hiddenInset title bar) + Windows (NSIS installer)

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run preview      # Preview built app
npm run lint         # Run ESLint
npm run lint:fix     # Run ESLint with auto-fix
npm run format       # Format code with Prettier
npm run format:check # Check formatting
npm run typecheck    # Type check node and web projects with tsc
npm run test         # Run unit tests (vitest: node project for main and the renderer .test.ts files, jsdom project for the renderer .test.tsx files)
npm run test:coverage # Run tests with coverage report
npm run test:integration # Run IPC integration tests (faked IPM server)
npm run test:e2e     # Build, then run the Playwright Electron tests (opens real windows)
npm run test:watch   # Run tests in watch mode
npm run postinstall  # Install Electron app deps (runs automatically)
```

## Architecture

Three-process structure:
- `src/main/` — Electron main process (IPC handlers, services)
- `src/preload/` — Exposes API to renderer via contextBridge
- `src/renderer/` — React SPA: `app/` (root), `features/` (one folder per feature), `shared/` (api, types, ui, utils), `monaco/`, `styles/`

### IPC Pattern

All IPC handlers return `IpcResult<T>`:
```ts
{ success: boolean; data?: T; error?: string }
```

### Services (src/main/services/)

| Service | Role |
|---------|------|
| `ipm-client.ts` | Make IPM API calls (search, download, manifest) |
| `pkr-extractor.ts` | PKR archive extraction |
| `diff-service.ts` | Compare files between two versions (full-context unified diff) |
| `decompiler.ts` | Custom app decompilation (compiled → SDK structure) |
| `storage.ts` | Settings/theme persistence via electron-store |
| `external-link.ts` | Open http(s) links in the browser; failed launches are logged |
| `renderer-loader.ts` | Load the renderer (dev server or built file); a failed load is reported |
| `concurrency.ts` | Per-request limiter for dependency downloads |
| `ipm-base-url.ts` | Validates the E2E-only `MAKEDIFF_IPM_URL` override (unpackaged app, local http URL) |
| `path-segment.ts` | `assertPathSegment`: only plain names and versions go into local folders and IPM request paths |

## Code Conventions

- **Files**: kebab-case (`ipm-client.ts`)
- **Components**: PascalCase (`DiffViewer.tsx`)
- **Types**: Prefer `interface`, define in `types.ts`
- **Styles**: CSS custom properties for theming (`global.css`)
- **Error handling**: `instanceof Error` check, extract message

## Key Files

- `src/main/index.ts` — Window creation, menu setup
- `src/main/ipc-handlers.ts` — All IPC channel registration
- `src/preload/index.ts` — Exposes `window.api`, `window.appVersion`, `window.onMenu`
- `src/renderer/app/App.tsx` — Root component, state management
- `src/renderer/__tests__/setup.ts` and `mocks/` — jsdom test setup: typed `window.api` fake and Monaco fakes
- `src/renderer/monaco/monaco-setup.ts` — Monaco worker config, loader, language/theme registration
- `src/renderer/monaco/languages/imljson.ts` — IMLJSON Monarch tokenizer (JSON + IML `{{expressions}}`)
- `src/renderer/monaco/themes/monaco-themes.ts` — 3 Monaco themes (dark/make/light)
- `src/renderer/styles/global.css` — All styles + themes (dark/make/light)
