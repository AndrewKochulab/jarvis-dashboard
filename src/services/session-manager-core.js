// Session Manager Core — shared logic for desktop and mobile session managers
// Platform-specific persistence is injected via { persistSave, persistLoad } callbacks.
// Returns: factory function createSessionManagerCore(options)

const { config } = ctx;
const MAX_SESSIONS = 10;
const SAVE_DEBOUNCE_MS = 500;

const projects = config.projects || {};
const tracked = projects.tracked || [];
const colorPalette = projects.colorPalette || [
  "#00d4ff", "#7c6bff", "#44c98f", "#ff6b35", "#f6d365",
  "#e74c3c", "#56cfe1", "#a259ff", "#3ddc84", "#ff9500"
];

// ── Session data model ──
function createSessionData(projectIndex) {
  const proj = tracked[projectIndex] || {};
  return {
    id: generateId(),
    projectIndex,
    projectLabel: proj.label || `Project ${projectIndex}`,
    projectColor: getProjectColor(projectIndex),
    projectIcon: getProjectIcon(projectIndex),
    customName: null,
    sessionColor: null,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    sessionId: null,
    conversationHistory: [],
    fullBuffer: "",
    status: "idle",
  };
}

// ── Color variation helper ──
function generateSessionColor(baseHex, indexInProject) {
  if (indexInProject === 0) return baseHex;
  const hex = baseHex.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  h = ((h * 360 + indexInProject * 15) % 360) / 360;
  l = Math.max(0.15, Math.min(0.85, l + (indexInProject % 2 === 0 ? 1 : -1) * indexInProject * 0.05));
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  }
  let r2, g2, b2;
  if (s === 0) { r2 = g2 = b2 = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r2 = hue2rgb(p, q, h + 1/3);
    g2 = hue2rgb(p, q, h);
    b2 = hue2rgb(p, q, h - 1/3);
  }
  const toHex = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
}

function generateId() {
  return "js-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function getProjectColor(index) {
  const proj = tracked[index];
  if (proj?.color) return proj.color;
  return colorPalette[index % colorPalette.length];
}

function getProjectIcon(index) {
  const proj = tracked[index];
  return proj?.icon || "\u25c9";
}

// ── Normalize loaded sessions (fill missing fields) ──
function normalizeSessions(raw) {
  return (raw.sessions || []).map(s => ({
    ...s,
    status: s.status || "idle",
    conversationHistory: s.conversationHistory || [],
    fullBuffer: s.fullBuffer || "",
    projectColor: s.projectColor || getProjectColor(s.projectIndex),
    projectIcon: s.projectIcon || getProjectIcon(s.projectIndex),
    projectLabel: s.projectLabel || (tracked[s.projectIndex]?.label || `Project ${s.projectIndex}`),
    customName: s.customName || null,
    sessionColor: s.sessionColor || null,
  }));
}

// ── Serialize sessions for persistence ──
function serializeSessions(sessions, activeSessionId) {
  return {
    activeSessionId,
    sessions: sessions.map(s => ({
      id: s.id,
      projectIndex: s.projectIndex,
      projectLabel: s.projectLabel,
      projectColor: s.projectColor,
      projectIcon: s.projectIcon,
      customName: s.customName || null,
      sessionColor: s.sessionColor || null,
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt,
      sessionId: s.sessionId,
      conversationHistory: s.conversationHistory,
      fullBuffer: s.fullBuffer,
      status: s.status === "streaming" ? "idle" : s.status,
    })),
  };
}

// ── Factory ──
// persistSave(data)  — writes serialized data to platform storage
// persistLoad()      — reads from platform storage, returns {sessions, activeSessionId} or null
return function createSessionManagerCore({ persistSave, persistLoad }) {
  let sessions = [];
  let activeSessionId = null;
  let listeners = [];
  let saveTimer = null;

  // ── CRUD ──
  function createSession(projectIndex) {
    const session = createSessionData(projectIndex);
    const sameProjectCount = sessions.filter(s => s.projectIndex === projectIndex).length;
    session.sessionColor = generateSessionColor(session.projectColor, sameProjectCount);
    sessions.push(session);
    pruneIfNeeded();
    activeSessionId = session.id;
    saveImmediate();
    notifyListeners();
    return session;
  }

  function moveSession(sessionId, newIndex) {
    const idx = sessions.findIndex(s => s.id === sessionId);
    if (idx < 0 || newIndex < 0 || newIndex >= sessions.length || idx === newIndex) return;
    const [session] = sessions.splice(idx, 1);
    sessions.splice(newIndex, 0, session);
    saveImmediate();
    notifyListeners();
  }

  function getSession(id) {
    return sessions.find(s => s.id === id) || null;
  }

  function removeSession(id) {
    const idx = sessions.findIndex(s => s.id === id);
    if (idx < 0) return;
    sessions.splice(idx, 1);
    if (activeSessionId === id) {
      activeSessionId = sessions.length > 0 ? sessions[sessions.length - 1].id : null;
    }
    saveImmediate();
    notifyListeners();
  }

  function getAllSessions() { return sessions; }
  function getActiveSessionId() { return activeSessionId; }

  function setActiveSession(id) {
    if (!sessions.find(s => s.id === id)) return;
    activeSessionId = id;
    const session = getSession(id);
    if (session) session.lastActiveAt = Date.now();
    saveImmediate();
    notifyListeners();
  }

  function getActiveSession() {
    if (!activeSessionId) return null;
    return getSession(activeSessionId);
  }

  function getProject(index) { return tracked[index] || null; }

  // ── Persistence ──
  function saveImmediate() {
    persistSave(serializeSessions(sessions, activeSessionId));
  }

  function saveDebouncedFn() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveImmediate();
    }, SAVE_DEBOUNCE_MS);
  }

  function load() {
    const raw = persistLoad();
    if (raw) {
      sessions = normalizeSessions(raw);
      activeSessionId = raw.activeSessionId || null;
      if (activeSessionId && !sessions.find(s => s.id === activeSessionId)) {
        activeSessionId = sessions.length > 0 ? sessions[sessions.length - 1].id : null;
      }
    }
  }

  // ── Pruning ──
  function pruneIfNeeded() {
    while (sessions.length > MAX_SESSIONS) {
      let oldest = null;
      let oldestTime = Infinity;
      for (const s of sessions) {
        if (s.id === activeSessionId) continue;
        if (s.status === "streaming") continue;
        if (s.lastActiveAt < oldestTime) {
          oldestTime = s.lastActiveAt;
          oldest = s;
        }
      }
      if (oldest) {
        sessions.splice(sessions.indexOf(oldest), 1);
      } else {
        break;
      }
    }
  }

  // ── Change notification ──
  function onChange(callback) {
    listeners.push(callback);
    return () => { listeners = listeners.filter(cb => cb !== callback); };
  }

  function notifyListeners() {
    for (const cb of listeners) {
      try { cb(); } catch (e) {}
    }
  }

  // ── Cleanup ──
  function cleanup() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    saveImmediate();
    listeners = [];
  }

  // ── Initialize ──
  load();

  return {
    createSession, moveSession, getSession, removeSession,
    getAllSessions, getActiveSessionId, setActiveSession, getActiveSession,
    getProject, getProjectColor, getProjectIcon,
    save: saveDebouncedFn, saveImmediate, load,
    onChange, cleanup,
    get tracked() { return tracked; },
    get colorPalette() { return colorPalette; },
  };
};
