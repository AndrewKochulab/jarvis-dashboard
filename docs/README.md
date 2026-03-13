# Jarvis Dashboard Documentation

Welcome to the Jarvis Dashboard documentation. Use this hub to find guides for every aspect of the project.

## Getting Started

1. **[Setup Guide](setup/README.md)** — Prerequisites and installation for all platforms
2. **Pick your platform:** [Obsidian](obsidian/README.md) | [macOS App](macos/README.md) | [iOS App](ios/README.md)
3. **[Customize](customizations/README.md)** — Every config key explained

## Documentation Map

| Section | Description |
|---|---|
| [Project Overview](common/README.md) | Vision, features, roadmap, FAQ |
| [Architecture](architecture/README.md) | Module system, ctx object, cross-platform bridge |
| [Project Structure](architecture/project-structure.md) | Annotated directory tree |
| [API Reference](api/README.md) | WebSocket protocol, PlatformAdapter interface, Tauri commands |
| [Security](security/README.md) | TLS, auth tokens, rate limiting, best practices |
| [Setup Guide](setup/README.md) | Installation hub for all platforms |
| [Certificates](certificates/README.md) | TLS certificate creation and installation |
| [Companion Server](server/README.md) | WebSocket server setup, LaunchAgent, modules |
| [Obsidian](obsidian/README.md) | Desktop and mobile Obsidian setup |
| [iOS App](ios/README.md) | Build, deploy, and configure the iOS app |
| [macOS App](macos/README.md) | Build, deploy, and configure the Tauri app |
| [Customization](customizations/README.md) | Complete config.json reference |
| [Text-to-Speech](text-to-speech/README.md) | TTS engines, multi-language, configuration |
| [Speech-to-Text](speech-to-text/README.md) | whisper-cpp setup, models, language detection |
| [Voice Models](voice-models/README.md) | Piper model downloads, tuning, custom models |
| [Widgets](widgets/README.md) | All 13 widgets documented individually |
| [Demo & Screenshots](demo/README.md) | Visual gallery of the dashboard |
| [Troubleshooting](troubleshooting/README.md) | Solutions organized by category |
| [Releases](releases/README.md) | Changelog and version history |

## "I want to..."

| Goal | Start here |
|---|---|
| Get Jarvis running in Obsidian | [Setup](setup/README.md) then [Obsidian](obsidian/README.md) |
| Use Jarvis on my iPhone/iPad | [Setup](setup/README.md) then [Server](server/README.md) then [Certificates](certificates/README.md) then [iOS](ios/README.md) |
| Build the native macOS app | [Setup](setup/README.md) then [macOS](macos/README.md) |
| Set up voice commands | [TTS](text-to-speech/README.md) + [STT](speech-to-text/README.md) + [Voice Models](voice-models/README.md) |
| Customize colors and layout | [Customization](customizations/README.md) |
| Add or modify widgets | [Widgets](widgets/README.md) |
| Understand the codebase | [Architecture](architecture/README.md) + [Project Structure](architecture/project-structure.md) |
| Connect mobile to desktop | [Server](server/README.md) + [Certificates](certificates/README.md) |
| Fix something that's broken | [Troubleshooting](troubleshooting/README.md) |

## Platform Quick Reference

| Feature | Obsidian Desktop | Obsidian Mobile | macOS (Tauri) | iOS (SwiftUI) |
|---|---|---|---|---|
| Full dashboard | Yes | - | Yes | - |
| Voice commands | Yes | Yes | Yes | Yes |
| Local Claude CLI | Yes | - | Yes | - |
| Remote Claude (via server) | Yes | Yes | - | Yes |
| Native TTS (Piper/Say) | Yes | Via server | Yes | Via server |
| Speech-to-text | Yes | Via server | Yes | Via server |
| Interactive mode | Yes | Yes | Yes | Yes |
| Focus timer | Yes | - | Yes | - |
| System diagnostics | Yes | - | Yes | - |
| File system access | Node.js | Via server | Rust (Tauri) | Via server |
