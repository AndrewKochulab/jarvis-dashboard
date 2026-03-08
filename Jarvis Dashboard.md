---
tags:
  - dashboard/ai
cssclasses:
  - jarvis-page
---

```dataviewjs
const container = this.container;
const nodeFs = require("fs");
const nodePath = require("path");

// ── Resolve base path (works wherever the dashboard folder is placed) ──
const vaultBase = app.vault.adapter.basePath;
const currentFilePath = dv.current().file.path;
const dashboardDir = nodePath.dirname(nodePath.join(vaultBase, currentFilePath));
const srcDir = nodePath.join(dashboardDir, "src");

// ── Module loader ──
function loadModule(relativePath) {
  const fullPath = nodePath.join(srcDir, relativePath);
  const code = nodeFs.readFileSync(fullPath, "utf8");
  return new Function("ctx", code);
}

// ── Load config ──
const config = JSON.parse(nodeFs.readFileSync(nodePath.join(srcDir, "config", "config.json"), "utf8"));

// ── Load core: theme ──
const themeResult = loadModule("core/theme.js")({ container, config });
const { T, isNarrow, isMedium, isWide, CARD_PAD, FONT_SM, leafEl } = themeResult;

// ── Load core: styles ──
const styleEl = loadModule("core/styles.js")({ T, config });
container.appendChild(styleEl);

// ── Load core: helpers ──
const helpers = loadModule("core/helpers.js")({ T });
const { el, fmtTokens, fmtCost, formatModel, describeAction, getModelFamily } = helpers;

// ── Load registry ──
const registryPath = config.widgets?.agentCards?.registryPath || "src/config/Jarvis-Registry";
const dashboardFolder = currentFilePath.replace(/\/[^/]+$/, "");
const fullRegistryPath = dashboardFolder + "/" + registryPath;
const registry = dv.page(fullRegistryPath);
const agents = registry?.agents || [];
const agentNames = new Set();
const skillToAgent = new Map();
agents.forEach(a => {
  agentNames.add(a.name);
  (a.skills || []).forEach(s => skillToAgent.set(s, a.name));
});

// ── Build shared context ──
const ctx = {
  el, T, config, container, dv,
  isNarrow, isMedium, isWide, leafEl,
  nodeFs, nodePath, CARD_PAD, FONT_SM,
  fmtTokens, fmtCost, formatModel, describeAction, getModelFamily,
  agents, agentNames, skillToAgent,
  agentCardRefs: new Map(),
  onStatsReady: [],
  intervals: [],
  cleanups: [],
};

// ── Load services ──
ctx.sessionParser = loadModule("services/session-parser.js")(ctx);
ctx.statsEngine = loadModule("services/stats-engine.js")(ctx);
ctx.timerService = loadModule("services/timer-service.js")(ctx);
ctx.voiceService = loadModule("services/voice-service.js")(ctx);
ctx.cleanups.push(() => ctx.voiceService.cleanup());
ctx.ttsService = loadModule("services/tts-service.js")(ctx);
ctx.cleanups.push(() => ctx.ttsService.cleanup());

// ── Create main wrapper ──
const wrapper = el("div", {
  background: T.bg,
  minHeight: "100vh",
  padding: isNarrow ? "16px" : "32px",
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  color: T.text,
  position: "relative",
  overflow: "hidden",
});
container.appendChild(wrapper);

// ── Scan line overlay ──
if (config.dashboard?.showScanLine !== false) {
  wrapper.appendChild(el("div", {
    position: "absolute",
    left: "0", width: "100%", height: "6%",
    background: "linear-gradient(180deg, transparent, rgba(0,212,255,0.04), transparent)",
    pointerEvents: "none", zIndex: "1",
    animation: "jarvisScanLine 8s linear infinite",
  }));
}

// ── Widget map ──
const WIDGET_MAP = {
  "header": "widgets/header.js",
  "live-sessions": "widgets/live-sessions.js",
  "system-diagnostics": "widgets/system-diagnostics.js",
  "agent-cards": "widgets/agent-cards.js",
  "activity-analytics": "widgets/activity-analytics.js",
  "communication-link": "widgets/communication-link.js",
  "focus-timer": "widgets/focus-timer.js",
  "quick-capture": "widgets/quick-capture.js",
  "quick-launch": "widgets/quick-launch.js",
  "mission-control": "widgets/mission-control.js",
  "recent-activity": "widgets/recent-activity.js",
  "jarvis-voice-command": "widgets/jarvis-voice-command.js",
  "footer": "widgets/footer.js",
};

// ── Render layout ──
const layout = config.layout || [
  { type: "header" },
  { type: "live-sessions" },
  { type: "row", columns: 2, widgets: ["focus-timer", "quick-capture"] },
  { type: "agent-cards" },
  { type: "communication-link" },
  { type: "row", columns: 2, widgets: ["quick-launch", "mission-control"] },
  { type: "system-diagnostics" },
  { type: "activity-analytics" },
  { type: "recent-activity" },
  { type: "footer" },
];

const gridRefs = [];

for (const entry of layout) {
  if (entry.type === "row" && entry.widgets) {
    const row = el("div", {
      display: "grid",
      gridTemplateColumns: isNarrow ? "1fr" : `repeat(${entry.columns || 2}, 1fr)`,
      gap: isNarrow ? "12px" : "20px",
      position: "relative",
      zIndex: "2",
      marginBottom: isNarrow ? "24px" : "40px",
    });
    for (const widgetType of entry.widgets) {
      if (WIDGET_MAP[widgetType]) {
        const widget = loadModule(WIDGET_MAP[widgetType])(ctx);
        if (widget.style) widget.style.marginBottom = "0";
        row.appendChild(widget);
      }
    }
    wrapper.appendChild(row);
    gridRefs.push({ el: row, columns: entry.columns || 2 });
  } else if (WIDGET_MAP[entry.type]) {
    const widget = loadModule(WIDGET_MAP[entry.type])(ctx);
    wrapper.appendChild(widget);
  }
}

// ── Trigger async stats ──
setTimeout(() => {
  try {
    const stats = ctx.statsEngine.computeStats();
    ctx.onStatsReady.forEach(cb => cb(stats));
  } catch {}
}, 100);

// ── Cleanup observer ──
const observer = new MutationObserver(() => {
  if (!document.contains(container)) {
    ctx.intervals.forEach(id => clearInterval(id));
    ctx.cleanups.forEach(fn => { try { fn(); } catch(e) {} });
    observer.disconnect();
  }
});
observer.observe(document.body, { childList: true, subtree: true });

// ── Responsive resize ──
const resizeTarget = leafEl || container;
const ro = new ResizeObserver(() => {
  const w = leafEl ? leafEl.clientWidth : window.innerWidth;
  const narrow = w < 500;
  const wide = w >= 950;

  if (ctx._agentsGrid) ctx._agentsGrid.style.gridTemplateColumns = narrow ? "1fr" : (wide ? "repeat(3, 1fr)" : "1fr");
  if (ctx._diagGrid) ctx._diagGrid.style.gridTemplateColumns = narrow ? "repeat(2, 1fr)" : "repeat(4, 1fr)";
  if (ctx._analyticsGrid) ctx._analyticsGrid.style.gridTemplateColumns = narrow ? "1fr" : "repeat(3, 1fr)";
  if (ctx._bookmarkGroups) {
    ctx._bookmarkGroups.forEach(ref => {
      ref.el.style.gridTemplateColumns = narrow ? "repeat(3, 1fr)" : `repeat(${Math.min(ref.count, 4)}, 1fr)`;
    });
  }

  gridRefs.forEach(ref => {
    ref.el.style.gridTemplateColumns = narrow ? "1fr" : `repeat(${ref.columns}, 1fr)`;
  });
});
ro.observe(resizeTarget);
```
