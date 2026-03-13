# Architecture

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Platforms                                 │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Obsidian │  │ Obsidian │  │  macOS   │  │  iOS/iPadOS  │   │
│  │ Desktop  │  │  Mobile  │  │  Tauri   │  │   SwiftUI    │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       │              │             │                │            │
│  ┌────▼─────┐  ┌────▼─────┐  ┌────▼─────┐  ┌──────▼───────┐   │
│  │ DataviewJS│  │WKWebView │  │  WebView │  │  WKWebView   │   │
│  │ Adapter  │  │ Adapter  │  │  Tauri   │  │   Adapter    │   │
│  │          │  │          │  │  Adapter │  │              │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       │              │             │                │            │
│       └──────────────┴─────────────┴────────────────┘            │
│                              │                                   │
│                    ┌─────────▼──────────┐                       │
│                    │   shared/loader.js  │                       │
│                    │  (loadDashboard)    │                       │
│                    └─────────┬──────────┘                       │
│                              │                                   │
│              ┌───────────────┼───────────────┐                  │
│              │               │               │                  │
│        ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼──────┐          │
│        │   Core    │  │ Services  │  │  Widgets   │          │
│        │ theme.js  │  │ session-  │  │ header/    │          │
│        │ styles.js │  │ parser.js │  │ voice-cmd/ │          │
│        │ helpers.js│  │ stats-    │  │ live-sess/ │          │
│        │           │  │ engine.js │  │ ...12 more │          │
│        └───────────┘  └───────────┘  └────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  Companion Server  │  (mobile/remote only)
                    │  WSS :7777 (TLS)   │
                    │  WS  :7778 (local) │
                    └────────────────────┘
```

## Module Loading System

All `.js` files in `src/` are **function bodies**, not ES modules. There are no `import` or `export` statements anywhere. The loader reads each file as text and wraps it:

```js
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
const moduleFn = new AsyncFunction("ctx", fileContents);
const result = await moduleFn(ctx);
```

This means:
- Every module receives a single `ctx` parameter
- Core modules return data or utility objects
- Service modules return objects with methods
- Widget modules return an `HTMLElement`
- Sub-modules are loaded by their parent via `ctx._adapter.readFile()` + `new Function()`

### Why not ES modules?

Obsidian's DataviewJS evaluates code via `eval()` inside a sandboxed context. ES module `import`/`export` syntax is not supported. The `new Function()` approach works identically across all four platforms.

## The `ctx` Object

The `ctx` object is the single dependency injection container. Every module receives it and can read/write properties. Here's the complete reference:

### Always Available

| Property | Type | Description |
|---|---|---|
| `el` | `Function` | DOM element factory: `el(tag, styles, textContent)` |
| `T` | `Object` | Theme colors (all 15 color properties) |
| `config` | `Object` | Merged configuration from all config layers |
| `container` | `HTMLElement` | Root DOM container |
| `isNarrow` | `boolean` | Viewport < 500px |
| `isMedium` | `boolean` | Viewport 500-949px |
| `isWide` | `boolean` | Viewport >= 950px |
| `leafEl` | `HTMLElement\|null` | Obsidian leaf element (null on other platforms) |
| `CARD_PAD` | `string` | Responsive card padding |
| `FONT_SM` | `string` | Responsive small font size |
| `intervals` | `number[]` | Interval IDs for cleanup |
| `cleanups` | `Function[]` | Cleanup functions called on unmount |
| `_paused` | `boolean` | True when tab is hidden (visibility API) |
| `_adapter` | `PlatformAdapter` | Platform-specific implementation |
| `_localConfig` | `Object` | config.local.json contents (credentials) |
| `_srcDir` | `string` | Absolute path to src/ directory |
| `_sessionManagerCore` | `Object` | Shared session manager logic |
| `markdownRenderer` | `Object` | Markdown-to-HTML renderer |
| `animationsEnabled` | `boolean` | From `performance.animationsEnabled` |
| `addHoverEffect` | `Function` | Adds hover glow to elements |
| `createSectionTitle` | `Function` | Creates styled section headers |

### Full Mode Only (Desktop)

| Property | Type | Description |
|---|---|---|
| `nodeFs` | `Object\|null` | Node.js `fs` module (Obsidian only) |
| `nodePath` | `Object\|null` | Node.js `path` module (Obsidian only) |
| `dv` | `Object\|null` | DataviewJS API (Obsidian only) |
| `fmtTokens` | `Function` | Format token count: `"12.5K"` |
| `fmtCost` | `Function` | Format cost: `"$1.23"` |
| `formatModel` | `Function` | Format model name: `"Sonnet"` |
| `describeAction` | `Function` | Describe a Claude tool use |
| `getModelFamily` | `Function` | Get pricing family from model ID |
| `agents` | `Array` | Parsed agent definitions from registry |
| `agentNames` | `Set` | Agent name lookup set |
| `skillToAgent` | `Map` | Skill name → agent name mapping |
| `agentCardRefs` | `Map` | Widget-level agent card DOM references |
| `onStatsReady` | `Function[]` | Callbacks fired when 30-day stats compute |
| `sessionParser` | `Object` | JSONL session parser service |
| `statsEngine` | `Object` | 30-day analytics computer |
| `timerService` | `Object` | Focus timer state manager |
| `voiceService` | `Object` | Voice recording service |
| `ttsService` | `Object` | Text-to-speech service |
| `sessionManager` | `Object` | Multi-session CRUD manager |
| `networkClient` | `Object\|undefined` | WebSocket client (remote mode) |
| `perf` | `Object` | Performance config section |
| `_pausables` | `Array` | Pause/resume handlers |
| `registerPausable` | `Function` | Register pause/resume callbacks |

### Mobile Mode Only

| Property | Type | Description |
|---|---|---|
| `sessionManager` | `Object` | Mobile session manager (simplified) |
| `networkClient` | `Object` | WebSocket client (always present) |

## Module Contract

```
src/core/*.js      → returns data or utility functions
src/services/*.js  → returns objects with methods
src/widgets/*/index.js → returns HTMLElement
```

### Core Modules

| Module | Returns | Purpose |
|---|---|---|
| `theme.js` | `{ T, isNarrow, isMedium, isWide, CARD_PAD, FONT_SM, leafEl }` | Theme colors + responsive breakpoints |
| `styles.js` | `HTMLStyleElement` | CSS keyframes and animations |
| `helpers.js` | `{ el, fmtTokens, fmtCost, formatModel, ... }` | DOM helpers and formatters |
| `markdown-renderer.js` | `Object` | Markdown-to-HTML conversion |

### Services

| Service | Purpose |
|---|---|
| `session-parser.js` | Parses JSONL session files, detects agents, auto-scans |
| `session-manager.js` | Multi-session CRUD, persistence to `~/.claude/jarvis-sessions.json` |
| `session-manager-core.js` | Shared session logic (desktop + mobile) |
| `session-manager-mobile.js` | Mobile-specific session manager |
| `stats-engine.js` | 30-day analytics with caching |
| `timer-service.js` | Focus timer state + vault logging |
| `voice-service.js` | Microphone recording, format conversion |
| `tts-service.js` | Text-to-speech playback |
| `network-client.js` | WebSocket client for companion server |

## Cross-Platform Bridge

The `PlatformAdapter` interface abstracts all platform-specific operations. Each platform implements this interface as a plain object (no class).

```
shared/bridge/
├── platform-adapter.js     # Interface definition (documentation only)
├── tauri-adapter.js         # macOS Tauri implementation
└── wkwebview-adapter.js     # iOS WKWebView implementation
```

Obsidian's adapter is built inline in `Jarvis Dashboard.md` using DataviewJS APIs (`dv`, `app`).

See [API Reference](../api/README.md) for the complete PlatformAdapter method list.

## Config Merging Pipeline

Configuration is loaded in 4 layers, each overriding the previous:

```
Layer 1: config.example.json    (template defaults, tracked in git)
   ↓ deep merge
Layer 2: config.json            (personal overrides, gitignored)
   ↓ deep merge
Layer 3: config.local.json      (credentials: host, token; gitignored)
   ↓ deep merge
Layer 4: Platform overrides     (e.g., iOS settings from Keychain)
```

The deep merge is recursive for objects but replaces arrays entirely. This means layout arrays in config.json completely replace the defaults.

## Cross-Widget Communication

Widgets are independent modules that don't import each other. Communication happens through shared `ctx` properties:

### Agent Card References
```js
// Agent Cards widget registers DOM refs:
ctx.agentCardRefs.set("JARVIS", { card, statusDot, statusText });

// Live Sessions widget reads them to update status:
const ref = ctx.agentCardRefs.get(agentName);
if (ref) ref.statusDot.style.background = "#44c98f";
```

### Stats Ready Callbacks
```js
// Widgets register callbacks before stats are computed:
ctx.onStatsReady.push((stats) => {
  // Update widget with 30-day analytics
});

// Stats engine fires all callbacks after computation:
ctx.onStatsReady.forEach(cb => cb(stats));
```

## Pause/Resume System

When the browser tab is hidden (visibility API), the dashboard pauses to save resources:

1. `ctx._paused` is set to `true`
2. All registered pausables have their `stop()` called
3. CSS class `jarvis-bg-paused` disables animations
4. On tab return: `start()` called, animations resume

```js
// Widgets register pausable intervals:
ctx.registerPausable(
  () => { /* start: resume polling */ },
  () => { /* stop: clear intervals */ }
);
```

## Interval Cleanup

All `setInterval` IDs must be pushed to `ctx.intervals`:

```js
ctx.intervals.push(setInterval(() => { /* ... */ }, 3000));
```

A `MutationObserver` watches for DOM removal of the dashboard wrapper. When removed:
1. All intervals in `ctx.intervals` are cleared
2. All functions in `ctx.cleanups` are called
3. Observer disconnects itself

## Widget Sub-Module Pattern

Complex widgets are split into sub-modules:

```
src/widgets/voice-command/
├── index.js                 # Main entry, orchestrates sub-modules
├── mobile.js                # Mobile-specific entry point
├── core/
│   ├── state-machine.js     # State management
│   ├── stream-handler.js    # Claude output streaming
│   ├── terminal-panel.js    # Terminal output rendering
│   ├── session-tabs.js      # Multi-session tab bar
│   ├── reconnect-manager.js # Auto-reconnect logic
│   └── ...
├── adapters/
│   ├── recorder-adapter.js  # Microphone recording
│   ├── storage-adapter.js   # Persistent storage
│   └── tts-adapter.js       # TTS playback
└── desktop/
    └── process-manager.js   # Local Claude process management
```

Sub-modules are loaded by their parent using the adapter's file reading capability:

```js
const code = ctx._adapter.readFile(ctx._srcDir + "widgets/voice-command/core/state-machine.js");
const subModule = new Function("ctx", "parentState", code)(ctx, state);
```
