# Mission Control Widget

## Purpose

Navigation buttons linking to other dashboards or notes in your Obsidian vault.

## Configuration

```json
{
  "widgets": {
    "missionControl": {
      "dashboards": [
        { "name": "Health Dashboard", "path": "MOCs/Health Dashboard", "color": "#ff6b6b", "icon": "♥" },
        { "name": "Analysis Dashboard", "path": "MOCs/Analysis Dashboard", "color": "#7c6bff", "icon": "◉" }
      ]
    }
  }
}
```

### Dashboard Entry Fields

| Field | Type | Description |
|---|---|---|
| `name` | string | Button display text |
| `path` | string | Vault path to the target note |
| `color` | string | Hex color for the button |
| `icon` | string | Unicode character icon |

## UI Components

### Nav Button (`ui/nav-button.js`)
- Colored button with icon
- Click to navigate to the target note via `adapter.openNote()`
- Hover effect matching the button color

## Layout

```json
{ "type": "mission-control" }
```

Often paired with Quick Launch:
```json
{ "type": "row", "columns": 2, "widgets": ["quick-launch", "mission-control"] }
```

## Source

- `src/widgets/mission-control/index.js`
- `src/widgets/mission-control/ui/nav-button.js`
