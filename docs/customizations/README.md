# Customization Reference

## Config System Overview

Configuration uses a 4-file cascade, each layer deep-merging over the previous:

```
config.example.json     →  Template defaults (tracked in git)
config.json             →  Personal overrides (gitignored)
config.local.json       →  Network credentials (gitignored)
Platform overrides      →  iOS Keychain values, Tauri first-launch picker
```

Deep merge is recursive for objects. Arrays are **replaced entirely** (not appended).

---

## `dashboard`

Top-level dashboard settings.

| Key | Type | Default | Description |
|---|---|---|---|
| `title` | string | `"J.A.R.V.I.S."` | Dashboard title displayed in header |
| `subtitle` | string | `"Just A Rather Very Intelligent System"` | Subtitle below title |
| `showScanLine` | boolean | `false` | Show animated scan line overlay |
| `statusText` | string | `"System Online"` | Status text in header |

## `theme`

15 color values that control the entire dashboard appearance.

| Key | Type | Default | Description |
|---|---|---|---|
| `bg` | string | `"#0a0a1a"` | Page background |
| `panelBg` | string | `"#0d1117"` | Widget panel background |
| `panelBorder` | string | `"rgba(0, 212, 255, 0.12)"` | Panel border color |
| `hoverBg` | string | `"#12182a"` | Hover state background |
| `accent` | string | `"#00d4ff"` | Primary accent color (cyan) |
| `accentDim` | string | `"rgba(0, 212, 255, 0.3)"` | Dimmed accent |
| `accentFaint` | string | `"rgba(0, 212, 255, 0.08)"` | Faint accent (backgrounds) |
| `purple` | string | `"#7c6bff"` | Secondary accent |
| `green` | string | `"#44c98f"` | Success/active color |
| `red` | string | `"#e74c3c"` | Error/danger color |
| `orange` | string | `"#ff6b35"` | Warning color |
| `gold` | string | `"#f6d365"` | Highlight color |
| `text` | string | `"#e0e6ed"` | Primary text |
| `textMuted` | string | `"#6b7b8d"` | Muted/secondary text |
| `textDim` | string | `"#3a4553"` | Dim/disabled text |

### Creating Custom Themes

Override any or all theme colors in your `config.json`:

```json
{
  "theme": {
    "bg": "#1a1a2e",
    "accent": "#e94560",
    "green": "#0f3460",
    "panelBg": "#16213e"
  }
}
```

Only override the colors you want to change — the rest inherit from `config.example.json`.

## `projects`

Project discovery and tracking configuration.

| Key | Type | Default | Description |
|---|---|---|---|
| `mode` | string | `"manual"` | `"auto"` (scan directory) or `"manual"` (explicit list) |
| `rootPath` | string | `"~/.claude/projects/"` | Root directory for auto-scan |
| `tracked` | array | `[]` | Manual project list |

### Manual Mode

```json
{
  "projects": {
    "mode": "manual",
    "tracked": [
      { "dir": "my-app", "label": "My App" },
      { "dir": "api-server", "label": "API Server" }
    ]
  }
}
```

The `dir` value is the folder name inside `~/.claude/projects/`.

### Auto Mode

```json
{
  "projects": {
    "mode": "auto",
    "rootPath": "~/.claude/projects/"
  }
}
```

Auto mode scans the root path and discovers all project directories. Results are cached per `performance.projectDiscoveryCacheMs`.

## `layout`

Array controlling widget order, grouping, and column layout.

```json
{
  "layout": [
    { "type": "header" },
    { "type": "jarvis-voice-command" },
    { "type": "live-sessions" },
    { "type": "row", "columns": 2, "widgets": ["focus-timer", "quick-capture"] },
    { "type": "agent-cards" },
    { "type": "communication-link" },
    { "type": "row", "columns": 2, "widgets": ["quick-launch", "mission-control"] },
    { "type": "system-diagnostics" },
    { "type": "activity-analytics" },
    { "type": "recent-activity" },
    { "type": "footer" }
  ]
}
```

### Layout Entry Types

**Single widget:**
```json
{ "type": "widget-name" }
```

**Row (multiple widgets side-by-side):**
```json
{ "type": "row", "columns": 2, "widgets": ["widget-a", "widget-b"] }
```

### Available Widget Names

| Name | Widget |
|---|---|
| `header` | Header with title, clock, status |
| `jarvis-voice-command` | Voice command interface |
| `live-sessions` | Active Claude session monitor |
| `focus-timer` | Pomodoro timer |
| `quick-capture` | Note capture with voice |
| `agent-cards` | AI agent status cards |
| `communication-link` | Terminal/editor launcher |
| `quick-launch` | App/URL bookmarks |
| `mission-control` | Dashboard navigation |
| `system-diagnostics` | 30-day system stats |
| `activity-analytics` | Usage heatmaps and charts |
| `recent-activity` | Recent vault files |
| `footer` | Dashboard footer |

Remove a widget by deleting its entry from the layout array.

## `widgets`

### `widgets.focusTimer`

| Key | Type | Default | Description |
|---|---|---|---|
| `workPresets` | array | `[{label:"30m",ms:1800000},{label:"60m",ms:3600000}]` | Work duration presets |
| `breakPresets` | array | `[{label:"5m",ms:300000},{label:"10m",ms:600000},{label:"15m",ms:900000}]` | Break duration presets |
| `logPath` | string | `"Work/Productivity"` | Vault folder for timer logs |

### `widgets.quickCapture`

| Key | Type | Default | Description |
|---|---|---|---|
| `targetFolder` | string | `"Inbox"` | Vault folder for captured notes |
| `tag` | string | `"inbox/capture"` | Tag applied to captured notes |
| `voice.enabled` | boolean | `true` | Enable voice dictation button |
| `voice.lang` | string | `"en"` | Speech recognition language |
| `voice.whisperModel` | string | `"ggml-small.bin" path` | Whisper model for voice capture |

### `widgets.quickLaunch`

```json
{
  "widgets": {
    "quickLaunch": {
      "groups": [
        {
          "name": "Development",
          "bookmarks": [
            { "name": "Cursor", "icon": "▸", "color": "#44c98f", "type": "app", "target": "Cursor" },
            { "name": "Terminal", "icon": "▪", "color": "#00d4ff", "type": "app", "target": "Terminal" }
          ]
        },
        {
          "name": "Web",
          "bookmarks": [
            { "name": "GitHub", "icon": "⬡", "color": "#e0e6ed", "type": "url", "target": "https://github.com" }
          ]
        }
      ]
    }
  }
}
```

**Bookmark fields:**

| Field | Type | Description |
|---|---|---|
| `name` | string | Display name |
| `icon` | string | Unicode character or emoji |
| `color` | string | Hex color for the icon |
| `type` | string | `"app"` (open application) or `"url"` (open URL) |
| `target` | string | Application name or URL |

### `widgets.missionControl`

```json
{
  "widgets": {
    "missionControl": {
      "dashboards": [
        { "name": "Health Dashboard", "path": "MOCs/Health Dashboard", "color": "#ff6b6b", "icon": "♥" }
      ]
    }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `name` | string | Display name |
| `path` | string | Vault path to the dashboard note |
| `color` | string | Hex color for the button |
| `icon` | string | Unicode character or emoji |

### `widgets.recentActivity`

| Key | Type | Default | Description |
|---|---|---|---|
| `count` | number | `10` | Number of recent files to show |
| `excludePatterns` | array | `["/(Daily\|Weekly\|Monthly)/"]` | Regex patterns to exclude |

### `widgets.communicationLink`

| Key | Type | Default | Description |
|---|---|---|---|
| `terminalApp` | string | `"Terminal"` | Terminal app to open |
| `editorApp` | string | `"Cursor"` | Code editor to open |
| `terminalTitle` | string | `"claude — Dashboard"` | Display title |
| `vaultPathDisplay` | string | `"~/my-vault"` | Display path |

### `widgets.agentCards`

| Key | Type | Default | Description |
|---|---|---|---|
| `registryPath` | string | `"src/config/Jarvis-Registry"` | Path to agent registry file |

### `widgets.systemDiagnostics`

| Key | Type | Default | Description |
|---|---|---|---|
| `periodDays` | number | `30` | Analytics period in days |
| `cacheDurationMs` | number | `300000` | Stats cache duration (5 min) |

### `widgets.voiceCommand`

The most complex widget configuration. See also [Voice Command Widget](../widgets/voice-command.md).

| Key | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Enable voice command widget |
| `mode` | string | `"local"` | `"local"` (direct CLI) or `"remote"` (via server) |
| `remoteTts` | string | `"local"` | TTS mode for remote: `"local"` or `"server"` |
| `model` | string | `"sonnet"` | Default Claude model |
| `zoomMin` | number | `0.92` | Min zoom for arc reactor animation |
| `zoomMax` | number | `1.08` | Max zoom for arc reactor animation |

#### `widgets.voiceCommand.terminal`

| Key | Type | Default | Description |
|---|---|---|---|
| `title` | string | `"JARVIS OUTPUT"` | Terminal panel header |
| `showProjectTag` | boolean | `true` | Show project name tag |
| `showStatusBadge` | boolean | `true` | Show status badge |
| `showCopyButton` | boolean | `true` | Show copy-to-clipboard button |
| `showCompletionLabel` | boolean | `true` | Show completion label |
| `completionLabel` | string | `"Process complete"` | Text for completion label |
| `showStatusLabels` | boolean | `true` | Show status labels in output |
| `showToolUseLabels` | boolean | `true` | Show tool use labels |
| `showCommand` | boolean | `false` | Show the executed command |
| `codeHighlighting.enabled` | boolean | `true` | Enable code syntax highlighting |

#### `widgets.voiceCommand.personality`

| Key | Type | Default | Description |
|---|---|---|---|
| `userName` | string | `"sir"` | How JARVIS addresses the user |
| `assistantName` | string | `"JARVIS"` | Assistant's name |
| `prompt` | string\|null | *(long prompt)* | System prompt for JARVIS personality. Set to `null` to disable. |
| `languageInstruction` | string | *(instruction)* | Multi-language response instruction |

The `prompt` supports placeholders: `{userName}`, `{assistantName}`, `{languages}`.

#### `widgets.voiceCommand.interactive`

| Key | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Enable interactive mode |
| `interactivePermissions` | boolean | `true` | Show permission cards for tool approval |
| `autoApproveTools` | array | `["Read","Glob","Grep",...]` | Tools approved automatically |
| `alwaysAskTools` | array | `["Bash","Write","Edit"]` | Tools that always require approval |
| `permissionTimeout` | number | `120000` | Permission request timeout (ms) |
| `questionTimeout` | number | `120000` | Question timeout (ms) |
| `voiceResponseEnabled` | boolean | `true` | Speak responses via TTS |
| `batchQuestions` | boolean | `true` | Batch multiple questions together |

#### `widgets.voiceCommand.tts`

| Key | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Enable text-to-speech |
| `engine` | string | `"piper"` | TTS engine: `"piper"`, `"say"`, or `"browser"` |
| `say.voice` | string | `"Daniel"` | macOS Say voice name |
| `say.rate` | number | `160` | macOS Say speech rate (words per minute) |
| `piper.binaryPath` | string | *(path)* | Path to Piper binary |
| `piper.modelPath` | string | *(path)* | Path to Piper .onnx model |
| `piper.lengthScale` | number\|null | `null` | Speech speed (lower = faster, 0.5-1.5) |
| `piper.noiseScale` | number | `0.4` | Variability (0-1) |
| `piper.noiseWScale` | number | `0.5` | Duration variation (0-1) |
| `piper.sentenceSilence` | number\|null | `null` | Pause between sentences (seconds) |
| `piper.volume` | number\|null | `null` | Output volume |

See [Text-to-Speech](../text-to-speech/README.md) and [Voice Models](../voice-models/README.md) for detailed TTS configuration.

## `network`

Network settings for companion server connections.

| Key | Type | Default | Description |
|---|---|---|---|
| `host` | string | `"your-mac.local"` | Companion server hostname |
| `port` | number | `7777` | WSS port |
| `localPort` | number | `7778` | Local WS port |
| `autoConnect` | boolean | `true` | Auto-connect on load |
| `heartbeatInterval` | number | `30000` | Heartbeat interval (ms) |
| `reconnectMaxDelay` | number | `30000` | Max reconnect delay (ms) |
| `mobileTts` | string | `"server"` | Mobile TTS mode: `"server"` or `"browser"` |
| `audioSizeLimit` | number | `10485760` | Max audio payload (bytes, 10 MB) |
| `connectionTimeout` | number | `10000` | Connection timeout (ms) |

Credentials (`token`, `tailscaleHost`) go in `config.local.json`:

```json
{
  "network": {
    "host": "my-mac.local",
    "token": "abc123...def456",
    "tailscaleHost": "100.64.1.2"
  }
}
```

## `language`

Multi-language support configuration.

| Key | Type | Default | Description |
|---|---|---|---|
| `stt` | string | `"auto"` | STT language (`"auto"` for detection) |
| `fallback` | string | `"en"` | Fallback language code |
| `piperModelsDir` | string | `"~/.config/piper"` | Directory containing Piper models |
| `supported` | object | `{ "en": {...} }` | Per-language settings |

### Per-Language Settings

```json
{
  "language": {
    "supported": {
      "en": {
        "label": "English",
        "piper": {
          "lengthScale": 0.72,
          "sentenceSilence": 0.08
        }
      },
      "uk": {
        "label": "Ukrainian",
        "piperModel": "uk_UA-ukrainian_tts-medium.onnx",
        "piper": {
          "lengthScale": 0.85,
          "sentenceSilence": 0.1
        }
      }
    }
  }
}
```

Each language can override Piper parameters and specify a language-specific model. See [Voice Models](../voice-models/README.md).

## `companion`

Companion server configuration (used by the server, not clients).

| Key | Type | Default | Description |
|---|---|---|---|
| `ffmpegPath` | string | `/opt/homebrew/bin/ffmpeg` | Path to ffmpeg |
| `whisperPath` | string | `/opt/homebrew/bin/whisper-cli` | Path to whisper-cli |
| `whisperModel` | string | *(path)* | Path to whisper model file |
| `whisperLang` | string | `"auto"` | STT language |
| `claudePath` | string\|null | `null` | Path to Claude binary (null = PATH) |
| `maxConnections` | number | `2` | Max WebSocket connections |
| `rateLimitPerMinute` | number | `10` | Claude requests per minute |
| `idleTimeoutMs` | number | `300000` | Idle connection timeout |

## `performance`

Performance tuning settings.

| Key | Type | Default | Description |
|---|---|---|---|
| `liveSessionsIntervalMs` | number | `3000` | Live Sessions polling interval |
| `processCheckCacheMs` | number | `10000` | Process check cache duration |
| `projectDiscoveryCacheMs` | number | `300000` | Project discovery cache (5 min) |
| `animationsEnabled` | boolean | `true` | Enable CSS animations |
| `clockIntervalMs` | number | `1000` | Clock update interval |
| `cleanupIntervalMs` | number | `5000` | Cleanup check interval |

## `pricing`

Claude model pricing rates (per million tokens).

```json
{
  "pricing": {
    "opus": { "input": 15, "output": 75 },
    "sonnet": { "input": 3, "output": 15 },
    "haiku": { "input": 0.80, "output": 4 }
  }
}
```

These are used to calculate cost estimates in System Diagnostics and Live Sessions widgets.

## `platform`

Platform-specific settings.

| Key | Type | Default | Description |
|---|---|---|---|
| `vaultBasePath` | string | `""` | Absolute path to vault root |
| `dashboardPath` | string | `""` | Path to dashboard within vault |
| `ios.bundleId` | string | `"com.jarvis.dashboard"` | iOS app bundle identifier |
| `ios.teamId` | string | `""` | Apple Development Team ID for signing |
| `macos.bundleId` | string | `"com.jarvis.dashboard"` | macOS app bundle identifier |
| `macos.productName` | string | `"Jarvis"` | macOS app display name |

iOS settings are applied by running `bash ios/scripts/apply-config.sh` (or `setup-symlinks.sh` which calls it automatically). macOS settings are applied automatically during `npm run dev` / `npm run build` via the prebuild step.

## Agent Registry

Agent definitions live in `src/config/Jarvis-Registry.md` using YAML frontmatter:

```yaml
---
agents:
  - name: "JARVIS"
    role: "Primary AI Assistant"
    color: "#00d4ff"
    icon: "◆"
    skills:
      - "code-review"
      - "refactoring"
      - "debugging"
    status: "active"
  - name: "FRIDAY"
    role: "Data Analyst"
    color: "#7c6bff"
    icon: "◇"
    skills:
      - "data-analysis"
      - "visualization"
    status: "standby"
---
```

| Field | Type | Description |
|---|---|---|
| `name` | string | Agent display name |
| `role` | string | Agent role description |
| `color` | string | Hex color for the agent card |
| `icon` | string | Unicode character icon |
| `skills` | string[] | List of skill names |
| `status` | string | Initial status: `"active"`, `"standby"`, `"offline"` |
