# Speech-to-Text (STT)

## Overview

Jarvis Dashboard uses **whisper-cpp** for speech-to-text transcription. whisper-cpp is a C++ port of OpenAI's Whisper model that runs entirely locally — no data is sent to external servers.

## Setup

### Step 1: Install whisper-cpp

```bash
brew install whisper-cpp
```

Verify installation:
```bash
which whisper-cli
# Expected: /opt/homebrew/bin/whisper-cli
```

### Step 2: Download a Model

whisper-cpp does not include a model. Download one manually — the `small` model is recommended as a balance of accuracy and speed:

```bash
cd /opt/homebrew/share/whisper-cpp/
curl -L -O "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"
```

Verify:
```bash
ls /opt/homebrew/share/whisper-cpp/
# Should show: ggml-small.bin
```

### Step 3: Install ffmpeg

ffmpeg is required to convert audio from the recording format to the WAV format whisper-cpp expects:

```bash
brew install ffmpeg
```

### Step 4: Configure

```json
{
  "companion": {
    "whisperPath": "/opt/homebrew/bin/whisper-cli",
    "whisperModel": "/opt/homebrew/share/whisper-cpp/ggml-small.bin",
    "whisperLang": "auto",
    "ffmpegPath": "/opt/homebrew/bin/ffmpeg"
  }
}
```

## Model Selection

| Model | Size | Speed | Accuracy | English-Only |
|---|---|---|---|---|
| `ggml-tiny.bin` | 75 MB | Fastest | Basic | `ggml-tiny.en.bin` |
| `ggml-base.bin` | 142 MB | Fast | Good | `ggml-base.en.bin` |
| `ggml-small.bin` | 466 MB | Medium | Very good | `ggml-small.en.bin` |
| `ggml-medium.bin` | 1.5 GB | Slow | Excellent | `ggml-medium.en.bin` |
| `ggml-large-v3.bin` | 3.1 GB | Slowest | Best | N/A |

**Recommendations:**
- For English only: `ggml-small.en.bin` (fastest good-quality option)
- For multi-language: `ggml-small.bin` (auto-detects language)
- For best accuracy: `ggml-medium.bin` or `ggml-large-v3.bin`

Models with `.en` suffix are English-only but faster for English transcription.

## Multi-Language Auto-Detection

When `whisperLang` is set to `"auto"`, whisper-cpp automatically detects the spoken language. The detected language is returned in the transcription response and used to select the appropriate TTS model for the response.

```json
{
  "companion": {
    "whisperLang": "auto"
  },
  "language": {
    "stt": "auto",
    "fallback": "en"
  }
}
```

### Supported Languages

whisper-cpp supports 99 languages. Common ones used with Jarvis:

| Code | Language | Notes |
|---|---|---|
| `en` | English | Best accuracy with `.en` models |
| `uk` | Ukrainian | Good with `small`+ models |
| `de` | German | Good with `small`+ models |
| `fr` | French | Good with `small`+ models |
| `es` | Spanish | Good with `small`+ models |
| `ja` | Japanese | Requires `small`+ for accuracy |
| `zh` | Chinese | Requires `small`+ for accuracy |

To force a specific language (skip auto-detection):

```json
{
  "companion": {
    "whisperLang": "en"
  }
}
```

## Audio Pipeline

### Desktop (Obsidian / macOS Tauri)

```
Microphone → MediaRecorder API (browser)
  → audio blob (webm/mp4)
  → whisper-cli --no-timestamps -l auto
  → transcription text
```

On Tauri, the audio goes through the `transcribe_audio` Rust command which:
1. Writes raw audio to temp file
2. Converts to 16kHz mono WAV via ffmpeg
3. Runs whisper-cli
4. Returns transcription text + detected language

### Mobile (iOS / Obsidian Mobile)

```
Microphone → AVAudioEngine (iOS) or MediaRecorder (Obsidian Mobile)
  → base64 audio data
  → WebSocket → companion server
  → ffmpeg (convert to 16kHz WAV)
  → whisper-cli
  → transcription text + detected language
  → WebSocket → client
```

## Configuration Reference

### In `config.json`

| Key | Type | Default | Description |
|---|---|---|---|
| `companion.whisperPath` | string | `/opt/homebrew/bin/whisper-cli` | Path to whisper-cli binary |
| `companion.whisperModel` | string | `ggml-small.bin` path | Path to whisper model file |
| `companion.whisperLang` | string | `"auto"` | Language code or `"auto"` |
| `companion.ffmpegPath` | string | `/opt/homebrew/bin/ffmpeg` | Path to ffmpeg binary |
| `language.stt` | string | `"auto"` | Client-side STT language |
| `language.fallback` | string | `"en"` | Fallback if detection fails |

### Quick Capture STT

The Quick Capture widget has its own whisper configuration:

```json
{
  "widgets": {
    "quickCapture": {
      "voice": {
        "enabled": true,
        "lang": "en",
        "whisperModel": "/opt/homebrew/share/whisper-cpp/ggml-small.bin"
      }
    }
  }
}
```

## Microphone Permissions

### Obsidian (Desktop/Mobile)
Browser microphone permission is requested on first use. Allow when prompted.

### macOS (Tauri)
macOS will prompt for microphone access on first use. Grant permission in System Preferences → Privacy & Security → Microphone.

### iOS
Microphone permission is declared in `Info.plist` and requested on first use. If denied, go to Settings → JarvisApp → Microphone → Enable.

## Troubleshooting

**"whisper-cli not found":**
Install: `brew install whisper-cpp`. Text input still works without STT.

**"ffmpeg not found":**
Install: `brew install ffmpeg`.

**Transcription is empty or garbage:**
- Try a larger model (`small` → `medium`)
- Ensure the microphone is working (test with Voice Memos or similar)
- Check audio isn't too quiet or noisy

**Wrong language detected:**
- Force a specific language: set `whisperLang` to the language code
- Use a larger model for better detection accuracy
- Ensure the model isn't a `.en` (English-only) variant

**Slow transcription:**
- Use a smaller model (`medium` → `small` → `base`)
- English-only models (`.en`) are faster for English
- Ensure no other heavy processes are using the CPU
