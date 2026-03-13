// Session Manager Service — Mobile (localStorage persistence)
// Thin wrapper around session-manager-core with localStorage I/O.
// Returns: service object (same API as core)

const STORAGE_KEY = "JARVIS-sessions";
const createCore = ctx._sessionManagerCore;

return createCore({
  persistSave(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error("[SessionManager-Mobile] Save failed:", e.message);
    }
  },

  persistLoad() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error("[SessionManager-Mobile] Load failed:", e.message);
    }
    return null;
  },
});
