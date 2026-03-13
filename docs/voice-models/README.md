# Voice Models

## Overview

Piper voice models are neural TTS models that run locally. Models are `.onnx` files paired with a `.onnx.json` config file. Both files must be in the same directory.

## Where to Download

All Piper voices are available from the official HuggingFace repository:

**Repository:** `https://huggingface.co/rhasspy/piper-voices`

Browse voices by language at: `https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US` (change `en/en_US` for other languages).

## Download Commands

```bash
# Create model directory
mkdir -p ~/.config/piper && cd ~/.config/piper

# English — Joe (male, recommended default)
curl -L -O "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/joe/medium/en_US-joe-medium.onnx"
curl -L -O "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/joe/medium/en_US-joe-medium.onnx.json"

# English — John (male, deeper voice)
curl -L -O "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/john/medium/en_US-john-medium.onnx"
curl -L -O "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/john/medium/en_US-john-medium.onnx.json"

# English — Bryce (male)
curl -L -O "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/bryce/medium/en_US-bryce-medium.onnx"
curl -L -O "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/bryce/medium/en_US-bryce-medium.onnx.json"

# English — Alan (male, British)
curl -L -O "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx"
curl -L -O "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx.json"

# English — Danny (male)
curl -L -O "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/danny/low/en_US-danny-low.onnx"
curl -L -O "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/danny/low/en_US-danny-low.onnx.json"

# Ukrainian
curl -L -O "https://huggingface.co/rhasspy/piper-voices/resolve/main/uk/uk_UA/ukrainian_tts/medium/uk_UA-ukrainian_tts-medium.onnx"
curl -L -O "https://huggingface.co/rhasspy/piper-voices/resolve/main/uk/uk_UA/ukrainian_tts/medium/uk_UA-ukrainian_tts-medium.onnx.json"

# German — Thorsten
curl -L -O "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx"
curl -L -O "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json"
```

## Recommended Voices

| Voice | Language | Quality | Character | Notes |
|---|---|---|---|---|
| **Joe** (medium) | en_US | Good | Clear, professional male | Best default for JARVIS personality |
| **John** (medium) | en_US | Good | Deeper male | Alternative male voice |
| **Bryce** (medium) | en_US | Good | Natural male | Good clarity |
| **Alan** (medium) | en_GB | Good | British male | Suits formal JARVIS style |
| **Danny** (low) | en_US | Acceptable | Male | Fastest, lower quality |

Quality tiers: `low` < `medium` < `high`. Medium is the best balance for most use cases.

## Model Naming Convention

```
{lang}_{REGION}-{speaker}-{quality}.onnx
```

Examples:
- `en_US-joe-medium.onnx` — English (US), speaker "joe", medium quality
- `uk_UA-ukrainian_tts-medium.onnx` — Ukrainian, default speaker, medium quality
- `de_DE-thorsten-medium.onnx` — German, speaker "thorsten", medium quality

## Auto-Discovery

Piper models are auto-discovered from the `piperModelsDir` directory:

```json
{
  "language": {
    "piperModelsDir": "~/.config/piper"
  }
}
```

When a language-specific model is needed, the system looks for:
1. The exact path specified in `language.supported.{lang}.piperModel`
2. If not absolute, prepends `piperModelsDir`
3. Falls back to the default model in `widgets.voiceCommand.tts.piper.modelPath`

## Adding a New Language

1. **Download the model** for your language:

```bash
cd ~/.config/piper
curl -L -O "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx"
curl -L -O "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx.json"
```

2. **Add to config** in `language.supported`:

```json
{
  "language": {
    "supported": {
      "fr": {
        "label": "French",
        "piperModel": "fr_FR-siwis-medium.onnx",
        "piper": {
          "lengthScale": 0.8,
          "sentenceSilence": 0.1
        }
      }
    }
  }
}
```

3. **Set STT to auto** so whisper-cpp detects the language:

```json
{
  "companion": {
    "whisperLang": "auto"
  }
}
```

Now when you speak French, whisper-cpp will detect it, and the French Piper model will be used for TTS responses.

## Parameter Tuning Guide

Each Piper model accepts tuning parameters that control speech characteristics:

### `lengthScale` (Speed)

Controls speech speed. Lower values = faster speech.

| Value | Effect |
|---|---|
| `0.5` | Very fast (2x speed) |
| `0.72` | Fast (recommended for JARVIS) |
| `0.85` | Slightly fast |
| `1.0` | Normal speed |
| `1.2` | Slow |
| `1.5` | Very slow |

### `noiseScale` (Variability)

Controls the randomness/expressiveness of the speech.

| Value | Effect |
|---|---|
| `0.0` | Monotone, robotic |
| `0.33` | Subtle variation |
| `0.4` | Natural (recommended) |
| `0.667` | Expressive |
| `1.0` | Maximum variation |

### `noiseWScale` (Duration Variation)

Controls how much individual phoneme durations vary.

| Value | Effect |
|---|---|
| `0.0` | Perfectly regular timing |
| `0.3` | Slight timing variation |
| `0.5` | Natural timing (recommended) |
| `0.8` | More rhythmic variation |
| `1.0` | Maximum timing variation |

### `sentenceSilence` (Pause Between Sentences)

Seconds of silence inserted between sentences.

| Value | Effect |
|---|---|
| `0.0` | No pause |
| `0.08` | Brief pause (recommended for fast speech) |
| `0.2` | Normal pause |
| `0.5` | Long pause |

### `speaker` (Multi-Speaker Models)

Some models contain multiple speakers. Set the speaker ID (integer):

```json
{
  "piper": {
    "speaker": 0
  }
}
```

Check the model's `.onnx.json` file for available speaker IDs.

### `volume` (Output Volume)

Override the output volume:

```json
{
  "piper": {
    "volume": 0.8
  }
}
```

## Per-Language Parameter Overrides

Each language in `language.supported` can override Piper parameters:

```json
{
  "language": {
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
          "noiseScale": 0.5,
          "sentenceSilence": 0.1
        }
      }
    }
  }
}
```

Language-specific parameters override the global `widgets.voiceCommand.tts.piper` settings when that language is active.

## Recommended Starting Parameters

For a JARVIS-like voice (clear, efficient, slightly fast):

```json
{
  "widgets": {
    "voiceCommand": {
      "tts": {
        "piper": {
          "modelPath": "~/.config/piper/en_US-joe-medium.onnx",
          "lengthScale": 0.72,
          "noiseScale": 0.4,
          "noiseWScale": 0.5,
          "sentenceSilence": 0.08
        }
      }
    }
  }
}
```
