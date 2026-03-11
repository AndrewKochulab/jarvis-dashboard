// Focus Timer Widget
// Pomodoro timer with circular progress, presets, state persistence
// Returns: HTMLElement

const { el, T, config, isNarrow, timerService, animationsEnabled } = ctx;
const timerCfg = config.widgets?.focusTimer || {};

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

// Timer state
const ts = timerService.readTimerState();
let timerInterval = null;

if (typeof Notification !== "undefined" && Notification.permission === "default") {
  Notification.requestPermission();
}

// Circular display
const displayWrap = el("div", {
  display: "flex", flexDirection: "column", alignItems: "center",
  gap: "14px", marginBottom: "16px",
});
section.appendChild(displayWrap);

const circleSize = isNarrow ? 120 : 140;
const innerSize = circleSize - 20;

const circle = el("div", {
  width: circleSize + "px", height: circleSize + "px", borderRadius: "50%",
  position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
  background: `conic-gradient(${T.accent} 0deg, rgba(58,69,83,0.3) 0deg)`,
  transition: "background 0.3s ease",
});
displayWrap.appendChild(circle);

const inner = el("div", {
  width: innerSize + "px", height: innerSize + "px", borderRadius: "50%",
  background: T.panelBg, display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", position: "absolute",
});
circle.appendChild(inner);

const timeEl = el("div", {
  fontSize: isNarrow ? "26px" : "32px", fontWeight: "800",
  fontFamily: "'SF Mono', 'Fira Code', monospace",
  color: T.text, letterSpacing: "2px",
}, "30:00");
inner.appendChild(timeEl);

const modeEl = el("div", {
  fontSize: "9px", fontWeight: "600", letterSpacing: "2px",
  textTransform: "uppercase", color: T.accent, marginTop: "2px",
}, "WORK");
inner.appendChild(modeEl);

// Presets
const presetWrap = el("div", {
  display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px",
});
section.appendChild(presetWrap);

function createPresetRow(label, presets, currentMs, onSelect) {
  const row = el("div", {
    display: "flex", alignItems: "center", gap: "6px",
    justifyContent: "center", flexWrap: "wrap",
  });
  row.appendChild(el("span", {
    fontSize: "9px", color: T.textDim, letterSpacing: "1px",
    marginRight: "4px", minWidth: "36px",
  }, label));

  const pills = [];
  presets.forEach(p => {
    const selected = p.ms === currentMs;
    const pill = el("span", {
      fontSize: "10px", fontWeight: "600", letterSpacing: "0.5px",
      color: selected ? T.bg : T.accent,
      background: selected ? T.accent : "rgba(0,212,255,0.08)",
      border: `1px solid ${T.accent}33`,
      padding: "3px 10px", borderRadius: "10px",
      cursor: "pointer", transition: "all 0.2s ease",
    }, p.label);
    pill.dataset.selected = selected ? "1" : "0";
    pill.addEventListener("click", () => {
      onSelect(p.ms);
      pills.forEach((pl, i) => {
        const isSel = presets[i].ms === p.ms;
        pl.style.color = isSel ? T.bg : T.accent;
        pl.style.background = isSel ? T.accent : "rgba(0,212,255,0.08)";
        pl.dataset.selected = isSel ? "1" : "0";
      });
    });
    pill.addEventListener("mouseenter", () => { if (pill.dataset.selected !== "1") pill.style.background = "rgba(0,212,255,0.15)"; });
    pill.addEventListener("mouseleave", () => { if (pill.dataset.selected !== "1") pill.style.background = "rgba(0,212,255,0.08)"; });
    pills.push(pill);
    row.appendChild(pill);
  });
  return row;
}

const workPresets = timerCfg.workPresets || [{ label: "30m", ms: 1800000 }, { label: "60m", ms: 3600000 }];
const breakPresets = timerCfg.breakPresets || [{ label: "5m", ms: 300000 }, { label: "10m", ms: 600000 }, { label: "15m", ms: 900000 }];

presetWrap.appendChild(createPresetRow("WORK", workPresets, ts.workDuration, (ms) => {
  ts.workDuration = ms;
  if (ts.state === "idle") { ts.elapsed = 0; timerService.writeTimerState(ts); updateDisplay(); }
  else { resetTimer(); }
}));

presetWrap.appendChild(createPresetRow("BREAK", breakPresets, ts.breakDuration, (ms) => {
  ts.breakDuration = ms;
  if (ts.state === "idle") { timerService.writeTimerState(ts); }
  else if (ts.mode === "break") { resetTimer(); }
}));

// Control buttons
const controlRow = el("div", {
  display: "flex", gap: "8px", justifyContent: "center",
});
section.appendChild(controlRow);

const startBtn = el("div", {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  gap: "6px", padding: "10px 28px",
  border: `1px solid ${T.accent}55`, borderRadius: "8px",
  background: "rgba(0, 212, 255, 0.06)",
  cursor: "pointer", transition: "all 0.3s ease",
});
const startBtnIcon = el("span", { fontSize: "14px", color: T.accent }, "\u25b6");
const startBtnText = el("span", {
  fontSize: "11px", fontWeight: "700", letterSpacing: "2px",
  textTransform: "uppercase", color: T.accent,
  fontFamily: "'SF Mono', 'Fira Code', monospace",
}, "Start");
startBtn.appendChild(startBtnIcon);
startBtn.appendChild(startBtnText);
controlRow.appendChild(startBtn);

startBtn.addEventListener("mouseenter", () => {
  startBtn.style.boxShadow = `0 0 20px ${T.accentDim}, 0 0 40px rgba(0,212,255,0.1)`;
  startBtn.style.borderColor = T.accent + "88";
  startBtn.style.transform = "scale(1.02)";
  startBtn.style.background = "rgba(0, 212, 255, 0.1)";
});
startBtn.addEventListener("mouseleave", () => {
  startBtn.style.boxShadow = "none";
  startBtn.style.borderColor = T.accent + "55";
  startBtn.style.transform = "scale(1)";
  startBtn.style.background = "rgba(0, 212, 255, 0.06)";
});

const resetBtn = el("div", {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  gap: "6px", padding: "10px 20px",
  border: `1px solid ${T.red}44`, borderRadius: "8px",
  background: "rgba(231, 76, 60, 0.06)",
  cursor: "pointer", transition: "all 0.3s ease",
});
resetBtn.appendChild(el("span", {
  fontSize: "11px", fontWeight: "700", letterSpacing: "2px",
  textTransform: "uppercase", color: T.red,
  fontFamily: "'SF Mono', 'Fira Code', monospace",
}, "Reset"));
controlRow.appendChild(resetBtn);

resetBtn.addEventListener("mouseenter", () => {
  resetBtn.style.boxShadow = "0 0 16px rgba(231,76,60,0.2)";
  resetBtn.style.borderColor = T.red + "77";
  resetBtn.style.transform = "scale(1.02)";
});
resetBtn.addEventListener("mouseleave", () => {
  resetBtn.style.boxShadow = "none";
  resetBtn.style.borderColor = T.red + "44";
  resetBtn.style.transform = "scale(1)";
});

// Timer logic
function updateDisplay() {
  const duration = ts.mode === "work" ? ts.workDuration : ts.breakDuration;
  let elapsedMs = ts.elapsed;
  if (ts.state === "running" && ts.startedAt) {
    elapsedMs += Date.now() - ts.startedAt;
  }
  const remaining = Math.max(0, duration - elapsedMs);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  timeEl.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const progress = Math.min(1, elapsedMs / duration);
  const degrees = Math.round(progress * 360);
  const color = ts.mode === "work" ? T.accent : T.green;
  circle.style.background = `conic-gradient(${color} ${degrees}deg, rgba(58,69,83,0.3) ${degrees}deg)`;
  modeEl.textContent = ts.mode.toUpperCase();
  modeEl.style.color = color;
  sessionBadge.textContent = `${ts.sessionsToday} SESSION${ts.sessionsToday !== 1 ? "S" : ""}`;

  if (remaining <= 0 && ts.state === "running") handleComplete();
}

function handleComplete() {
  if (ts.state !== "running") return;
  clearInterval(timerInterval);
  timerInterval = null;
  const completedMode = ts.mode;
  ts.state = "idle";
  ts.startedAt = null;
  ts.elapsed = 0;
  ts.mode = completedMode === "work" ? "break" : "work";
  if (completedMode === "work") ts.sessionsToday += 1;
  timerService.writeTimerState(ts);
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
  updateButtons();
}

function startTimer() {
  ts.state = "running";
  ts.startedAt = Date.now();
  timerService.writeTimerState(ts);
  timerInterval = setInterval(updateDisplay, 1000);
  ctx.intervals.push(timerInterval);
  updateDisplay();
  updateButtons();
  if (animationsEnabled) circle.style.animation = "jarvisTimerPulse 2s ease-in-out infinite";
}

function pauseTimer() {
  if (ts.state !== "running") return;
  ts.elapsed += Date.now() - ts.startedAt;
  ts.state = "paused";
  ts.startedAt = null;
  timerService.writeTimerState(ts);
  clearInterval(timerInterval);
  timerInterval = null;
  updateDisplay();
  updateButtons();
  circle.style.animation = "none";
}

function resetTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  ts.state = "idle";
  ts.mode = "work";
  ts.startedAt = null;
  ts.elapsed = 0;
  timerService.writeTimerState(ts);
  updateDisplay();
  updateButtons();
  circle.style.animation = "none";
}

function updateButtons() {
  if (ts.state === "running") {
    startBtnIcon.textContent = "\u23f8";
    startBtnText.textContent = "Pause";
  } else if (ts.state === "paused") {
    startBtnIcon.textContent = "\u25b6";
    startBtnText.textContent = "Resume";
  } else {
    startBtnIcon.textContent = "\u25b6";
    startBtnText.textContent = "Start";
  }
}

startBtn.addEventListener("click", () => {
  if (ts.state === "running") pauseTimer();
  else startTimer();
});

resetBtn.addEventListener("click", resetTimer);

// Initialize from cache
if (ts.state === "running" && ts.startedAt) {
  const duration = ts.mode === "work" ? ts.workDuration : ts.breakDuration;
  const totalElapsed = ts.elapsed + (Date.now() - ts.startedAt);
  if (totalElapsed >= duration) {
    handleComplete();
  } else {
    timerInterval = setInterval(updateDisplay, 1000);
    ctx.intervals.push(timerInterval);
    if (animationsEnabled) circle.style.animation = "jarvisTimerPulse 2s ease-in-out infinite";
  }
}
updateDisplay();
updateButtons();

// Register with pausable system — stop display updates when tab is hidden
// Timer continues tracking via ts.startedAt; updateDisplay recalculates on resume
ctx.registerPausable(
  () => {
    if (ts.state === "running") {
      updateDisplay(); // immediate catch-up
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
