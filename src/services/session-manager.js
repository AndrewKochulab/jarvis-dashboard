// Session Manager Service — Desktop (Node.js filesystem persistence)
// Thin wrapper around session-manager-core with filesystem I/O and legacy migration.
// Returns: service object (same API as core + getProjectPath)

const { nodeFs, nodePath, config } = ctx;
const os = require("os");
const homedir = os.homedir();
const SESSIONS_PATH = nodePath.join(homedir, ".claude", "jarvis-sessions.json");

const createCore = ctx._sessionManagerCore;
const projects = config.projects || {};
const tracked = projects.tracked || [];

// ── Desktop-only: project path resolution ──
function getProjectPath(index) {
  const proj = tracked[index];
  if (!proj) return null;
  if (proj.path) return proj.path;
  // Derive from dir: reverse the dash-encoding
  const dir = proj.dir || "";
  return "/" + dir.replace(/^-/, "").replace(/-/g, "/");
}

// ── Legacy migration (one-time: old per-project state → new sessions format) ──
function migrateFromLegacy() {
  const defaultIdx = projects.defaultProjectIndex || 0;
  const proj = tracked[defaultIdx];
  if (!proj) return null;

  const projPath = getProjectPath(defaultIdx);
  if (!projPath) return null;

  const expandedPath = projPath.startsWith("~/")
    ? projPath.replace("~", homedir) : projPath;
  const legacyDir = nodePath.join(homedir, ".claude", "projects",
    expandedPath.replace(/[^a-zA-Z0-9-]/g, "-"));
  const legacyFile = nodePath.join(legacyDir, "jarvis-voice-state.json");

  try {
    if (nodeFs.existsSync(legacyFile)) {
      const legacy = JSON.parse(nodeFs.readFileSync(legacyFile, "utf8"));
      if (legacy.currentSessionId || (legacy.conversationHistory && legacy.conversationHistory.length > 0)) {
        const id = "js-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
        console.log("[SessionManager] Migrated legacy voice state for", proj.label);
        return {
          activeSessionId: id,
          sessions: [{
            id,
            projectIndex: defaultIdx,
            projectLabel: proj.label || `Project ${defaultIdx}`,
            createdAt: Date.now(),
            lastActiveAt: Date.now(),
            sessionId: legacy.currentSessionId || null,
            conversationHistory: legacy.conversationHistory || [],
            fullBuffer: legacy.fullBuffer || "",
            status: "idle",
          }],
        };
      }
    }
  } catch (e) {
    console.error("[SessionManager] Migration failed:", e.message);
  }
  return null;
}

// ── Create core with filesystem persistence ──
const manager = createCore({
  persistSave(data) {
    try {
      const dir = nodePath.dirname(SESSIONS_PATH);
      if (!nodeFs.existsSync(dir)) nodeFs.mkdirSync(dir, { recursive: true });
      nodeFs.writeFileSync(SESSIONS_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error("[SessionManager] Save failed:", e.message);
    }
  },

  persistLoad() {
    // Try normal load
    try {
      if (nodeFs.existsSync(SESSIONS_PATH)) {
        return JSON.parse(nodeFs.readFileSync(SESSIONS_PATH, "utf8"));
      }
    } catch (e) {
      console.error("[SessionManager] Load failed:", e.message);
    }
    // Fallback: one-time legacy migration
    return migrateFromLegacy();
  },
});

// Extend with desktop-only method
manager.getProjectPath = getProjectPath;

return manager;
