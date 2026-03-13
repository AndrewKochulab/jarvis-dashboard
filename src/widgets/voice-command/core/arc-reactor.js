// Voice Command — Arc Reactor button
// Animated circular button with rings, particles, core, timer, status text.
// Returns UI elements and visual state updater.

const { el, T, config, isNarrow } = ctx;
const animationsEnabled = ctx.animationsEnabled !== false;
const animOrNone = (s) => animationsEnabled ? s : "none";
const cmdCfg = config.widgets?.voiceCommand || {};
const zoomMin = cmdCfg.zoomMin ?? 0.92;
const zoomMax = cmdCfg.zoomMax ?? 1.08;

function createArcReactor(options) {
  const { available = true } = options || {};

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

  // ── Button container ──
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
    animation: animOrNone("jarvisArcRotate 12s linear infinite"),
    pointerEvents: "none",
    willChange: animationsEnabled ? "transform" : "auto",
    transform: "translateZ(0)",
  });
  btnContainer.appendChild(outerRing);

  // ── Middle glow ring ──
  const glowRing = el("div", {
    position: "absolute",
    width: innerSize + "px", height: innerSize + "px",
    borderRadius: "50%",
    border: `1px solid ${T.accent}22`,
    background: `radial-gradient(circle, ${T.accent}08 0%, transparent 70%)`,
    boxShadow: `0 0 30px rgba(0,212,255,0.6), 0 0 60px rgba(0,212,255,0.3), 0 0 90px rgba(0,212,255,0.1)`,
    animation: animOrNone("jarvisArcPulse 4s ease-in-out infinite"),
    pointerEvents: "none",
    willChange: animationsEnabled ? "opacity" : "auto",
  });
  btnContainer.appendChild(glowRing);

  // ── Ripple element ──
  const ripple = el("div", {
    position: "absolute",
    width: coreSize + "px", height: coreSize + "px",
    borderRadius: "50%",
    border: `2px solid ${T.accent}`,
    pointerEvents: "none",
    opacity: "0",
  });
  btnContainer.appendChild(ripple);

  // ── Orbiting particles ──
  for (let i = 0; i < 3; i++) {
    btnContainer.appendChild(el("div", {
      position: "absolute",
      top: "50%", left: "50%",
      width: "4px", height: "4px",
      marginTop: "-2px", marginLeft: "-2px",
      borderRadius: "50%",
      background: T.accent,
      boxShadow: `0 0 6px ${T.accent}, 0 0 10px ${T.accent}`,
      animation: animationsEnabled ? `jarvisOrbitDotLarge ${3 + i}s linear infinite ${i * 1.2}s` : "none",
      pointerEvents: "none", opacity: "0.7",
      willChange: animationsEnabled ? "transform" : "auto",
    }));
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
    animation: animOrNone("jarvisBreathing 3s ease-in-out infinite"),
    willChange: animationsEnabled ? "transform" : "auto",
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

  // ── State text icon ──
  const stateIcon = el("span", {
    fontSize: isNarrow ? "20px" : "24px",
    color: T.accent,
    lineHeight: "1",
    display: "none",
    transition: "all 0.3s ease",
  });
  core.appendChild(stateIcon);

  // ── Timer display ──
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

  // ── Transcription preview ──
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

  // ── Timer management ──
  let recordTimer = null;
  let recordStartTime = 0;

  function startTimer() {
    recordStartTime = Date.now();
    recordTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
      const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const s = String(elapsed % 60).padStart(2, "0");
      timerEl.textContent = `${m}:${s}`;
    }, 1000);
    if (ctx.intervals) ctx.intervals.push(recordTimer);
  }

  function stopTimer() {
    if (recordTimer) {
      clearInterval(recordTimer);
      recordTimer = null;
    }
  }

  function triggerRipple() {
    ripple.style.animation = "none";
    ripple.offsetHeight;
    ripple.style.opacity = "0.6";
    ripple.style.animation = "jarvisRipple 0.8s ease-out forwards";
  }

  // ── Visual state mapping ──
  function updateVisualState(uiState, hasHistory) {
    if (uiState === "idle") {
      coreIcon.style.display = "inline";
      stateIcon.style.display = "none";
      timerEl.style.display = "none";
      core.style.borderColor = T.accent + "44";
      core.style.boxShadow = `0 0 12px ${T.accent}20, inset 0 0 16px rgba(0,0,0,0.6)`;
      core.style.animation = animOrNone("jarvisBreathing 3s ease-in-out infinite");
      outerRing.style.animation = animOrNone("jarvisArcRotate 12s linear infinite");
      outerRing.style.borderColor = T.accent + "33";
      glowRing.style.animation = animOrNone("jarvisArcPulse 4s ease-in-out infinite");
      btnContainer.style.animation = "none";
      statusText.textContent = hasHistory ? "Speak your next message..." : "Tap to speak to JARVIS";
      statusText.style.color = hasHistory ? T.accent : T.textMuted;
      previewEl.style.display = "none";
      previewEl.style.opacity = "0";
    } else if (uiState === "recording") {
      coreIcon.style.display = "none";
      stateIcon.style.display = "none";
      timerEl.style.display = "block";
      timerEl.textContent = "00:00";
      core.style.borderColor = T.accent + "aa";
      core.style.boxShadow = `0 0 20px ${T.accent}50, 0 0 40px ${T.accent}20, inset 0 0 16px rgba(0,0,0,0.6)`;
      core.style.animation = animOrNone("jarvisBreathing 3s ease-in-out infinite");
      outerRing.style.animation = animOrNone("jarvisArcRotate 3s linear infinite");
      outerRing.style.borderColor = T.accent + "66";
      glowRing.style.animation = animOrNone("jarvisRecordPulse 1.5s ease-in-out infinite");
      btnContainer.style.setProperty("--jarvis-zoom-min", zoomMin);
      btnContainer.style.setProperty("--jarvis-zoom-max", zoomMax);
      btnContainer.style.animation = animOrNone("jarvisRecordZoom 3s ease-in-out infinite");
      statusText.textContent = "Recording \u2014 Tap to Send";
      statusText.style.color = T.accent;
      previewEl.style.display = "none";
      previewEl.style.opacity = "0";
      triggerRipple();
    } else if (uiState === "transcribing") {
      coreIcon.style.display = "none";
      stateIcon.textContent = "\u231B";
      stateIcon.style.display = "block";
      stateIcon.style.color = T.accent;
      timerEl.style.display = "none";
      core.style.borderColor = T.accent + "66";
      core.style.boxShadow = `0 0 16px ${T.accent}30, inset 0 0 16px rgba(0,0,0,0.6)`;
      core.style.animation = animOrNone("jarvisBreathing 2s ease-in-out infinite");
      outerRing.style.animation = animOrNone("jarvisArcRotate 6s linear infinite");
      outerRing.style.borderColor = T.accent + "44";
      glowRing.style.animation = animOrNone("jarvisArcPulse 2s ease-in-out infinite");
      btnContainer.style.animation = "none";
      statusText.textContent = "Processing Voice...";
      statusText.style.color = T.purple;
    } else if (uiState === "launching") {
      coreIcon.style.display = "none";
      stateIcon.textContent = "\u2713";
      stateIcon.style.display = "block";
      stateIcon.style.color = T.green;
      stateIcon.style.fontSize = isNarrow ? "26px" : "32px";
      timerEl.style.display = "none";
      core.style.borderColor = T.green + "66";
      core.style.boxShadow = `0 0 24px ${T.green}40, 0 0 48px ${T.green}15, inset 0 0 16px rgba(0,0,0,0.6)`;
      core.style.animation = "none";
      outerRing.style.animation = animOrNone("jarvisArcRotate 2s linear infinite");
      outerRing.style.borderColor = T.green + "44";
      glowRing.style.animation = "none";
      glowRing.style.boxShadow = `0 0 30px ${T.green}30`;
      btnContainer.style.animation = "none";
      statusText.textContent = "Launching JARVIS...";
      statusText.style.color = T.green;
    } else if (uiState === "streaming") {
      coreIcon.style.display = "none";
      stateIcon.textContent = "\u25CF";
      stateIcon.style.display = "block";
      stateIcon.style.color = T.green;
      stateIcon.style.fontSize = isNarrow ? "20px" : "24px";
      stateIcon.style.animation = animOrNone("jarvisPulse 2s ease-in-out infinite");
      timerEl.style.display = "none";
      core.style.borderColor = T.green + "44";
      core.style.boxShadow = `0 0 16px ${T.green}30, inset 0 0 16px rgba(0,0,0,0.6)`;
      core.style.animation = animOrNone("jarvisBreathing 3s ease-in-out infinite");
      outerRing.style.animation = animOrNone("jarvisArcRotate 4s linear infinite");
      outerRing.style.borderColor = T.green + "44";
      glowRing.style.animation = animOrNone("jarvisArcPulse 3s ease-in-out infinite");
      btnContainer.style.animation = "none";
      statusText.textContent = "JARVIS is responding...";
      statusText.style.color = T.green;
    } else if (uiState === "done") {
      coreIcon.style.display = "inline";
      stateIcon.style.display = "none";
      stateIcon.style.animation = "";
      timerEl.style.display = "none";
      core.style.borderColor = T.accent + "44";
      core.style.boxShadow = `0 0 12px ${T.accent}20, inset 0 0 16px rgba(0,0,0,0.6)`;
      core.style.animation = animOrNone("jarvisBreathing 3s ease-in-out infinite");
      outerRing.style.animation = animOrNone("jarvisArcRotate 12s linear infinite");
      outerRing.style.borderColor = T.accent + "33";
      glowRing.style.animation = animOrNone("jarvisArcPulse 4s ease-in-out infinite");
      btnContainer.style.animation = "none";
      statusText.textContent = hasHistory ? "Tap to continue the conversation" : "Tap to speak to JARVIS";
      statusText.style.color = hasHistory ? T.accent : T.textMuted;
    } else if (uiState === "error") {
      coreIcon.style.display = "inline";
      stateIcon.style.display = "none";
      stateIcon.style.animation = "";
      timerEl.style.display = "none";
      core.style.borderColor = T.red + "44";
      core.style.boxShadow = `0 0 16px ${T.red}20, inset 0 0 16px rgba(0,0,0,0.6)`;
      core.style.animation = animOrNone("jarvisBreathing 3s ease-in-out infinite");
      outerRing.style.animation = animOrNone("jarvisArcRotate 12s linear infinite");
      outerRing.style.borderColor = T.red + "33";
      glowRing.style.animation = animOrNone("jarvisArcPulse 4s ease-in-out infinite");
      btnContainer.style.animation = "none";
      statusText.textContent = "Error \u2014 Tap to retry";
      statusText.style.color = T.red;
    }
  }

  // ── Hover effects ──
  btnContainer.addEventListener("mouseenter", () => {
    const state = "idle"; // will be overridden by orchestrator
    core.style.borderColor = T.accent + "77";
    core.style.boxShadow = `0 0 20px ${T.accent}35, 0 0 40px ${T.accent}15, inset 0 0 16px rgba(0,0,0,0.6)`;
  });
  btnContainer.addEventListener("mouseleave", () => {
    core.style.borderColor = T.accent + "44";
    core.style.boxShadow = `0 0 12px ${T.accent}20, inset 0 0 16px rgba(0,0,0,0.6)`;
  });

  // ── Pointer action callback ──
  let _onPointerAction = null;
  function onPointerAction(callback) { _onPointerAction = callback; }
  function firePointerAction(action) {
    if (_onPointerAction) _onPointerAction(action);
  }

  function setAvailable(bool) {
    btnContainer.style.cursor = bool ? "pointer" : "default";
    statusText.textContent = bool ? "Tap to speak to JARVIS" : "Voice Unavailable";
    statusText.style.color = bool ? T.textMuted : T.red;
  }

  function setStatusText(text, color) {
    statusText.textContent = text;
    if (color) statusText.style.color = color;
  }

  function showPreview(text) {
    previewEl.textContent = text.length > 150 ? text.slice(0, 150) + "\u2026" : text;
    previewEl.style.display = "block";
    setTimeout(() => { previewEl.style.opacity = "1"; }, 10);
  }

  function hidePreview() {
    previewEl.style.opacity = "0";
    setTimeout(() => { previewEl.style.display = "none"; }, 300);
  }

  return {
    updateVisualState,
    startTimer,
    stopTimer,
    triggerRipple,
    setStatusText,
    setAvailable,
    showPreview,
    hidePreview,
    onPointerAction,
    firePointerAction,
    el: { section, btnContainer, core, coreIcon, stateIcon, timerEl, statusText, previewEl },
  };
}

return { createArcReactor };
