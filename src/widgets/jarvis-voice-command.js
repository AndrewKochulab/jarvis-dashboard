// JARVIS Voice Command Widget
// Arc reactor-style circular button — record voice, transcribe, stream Claude response in-panel
// Returns: HTMLElement

const { el, T, config, isNarrow, voiceService, ttsService, nodeFs, nodePath } = ctx;
const cmdCfg = config.widgets?.voiceCommand || {};
if (cmdCfg.enabled === false) return el("div", {});

const available = voiceService.isAvailable;
const zoomMin = cmdCfg.zoomMin ?? 0.92;
const zoomMax = cmdCfg.zoomMax ?? 1.08;

// ── Terminal config ──
const termCfg = cmdCfg.terminal || {};
const termProjectPath = termCfg.projectPath || null;
const showCommand = termCfg.showCommand !== false;

// ── Resolve claude binary path (same pattern as whisper-cli in voice-service.js) ──
const claudeSearchPaths = [
  nodePath.join(require("os").homedir(), ".local", "bin", "claude"),
  "/usr/local/bin/claude",
  "/opt/homebrew/bin/claude",
];
let claudePath = termCfg.claudePath || null;
if (!claudePath) {
  for (const p of claudeSearchPaths) {
    if (nodeFs.existsSync(p)) { claudePath = p; break; }
  }
}

// ── Process state ──
let claudeProcess = null;
let fullBuffer = "";

// ── Session continuity state ──
let currentSessionId = null;
let conversationHistory = [];
let preSpawnJsonlSet = null;

// ── Utilities ──
function expandPath(p) {
  if (!p) return null;
  if (p.startsWith("~/") || p === "~") {
    return p.replace("~", require("os").homedir());
  }
  return p;
}

function stripAnsi(str) {
  return str.replace(
    /[\x1B\x9B][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g,
    ""
  );
}

function stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/`[^`]+`/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function killClaudeProcess() {
  if (claudeProcess) {
    try { claudeProcess.kill("SIGTERM"); } catch (e) {}
    claudeProcess = null;
  }
}

// ── Session utilities ──
function getProjectSessionDir() {
  const cwd = expandPath(termProjectPath) || app.vault.adapter.basePath;
  return nodePath.join(require("os").homedir(), ".claude", "projects",
    cwd.replace(/[^a-zA-Z0-9-]/g, "-"));
}

function snapshotJsonlFiles() {
  try {
    const dir = getProjectSessionDir();
    if (!nodeFs.existsSync(dir)) return new Set();
    return new Set(nodeFs.readdirSync(dir).filter(f => f.endsWith(".jsonl")));
  } catch { return new Set(); }
}

function detectNewSession(beforeSet) {
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
}

function buildClaudeArgs(text) {
  const args = [];
  if (currentSessionId) args.push("--resume", currentSessionId);
  args.push("-p", "--output-format", "stream-json", "--include-partial-messages", text);
  return args;
}

// ── TTS prefs persistence (independent of terminal sessions) ──
function readTtsPrefs() {
  try {
    const p = nodePath.join(getProjectSessionDir(), "jarvis-tts-prefs.json");
    return JSON.parse(nodeFs.readFileSync(p, "utf8"));
  } catch { return { muted: false }; }
}

function writeTtsPrefs(prefs) {
  try {
    const dir = getProjectSessionDir();
    if (!nodeFs.existsSync(dir)) nodeFs.mkdirSync(dir, { recursive: true });
    nodeFs.writeFileSync(
      nodePath.join(dir, "jarvis-tts-prefs.json"),
      JSON.stringify(prefs, null, 2)
    );
  } catch {}
}

// ── SVG icons for TTS mute button ──
const SVG_SPEAKER_ON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
const SVG_SPEAKER_OFF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';

// ── Voice state persistence ──
function readVoiceState() {
  try {
    const p = nodePath.join(getProjectSessionDir(), "jarvis-voice-state.json");
    return JSON.parse(nodeFs.readFileSync(p, "utf8"));
  } catch { return null; }
}

function writeVoiceState() {
  try {
    const dir = getProjectSessionDir();
    if (!nodeFs.existsSync(dir)) nodeFs.mkdirSync(dir, { recursive: true });
    nodeFs.writeFileSync(nodePath.join(dir, "jarvis-voice-state.json"), JSON.stringify({
      currentSessionId,
      conversationHistory,
      fullBuffer,
    }, null, 2));
  } catch {}
}

// ── Restore persisted session state ──
const _saved = readVoiceState();
if (_saved) {
  currentSessionId = _saved.currentSessionId || null;
  conversationHistory = _saved.conversationHistory || [];
  fullBuffer = _saved.fullBuffer || "";
}

// ── State ──
let uiState = "idle"; // idle | recording | transcribing | launching | streaming | done | error
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

// ═══════════════════════════════════════════
// ── Session indicator bar (hidden by default) ──
// ═══════════════════════════════════════════

const sessionDot = el("span", {
  display: "inline-block",
  width: "6px", height: "6px",
  borderRadius: "50%",
  background: T.green,
  flexShrink: "0",
});

const sessionLabel = el("span", {
  fontSize: "10px", fontWeight: "700",
  letterSpacing: "1.5px", textTransform: "uppercase",
  color: T.textMuted,
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
}, "SESSION");

const sessionIdLabel = el("span", {
  fontSize: "10px", fontWeight: "600",
  letterSpacing: "1px",
  color: T.accent,
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
});

const resumeBtn = el("span", {
  fontSize: "10px", fontWeight: "600",
  letterSpacing: "1px",
  color: T.green,
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  padding: "3px 10px",
  borderRadius: "6px",
  border: `1px solid ${T.green}44`,
  cursor: "pointer",
  transition: "all 0.2s ease",
}, "Resume");

const newSessionBtn = el("span", {
  fontSize: "10px", fontWeight: "600",
  letterSpacing: "1px",
  color: T.textMuted,
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  padding: "3px 10px",
  borderRadius: "6px",
  border: `1px solid ${T.panelBorder}`,
  cursor: "pointer",
  transition: "all 0.2s ease",
}, "New Session");

const sessionBar = el("div", {
  display: "none",
  alignItems: "center",
  gap: "6px",
  padding: "8px 14px",
  marginTop: "12px",
  background: T.panelBg,
  border: `1px solid ${T.panelBorder}`,
  borderRadius: "8px",
  maxWidth: isNarrow ? "100%" : "600px",
  width: "100%",
});
sessionBar.appendChild(sessionDot);
sessionBar.appendChild(sessionLabel);
sessionBar.appendChild(sessionIdLabel);
sessionBar.appendChild(el("div", { flex: "1" }));
sessionBar.appendChild(resumeBtn);
sessionBar.appendChild(newSessionBtn);
section.appendChild(sessionBar);

// ═══════════════════════════════════════════
// ── Terminal Panel (hidden by default) ──
// ═══════════════════════════════════════════

const terminalPanel = el("div", {
  display: "none",
  marginTop: "16px",
  width: "100%",
  maxWidth: isNarrow ? "100%" : "600px",
  background: T.panelBg,
  border: `1px solid ${T.panelBorder}`,
  borderRadius: "12px",
  overflow: "hidden",
});
section.appendChild(terminalPanel);

// ── Terminal header bar ──
const terminalHeader = el("div", {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: isNarrow ? "8px 12px" : "10px 16px",
  background: "rgba(0,0,0,0.3)",
  borderBottom: `1px solid ${T.panelBorder}`,
});
terminalPanel.appendChild(terminalHeader);

// Close button [✕]
const closeBtn = el("span", {
  fontSize: "14px",
  color: T.textMuted,
  cursor: "pointer",
  padding: "2px 6px",
  borderRadius: "4px",
  transition: "all 0.2s ease",
  lineHeight: "1",
}, "\u2715");
terminalHeader.appendChild(closeBtn);

closeBtn.addEventListener("mouseenter", () => {
  closeBtn.style.color = T.red;
  closeBtn.style.background = "rgba(231,76,60,0.15)";
});
closeBtn.addEventListener("mouseleave", () => {
  closeBtn.style.color = T.textMuted;
  closeBtn.style.background = "transparent";
});

// Title label
terminalHeader.appendChild(el("span", {
  fontSize: "11px",
  fontWeight: "700",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: T.textMuted,
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
}, "JARVIS OUTPUT"));

// Spacer
terminalHeader.appendChild(el("div", { flex: "1" }));

// Status badge [● claude]
const badgeDot = el("span", {
  display: "inline-block",
  width: "6px", height: "6px",
  borderRadius: "50%",
  background: T.textMuted,
  marginRight: "6px",
  transition: "background 0.3s ease",
});

const badgeLabel = el("span", {}, "claude");

const statusBadge = el("span", {
  display: "inline-flex",
  alignItems: "center",
  fontSize: "10px",
  fontWeight: "600",
  letterSpacing: "1px",
  color: T.textMuted,
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  padding: "2px 8px",
  borderRadius: "8px",
  background: "rgba(0,0,0,0.3)",
  marginRight: "8px",
});
statusBadge.appendChild(badgeDot);
statusBadge.appendChild(badgeLabel);
terminalHeader.appendChild(statusBadge);

function updateBadgeState(state) {
  if (state === "running") {
    badgeDot.style.background = T.green;
    badgeDot.style.animation = "jarvisPulse 2s ease-in-out infinite";
    badgeLabel.textContent = "claude";
    statusBadge.style.color = T.green;
  } else if (state === "success") {
    badgeDot.style.background = T.green;
    badgeDot.style.animation = "none";
    badgeLabel.textContent = "\u2713 claude";
    statusBadge.style.color = T.green;
  } else if (state === "error") {
    badgeDot.style.background = T.red;
    badgeDot.style.animation = "none";
    badgeLabel.textContent = "\u2717 claude";
    statusBadge.style.color = T.red;
  } else {
    badgeDot.style.background = T.textMuted;
    badgeDot.style.animation = "none";
    badgeLabel.textContent = "claude";
    statusBadge.style.color = T.textMuted;
  }
}

// Mute button — SVG speaker icon, TTS toggle, hidden when TTS disabled
const ttsEnabled = ttsService && ttsService.isEnabled;
const muteBtn = el("span", {
  cursor: "pointer",
  padding: "4px 8px",
  borderRadius: "6px",
  transition: "all 0.2s ease",
  display: ttsEnabled ? "inline-flex" : "none",
  alignItems: "center",
  justifyContent: "center",
  color: T.accent,
  marginRight: "4px",
});
muteBtn.innerHTML = SVG_SPEAKER_ON;
terminalHeader.appendChild(muteBtn);

// Restore persisted mute state
if (ttsEnabled) {
  const ttsPrefs = readTtsPrefs();
  if (ttsPrefs.muted) {
    ttsService.mute();
    muteBtn.innerHTML = SVG_SPEAKER_OFF;
    muteBtn.style.color = T.textMuted;
  }
}

muteBtn.addEventListener("click", () => {
  if (!ttsService) return;
  if (ttsService.isMuted) {
    ttsService.unmute();
    muteBtn.innerHTML = SVG_SPEAKER_ON;
    muteBtn.style.color = T.accent;
  } else {
    ttsService.mute();
    muteBtn.innerHTML = SVG_SPEAKER_OFF;
    muteBtn.style.color = T.textMuted;
  }
  writeTtsPrefs({ muted: ttsService.isMuted });
});

muteBtn.addEventListener("mouseenter", () => {
  muteBtn.style.background = "rgba(0,212,255,0.1)";
});
muteBtn.addEventListener("mouseleave", () => {
  muteBtn.style.background = "transparent";
});

// Speaking pulse indicator — check every 500ms
if (ttsEnabled) {
  const speakPulseCheck = setInterval(() => {
    if (!ttsService) return;
    if (ttsService.isSpeaking && !ttsService.isMuted) {
      muteBtn.style.animation = "jarvisPulse 2s ease-in-out infinite";
    } else if (muteBtn.style.animation) {
      muteBtn.style.animation = "";
    }
  }, 500);
  ctx.intervals.push(speakPulseCheck);
}

// Copy button [Copy]
const copyBtnLabel = el("span", {}, "Copy");
const copyBtn = el("span", {
  fontSize: "10px",
  fontWeight: "600",
  letterSpacing: "1px",
  color: T.accent,
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  padding: "4px 10px",
  borderRadius: "6px",
  border: `1px solid ${T.accent}44`,
  cursor: "pointer",
  transition: "all 0.2s ease",
});
copyBtn.appendChild(copyBtnLabel);
terminalHeader.appendChild(copyBtn);

copyBtn.addEventListener("mouseenter", () => {
  copyBtn.style.background = "rgba(0,212,255,0.1)";
  copyBtn.style.borderColor = T.accent + "77";
});
copyBtn.addEventListener("mouseleave", () => {
  copyBtn.style.background = "transparent";
  copyBtn.style.borderColor = T.accent + "44";
});

copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(fullBuffer).then(() => {
    copyBtnLabel.textContent = "Copied!";
    copyBtn.style.borderColor = T.green + "66";
    copyBtn.style.color = T.green;
    setTimeout(() => {
      copyBtnLabel.textContent = "Copy";
      copyBtn.style.borderColor = T.accent + "44";
      copyBtn.style.color = T.accent;
    }, 1500);
  });
});

// ── Terminal output area ──
const terminalOutput = el("div", {
  padding: isNarrow ? "12px 14px" : "16px 20px",
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  fontSize: isNarrow ? "12px" : "14px",
  lineHeight: "2",
  color: T.text,
  maxHeight: "420px",
  overflowY: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});
terminalPanel.appendChild(terminalOutput);

// ── Panel animation functions ──
function openTerminalPanel() {
  terminalPanel.style.display = "block";
  terminalPanel.offsetHeight; // force reflow
  terminalPanel.style.animation = "jarvisTerminalSlideIn 280ms ease-out forwards";
}

function closeTerminalPanel() {
  terminalPanel.style.animation = "jarvisTerminalSlideOut 220ms ease-in forwards";
  setTimeout(() => {
    terminalPanel.style.display = "none";
    terminalPanel.style.animation = "";
    if (!currentSessionId) {
      terminalOutput.innerHTML = "";
      fullBuffer = "";
    }
    updateBadgeState("idle");
  }, 220);
}

// ── Session management functions ──
function appendTurnSeparator() {
  terminalOutput.appendChild(el("div", {
    height: "1px",
    borderTop: `1px dashed ${T.accent}33`,
    margin: "12px 0",
  }));
}

function updateSessionIndicator() {
  if (currentSessionId) {
    sessionBar.style.display = "flex";
    sessionIdLabel.textContent = ` #${currentSessionId.slice(0, 7)}`;
    sessionDot.style.animation = (uiState === "streaming" || uiState === "launching")
      ? "jarvisPulse 2s ease-in-out infinite" : "none";
    sessionDot.style.background = T.green;
  } else {
    sessionBar.style.display = "none";
  }
}

function clearSession() {
  if (ttsService) ttsService.stop();
  killClaudeProcess();
  currentSessionId = null;
  conversationHistory = [];
  preSpawnJsonlSet = null;
  fullBuffer = "";
  terminalOutput.innerHTML = "";
  updateBadgeState("idle");
  updateSessionIndicator();
  writeVoiceState();
  if (terminalPanel.style.display !== "none") closeTerminalPanel();
  setUIState("idle");
}

// ── Session bar event listeners ──
resumeBtn.addEventListener("mouseenter", () => {
  resumeBtn.style.background = `${T.green}15`;
  resumeBtn.style.borderColor = `${T.green}77`;
});
resumeBtn.addEventListener("mouseleave", () => {
  resumeBtn.style.background = "transparent";
  resumeBtn.style.borderColor = `${T.green}44`;
});
resumeBtn.addEventListener("click", () => {
  if (uiState === "streaming" || uiState === "recording" || uiState === "transcribing") return;
  if (terminalPanel.style.display === "none") openTerminalPanel();
  statusText.textContent = "Speak your next message...";
  statusText.style.color = T.accent;
});

newSessionBtn.addEventListener("mouseenter", () => {
  newSessionBtn.style.background = `${T.textMuted}15`;
  newSessionBtn.style.borderColor = `${T.textMuted}44`;
});
newSessionBtn.addEventListener("mouseleave", () => {
  newSessionBtn.style.background = "transparent";
  newSessionBtn.style.borderColor = T.panelBorder;
});
newSessionBtn.addEventListener("click", () => clearSession());

closeBtn.addEventListener("click", () => {
  if (ttsService) ttsService.stop();
  killClaudeProcess();
  closeTerminalPanel();
  if (uiState !== "idle") setUIState("idle");
});

// ── Decorative line below ──
section.appendChild(el("div", {
  width: isNarrow ? "60%" : "30%",
  height: "1px",
  background: `linear-gradient(90deg, transparent, ${T.accent}44, transparent)`,
  marginTop: isNarrow ? "16px" : "20px",
}));

if (!available) return section;

// ═══════════════════════════════════════════
// ── Restore persisted session UI ──
// ═══════════════════════════════════════════

if (currentSessionId && conversationHistory.length > 0) {
  for (let i = 0; i < conversationHistory.length; i++) {
    const turn = conversationHistory[i];
    if (turn.role === "user") {
      if (i > 0) appendTurnSeparator();
      const echoLine = el("div", { marginBottom: "4px" });
      echoLine.appendChild(el("span", { color: T.green }, "$ "));
      const trunc = turn.text.length > 80 ? turn.text.slice(0, 80) + "\u2026" : turn.text;
      if (showCommand) {
        const isResTurn = i > 0;
        const cmdText = isResTurn
          ? `claude --resume ${currentSessionId.slice(0, 7)}\u2026 ${trunc}`
          : `claude --print ${trunc}`;
        echoLine.appendChild(el("span", { color: T.textMuted }, cmdText));
      } else {
        echoLine.appendChild(el("span", { color: T.textMuted }, trunc));
      }
      terminalOutput.appendChild(echoLine);
      terminalOutput.appendChild(el("div", {
        height: "1px", background: `${T.accent}33`, margin: "8px 0",
      }));
    } else if (turn.role === "assistant") {
      terminalOutput.appendChild(el("div", { color: T.text, whiteSpace: "pre-wrap" }, turn.text));
      terminalOutput.appendChild(el("div", {
        color: T.accent, opacity: "0.6", marginTop: "8px",
        fontSize: isNarrow ? "10px" : "11px", letterSpacing: "1px",
      }, "[Process complete]"));
    }
  }
  openTerminalPanel();
  updateBadgeState("success");
  updateSessionIndicator();
  setUIState("done");
}

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
    statusText.textContent = currentSessionId ? "Speak your next message..." : "Tap to speak to JARVIS";
    statusText.style.color = currentSessionId ? T.accent : T.textMuted;
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

  } else if (newState === "streaming") {
    coreIcon.style.display = "none";
    stateIcon.textContent = "\u25b8";
    stateIcon.style.display = "block";
    stateIcon.style.color = T.green;
    stateIcon.style.fontSize = isNarrow ? "20px" : "24px";
    timerEl.style.display = "none";
    core.style.borderColor = T.green + "44";
    core.style.boxShadow = `0 0 16px ${T.green}30, inset 0 0 16px rgba(0,0,0,0.6)`;
    core.style.animation = "jarvisBreathing 3s ease-in-out infinite";
    outerRing.style.animation = "jarvisArcRotate 4s linear infinite";
    outerRing.style.borderColor = T.green + "44";
    glowRing.style.animation = "jarvisArcPulse 3s ease-in-out infinite";
    btnContainer.style.animation = "none";
    statusText.textContent = "Claude is responding...";
    statusText.style.color = T.green;
    updateBadgeState("running");

  } else if (newState === "done") {
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
    statusText.textContent = currentSessionId ? "Tap to continue the conversation" : "Tap to speak to JARVIS";
    statusText.style.color = currentSessionId ? T.accent : T.textMuted;
    updateBadgeState("success");

  } else if (newState === "error") {
    coreIcon.style.display = "inline";
    stateIcon.style.display = "none";
    timerEl.style.display = "none";
    core.style.borderColor = T.red + "44";
    core.style.boxShadow = `0 0 16px ${T.red}20, inset 0 0 16px rgba(0,0,0,0.6)`;
    core.style.animation = "jarvisBreathing 3s ease-in-out infinite";
    outerRing.style.animation = "jarvisArcRotate 12s linear infinite";
    outerRing.style.borderColor = T.red + "33";
    glowRing.style.animation = "jarvisArcPulse 4s ease-in-out infinite";
    btnContainer.style.animation = "none";
    statusText.textContent = "Error \u2014 Tap to retry";
    statusText.style.color = T.red;
    updateBadgeState("error");
  }

  updateSessionIndicator();
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
  if (e.key === "Escape") {
    if (uiState === "recording") {
      e.preventDefault();
      cancelRecording();
    } else if (uiState === "streaming") {
      e.preventDefault();
      if (ttsService) ttsService.stop();
      killClaudeProcess();
      closeTerminalPanel();
      setUIState("idle");
      updateSessionIndicator();
    }
  }
}
document.addEventListener("keydown", handleKeyDown);
ctx.cleanups.push(() => document.removeEventListener("keydown", handleKeyDown));

// ── Process cleanup ──
ctx.cleanups.push(() => {
  writeVoiceState();
  killClaudeProcess();
});

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
        conversationHistory.push({ role: "user", text: trimmed, timestamp: Date.now() });
        writeVoiceState();
        launchClaudeInPanel(trimmed);
        setTimeout(() => {
          previewEl.style.opacity = "0";
          setTimeout(() => { previewEl.style.display = "none"; }, 300);
        }, 2000);
      }, 400);
    })
    .catch(err => {
      new Notice("Transcription failed: " + err.message, 5000);
      setUIState("idle");
    });
}

// ═══════════════════════════════════════════
// ── Claude process spawning ──
// ═══════════════════════════════════════════

function launchClaudeInPanel(text) {
  if (!claudePath) {
    openTerminalPanel();
    terminalOutput.innerHTML = "";
    const errLine = el("div", { color: T.red, padding: "4px 0" },
      "[Error: claude CLI not found. Install it or set terminal.claudePath in config.json]");
    terminalOutput.appendChild(errLine);
    setUIState("error");
    new Notice("Claude CLI not found. Check installation or config.", 5000);
    return;
  }

  killClaudeProcess();

  const isResume = !!currentSessionId;
  const cwd = expandPath(termProjectPath) || app.vault.adapter.basePath;

  if (!isResume) {
    fullBuffer = "";
    terminalOutput.innerHTML = "";
    preSpawnJsonlSet = snapshotJsonlFiles();
  } else {
    appendTurnSeparator();
    fullBuffer += "\n\n---\n\n";
  }

  // Echo line (always visible — $ + user prompt, optionally with CLI command)
  const echoLine = el("div", { marginBottom: "4px" });
  echoLine.appendChild(el("span", { color: T.green }, "$ "));
  const echoTruncated = text.length > 80 ? text.slice(0, 80) + "\u2026" : text;
  if (showCommand) {
    const cmdText = isResume
      ? `claude --resume ${currentSessionId.slice(0, 7)}\u2026 ${echoTruncated}`
      : `claude --print ${echoTruncated}`;
    echoLine.appendChild(el("span", { color: T.textMuted }, cmdText));
  } else {
    echoLine.appendChild(el("span", { color: T.textMuted }, echoTruncated));
  }
  terminalOutput.appendChild(echoLine);

  // Separator
  terminalOutput.appendChild(el("div", {
    height: "1px",
    background: `${T.accent}33`,
    margin: "8px 0",
  }));

  // Output content container
  const outputContent = el("div", { color: T.text });
  terminalOutput.appendChild(outputContent);

  // Blinking cursor
  const cursorEl = el("span", {
    display: "inline-block",
    width: "8px",
    height: isNarrow ? "14px" : "16px",
    background: T.accent,
    animation: "jarvisCursorBlink 0.8s step-end infinite",
    verticalAlign: "middle",
    marginLeft: "2px",
  });
  terminalOutput.appendChild(cursorEl);

  // Open panel with animation
  openTerminalPanel();

  // Spawn claude process
  const { spawn } = require("child_process");
  const childEnv = Object.assign({}, process.env, { FORCE_COLOR: "0" });
  delete childEnv.CLAUDECODE;
  delete childEnv.CLAUDE_CODE_ENTRYPOINT;
  delete childEnv.CLAUDE_CODE_MAX_OUTPUT_TOKENS;

  claudeProcess = spawn(claudePath, buildClaudeArgs(text), {
    cwd: cwd,
    env: childEnv,
  });
  claudeProcess.stdin.end(); // close stdin so claude processes the prompt

  setUIState("streaming");

  // Parse newline-delimited JSON stream for real-time token streaming
  let lineBuf = "";
  let currentTurnBuffer = "";
  let speakBuffer = "";

  claudeProcess.stdout.on("data", (chunk) => {
    lineBuf += chunk.toString("utf8");
    const lines = lineBuf.split("\n");
    lineBuf = lines.pop(); // keep incomplete last line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line);
        if (evt.type === "stream_event" &&
            evt.event?.type === "content_block_delta" &&
            evt.event?.delta?.type === "text_delta") {
          const txt = evt.event.delta.text;
          fullBuffer += txt;
          currentTurnBuffer += txt;
          outputContent.appendChild(document.createTextNode(txt));
          terminalOutput.scrollTop = terminalOutput.scrollHeight;

          // TTS: extract complete sentences and enqueue
          if (ttsService && ttsService.isEnabled && !ttsService.isMuted) {
            speakBuffer += txt;
            const sentenceEnd = /^([\s\S]*?[.!?])(\s+|\n\n)/;
            let match;
            while ((match = sentenceEnd.exec(speakBuffer)) !== null) {
              const sentence = match[1].trim();
              if (sentence) ttsService.speak(stripMarkdown(sentence));
              speakBuffer = speakBuffer.slice(match[0].length);
            }
          }
        }
        // Fallback: extract from result event if no deltas were received
        if (evt.type === "result" && evt.result && !currentTurnBuffer) {
          fullBuffer += evt.result;
          currentTurnBuffer = evt.result;
          outputContent.appendChild(document.createTextNode(evt.result));
          terminalOutput.scrollTop = terminalOutput.scrollHeight;
        }
      } catch (e) {
        // skip malformed JSON lines
      }
    }
  });

  claudeProcess.stderr.on("data", (chunk) => {
    const cleaned = stripAnsi(chunk.toString("utf8"));
    fullBuffer += cleaned;
    const errSpan = el("span", { color: T.red }, cleaned);
    outputContent.appendChild(errSpan);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
  });

  claudeProcess.on("close", (code) => {
    claudeProcess = null;

    // Remove blinking cursor
    if (cursorEl.parentNode) cursorEl.parentNode.removeChild(cursorEl);

    // Add completion line
    const completeLine = el("div", {
      color: code === 0 ? T.accent : T.red,
      opacity: code === 0 ? "0.6" : "1",
      marginTop: "8px",
      fontSize: isNarrow ? "10px" : "11px",
      letterSpacing: "1px",
    }, code === 0 ? "[Process complete]" : `[Process exited with code ${code}]`);
    terminalOutput.appendChild(completeLine);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;

    // TTS: speak any remaining text that didn't end with punctuation
    if (ttsService && ttsService.isEnabled && !ttsService.isMuted && speakBuffer.trim()) {
      ttsService.speak(stripMarkdown(speakBuffer.trim()));
    }
    speakBuffer = "";

    // Session detection (first turn only, successful exit)
    if (code === 0 && preSpawnJsonlSet && !currentSessionId) {
      const detectedId = detectNewSession(preSpawnJsonlSet);
      if (detectedId) currentSessionId = detectedId;
      preSpawnJsonlSet = null;
    }

    // Track conversation history
    if (code === 0 && currentTurnBuffer) {
      conversationHistory.push({ role: "assistant", text: currentTurnBuffer, timestamp: Date.now() });
    }

    // Persist session state to disk
    writeVoiceState();

    setUIState(code === 0 ? "done" : "error");
  });

  claudeProcess.on("error", (err) => {
    claudeProcess = null;

    // Remove blinking cursor
    if (cursorEl.parentNode) cursorEl.parentNode.removeChild(cursorEl);

    const errLine = el("div", {
      color: T.red,
      marginTop: "8px",
    }, `[Failed to start: ${err.message}]`);
    terminalOutput.appendChild(errLine);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;

    setUIState("error");
    new Notice("Failed to spawn claude: " + err.message, 5000);
  });
}

// ═══════════════════════════════════════════
// ── Pointer events (tap + long-press) ──
// ═══════════════════════════════════════════

let isLongPress = false;
let longPressTimer = null;

btnContainer.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (uiState === "transcribing" || uiState === "launching" || uiState === "streaming") return;

  isLongPress = false;
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    isLongPress = true;
    if (voiceService.getState() === "idle" && (uiState === "idle" || uiState === "done" || uiState === "error")) {
      beginRecording();
    }
  }, 300);
});

btnContainer.addEventListener("pointerup", (e) => {
  e.preventDefault();
  if (uiState === "transcribing" || uiState === "launching" || uiState === "streaming") return;

  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
    if (voiceService.getState() === "idle" && (uiState === "idle" || uiState === "done" || uiState === "error")) {
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
  if (uiState === "idle" || uiState === "done" || uiState === "error") {
    core.style.borderColor = T.accent + "77";
    core.style.boxShadow = `0 0 20px ${T.accent}35, 0 0 40px ${T.accent}15, inset 0 0 16px rgba(0,0,0,0.6)`;
  }
});
btnContainer.addEventListener("mouseleave", () => {
  if (uiState === "idle" || uiState === "done" || uiState === "error") {
    core.style.borderColor = T.accent + "44";
    core.style.boxShadow = `0 0 12px ${T.accent}20, inset 0 0 16px rgba(0,0,0,0.6)`;
  }
});

// ── Safety-net cleanup ──
const cleanupId = setInterval(() => {
  if (!document.contains(section)) {
    stopRecordTimer();
    killClaudeProcess();
    document.removeEventListener("keydown", handleKeyDown);
    if (voiceService.getState() === "recording") voiceService.cancelRecording();
    clearInterval(cleanupId);
  }
}, 1000);
ctx.intervals.push(cleanupId);

return section;
