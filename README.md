# MakeDiff

Desktop app for viewing diffs between Make.com app versions. Downloads PKR archives from the IPM API, extracts files, and renders side-by-side diffs with full file context.

Built with Electron + React + TypeScript for macOS and Windows.

## Features

- **Version comparison** — Select any two versions of a Make.com app and view a full diff
- **Custom app decompiler** — Automatically transforms compiled custom apps (`lib/app.js`, `lib/rpc.js`) into readable SDK structure (`modules/`, `rpcs/`, `functions/`, `connections/`)
- **IDE-style file tree** — Collapsible folder tree with extension-based file icons, status coloring, and resizable panel
- **Side-by-side diff** — Modified files shown side-by-side; added/deleted files shown in unified format
- **Full context** — Entire file content displayed, no collapsed/skipped lines
- **Smart copy** — Cmd+A selects only the active side; copy strips empty placeholder rows
- **Dependency diffing** — Automatically downloads and diffs account/hook dependencies from manifests
- **Three themes** — Dark (default), Make (purple), Light (Apple-inspired)
- **App download** — Download any app version to a local folder in SDK structure
- **Update notification** — Checks GitHub Releases for new versions on startup

## Installation

### Homebrew (macOS, recommended)

```bash
brew install --cask --no-quarantine minsu-kang/makediff/makediff
```

The `--no-quarantine` flag skips Gatekeeper checks, allowing the unsigned app to launch without the `xattr -cr` workaround.

### Manual Download

Download the latest release from the [Releases](https://github.com/minsu-kang/make-app-diff/releases) page:
- **macOS** — `.dmg` file
- **Windows** — `.exe` installer

> **"MakeDiff is damaged" warning on macOS (manual install only)**
>
> The app is not code-signed, so macOS Gatekeeper will block it. Run the following in Terminal:
> ```bash
> xattr -cr /Applications/MakeDiff.app
> ```
> The app will open normally after this.

## Development

```bash
npm install
npm run dev
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Production build |
| `npm run preview` | Preview built app |

## Architecture

Three-process Electron structure:

```
src/
  main/           # Main process — API calls, file I/O, IPC handlers
    services/     # ipm-client, pkr-extractor, diff-service, decompiler, storage
  preload/        # Bridge — exposes window.api via contextBridge
  renderer/       # React SPA — components, styles
    components/   # App, FileTree, DiffViewer, SettingsModal, etc.
    styles/       # global.css (all styles + themes)
```

## IPM API

Connects to Make.com's IPM API (`ipm.integromat.com` / `ipme.integromat.com`) to search apps, fetch version info, and download PKR archives. Requires valid IPM tokens configured in Settings.

## Custom App Decompiler

When a downloaded app is detected as a custom app (contains `lib/app.js`), the decompiler automatically transforms it:

| Compiled | SDK |
|----------|-----|
| `manifest.json` | `metadata.json` + module metadata |
| `lib/app.js` | `modules/{name}/api.imljson` |
| `lib/rpc.js` | `rpcs/{name}/api.imljson` |
| `lib/functions.js` | `functions/{name}/code.js` |
| Common API fields | `base.imljson` |
| `accounts/` | `connections/` |
| `hooks/` | `webhooks/` |

## Tech Stack

- **Electron** ^31.0 — Desktop runtime
- **React** ^18.3 — UI framework
- **TypeScript** ^5.5 — Type safety
- **electron-vite** ^2.3 — Build tooling with HMR
- **diff2html** — Diff rendering
- **electron-store** — Persistent settings
- **pkr** — PKR archive extraction

## License

Private
