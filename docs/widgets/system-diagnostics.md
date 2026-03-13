# System Diagnostics Widget

## Purpose

Displays aggregate statistics for Claude Code usage over a configurable period: total sessions, total tokens, estimated cost, and active projects.

## Configuration

```json
{
  "widgets": {
    "systemDiagnostics": {
      "periodDays": 30,
      "cacheDurationMs": 300000
    }
  }
}
```

| Key | Type | Default | Description |
|---|---|---|---|
| `periodDays` | number | `30` | Days of history to analyze |
| `cacheDurationMs` | number | `300000` | Cache duration for stats (5 min) |

## UI Components

### Stat Card (`ui/stat-card.js`)
- Individual statistic card with icon, label, and value
- Hover effect with glow
- Responsive grid layout: 4 columns (wide), 2 columns (narrow)

### Displayed Stats

| Stat | Icon | Description |
|---|---|---|
| Total Sessions | - | Number of Claude sessions in the period |
| Total Tokens | - | Input + output tokens combined |
| Estimated Cost | - | Cost calculated using `pricing` config |
| Active Projects | - | Number of distinct projects with sessions |

## Data Source

Registers a callback on `ctx.onStatsReady`:

```js
ctx.onStatsReady.push((stats) => {
  // stats.totalSessions
  // stats.totalTokens
  // stats.totalCost
  // stats.activeProjects
});
```

Stats are computed by the stats engine from JSONL session data and cached.

## Layout

```json
{ "type": "system-diagnostics" }
```

This widget uses `contentVisibility: "auto"` for deferred rendering.

## Source

- `src/widgets/system-diagnostics/index.js`
- `src/widgets/system-diagnostics/ui/stat-card.js`
