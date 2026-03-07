# MakeDiff

> **Always read `AGENT.md` before starting work.** It contains detailed architecture rules, IPM API reference, IPC channels, data flow patterns, and code conventions.

Electron desktop app for viewing diffs between Make.com app versions.

## Tech Stack

- **Electron** ^31.0 + **React** ^18.3 + **TypeScript** ^5.5
- **electron-vite** ^2.3 (build), **diff2html** (diff rendering), **electron-store** (persistent storage)
- macOS target (hiddenInset title bar)

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run preview  # Preview built app
```

## Architecture

Three-process structure:
- `src/main/` — Electron main process (IPC handlers, services)
- `src/preload/` — Exposes API to renderer via contextBridge
- `src/renderer/` — React SPA (components, styles)

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
- `src/renderer/App.tsx` — Root component, state management
- `src/renderer/styles/global.css` — All styles + themes (dark/make/light)
