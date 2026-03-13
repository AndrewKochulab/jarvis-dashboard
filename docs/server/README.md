# Companion Server

## Purpose

The companion server offloads heavy processing from mobile/web clients. It runs on your Mac and provides:

- **Claude CLI execution** — Spawns and manages Claude Code processes
- **Speech-to-text** — Transcribes audio using whisper-cpp
- **Text-to-speech** — Synthesizes speech using Piper or macOS Say
- **Audio processing** — Converts audio formats via ffmpeg

Mobile clients (iOS, Obsidian Mobile) connect to this server over WebSocket.

## Prerequisites

| Tool | Install | Purpose |
|---|---|---|
| Node.js 18+ | `brew install node` | Server runtime |
| ffmpeg | `brew install ffmpeg` | Audio format conversion |
| openssl | `brew install openssl` | TLS certificate generation |
| whisper-cpp | `brew install whisper-cpp` | Speech-to-text (optional) |
| Claude CLI | [claude.ai/code](https://claude.ai/code) | AI interaction |
| Piper TTS | `pipx install piper-tts` | Neural TTS (optional) |

> whisper-cpp is optional — text commands work without it. Only voice input requires whisper-cpp.

## Quick Start

```bash
cd companion

# Run setup (generates certs, token, config, LaunchAgent)
bash setup.sh

# Start the server
npm start
```

The server will start on:
- `wss://your-mac.local:7777` (TLS, for remote clients)
- `ws://localhost:7778` (plain, for local clients)

## Setup Script Walkthrough

`setup.sh` performs 6 steps:

### Step 1: Check Prerequisites
Verifies `node`, `openssl`, and `ffmpeg` are installed. Warns (but continues) if `whisper-cli` is missing.

### Step 2: Generate TLS Certificates
Creates a self-signed CA and server certificate in `companion/certs/`. Skips if certificates already exist. See [Certificates](../certificates/README.md).

### Step 3: Generate Auth Token
Creates a 64-character hex token via `openssl rand -hex 32` and saves it to `companion/.env`. Skips if `.env` already exists.

### Step 4: Create config.local.json
Writes `src/config/config.local.json` with your Mac's hostname and the generated token. Skips if the file already exists.

### Step 5: Install npm Dependencies
Runs `npm install` in the `companion/` directory.

### Step 6: Generate LaunchAgent Plist
Creates `com.jarvis.companion.plist` from the template `com.jarvis.companion.plist.example` with your paths filled in. The generated file is gitignored; the template is tracked in git.

## Architecture

```
┌─────────────────────────────────────────────┐
│              Companion Server                │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  server.js (entry point)             │   │
│  │  - Loads config                       │   │
│  │  - Creates dual servers               │   │
│  └──────────┬───────────────────────────┘   │
│             │                                │
│  ┌──────────▼───────────────────────────┐   │
│  │  server-factory.js                    │   │
│  │  - WSS server (:7777, TLS + auth)    │   │
│  │  - WS server  (:7778, localhost)     │   │
│  └──────────┬───────────────────────────┘   │
│             │                                │
│  ┌──────────▼───────────────────────────┐   │
│  │  connection-handler.js                │   │
│  │  - Token validation                   │   │
│  │  - Rate limiting                      │   │
│  │  - Connection tracking                │   │
│  └──────────┬───────────────────────────┘   │
│             │                                │
│  ┌──────────▼───────────────────────────┐   │
│  │  message-router.js                    │   │
│  │  - Routes by message type             │   │
│  │  - Dispatches to handlers             │   │
│  └──────────┬───────────────────────────┘   │
│             │                                │
│  ┌──────────▼───────────────────────────┐   │
│  │  handlers.js                          │   │
│  │  - transcribe → voice-pipeline.js     │   │
│  │  - claude → claude-runner.js          │   │
│  │  - tts → tts/tts-manager.js          │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  Support Modules                      │   │
│  │  - config.js         (config loader) │   │
│  │  - text-processing.js (md stripping) │   │
│  │  - utils.js          (shared utils)  │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  TTS Engines                          │   │
│  │  - tts-manager.js    (orchestrator)  │   │
│  │  - piper-engine.js   (neural TTS)   │   │
│  │  - say-engine.js     (macOS Say)    │   │
│  │  - base-engine.js    (interface)    │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## Module Reference

| Module | Purpose |
|---|---|
| `server.js` | Entry point; loads config, creates servers |
| `config.js` | Loads and merges config files + `.env` |
| `server-factory.js` | Creates WSS (TLS) and WS (local) servers |
| `connection-handler.js` | Manages WebSocket connections, auth, rate limiting |
| `message-router.js` | Routes incoming messages to appropriate handlers |
| `handlers.js` | Implements message handlers (transcribe, claude, tts) |
| `claude-runner.js` | Spawns and manages Claude CLI processes |
| `voice-pipeline.js` | Audio transcription pipeline (ffmpeg → whisper-cli) |
| `text-processing.js` | Strips markdown for TTS, cleans text |
| `utils.js` | Shared utilities |
| `tts/tts-manager.js` | TTS engine selection, audio streaming |
| `tts/piper-engine.js` | Piper neural TTS engine |
| `tts/say-engine.js` | macOS `say` command TTS engine |
| `tts/base-engine.js` | Base class for TTS engines |

## Configuration

Server configuration comes from the merged config files. Key sections:

### `companion` section

```json
{
  "companion": {
    "ffmpegPath": "/opt/homebrew/bin/ffmpeg",
    "whisperPath": "/opt/homebrew/bin/whisper-cli",
    "whisperModel": "/opt/homebrew/share/whisper-cpp/ggml-small.bin",
    "whisperLang": "auto",
    "claudePath": null,
    "maxConnections": 2,
    "rateLimitPerMinute": 10,
    "idleTimeoutMs": 300000
  }
}
```

| Key | Type | Default | Description |
|---|---|---|---|
| `ffmpegPath` | string | `/opt/homebrew/bin/ffmpeg` | Path to ffmpeg binary |
| `whisperPath` | string | `/opt/homebrew/bin/whisper-cli` | Path to whisper-cli binary |
| `whisperModel` | string | `ggml-small.bin` path | Path to whisper model file |
| `whisperLang` | string | `"auto"` | STT language (`"auto"` for detection) |
| `claudePath` | string\|null | `null` | Path to claude binary (null = use PATH) |
| `maxConnections` | number | `2` | Max simultaneous WebSocket connections |
| `rateLimitPerMinute` | number | `10` | Max Claude requests per minute per client |
| `idleTimeoutMs` | number | `300000` | Idle connection timeout (5 min) |

### `network` section

```json
{
  "network": {
    "host": "your-mac.local",
    "port": 7777,
    "localPort": 7778,
    "token": "64-char-hex-token"
  }
}
```

See [Customization](../customizations/README.md) for all config keys.

## LaunchAgent (Auto-Start)

The setup script generates a LaunchAgent plist for automatic server startup on login. A template (`com.jarvis.companion.plist.example`) is tracked in git; the generated `com.jarvis.companion.plist` with your actual paths is gitignored.

If setting up manually, copy the template and edit the paths:
```bash
cp companion/com.jarvis.companion.plist.example companion/com.jarvis.companion.plist
# Edit com.jarvis.companion.plist — replace /path/to/jarvis_dashboard with your actual path
```

### Install

```bash
cp companion/com.jarvis.companion.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.jarvis.companion.plist
```

### Unload

```bash
launchctl unload ~/Library/LaunchAgents/com.jarvis.companion.plist
```

### View Logs

```bash
# stdout
tail -f /tmp/jarvis-companion.log

# stderr
tail -f /tmp/jarvis-companion.err
```

### Restart

```bash
launchctl unload ~/Library/LaunchAgents/com.jarvis.companion.plist
launchctl load ~/Library/LaunchAgents/com.jarvis.companion.plist
```

## Tailscale Support

For remote access outside your local network:

1. Install Tailscale on both Mac and mobile device
2. Run setup (auto-detects Tailscale IP): `bash setup.sh`
3. The certificate SAN includes your Tailscale IP
4. Set `network.tailscaleHost` in `config.local.json`:

```json
{
  "network": {
    "host": "your-mac.local",
    "tailscaleHost": "100.64.1.2",
    "token": "..."
  }
}
```

The iOS app will attempt the Tailscale IP as a fallback if the local hostname is unreachable.

## Troubleshooting

**Server won't start — "EADDRINUSE":**
Another process is using port 7777 or 7778. Find it with `lsof -i :7777` and stop it.

**"whisper-cli not found":**
Install with `brew install whisper-cpp`. Text commands still work without it.

**"Certificate file not found":**
Run `bash setup.sh` to generate certificates, or check that `companion/certs/` contains `server.pem` and `server-key.pem`.

**iOS can't connect:**
1. Ensure server is running (`npm start`)
2. Both devices on same network (or Tailscale)
3. CA certificate installed and trusted on iOS (see [Certificates](../certificates/README.md))
4. Token matches between server `.env` and iOS app settings

**LaunchAgent not starting:**
Check logs at `/tmp/jarvis-companion.log` and `/tmp/jarvis-companion.err`. Ensure the `PATH` in the plist includes `/opt/homebrew/bin`.
