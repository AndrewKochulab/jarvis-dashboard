/**
 * iOS Bootstrap — configures the WKWebView environment for the mobile
 * voice command widget.
 *
 * Sequence:
 *   1. Load bundled JS files from app resources
 *   2. Get server config from Swift bridge (Keychain credentials)
 *   3. Install minimal window.app / window.dv / window.Notice mocks
 *   4. Call loadDashboard() with mode "mobile"
 */
window.__iosBootstrap = async function () {
  const adapter = window.__wkwebviewAdapter;

  // ── 1. Load bundled module files ──
  // Swift pre-loads files into window.__preloadedFiles (fetch() fails on file:// in WKWebView).
  // Fall back to fetch() if pre-loaded data is not available.
  const preloaded = window.__preloadedFiles || {};
  const moduleFiles = [
    "src/config/config.example.json",
    "src/config/config.json",
    "src/config/config.local.json",
    "src/core/theme.js",
    "src/core/styles.js",
    "src/core/helpers.js",
    "src/core/markdown-renderer.js",
    "src/services/network-client.js",
    "src/widgets/voice-command/mobile.js",
    // Voice command sub-modules
    "src/widgets/voice-command/core/utilities.js",
    "src/widgets/voice-command/core/state-machine.js",
    "src/widgets/voice-command/core/arc-reactor.js",
    "src/widgets/voice-command/core/text-input.js",
    "src/widgets/voice-command/core/connection-bar.js",
    "src/widgets/voice-command/core/terminal-panel.js",
    "src/widgets/voice-command/core/interaction-cards.js",
    "src/widgets/voice-command/core/reconnect-manager.js",
    "src/widgets/voice-command/adapters/storage-adapter.js",
    "src/widgets/voice-command/adapters/recorder-adapter.js",
    "src/widgets/voice-command/adapters/tts-adapter.js",
    "src/services/session-manager-core.js",
    "src/services/session-manager-mobile.js",
    "src/widgets/voice-command/core/session-tabs.js",
    "src/widgets/voice-command/core/project-selector.js",
  ];

  for (const file of moduleFiles) {
    try {
      if (preloaded[file]) {
        adapter.setBundledFile(file, preloaded[file]);
      } else {
        const resp = await fetch(file);
        if (resp.ok) {
          adapter.setBundledFile(file, await resp.text());
        }
      }
    } catch (err) {
      console.warn("[ios-bootstrap] Failed to load:", file, err);
    }
  }

  // ── 2. Get server config from Swift (Keychain-stored credentials) ──
  let serverConfig = {};
  try {
    serverConfig = await adapter.getServerConfig();
  } catch (err) {
    console.warn("[ios-bootstrap] Could not get server config:", err);
  }

  // Build config overrides from Swift settings
  const configOverrides = {};
  if (serverConfig.network) {
    configOverrides.network = serverConfig.network;
  }
  if (serverConfig.mobileTts) {
    configOverrides.network = configOverrides.network || {};
    configOverrides.network.mobileTts = serverConfig.mobileTts;
  }

  // Pass project config through for session management
  if (serverConfig.projects) {
    configOverrides.projects = serverConfig.projects;
  }

  // Force remote mode for iOS
  configOverrides.widgets = {
    voiceCommand: {
      mode: "remote",
    },
  };

  // ── 3. Install minimal global mocks ──
  window.app = {
    vault: {
      adapter: {
        basePath: "",
        read: async (path) => adapter.readFile(path) || "",
        write: async () => {},
      },
    },
  };

  window.dv = {
    current: () => ({ file: { path: "JarvisApp/index.html" } }),
    page: () => null,
    pages: () => ({ length: 0, sort: () => ({ slice: () => [] }) }),
  };

  window.Notice = class Notice {
    constructor(msg) { adapter.showNotice(msg); }
  };

  // ── 4. Notify Swift of connection status changes ──
  // The network client emits connection events — forward to Swift
  const origWS = window.WebSocket;
  window.WebSocket = class extends origWS {
    constructor(url, protocols) {
      super(url, protocols);
      reportConnectionStatus("connecting");
      this.addEventListener("open", () => {
        reportConnectionStatus("connected");
      });
      this.addEventListener("close", () => {
        reportConnectionStatus("disconnected");
      });
      this.addEventListener("error", () => {
        reportConnectionStatus("disconnected");
      });
    }
  };

  function reportConnectionStatus(status) {
    try {
      window.webkit.messageHandlers.jarvis_connectionStatus.postMessage({ status });
    } catch {}
  }

  // Expose for network client to report reconnecting state
  window.__reportConnectionStatus = reportConnectionStatus;

  // ── 5. Load dashboard ──
  const container = document.getElementById("dashboard");
  document.getElementById("loading").classList.add("hidden");

  try {
    await window.loadDashboard(adapter, {
      mode: "mobile",
      container,
      srcBase: "src/",
      configOverrides,
    });
  } catch (err) {
    // Show error visibly on screen with full details
    const loadingEl = document.getElementById("loading");
    loadingEl.classList.remove("hidden");
    var detail = (err.name || "Error") + ": " + (err.message || "(no message)") +
      "\n\n" + (err.stack || "");
    loadingEl.innerHTML = '<div style="color:#ff4444">DASHBOARD ERROR</div>' +
      '<div class="subtitle" style="color:#ff8888;word-break:break-all;white-space:pre-wrap;max-width:90vw;font-size:9px">' +
      detail + '</div>';
    throw err; // Re-throw for the outer catch
  }
};
