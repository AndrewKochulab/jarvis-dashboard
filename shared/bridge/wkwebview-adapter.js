/**
 * WKWebView Adapter — maps PlatformAdapter to Swift message handlers.
 *
 * Used by ios.  The iOS app is mobile-only (voice command widget),
 * so file system, process, and vault methods are stubs.
 *
 * Communication with Swift uses:
 *   window.webkit.messageHandlers.<name>.postMessage(payload)
 *
 * Swift → JS responses come via window.jarvisBridge.resolve(id, data).
 */
(function () {
  // ── Pending promise map for async bridge calls ──
  const _pending = new Map();
  let _nextId = 1;

  function bridgeCall(handler, payload = {}) {
    return new Promise((resolve, reject) => {
      const id = _nextId++;
      _pending.set(id, { resolve, reject });
      try {
        window.webkit.messageHandlers[handler].postMessage({ id, ...payload });
      } catch (err) {
        _pending.delete(id);
        reject(err);
      }
    });
  }

  // Swift calls these to resolve/reject pending promises
  window.jarvisBridge = {
    resolve(id, data) {
      const p = _pending.get(id);
      if (p) { _pending.delete(id); p.resolve(data); }
    },
    reject(id, error) {
      const p = _pending.get(id);
      if (p) { _pending.delete(id); p.reject(new Error(error)); }
    },
  };

  // ── Bundled file cache (iOS bundles JS files as app resources) ──
  const _bundleCache = new Map();

  const adapter = {
    platform: "ios",

    _bundleCache,

    // Pre-populate from bundled files loaded by ios-bootstrap.js
    setBundledFile(path, content) {
      _bundleCache.set(path, content);
    },

    // ── File System (stubs — mobile widget doesn't use these) ──
    readFile(path) {
      if (_bundleCache.has(path)) return _bundleCache.get(path);
      return null;
    },

    async readFileAsync(path) {
      if (_bundleCache.has(path)) return _bundleCache.get(path);
      return null;
    },

    writeFile() { /* no-op on iOS */ },
    stat() { return { mtimeMs: 0, size: 0, isDirectory: false }; },
    readdir() { return []; },
    exists(path) { return _bundleCache.has(path); },
    mkdir() { /* no-op */ },

    // ── Process (not available on iOS) ──
    spawn() { throw new Error("Process spawning not available on iOS"); },
    exec() { throw new Error("exec not available on iOS"); },
    kill() { /* no-op */ },

    // ── OS ──
    homedir() { return ""; },
    tmpdir() { return ""; },

    // ── Vault ──
    vaultBasePath() { return ""; },
    openNote() { /* no-op */ },
    queryRecentFiles() { return []; },
    countFiles() { return 0; },
    parseYamlFrontmatter() { return {}; },

    // ── UI ──
    showNotice(message, duration = 3000) {
      // Delegate to Swift for native toast
      try {
        window.webkit.messageHandlers.jarvis_showNotice.postMessage({
          message, duration,
        });
      } catch {
        // Fallback: JS toast
        const toast = document.createElement("div");
        toast.textContent = message;
        Object.assign(toast.style, {
          position: "fixed", bottom: "env(safe-area-inset-bottom, 24px)",
          left: "50%", transform: "translateX(-50%)",
          background: "#1a1a2e", color: "#e0e6ed", padding: "10px 20px",
          borderRadius: "8px", border: "1px solid rgba(0,212,255,0.3)",
          fontSize: "13px", zIndex: "10000", opacity: "0",
          transition: "opacity 0.3s",
        });
        document.body.appendChild(toast);
        requestAnimationFrame(() => { toast.style.opacity = "1"; });
        setTimeout(() => {
          toast.style.opacity = "0";
          setTimeout(() => toast.remove(), 300);
        }, duration);
      }
    },

    // ── iOS-specific: get config from Swift (Keychain-stored credentials) ──
    async getServerConfig() {
      try {
        return await bridgeCall("jarvis_getConfig");
      } catch {
        return {};
      }
    },

    // ── iOS-specific: open settings screen ──
    openSettings() {
      try {
        window.webkit.messageHandlers.jarvis_openSettings.postMessage({});
      } catch {}
    },
  };

  window.__wkwebviewAdapter = adapter;
})();
