# API Reference

## WebSocket Protocol

The companion server exposes two WebSocket endpoints:

| Endpoint | Port | Protocol | Purpose |
|---|---|---|---|
| `wss://host:7777` | 7777 | WSS (TLS) | Remote connections (iOS, Obsidian Mobile) |
| `ws://localhost:7778` | 7778 | WS (plain) | Local connections (same machine) |

### Authentication

Clients authenticate by including the token as a URL query parameter:

```
wss://your-mac.local:7777?token=<64-char-hex-token>
```

The server validates the token using timing-safe comparison before accepting the connection. Invalid tokens result in immediate connection close with code 4001.

### Message Format

All messages are JSON strings with a `type` field:

```json
{ "type": "message-type", ...payload }
```

### Client → Server Messages

#### `audio_start`
Begin an audio upload session.

```json
{
  "type": "audio_start",
  "format": "mp4",
  "sampleRate": 16000,
  "sessionId": "session-123"
}
```

After this message, send raw audio data as **binary WebSocket frames** (not JSON). The server accumulates chunks until `audio_end`.

#### `audio_end`
Signal that audio upload is complete. Triggers the voice pipeline: audio → WAV conversion → whisper-cli transcription → Claude execution → TTS response.

```json
{ "type": "audio_end" }
```

#### `text_command`
Send a text command directly (bypasses audio transcription).

```json
{
  "type": "text_command",
  "text": "What files are in this directory?",
  "sessionId": "session-123"
}
```

#### `cancel`
Cancel the active Claude run and clean up resources.

```json
{ "type": "cancel" }
```

#### `new_session`
Clear the current Claude session and start fresh.

```json
{ "type": "new_session" }
```

#### `tts_toggle`
Mute or unmute TTS audio.

```json
{
  "type": "tts_toggle",
  "muted": true
}
```

#### `permission_response`
Respond to a tool permission request from Claude (interactive mode).

```json
{
  "type": "permission_response",
  "requestId": "req-456",
  "behavior": "allow"
}
```

`behavior` can be `"allow"` or `"deny"`. Optional `updatedPermissions` can modify future auto-approvals.

#### `question_response`
Respond to a question from Claude (interactive mode).

```json
{
  "type": "question_response",
  "requestId": "req-789",
  "answer": "Yes, proceed with the refactor."
}
```

#### `ping`
Heartbeat message. Server responds with `pong`.

```json
{ "type": "ping" }
```

### Server → Client Messages

#### `connected`
Sent immediately after successful authentication.

```json
{
  "type": "connected",
  "version": "1.0.0"
}
```

#### `transcription`
Speech-to-text result from whisper-cpp.

```json
{
  "type": "transcription",
  "text": "What is the status?",
  "detectedLang": "en"
}
```

#### `stream_delta`
Streaming text chunk from Claude output.

```json
{
  "type": "stream_delta",
  "text": "Here are the files in this directory:\n"
}
```

#### `stream_end`
Claude process has completed.

```json
{
  "type": "stream_end",
  "sessionId": "session-123"
}
```

#### `permission_request`
Claude wants to use a tool that requires approval (interactive mode).

```json
{
  "type": "permission_request",
  "requestId": "req-456",
  "request": {
    "subtype": "can_use_tool",
    "tool_name": "Bash",
    "input": { "command": "ls -la" }
  }
}
```

#### `question_request`
Claude is asking the user a question (interactive mode).

```json
{
  "type": "question_request",
  "requestId": "req-789",
  "request": {
    "subtype": "elicitation",
    "question": "Which database should I connect to?"
  }
}
```

#### `tts_audio`
PCM audio data for TTS playback.

```json
{
  "type": "tts_audio",
  "data": "<base64-encoded-pcm>",
  "sampleRate": 22050
}
```

Audio is Float32 PCM. Sample rate is 22050 Hz (Piper) or varies by engine.

#### `tts_end`
TTS synthesis complete for the current response.

```json
{ "type": "tts_end" }
```

#### `pong`
Heartbeat response.

```json
{ "type": "pong" }
```

#### `error`
Error message with stage indicator.

```json
{
  "type": "error",
  "stage": "transcription",
  "message": "whisper-cli not found"
}
```

---

## PlatformAdapter Interface

The `PlatformAdapter` is a plain JavaScript object that every platform must implement. The shared `loader.js` calls only these methods, ensuring identical behavior across platforms.

### File System (Desktop Only)

| Method | Signature | Description |
|---|---|---|
| `readFile` | `(path: string) => string` | Read file contents as UTF-8 string |
| `writeFile` | `(path: string, content: string) => void` | Write string content to file |
| `stat` | `(path: string) => { mtimeMs: number, size: number, isDirectory: boolean }` | Get file metadata |
| `readdir` | `(path: string) => string[]` | List directory entries |
| `exists` | `(path: string) => boolean` | Check if path exists |
| `mkdir` | `(path: string, recursive?: boolean) => void` | Create directory |

### Process (Desktop Only)

| Method | Signature | Description |
|---|---|---|
| `spawn` | `(prog: string, args: string[], opts?: object) => ChildProcessLike` | Spawn a child process |
| `exec` | `(command: string) => string` | Execute shell command synchronously |
| `kill` | `(pid: number) => void` | Kill a process by PID |

### OS

| Method | Signature | Description |
|---|---|---|
| `homedir` | `() => string` | User home directory path |
| `tmpdir` | `() => string` | Temporary directory path |

### Vault

| Method | Signature | Description |
|---|---|---|
| `vaultBasePath` | `() => string` | Root path of the Obsidian vault |
| `openNote` | `(path: string) => void` | Open a note in the editor |
| `queryRecentFiles` | `(folder: string, count: number) => Array` | Get recently modified files |
| `countFiles` | `(folder: string) => number` | Count files in a folder |
| `parseYamlFrontmatter` | `(path: string) => object` | Parse YAML frontmatter from a markdown file |

### UI

| Method | Signature | Description |
|---|---|---|
| `showNotice` | `(message: string, duration?: number) => void` | Show a notification/toast |

### Platform Info

| Property | Type | Description |
|---|---|---|
| `platform` | `"obsidian" \| "tauri" \| "ios"` | Current platform identifier |

---

## Tauri Command Registry

The macOS Tauri app exposes Rust commands callable from JavaScript via `window.__TAURI__.invoke()`.

### File System Commands (`fs_commands.rs`)

| Command | Parameters | Returns | Description |
|---|---|---|---|
| `read_file` | `path: String` | `String` | Read file as UTF-8 |
| `batch_read_files` | `paths: Vec<String>` | `HashMap<String, String>` | Read multiple files at once |
| `write_file` | `path: String, content: String` | `()` | Write content to file |
| `write_binary_file` | `path: String, data: Vec<u8>` | `()` | Write binary data to file |
| `stat_file` | `path: String` | `FileStat` | Get file metadata (mtime, size, isDir) |
| `readdir` | `path: String` | `Vec<String>` | List directory entries |
| `exists` | `path: String` | `bool` | Check if path exists |
| `mkdir` | `path: String, recursive: bool` | `()` | Create directory |

### OS Commands (`os_commands.rs`)

| Command | Returns | Description |
|---|---|---|
| `home_dir` | `String` | User home directory |
| `tmp_dir` | `String` | System temp directory |

### Process Commands (`process_commands.rs`)

| Command | Parameters | Returns | Description |
|---|---|---|---|
| `spawn_process` | `id, program, args, opts` | `u32` (PID) | Spawn process with stdout/stderr streaming |
| `kill_process` | `id: String` | `()` | Kill a spawned process |
| `stdin_write` | `id: String, data: String` | `()` | Write to process stdin |
| `stdin_close` | `id: String` | `()` | Close process stdin |
| `transcribe_audio` | `audio_data, whisper_path, whisper_model, language` | `String` (JSON) | Transcribe audio via ffmpeg + whisper-cli |
| `exec_sync` | `command: String` | `String` | Execute shell command synchronously |
| `open_url` | `url: String` | `()` | Open URL in default browser |
| `open_app` | `name: String` | `()` | Open application by name |

#### SpawnOpts

```rust
struct SpawnOpts {
    cwd: Option<String>,          // Working directory
    env: Option<HashMap<String, String>>,  // Additional env vars
    env_remove: Option<Vec<String>>,       // Env vars to remove
}
```

Process events are emitted as Tauri events:
- `process-stdout-{id}` — stdout line
- `process-stderr-{id}` — stderr line
- `process-close-{id}` — process exit (payload: exit code)

### Vault Commands (`vault_commands.rs`)

| Command | Parameters | Returns | Description |
|---|---|---|---|
| `parse_yaml_frontmatter` | `path: String` | `Value` (JSON) | Parse YAML between `---` fences |
| `get_recent_files` | `root: String, count: usize` | `Vec<RecentFile>` | Get N most recently modified .md files |
| `count_files` | `folder: String` | `usize` | Count .md files recursively |

---

## WKWebView Bridge Protocol (iOS)

The iOS app communicates between Swift and JavaScript using WKWebView message handlers.

### JavaScript → Swift

JavaScript calls Swift via `window.webkit.messageHandlers`:

```js
window.webkit.messageHandlers.audioControl.postMessage({
  action: "startRecording"  // or "stopRecording"
});
```

### Swift → JavaScript

Swift calls JavaScript via `evaluateJavaScript()`:

```swift
webView.evaluateJavaScript("window.handleAudioData('\(base64AudioData)')")
```

### Available Message Handlers

| Handler | Actions | Description |
|---|---|---|
| `audioControl` | `startRecording`, `stopRecording` | Control AVAudioEngine recording |
| `keychainStore` | `set`, `get`, `delete` | Keychain credential management |

### Keychain Operations

```js
// Store a value
window.webkit.messageHandlers.keychainStore.postMessage({
  action: "set",
  key: "server_host",
  value: "my-mac.local"
});

// Retrieve (async via callback)
window.webkit.messageHandlers.keychainStore.postMessage({
  action: "get",
  key: "server_host",
  callbackId: "cb-123"
});
// Swift calls: window.keychainCallback("cb-123", "my-mac.local")
```
