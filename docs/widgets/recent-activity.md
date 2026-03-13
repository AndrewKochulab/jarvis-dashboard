# Recent Activity Widget

## Purpose

Shows the most recently modified files in your Obsidian vault, with relative timestamps and click-to-open navigation.

## Configuration

```json
{
  "widgets": {
    "recentActivity": {
      "count": 10,
      "excludePatterns": ["/(Daily|Weekly|Monthly)/"]
    }
  }
}
```

| Key | Type | Default | Description |
|---|---|---|---|
| `count` | number | `10` | Number of files to display |
| `excludePatterns` | array | `["/(Daily\|Weekly\|Monthly)/"]` | Regex patterns to exclude |

## UI Components

### Activity Row (`ui/activity-row.js`)
- File name with relative timestamp ("2m ago", "1h ago")
- Click to open the file in Obsidian
- Hover highlight
- Icon indicating file type

## Data Source

Uses the platform adapter's `queryRecentFiles()` method:
- Obsidian: `dv.pages()` with sort by modification time
- Tauri: `get_recent_files` Rust command (walks directory, sorts by mtime)

Files matching `excludePatterns` are filtered out.

## Layout

```json
{ "type": "recent-activity" }
```

This widget uses `contentVisibility: "auto"` for deferred rendering.

## Source

- `src/widgets/recent-activity/index.js`
- `src/widgets/recent-activity/ui/activity-row.js`
