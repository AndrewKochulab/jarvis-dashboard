# Setup Guide

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-username/jarvis-dashboard.git
cd jarvis-dashboard

# 2. Create your config files
cp src/config/config.example.json src/config/config.json
cp src/config/config.local.example.json src/config/config.local.json

# 3. Open in your platform of choice
# See platform-specific guides below
```

## Prerequisites Matrix

| Prerequisite | Obsidian Desktop | Obsidian Mobile | macOS (Tauri) | iOS |
|---|---|---|---|---|
| **Obsidian 1.0+** | Required | Required | - | - |
| **DataviewJS plugin** | Required | Required | - | - |
| **Node.js 18+** | - | Required (server) | Required | Required (server) |
| **Companion server** | Optional | Required | - | Required |
| **ffmpeg** | - | Required (server) | Optional (STT) | Required (server) |
| **whisper-cpp** | Optional (STT) | Required (server) | Optional (STT) | Required (server) |
| **openssl** | - | Required (server) | - | Required (server) |
| **Xcode 15+** | - | - | CLI tools only | Required |
| **Rust toolchain** | - | - | Required | - |
| **Piper TTS** | Optional | - | Optional | - |

## Choose Your Path

### "Just Obsidian Desktop"
1. [Create config files](#config-file-setup) (this page)
2. [Obsidian setup](../obsidian/README.md)
3. Optional: [TTS setup](../text-to-speech/README.md) for voice

### "Obsidian Desktop + Mobile"
1. [Create config files](#config-file-setup)
2. [Companion server](../server/README.md)
3. [Certificates](../certificates/README.md)
4. [Obsidian setup](../obsidian/README.md)
5. [TTS setup](../text-to-speech/README.md) + [STT setup](../speech-to-text/README.md)

### "Native macOS App"
1. [Create config files](#config-file-setup)
2. [macOS app build](../macos/README.md)
3. Optional: [TTS](../text-to-speech/README.md) + [STT](../speech-to-text/README.md)

### "iOS App"
1. [Create config files](#config-file-setup)
2. [Companion server](../server/README.md)
3. [Certificates](../certificates/README.md)
4. [iOS app build](../ios/README.md)

## Config File Setup

The project uses a 4-file configuration system. Two template files are tracked in git; you create two personal files from them.

### Step 1: Create config.json

```bash
cp src/config/config.example.json src/config/config.json
```

Edit `src/config/config.json` to customize:

```json
{
  "dashboard": {
    "title": "J.A.R.V.I.S.",
    "subtitle": "Just A Rather Very Intelligent System"
  },
  "projects": {
    "mode": "auto",
    "rootPath": "~/.claude/projects/"
  }
}
```

Key settings to change:
- `projects.mode` — Set to `"auto"` to auto-discover projects, or `"manual"` with `tracked` array
- `projects.tracked` — List your project directories if using manual mode
- `widgets.voiceCommand.tts.piper.binaryPath` — Path to your Piper binary (or just `"piper"` if in PATH)
- `widgets.voiceCommand.tts.piper.modelPath` — Path to your Piper model
- `platform.ios.bundleId` / `platform.ios.teamId` — iOS app signing (if building iOS)
- `platform.macos.bundleId` / `platform.macos.productName` — macOS app identity (if building Tauri)

See [Customization](../customizations/README.md) for all config keys.

### Step 2: Create config.local.json

```bash
cp src/config/config.local.example.json src/config/config.local.json
```

Edit `src/config/config.local.json` with your network credentials:

```json
{
  "network": {
    "host": "your-mac.local",
    "token": "your-64-char-hex-token",
    "tailscaleHost": null
  }
}
```

If you run `companion/setup.sh`, it will create this file automatically with the correct hostname and generated token.

### Step 3: Verify

Both `config.json` and `config.local.json` are gitignored and will never be committed.

## Verification Checklist

After setup, verify:

- [ ] `src/config/config.json` exists and is valid JSON
- [ ] `src/config/config.local.json` exists (if using companion server)
- [ ] Projects are configured in `config.json` (auto or manual mode)
- [ ] `platform.ios.bundleId` and `platform.ios.teamId` are set (if building iOS app)
- [ ] `platform.macos.bundleId` and `platform.macos.productName` are set (if building macOS app)
- [ ] Companion server starts without errors (if needed)
- [ ] Dashboard loads in your chosen platform
- [ ] Live Sessions shows your active Claude sessions (if any)

## Next Steps

Proceed to your platform-specific guide:
- [Obsidian Desktop & Mobile](../obsidian/README.md)
- [macOS Tauri App](../macos/README.md)
- [iOS SwiftUI App](../ios/README.md)
