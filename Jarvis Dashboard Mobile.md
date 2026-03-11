---
tags:
  - dashboard/ai
cssclasses:
  - jarvis-page
---

```dataviewjs
const container = this.container;
// Guard against duplicate async execution (homepage re-render)
const _runId = Date.now() + Math.random();
container._jarvisRunId = _runId;
container.textContent = "";

// ── Resolve base path ──
// Mobile: uses app.vault.adapter.read() (async)
// Desktop: can also use this path as fallback
const vaultBase = app.vault.adapter.basePath;
const currentFilePath = dv.current().file.path;
const dashboardFolder = currentFilePath.replace(/\/[^/]+$/, "");
const srcPrefix = dashboardFolder + "/src/";

// ── Async module loader (works on both mobile and desktop) ──
async function loadModule(relativePath) {
  const filePath = srcPrefix + relativePath;
  const code = await app.vault.adapter.read(filePath);
  return new Function("ctx", code);
}

// ── Load config ──
const configText = await app.vault.adapter.read(srcPrefix + "config/config.json");
const config = JSON.parse(configText);

// Merge local config (contains token + host overrides)
let localConfig = {};
try {
  const localText = await app.vault.adapter.read(srcPrefix + "config/config.local.json");
  localConfig = JSON.parse(localText);
  // Deep merge
  function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
        result[key] = deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }
  Object.assign(config, deepMerge(config, localConfig));
} catch {
  // config.local.json is optional — server connection won't work without token though
}

// ── Load core: theme ──
const themeResult = (await loadModule("core/theme.js"))({ container, config });
const { T, isNarrow, isMedium, isWide, CARD_PAD, FONT_SM, leafEl } = themeResult;

// ── Load core: styles ──
const styleEl = (await loadModule("core/styles.js"))({ T, config });
container.appendChild(styleEl);

// ── Load core: helpers ──
const helpers = (await loadModule("core/helpers.js"))({ T });
const { el } = helpers;

// ── Build shared context ──
const ctx = {
  el, T, config, container, dv,
  isNarrow, isMedium, isWide, leafEl,
  CARD_PAD, FONT_SM,
  _localConfig: localConfig,
  intervals: [],
  cleanups: [],
  _paused: false,
};

// ── Load network client service ──
ctx.networkClient = (await loadModule("services/network-client.js"))(ctx);

// ── Abort if a newer execution has taken over ──
if (container._jarvisRunId !== _runId) return;

// ── Create main wrapper ──
const wrapper = el("div", {
  background: T.bg,
  padding: isNarrow ? "16px 12px" : "24px",
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  color: T.text,
  position: "relative",
  boxSizing: "border-box",
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

// ── Header ──
const header = el("div", {
  textAlign: "center",
  marginBottom: isNarrow ? "8px" : "16px",
  position: "relative",
  zIndex: "2",
});

header.appendChild(el("div", {
  fontSize: isNarrow ? "20px" : "28px",
  fontWeight: "800",
  letterSpacing: isNarrow ? "6px" : "10px",
  color: T.accent,
  textShadow: `0 0 20px ${T.accent}40`,
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
}, config.dashboard?.title || "J.A.R.V.I.S."));

header.appendChild(el("div", {
  fontSize: isNarrow ? "8px" : "9px",
  fontWeight: "600",
  letterSpacing: "3px",
  color: T.textMuted,
  textTransform: "uppercase",
  marginTop: "4px",
}, "Mobile Command Interface"));

wrapper.appendChild(header);

// ── Load mobile voice command widget ──
const voiceWidget = (await loadModule("widgets/jarvis-voice-command-mobile.js"))(ctx);
wrapper.appendChild(voiceWidget);

// ── Pause all work when dashboard is not visible ──
const _visibilityHandler = () => { ctx._paused = document.hidden; };
document.addEventListener("visibilitychange", _visibilityHandler);
ctx.cleanups.push(() => document.removeEventListener("visibilitychange", _visibilityHandler));

// ── Cleanup observer ──
const observer = new MutationObserver(() => {
  if (!document.contains(container)) {
    ctx.intervals.forEach(id => clearInterval(id));
    ctx.cleanups.forEach(fn => { try { fn(); } catch(e) {} });
    observer.disconnect();
  }
});
const observeTarget = container.parentElement || document.body;
observer.observe(observeTarget, { childList: true, subtree: false });
```
