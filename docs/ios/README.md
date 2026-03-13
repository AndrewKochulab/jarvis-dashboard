# iOS App

## Overview

The iOS app is a native SwiftUI application that embeds the Jarvis Dashboard in a WKWebView. It provides a mobile voice command interface that connects to the companion server for Claude CLI execution, TTS, and STT.

## Prerequisites

- Xcode 15 or later
- iOS 17.0+ deployment target
- Apple Developer account (for device deployment)
- Companion server running on your Mac (see [Server Setup](../server/README.md))
- CA certificate installed on device (see [Certificates](../certificates/README.md))

## Project Setup

### Step 1: Create Symlinks

The iOS app loads shared JavaScript from `src/` and `shared/` via symlinks:

```bash
cd ios
bash scripts/setup-symlinks.sh
```

This creates:
- `ios/web/src/` → `../../src/`
- `ios/web/shared/` → `../../shared/`

### Step 2: Open in Xcode

```bash
open ios/JarvisApp.xcodeproj
```

### Step 3: Configure Signing

1. Select the **JarvisApp** target
2. Go to **Signing & Capabilities**
3. Select your **Team**
4. Change the **Bundle Identifier** to something unique (e.g., `com.yourname.jarvis`)

## Building

### Simulator

1. Select an iOS Simulator from the device picker
2. Press **Cmd+R** to build and run

### Physical Device

1. Connect your iOS device via USB
2. Select it from the device picker
3. Press **Cmd+R** to build and run
4. First run: trust the developer certificate on the device (Settings → General → VPN & Device Management)

## Configuration

### Settings Screen

The app includes a built-in Settings screen accessible via the gear icon. Configure:

| Setting | Description | Storage |
|---|---|---|
| Server Host | Companion server hostname (e.g., `my-mac.local`) | Keychain |
| Server Port | WebSocket port (default: `7777`) | Keychain |
| Auth Token | 64-character hex authentication token | Keychain |
| TTS Mode | `"server"` (via companion) or `"browser"` (speechSynthesis) | Keychain |

All credentials are stored in the iOS Keychain, providing hardware-backed encryption.

### Certificate Installation

Before the app can connect to the companion server:

1. AirDrop `companion/certs/jarvis-ca.pem` to your device
2. Settings → General → VPN & Device Management → Install the profile
3. Settings → General → About → Certificate Trust Settings → Enable trust

See [Certificates](../certificates/README.md) for detailed steps.

## Architecture

```
┌──────────────────────────────────────────┐
│           JarvisApp (SwiftUI)            │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │  JarvisApp.swift (@main)         │   │
│  │  - App entry point               │   │
│  │  - Scene setup                    │   │
│  └──────────┬───────────────────────┘   │
│             │                            │
│  ┌──────────▼───────────────────────┐   │
│  │  DashboardView.swift              │   │
│  │  - WKWebView container            │   │
│  │  - Settings sheet presentation    │   │
│  └──────────┬───────────────────────┘   │
│             │                            │
│  ┌──────────▼───────────────────────┐   │
│  │  WebViewBridge.swift              │   │
│  │  - WKWebView configuration        │   │
│  │  - JS ↔ Swift message handlers   │   │
│  │  - Keychain bridge                │   │
│  │  - Audio control bridge           │   │
│  └──────────┬───────────────────────┘   │
│             │                            │
│  ┌──────────▼───────────────────────┐   │
│  │  AudioBridge.swift                │   │
│  │  - AVAudioEngine recording        │   │
│  │  - PCM → base64 conversion        │   │
│  │  - Microphone permission          │   │
│  └──────────────────────────────────┘   │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │  Services                         │   │
│  │  - KeychainService.swift          │   │
│  │  - SettingsView.swift             │   │
│  └──────────────────────────────────┘   │
└──────────────────────────────────────────┘
         │
         │ WKWebView loads:
         ▼
┌──────────────────────────────────────────┐
│  ios/web/index.html                      │
│    → ios-bootstrap.js                    │
│      → wkwebview-adapter.js              │
│      → shared/loader.js                  │
│        → loadDashboard(adapter, {        │
│            mode: "mobile"                │
│          })                              │
└──────────────────────────────────────────┘
         │
         │ WebSocket (WSS)
         ▼
┌──────────────────────────────────────────┐
│  Companion Server                        │
│  wss://your-mac.local:7777               │
└──────────────────────────────────────────┘
```

### Data Flow

1. **App launches** → `DashboardView` creates a `WKWebView`
2. **WebView loads** `ios/web/index.html` which runs `ios-bootstrap.js`
3. **Bootstrap** creates a WKWebView adapter and calls `loadDashboard()` in mobile mode
4. **Loader** builds `ctx`, loads network client, renders voice widget
5. **User speaks** → `AudioBridge` records via AVAudioEngine → sends base64 audio to JS
6. **JS sends** audio to companion server via WebSocket for transcription
7. **Server returns** transcription → JS sends Claude prompt to server
8. **Server streams** Claude output back → JS renders in terminal panel
9. **TTS** — server synthesizes speech, streams PCM audio back to JS for playback

### Key Swift Components

**WebViewBridge.swift** — The bridge between SwiftUI and the web-based dashboard. Configures WKWebView with:
- Custom URL scheme handler for loading local files
- Message handlers for `audioControl` and `keychainStore`
- JavaScript injection for audio data callbacks

**AudioBridge.swift** — Handles microphone recording:
- Uses AVAudioEngine for real-time audio capture
- Converts to the format expected by the companion server
- Manages microphone permissions

**KeychainService.swift** — Wraps iOS Keychain:
- Stores server host, port, token, and TTS mode
- Hardware-backed encryption on devices with Secure Enclave
- Data persists across app reinstalls

## Permissions

The app requests these permissions (declared in `Info.plist`):

| Permission | Key | Purpose |
|---|---|---|
| Microphone | `NSMicrophoneUsageDescription` | Voice command recording |

## Troubleshooting

**"No such module" build error:**
Ensure symlinks are created: `cd ios && bash scripts/setup-symlinks.sh`

**White/blank screen after launch:**
Check that symlinks point to valid directories. Verify `ios/web/src/` and `ios/web/shared/` exist.

**Can't connect to server:**
1. Check Settings screen has correct host, port, and token
2. Verify CA certificate is installed and trusted
3. Ensure companion server is running
4. Both devices must be on the same network (or use Tailscale)

**Microphone not working:**
Grant microphone permission when prompted. If denied, go to Settings → JarvisApp → Microphone → Enable.

**Audio playback issues:**
Check that TTS mode is set to `"server"` in Settings. Ensure companion server has Piper or Say configured.
