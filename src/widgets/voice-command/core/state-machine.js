// Voice Command — UI state machine
// Manages state transitions and notifies listeners.
// Does NOT manipulate DOM — fires callbacks for UI updates.

const STATES = ["idle", "recording", "transcribing", "launching", "streaming", "done", "error"];

function createStateMachine(initialState) {
  let state = initialState || "idle";
  const listeners = [];

  return {
    getState() { return state; },
    setState(newState) {
      if (state === newState) return;
      const prev = state;
      state = newState;
      listeners.forEach(cb => { try { cb(newState, prev); } catch {} });
    },
    onStateChange(callback) {
      listeners.push(callback);
      return () => {
        const idx = listeners.indexOf(callback);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    isActive() {
      return state === "recording" || state === "transcribing" ||
             state === "launching" || state === "streaming";
    },
    STATES,
  };
}

return { createStateMachine, STATES };
