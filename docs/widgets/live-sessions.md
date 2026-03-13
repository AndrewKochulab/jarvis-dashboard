# Live Sessions Widget

## Purpose

Monitors active Claude Code sessions in real-time. Scans JSONL session files to display running sessions with their status, token usage, cost estimates, and model information.

## Configuration

```json
{
  "projects": {
    "mode": "auto",
    "rootPath": "~/.claude/projects/"
  },
  "performance": {
    "liveSessionsIntervalMs": 3000
  }
}
```

| Key | Type | Default | Description |
|---|---|---|---|
| `projects.mode` | string | `"manual"` | `"auto"` or `"manual"` project discovery |
| `projects.rootPath` | string | `"~/.claude/projects/"` | Root for auto-scan |
| `performance.liveSessionsIntervalMs` | number | `3000` | Polling interval (ms) |

## UI Components

### Status Panel (`ui/status-panel.js`)
- Shows number of active sessions
- Overall status indicator (active/idle)

### Session Row (`ui/session-row.js`)
- Project name with path
- Current status (running/idle/completed)
- Token count (input + output)
- Estimated cost
- Model badge (Opus/Sonnet/Haiku)
- Duration indicator

### Session Differ (`core/session-differ.js`)
- Computes diffs between polling cycles
- Only updates changed sessions (performance optimization)
- Detects new, removed, and modified sessions

## How It Works

1. Session parser scans JSONL files in `~/.claude/projects/`
2. Each `.jsonl` file represents a Claude Code session
3. Parser extracts: model, tokens, tool uses, timestamps, status
4. Widget polls at `liveSessionsIntervalMs` intervals
5. Uses session differ to minimize DOM updates
6. Updates agent card status (via `ctx.agentCardRefs`) when agents are detected

## Cross-Widget Communication

The Live Sessions widget updates Agent Cards by detecting agent names in session content:

```js
const ref = ctx.agentCardRefs.get(agentName);
if (ref) {
  ref.statusDot.style.background = ctx.T.green;
  ref.statusText.textContent = "ACTIVE";
}
```

## Layout

```json
{ "type": "live-sessions" }
```

## Source

- `src/widgets/live-sessions/index.js`
- `src/widgets/live-sessions/core/session-differ.js`
- `src/widgets/live-sessions/ui/session-row.js`
- `src/widgets/live-sessions/ui/status-panel.js`
