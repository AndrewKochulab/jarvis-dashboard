# Activity Analytics Widget

## Purpose

Visualizes Claude Code usage over the past 30 days with three panels: a usage heatmap, model breakdown chart, and peak hours analysis.

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

The analytics period and cache duration are shared with System Diagnostics via `systemDiagnostics` config.

## UI Components

### Heatmap Panel (`ui/heatmap-panel.js`)
- Calendar-style grid showing daily usage intensity
- Color gradient from dim (low activity) to bright accent (high activity)
- Tooltip on hover showing date and session count

### Model Breakdown Panel (`ui/model-breakdown-panel.js`)
- Horizontal bar chart showing token usage per model (Opus/Sonnet/Haiku)
- Color-coded by model
- Percentage labels

### Peak Hours Panel (`ui/peak-hours-panel.js`)
- Bar chart showing activity by hour of day
- Identifies most productive hours
- 24-hour format

## Data Source

Uses `ctx.onStatsReady` to receive 30-day analytics from the stats engine:

```js
ctx.onStatsReady.push((stats) => {
  // stats.dailyActivity — array of per-day session counts
  // stats.modelUsage — per-model token totals
  // stats.hourlyDistribution — per-hour activity
});
```

The stats engine computes these from JSONL session files.

## Layout

```json
{ "type": "activity-analytics" }
```

This widget uses `contentVisibility: "auto"` for deferred rendering.

## Source

- `src/widgets/activity-analytics/index.js`
- `src/widgets/activity-analytics/ui/heatmap-panel.js`
- `src/widgets/activity-analytics/ui/model-breakdown-panel.js`
- `src/widgets/activity-analytics/ui/peak-hours-panel.js`
