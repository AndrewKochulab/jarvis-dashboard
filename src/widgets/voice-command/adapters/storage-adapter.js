// Voice Command — Storage adapter
// Desktop: filesystem via ctx.nodeFs + ctx.sessionManager
// Mobile: ctx.sessionManager (localStorage-backed)
// Session sync logic is shared — only I/O methods differ per platform.

const { config } = ctx;
const isDesktop = !!ctx.nodeFs;
const sessionManager = ctx.sessionManager;

function createStorageAdapter() {

  // ── Shared session sync (both desktop and mobile) ──
  function syncFromManager(state) {
    const session = sessionManager.getActiveSession();
    if (session) {
      state.activeJarvisSessionId = session.id;
      state.currentSessionId = session.sessionId;
      state.conversationHistory = session.conversationHistory;
      state.fullBuffer = session.fullBuffer;
    } else {
      state.activeJarvisSessionId = null;
      state.currentSessionId = null;
      state.conversationHistory = [];
      state.fullBuffer = "";
    }
  }

  function syncToManager(state) {
    if (!state.activeJarvisSessionId) return;
    const session = sessionManager.getSession(state.activeJarvisSessionId);
    if (session) {
      session.sessionId = state.currentSessionId;
      session.conversationHistory = state.conversationHistory;
      session.fullBuffer = state.fullBuffer;
      session.lastActiveAt = Date.now();
      sessionManager.saveImmediate();
    }
  }

  function saveSession(data) { syncToManager(data); }

  function loadSession() {
    if (!sessionManager.getActiveSession()) {
      const defaultIdx = config.projects?.defaultProjectIndex || 0;
      sessionManager.createSession(defaultIdx);
    }
    const state = {};
    syncFromManager(state);
    return state;
  }

  // ── Desktop: filesystem-backed ──
  if (isDesktop) {
    const nodeFs = ctx.nodeFs;
    const nodePath = ctx.nodePath;

    function expandPath(p) {
      if (!p) return null;
      if (p.startsWith("~/") || p === "~") {
        return p.replace("~", require("os").homedir());
      }
      return p;
    }

    function getActiveProjectPath() {
      const session = sessionManager.getActiveSession();
      if (session) return sessionManager.getProjectPath(session.projectIndex);
      const defaultIdx = config.projects?.defaultProjectIndex || 0;
      return sessionManager.getProjectPath(defaultIdx);
    }

    function getProjectSessionDir() {
      const cwd = expandPath(getActiveProjectPath()) || app.vault.adapter.basePath;
      return nodePath.join(require("os").homedir(), ".claude", "projects",
        cwd.replace(/[^a-zA-Z0-9-]/g, "-"));
    }

    function getSettingsPath() {
      const cwd = expandPath(getActiveProjectPath()) || app.vault.adapter.basePath;
      return nodePath.join(cwd, ".claude", "settings.local.json");
    }

    return {
      expandPath,
      getActiveProjectPath,
      getProjectSessionDir,

      snapshotJsonlFiles() {
        try {
          const dir = getProjectSessionDir();
          if (!nodeFs.existsSync(dir)) return new Set();
          return new Set(nodeFs.readdirSync(dir).filter(f => f.endsWith(".jsonl")));
        } catch { return new Set(); }
      },

      detectNewSession(beforeSet) {
        try {
          const dir = getProjectSessionDir();
          if (!nodeFs.existsSync(dir)) return null;
          const afterFiles = nodeFs.readdirSync(dir).filter(f => f.endsWith(".jsonl"));
          const newFiles = afterFiles.filter(f => !beforeSet.has(f));
          if (newFiles.length === 1) return newFiles[0].replace(".jsonl", "");
          if (newFiles.length > 1) {
            let best = null, bestMtime = 0;
            for (const f of newFiles) {
              try {
                const mt = nodeFs.statSync(nodePath.join(dir, f)).mtimeMs;
                if (mt > bestMtime) { bestMtime = mt; best = f; }
              } catch {}
            }
            return best ? best.replace(".jsonl", "") : null;
          }
          return null;
        } catch { return null; }
      },

      readTtsPrefs() {
        try {
          const p = nodePath.join(getProjectSessionDir(), "jarvis-tts-prefs.json");
          return JSON.parse(nodeFs.readFileSync(p, "utf8"));
        } catch { return { muted: false }; }
      },

      writeTtsPrefs(prefs) {
        try {
          const dir = getProjectSessionDir();
          if (!nodeFs.existsSync(dir)) nodeFs.mkdirSync(dir, { recursive: true });
          nodeFs.writeFileSync(
            nodePath.join(dir, "jarvis-tts-prefs.json"),
            JSON.stringify(prefs, null, 2)
          );
        } catch {}
      },

      readSettings() {
        try {
          const p = getSettingsPath();
          if (nodeFs.existsSync(p)) return JSON.parse(nodeFs.readFileSync(p, "utf8"));
        } catch {}
        return {};
      },

      addSettingsPermission(entry) {
        try {
          const p = getSettingsPath();
          const settings = this.readSettings();
          settings.permissions = settings.permissions || {};
          settings.permissions.allow = settings.permissions.allow || [];
          if (!settings.permissions.allow.includes(entry)) {
            settings.permissions.allow.push(entry);
            nodeFs.writeFileSync(p, JSON.stringify(settings, null, 2));
            console.log("[JARVIS] Permission added:", entry, "→", p);
          }
          return true;
        } catch (e) {
          console.error("[JARVIS] Failed to add permission:", entry, e.message);
          return false;
        }
      },

      removeSettingsPermission(entry) {
        try {
          const settings = this.readSettings();
          const allow = settings.permissions?.allow || [];
          const idx = allow.indexOf(entry);
          if (idx >= 0) {
            allow.splice(idx, 1);
            nodeFs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
          }
        } catch {}
      },

      syncFromManager, syncToManager, saveSession, loadSession,
    };
  }

  // ── Mobile: no filesystem, stubs + shared session sync ──
  const STORAGE_KEY = "JARVIS-mobile-voice-state";

  return {
    expandPath(p) { return p; },
    getActiveProjectPath() { return null; },
    getProjectSessionDir() { return null; },

    snapshotJsonlFiles() { return new Set(); },
    detectNewSession() { return null; },

    readTtsPrefs() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY + "-tts");
        return raw ? JSON.parse(raw) : { muted: false };
      } catch { return { muted: false }; }
    },

    writeTtsPrefs(prefs) {
      try { localStorage.setItem(STORAGE_KEY + "-tts", JSON.stringify(prefs)); } catch {}
    },

    readSettings() { return {}; },
    addSettingsPermission() { return false; },
    removeSettingsPermission() {},

    syncFromManager, syncToManager, saveSession, loadSession,
  };
}

return { createStorageAdapter };
