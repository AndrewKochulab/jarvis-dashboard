# Communication Link Widget

## Purpose

Provides quick-launch buttons for your terminal and code editor, showing a terminal-style display with the configured vault path.

## Configuration

```json
{
  "widgets": {
    "communicationLink": {
      "terminalApp": "Terminal",
      "editorApp": "Cursor",
      "terminalTitle": "claude — Dashboard",
      "vaultPathDisplay": "~/my-vault"
    }
  }
}
```

| Key | Type | Default | Description |
|---|---|---|---|
| `terminalApp` | string | `"Terminal"` | Terminal app to launch |
| `editorApp` | string | `"Cursor"` | Code editor to launch |
| `terminalTitle` | string | `"claude — Dashboard"` | Display title |
| `vaultPathDisplay` | string | `"~/my-vault"` | Path shown in terminal display |

## UI Components

### Terminal Display (`ui/terminal-display.js`)
- Terminal-style panel with monospace font
- Shows the vault path
- Launch buttons for terminal and editor apps
- Opens apps via platform adapter (`exec` or native commands)

## Layout

```json
{ "type": "communication-link" }
```

## Source

- `src/widgets/communication-link/index.js`
- `src/widgets/communication-link/ui/terminal-display.js`
