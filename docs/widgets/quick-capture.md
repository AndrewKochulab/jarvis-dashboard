# Quick Capture Widget

## Purpose

Quickly capture notes to your vault with optional voice dictation. Type or speak a note, and it's saved as a markdown file with configurable tags.

## Configuration

```json
{
  "widgets": {
    "quickCapture": {
      "targetFolder": "NoteLab",
      "tag": "notelab/capture",
      "voice": {
        "enabled": true,
        "lang": "en",
        "whisperModel": "/opt/homebrew/share/whisper-cpp/ggml-small.bin"
      }
    }
  }
}
```

| Key | Type | Default | Description |
|---|---|---|---|
| `targetFolder` | string | `"NoteLab"` | Vault folder for captured notes |
| `tag` | string | `"notelab/capture"` | Tag applied to notes |
| `voice.enabled` | boolean | `true` | Show microphone button |
| `voice.lang` | string | `"en"` | Speech recognition language |
| `voice.whisperModel` | string | *(path)* | Whisper model for dictation |

## UI Components

### Capture Input (`ui/capture-input.js`)
- Text area for typing notes
- Submit button to save
- Timestamp auto-generated

### Mic Button (`ui/mic-button.js`)
- Microphone toggle button
- Records audio and transcribes via whisper-cpp
- Populates text area with transcription

## How It Works

1. User types a note or clicks the mic button to dictate
2. Voice input is transcribed and placed in the text area
3. On submit, a new markdown file is created in `targetFolder`
4. The file includes frontmatter with the configured tag and timestamp
5. File is created via the platform adapter's `writeFile` method

## Layout

```json
{ "type": "quick-capture" }
```

Often paired with Focus Timer:
```json
{ "type": "row", "columns": 2, "widgets": ["focus-timer", "quick-capture"] }
```

## Source

- `src/widgets/quick-capture/index.js`
- `src/widgets/quick-capture/ui/capture-input.js`
- `src/widgets/quick-capture/ui/mic-button.js`
