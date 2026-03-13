// Focus Timer Widget — Orchestrator
// Pomodoro timer with circular progress, presets, state persistence
// Returns: HTMLElement

const { el, T, config, isNarrow, timerService, animationsEnabled } = ctx;
const timerCfg = config.widgets?.focusTimer || {};

function loadSub(rel) {
  const code = ctx.nodeFs.readFileSync(
    ctx.nodePath.join(ctx._srcDir, "widgets", "focus-timer", rel), "utf8"
  );
  return new Function("ctx", code)(ctx);
}

const { createTimerState } = loadSub("core/timer-state.js");
const { createCircularDisplay } = loadSub("ui/circular-display.js");
const { createPresetRow } = loadSub("ui/preset-row.js");
const { createControlButtons } = loadSub("ui/control-buttons.js");

const timerState = createTimerState(timerService);
const ts = timerState.get();
let timerInterval = null;

if (typeof Notification !== "undefined" && Notification.permission === "default") {
  Notification.requestPermission();
}

// Section
const section = el("div", {
  background: T.panelBg, border: `1px solid ${T.panelBorder}`,
  borderRadius: "12px", padding: isNarrow ? "16px 14px" : "20px 24px",
  position: "relative", overflow: "hidden",
  animation: "jarvisCardFadeIn 0.5s ease-out 0.3s both",
});

section.appendChild(el("div", {
  position: "absolute", top: "0", left: "0", right: "0", height: "2px",
  background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)`,
}));

// Title row
const titleRow = el("div", {
  fontSize: "11px", fontWeight: "700", letterSpacing: "2px",
  textTransform: "uppercase", color: T.textMuted,
  marginBottom: "16px", marginTop: "4px",
  display: "flex", alignItems: "center", justifyContent: "space-between",
});
titleRow.appendChild(el("span", {}, "Focus Timer"));

const sessionBadge = el("span", {
  fontSize: "9px", fontWeight: "600", color: T.accent,
  background: "rgba(0,212,255,0.1)",
  padding: "2px 8px", borderRadius: "8px", letterSpacing: "1px",
}, "0 SESSIONS");
titleRow.appendChild(sessionBadge);
section.appendChild(titleRow);

// Circular display
const circularDisplay = createCircularDisplay();
section.appendChild(circularDisplay.el.wrap);

// Presets
const presetWrap = el("div", {
  display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px",
});
section.appendChild(presetWrap);

const workPresets = timerCfg.workPresets || [{ label: "30m", ms: 1800000 }, { label: "60m", ms: 3600000 }];
const breakPresets = timerCfg.breakPresets || [{ label: "5m", ms: 300000 }, { label: "10m", ms: 600000 }, { label: "15m", ms: 900000 }];

presetWrap.appendChild(createPresetRow("WORK", workPresets, ts.workDuration, (ms) => {
  timerState.selectWorkPreset(ms);
  updateDisplay();
}).el.row);

presetWrap.appendChild(createPresetRow("BREAK", breakPresets, ts.breakDuration, (ms) => {
  timerState.selectBreakPreset(ms);
}).el.row);

// Control buttons
function handleStartPause() {
  if (ts.state === "running") {
    timerState.pause();
    clearInterval(timerInterval);
    timerInterval = null;
    circularDisplay.setAnimating(false);
  } else {
    timerState.start();
    timerInterval = setInterval(updateDisplay, 1000);
    ctx.intervals.push(timerInterval);
    if (animationsEnabled) circularDisplay.setAnimating(true);
  }
  updateDisplay();
  controls.updateLabel(ts.state);
}

function handleReset() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerState.reset();
  updateDisplay();
  controls.updateLabel(ts.state);
  circularDisplay.setAnimating(false);
}

const controls = createControlButtons(handleStartPause, handleReset);
section.appendChild(controls.el.row);

// Display update
function updateDisplay() {
  const remaining = timerState.getRemainingMs();
  const progress = timerState.getProgress();
  circularDisplay.update(progress, ts.mode, remaining);
  sessionBadge.textContent = `${ts.sessionsToday} SESSION${ts.sessionsToday !== 1 ? "S" : ""}`;

  if (remaining <= 0 && ts.state === "running") handleComplete();
}

function handleComplete() {
  if (ts.state !== "running") return;
  clearInterval(timerInterval);
  timerInterval = null;
  const completedMode = timerState.complete();
  if (completedMode === "work") {
    timerService.logFocusSession(ts.workDuration, ts.sessionsToday, "work");
    new Notice(`Focus session #${ts.sessionsToday} completed!`);
    timerService.sendSystemNotification("Focus Complete", `Session #${ts.sessionsToday} done! Time for a break.`);
  } else {
    timerService.logFocusSession(ts.breakDuration, 0, "break");
    new Notice("Break complete! Ready for next session.");
    timerService.sendSystemNotification("Break Over", "Break complete! Ready for next focus session.");
  }
  updateDisplay();
  controls.updateLabel(ts.state);
  circularDisplay.setAnimating(false);
}

// Initialize from cache
if (ts.state === "running" && ts.startedAt) {
  const duration = ts.mode === "work" ? ts.workDuration : ts.breakDuration;
  const totalElapsed = ts.elapsed + (Date.now() - ts.startedAt);
  if (totalElapsed >= duration) {
    handleComplete();
  } else {
    timerInterval = setInterval(updateDisplay, 1000);
    ctx.intervals.push(timerInterval);
    if (animationsEnabled) circularDisplay.setAnimating(true);
  }
}
updateDisplay();
controls.updateLabel(ts.state);

// Register with pausable system
ctx.registerPausable(
  () => {
    if (ts.state === "running") {
      updateDisplay();
      timerInterval = setInterval(updateDisplay, 1000);
      ctx.intervals.push(timerInterval);
    }
  },
  () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }
);

return section;
