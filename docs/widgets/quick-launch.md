# Quick Launch Widget

## Purpose

A configurable grid of bookmark cards for quickly launching apps and URLs. Organized into named groups.

## Configuration

```json
{
  "widgets": {
    "quickLaunch": {
      "groups": [
        {
          "name": "Development",
          "bookmarks": [
            { "name": "Cursor", "icon": "▸", "color": "#44c98f", "type": "app", "target": "Cursor" },
            { "name": "Terminal", "icon": "▪", "color": "#00d4ff", "type": "app", "target": "Terminal" }
          ]
        },
        {
          "name": "Web",
          "bookmarks": [
            { "name": "GitHub", "icon": "⬡", "color": "#e0e6ed", "type": "url", "target": "https://github.com" }
          ]
        }
      ]
    }
  }
}
```

### Bookmark Fields

| Field | Type | Description |
|---|---|---|
| `name` | string | Display name |
| `icon` | string | Unicode character or emoji |
| `color` | string | Hex color for the icon |
| `type` | string | `"app"` (open app) or `"url"` (open URL) |
| `target` | string | App name or URL |

## UI Components

### Bookmark Card (`ui/bookmark-card.js`)
- Card with icon, name, and color accent
- Click to launch the app or open the URL
- Hover glow effect
- Responsive grid: up to 4 columns per group

## Layout

```json
{ "type": "quick-launch" }
```

Often paired with Mission Control:
```json
{ "type": "row", "columns": 2, "widgets": ["quick-launch", "mission-control"] }
```

## Source

- `src/widgets/quick-launch/index.js`
- `src/widgets/quick-launch/ui/bookmark-card.js`
