/**
 * Shared Dashboard Loader — cross-platform orchestrator.
 *
 * Extracted from Jarvis Dashboard.md (desktop) and Jarvis Dashboard Mobile.md
 * (mobile).  Each platform's bootstrap script calls loadDashboard() after
 * installing its adapter.
 *
 * @param {PlatformAdapter} adapter  — platform-specific implementation
 * @param {object}          options
 * @param {"full"|"mobile"} options.mode          — "full" = all widgets, "mobile" = voice only
 * @param {HTMLElement}     options.container      — root DOM element
 * @param {object}          [options.configOverrides] — merged on top of config.example.json + config.json + config.local.json
 * @param {string}          [options.srcBase]      — base path/URL to src/ (with trailing /)
 * @param {string}          [options.sharedBase]   — base path/URL to shared/ (with trailing /)
 */
async function loadDashboard(adapter, options = {}) {
  const {
    mode = "full",
    container,
    configOverrides = {},
    srcBase = "src/",
    sharedBase = "shared/",
    widgetFilter = null,
  } = options;

  if (!container) throw new Error("loadDashboard: container element required");

  // ── Deep merge utility ──
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

  // ── Read a text file via adapter ──
  async function readText(path) {
    const text = adapter.readFile(path);
    if (text != null && text !== "") return text;
    // Async fallback for Tauri/iOS when file isn't pre-cached
    if (adapter.readFileAsync) {
      try { return await adapter.readFileAsync(path); } catch { return text; }
    }
    return text;
  }

  // ── Module loader: reads JS file and wraps in Function("ctx", code) ──
  // Uses AsyncFunction to support modules with top-level await (e.g. sub-module loading).
  const _AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  async function loadModule(relativePath) {
    const code = await readText(srcBase + relativePath);
    return new _AsyncFunction("ctx", code);
  }

  // ── 1. Load and merge config ──
  // Layer 1: config.example.json (template defaults, tracked in git)
  let config = {};
  try {
    const configText = await readText(srcBase + "config/config.example.json");
    if (configText) config = JSON.parse(configText);
  } catch {
    // config.example.json missing or invalid — start with empty config
  }

  // Layer 2: config.json (personal overrides, gitignored — copy from config.example.json)
  try {
    const personalText = await readText(srcBase + "config/config.json");
    if (personalText) {
      const personalConfig = JSON.parse(personalText);
      Object.assign(config, deepMerge(config, personalConfig));
    }
  } catch {
    // config.json is optional — uses defaults from config.example.json
  }

  // Layer 3: config.local.json (credentials — host, token; gitignored)
  let localConfig = {};
  try {
    const localText = await readText(srcBase + "config/config.local.json");
    if (localText) {
      localConfig = JSON.parse(localText);
      Object.assign(config, deepMerge(config, localConfig));
    }
  } catch {
    // config.local.json is optional
  }

  // Layer 4: platform-provided overrides (e.g. iOS server settings from Keychain)
  if (Object.keys(configOverrides).length > 0) {
    Object.assign(config, deepMerge(config, configOverrides));
  }

  // ── 2. Load core modules ──
  const themeResult = await (await loadModule("core/theme.js"))({ container, config });
  const { T, isNarrow, isMedium, isWide, CARD_PAD, FONT_SM, leafEl } = themeResult;

  const styleEl = await (await loadModule("core/styles.js"))({ T, config });
  container.appendChild(styleEl);

  const helpers = await (await loadModule("core/helpers.js"))({ T, isNarrow });
  const { el, fmtTokens, fmtCost, formatModel, describeAction, getModelFamily, addHoverEffect, createSectionTitle } = helpers;

  const markdownRenderer = await (await loadModule("core/markdown-renderer.js"))({ el, T, config });

  // ── 3. Build ctx ──
  const perf = config.performance || {};
  const animationsEnabled = perf.animationsEnabled !== false;

  const ctx = {
    el, T, config, container,
    isNarrow, isMedium, isWide, leafEl,
    CARD_PAD, FONT_SM,
    _localConfig: localConfig,
    addHoverEffect, createSectionTitle,
    intervals: [],
    cleanups: [],
    _paused: false,
    _adapter: adapter,
  };

  // Shared ctx properties (available in all modes)
  ctx.markdownRenderer = markdownRenderer;
  ctx.animationsEnabled = animationsEnabled;
  const vaultBase = adapter.vaultBasePath();
  ctx._srcDir = srcBase.startsWith("/")
    ? srcBase
    : (vaultBase ? vaultBase + "/" + srcBase : srcBase);

  if (mode === "full") {
    // Full mode needs Node.js shims (provided by adapter via require() monkeypatch)
    ctx.nodeFs = window.require ? window.require("fs") : null;
    ctx.nodePath = window.require ? window.require("path") : null;
    ctx.fmtTokens = fmtTokens;
    ctx.fmtCost = fmtCost;
    ctx.formatModel = formatModel;
    ctx.describeAction = describeAction;
    ctx.getModelFamily = getModelFamily;
    ctx.dv = window.dv || null;
    ctx.agentCardRefs = new Map();
    ctx.onStatsReady = [];
    ctx.perf = perf;
    ctx._pausables = [];
    ctx.registerPausable = function (startFn, stopFn) {
      ctx._pausables.push({ start: startFn, stop: stopFn });
    };
  }

  // ── 4. Load services ──
  // Session manager core (shared by desktop and mobile managers)
  ctx._sessionManagerCore = await (await loadModule("services/session-manager-core.js"))(ctx);

  if (mode === "full") {
    // Load agent registry (via adapter's vault query or dv)
    const registryPath = config.widgets?.agentCards?.registryPath || "src/config/Jarvis-Registry";
    try {
      const registry = adapter.parseYamlFrontmatter
        ? await adapter.parseYamlFrontmatter(registryPath)
        : (ctx.dv ? ctx.dv.page(registryPath) : null);
      const agents = registry?.agents || [];
      ctx.agents = agents;
      ctx.agentNames = new Set();
      ctx.skillToAgent = new Map();
      agents.forEach(a => {
        ctx.agentNames.add(a.name);
        (a.skills || []).forEach(s => ctx.skillToAgent.set(s, a.name));
      });
    } catch {
      ctx.agents = [];
      ctx.agentNames = new Set();
      ctx.skillToAgent = new Map();
    }

    ctx.sessionParser = await (await loadModule("services/session-parser.js"))(ctx);
    ctx.cleanups.push(() => { if (ctx.sessionParser?.cleanup) ctx.sessionParser.cleanup(); });

    ctx.statsEngine = await (await loadModule("services/stats-engine.js"))(ctx);
    ctx.timerService = await (await loadModule("services/timer-service.js"))(ctx);
    ctx.voiceService = await (await loadModule("services/voice-service.js"))(ctx);
    ctx.cleanups.push(() => ctx.voiceService.cleanup());
    ctx.ttsService = await (await loadModule("services/tts-service.js"))(ctx);
    ctx.cleanups.push(() => ctx.ttsService.cleanup());
    ctx.sessionManager = await (await loadModule("services/session-manager.js"))(ctx);
    ctx.cleanups.push(() => ctx.sessionManager.cleanup());
  }

  if (mode === "mobile") {
    ctx.sessionManager = await (await loadModule("services/session-manager-mobile.js"))(ctx);
    ctx.cleanups.push(() => ctx.sessionManager.cleanup());
  }

  // Load network client (both modes — mobile always, full only when remote)
  if (mode === "mobile" || config.widgets?.voiceCommand?.mode === "remote") {
    ctx.networkClient = await (await loadModule("services/network-client.js"))(ctx);
    ctx.cleanups.push(() => ctx.networkClient.cleanup());
  }

  // ── 5. Create main wrapper ──
  const wrapper = el("div", {
    background: T.bg,
    minHeight: mode === "full" ? "100vh" : undefined,
    padding: mode === "full"
      ? (isNarrow ? "16px" : "32px")
      : (isNarrow ? "16px 12px" : "24px"),
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    color: T.text,
    position: "relative",
    overflow: mode === "full" ? "hidden" : undefined,
    boxSizing: "border-box",
  });
  container.appendChild(wrapper);

  // Scan line overlay
  if (config.dashboard?.showScanLine !== false) {
    wrapper.appendChild(el("div", {
      position: "absolute",
      left: "0", width: "100%", height: "6%",
      background: "linear-gradient(180deg, transparent, rgba(0,212,255,0.04), transparent)",
      pointerEvents: "none", zIndex: "1",
      animation: animationsEnabled ? "jarvisScanLine 8s linear infinite" : "none",
      willChange: animationsEnabled ? "top" : "auto",
      /* contain: "layout style", — disabled: clips hover animations in Tauri */
    }));
  }

  // ── 6. Render widgets ──
  const gridRefs = [];

  if (mode === "mobile") {
    // Mobile: inline header + voice widget only
    const header = el("div", {
      textAlign: "center",
      marginBottom: isNarrow ? "8px" : "16px",
      paddingTop: isNarrow ? "44px" : "0",
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

    const voiceWidget = await (await loadModule("widgets/voice-command/mobile.js"))(ctx);
    wrapper.appendChild(voiceWidget);
  } else {
    // Full: render all widgets per layout config
    const WIDGET_MAP = {
      "header":                "widgets/header/index.js",
      "live-sessions":         "widgets/live-sessions/index.js",
      "system-diagnostics":    "widgets/system-diagnostics/index.js",
      "agent-cards":           "widgets/agent-cards/index.js",
      "activity-analytics":    "widgets/activity-analytics/index.js",
      "communication-link":    "widgets/communication-link/index.js",
      "focus-timer":           "widgets/focus-timer/index.js",
      "quick-capture":         "widgets/quick-capture/index.js",
      "quick-launch":          "widgets/quick-launch/index.js",
      "mission-control":       "widgets/mission-control/index.js",
      "recent-activity":       "widgets/recent-activity/index.js",
      "jarvis-voice-command":  "widgets/voice-command/index.js",
      "footer":                "widgets/footer/index.js",
    };

    const DEFERRED_WIDGETS = new Set([
      "activity-analytics", "recent-activity", "footer",
      "system-diagnostics",
    ]);

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

    for (const entry of layout) {
      // Skip filtered widgets
      if (widgetFilter && entry.type !== "row" && !widgetFilter(entry.type)) continue;

      if (entry.type === "row" && entry.widgets) {
        // Filter widgets inside rows
        const rowWidgets = widgetFilter ? entry.widgets.filter(widgetFilter) : entry.widgets;
        if (rowWidgets.length === 0) continue;
        const row = el("div", {
          display: "grid",
          gridTemplateColumns: isNarrow ? "1fr" : `repeat(${Math.min(rowWidgets.length, entry.columns || 2)}, 1fr)`,
          gap: isNarrow ? "12px" : "20px",
          position: "relative",
          zIndex: "2",
          marginBottom: isNarrow ? "24px" : "40px",
          overflow: "visible",
        });
        row.dataset.jarvisOverflowVisible = "1";
        for (const widgetType of rowWidgets) {
          if (WIDGET_MAP[widgetType]) {
            const widget = await (await loadModule(WIDGET_MAP[widgetType]))(ctx);
            if (widget.style) {
              widget.style.marginBottom = "0";
              widget.dataset.jarvisOverflowVisible = "1";
              if (DEFERRED_WIDGETS.has(widgetType)) {
                widget.style.contentVisibility = "auto";
              }
            }
            row.appendChild(widget);
          }
        }
        wrapper.appendChild(row);
        gridRefs.push({ el: row, columns: Math.min(rowWidgets.length, entry.columns || 2) });
      } else if (WIDGET_MAP[entry.type]) {
        const widget = await (await loadModule(WIDGET_MAP[entry.type]))(ctx);
        if (widget.style) {
          /* widget.style.contain = "layout style"; — disabled for Tauri */
          if (DEFERRED_WIDGETS.has(entry.type)) {
            widget.style.contentVisibility = "auto";
          }
        }
        wrapper.appendChild(widget);
      }
    }

    // Trigger async stats
    if (ctx.sessionParser?.hasWorker) {
      ctx._onWorkerStats = (stats) => {
        ctx.onStatsReady.forEach(cb => { try { cb(stats); } catch {} });
        ctx._onWorkerStats = null;
      };
      ctx.sessionParser.requestWorkerStats();
    } else {
      setTimeout(() => {
        try {
          const stats = ctx.statsEngine.computeStats();
          ctx.onStatsReady.forEach(cb => cb(stats));
        } catch {}
      }, 100);
    }
  }

  // ── 7. Visibility handler (pause/resume) ──
  const _visibilityHandler = () => {
    const hidden = document.hidden;
    ctx._paused = hidden;
    if (mode === "full") {
      if (hidden) {
        wrapper.classList.add("jarvis-bg-paused");
        ctx._pausables?.forEach(p => { try { p.stop(); } catch {} });
      } else {
        wrapper.classList.remove("jarvis-bg-paused");
        ctx._pausables?.forEach(p => { try { p.start(); } catch {} });
      }
    }
  };
  document.addEventListener("visibilitychange", _visibilityHandler);
  ctx.cleanups.push(() => document.removeEventListener("visibilitychange", _visibilityHandler));

  // ── 8. Cleanup observer ──
  const cleanup = () => {
    ctx.intervals.forEach(id => clearInterval(id));
    ctx.cleanups.forEach(fn => { try { fn(); } catch {} });
  };

  const observer = new MutationObserver(() => {
    if (!document.contains(wrapper)) {
      observer.disconnect();
      cleanup();
    }
  });
  const observeTarget = container.parentElement || document.body;
  observer.observe(observeTarget, { childList: true, subtree: false });

  // Fallback periodic check
  if (mode === "full") {
    ctx.intervals.push(setInterval(() => {
      if (!document.contains(wrapper)) {
        observer.disconnect();
        cleanup();
      }
    }, 10000));
  }

  // ── 9. Responsive resize (full mode) ──
  if (mode === "full") {
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
    ctx.cleanups.push(() => ro.disconnect());
  }

  // Return handle for external control
  return { wrapper, styleEl, ctx, cleanup };
}

if (typeof window !== "undefined") window.loadDashboard = loadDashboard;
