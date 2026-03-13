# Troubleshooting

## General

### Dashboard shows raw code instead of rendering
**Cause:** DataviewJS is not enabled or JavaScript queries are disabled.
**Solution:** Install the DataviewJS community plugin in Obsidian. Go to Settings → Community Plugins → DataviewJS → Settings → Enable JavaScript Queries.

### Dashboard renders but widgets are empty
**Cause:** Config files missing or invalid JSON.
**Solution:** Verify `src/config/config.json` exists and is valid:
```bash
python3 -c "import json; json.load(open('src/config/config.json'))"
```

### "Cannot read file" errors on load
**Cause:** Folder structure is incomplete.
**Solution:** Ensure `src/`, `shared/`, and config files are present. If using symlinks (iOS/macOS), re-run the setup script.

---

## Voice & Audio

### Microphone not responding
**Cause:** Browser/app doesn't have microphone permission.
**Solution:**
- **Obsidian:** Allow microphone when prompted by the browser engine
- **macOS Tauri:** System Preferences → Privacy & Security → Microphone → Enable for Jarvis Dashboard
- **iOS:** Settings → JarvisApp → Microphone → Enable

### Voice recording produces no transcription
**Cause:** whisper-cpp not installed or wrong model path.
**Solution:**
```bash
# Verify whisper-cli is installed
which whisper-cli

# Verify model file exists
ls -la /opt/homebrew/share/whisper-cpp/ggml-small.bin
```

### Transcription is garbage or incorrect
**Cause:** Model too small, wrong language, or noisy audio.
**Solution:**
- Use a larger model: `small` → `medium` → `large-v3`
- Force a specific language if auto-detection fails: set `companion.whisperLang` to your language code
- Ensure the mic is close and background noise is minimal

### Wrong language detected
**Cause:** Auto-detection works better with larger models.
**Solution:** Use `ggml-small.bin` (not `.en` variant) or force the language in config.

---

## Text-to-Speech

### No audio output from TTS
**Cause:** TTS engine not configured or binary not found.
**Solution:**
- **Piper:** Verify binary path: `which piper` → update `tts.piper.binaryPath`
- **Say:** macOS only — verify: `say "test"`
- **Browser:** Check browser supports speechSynthesis

### Piper "command not found"
**Cause:** Piper not installed or wrong path.
**Solution:**
```bash
# Recommended: install via pipx
pipx install piper-tts

# Or via pip
pip3 install piper-tts

which piper
# Update config: widgets.voiceCommand.tts.piper.binaryPath
```

### Piper "model not found"
**Cause:** Model file missing or wrong path.
**Solution:**
```bash
ls ~/.config/piper/*.onnx
# Should show your model file
# Ensure both .onnx and .onnx.json files exist
```

### Piper "No module named 'pathvalidate'"
**Cause:** `piper-tts` does not include the `pathvalidate` dependency by default.
**Solution:**
```bash
# If installed via pipx:
pipx inject piper-tts pathvalidate

# If installed via pip/pip3:
pip3 install pathvalidate
```

### TTS audio is choppy or cuts off
**Cause:** CPU overloaded or audio buffer underrun.
**Solution:** Try a lower-quality (faster) model, or use the `say` engine which is lighter weight.

### TTS speaks in wrong language
**Cause:** Language-specific model not configured.
**Solution:** Add the language to `language.supported` with its `piperModel`. See [Voice Models](../voice-models/README.md).

---

## Network & Server

### Companion server won't start — "EADDRINUSE"
**Cause:** Port 7777 or 7778 is already in use.
**Solution:**
```bash
lsof -i :7777
# Kill the process using the port, or change ports in config
```

### iOS/mobile can't connect to server
**Cause:** Multiple possible causes.
**Solution:** Check in order:
1. Server is running: `cd companion && npm start`
2. Same network: both devices on same WiFi or Tailscale
3. Certificate installed: Settings → General → About → Certificate Trust Settings
4. Token matches: compare `.env` token with iOS Settings screen token
5. Hostname resolves: `ping your-mac.local` from mobile

### "Certificate is not trusted" on iOS
**Cause:** CA certificate not fully trusted.
**Solution:** Two separate steps required:
1. Settings → General → VPN & Device Management → Install profile
2. Settings → General → About → Certificate Trust Settings → Enable trust for "JARVIS Local CA"

### "hostname mismatch" SSL error
**Cause:** Connecting to a hostname not in the certificate's SAN.
**Solution:**
```bash
# Check what names are in the certificate
openssl x509 -in companion/certs/server.pem -text -noout | grep -A1 "Subject Alternative Name"
# Regenerate if needed: rm -rf companion/certs && bash setup.sh
```

### WebSocket keeps disconnecting
**Cause:** Server idle timeout or network issues.
**Solution:**
- Increase `companion.idleTimeoutMs` (default 5 minutes)
- Check `network.heartbeatInterval` is set (default 30 seconds)
- If on Tailscale, ensure the VPN connection is stable

### "Rate limit exceeded"
**Cause:** Too many Claude requests in a short period.
**Solution:** Increase `companion.rateLimitPerMinute` in config (default: 10).

---

## Obsidian

### Dashboard flickers or re-renders constantly
**Cause:** Missing re-render guard.
**Solution:** The orchestrator includes a guard: `if (container.querySelector('[data-jarvis-dashboard]')) return;`. Ensure this line exists in the DataviewJS block.

### "Cannot find module" errors
**Cause:** File paths changed or missing files.
**Solution:** Ensure the folder structure matches what the loader expects. Check that `src/core/`, `src/services/`, and `src/widgets/` directories are complete.

### Obsidian Mobile shows nothing
**Cause:** Wrong `.md` file opened.
**Solution:** Open `Jarvis Dashboard Mobile.md` (not `Jarvis Dashboard.md`) on mobile. The mobile version loads a simplified voice-only interface.

---

## macOS (Tauri)

### "cargo: command not found"
**Cause:** Rust toolchain not installed.
**Solution:** Install Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

### Build fails with compilation errors
**Cause:** Missing Rust dependencies or outdated toolchain.
**Solution:**
```bash
rustup update
cd macos/src-tauri && cargo check
```

### White/blank screen after launch
**Cause:** Symlinks not created.
**Solution:** `cd macos && node scripts/setup-symlinks.js`

### "Failed to spawn process" for Claude
**Cause:** Claude CLI not in PATH or nested session env vars.
**Solution:** The app automatically removes `CLAUDECODE` env vars. Ensure `claude` is in your PATH: `which claude`.

### First build takes very long
**Cause:** Rust compiling all dependencies from scratch.
**Solution:** This is normal for first build. Subsequent builds use incremental compilation and are much faster.

---

## iOS

### Xcode build fails — "No such module"
**Cause:** Symlinks not created.
**Solution:** `cd ios && bash scripts/setup-symlinks.sh`

### App shows white screen
**Cause:** Web content not loaded from symlinks.
**Solution:** Verify symlinks: `ls -la ios/web/src ios/web/shared`. Re-run `bash scripts/setup-symlinks.sh`.

### Settings not saving
**Cause:** Keychain access issue.
**Solution:** Delete and reinstall the app. Check that the app has Keychain access entitlements.

### Audio recording stops unexpectedly
**Cause:** iOS audio session interrupted.
**Solution:** Ensure no other app is using the microphone. Close background apps that might claim the audio session.

---

## Performance

### Dashboard is slow/laggy
**Cause:** Too many widgets, short polling intervals, or animations.
**Solution:**
- Remove unused widgets from the `layout` array
- Increase `performance.liveSessionsIntervalMs` (e.g., 5000-10000)
- Set `performance.animationsEnabled` to `false`
- Increase `performance.processCheckCacheMs`

### High CPU usage
**Cause:** Frequent polling or TTS processing.
**Solution:**
- Pause the dashboard when not viewing (happens automatically via visibility API)
- Increase polling intervals in `performance` config
- Use `say` engine instead of Piper for lower CPU TTS

### Memory grows over time
**Cause:** Session data accumulating.
**Solution:** The session manager auto-prunes to 10 sessions. If you have many active Claude sessions, the JSONL parser may consume memory. Increase `performance.cleanupIntervalMs`.
