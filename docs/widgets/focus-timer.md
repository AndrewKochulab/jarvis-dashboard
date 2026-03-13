# Focus Timer Widget

## Purpose

A Pomodoro-style focus timer with circular progress display, configurable presets for work and break sessions, and optional vault logging of completed sessions.

## Configuration

```json
{
  "widgets": {
    "focusTimer": {
      "workPresets": [
        { "label": "30m", "ms": 1800000 },
        { "label": "60m", "ms": 3600000 }
      ],
      "breakPresets": [
        { "label": "5m", "ms": 300000 },
        { "label": "10m", "ms": 600000 },
        { "label": "15m", "ms": 900000 }
      ],
      "logPath": "Work/Productivity"
    }
  }
}
```

| Key | Type | Default | Description |
|---|---|---|---|
| `workPresets` | array | 30m, 60m | Work duration buttons |
| `breakPresets` | array | 5m, 10m, 15m | Break duration buttons |
| `logPath` | string | `"Work/Productivity"` | Vault folder for session logs |

## UI Components

### Circular Display (`ui/circular-display.js`)
- SVG circular progress ring
- Countdown timer text (MM:SS)
- Color changes: accent (work), green (break), red (final minute)

### Control Buttons (`ui/control-buttons.js`)
- Start / Pause / Resume / Reset buttons
- Mode toggle (Work / Break)

### Preset Row (`ui/preset-row.js`)
- Quick-select duration buttons
- Separate rows for work and break presets

### Timer State (`core/timer-state.js`)
- State management (idle, running, paused, complete)
- Interval management with pause/resume support
- Registers as pausable (stops when tab hidden)

## Vault Logging

When a timer session completes, the timer service can log it to your vault:
- Creates a markdown note in `logPath`
- Records: duration, mode (work/break), start time, end time
- Useful for productivity tracking

## Layout

```json
{ "type": "focus-timer" }
```

Often paired with Quick Capture in a row:
```json
{ "type": "row", "columns": 2, "widgets": ["focus-timer", "quick-capture"] }
```

## Source

- `src/widgets/focus-timer/index.js`
- `src/widgets/focus-timer/core/timer-state.js`
- `src/widgets/focus-timer/ui/circular-display.js`
- `src/widgets/focus-timer/ui/control-buttons.js`
- `src/widgets/focus-timer/ui/preset-row.js`
