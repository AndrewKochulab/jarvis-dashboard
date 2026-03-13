# Project Overview

## What is Jarvis Dashboard?

Jarvis Dashboard is a modular, real-time AI command center that monitors Claude Code sessions, provides voice-controlled AI interaction, tracks development analytics, and offers productivity tools — all rendered as a single-page dashboard.

It runs on **4 platforms** from one shared JavaScript codebase:

- **Obsidian Desktop** — DataviewJS-powered note embedded in your vault
- **Obsidian Mobile** — Voice-only interface connecting to a companion server
- **macOS** — Native Tauri 2.0 app with Rust backend
- **iOS/iPadOS** — SwiftUI app with WKWebView bridge

## Why Jarvis?

| Problem | Jarvis Solution |
|---|---|
| Claude Code runs headless in a terminal | Real-time session monitoring with Live Sessions widget |
| No visibility into AI agent activity | Agent Cards with per-agent status, skill tracking |
| Voice interaction requires complex setup | One-click voice commands with Piper TTS + whisper-cpp STT |
| Scattered productivity tools | Focus timer, quick capture, bookmarks — all in one dashboard |
| Mobile AI access is clunky | Native iOS app with full voice interaction |
| No analytics on AI usage | 30-day activity analytics with cost tracking and heatmaps |
| Configuration is complex | Layered config system with sensible defaults |

## Features

### Voice Command System
- Full-duplex voice interaction with Claude Code
- Multi-language support (auto-detection via whisper-cpp)
- Three TTS engines: Piper (neural), macOS Say, browser speechSynthesis
- Interactive mode with permission handling and tool approvals
- Session tabs for managing multiple concurrent conversations
- See: [Voice Command Widget](../widgets/voice-command.md), [TTS](../text-to-speech/README.md), [STT](../speech-to-text/README.md)

### Real-time Monitoring
- **Live Sessions** — Active Claude Code session tracking with token/cost display
- **System Diagnostics** — 30-day stats: sessions, tokens, costs, model breakdown
- **Activity Analytics** — Usage heatmaps, peak hours, model distribution charts
- **Agent Cards** — Visual status cards for each defined AI agent
- See: [Widgets](../widgets/README.md)

### Productivity Tools
- **Focus Timer** — Pomodoro-style timer with vault logging
- **Quick Capture** — Note capture with optional voice dictation
- **Quick Launch** — Configurable app and URL bookmarks
- **Mission Control** — Links to other Obsidian dashboards
- **Communication Link** — Terminal and editor launcher
- **Recent Activity** — Latest modified vault files

### Cross-Platform Architecture
- Shared JavaScript codebase (no build step)
- Platform adapters abstract file system, process, and vault operations
- Config-driven layout with drag-and-drop widget ordering
- See: [Architecture](../architecture/README.md)

## Roadmap

### Planned Features
- **GUI Setup Utility** — Interactive installer that walks through config.json creation, certificate generation, and platform selection
- **Config Editor Integration** — Edit config.json directly from iOS/macOS apps via server API
- **Linux Server Support** — Run the companion server on Linux (currently macOS only)
- **Additional Widgets** — Planned widgets for git status, PR tracking, and calendar integration
- **Plugin System** — Load custom widgets from external files

### Known Limitations
- Companion server requires macOS (uses `say` command, macOS paths)
- whisper-cpp required for voice input (text input always works)
- Piper TTS currently requires manual model download
- Obsidian Mobile requires companion server for all features
- iOS app requires self-signed certificate installation

## FAQ

**Does it work on Linux?**
The dashboard JavaScript runs anywhere with a browser. The companion server currently requires macOS for native TTS (`say` command) and path conventions. Linux support is planned.

**Is any data sent externally?**
No. All processing is local. Voice audio is processed by local whisper-cpp. TTS uses local Piper or macOS Say. Claude Code runs locally via CLI. The only network traffic is between your devices over your local network (or Tailscale VPN).

**Can I use it without Obsidian?**
Yes. The macOS Tauri app and iOS app run independently. They load the same shared JavaScript but don't require Obsidian. The macOS app prompts you to select a vault folder on first launch.

**Can I use it without voice commands?**
Yes. Voice commands are one widget. You can remove `jarvis-voice-command` from the layout array in config.json, or simply not set up TTS/STT and use the text input instead.

**How much does it cost?**
Jarvis Dashboard itself is free and open source. You need a Claude Code subscription for AI features. The dashboard displays token costs using the pricing rates in config.json.

**Can I add custom widgets?**
Yes. Create a new folder under `src/widgets/`, add an `index.js` that receives `ctx` and returns an HTMLElement, then add it to the layout array and WIDGET_MAP. See [Creating Custom Widgets](../widgets/README.md#creating-custom-widgets).

## Contributing

1. Fork the repository
2. Create a feature branch
3. Follow the [module contract](../architecture/README.md#module-contract) — no import/export, all state via ctx
4. Test in at least one platform (Obsidian is easiest)
5. Submit a pull request

## License

MIT License. See [LICENSE](../../LICENSE) in the repository root.
