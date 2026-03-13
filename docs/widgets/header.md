# Header Widget

## Purpose

Displays the dashboard title, subtitle, live clock, and system status indicator at the top of the dashboard.

## Configuration

```json
{
  "dashboard": {
    "title": "J.A.R.V.I.S.",
    "subtitle": "Just A Rather Very Intelligent System",
    "statusText": "System Online"
  }
}
```

| Key | Type | Default | Description |
|---|---|---|---|
| `dashboard.title` | string | `"J.A.R.V.I.S."` | Main title text |
| `dashboard.subtitle` | string | `"Just A Rather Very Intelligent System"` | Subtitle text |
| `dashboard.statusText` | string | `"System Online"` | Status indicator text |

## UI Components

### Title Display (`ui/title-display.js`)
- Monospace font with letter spacing
- Accent color glow effect
- Subtitle in muted text below

### Clock (`ui/clock.js`)
- Live updating clock (configurable interval via `performance.clockIntervalMs`)
- Shows current time in HH:MM:SS format
- Registers as a pausable — stops updating when tab is hidden

### Status Line (`ui/status-line.js`)
- Animated pulsing dot indicator
- "System Online" text (configurable)
- Green dot when operational

## Layout

```json
{ "type": "header" }
```

The header is typically the first entry in the layout array.

## Source

- `src/widgets/header/index.js`
- `src/widgets/header/ui/clock.js`
- `src/widgets/header/ui/status-line.js`
- `src/widgets/header/ui/title-display.js`
