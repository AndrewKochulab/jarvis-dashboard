// JARVIS Voice Command Widget
// Arc reactor-style circular button — record voice, transcribe, launch Claude CLI
// Returns: HTMLElement

const { el, T, config, isNarrow, voiceService, nodeFs, nodePath } = ctx;
const cmdCfg = config.widgets?.voiceCommand || {};
if (cmdCfg.enabled === false) return el("div", {});

const terminalApp = config.widgets?.communicationLink?.terminalApp || "Terminal";
const available = voiceService.isAvailable;
const zoomMin = cmdCfg.zoomMin ?? 0.92;
const zoomMax = cmdCfg.zoomMax ?? 1.08;

// ── State ──
let uiState = "idle"; // idle | recording | transcribing | launching
let recordTimer = null;
let recordStartTime = 0;

// ── Sizes ──
const outerSize = isNarrow ? 170 : 210;
const innerSize = isNarrow ? 120 : 150;
const coreSize = isNarrow ? 84 : 105;

// ── Section wrapper ──
const section = el("div", {
  position: "relative", zIndex: "2",
  marginTop: isNarrow ? "16px" : "24px",
  marginBottom: isNarrow ? "24px" : "40px",
  display: "flex", flexDirection: "column", alignItems: "center",
  animation: "jarvisCardFadeIn 0.5s ease-out 0.2s both",
});

// ── Button container (holds all rings + core) ──
const btnContainer = el("div", {
  position: "relative",
  width: outerSize + "px", height: outerSize + "px",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: available ? "pointer" : "default",
  touchAction: "none", userSelect: "none",
});
section.appendChild(btnContainer);

// ── Outer rotating ring ──
const outerRing = el("div", {
  position: "absolute",
  width: outerSize + "px", height: outerSize + "px",
  borderRadius: "50%",
  border: `2px dashed ${T.accent}33`,
  animation: "jarvisArcRotate 12s linear infinite",
  pointerEvents: "none",
});
btnContainer.appendChild(outerRing);

// ── Middle glow ring ──
const glowRing = el("div", {
  position: "absolute",
  width: innerSize + "px", height: innerSize + "px",
  borderRadius: "50%",
  border: `1px solid ${T.accent}22`,
  background: `radial-gradient(circle, ${T.accent}08 0%, transparent 70%)`,
  animation: "jarvisArcPulse 4s ease-in-out infinite",
  pointerEvents: "none",
});
btnContainer.appendChild(glowRing);

// ── Ripple element (hidden, triggered on record start) ──
const ripple = el("div", {
  position: "absolute",
  width: coreSize + "px", height: coreSize + "px",
  borderRadius: "50%",
  border: `2px solid ${T.accent}`,
  pointerEvents: "none",
  opacity: "0",
});
btnContainer.appendChild(ripple);

// ── Orbiting particles (larger radius) ──
for (let i = 0; i < 3; i++) {
  const orbit = el("div", {
    position: "absolute",
    top: "50%", left: "50%",
    width: "4px", height: "4px",
    marginTop: "-2px", marginLeft: "-2px",
    borderRadius: "50%",
    background: T.accent,
    boxShadow: `0 0 6px ${T.accent}, 0 0 10px ${T.accent}`,
    animation: `jarvisOrbitDotLarge ${3 + i}s linear infinite ${i * 1.2}s`,
    pointerEvents: "none", opacity: "0.7",
  });
  btnContainer.appendChild(orbit);
}

// ── Inner core circle ──
const core = el("div", {
  width: coreSize + "px", height: coreSize + "px",
  borderRadius: "50%",
  background: `radial-gradient(circle at 40% 35%, ${T.panelBg}, #050510)`,
  border: `2px solid ${T.accent}44`,
  display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center",
  position: "relative", zIndex: "2",
  transition: "border-color 0.4s ease, box-shadow 0.4s ease",
  boxShadow: `0 0 12px ${T.accent}20, inset 0 0 16px rgba(0,0,0,0.6)`,
  animation: "jarvisBreathing 3s ease-in-out infinite",
});
btnContainer.appendChild(core);

// ── "J" letter icon ──
const coreIcon = el("span", {
  fontSize: isNarrow ? "28px" : "36px",
  fontWeight: "800",
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  color: T.accent,
  letterSpacing: "1px",
  transition: "all 0.3s ease",
  lineHeight: "1",
  textShadow: `0 0 8px ${T.accent}66`,
}, "J");
core.appendChild(coreIcon);

// ── State text icon (for transcribing/launching — hidden by default) ──
const stateIcon = el("span", {
  fontSize: isNarrow ? "20px" : "24px",
  color: T.accent,
  lineHeight: "1",
  display: "none",
  transition: "all 0.3s ease",
});
core.appendChild(stateIcon);

// ── Timer display (hidden by default, inside core) ──
const timerEl = el("div", {
  fontSize: isNarrow ? "16px" : "20px", fontWeight: "700",
  fontFamily: "'SF Mono', 'Fira Code', monospace",
  color: T.accent, letterSpacing: "2px",
  display: "none",
  transition: "all 0.3s ease",
}, "00:00");
core.appendChild(timerEl);

// ── Status text below button ──
const statusText = el("div", {
  fontSize: isNarrow ? "9px" : "10px",
  fontWeight: "600", letterSpacing: "2px",
  textTransform: "uppercase",
  color: available ? T.textMuted : T.red,
  marginTop: isNarrow ? "16px" : "20px",
  textAlign: "center",
  transition: "color 0.3s ease",
}, available ? "Tap to speak to JARVIS" : "Voice Unavailable");
section.appendChild(statusText);

// ── Transcription preview (hidden) ──
const previewEl = el("div", {
  fontSize: "12px", color: T.text,
  background: T.panelBg, border: `1px solid ${T.panelBorder}`,
  borderRadius: "8px", padding: "10px 16px",
  marginTop: "12px", maxWidth: isNarrow ? "280px" : "400px",
  textAlign: "center", lineHeight: "1.5",
  display: "none", opacity: "0",
  transition: "opacity 0.3s ease",
  fontFamily: "'Inter', -apple-system, sans-serif",
});
section.appendChild(previewEl);

// ── Decorative line below ──
section.appendChild(el("div", {
  width: isNarrow ? "60%" : "30%",
  height: "1px",
  background: `linear-gradient(90deg, transparent, ${T.accent}44, transparent)`,
  marginTop: isNarrow ? "16px" : "20px",
}));

if (!available) return section;

// ═══════════════════════════════════════════
// ── State management ──
// ═══════════════════════════════════════════

function setUIState(newState) {
  uiState = newState;

  if (newState === "idle") {
    coreIcon.style.display = "inline";
    stateIcon.style.display = "none";
    timerEl.style.display = "none";
    core.style.borderColor = T.accent + "44";
    core.style.boxShadow = `0 0 12px ${T.accent}20, inset 0 0 16px rgba(0,0,0,0.6)`;
    core.style.animation = "jarvisBreathing 3s ease-in-out infinite";
    outerRing.style.animation = "jarvisArcRotate 12s linear infinite";
    outerRing.style.borderColor = T.accent + "33";
    glowRing.style.animation = "jarvisArcPulse 4s ease-in-out infinite";
    btnContainer.style.animation = "none";
    statusText.textContent = "Tap to speak to JARVIS";
    statusText.style.color = T.textMuted;
    previewEl.style.display = "none";
    previewEl.style.opacity = "0";

  } else if (newState === "recording") {
    coreIcon.style.display = "none";
    stateIcon.style.display = "none";
    timerEl.style.display = "block";
    timerEl.textContent = "00:00";
    core.style.borderColor = T.accent + "aa";
    core.style.boxShadow = `0 0 20px ${T.accent}50, 0 0 40px ${T.accent}20, inset 0 0 16px rgba(0,0,0,0.6)`;
    core.style.animation = "jarvisBreathing 3s ease-in-out infinite";
    outerRing.style.animation = "jarvisArcRotate 3s linear infinite";
    outerRing.style.borderColor = T.accent + "66";
    glowRing.style.animation = "jarvisRecordPulse 1.5s ease-in-out infinite";
    // Zoom wave on entire button — synced at 3s with core breathing
    btnContainer.style.setProperty("--jarvis-zoom-min", zoomMin);
    btnContainer.style.setProperty("--jarvis-zoom-max", zoomMax);
    btnContainer.style.animation = "jarvisRecordZoom 3s ease-in-out infinite";
    statusText.textContent = "Recording \u2014 Tap to Send";
    statusText.style.color = T.accent;
    previewEl.style.display = "none";
    previewEl.style.opacity = "0";
    triggerRipple();

  } else if (newState === "transcribing") {
    coreIcon.style.display = "none";
    stateIcon.textContent = "\u231B";
    stateIcon.style.display = "block";
    stateIcon.style.color = T.accent;
    timerEl.style.display = "none";
    core.style.borderColor = T.accent + "66";
    core.style.boxShadow = `0 0 16px ${T.accent}30, inset 0 0 16px rgba(0,0,0,0.6)`;
    core.style.animation = "jarvisBreathing 2s ease-in-out infinite";
    outerRing.style.animation = "jarvisArcRotate 6s linear infinite";
    outerRing.style.borderColor = T.accent + "44";
    glowRing.style.animation = "jarvisArcPulse 2s ease-in-out infinite";
    btnContainer.style.animation = "none";
    statusText.textContent = "Processing Voice...";
    statusText.style.color = T.purple;

  } else if (newState === "launching") {
    coreIcon.style.display = "none";
    stateIcon.textContent = "\u2713";
    stateIcon.style.display = "block";
    stateIcon.style.color = T.green;
    stateIcon.style.fontSize = isNarrow ? "26px" : "32px";
    timerEl.style.display = "none";
    core.style.borderColor = T.green + "66";
    core.style.boxShadow = `0 0 24px ${T.green}40, 0 0 48px ${T.green}15, inset 0 0 16px rgba(0,0,0,0.6)`;
    core.style.animation = "none";
    outerRing.style.animation = "jarvisArcRotate 2s linear infinite";
    outerRing.style.borderColor = T.green + "44";
    glowRing.style.animation = "none";
    glowRing.style.boxShadow = `0 0 30px ${T.green}30`;
    btnContainer.style.animation = "none";
    statusText.textContent = "Launching Claude...";
    statusText.style.color = T.green;
    setTimeout(() => { if (uiState === "launching") setUIState("idle"); }, 2500);
  }
}

function triggerRipple() {
  ripple.style.animation = "none";
  ripple.offsetHeight; // force reflow
  ripple.style.opacity = "0.6";
  ripple.style.animation = "jarvisRipple 0.8s ease-out forwards";
}

// ── Recording timer ──
function startRecordTimer() {
  recordStartTime = Date.now();
  recordTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const s = String(elapsed % 60).padStart(2, "0");
    timerEl.textContent = `${m}:${s}`;
  }, 1000);
  ctx.intervals.push(recordTimer);
}

function stopRecordTimer() {
  if (recordTimer) {
    clearInterval(recordTimer);
    recordTimer = null;
  }
}

// ── Voice service state sync ──
voiceService.onStateChange((vsState) => {
  if (vsState === "idle" && uiState === "recording") {
    stopRecordTimer();
    setUIState("idle");
  }
});

// ── Cancel recording ──
function cancelRecording() {
  stopRecordTimer();
  voiceService.cancelRecording();
  setUIState("idle");
  new Notice("Voice command cancelled.");
}

// ── Escape key handler ──
function handleKeyDown(e) {
  if (e.key === "Escape" && uiState === "recording") {
    e.preventDefault();
    cancelRecording();
  }
}
document.addEventListener("keydown", handleKeyDown);
ctx.cleanups.push(() => document.removeEventListener("keydown", handleKeyDown));

// ── Core actions ──
function beginRecording() {
  voiceService.startRecording()
    .then(() => {
      setUIState("recording");
      startRecordTimer();
    })
    .catch(err => {
      new Notice("Recording failed: " + err.message, 5000);
      setUIState("idle");
    });
}

function finishRecording() {
  stopRecordTimer();
  setUIState("transcribing");

  voiceService.stopAndTranscribe()
    .then(text => {
      if (!text || !text.trim()) {
        new Notice("No speech detected. Try again.");
        setUIState("idle");
        return;
      }

      const trimmed = text.trim();
      previewEl.textContent = trimmed.length > 150 ? trimmed.slice(0, 150) + "\u2026" : trimmed;
      previewEl.style.display = "block";
      setTimeout(() => { previewEl.style.opacity = "1"; }, 10);

      setUIState("launching");

      setTimeout(() => {
        launchClaude(trimmed);
        setTimeout(() => {
          previewEl.style.opacity = "0";
          setTimeout(() => { previewEl.style.display = "none"; }, 300);
        }, 3000);
      }, 500);
    })
    .catch(err => {
      new Notice("Transcription failed: " + err.message, 5000);
      setUIState("idle");
    });
}

function launchClaude(text) {
  const vaultPath = app.vault.adapter.basePath;
  // Write text to a temp file, then have the terminal command read from it
  const tmpFile = nodePath.join(require("os").tmpdir(), "jarvis-voice-cmd.txt");
  nodeFs.writeFileSync(tmpFile, text);
  // Shell command: cd to vault, read the temp file into claude, then clean up
  const shellCmd = `cd '${vaultPath.replace(/'/g, "'\\''")}' && claude "$(cat '${tmpFile}')" ; rm -f '${tmpFile}'`;
  const asEscaped = shellCmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  require("child_process").execFile("osascript", [
    "-e", `tell application "${terminalApp}"`,
    "-e", `do script "${asEscaped}"`,
    "-e", "activate",
    "-e", "end tell",
  ], (err) => {
    if (err) new Notice("Failed to open terminal: " + err.message, 5000);
  });
  new Notice("Launching Claude with voice command...");
}

// ═══════════════════════════════════════════
// ── Pointer events (tap + long-press) ──
// ═══════════════════════════════════════════

let isLongPress = false;
let longPressTimer = null;

btnContainer.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (uiState === "transcribing" || uiState === "launching") return;

  isLongPress = false;
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    isLongPress = true;
    if (voiceService.getState() === "idle" && uiState === "idle") {
      beginRecording();
    }
  }, 300);
});

btnContainer.addEventListener("pointerup", (e) => {
  e.preventDefault();
  if (uiState === "transcribing" || uiState === "launching") return;

  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
    if (voiceService.getState() === "idle" && uiState === "idle") {
      beginRecording();
    } else if (voiceService.getState() === "recording" && uiState === "recording") {
      finishRecording();
    }
  } else if (isLongPress) {
    isLongPress = false;
    if (voiceService.getState() === "recording" && uiState === "recording") {
      finishRecording();
    }
  }
});

btnContainer.addEventListener("pointerleave", () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  if (isLongPress && voiceService.getState() === "recording") {
    isLongPress = false;
    finishRecording();
  }
  isLongPress = false;
});

// ── Hover effects ──
btnContainer.addEventListener("mouseenter", () => {
  if (uiState === "idle") {
    core.style.borderColor = T.accent + "77";
    core.style.boxShadow = `0 0 20px ${T.accent}35, 0 0 40px ${T.accent}15, inset 0 0 16px rgba(0,0,0,0.6)`;
  }
});
btnContainer.addEventListener("mouseleave", () => {
  if (uiState === "idle") {
    core.style.borderColor = T.accent + "44";
    core.style.boxShadow = `0 0 12px ${T.accent}20, inset 0 0 16px rgba(0,0,0,0.6)`;
  }
});

// ── Safety-net cleanup ──
const cleanupId = setInterval(() => {
  if (!document.contains(section)) {
    stopRecordTimer();
    document.removeEventListener("keydown", handleKeyDown);
    if (voiceService.getState() === "recording") voiceService.cancelRecording();
    clearInterval(cleanupId);
  }
}, 1000);
ctx.intervals.push(cleanupId);

return section;
