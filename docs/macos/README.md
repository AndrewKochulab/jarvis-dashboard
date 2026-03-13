# macOS App (Tauri)

## Overview

The macOS app is a native desktop application built with Tauri 2.0. It provides the full Jarvis Dashboard experience without requiring Obsidian, using a Rust backend with a WebView frontend.

## Prerequisites

- **Rust toolchain** — Install via [rustup](https://rustup.rs/): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Node.js 18+** — `brew install node`
- **Xcode Command Line Tools** — `xcode-select --install`
- Optional: ffmpeg, whisper-cpp, Piper TTS (for voice features)

## Project Setup

### Step 1: Install Dependencies

```bash
cd macos
npm install
```

### Step 2: Create Symlinks

```bash
node scripts/setup-symlinks.js
```

This creates:
- `macos/web/src/` → `../../src/`
- `macos/web/shared/` → `../../shared/`

### Step 3: Configure

Ensure `src/config/config.json` exists (see [Setup Guide](../setup/README.md)).

## Development

### Dev Mode (with hot reload)

```bash
cd macos
npm run dev
```

This starts the Tauri development server with file watching. Changes to JavaScript files are reflected immediately.

### Production Build

```bash
cd macos
npm run build
```

The built app bundle is placed at `macos/src-tauri/target/release/bundle/macos/Jarvis Dashboard.app`.

### Install to Applications

```bash
cp -r macos/src-tauri/target/release/bundle/macos/Jarvis\ Dashboard.app /Applications/
```

## First Launch

On first launch, the app prompts you to select your Obsidian vault folder. This sets `platform.vaultBasePath` used by vault-related features (recent files, note opening, file counting).

Default path suggestion: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/your-vault`

## Architecture

```
┌──────────────────────────────────────────────┐
│           Tauri 2.0 Application              │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  Rust Backend                         │   │
│  │                                       │   │
│  │  main.rs          (entry point)       │   │
│  │  lib.rs           (plugin + cmds)     │   │
│  │  menu.rs          (native menu bar)   │   │
│  │                                       │   │
│  │  commands/                            │   │
│  │  ├── fs_commands.rs    (file I/O)     │   │
│  │  ├── os_commands.rs    (homedir, tmp) │   │
│  │  ├── process_commands.rs (spawn, tts) │   │
│  │  └── vault_commands.rs (YAML, files)  │   │
│  └──────────┬───────────────────────────┘   │
│             │ invoke()                       │
│  ┌──────────▼───────────────────────────┐   │
│  │  WebView                              │   │
│  │                                       │   │
│  │  web/index.html                       │   │
│  │    → macos-bootstrap.js               │   │
│  │      → tauri-adapter.js               │   │
│  │      → shared/loader.js               │   │
│  │        → loadDashboard(adapter, {     │   │
│  │            mode: "full"               │   │
│  │          })                           │   │
│  └──────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

### How It Works

1. **Rust backend** starts the Tauri application and registers all commands
2. **WebView** loads `web/index.html` which runs `macos-bootstrap.js`
3. **Bootstrap** creates a Tauri adapter that wraps Rust commands as PlatformAdapter methods
4. **Loader** receives the adapter and orchestrates the full dashboard (mode: `"full"`)
5. All file I/O, process spawning, and system operations go through Tauri `invoke()` calls

### Tauri Adapter

The `tauri-adapter.js` translates PlatformAdapter methods to Tauri command invocations:

```js
// Example: readFile calls the Rust read_file command
readFile: (path) => window.__TAURI__.invoke("read_file", { path }),

// Example: spawn wraps the process spawning system
spawn: (program, args, opts) => {
  const id = generateId();
  window.__TAURI__.invoke("spawn_process", { id, program, args, opts });
  // Listen for stdout/stderr/close events
  return { id, stdout, stderr, onClose };
}
```

### Native Features

The Tauri app provides native capabilities not available in Obsidian:

| Feature | Implementation |
|---|---|
| **Menu bar** | Native macOS menu via `menu.rs` (File, Edit, Window, Help) |
| **Process spawning** | Direct process management via Rust (no Node.js needed) |
| **Transcription** | Built-in whisper-cli integration via `transcribe_audio` command |
| **File system** | Rust `std::fs` for fast file operations |
| **Vault browsing** | `walkdir` crate for recursive file discovery |
| **YAML parsing** | `serde_yaml` for frontmatter parsing |
| **App/URL launching** | `open` command via `open_url` / `open_app` |

### Rust Commands

The app registers 17 Tauri commands across 4 modules. See [API Reference](../api/README.md#tauri-command-registry) for the complete list.

## Configuration

The macOS app uses the same config system as all platforms:

1. Reads `src/config/config.example.json` (defaults)
2. Merges `src/config/config.json` (personal overrides)
3. Merges `src/config/config.local.json` (credentials, if present)
4. Applies platform overrides (vault path from first-launch picker)

The app does not require a companion server — it runs Claude CLI directly via process spawning.

## Tauri Configuration

Key settings in `macos/src-tauri/tauri.conf.json`:

```json
{
  "productName": "Jarvis Dashboard",
  "version": "1.0.0",
  "identifier": "com.jarvis.dashboard",
  "build": {
    "devUrl": "http://localhost:1420",
    "frontendDist": "../web"
  },
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'"
    }
  }
}
```

## Troubleshooting

**"cargo: command not found":**
Install Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

**Build fails with missing dependencies:**
Run `cd macos && npm install`, then ensure Rust dependencies compile: `cd src-tauri && cargo check`

**White/blank screen:**
Check symlinks exist: `ls -la macos/web/src macos/web/shared`. Re-run `node scripts/setup-symlinks.js` if missing.

**"Failed to spawn process":**
Ensure Claude CLI is installed and accessible in PATH. The app removes `CLAUDECODE` env vars to prevent "nested session" errors.

**Vault path not found:**
On first launch, select your vault folder. To reset, delete the stored preference and relaunch.

**Slow first build:**
First Rust compilation downloads and builds all dependencies. Subsequent builds are much faster (incremental compilation).
