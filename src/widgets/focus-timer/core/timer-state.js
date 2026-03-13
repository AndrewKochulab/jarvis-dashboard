// Timer State Machine — Pure state logic (no DOM, no Obsidian APIs)
// Returns: { createTimerState }

function createTimerState(timerService) {
  const ts = timerService.readTimerState();
  const listeners = [];

  function notify() { listeners.forEach(cb => cb(ts)); }

  function getRemainingMs() {
    const duration = ts.mode === "work" ? ts.workDuration : ts.breakDuration;
    let elapsedMs = ts.elapsed;
    if (ts.state === "running" && ts.startedAt) {
      elapsedMs += Date.now() - ts.startedAt;
    }
    return Math.max(0, duration - elapsedMs);
  }

  function getProgress() {
    const duration = ts.mode === "work" ? ts.workDuration : ts.breakDuration;
    let elapsedMs = ts.elapsed;
    if (ts.state === "running" && ts.startedAt) {
      elapsedMs += Date.now() - ts.startedAt;
    }
    return Math.min(1, elapsedMs / duration);
  }

  function start() {
    ts.state = "running";
    ts.startedAt = Date.now();
    timerService.writeTimerState(ts);
    notify();
  }

  function pause() {
    if (ts.state !== "running") return;
    ts.elapsed += Date.now() - ts.startedAt;
    ts.state = "paused";
    ts.startedAt = null;
    timerService.writeTimerState(ts);
    notify();
  }

  function reset() {
    ts.state = "idle";
    ts.mode = "work";
    ts.startedAt = null;
    ts.elapsed = 0;
    timerService.writeTimerState(ts);
    notify();
  }

  function complete() {
    if (ts.state !== "running") return;
    const completedMode = ts.mode;
    ts.state = "idle";
    ts.startedAt = null;
    ts.elapsed = 0;
    ts.mode = completedMode === "work" ? "break" : "work";
    if (completedMode === "work") ts.sessionsToday += 1;
    timerService.writeTimerState(ts);
    notify();
    return completedMode;
  }

  function selectWorkPreset(ms) {
    ts.workDuration = ms;
    if (ts.state === "idle") { ts.elapsed = 0; timerService.writeTimerState(ts); notify(); }
    else { reset(); }
  }

  function selectBreakPreset(ms) {
    ts.breakDuration = ms;
    if (ts.state === "idle") { timerService.writeTimerState(ts); }
    else if (ts.mode === "break") { reset(); }
  }

  function onChange(cb) { listeners.push(cb); }

  return {
    get: () => ts,
    start, pause, reset, complete,
    getRemainingMs, getProgress,
    selectWorkPreset, selectBreakPreset,
    onChange,
  };
}

return { createTimerState };
