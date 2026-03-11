// JARVIS Voice Command Widget — Mobile
// Arc reactor-style button with text input, terminal panel, and WebSocket communication.
// Connects to the companion server for all processing (whisper, claude, TTS).
// Returns: HTMLElement

const { el, T, config, isNarrow, networkClient, markdownRenderer } = ctx;
const cmdCfg = config.widgets?.voiceCommand || {};
const networkCfg = config.network || {};
if (cmdCfg.enabled === false) return el("div", {});

// Guard against duplicate renders
if (ctx._mobileVoiceActive) return el("div", {});
ctx._mobileVoiceActive = true;
if (ctx.cleanups) ctx.cleanups.push(() => { ctx._mobileVoiceActive = false; });

const zoomMin = cmdCfg.zoomMin ?? 0.92;
const zoomMax = cmdCfg.zoomMax ?? 1.08;

// ── SVG icons ──
const SVG_SPEAKER_ON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
const SVG_SPEAKER_OFF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
const SVG_SEND = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

// ═══════════════════════════════════════════
// ── MobileRecorder ──
// ═══════════════════════════════════════════

class MobileRecorder {
  constructor() {
    this._stream = null;
    this._recorder = null;
    this._recording = false;
    this._format = "mp4";
  }

  get isRecording() { return this._recording; }
  get format() { return this._format; }

  async start() {
    this._stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
    });

    // iOS WKWebView: audio/mp4 only. Desktop: prefer webm/opus
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/mp4";
    this._format = mimeType.includes("mp4") ? "mp4" : "webm";

    this._recorder = new MediaRecorder(this._stream, { mimeType });
    this._recorder.ondataavailable = (e) => {
      if (e.data.size > 0 && networkClient?.isConnected) {
        e.data.arrayBuffer().then((buf) => {
          networkClient.sendBinary(new Uint8Array(buf));
        });
      }
    };

    // Signal server: audio stream starting (include sessionId for resumption)
    networkClient.sendAudioStart(this._format, 44100, currentSessionId);

    // Send chunks every 250ms for real-time streaming
    this._recorder.start(250);
    this._recording = true;
  }

  stop() {
    if (this._recorder && this._recorder.state !== "inactive") {
      this._recorder.stop();
    }
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
    this._recording = false;
    // Signal server: audio stream ended
    networkClient.sendAudioEnd();
  }

  cancel() {
    this._recording = false;
    if (this._recorder && this._recorder.state !== "inactive") {
      try { this._recorder.stop(); } catch {}
    }
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
    networkClient.sendCancel();
  }
}

// ═══════════════════════════════════════════
// ── MobileTTS (local speechSynthesis) ──
// ═══════════════════════════════════════════

class MobileTTS {
  constructor() {
    this._muted = false;
    this._queue = [];
    this._speaking = false;
  }

  speak(text, lang) {
    if (this._muted || !window.speechSynthesis) return;
    const clean = text.trim();
    if (!clean) return;
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.1;
    if (lang) utterance.lang = lang;
    utterance.onend = () => this._next();
    utterance.onerror = () => this._next();
    this._queue.push(utterance);
    if (!this._speaking) this._next();
  }

  _next() {
    if (this._queue.length === 0) { this._speaking = false; return; }
    this._speaking = true;
    window.speechSynthesis.speak(this._queue.shift());
  }

  stop() {
    this._queue = [];
    this._speaking = false;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  toggleMute() {
    this._muted = !this._muted;
    if (this._muted) this.stop();
    return this._muted;
  }

  get isMuted() { return this._muted; }
  get isSpeaking() { return this._speaking; }
}

// ═══════════════════════════════════════════
// ── AudioPlayer (for server TTS mode) ──
// ═══════════════════════════════════════════

class AudioPlayer {
  constructor(sampleRate = 22050) {
    this._ctx = null;
    this._queue = [];
    this._playing = false;
    this._sampleRate = sampleRate;
    this._muted = false;
  }

  _ensureContext() {
    if (!this._ctx) {
      this._ctx = new AudioContext({ sampleRate: this._sampleRate });
    }
    // Resume if suspended (iOS background handling)
    if (this._ctx.state === "suspended") {
      this._ctx.resume().catch(() => {});
    }
  }

  enqueueChunk(base64Pcm, sampleRate) {
    if (this._muted) return;
    this._ensureContext();
    const binary = atob(base64Pcm);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const float32 = new Float32Array(bytes.buffer);
    const buffer = this._ctx.createBuffer(1, float32.length, sampleRate ?? this._sampleRate);
    buffer.copyToChannel(float32, 0);
    this._queue.push(buffer);
    if (!this._playing) this._playNext();
  }

  _playNext() {
    if (this._queue.length === 0) { this._playing = false; return; }
    this._playing = true;
    const buffer = this._queue.shift();
    const source = this._ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this._ctx.destination);
    source.onended = () => this._playNext();
    source.start();
  }

  stop() {
    this._queue = [];
    this._playing = false;
    if (this._ctx) { this._ctx.close().catch(() => {}); this._ctx = null; }
  }

  mute() { this._muted = true; this.stop(); }
  unmute() { this._muted = false; }
  get isMuted() { return this._muted; }
}

// ═══════════════════════════════════════════
// ── State ──
// ═══════════════════════════════════════════

let uiState = "idle"; // idle | recording | transcribing | streaming | done | error
let recordTimer = null;
let recordStartTime = 0;
let currentSessionId = null;
let currentDetectedLang = null;
let speakBuffer = "";
let conversationHistory = [];
let pendingUserInput = "";

const STORAGE_KEY = "jarvis-mobile-voice-state";
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      currentSessionId,
      conversationHistory,
    }));
  } catch {}
}
function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; }
}

const recorder = new MobileRecorder();
const mobileTtsMode = networkCfg.mobileTts || "local";
const mobileTts = mobileTtsMode === "local" ? new MobileTTS() : null;
const audioPlayer = mobileTtsMode === "server" ? new AudioPlayer() : null;
const ttsEnabled = cmdCfg.tts?.enabled === true;

// ═══════════════════════════════════════════════════
// ── Interactive Permissions & Questions ──
// ═══════════════════════════════════════════════════

function sendControlResponse(requestId, response) {
  if (!networkClient) return;
  if (response.subtype === "success" && response.response?.behavior) {
    networkClient.sendPermissionResponse(requestId, response.response.behavior, response.updated_permissions);
  } else if (response.subtype === "elicitation_complete") {
    networkClient.sendQuestionResponse(requestId, response.response);
  }
}

function cardBaseStyles() {
  return {
    margin: "12px 0",
    padding: isNarrow ? "12px" : "16px",
    borderRadius: "8px",
    border: `1px solid ${T.accent}44`,
    background: `linear-gradient(135deg, rgba(10,15,30,0.95), rgba(13,17,23,0.95))`,
    boxShadow: `0 0 12px ${T.accent}15, inset 0 0 8px rgba(0,0,0,0.3)`,
    animation: "jarvisCardSlideIn 0.3s ease-out",
    fontFamily: "monospace",
  };
}

function renderPermissionCard(requestId, request, container) {
  const card = el("div", cardBaseStyles());

  // Header
  const header = el("div", {
    display: "flex", alignItems: "center", gap: "8px",
    marginBottom: "10px", paddingBottom: "8px",
    borderBottom: `1px solid ${T.accent}22`,
  });
  header.appendChild(el("span", { fontSize: "14px" }, "\u26A1"));
  header.appendChild(el("span", {
    color: T.accent, fontSize: isNarrow ? "11px" : "12px",
    fontWeight: "bold", letterSpacing: "1.5px", textTransform: "uppercase",
  }, "TOOL PERMISSION REQUEST"));
  card.appendChild(header);

  const toolName = request.tool_name || "Unknown";
  const description = request.description || "";
  const input = request.input || {};

  const toolRow = el("div", { marginBottom: "6px" });
  toolRow.appendChild(el("span", { color: T.textMuted, fontSize: "11px" }, "Tool: "));
  toolRow.appendChild(el("span", { color: T.gold, fontSize: "12px", fontWeight: "bold" }, toolName));
  card.appendChild(toolRow);

  if (description) {
    card.appendChild(el("div", { color: T.text, fontSize: "11px", marginBottom: "8px", opacity: "0.8" }, description));
  }

  // Diff preview for Edit
  if (toolName === "Edit" && input.file_path) {
    const fileRow = el("div", { marginBottom: "6px" });
    fileRow.appendChild(el("span", { color: T.textMuted, fontSize: "11px" }, "File: "));
    fileRow.appendChild(el("span", { color: T.text, fontSize: "11px" }, input.file_path.split("/").slice(-2).join("/")));
    card.appendChild(fileRow);
    if (input.old_string || input.new_string) {
      const diffBox = el("div", {
        background: "rgba(0,0,0,0.4)", borderRadius: "4px",
        padding: "8px", marginBottom: "8px", fontSize: "10px",
        border: `1px solid ${T.panelBorder}`, maxHeight: "120px", overflow: "auto",
      });
      if (input.old_string) diffBox.appendChild(el("div", { color: T.red, whiteSpace: "pre-wrap", wordBreak: "break-all" },
        "- " + (input.old_string.length > 200 ? input.old_string.slice(0, 200) + "..." : input.old_string)));
      if (input.new_string) diffBox.appendChild(el("div", { color: T.green, whiteSpace: "pre-wrap", wordBreak: "break-all", marginTop: "4px" },
        "+ " + (input.new_string.length > 200 ? input.new_string.slice(0, 200) + "..." : input.new_string)));
      card.appendChild(diffBox);
    }
  }

  // Bash command preview
  if (toolName === "Bash" && input.command) {
    card.appendChild(el("div", {
      background: "rgba(0,0,0,0.4)", borderRadius: "4px",
      padding: "8px", marginBottom: "8px", fontSize: "10px",
      color: T.gold, border: `1px solid ${T.panelBorder}`,
      whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "80px", overflow: "auto",
    }, "$ " + (input.command.length > 300 ? input.command.slice(0, 300) + "..." : input.command)));
  }

  // Write file path
  if (toolName === "Write" && input.file_path) {
    const fileRow = el("div", { marginBottom: "6px" });
    fileRow.appendChild(el("span", { color: T.textMuted, fontSize: "11px" }, "File: "));
    fileRow.appendChild(el("span", { color: T.text, fontSize: "11px" }, input.file_path.split("/").slice(-2).join("/")));
    card.appendChild(fileRow);
  }

  // Action buttons
  const btnRow = el("div", { display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" });

  function makeBtn(label, bg) {
    return el("div", {
      padding: "8px 16px", borderRadius: "4px", cursor: "pointer",
      background: bg, color: "#fff", fontSize: "12px", fontWeight: "bold",
      letterSpacing: "1px", textAlign: "center", transition: "all 0.2s",
      border: `1px solid ${bg}`, minWidth: "60px",
    }, label);
  }

  const allowBtn = makeBtn("ALLOW", T.green);
  const alwaysBtn = makeBtn("ALWAYS ALLOW", T.purple);
  const denyBtn = makeBtn("DENY", T.red);

  function disableCard() { card.style.opacity = "0.5"; card.style.pointerEvents = "none"; }

  allowBtn.addEventListener("click", () => {
    disableCard();
    sendControlResponse(requestId, { subtype: "success", request_id: requestId, response: { behavior: "allow" } });
  });
  alwaysBtn.addEventListener("click", () => {
    disableCard();
    sendControlResponse(requestId, { subtype: "success", request_id: requestId, response: { behavior: "allowAlways" }, updated_permissions: [{ type: "allow_tool", tool_name: toolName }] });
  });
  denyBtn.addEventListener("click", () => {
    disableCard();
    sendControlResponse(requestId, { subtype: "success", request_id: requestId, response: { behavior: "deny" } });
  });

  btnRow.appendChild(allowBtn);
  btnRow.appendChild(alwaysBtn);
  btnRow.appendChild(denyBtn);
  card.appendChild(btnRow);
  container.appendChild(card);
  container.scrollTop = container.scrollHeight;

  // TTS
  if (mobileTts && ttsEnabled) {
    mobileTts.speak(`Sir, JARVIS needs to ${description || "use " + toolName}. Allow?`);
  }
}

function renderQuestionCard(requestId, request, container) {
  const card = el("div", cardBaseStyles());

  // Header
  const header = el("div", {
    display: "flex", alignItems: "center", gap: "8px",
    marginBottom: "10px", paddingBottom: "8px",
    borderBottom: `1px solid ${T.accent}22`,
  });
  header.appendChild(el("span", { fontSize: "14px" }, "\uD83D\uDCAC"));
  header.appendChild(el("span", {
    color: T.accent, fontSize: isNarrow ? "11px" : "12px",
    fontWeight: "bold", letterSpacing: "1.5px", textTransform: "uppercase",
  }, "JARVIS NEEDS YOUR INPUT"));
  card.appendChild(header);

  const message = request.message || "Please provide your input.";
  card.appendChild(el("div", {
    color: T.text, fontSize: "12px", marginBottom: "10px",
    fontStyle: "italic", lineHeight: "1.5",
  }, `"${message}"`));

  let selectedAnswer = null;
  const options = request.options || [];

  if (options.length > 0) {
    const optionsContainer = el("div", { marginBottom: "10px" });
    options.forEach((option) => {
      const optionLabel = typeof option === "string" ? option : (option.label || option.value || String(option));
      const optionValue = typeof option === "string" ? option : (option.value || option.label || String(option));

      const row = el("div", {
        display: "flex", alignItems: "center", gap: "8px",
        padding: "8px", borderRadius: "4px", cursor: "pointer",
        transition: "background 0.15s", marginBottom: "2px",
      });
      const radio = el("div", {
        width: "16px", height: "16px", borderRadius: "50%",
        border: `2px solid ${T.textMuted}`, flexShrink: "0",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "border-color 0.15s",
      });
      const radioDot = el("div", {
        width: "8px", height: "8px", borderRadius: "50%",
        background: "transparent", transition: "background 0.15s",
      });
      radio.appendChild(radioDot);
      row.appendChild(radio);
      row.appendChild(el("span", { color: T.text, fontSize: "12px" }, optionLabel));

      row.addEventListener("click", () => {
        optionsContainer.querySelectorAll("div[data-radio]").forEach((r) => {
          r.style.borderColor = T.textMuted;
          r.firstChild.style.background = "transparent";
        });
        radio.style.borderColor = T.accent;
        radioDot.style.background = T.accent;
        selectedAnswer = optionValue;
        updateSubmitState();
        if (customInput) customInput.value = "";
      });

      radio.setAttribute("data-radio", "true");
      optionsContainer.appendChild(row);
    });
    card.appendChild(optionsContainer);
  }

  // Custom text input
  card.appendChild(el("div", { color: T.textMuted, fontSize: "10px", marginBottom: "4px" },
    options.length > 0 ? "Or type your own answer:" : "Your answer:"));

  const customInput = el("input", {
    width: "100%", boxSizing: "border-box",
    padding: "10px 12px", borderRadius: "4px",
    background: "rgba(0,0,0,0.4)", color: T.text,
    border: `1px solid ${T.panelBorder}`,
    fontSize: "13px", fontFamily: "monospace", outline: "none",
  });
  customInput.setAttribute("placeholder", "Type your answer...");
  customInput.addEventListener("input", () => {
    if (customInput.value.trim()) {
      selectedAnswer = customInput.value.trim();
      card.querySelectorAll("div[data-radio]").forEach((r) => {
        r.style.borderColor = T.textMuted;
        r.firstChild.style.background = "transparent";
      });
    } else {
      selectedAnswer = null;
    }
    updateSubmitState();
  });
  card.appendChild(customInput);

  // Submit button
  const submitBtn = el("div", {
    padding: "10px 24px", borderRadius: "4px", cursor: "not-allowed",
    background: T.green, color: "#fff", fontSize: "12px", fontWeight: "bold",
    letterSpacing: "1px", textAlign: "center", marginTop: "10px",
    opacity: "0.4", transition: "all 0.2s", border: `1px solid ${T.green}`,
  }, "SUBMIT");

  let submitEnabled = false;
  function updateSubmitState() {
    if (selectedAnswer) {
      submitEnabled = true;
      submitBtn.style.opacity = "1";
      submitBtn.style.cursor = "pointer";
      submitBtn.style.animation = "jarvisSubmitPulse 2s ease-in-out infinite";
    } else {
      submitEnabled = false;
      submitBtn.style.opacity = "0.4";
      submitBtn.style.cursor = "not-allowed";
      submitBtn.style.animation = "none";
    }
  }

  submitBtn.addEventListener("click", () => {
    if (!submitEnabled || !selectedAnswer) return;
    card.style.opacity = "0.5";
    card.style.pointerEvents = "none";
    sendControlResponse(requestId, {
      subtype: "elicitation_complete",
      request_id: requestId,
      response: { selected: selectedAnswer },
    });
  });

  customInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && submitEnabled && selectedAnswer) submitBtn.click();
  });

  card.appendChild(submitBtn);
  container.appendChild(card);
  container.scrollTop = container.scrollHeight;

  // TTS
  if (mobileTts && ttsEnabled) {
    let ttsMsg = `Sir, ${message}`;
    if (options.length > 0) {
      ttsMsg += ` Options are: ${options.map((o) => typeof o === "string" ? o : (o.label || o.value || String(o))).join(", ")}.`;
    }
    mobileTts.speak(ttsMsg);
  }
}

// ── Sizes ──
const outerSize = isNarrow ? 170 : 210;
const innerSize = isNarrow ? 120 : 150;
const coreSize = isNarrow ? 84 : 105;

// ═══════════════════════════════════════════
// ── DOM: Section wrapper ──
// ═══════════════════════════════════════════

const section = el("div", {
  position: "relative", zIndex: "2",
  marginTop: isNarrow ? "8px" : "16px",
  marginBottom: isNarrow ? "16px" : "24px",
  display: "flex", flexDirection: "column", alignItems: "center",
  animation: "jarvisCardFadeIn 0.5s ease-out 0.2s both",
});

// ═══════════════════════════════════════════
// ── DOM: Connection status indicator ──
// ═══════════════════════════════════════════

const connDot = el("span", {
  display: "inline-block", width: "8px", height: "8px", borderRadius: "50%",
  background: T.red, marginRight: "8px", transition: "background 0.3s ease",
});

const connLabel = el("span", {
  fontSize: "10px", fontWeight: "600", letterSpacing: "1.5px", textTransform: "uppercase",
  color: T.textMuted, fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
}, "Disconnected");

const connBtn = el("span", {
  fontSize: "10px", fontWeight: "600", letterSpacing: "1px",
  color: T.accent, padding: "3px 10px", borderRadius: "6px",
  border: `1px solid ${T.accent}44`, cursor: "pointer",
  transition: "all 0.2s ease", marginLeft: "8px", display: "inline-block",
}, "Connect");
connBtn.addEventListener("click", () => networkClient?.connect());
connBtn.addEventListener("touchstart", () => {
  connBtn.style.background = T.accent + "22";
  connBtn.style.borderColor = T.accent + "77";
}, { passive: true });
connBtn.addEventListener("touchend", () => {
  connBtn.style.background = "transparent";
  connBtn.style.borderColor = T.accent + "44";
}, { passive: true });

const connBar = el("div", {
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: "8px 16px", marginBottom: "16px", borderRadius: "8px",
  background: T.panelBg, border: `1px solid ${T.panelBorder}`,
  width: "100%", maxWidth: isNarrow ? "100%" : "400px",
});
connBar.appendChild(connDot);
connBar.appendChild(connLabel);
connBar.appendChild(connBtn);
section.appendChild(connBar);

function updateConnectionUI(s) {
  switch (s) {
    case "connected":
      connDot.style.background = T.green;
      connLabel.textContent = "Connected";
      connLabel.style.color = T.green;
      connBtn.style.display = "none";
      break;
    case "connecting":
      connDot.style.background = T.gold;
      connDot.style.animation = "jarvisPulse 2s ease-in-out infinite";
      connLabel.textContent = "Connecting...";
      connLabel.style.color = T.gold;
      connBtn.style.display = "none";
      break;
    case "reconnecting":
      connDot.style.background = T.orange;
      connDot.style.animation = "jarvisPulse 1.5s ease-in-out infinite";
      const attempt = networkClient?.reconnectAttempt || 0;
      connLabel.textContent = `Reconnecting... (${attempt})`;
      connLabel.style.color = T.orange;
      connBtn.textContent = "Retry";
      connBtn.style.display = "inline-block";
      break;
    default:
      connDot.style.background = T.red;
      connDot.style.animation = "none";
      connLabel.textContent = "Disconnected";
      connLabel.style.color = T.textMuted;
      connBtn.textContent = "Connect";
      connBtn.style.display = "inline-block";
  }
}

if (networkClient) {
  networkClient.onStateChange(updateConnectionUI);
  updateConnectionUI(networkClient.state);
}

// ═══════════════════════════════════════════
// ── DOM: Arc reactor button ──
// ═══════════════════════════════════════════

const btnContainer = el("div", {
  position: "relative", width: outerSize + "px", height: outerSize + "px",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", touchAction: "none", userSelect: "none",
});
section.appendChild(btnContainer);

// Outer rotating ring
const outerRing = el("div", {
  position: "absolute", width: outerSize + "px", height: outerSize + "px",
  borderRadius: "50%", border: `2px dashed ${T.accent}33`,
  animation: "jarvisArcRotate 12s linear infinite", pointerEvents: "none",
});
btnContainer.appendChild(outerRing);

// Middle glow ring
const glowRing = el("div", {
  position: "absolute", width: innerSize + "px", height: innerSize + "px",
  borderRadius: "50%", border: `1px solid ${T.accent}22`,
  background: `radial-gradient(circle, ${T.accent}08 0%, transparent 70%)`,
  animation: "jarvisArcPulse 4s ease-in-out infinite", pointerEvents: "none",
});
btnContainer.appendChild(glowRing);

// Ripple element
const ripple = el("div", {
  position: "absolute", width: coreSize + "px", height: coreSize + "px",
  borderRadius: "50%", border: `2px solid ${T.accent}`,
  pointerEvents: "none", opacity: "0",
});
btnContainer.appendChild(ripple);

// Orbiting particles
for (let i = 0; i < 3; i++) {
  btnContainer.appendChild(el("div", {
    position: "absolute", top: "50%", left: "50%",
    width: "4px", height: "4px", marginTop: "-2px", marginLeft: "-2px",
    borderRadius: "50%", background: T.accent,
    boxShadow: `0 0 6px ${T.accent}, 0 0 10px ${T.accent}`,
    animation: `jarvisOrbitDotLarge ${3 + i}s linear infinite ${i * 1.2}s`,
    pointerEvents: "none", opacity: "0.7",
    willChange: "transform",
  }));
}

// Inner core circle
const core = el("div", {
  width: coreSize + "px", height: coreSize + "px", borderRadius: "50%",
  background: `radial-gradient(circle at 40% 35%, ${T.panelBg}, #050510)`,
  border: `2px solid ${T.accent}44`,
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  position: "relative", zIndex: "2",
  transition: "border-color 0.4s ease, box-shadow 0.4s ease",
  boxShadow: `0 0 12px ${T.accent}20, inset 0 0 16px rgba(0,0,0,0.6)`,
  animation: "jarvisBreathing 3s ease-in-out infinite",
  willChange: "transform",
});
btnContainer.appendChild(core);

// "J" letter
const coreIcon = el("span", {
  fontSize: isNarrow ? "28px" : "36px", fontWeight: "800",
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  color: T.accent, letterSpacing: "1px", transition: "all 0.3s ease",
  lineHeight: "1", textShadow: `0 0 8px ${T.accent}66`,
}, "J");
core.appendChild(coreIcon);

// State icon (for transcribing/streaming)
const stateIcon = el("span", {
  fontSize: isNarrow ? "20px" : "24px", color: T.accent,
  lineHeight: "1", display: "none", transition: "all 0.3s ease",
});
core.appendChild(stateIcon);

// Timer display
const timerEl = el("div", {
  fontSize: isNarrow ? "16px" : "20px", fontWeight: "700",
  fontFamily: "'SF Mono', 'Fira Code', monospace",
  color: T.accent, letterSpacing: "2px", display: "none",
  transition: "all 0.3s ease",
}, "00:00");
core.appendChild(timerEl);

// Status text below button
const statusText = el("div", {
  fontSize: isNarrow ? "9px" : "10px", fontWeight: "600",
  letterSpacing: "2px", textTransform: "uppercase",
  color: T.textMuted, marginTop: isNarrow ? "12px" : "16px",
  textAlign: "center", transition: "color 0.3s ease",
}, "Tap to speak to JARVIS");
section.appendChild(statusText);

// ═══════════════════════════════════════════
// ── DOM: Text input field ──
// ═══════════════════════════════════════════

const textInputRow = el("div", {
  display: "flex", alignItems: "center", gap: "8px",
  marginTop: "16px", width: "100%", maxWidth: isNarrow ? "100%" : "500px",
});

const textInput = document.createElement("input");
Object.assign(textInput.style, {
  flex: "1", padding: "10px 14px", fontSize: "14px",
  fontFamily: "'Inter', -apple-system, sans-serif",
  color: T.text, background: T.panelBg,
  border: `1px solid ${T.panelBorder}`, borderRadius: "10px",
  outline: "none", transition: "border-color 0.2s ease",
});
textInput.type = "text";
textInput.placeholder = "Type a message...";
textInput.addEventListener("focus", () => { textInput.style.borderColor = T.accent + "66"; });
textInput.addEventListener("blur", () => { textInput.style.borderColor = T.panelBorder; });

const sendBtn = el("span", {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: "38px", height: "38px", borderRadius: "10px",
  background: T.accent + "22", border: `1px solid ${T.accent}44`,
  cursor: "pointer", color: T.accent, transition: "all 0.2s ease",
  flexShrink: "0",
});
sendBtn.innerHTML = SVG_SEND;

function handleTextSend() {
  const text = textInput.value.trim();
  if (!text || !networkClient?.isConnected) return;
  if (uiState === "streaming") {
    networkClient?.sendCancel();
    if (mobileTts) mobileTts.stop();
    if (audioPlayer) audioPlayer.stop();
    appendToTerminal("\n[Cancelled]\n", "meta");
    // Fall through to send new message
  } else if (uiState === "transcribing") {
    return;
  }

  textInput.value = "";
  pendingUserInput = text;
  showTerminalPanel();
  appendTurnSeparator();
  appendToTerminal(`> ${text}\n`, "echo");
  setWidgetState("streaming");
  networkClient.sendTextCommand(text, currentSessionId);
}

sendBtn.addEventListener("click", handleTextSend);
sendBtn.addEventListener("touchstart", () => {
  sendBtn.style.background = T.accent + "44";
  sendBtn.style.transform = "scale(0.93)";
}, { passive: true });
sendBtn.addEventListener("touchend", () => {
  sendBtn.style.background = T.accent + "22";
  sendBtn.style.transform = "scale(1)";
}, { passive: true });
textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); handleTextSend(); }
});

textInputRow.appendChild(textInput);
textInputRow.appendChild(sendBtn);
section.appendChild(textInputRow);

// ═══════════════════════════════════════════
// ── DOM: Terminal panel ──
// ═══════════════════════════════════════════

const terminalPanel = el("div", {
  display: "none", marginTop: "16px", width: "100%",
  maxWidth: isNarrow ? "100%" : "600px",
  background: T.panelBg, border: `1px solid ${T.panelBorder}`,
  borderRadius: "12px", overflow: "hidden",
});
section.appendChild(terminalPanel);

// Terminal header
const terminalHeader = el("div", {
  display: "flex", alignItems: "center", gap: "8px",
  padding: isNarrow ? "8px 12px" : "10px 16px",
  background: "rgba(0,0,0,0.3)", borderBottom: `1px solid ${T.panelBorder}`,
});
terminalPanel.appendChild(terminalHeader);

// Close button
const closeBtn = el("span", {
  fontSize: "14px", color: T.textMuted, cursor: "pointer",
  padding: "2px 6px", borderRadius: "4px", transition: "all 0.2s ease", lineHeight: "1",
}, "\u2715");
closeBtn.addEventListener("click", () => {
  // Cancel active operations but preserve session
  if (uiState === "streaming" || uiState === "transcribing") {
    networkClient?.sendCancel();
    if (mobileTts) mobileTts.stop();
    if (audioPlayer) audioPlayer.stop();
  }
  hideTerminalPanel();
  setWidgetState(currentSessionId ? "done" : "idle");
});
terminalHeader.appendChild(closeBtn);

// Title
terminalHeader.appendChild(el("span", {
  fontSize: "11px", fontWeight: "700", letterSpacing: "2px",
  textTransform: "uppercase", color: T.textMuted,
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
}, "JARVIS OUTPUT"));

terminalHeader.appendChild(el("div", { flex: "1" }));

// Mute button
const muteBtn = el("span", {
  cursor: "pointer", padding: "4px 8px", borderRadius: "6px",
  transition: "all 0.2s ease", display: ttsEnabled ? "inline-flex" : "none",
  alignItems: "center", justifyContent: "center", color: T.accent,
});
muteBtn.innerHTML = SVG_SPEAKER_ON;
muteBtn.addEventListener("click", () => {
  if (mobileTts) {
    const muted = mobileTts.toggleMute();
    muteBtn.innerHTML = muted ? SVG_SPEAKER_OFF : SVG_SPEAKER_ON;
    muteBtn.style.color = muted ? T.textMuted : T.accent;
  }
  if (audioPlayer) {
    if (audioPlayer.isMuted) { audioPlayer.unmute(); } else { audioPlayer.mute(); }
    muteBtn.innerHTML = audioPlayer.isMuted ? SVG_SPEAKER_OFF : SVG_SPEAKER_ON;
    muteBtn.style.color = audioPlayer.isMuted ? T.textMuted : T.accent;
  }
});
terminalHeader.appendChild(muteBtn);

// Copy button
const copyBtn = el("span", {
  fontSize: "10px", fontWeight: "600", letterSpacing: "1px",
  color: T.accent, fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  padding: "4px 10px", borderRadius: "6px", border: `1px solid ${T.accent}44`,
  cursor: "pointer", transition: "all 0.2s ease",
}, "Copy");
copyBtn.addEventListener("click", () => {
  const text = terminalOutput.innerText;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = "Copied!";
      copyBtn.style.borderColor = T.green + "66";
      copyBtn.style.color = T.green;
      setTimeout(() => {
        copyBtn.textContent = "Copy";
        copyBtn.style.borderColor = T.accent + "44";
        copyBtn.style.color = T.accent;
      }, 1500);
    });
  }
});
terminalHeader.appendChild(copyBtn);

// Terminal output area
const terminalOutput = el("div", {
  padding: isNarrow ? "12px" : "16px",
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  fontSize: isNarrow ? "11px" : "12px", lineHeight: "1.6",
  color: T.text, maxHeight: "400px", overflowY: "auto",
  whiteSpace: "pre-wrap", wordBreak: "break-word",
});
terminalPanel.appendChild(terminalOutput);

// ═══════════════════════════════════════════
// ── DOM: Session bar ──
// ═══════════════════════════════════════════

const sessionDot = el("span", {
  display: "inline-block", width: "6px", height: "6px",
  borderRadius: "50%", background: T.green, flexShrink: "0",
});
const sessionLabel = el("span", {
  fontSize: "10px", fontWeight: "700", letterSpacing: "1.5px",
  textTransform: "uppercase", color: T.textMuted,
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
}, "SESSION");
const sessionIdLabel = el("span", {
  fontSize: "10px", fontWeight: "600", letterSpacing: "1px", color: T.accent,
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
});
const newSessionBtn = el("span", {
  fontSize: "10px", fontWeight: "600", letterSpacing: "1px",
  color: T.textMuted, fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  padding: "3px 10px", borderRadius: "6px",
  border: `1px solid ${T.panelBorder}`, cursor: "pointer", transition: "all 0.2s ease",
}, "New Session");
newSessionBtn.addEventListener("click", () => {
  currentSessionId = null;
  conversationHistory = [];
  saveState();
  networkClient?.sendNewSession();
  sessionBar.style.display = "none";
  terminalOutput.textContent = "";
  hideTerminalPanel();
  setWidgetState("idle");
});

const sessionBar = el("div", {
  display: "none", alignItems: "center", gap: "6px",
  padding: "8px 14px", marginTop: "12px",
  background: T.panelBg, border: `1px solid ${T.panelBorder}`,
  borderRadius: "8px", maxWidth: isNarrow ? "100%" : "600px", width: "100%",
});
sessionBar.appendChild(sessionDot);
sessionBar.appendChild(sessionLabel);
sessionBar.appendChild(sessionIdLabel);
sessionBar.appendChild(el("div", { flex: "1" }));
sessionBar.appendChild(newSessionBtn);
section.appendChild(sessionBar);

// Bottom spacer for iOS tab bar
section.appendChild(el("div", { height: "80px", flexShrink: "0" }));

// ═══════════════════════════════════════════
// ── Terminal helpers ──
// ═══════════════════════════════════════════

let firstTurn = true;

function showTerminalPanel() {
  terminalPanel.style.display = "block";
  terminalPanel.style.animation = "jarvisCardFadeIn 0.3s ease-out both";
}

function hideTerminalPanel() {
  terminalPanel.style.display = "none";
}

// Per-message copy icon (touch-friendly for mobile)
function addMobileCopyIcon(container, getText) {
  const icon = el("span", {
    position: "absolute", top: "2px", right: "2px",
    fontSize: "10px", color: T.textMuted, cursor: "pointer",
    opacity: "0.5", transition: "opacity 0.2s",
    padding: "4px 8px", borderRadius: "4px",
    background: "rgba(0,0,0,0.4)",
  }, "copy");
  icon.addEventListener("click", (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(getText()).then(() => {
      icon.textContent = "\u2713";
      icon.style.color = T.green;
      setTimeout(() => { icon.textContent = "copy"; icon.style.color = T.textMuted; }, 1200);
    });
  });
  container.style.position = "relative";
  container.appendChild(icon);
}

// Track current output block for per-message copy
let _currentOutputBlock = null;
let _currentOutputBuffer = "";
let _currentStreamRenderer = null;

function appendToTerminal(text, type) {
  if (terminalPanel.style.display === "none") showTerminalPanel();

  if (type === "echo") {
    // Finish previous output block with copy icon
    if (_currentStreamRenderer) { _currentStreamRenderer.finalize(); _currentStreamRenderer = null; }
    if (_currentOutputBlock && _currentOutputBuffer) {
      const bufCopy = _currentOutputBuffer;
      addMobileCopyIcon(_currentOutputBlock, () => bufCopy);
    }
    // Create a new echo container with copy icon
    const echoBlock = el("div", { position: "relative", marginBottom: "4px" });
    const span = document.createElement("span");
    span.textContent = text;
    span.style.color = T.accent;
    echoBlock.appendChild(span);
    const rawText = text.replace(/^>\s*/, "").trim();
    addMobileCopyIcon(echoBlock, () => rawText);
    terminalOutput.appendChild(echoBlock);
    // Reset output tracking for next assistant response
    _currentOutputBlock = el("div", { position: "relative" });
    _currentOutputBuffer = "";
    _currentStreamRenderer = markdownRenderer.createStreamRenderer(_currentOutputBlock);
    terminalOutput.appendChild(_currentOutputBlock);
  } else if (type === "output") {
    // Append to current output block via stream renderer
    if (!_currentOutputBlock) {
      _currentOutputBlock = el("div", { position: "relative" });
      _currentOutputBuffer = "";
      _currentStreamRenderer = markdownRenderer.createStreamRenderer(_currentOutputBlock);
      terminalOutput.appendChild(_currentOutputBlock);
    }
    _currentStreamRenderer.append(text);
    _currentOutputBuffer += text;
  } else if (type === "meta") {
    // Finish previous output block with copy icon
    if (_currentStreamRenderer) { _currentStreamRenderer.finalize(); _currentStreamRenderer = null; }
    if (_currentOutputBlock && _currentOutputBuffer) {
      const bufCopy = _currentOutputBuffer;
      addMobileCopyIcon(_currentOutputBlock, () => bufCopy);
      _currentOutputBlock = null;
      _currentOutputBuffer = "";
    }
    const span = document.createElement("span");
    span.textContent = text;
    span.style.color = T.textMuted;
    terminalOutput.appendChild(span);
  } else {
    const span = document.createElement("span");
    span.textContent = text;
    if (type === "error") span.style.color = T.red;
    else span.style.color = T.text;
    terminalOutput.appendChild(span);
  }
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function appendTurnSeparator() {
  if (firstTurn) { firstTurn = false; return; }
  const sep = el("div", {
    height: "1px", background: T.panelBorder,
    margin: "12px 0",
  });
  terminalOutput.appendChild(sep);
}

function updateSessionBar() {
  if (currentSessionId) {
    sessionIdLabel.textContent = currentSessionId.slice(0, 12) + "...";
    sessionBar.style.display = "flex";
  } else {
    sessionBar.style.display = "none";
  }
}

// ═══════════════════════════════════════════
// ── State machine ──
// ═══════════════════════════════════════════

function setWidgetState(newState) {
  uiState = newState;

  // Reset
  coreIcon.style.display = "none";
  stateIcon.style.display = "none";
  timerEl.style.display = "none";
  if (recordTimer) { clearInterval(recordTimer); recordTimer = null; }
  textInput.disabled = false;
  sendBtn.style.opacity = "1";

  switch (newState) {
    case "idle":
      coreIcon.style.display = "";
      coreIcon.textContent = "J";
      statusText.textContent = "Tap to speak to JARVIS";
      statusText.style.color = T.textMuted;
      core.style.borderColor = T.accent + "44";
      outerRing.style.animation = "jarvisArcRotate 12s linear infinite";
      ripple.style.opacity = "0";
      break;

    case "recording":
      timerEl.style.display = "";
      timerEl.textContent = "00:00";
      statusText.textContent = "Recording \u2014 Tap to stop";
      statusText.style.color = T.accent;
      core.style.borderColor = T.accent;
      core.style.boxShadow = `0 0 24px ${T.accent}40, inset 0 0 16px rgba(0,0,0,0.6)`;
      outerRing.style.animation = "jarvisArcRotate 3s linear infinite";
      ripple.style.animation = "jarvisRipple 2s ease-out infinite";
      ripple.style.opacity = "1";
      recordStartTime = Date.now();
      recordTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
        const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
        const ss = String(elapsed % 60).padStart(2, "0");
        timerEl.textContent = `${mm}:${ss}`;
      }, 1000);
      if (ctx.intervals) ctx.intervals.push(recordTimer);
      textInput.disabled = true;
      sendBtn.style.opacity = "0.3";
      break;

    case "transcribing":
      stateIcon.style.display = "";
      stateIcon.textContent = "\u23F3";
      statusText.textContent = "Transcribing...";
      statusText.style.color = T.gold;
      core.style.borderColor = T.gold + "88";
      outerRing.style.animation = "jarvisArcRotate 6s linear infinite";
      ripple.style.opacity = "0";
      textInput.disabled = true;
      sendBtn.style.opacity = "0.3";
      break;

    case "streaming":
      stateIcon.style.display = "";
      stateIcon.textContent = "\u25CF";
      stateIcon.style.animation = "jarvisPulse 2s ease-in-out infinite";
      statusText.textContent = "JARVIS is responding...";
      statusText.style.color = T.green;
      core.style.borderColor = T.green + "66";
      outerRing.style.animation = "jarvisArcRotate 4s linear infinite";
      textInput.disabled = false;
      sendBtn.style.opacity = "1";
      break;

    case "done":
      coreIcon.style.display = "";
      coreIcon.textContent = "J";
      statusText.textContent = "Tap to speak to JARVIS";
      statusText.style.color = T.textMuted;
      core.style.borderColor = T.accent + "44";
      core.style.boxShadow = `0 0 12px ${T.accent}20, inset 0 0 16px rgba(0,0,0,0.6)`;
      outerRing.style.animation = "jarvisArcRotate 12s linear infinite";
      stateIcon.style.animation = "";
      break;

    case "error":
      stateIcon.style.display = "";
      stateIcon.textContent = "\u2717";
      stateIcon.style.color = T.red;
      statusText.textContent = "Error \u2014 Tap to try again";
      statusText.style.color = T.red;
      core.style.borderColor = T.red + "66";
      setTimeout(() => setWidgetState("idle"), 5000);
      break;
  }
}

// ═══════════════════════════════════════════
// ── Arc reactor tap handler ──
// ═══════════════════════════════════════════

btnContainer.addEventListener("click", async () => {
  if (!networkClient?.isConnected) {
    networkClient?.connect();
    return;
  }

  if (uiState === "idle" || uiState === "done") {
    // Start recording
    try {
      await recorder.start();
      if (terminalOutput.textContent.trim()) showTerminalPanel();
      setWidgetState("recording");
    } catch (err) {
      appendToTerminal(`\n[Microphone error: ${err.message}]\n`, "error");
      setWidgetState("error");
    }
  } else if (uiState === "recording") {
    // Stop recording → send to server
    recorder.stop();
    appendTurnSeparator();
    setWidgetState("transcribing");
  } else if (uiState === "streaming" || uiState === "transcribing") {
    // Cancel
    recorder.cancel();
    if (mobileTts) mobileTts.stop();
    if (audioPlayer) audioPlayer.stop();
    networkClient.sendCancel();
    appendToTerminal("\n[Cancelled]\n", "meta");
    setWidgetState("done");
  }

  // Resume AudioContext on user gesture (iOS requirement)
  if (audioPlayer?._ctx?.state === "suspended") {
    audioPlayer._ctx.resume().catch(() => {});
  }
});

// ═══════════════════════════════════════════
// ── Server message handlers ──
// ═══════════════════════════════════════════

if (networkClient) {
  // Sentence boundary detection for TTS
  function extractSentences(buffer) {
    const sentences = [];
    const pattern = /[.!?]\s+|\n\n/;
    let buf = buffer;
    let idx;
    while ((idx = buf.search(pattern)) !== -1) {
      sentences.push(buf.slice(0, idx + 1).trim());
      buf = buf.slice(idx + 1);
    }
    return { sentences, remainder: buf };
  }

  let fullResponseBuffer = "";

  // Track listeners for cleanup to prevent duplication on re-render
  const _listeners = [];
  function onNet(type, handler) {
    networkClient.on(type, handler);
    _listeners.push({ type, handler });
  }

  onNet("transcription", (msg) => {
    pendingUserInput = msg.text;
    currentDetectedLang = msg.detectedLang || null;
    appendToTerminal(`> ${msg.text}\n`, "echo");
    setWidgetState("streaming");
  });

  onNet("stream_delta", (msg) => {
    fullResponseBuffer += msg.text;
    appendToTerminal(msg.text, "output");

    // TTS sentence buffering (local mode)
    if (ttsEnabled && mobileTts && !mobileTts.isMuted) {
      speakBuffer += msg.text;
      const { sentences, remainder } = extractSentences(speakBuffer);
      speakBuffer = remainder;
      sentences.forEach((s) => mobileTts.speak(s, currentDetectedLang));
    }
  });

  onNet("stream_end", (msg) => {
    if (msg.sessionId) {
      currentSessionId = msg.sessionId;
      updateSessionBar();
    }
    // Save conversation history
    if (pendingUserInput && fullResponseBuffer) {
      conversationHistory.push(
        { role: "user", text: pendingUserInput, timestamp: Date.now() },
        { role: "assistant", text: fullResponseBuffer, timestamp: Date.now() },
      );
      saveState();
    }
    pendingUserInput = "";
    fullResponseBuffer = "";
    // Speak remaining buffer
    if (ttsEnabled && mobileTts && speakBuffer.trim()) {
      mobileTts.speak(speakBuffer.trim(), currentDetectedLang);
    }
    speakBuffer = "";
    appendToTerminal("\n[Complete]\n", "meta");
    setWidgetState("done");
  });

  onNet("tts_audio", (msg) => {
    if (audioPlayer) audioPlayer.enqueueChunk(msg.data, msg.sampleRate);
  });

  onNet("tts_end", () => {
    // Audio playback finishes on its own
  });

  onNet("permission_request", (msg) => {
    if (terminalPanel.style.display === "none") showTerminalPanel();
    renderPermissionCard(msg.requestId, msg.request, terminalOutput);
  });

  onNet("question_request", (msg) => {
    if (terminalPanel.style.display === "none") showTerminalPanel();
    renderQuestionCard(msg.requestId, msg.request, terminalOutput);
  });

  onNet("error", (msg) => {
    appendToTerminal(`\n[Error: ${msg.stage} \u2014 ${msg.message}]\n`, "error");
    setWidgetState("error");
    speakBuffer = "";
  });

  onNet("connected", () => {
    // Reconnected — UI already updated via onStateChange
  });

  // Register cleanup to remove all listeners on widget teardown
  if (ctx.cleanups) {
    ctx.cleanups.push(() => {
      for (const { type, handler } of _listeners) {
        networkClient.off(type, handler);
      }
    });
  }
}

// ── Initialize ──
// Restore saved session state from localStorage
const _saved = loadState();
if (_saved && _saved.conversationHistory?.length > 0) {
  currentSessionId = _saved.currentSessionId || null;
  conversationHistory = _saved.conversationHistory;
  // Rebuild terminal from history
  let first = true;
  for (const turn of conversationHistory) {
    if (turn.role === "user") {
      if (!first) {
        const sep = el("div", { height: "1px", background: T.panelBorder, margin: "12px 0" });
        terminalOutput.appendChild(sep);
      }
      first = false;
      const userSpan = document.createElement("span");
      userSpan.textContent = `> ${turn.text}\n`;
      userSpan.style.color = T.accent;
      terminalOutput.appendChild(userSpan);
    } else if (turn.role === "assistant") {
      const asstBlock = el("div", { color: T.text });
      asstBlock.appendChild(markdownRenderer.renderMarkdown(turn.text));
      terminalOutput.appendChild(asstBlock);
      const metaSpan = document.createElement("span");
      metaSpan.textContent = "\n[Complete]\n";
      metaSpan.style.color = T.textMuted;
      terminalOutput.appendChild(metaSpan);
    }
  }
  showTerminalPanel();
  updateSessionBar();
  setWidgetState("done");
} else {
  setWidgetState("idle");
}

return section;
