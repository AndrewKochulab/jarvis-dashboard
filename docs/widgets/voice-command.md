# Voice Command Widget

## Purpose

The most complex widget in the dashboard. Provides a full voice and text interface for interacting with Claude Code. Supports session management, interactive mode with permission handling, real-time output streaming, and TTS responses.

## Configuration

```json
{
  "widgets": {
    "voiceCommand": {
      "enabled": true,
      "mode": "local",
      "model": "sonnet",
      "terminal": { ... },
      "personality": { ... },
      "interactive": { ... },
      "tts": { ... }
    }
  }
}
```

See [Customization Reference](../customizations/README.md#widgetsvoicecommand) for all configuration keys.

## Architecture

The voice command widget is split into multiple sub-modules:

```
src/widgets/voice-command/
├── index.js                 # Desktop entry point
├── mobile.js                # Mobile entry point
├── core/
│   ├── state-machine.js     # State management (idle → recording → processing → ...)
│   ├── stream-handler.js    # Parses Claude stdout for terminal rendering
│   ├── terminal-panel.js    # Terminal output with markdown rendering
│   ├── session-tabs.js      # Multi-session tab bar with drag & drop
│   ├── reconnect-manager.js # Auto-reconnect on connection loss
│   ├── arc-reactor.js       # Animated arc reactor visual
│   ├── connection-bar.js    # Server connection status
│   ├── interaction-cards.js # Permission and question cards
│   ├── project-selector.js  # Project dropdown
│   ├── text-input.js        # Text input field
│   └── utilities.js         # Shared helpers
├── adapters/
│   ├── recorder-adapter.js  # Microphone recording abstraction
│   ├── storage-adapter.js   # Persistent storage abstraction
│   └── tts-adapter.js       # TTS playback abstraction
└── desktop/
    └── process-manager.js   # Local Claude CLI process spawning
```

## State Machine

The widget operates as a state machine with these states:

```
idle → recording → processing → streaming → idle
                                    ↓
                              interactive
                              (permission/question)
                                    ↓
                                streaming
```

| State | Description |
|---|---|
| `idle` | Waiting for user input (voice or text) |
| `recording` | Microphone is capturing audio |
| `processing` | Audio is being transcribed |
| `streaming` | Claude is generating a response |
| `interactive` | Waiting for user to approve a tool or answer a question |

## Key Features

### Voice Input
- Press the microphone button or use the arc reactor to start recording
- Audio is transcribed via whisper-cpp (local or server)
- Supports multi-language auto-detection

### Text Input
- Type commands directly in the text input field
- Press Enter or click Send to submit
- Works without any voice/TTS setup

### Session Management
- Multiple concurrent sessions with tab bar
- Drag and drop to reorder tabs
- Each session has its own terminal output
- Sessions are persisted across dashboard reloads
- Max 10 sessions, oldest idle sessions auto-pruned

### Terminal Panel
- Real-time streaming output from Claude
- Markdown rendering with code syntax highlighting
- Status labels for tool uses, thinking, completions
- Copy-to-clipboard button
- Configurable via `terminal.*` settings

### Interactive Mode
When `interactive.enabled` is `true`:

- **Permission Cards** — When Claude wants to use tools like Bash, Write, or Edit, a card appears asking for approval
- **Auto-approve** — Tools in `autoApproveTools` are approved automatically
- **Always-ask** — Tools in `alwaysAskTools` always show permission cards
- **Question Cards** — When Claude asks the user a question, a card appears for response
- **Timeout** — Permission and question cards auto-deny after `permissionTimeout` / `questionTimeout` ms
- **Voice responses** — Can respond to questions by voice when `voiceResponseEnabled` is `true`

### Personality System
The JARVIS personality is applied via `--append-system-prompt` when spawning Claude:

```json
{
  "personality": {
    "userName": "sir",
    "assistantName": "JARVIS",
    "prompt": "You are {assistantName}..."
  }
}
```

Placeholders `{userName}`, `{assistantName}`, and `{languages}` are substituted at runtime. Set `prompt` to `null` to disable the personality.

### Arc Reactor Animation
- Visual indicator inspired by Iron Man's arc reactor
- Pulsates during recording
- Spins during processing
- Glows during streaming
- Configurable zoom range via `zoomMin` / `zoomMax`

### Project Selector
- Dropdown to select the working project
- Projects come from `config.projects` (auto or manual mode)
- Selected project is passed to Claude as the working directory

## Modes

### Local Mode (`mode: "local"`)
- Claude CLI spawned directly on the machine
- TTS runs locally (Piper, Say, or browser)
- STT runs locally (whisper-cpp)
- Full interactive mode support
- Used by: Obsidian Desktop, macOS Tauri

### Remote Mode (`mode: "remote"`)
- Commands sent to companion server via WebSocket
- Server spawns Claude CLI
- Server handles TTS and STT
- Used by: Obsidian Mobile, iOS

### Mobile Entry (`mobile.js`)
- Simplified layout optimized for mobile screens
- Always uses remote mode
- Connection status bar prominent
- Auto-reconnect on connection loss

## Platform Behavior

| Feature | Obsidian Desktop | macOS (Tauri) | iOS | Obsidian Mobile |
|---|---|---|---|---|
| Voice input | Browser MediaRecorder | Browser MediaRecorder | AVAudioEngine | Browser MediaRecorder |
| STT | Local whisper-cpp | Rust transcribe_audio | Via server | Via server |
| TTS | Local Piper/Say | Local Piper/Say | Via server | Via server |
| Claude | Local CLI spawn | Tauri spawn_process | Via server | Via server |
| Interactive | Full support | Full support | Full support | Full support |

## Layout

```json
{ "type": "jarvis-voice-command" }
```

## Source

- Entry: `src/widgets/voice-command/index.js` (desktop), `mobile.js` (mobile)
- Core: `src/widgets/voice-command/core/*.js`
- Adapters: `src/widgets/voice-command/adapters/*.js`
- Desktop: `src/widgets/voice-command/desktop/*.js`
