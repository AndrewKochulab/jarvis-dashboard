# Text-to-Speech (TTS)

## Engine Overview

Jarvis Dashboard supports three TTS engines:

| Engine | Quality | Speed | Setup | Platforms |
|---|---|---|---|---|
| **Piper** | High (neural) | Fast | Moderate | Desktop (local), Mobile (via server) |
| **macOS Say** | Medium | Very fast | None | macOS only |
| **Browser** | Low-Medium | Instant | None | All (fallback) |

## Choosing an Engine

Set the engine in `config.json`:

```json
{
  "widgets": {
    "voiceCommand": {
      "tts": {
        "enabled": true,
        "engine": "piper"
      }
    }
  }
}
```

| Value | Engine |
|---|---|
| `"piper"` | Piper neural TTS (recommended) |
| `"say"` | macOS Say command |
| `"browser"` | Browser speechSynthesis API |

## Piper TTS Setup

Piper provides high-quality neural text-to-speech synthesis. It runs locally — no internet required.

### Step 1: Install Piper

**Recommended** — via pipx (isolated environment):
```sh
pipx install piper-tts
```

Or via pip:
```bash
pip3 install piper-tts
```

Verify installation:
```bash
which piper
# Expected: /Users/<you>/Library/Python/3.x/bin/piper
```

### Step 2: Download a Voice Model

```bash
mkdir -p ~/.config/piper
cd ~/.config/piper

# Download the English "Joe" model (recommended)
curl -L -O "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/joe/medium/en_US-joe-medium.onnx"
curl -L -O "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/joe/medium/en_US-joe-medium.onnx.json"
```

See [Voice Models](../voice-models/README.md) for more model options and downloads.

> **Note:** `piper-tts` does not include the `pathvalidate` library. If you see `ModuleNotFoundError: No module named 'pathvalidate'`, install it:
> - **pipx:** `pipx inject piper-tts pathvalidate`
> - **pip:** `pip3 install pathvalidate`

### Step 3: Configure

```json
{
  "widgets": {
    "voiceCommand": {
      "tts": {
        "engine": "piper",
        "piper": {
          "binaryPath": "/Users/<you>/Library/Python/3.9/bin/piper",
          "modelPath": "~/.config/piper/en_US-joe-medium.onnx",
          "noiseScale": 0.4,
          "noiseWScale": 0.5
        }
      }
    }
  }
}
```

### Step 4: Test

Start the dashboard and issue a voice command. If TTS is working, you'll hear spoken responses.

## macOS Say Configuration

macOS Say uses the built-in speech synthesis engine. No installation required.

```json
{
  "widgets": {
    "voiceCommand": {
      "tts": {
        "engine": "say",
        "say": {
          "voice": "Daniel",
          "rate": 160
        }
      }
    }
  }
}
```

### Available Voices

List installed voices:
```bash
say -v '?'
```

Common English voices: `Daniel`, `Samantha`, `Alex`, `Victoria`, `Karen`, `Moira`.

| Setting | Type | Default | Description |
|---|---|---|---|
| `voice` | string | `"Daniel"` | Voice name from `say -v '?'` |
| `rate` | number | `160` | Words per minute (120-300) |

## Browser speechSynthesis

The browser engine uses the Web Speech API. It requires no setup but quality varies by browser and OS.

```json
{
  "widgets": {
    "voiceCommand": {
      "tts": {
        "engine": "browser"
      }
    }
  }
}
```

This is the fallback engine on iOS when `mobileTts` is set to `"browser"`.

## Multi-Language TTS

Piper supports multiple languages. Each language can have its own model and parameters.

### Adding a Language

1. Download the language-specific Piper model (see [Voice Models](../voice-models/README.md))
2. Add the language to `language.supported`:

```json
{
  "language": {
    "stt": "auto",
    "fallback": "en",
    "piperModelsDir": "~/.config/piper",
    "supported": {
      "en": {
        "label": "English",
        "piper": {
          "lengthScale": 0.72,
          "sentenceSilence": 0.08
        }
      },
      "uk": {
        "label": "Ukrainian",
        "piperModel": "uk_UA-ukrainian_tts-medium.onnx",
        "piper": {
          "lengthScale": 0.85,
          "sentenceSilence": 0.1
        }
      },
      "de": {
        "label": "German",
        "piperModel": "de_DE-thorsten-medium.onnx",
        "piper": {
          "lengthScale": 0.8,
          "sentenceSilence": 0.1
        }
      }
    }
  }
}
```

### How Language Selection Works

1. User speaks → whisper-cpp detects the language
2. The detected language code (e.g., `"uk"`) is looked up in `language.supported`
3. If found, the language-specific Piper model and parameters are used
4. If not found, falls back to `language.fallback` (default: `"en"`)

### Per-Language Model Auto-Discovery

If `piperModel` is not an absolute path, the system looks for it in `language.piperModelsDir` (default: `~/.config/piper/`).

## Server-Side TTS (Mobile)

Mobile clients can use the companion server for TTS:

```json
{
  "network": {
    "mobileTts": "server"
  }
}
```

| Value | Behavior |
|---|---|
| `"server"` | Audio synthesized on server, streamed as PCM to client |
| `"browser"` | Client uses browser speechSynthesis locally |

Server-side TTS provides higher quality (Piper) on mobile devices. The server streams PCM audio frames to the client over WebSocket.

## Sentence-Boundary Streaming

TTS processes text sentence by sentence for low-latency playback:

1. Claude streams output text
2. Text is buffered until a sentence boundary (`.`, `!`, `?`) is detected
3. Each complete sentence is sent to the TTS engine immediately
4. Audio starts playing before the full response is received

This means the first audio plays within ~500ms of the first sentence completing, rather than waiting for the entire response.

## Markdown Stripping

Before text is sent to TTS, markdown formatting is stripped:

- Code blocks → "code block" (spoken)
- Bold/italic markers → removed
- Headers → text only
- Links → link text only
- Bullet points → removed
- Special characters → cleaned

This ensures natural-sounding speech output.

## Mute Toggle

TTS can be muted/unmuted via the speaker icon in the voice command widget. The mute state persists across sessions (stored in localStorage or adapter storage).

When muted:
- TTS synthesis is skipped entirely (saves CPU)
- Visual feedback still shows in the terminal
- Unmuting resumes TTS for subsequent responses
