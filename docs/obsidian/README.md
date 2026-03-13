# Obsidian Setup

## Prerequisites

- Obsidian 1.0 or later
- **DataviewJS** community plugin installed and enabled
- DataviewJS settings: **Enable JavaScript Queries** must be ON

## Desktop Setup

### Step 1: Place in Vault

Clone or copy the `jarvis_dashboard` folder into your Obsidian vault:

```bash
# Example: place in a MOCs folder
cp -r jarvis_dashboard ~/my-vault/MOCs/Jarvis\ Dashboard/
```

The folder can go anywhere in your vault. All internal paths are relative.

### Step 2: Configure

```bash
cd ~/my-vault/MOCs/Jarvis\ Dashboard/
cp src/config/config.example.json src/config/config.json
```

Edit `config.json` to set your projects:

```json
{
  "projects": {
    "mode": "auto",
    "rootPath": "~/.claude/projects/"
  }
}
```

Or manually list projects:

```json
{
  "projects": {
    "mode": "manual",
    "tracked": [
      { "dir": "my-app", "label": "My App" },
      { "dir": "another-project", "label": "Another Project" }
    ]
  }
}
```

### Step 3: Open

Open `Jarvis Dashboard.md` in Obsidian. The dashboard will render automatically via DataviewJS.

### How It Works

`Jarvis Dashboard.md` contains a DataviewJS code block that:

1. Reads all `.js` files from `src/` using Obsidian's Node.js `fs` module
2. Builds a platform adapter using Obsidian APIs (`dv`, `app`)
3. Calls `loadDashboard()` from `shared/loader.js`
4. Widgets render into the note's DOM

The adapter translates PlatformAdapter methods to Obsidian equivalents:
- `readFile` → `fs.readFileSync()`
- `openNote` → `app.workspace.openLinkText()`
- `queryRecentFiles` → `dv.pages()` with sort
- `showNotice` → `new Notice()`

### Re-render Prevention

The orchestrator uses a labeled code block with a check to prevent re-rendering when the note regains focus:

```js
if (container.querySelector('[data-jarvis-dashboard]')) return;
```

## Mobile Setup (Obsidian Mobile)

Obsidian Mobile uses a simplified voice-only interface that connects to the companion server.

### Prerequisites

- Companion server running on your Mac (see [Server Setup](../server/README.md))
- TLS certificates installed on your mobile device (see [Certificates](../certificates/README.md))
- `config.local.json` with network credentials

### Step 1: Server Setup

Follow the [Companion Server](../server/README.md) guide to set up the server on your Mac.

### Step 2: Open Mobile Dashboard

Open `Jarvis Dashboard Mobile.md` in Obsidian Mobile. This loads a simplified interface with:
- Voice command widget (full-featured)
- Connection status bar
- Text input fallback

### How Mobile Differs

| Feature | Desktop | Mobile |
|---|---|---|
| Dashboard entry | `Jarvis Dashboard.md` | `Jarvis Dashboard Mobile.md` |
| Mode | `"full"` | `"mobile"` |
| Widgets | All 13 | Voice command only |
| Claude execution | Local CLI | Via companion server |
| TTS | Local (Piper/Say/browser) | Via companion server |
| STT | Local (whisper-cpp) | Via companion server |
| File system | Direct (Node.js `fs`) | Via companion server |
| Session manager | Full CRUD | Mobile-specific |

### Mobile Loader Flow

```
Jarvis Dashboard Mobile.md
  → DataviewJS block
    → Builds Obsidian adapter (mobile mode)
    → Calls loadDashboard(adapter, { mode: "mobile" })
      → Loads network-client.js
      → Connects to companion server via WSS
      → Renders voice command widget
```

## Required Plugins

| Plugin | Purpose | Required? |
|---|---|---|
| DataviewJS | JavaScript code execution in notes | Yes |

No other plugins are required. The dashboard is self-contained.

## Vault Sync Considerations

If you sync your vault across devices (iCloud, Obsidian Sync, etc.):

- `config.json` and `config.local.json` are gitignored but **will sync** via vault sync
- This is usually fine — desktop and mobile can share the same config
- If you need different configs per device, use platform-specific overrides in the loader

## Troubleshooting

**"DataviewJS is not enabled":**
Go to Settings → Community Plugins → DataviewJS → Settings → Enable JavaScript Queries.

**Dashboard shows raw code instead of rendering:**
Ensure DataviewJS plugin is installed and enabled, and JavaScript queries are turned on.

**"Cannot read file" errors:**
Ensure the `jarvis_dashboard` folder structure is intact within your vault. Check that `src/`, `shared/`, and config files are present.

**Mobile won't connect:**
1. Verify companion server is running
2. Check `config.local.json` has correct host and token
3. Ensure CA certificate is installed on mobile device
4. Try connecting from the same WiFi network first
