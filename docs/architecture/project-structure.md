# Project Structure

## Directory Tree

```
jarvis_dashboard/
├── CLAUDE.md                          # AI assistant instructions
├── README.md                          # GitHub landing page
├── Jarvis Dashboard.md                # Obsidian desktop orchestrator
├── Jarvis Dashboard Mobile.md         # Obsidian mobile orchestrator
│
├── docs/                              # Documentation (this folder)
│
├── src/                               # Shared source code (all platforms)
│   ├── config/
│   │   ├── config.example.json        # Template defaults (tracked in git)
│   │   ├── config.local.example.json  # Credential template (tracked in git)
│   │   ├── config.json                # Personal overrides (gitignored)
│   │   ├── config.local.json          # Network credentials (gitignored)
│   │   └── Jarvis-Registry.md         # Agent definitions (YAML frontmatter)
│   │
│   ├── core/
│   │   ├── theme.js                   # Theme colors + responsive sizing
│   │   ├── styles.js                  # CSS keyframes and animations
│   │   ├── helpers.js                 # el() factory, formatters, utilities
│   │   └── markdown-renderer.js       # Markdown-to-HTML conversion
│   │
│   ├── services/
│   │   ├── session-parser.js          # JSONL parsing, agent detection, auto-scan
│   │   ├── session-manager.js         # Desktop multi-session CRUD
│   │   ├── session-manager-core.js    # Shared session logic (desktop + mobile)
│   │   ├── session-manager-mobile.js  # Mobile session manager
│   │   ├── stats-engine.js            # 30-day analytics with caching
│   │   ├── timer-service.js           # Focus timer state + vault logging
│   │   ├── voice-service.js           # Microphone recording
│   │   ├── tts-service.js             # Text-to-speech playback
│   │   └── network-client.js          # WebSocket client
│   │
│   └── widgets/
│       ├── header/
│       │   ├── index.js               # Header widget entry
│       │   └── ui/
│       │       ├── clock.js           # Live clock display
│       │       ├── status-line.js     # System status indicator
│       │       └── title-display.js   # Dashboard title + subtitle
│       │
│       ├── voice-command/
│       │   ├── index.js               # Desktop voice widget entry
│       │   ├── mobile.js              # Mobile voice widget entry
│       │   ├── core/
│       │   │   ├── state-machine.js   # Voice interaction states
│       │   │   ├── stream-handler.js  # Claude output streaming
│       │   │   ├── terminal-panel.js  # Terminal output rendering
│       │   │   ├── session-tabs.js    # Multi-session tab bar
│       │   │   ├── reconnect-manager.js # Auto-reconnect logic
│       │   │   ├── arc-reactor.js     # Arc reactor animation
│       │   │   ├── connection-bar.js  # Connection status bar
│       │   │   ├── interaction-cards.js # Permission/question cards
│       │   │   ├── project-selector.js  # Project dropdown
│       │   │   ├── text-input.js      # Text input field
│       │   │   └── utilities.js       # Shared utilities
│       │   ├── adapters/
│       │   │   ├── recorder-adapter.js  # Microphone abstraction
│       │   │   ├── storage-adapter.js   # Persistent storage
│       │   │   └── tts-adapter.js       # TTS abstraction
│       │   └── desktop/
│       │       └── process-manager.js   # Local Claude process management
│       │
│       ├── live-sessions/
│       │   ├── index.js               # Live sessions widget entry
│       │   ├── core/
│       │   │   └── session-differ.js  # Session state diffing
│       │   └── ui/
│       │       ├── session-row.js     # Individual session row
│       │       └── status-panel.js    # Overall status panel
│       │
│       ├── agent-cards/
│       │   ├── index.js               # Agent cards widget entry
│       │   └── ui/
│       │       ├── agent-card.js      # Individual agent card
│       │       └── robot-avatar.js    # SVG robot avatar
│       │
│       ├── focus-timer/
│       │   ├── index.js               # Focus timer widget entry
│       │   ├── core/
│       │   │   └── timer-state.js     # Timer state management
│       │   └── ui/
│       │       ├── circular-display.js  # SVG circular progress
│       │       ├── control-buttons.js   # Start/pause/reset buttons
│       │       └── preset-row.js        # Duration preset buttons
│       │
│       ├── quick-capture/
│       │   ├── index.js               # Quick capture widget entry
│       │   └── ui/
│       │       ├── capture-input.js   # Text input area
│       │       └── mic-button.js      # Voice dictation button
│       │
│       ├── activity-analytics/
│       │   ├── index.js               # Activity analytics widget entry
│       │   └── ui/
│       │       ├── heatmap-panel.js   # Usage heatmap grid
│       │       ├── model-breakdown-panel.js  # Model usage pie chart
│       │       └── peak-hours-panel.js       # Peak hours bar chart
│       │
│       ├── system-diagnostics/
│       │   ├── index.js               # System diagnostics widget entry
│       │   └── ui/
│       │       └── stat-card.js       # Individual stat card
│       │
│       ├── communication-link/
│       │   ├── index.js               # Communication link widget entry
│       │   └── ui/
│       │       └── terminal-display.js  # Terminal-style display
│       │
│       ├── quick-launch/
│       │   ├── index.js               # Quick launch widget entry
│       │   └── ui/
│       │       └── bookmark-card.js   # Individual bookmark card
│       │
│       ├── mission-control/
│       │   ├── index.js               # Mission control widget entry
│       │   └── ui/
│       │       └── nav-button.js      # Navigation button
│       │
│       ├── recent-activity/
│       │   ├── index.js               # Recent activity widget entry
│       │   └── ui/
│       │       └── activity-row.js    # Individual activity row
│       │
│       └── footer/
│           └── index.js               # Footer widget entry
│
├── shared/                            # Cross-platform code
│   ├── loader.js                      # loadDashboard() orchestrator
│   ├── bridge/
│   │   ├── platform-adapter.js        # PlatformAdapter interface (docs only)
│   │   ├── tauri-adapter.js           # macOS Tauri adapter
│   │   └── wkwebview-adapter.js       # iOS WKWebView adapter
│   └── polyfills/
│       ├── buffer.js                  # Buffer polyfill for browsers
│       └── path.js                    # Node.js path polyfill
│
├── companion/                         # WebSocket companion server
│   ├── server.js                      # Server entry point
│   ├── setup.sh                       # Setup script (certs, token, deps)
│   ├── package.json                   # Node.js dependencies
│   ├── modules/
│   │   ├── config.js                  # Server configuration loader
│   │   ├── server-factory.js          # Dual-server creation (WSS + WS)
│   │   ├── connection-handler.js      # WebSocket connection management
│   │   ├── message-router.js          # Message type routing
│   │   ├── handlers.js                # Message handler implementations
│   │   ├── claude-runner.js           # Claude CLI process management
│   │   ├── voice-pipeline.js          # Audio recording pipeline
│   │   ├── text-processing.js         # Markdown stripping, text cleanup
│   │   ├── utils.js                   # Shared utilities
│   │   └── tts/
│   │       ├── tts-manager.js         # TTS engine selection + streaming
│   │       ├── base-engine.js         # Base TTS engine class
│   │       ├── piper-engine.js        # Piper neural TTS engine
│   │       └── say-engine.js          # macOS Say TTS engine
│   └── certs/                         # Generated TLS certificates (gitignored)
│
├── ios/                               # iOS SwiftUI app
│   ├── JarvisApp.xcodeproj/           # Xcode project
│   ├── JarvisApp/
│   │   ├── App/
│   │   │   └── JarvisApp.swift        # App entry point (@main)
│   │   ├── Bridge/
│   │   │   ├── WebViewBridge.swift     # WKWebView ↔ JS bridge
│   │   │   └── AudioBridge.swift       # AVAudioEngine recording
│   │   ├── Views/
│   │   │   ├── DashboardView.swift     # Main dashboard view
│   │   │   └── SettingsView.swift      # Settings screen
│   │   ├── Services/
│   │   │   └── KeychainService.swift   # Keychain credential storage
│   │   ├── Resources/
│   │   │   └── Assets.xcassets/        # App icons
│   │   └── Info.plist                  # App configuration
│   ├── web/
│   │   ├── index.html                 # WebView HTML shell
│   │   └── ios-bootstrap.js           # iOS adapter + loader init
│   └── scripts/
│       └── setup-symlinks.sh          # Symlinks shared/ and src/ into web/
│
├── macos/                             # macOS Tauri 2.0 app
│   ├── package.json                   # Node.js config (build scripts)
│   ├── src-tauri/
│   │   ├── Cargo.toml                 # Rust dependencies
│   │   ├── tauri.conf.json            # Tauri configuration
│   │   ├── Info.plist                 # macOS app config
│   │   ├── src/
│   │   │   ├── main.rs                # Rust entry point
│   │   │   ├── lib.rs                 # Tauri plugin registration
│   │   │   ├── menu.rs                # Native menu bar
│   │   │   └── commands/
│   │   │       ├── mod.rs             # Command module registry
│   │   │       ├── fs_commands.rs     # File system commands
│   │   │       ├── os_commands.rs     # OS commands (homedir, tmpdir)
│   │   │       ├── process_commands.rs # Process spawn/kill/stdin
│   │   │       └── vault_commands.rs  # Vault queries (YAML, recent files)
│   │   ├── icons/                     # App icons (multiple sizes)
│   │   ├── capabilities/
│   │   │   └── default.json           # Tauri permission capabilities
│   │   └── gen/schemas/               # Generated Tauri schemas
│   ├── web/
│   │   ├── index.html                 # WebView HTML shell
│   │   └── macos-bootstrap.js         # Tauri adapter + loader init
│   └── scripts/
│       └── setup-symlinks.js          # Symlinks shared/ and src/ into web/
│
└── assets/                            # Images, GIFs, screenshots
    ├── jarvis-dashboard-preview.svg   # Hero banner
    ├── jarvis-realtime-testing.gif    # Voice command demo
    └── widgets/                       # Per-widget screenshots
```

## Tracked vs Gitignored

### Gitignored Files
- `src/config/config.json` — Personal configuration overrides
- `src/config/config.local.json` — Network credentials (host, token)
- `companion/certs/` — Generated TLS certificates
- `companion/.env` — Auth token
- `companion/node_modules/` — npm dependencies
- `macos/node_modules/` — npm dependencies
- `macos/src-tauri/target/` — Rust build output
- `ios/JarvisApp.xcodeproj/xcuserdata/` — Xcode user state
- `ios/web/src/` — Symlinked from root src/
- `ios/web/shared/` — Symlinked from root shared/
- `macos/web/src/` — Symlinked from root src/
- `macos/web/shared/` — Symlinked from root shared/

### Template Files (tracked, meant to be copied)
- `src/config/config.example.json` → copy to `config.json`
- `src/config/config.local.example.json` → copy to `config.local.json`
