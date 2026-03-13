# Widgets

## Overview

Jarvis Dashboard is composed of 13 independent widgets. Each widget is a JavaScript module that receives `ctx` and returns an `HTMLElement`. Widgets are loaded and arranged according to the `layout` array in `config.json`.

## Widget List

| Widget | Description | Doc |
|---|---|---|
| [Header](header.md) | Dashboard title, clock, system status | [header.md](header.md) |
| [Voice Command](voice-command.md) | Voice/text interaction with Claude | [voice-command.md](voice-command.md) |
| [Live Sessions](live-sessions.md) | Active Claude Code session monitor | [live-sessions.md](live-sessions.md) |
| [Agent Cards](agent-cards.md) | AI agent status visualization | [agent-cards.md](agent-cards.md) |
| [Focus Timer](focus-timer.md) | Pomodoro-style work timer | [focus-timer.md](focus-timer.md) |
| [Quick Capture](quick-capture.md) | Note capture with voice dictation | [quick-capture.md](quick-capture.md) |
| [Activity Analytics](activity-analytics.md) | Usage heatmaps and charts | [activity-analytics.md](activity-analytics.md) |
| [System Diagnostics](system-diagnostics.md) | 30-day usage statistics | [system-diagnostics.md](system-diagnostics.md) |
| [Communication Link](communication-link.md) | Terminal/editor launcher | [communication-link.md](communication-link.md) |
| [Quick Launch](quick-launch.md) | App and URL bookmarks | [quick-launch.md](quick-launch.md) |
| [Mission Control](mission-control.md) | Dashboard navigation links | [mission-control.md](mission-control.md) |
| [Recent Activity](recent-activity.md) | Recently modified vault files | [recent-activity.md](recent-activity.md) |
| [Footer](footer.md) | Dashboard footer | [footer.md](footer.md) |

## Widget Architecture

```
src/widgets/{widget-name}/
├── index.js           # Entry point — receives ctx, returns HTMLElement
├── core/              # Business logic, state management
│   └── *.js
├── ui/                # UI component sub-modules
│   └── *.js
├── adapters/          # Platform abstraction (voice-command only)
│   └── *.js
└── desktop/           # Desktop-specific logic (voice-command only)
    └── *.js
```

Simple widgets are a single `index.js`. Complex widgets (voice-command, live-sessions, focus-timer) split logic into sub-modules.

### Loading Flow

1. Loader reads the `layout` array from config
2. For each entry, loads the corresponding widget module
3. Module is wrapped in `new AsyncFunction("ctx", code)` and executed
4. The returned HTMLElement is appended to the dashboard wrapper

### Sub-Module Loading

Widgets load their sub-modules via the adapter:

```js
// Inside a widget's index.js:
const code = ctx._adapter.readFile(ctx._srcDir + "widgets/my-widget/ui/component.js");
const buildComponent = new Function("ctx", "state", code);
const element = buildComponent(ctx, localState);
```

## Layout Configuration

Control widget order and grouping in `config.json`:

```json
{
  "layout": [
    { "type": "header" },
    { "type": "jarvis-voice-command" },
    { "type": "live-sessions" },
    { "type": "row", "columns": 2, "widgets": ["focus-timer", "quick-capture"] },
    { "type": "agent-cards" },
    { "type": "footer" }
  ]
}
```

- Remove a widget by deleting its entry
- Reorder by moving entries up/down
- Group widgets side-by-side with `"type": "row"`
- Adjust columns with the `columns` field (1-4)
- Responsive: rows collapse to single column on narrow screens

## Creating Custom Widgets

### Step 1: Create Widget Files

```bash
mkdir -p src/widgets/my-widget
```

Create `src/widgets/my-widget/index.js`:

```js
// This is a function body — receives ctx, returns HTMLElement
const { el, T, config, isNarrow, CARD_PAD, addHoverEffect, createSectionTitle } = ctx;

const container = el("div", {
  background: T.panelBg,
  border: `1px solid ${T.panelBorder}`,
  borderRadius: "16px",
  padding: CARD_PAD,
  marginBottom: isNarrow ? "24px" : "40px",
  position: "relative",
  zIndex: "2",
});

// Add section title
container.appendChild(createSectionTitle("MY WIDGET", "◆"));

// Add your content
const content = el("div", { color: T.text }, "Hello from my custom widget!");
container.appendChild(content);

// Optional: register pausable intervals
const intervalId = setInterval(() => {
  // Polling logic here
}, 5000);
ctx.intervals.push(intervalId);

// Optional: register for stats
ctx.onStatsReady.push((stats) => {
  // Update with analytics data
});

return container;
```

### Step 2: Register Widget

Add the widget to the `WIDGET_MAP` in `shared/loader.js`:

```js
const WIDGET_MAP = {
  // ... existing widgets ...
  "my-widget": "widgets/my-widget/index.js",
};
```

### Step 3: Add to Layout

Add to `layout` in `config.json`:

```json
{ "type": "my-widget" }
```

### Guidelines

- **Return an HTMLElement** — the loader appends it to the dashboard
- **Use `ctx.el()`** — creates styled DOM elements consistently
- **Use `ctx.T`** — theme colors for consistent appearance
- **Push intervals to `ctx.intervals`** — ensures cleanup on unmount
- **No import/export** — the file is a function body
- **No global state** — everything through `ctx`
- **Register pausables** — pause polling when tab is hidden:

```js
ctx.registerPausable(
  () => { /* resume polling */ },
  () => { /* stop polling */ }
);
```
