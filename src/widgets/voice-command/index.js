// JARVIS Voice Command Widget — Desktop Orchestrator
// Loads sub-modules from voice-command/ and wires them together.
// Returns: HTMLElement

const { el, T, config, isNarrow, voiceService, ttsService, nodeFs, nodePath,
        markdownRenderer, animationsEnabled, perf, sessionManager } = ctx;
const cmdCfg = config.widgets?.voiceCommand || {};
const interactiveCfg = cmdCfg.interactive || {};
if (cmdCfg.enabled === false) return el("div", {});
const animOrNone = (s) => animationsEnabled ? s : "none";

// ── Mode detection ──
const isRemoteMode = cmdCfg.mode === "remote";
const networkClient = isRemoteMode ? ctx.networkClient : null;
const remoteTtsMode = isRemoteMode ? (cmdCfg.remoteTts || "local") : null;
const available = isRemoteMode ? true : voiceService.isAvailable;

// ── Sub-module loader ──
async function loadSub(rel) {
  const base = ctx._srcDir + "widgets/voice-command/";
  const code = await ctx._adapter.readFile(base + rel);
  return new Function("ctx", code)(ctx);
}

// ── Load all modules ──
const [
  { stripAnsi, stripMarkdown },
  { createStateMachine },
  { createStorageAdapter },
  { createArcReactor },
  { createTextInput },
  { createConnectionBar },
  { createTerminalPanel },
  { createRecorder },
  { createTTSAdapter },
  { createStreamHandler },
  { createCardRenderer },
  { createReconnectManager },
  { createProcessManager },
  { createSessionTabs },
  { createProjectSelector },
] = await Promise.all([
  loadSub("core/utilities.js"),
  loadSub("core/state-machine.js"),
  loadSub("adapters/storage-adapter.js"),
  loadSub("core/arc-reactor.js"),
  loadSub("core/text-input.js"),
  loadSub("core/connection-bar.js"),
  loadSub("core/terminal-panel.js"),
  loadSub("adapters/recorder-adapter.js"),
  loadSub("adapters/tts-adapter.js"),
  loadSub("core/stream-handler.js"),
  loadSub("core/interaction-cards.js"),
  loadSub("core/reconnect-manager.js"),
  loadSub("desktop/process-manager.js"),
  loadSub("core/session-tabs.js"),
  loadSub("core/project-selector.js"),
]);

// ── Shared state ──
let fullBuffer = "";
let currentSessionId = null;
let currentDetectedLang = null;
let conversationHistory = [];
let preSpawnJsonlSet = null;
let activeJarvisSessionId = null;

// ── Create adapters ──
const storage = createStorageAdapter();
const reconnect = createReconnectManager({ isDesktop: true });
const processMgr = createProcessManager({ storageAdapter: storage, stripAnsi });

const recorder = createRecorder({
  mode: isRemoteMode ? "remote" : "local",
  voiceService: isRemoteMode ? null : voiceService,
  networkClient,
  getCurrentSessionId: () => currentSessionId,
  getProjectPath: () => storage.getActiveProjectPath(),
});

const tts = createTTSAdapter({
  mode: isRemoteMode ? "remote" : "local",
  ttsService: isRemoteMode ? (remoteTtsMode === "local" ? ttsService : null) : ttsService,
  ttsMode: isRemoteMode ? remoteTtsMode : "local",
});

// ── Restore persisted session ──
if (!sessionManager.getActiveSession()) {
  const defaultIdx = config.projects?.defaultProjectIndex || 0;
  sessionManager.createSession(defaultIdx);
}
function syncFromManager() { storage.syncFromManager({ get activeJarvisSessionId() { return activeJarvisSessionId; }, set activeJarvisSessionId(v) { activeJarvisSessionId = v; }, get currentSessionId() { return currentSessionId; }, set currentSessionId(v) { currentSessionId = v; }, get conversationHistory() { return conversationHistory; }, set conversationHistory(v) { conversationHistory = v; }, get fullBuffer() { return fullBuffer; }, set fullBuffer(v) { fullBuffer = v; } }); }
function syncToManager() { storage.syncToManager({ activeJarvisSessionId, currentSessionId, conversationHistory, fullBuffer }); }
syncFromManager();

function getActiveProjectIndex() {
  const session = sessionManager.getActiveSession();
  return session ? session.projectIndex : (config.projects?.defaultProjectIndex || 0);
}

// ── Create UI components ──
const arcReactor = createArcReactor({ available });
const section = arcReactor.el.section;
const textInput = createTextInput();

const terminal = createTerminalPanel({
  onClose: () => {
    tts.stop();
    if (isRemoteMode) {
      if (uiState === "streaming" || uiState === "transcribing") networkClient?.sendCancel();
    } else {
      processMgr.kill();
    }
    terminal.hide(!!currentSessionId);
    if (uiState !== "idle") setUIState("idle");
  },
  getFullText: () => fullBuffer,
  onMuteToggle: () => {
    const muted = tts.toggleMute();
    terminal.setMuteState(muted);
    storage.writeTtsPrefs({ muted });
  },
});

// TTS mute restore
const ttsEnabled = tts.isEnabled;
if (ttsEnabled) {
  const ttsPrefs = storage.readTtsPrefs();
  if (ttsPrefs.muted) { tts.mute(); terminal.setMuteState(true); }
  terminal.setMuteVisible(true);
  // Speaking pulse
  let speakPulseId = setInterval(() => {
    if (tts.isSpeaking && !tts.isMuted) {
      terminal.el.muteBtn.style.animation = animOrNone("jarvisPulse 2s ease-in-out infinite");
    } else if (terminal.el.muteBtn.style.animation) {
      terminal.el.muteBtn.style.animation = "";
    }
  }, 500);
  ctx.intervals.push(speakPulseId);
  ctx.registerPausable(
    () => { speakPulseId = setInterval(() => { /* same */ }, 500); ctx.intervals.push(speakPulseId); },
    () => { clearInterval(speakPulseId); }
  );
}

function sendControlResponse(requestId, response) {
  if (isRemoteMode && networkClient) {
    if (response.subtype === "success" && response.response?.behavior) {
      networkClient.sendPermissionResponse(requestId, response.response.behavior, response.updated_permissions);
    } else if (response.subtype === "elicitation_complete") {
      networkClient.sendQuestionResponse(requestId, response.response);
    }
  } else {
    processMgr.sendStdinMessage({ type: "control_response", response });
  }
}

const cards = createCardRenderer({
  sendControlResponse,
  onHistoryPush: (entry) => { conversationHistory.push(entry); syncToManager(); },
  syncToManager,
  ttsService: tts,
  personalityCfg: processMgr.personalityCfg,
  showStatusLabels: terminal.showStatusLabels,
});

const projSelector = createProjectSelector({
  onSelect: (idx) => {
    const current = sessionManager.getActiveSession();
    if (current) {
      current.projectIndex = idx;
      sessionManager.saveImmediate();
    }
    updateProjectTag();
    projSelector.update();
  },
  isDisabled: () => uiState === "streaming" || uiState === "launching" || uiState === "recording" || uiState === "transcribing",
});

const tabs = createSessionTabs({
  onSwitch: (id) => switchToSession(id),
  onClose: (id) => closeSession(id),
  onCreate: (idx) => createNewSession(idx),
});

const connBar = isRemoteMode ? createConnectionBar(networkClient) : null;

// Wire header status line to connection state
if (ctx._statusLineUpdate) {
  if (isRemoteMode && networkClient) {
    networkClient.onStateChange((state) => {
      ctx._statusLineUpdate(state);
    });
    ctx._statusLineUpdate(networkClient.state || "disconnected");
  } else {
    ctx._statusLineUpdate("connected");
  }
}

// ── Assemble DOM ──
section.appendChild(projSelector.el.selector);
section.appendChild(textInput.el.row);
if (connBar) section.appendChild(connBar.el.bar);
section.appendChild(terminal.el.panel);
terminal.el.panel.appendChild(tabs.el.tabBar);

// Decorative line
section.appendChild(el("div", {
  width: isNarrow ? "60%" : "30%", height: "1px",
  background: `linear-gradient(90deg, transparent, ${T.accent}44, transparent)`,
  marginTop: isNarrow ? "16px" : "20px",
}));

if (!available) return section;

// ── UI state ──
let uiState = "idle";

function setUIState(newState) {
  uiState = newState;
  ctx._jarvisStreaming = (newState === "streaming" || newState === "launching");
  const hasHistory = currentSessionId || conversationHistory.length > 0;
  arcReactor.updateVisualState(newState, hasHistory);

  terminal.setBadgeState(
    newState === "streaming" ? "running" : newState === "done" ? "success" : newState === "error" ? "error" : "idle"
  );

  const inputBusy = (newState === "recording" || newState === "transcribing" || newState === "launching");
  textInput.setDisabled(inputBusy);
  const selectorBusy = inputBusy || newState === "streaming";
  projSelector.setEnabled(!selectorBusy);
  updateSessionIndicator();
}

function updateProjectTag() {
  const idx = getActiveProjectIndex();
  const color = sessionManager.getProjectColor(idx);
  const icon = sessionManager.getProjectIcon(idx);
  const proj = sessionManager.getProject(idx);
  terminal.setProjectTag(icon, proj?.label || `Project ${idx}`, color);
}

function updateSessionIndicator() {
  projSelector.update();
  updateProjectTag();
  tabs.render();
}

// ── Session management ──
function switchToSession(jarvisSessionId) {
  if (jarvisSessionId === activeJarvisSessionId) return;
  tabs.cancelTabEdit();
  syncToManager();
  const current = sessionManager.getActiveSession();
  if (current && current.status === "streaming") current._notifyBadge = false;
  sessionManager.setActiveSession(jarvisSessionId);
  syncFromManager();
  replayTerminalForActiveSession();
  updateSessionIndicator();
  const newSession = sessionManager.getActiveSession();
  if (newSession) {
    newSession._notifyBadge = false;
    if (newSession.status === "streaming") setUIState("streaming");
    else if (newSession.conversationHistory.length > 0) setUIState("done");
    else setUIState("idle");
  }
}

function createNewSession(projectIndex) {
  syncToManager();
  tabs.cancelTabEdit();
  const session = sessionManager.createSession(projectIndex);
  activeJarvisSessionId = session.id;
  currentSessionId = null;
  conversationHistory = [];
  fullBuffer = "";
  preSpawnJsonlSet = null;
  terminal.clear();
  terminal.setBadgeState("idle");
  updateSessionIndicator();
  setUIState("idle");
}

function closeSession(jarvisSessionId) {
  tabs.cancelTabEdit();
  const session = sessionManager.getSession(jarvisSessionId);
  if (!session) return;
  if (session.status === "streaming" && jarvisSessionId === activeJarvisSessionId) {
    if (isRemoteMode) networkClient?.sendCancel();
    else processMgr.kill();
  }
  const wasActive = jarvisSessionId === activeJarvisSessionId;
  sessionManager.removeSession(jarvisSessionId);
  if (wasActive) {
    const remaining = sessionManager.getAllSessions();
    if (remaining.length > 0) {
      syncFromManager();
      replayTerminalForActiveSession();
    } else {
      const defaultIdx = config.projects?.defaultProjectIndex || 0;
      const newSession = sessionManager.createSession(defaultIdx);
      activeJarvisSessionId = newSession.id;
      currentSessionId = null;
      conversationHistory = [];
      fullBuffer = "";
      terminal.clear();
      if (terminal.isVisible()) terminal.hide();
    }
    setUIState("idle");
    terminal.setBadgeState("idle");
  }
  updateSessionIndicator();
}

function replayTerminalForActiveSession() {
  const outputArea = terminal.getOutputArea();
  outputArea.innerHTML = "";
  if (!currentSessionId && conversationHistory.length === 0) return;

  let _replayThinkingShown = false;
  for (let i = 0; i < conversationHistory.length; i++) {
    const turn = conversationHistory[i];
    if (turn.role === "user") {
      _replayThinkingShown = false;
      if (i > 0) terminal.appendTurnSeparator();
      const echoLine = terminal.appendEchoLine(turn.text, i > 0, currentSessionId);
      terminal.addMessageCopyIcon(echoLine, () => turn.text);
    } else if (turn.role === "tool") {
      if (!terminal.showToolUseLabels) continue;
      const skipTools = { Skill: 1, Agent: 1, WebSearch: 1, WebFetch: 1 };
      if (skipTools[turn.text]) continue;
      terminal.appendToolUseLabel(turn.text);
    } else if (turn.role === "permission") {
      cards.renderCompletedInteractionCard({
        type: "permission", tool: turn.tool, input: turn.input,
        decision: turn.decision, requestId: turn.requestId,
      }, outputArea, outputArea);
    } else if (turn.role === "question") {
      cards.renderCompletedInteractionCard({
        type: "question", message: turn.message, options: turn.options,
        answer: turn.answer, requestId: turn.requestId,
      }, outputArea, outputArea);
    } else if (turn.role === "status") {
      if (turn.type === "thinking") {
        if (!_replayThinkingShown) {
          _replayThinkingShown = true;
          cards.renderStatusLabel(turn.type, turn.label, outputArea, outputArea, { replay: true });
        }
        continue;
      }
      cards.renderStatusLabel(turn.type, turn.label, outputArea, outputArea, { replay: true });
    } else if (turn.role === "assistant") {
      const assistantDiv = el("div", { color: T.text, position: "relative" });
      assistantDiv.appendChild(markdownRenderer.renderMarkdown(turn.text));
      const txt = turn.text;
      terminal.addMessageCopyIcon(assistantDiv, () => txt);
      outputArea.appendChild(assistantDiv);
      if (terminal.showCompletionLabel) {
        outputArea.appendChild(el("div", {
          color: T.accent, opacity: "0.6", marginTop: "8px",
          fontSize: isNarrow ? "10px" : "11px", letterSpacing: "1px",
        }, `[${terminal.completionLabel}]`));
      }
    }
  }
  if (conversationHistory.length > 0) {
    terminal.show();
    terminal.setBadgeState("success");
  }
}

// ── Close all dropdowns on scroll ──
function closeAllDropdowns() { projSelector.closeDropdown(); tabs.hideTabAddPicker(); }
document.addEventListener("scroll", closeAllDropdowns, { passive: true, capture: true });
ctx.cleanups.push(() => document.removeEventListener("scroll", closeAllDropdowns, { capture: true }));

// ── Restore persisted session UI ──
if (conversationHistory.length > 0) {
  replayTerminalForActiveSession();
  updateSessionIndicator();
  setUIState("done");
}

// Initial tag + tab render
updateProjectTag();
tabs.render();

// ── Recording actions ──
function beginRecording() {
  tts.stop();
  if (isRemoteMode) {
    recorder.start().then(() => {
      if (terminal.getOutputArea().textContent.trim()) terminal.show();
      setUIState("recording");
      arcReactor.startTimer();
    }).catch(err => {
      new Notice("Microphone error: " + err.message, 5000);
      setUIState("error");
    });
  } else {
    recorder.start().then(() => {
      setUIState("recording");
      arcReactor.startTimer();
    }).catch(err => {
      new Notice("Recording failed: " + err.message, 5000);
      setUIState("idle");
    });
  }
}

function finishRecording() {
  arcReactor.stopTimer();
  if (isRemoteMode) {
    recorder.stop();
    if (conversationHistory.length > 0) terminal.appendTurnSeparator();
    setUIState("transcribing");
  } else {
    setUIState("transcribing");
    recorder.stopAndTranscribe().then(result => {
      const text = typeof result === "string" ? result : result.text;
      const detectedLang = typeof result === "string" ? null : result.detectedLang;
      currentDetectedLang = detectedLang;
      if (!text || !text.trim()) {
        new Notice("No speech detected. Try again.");
        setUIState("idle");
        return;
      }
      const trimmed = text.trim();
      arcReactor.showPreview(trimmed);
      setUIState("launching");
      setTimeout(() => {
        conversationHistory.push({ role: "user", text: trimmed, timestamp: Date.now() });
        syncToManager();
        launchClaudeInPanel(trimmed);
        setTimeout(() => arcReactor.hidePreview(), 2000);
      }, 400);
    }).catch(err => {
      new Notice("Transcription failed: " + err.message, 5000);
      setUIState("idle");
    });
  }
}

// ── Voice service state sync (local mode) ──
if (!isRemoteMode) {
  recorder.onStateChange((vsState) => {
    if (vsState === "idle" && uiState === "recording") {
      arcReactor.stopTimer();
      setUIState("idle");
    }
  });
}

// ── Cancel / stop streaming ──
function cancelStreaming() {
  if (isRemoteMode) {
    networkClient?.sendCancel();
    tts.stop();
  } else {
    tts.stop();
    processMgr.kill();
  }
}

// ── Text input handler ──
textInput.onSend((text) => {
  if (!text) return;
  tabs.cancelTabEdit();
  if (uiState === "streaming") {
    cancelStreaming();
    terminal.appendCancelLine();
  } else if (uiState === "transcribing" || uiState === "launching" || uiState === "recording") {
    return;
  }
  textInput.clear();
  if (isRemoteMode) {
    if (!networkClient?.isConnected) return;
    terminal.show();
    if (conversationHistory.length > 0) terminal.appendTurnSeparator();
    const echoLine = terminal.appendEchoLine(text, false, null);
    conversationHistory.push({ role: "user", text, timestamp: Date.now() });
    syncToManager();
    setUIState("streaming");
    terminal.setBadgeState("running");
    networkClient.sendTextCommand(text, currentSessionId, storage.getActiveProjectPath());
  } else {
    conversationHistory.push({ role: "user", text, timestamp: Date.now() });
    syncToManager();
    setUIState("launching");
    setTimeout(() => launchClaudeInPanel(text), 200);
  }
});

// ── Keyboard handlers ──
function handleKeyDown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === "c" && (uiState === "streaming" || uiState === "transcribing")) {
    e.preventDefault();
    cancelStreaming();
    terminal.appendCancelLine();
    setUIState("done");
    return;
  }
  if (e.key === "Escape") {
    if (uiState === "recording") {
      e.preventDefault();
      recorder.cancel();
      arcReactor.stopTimer();
      setUIState("idle");
      if (!isRemoteMode) new Notice("Voice command cancelled.");
    } else if (uiState === "streaming" || uiState === "transcribing") {
      e.preventDefault();
      cancelStreaming();
      terminal.hide();
      setUIState("idle");
      updateSessionIndicator();
    }
  }
}
document.addEventListener("keydown", handleKeyDown);
ctx.cleanups.push(() => document.removeEventListener("keydown", handleKeyDown));

// ── Pointer events ──
if (isRemoteMode) {
  arcReactor.el.btnContainer.addEventListener("click", async () => {
    if (!networkClient?.isConnected) { networkClient?.connect(); return; }
    if (uiState === "idle" || uiState === "done" || uiState === "error") {
      beginRecording();
    } else if (uiState === "recording") {
      finishRecording();
    } else if (uiState === "streaming" || uiState === "transcribing") {
      cancelStreaming();
      terminal.appendCancelLine();
      setUIState("done");
    }
    tts.resumeAudioContext();
  });
} else {
  let isLongPress = false;
  let longPressTimer = null;
  arcReactor.el.btnContainer.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (uiState === "transcribing" || uiState === "launching") return;
    if (uiState === "streaming") {
      cancelStreaming();
      terminal.appendCancelLine();
      setUIState("done");
      return;
    }
    isLongPress = false;
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      isLongPress = true;
      if (voiceService.getState() === "idle" && (uiState === "idle" || uiState === "done" || uiState === "error")) {
        beginRecording();
      }
    }, 300);
  });
  arcReactor.el.btnContainer.addEventListener("pointerup", (e) => {
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
      if (voiceService.getState() === "recording" && uiState === "recording") finishRecording();
    }
  });
  arcReactor.el.btnContainer.addEventListener("pointerleave", () => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (isLongPress && voiceService.getState() === "recording") { isLongPress = false; finishRecording(); }
    isLongPress = false;
  });
}

// ── Hover effects ──
arcReactor.el.btnContainer.addEventListener("mouseenter", () => {
  if (uiState === "idle" || uiState === "done" || uiState === "error") {
    arcReactor.el.core.style.borderColor = T.accent + "77";
    arcReactor.el.core.style.boxShadow = `0 0 20px ${T.accent}35, 0 0 40px ${T.accent}15, inset 0 0 16px rgba(0,0,0,0.6)`;
  }
});
arcReactor.el.btnContainer.addEventListener("mouseleave", () => {
  if (uiState === "idle" || uiState === "done" || uiState === "error") {
    arcReactor.el.core.style.borderColor = T.accent + "44";
    arcReactor.el.core.style.boxShadow = `0 0 12px ${T.accent}20, inset 0 0 16px rgba(0,0,0,0.6)`;
  }
});

// ═══════════════════════════════════════════
// ── Claude process launching (local mode) ──
// ═══════════════════════════════════════════

function launchClaudeInPanel(text) {
  if (!processMgr.isAvailable) {
    terminal.show();
    terminal.clear();
    terminal.appendErrorLine("setup", "claude CLI not found. Install it or set terminal.claudePath in config.json");
    setUIState("error");
    new Notice("Claude CLI not found. Check installation or config.", 5000);
    return;
  }

  processMgr.kill();
  tts.stop();

  const isResume = !!currentSessionId;
  const outputArea = terminal.getOutputArea();
  const cwd = storage.expandPath(storage.getActiveProjectPath()) || app.vault.adapter.basePath;

  if (!isResume) {
    fullBuffer = "";
    outputArea.innerHTML = "";
    preSpawnJsonlSet = storage.snapshotJsonlFiles();
  } else {
    terminal.appendTurnSeparator();
    fullBuffer += "\n\n---\n\n";
  }

  // Echo line
  const echoLine = terminal.appendEchoLine(text, isResume, currentSessionId);
  terminal.addMessageCopyIcon(echoLine, () => text);

  // Stream output block
  const { outputContent, cursorEl } = terminal.createStreamOutputBlock();
  terminal.show();

  // Spawn process
  const proc = processMgr.spawnProcess(currentSessionId, cwd);

  // Prepend language tag
  let messageText = text;
  const supported = (config.language?.supported) || {};
  if (currentDetectedLang && Object.keys(supported).length > 0 && supported[currentDetectedLang]) {
    const langLabel = supported[currentDetectedLang].label || currentDetectedLang;
    messageText = `[Language: ${langLabel}]\n${text}`;
  }

  processMgr.sendStdinMessage({
    type: "user",
    message: { role: "user", content: [{ type: "text", text: messageText }] },
  });

  setUIState("streaming");

  // ── Stream state ──
  let currentTurnBuffer = "";
  let speakBuffer = "";
  let speakFlushTimer = null;

  const streamState = reconnect.createStreamState(proc, currentSessionId, {
    jarvisSessionId: activeJarvisSessionId,
    projectIndex: getActiveProjectIndex(),
    detectedLang: currentDetectedLang,
    conversationHistory: [...conversationHistory],
    preSpawnJsonlSet,
  });

  const _ownerSession = sessionManager.getSession(activeJarvisSessionId);
  if (_ownerSession) _ownerSession.status = "streaming";

  // ── Attach delegates ──
  attachDelegates(streamState, outputContent, outputArea, cursorEl, () => currentTurnBuffer, (v) => { currentTurnBuffer = v; });

  // TTS speak buffer helpers
  streamState._onTextDelta = ((origDelta) => (txt) => {
    origDelta(txt);
    if (tts.isEnabled && !tts.isMuted) {
      speakBuffer += txt;
      const sentenceEnd = /^([\s\S]*?[.!?])(\s+|\n\n)/;
      let match;
      while ((match = sentenceEnd.exec(speakBuffer)) !== null) {
        const sentence = match[1].trim();
        if (sentence) tts.speak(stripMarkdown(sentence), currentDetectedLang);
        speakBuffer = speakBuffer.slice(match[0].length);
      }
      if (speakFlushTimer) clearTimeout(speakFlushTimer);
      if (speakBuffer.trim()) {
        speakFlushTimer = setTimeout(() => {
          if (speakBuffer.trim()) { tts.speak(stripMarkdown(speakBuffer.trim()), currentDetectedLang); speakBuffer = ""; }
        }, 500);
      }
    }
  })(streamState._onTextDelta);

  const origClose = streamState._onClose;
  streamState._onClose = (code) => {
    if (speakFlushTimer) clearTimeout(speakFlushTimer);
    if (tts.isEnabled && !tts.isMuted && speakBuffer.trim()) {
      tts.speak(stripMarkdown(speakBuffer.trim()), currentDetectedLang);
    }
    speakBuffer = "";
    origClose(code);
  };

  streamState._activeSection = section;

  // ── Process handlers ──
  attachProcessHandlers(proc);
}

function attachDelegates(st, oc, to, ce, getTurnBuffer, setTurnBuffer) {
  st._turnTextNodes = [];
  const streamRenderer = markdownRenderer.createStreamRenderer(oc);
  st._streamRenderer = streamRenderer;

  st._onTextDelta = (txt) => {
    setTurnBuffer(getTurnBuffer() + txt);
    fullBuffer += txt;
    st._lastStatusLabel = null;
    streamRenderer.append(txt);
    st._turnTextNodes = streamRenderer.getTextNodes();
    to.scrollTop = to.scrollHeight;
  };

  st._onToolUse = (toolName) => {
    const hasStatusLabel = { Skill: 1, Agent: 1, WebSearch: 1, WebFetch: 1 };
    if (!hasStatusLabel[toolName]) {
      conversationHistory.push({ role: "tool", text: toolName, timestamp: Date.now() });
    }
    if (!terminal.showToolUseLabels) return;
    const alwaysAsk = interactiveCfg.alwaysAskTools || [];
    if (alwaysAsk.includes(toolName) && !hasStatusLabel[toolName]) {
      terminal.appendToolUseLabel(toolName);
    }
  };

  st._onStderr = (text) => {
    const cleaned = stripAnsi(text);
    fullBuffer += cleaned;
    oc.appendChild(el("span", { color: T.red }, cleaned));
    to.scrollTop = to.scrollHeight;
  };

  st._onClose = (code) => {
    processMgr.process = null;
    // Flush any remaining lineBuf data in the stream handler before finalize
    if (st.getState && st.getState().lineBuf) {
      st.processNdjsonLine(st.getState().lineBuf);
    }
    if (st._streamRenderer) st._streamRenderer.finalize();
    if (ce?.parentNode) ce.parentNode.removeChild(ce);
    const turnBuf = getTurnBuffer();
    if (turnBuf) terminal.addMessageCopyIcon(oc, () => turnBuf);
    terminal.appendCompletionLine(code);
    to.scrollTop = to.scrollHeight;

    if (code === 0 && preSpawnJsonlSet && !currentSessionId) {
      const detectedId = storage.detectNewSession(preSpawnJsonlSet);
      if (detectedId) currentSessionId = detectedId;
      preSpawnJsonlSet = null;
    }
    if (st.sessionId && !currentSessionId) currentSessionId = st.sessionId;
    if (code === 0 && turnBuf) {
      conversationHistory.push({ role: "assistant", text: turnBuf, timestamp: Date.now() });
    }

    const ownerSession = st.jarvisSessionId ? sessionManager.getSession(st.jarvisSessionId) : null;
    if (ownerSession) {
      ownerSession.sessionId = currentSessionId;
      ownerSession.conversationHistory = conversationHistory;
      ownerSession.fullBuffer = fullBuffer;
      ownerSession.status = code === 0 ? "done" : "error";
      ownerSession.lastActiveAt = Date.now();
      if (st.jarvisSessionId !== sessionManager.getActiveSessionId()) {
        ownerSession._notifyBadge = true;
        sessionManager.saveImmediate();
        tabs.render();
        reconnect.clearStreamState();
        return;
      }
    }
    syncToManager();
    reconnect.clearStreamState();
    setUIState(code === 0 ? "done" : "error");
  };

  st._onPermissionRequest = (requestId, request) => {
    st.pendingInteractions.push({
      type: "permission", requestId, data: request,
      status: "pending", answer: null, timestamp: Date.now(),
    });
    cards.renderPermissionCard(requestId, request, oc, to);
  };

  st._onQuestionRequest = (requestId, request) => {
    st.pendingInteractions.push({
      type: "question", requestId, data: request,
      status: "pending", answer: null, timestamp: Date.now(),
    });
    cards.renderQuestionCard(requestId, request, oc, to);
  };

  st._onDisplayCard = (type, data) => ({ container: oc, scrollParent: to });
}

function attachProcessHandlers(proc) {
  proc.stdout.on("data", (chunk) => {
    const st = reconnect.getActiveStream();
    if (!st) return;
    st.lineBuf += stripAnsi(chunk.toString("utf8"));
    const lines = st.lineBuf.split("\n");
    st.lineBuf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line);
        // Text delta
        if (evt.type === "stream_event" && evt.event?.type === "content_block_delta" && evt.event?.delta?.type === "text_delta") {
          const txt = evt.event.delta.text;
          st.buffer += txt;
          if (st._onTextDelta) st._onTextDelta(txt);
        }
        // Tool-use start
        if (evt.type === "stream_event" && evt.event?.type === "content_block_start" && evt.event?.content_block?.type === "tool_use") {
          const block = evt.event.content_block;
          st.activeToolBlock = { name: block.name, id: block.id, index: evt.event.index, inputJsonChunks: [], controlRequestFired: false };
          st.toolEvents.push(block.name);
          if (st._onToolUse) st._onToolUse(block.name);
        }
        // Input JSON delta
        if (evt.type === "stream_event" && evt.event?.type === "content_block_delta" && evt.event?.delta?.type === "input_json_delta") {
          if (st.activeToolBlock) st.activeToolBlock.inputJsonChunks.push(evt.event.delta.partial_json);
        }
        // Tool-use complete
        if (evt.type === "stream_event" && evt.event?.type === "content_block_stop" && st.activeToolBlock) {
          const block = st.activeToolBlock;
          st.activeToolBlock = null;
          let parsedInput = {};
          try { parsedInput = JSON.parse(block.inputJsonChunks.join("")); } catch {}
          handleToolComplete(st, block, parsedInput);
        }
        // Control request
        if (evt.type === "control_request") {
          const req = evt.request || {};
          if (st.activeToolBlock && st.activeToolBlock.name === req.tool_name) st.activeToolBlock.controlRequestFired = true;
          if (req.subtype === "can_use_tool") {
            const autoApprove = interactiveCfg.autoApproveTools || [];
            if (autoApprove.includes(req.tool_name)) {
              sendControlResponse(evt.request_id, { subtype: "success", request_id: evt.request_id, response: { behavior: "allow" } });
            } else if (st._onPermissionRequest) {
              st._onPermissionRequest(evt.request_id, req);
            }
          } else if (req.subtype === "elicitation") {
            const pendingAsk = st.pendingInteractions.find(i => i.type === "askuser" && i.status === "pending");
            if (pendingAsk) {
              pendingAsk.elicitationRequestId = evt.request_id;
            } else if (st._onQuestionRequest) {
              st._onQuestionRequest(evt.request_id, req);
            }
          }
        }
        // Session ID
        if (evt.session_id && !st.sessionId) st.sessionId = evt.session_id;
        // Result
        if (evt.type === "result") {
          if (evt.session_id) st.sessionId = evt.session_id;
          st.resultReceived = true;
          const hasPending = interactiveCfg.interactivePermissions && st.pendingPermissions.some(p => p.status === "pending");
          const hasPendingAskUser = st.pendingInteractions.some(i => i.type === "askuser" && i.status === "pending");
          if (hasPending) {
            st.uiState = "waiting_permission";
            if (st.process?.stdin?.writable) st.process.stdin.end();
          } else if (hasPendingAskUser) {
            st.uiState = "waiting_askuser";
          } else {
            st.uiState = "closing";
            if (st.process?.stdin?.writable) st.process.stdin.end();
          }
        }
        if (evt.type === "result" && evt.result && !st.buffer) {
          st.buffer += evt.result;
          if (st._onTextDelta) st._onTextDelta(evt.result);
        }
        // Assistant event (AskUserQuestion, thinking)
        if (evt.type === "assistant" && evt.message?.content) {
          let hasThinking = false;
          for (const block of evt.message.content) {
            if (block.type === "thinking" && !hasThinking) {
              hasThinking = true;
              if (!st._thinkingShown && st._onDisplayCard) {
                st._thinkingShown = true;
                const refs = st._onDisplayCard();
                if (refs) cards.renderStatusLabel("thinking", "", refs.container, refs.scrollParent);
              }
            }
            if (block.type === "tool_use" && block.name === "AskUserQuestion" && block.input) {
              const alreadyRendered = st.pendingInteractions.some(i => i.type === "askuser" && i.toolUseId === block.id);
              if (!alreadyRendered) {
                const questions = block.input.questions || [];
                if (questions.length > 0 && st._onDisplayCard) {
                  const refs = st._onDisplayCard("askuser");
                  if (refs) cards.renderAskUserQuestionForm(block.id, block.input, refs.container, refs.scrollParent);
                } else if (block.input.question || block.input.message) {
                  cards.renderDisplayOnlyQuestionCard(block.input, st);
                }
              }
            }
          }
        }
      } catch (e) {
        console.log("[JARVIS-DEBUG] JSON parse failed:", line.substring(0, 1000), e.message);
      }
    }
  });

  proc.stderr.on("data", (chunk) => {
    const st = reconnect.getActiveStream();
    if (st?._onStderr) st._onStderr(chunk.toString("utf8"));
  });

  proc.on("close", (code) => {
    const st = reconnect.getActiveStream();
    if (st) {
      if (st.process && st.process !== proc) return;
      st.process = null;
      if (st._retryPending) {
        st._retryPending = false;
        const cwd = storage.expandPath(storage.getActiveProjectPath()) || app.vault.adapter.basePath;
        const newProc = processMgr.spawnRetryProcess(st, cwd);
        if (newProc) attachProcessHandlers(newProc);
        return;
      }
      if (st.uiState === "waiting_permission" || st.uiState === "waiting_askuser") return;
      st.exitCode = code;
      st.uiState = "done";
      st.pendingInteractions.forEach(i => { if (i.type === "askuser" && i.status === "pending") i.status = "expired"; });
      if (st.tempPermissions?.length > 0) {
        st.tempPermissions.forEach(entry => storage.removeSettingsPermission(entry));
        st.tempPermissions = [];
      }
    }
    if (st?._onClose) {
      st._onClose(code);
    } else if (st) {
      if (code === 0 && st.buffer) {
        st.conversationHistory.push({ role: "assistant", text: st.buffer, timestamp: Date.now() });
      }
    }
  });

  proc.on("error", (err) => {
    const st = reconnect.getActiveStream();
    if (st) {
      if (st.process && st.process !== proc) return;
      st.uiState = "error";
      st.process = null;
      if (st.tempPermissions?.length > 0) {
        st.tempPermissions.forEach(entry => storage.removeSettingsPermission(entry));
        st.tempPermissions = [];
      }
    }
    if (st?._onClose) st._onClose(-1);
    else reconnect.clearStreamState();
  });
}

function handleToolComplete(st, block, parsedInput) {
  const alwaysAsk = interactiveCfg.alwaysAskTools || [];

  if (interactiveCfg.interactivePermissions && alwaysAsk.includes(block.name)) {
    let specificEntry, dirEntry;
    if (block.name === "Bash" && parsedInput.command) {
      const cmd = parsedInput.command;
      specificEntry = `Bash(${cmd})`;
      dirEntry = `Bash(${cmd.split(/\s+/)[0]} *)`;
    } else {
      const filePath = parsedInput.file_path || parsedInput.path || "";
      const parentDir = filePath ? nodePath.dirname(filePath) : "";
      specificEntry = filePath ? `${block.name}(/${filePath})` : block.name;
      dirEntry = parentDir ? `${block.name}(/${parentDir}/**)` : null;
    }
    const existingPerm = dirEntry && st.pendingPermissions.find(p => p.dirEntry === dirEntry && p.toolName === block.name && p.status !== "denied");
    if (existingPerm) {
      st.pendingPermissions.push({ toolName: block.name, input: parsedInput, specificEntry, dirEntry, status: "auto-covered", id: block.id });
    } else {
      const permItem = { toolName: block.name, input: parsedInput, specificEntry, dirEntry, status: "pending", id: block.id };
      st.pendingPermissions.push(permItem);
      if (st._onDisplayCard) {
        const refs = st._onDisplayCard("permission", permItem);
        if (refs) cards.renderSettingsPermissionCard(permItem, refs.container, refs.scrollParent);
      }
    }
  } else if (block.name === "AskUserQuestion") {
    const questions = parsedInput.questions || [];
    if (questions.length > 0 && st._onDisplayCard) {
      const refs = st._onDisplayCard("askuser");
      if (refs) cards.renderAskUserQuestionForm(block.id, parsedInput, refs.container, refs.scrollParent);
    } else if (parsedInput.question || parsedInput.message) {
      cards.renderDisplayOnlyQuestionCard(parsedInput, st);
    }
  } else if (!interactiveCfg.interactivePermissions && alwaysAsk.includes(block.name)) {
    cards.renderDisplayOnlyPermissionCard(block.name, parsedInput, st);
    conversationHistory.push({ role: "permission", tool: block.name, input: parsedInput, decision: "auto", requestId: null, timestamp: Date.now() });
  }

  // Status labels
  const statusTools = { Skill: "skill", Agent: "agent", WebSearch: "search", WebFetch: "search" };
  const labelType = statusTools[block.name];
  if (labelType && st._onDisplayCard) {
    let labelText = "";
    if (block.name === "Skill") labelText = parsedInput.skill || "";
    else if (block.name === "Agent") labelText = parsedInput.description || "";
    else if (block.name === "WebSearch") labelText = parsedInput.query || "";
    else if (block.name === "WebFetch") labelText = parsedInput.url ? parsedInput.url.replace(/^https?:\/\//, "").split("/")[0] : "";
    const refs = st._onDisplayCard();
    if (refs) cards.renderStatusLabel(labelType, labelText, refs.container, refs.scrollParent);
  }
}

// ═══════════════════════════════════════════
// ── Server message handlers (remote mode) ──
// ═══════════════════════════════════════════

if (isRemoteMode && networkClient) {
  let remoteFullBuffer = "";
  let remoteSpeakBuffer = "";
  let activeOutputContent = null;
  let activeCursorEl = null;
  let activeStreamRenderer = null;
  const outputArea = terminal.getOutputArea();

  networkClient.on("transcription", (msg) => {
    currentDetectedLang = msg.detectedLang || null;
    terminal.show();
    const echoLine = terminal.appendEchoLine(msg.text, false, null);
    terminal.addMessageCopyIcon(echoLine, () => msg.text);
    activeOutputContent = el("div", { color: T.text });
    outputArea.appendChild(activeOutputContent);
    activeStreamRenderer = markdownRenderer.createStreamRenderer(activeOutputContent);
    activeCursorEl = el("span", {
      display: "inline-block", width: "8px", height: isNarrow ? "14px" : "16px",
      background: T.accent, animation: "jarvisCursorBlink 0.8s step-end infinite",
      verticalAlign: "middle", marginLeft: "2px",
    });
    outputArea.appendChild(activeCursorEl);
    conversationHistory.push({ role: "user", text: msg.text, timestamp: Date.now() });
    setUIState("streaming");
    terminal.setBadgeState("running");
    remoteFullBuffer = "";
  });

  networkClient.on("stream_delta", (msg) => {
    remoteFullBuffer += msg.text;
    fullBuffer += msg.text;
    if (!activeOutputContent) {
      terminal.show();
      activeOutputContent = el("div", { color: T.text });
      outputArea.appendChild(activeOutputContent);
      activeStreamRenderer = markdownRenderer.createStreamRenderer(activeOutputContent);
      activeCursorEl = el("span", {
        display: "inline-block", width: "8px", height: isNarrow ? "14px" : "16px",
        background: T.accent, animation: "jarvisCursorBlink 0.8s step-end infinite",
        verticalAlign: "middle", marginLeft: "2px",
      });
      outputArea.appendChild(activeCursorEl);
      terminal.setBadgeState("running");
    }
    activeStreamRenderer.append(msg.text);
    outputArea.scrollTop = outputArea.scrollHeight;
    if (remoteTtsMode === "local" && tts.isEnabled && !tts.isMuted) {
      remoteSpeakBuffer += msg.text;
      const sentenceEnd = /^([\s\S]*?[.!?])(\s+|\n\n)/;
      let match;
      while ((match = sentenceEnd.exec(remoteSpeakBuffer)) !== null) {
        const sentence = match[1].trim();
        if (sentence) tts.speak(stripMarkdown(sentence), currentDetectedLang);
        remoteSpeakBuffer = remoteSpeakBuffer.slice(match[0].length);
      }
    }
  });

  networkClient.on("stream_end", (msg) => {
    if (activeCursorEl?.parentNode) activeCursorEl.parentNode.removeChild(activeCursorEl);
    activeCursorEl = null;
    if (msg.sessionId) { currentSessionId = msg.sessionId; updateSessionIndicator(); }
    if (activeStreamRenderer) activeStreamRenderer.finalize();
    if (activeOutputContent && remoteFullBuffer) {
      const bufCopy = remoteFullBuffer;
      terminal.addMessageCopyIcon(activeOutputContent, () => bufCopy);
    }
    if (remoteFullBuffer) conversationHistory.push({ role: "assistant", text: remoteFullBuffer, timestamp: Date.now() });
    syncToManager();
    if (remoteTtsMode === "local" && tts.isEnabled && !tts.isMuted && remoteSpeakBuffer.trim()) {
      tts.speak(stripMarkdown(remoteSpeakBuffer.trim()), currentDetectedLang);
    }
    remoteSpeakBuffer = "";
    if (terminal.showCompletionLabel) {
      outputArea.appendChild(el("div", {
        color: T.accent, opacity: "0.6", marginTop: "8px",
        fontSize: isNarrow ? "10px" : "11px", letterSpacing: "1px",
      }, `[${terminal.completionLabel}]`));
    }
    outputArea.scrollTop = outputArea.scrollHeight;
    remoteFullBuffer = "";
    activeOutputContent = null;
    activeStreamRenderer = null;
    setUIState("done");
    terminal.setBadgeState("success");
  });

  networkClient.on("tts_audio", (msg) => { tts.enqueueServerAudio(msg.data, msg.sampleRate); });
  networkClient.on("tts_end", () => {});

  networkClient.on("permission_request", (msg) => {
    if (!activeOutputContent) {
      terminal.show();
      activeOutputContent = el("div", { color: T.text });
      outputArea.appendChild(activeOutputContent);
    }
    cards.renderPermissionCard(msg.requestId, msg.request, outputArea, outputArea);
  });

  networkClient.on("question_request", (msg) => {
    if (!activeOutputContent) {
      terminal.show();
      activeOutputContent = el("div", { color: T.text });
      outputArea.appendChild(activeOutputContent);
    }
    cards.renderQuestionCard(msg.requestId, msg.request, outputArea, outputArea);
  });

  networkClient.on("error", (msg) => {
    if (activeCursorEl?.parentNode) activeCursorEl.parentNode.removeChild(activeCursorEl);
    activeCursorEl = null;
    activeOutputContent = null;
    terminal.appendErrorLine(msg.stage, msg.message);
    setUIState("error");
    remoteSpeakBuffer = "";
    remoteFullBuffer = "";
    terminal.setBadgeState("error");
  });
}

// ── Process cleanup ──
ctx.cleanups.push(() => {
  syncToManager();
  if (isRemoteMode) {
    if (recorder.isRecording) recorder.cancel();
    tts.stop();
  } else {
    const st = reconnect.getActiveStream();
    if (st && (st.uiState === "streaming" || st.uiState === "closing")) {
      reconnect.releaseOwnership(section);
    } else {
      processMgr.kill();
    }
  }
});

// ── Safety-net cleanup ──
const cleanupMs = perf?.cleanupIntervalMs || 5000;
let cleanupId = setInterval(() => {
  if (!document.contains(section)) {
    arcReactor.stopTimer();
    if (isRemoteMode) {
      if (recorder.isRecording) recorder.cancel();
      tts.stop();
    } else {
      const st = reconnect.getActiveStream();
      if (st && (st.uiState === "streaming" || st.uiState === "closing")) {
        reconnect.releaseOwnership(section);
      } else {
        processMgr.kill();
      }
      if (voiceService.getState() === "recording") voiceService.cancelRecording();
    }
    document.removeEventListener("keydown", handleKeyDown);
    clearInterval(cleanupId);
  }
}, cleanupMs);
ctx.intervals.push(cleanupId);
ctx.registerPausable(
  () => { cleanupId = setInterval(() => { if (!document.contains(section)) clearInterval(cleanupId); }, cleanupMs); ctx.intervals.push(cleanupId); },
  () => { clearInterval(cleanupId); }
);

// ── Reconnect to active streaming if re-rendered ──
(function reconnectIfStreaming() {
  const st = reconnect.getActiveStream();
  if (!st || isRemoteMode) return;

  reconnect.claimOwnership(section);

  if (st.uiState !== "streaming" && st.uiState !== "closing" && st.uiState !== "waiting_permission" && st.uiState !== "waiting_askuser") {
    if (st.uiState === "done" || st.uiState === "error") {
      currentSessionId = st.sessionId || currentSessionId;
      if (st.buffer) {
        terminal.show();
        const recoverContent = el("div", { color: T.text });
        recoverContent.appendChild(markdownRenderer.renderMarkdown(st.buffer));
        terminal.getOutputArea().appendChild(recoverContent);
        terminal.appendCompletionLine(st.exitCode);
        terminal.addMessageCopyIcon(recoverContent, () => st.buffer);
      }
      conversationHistory = st.conversationHistory || conversationHistory;
      reconnect.clearStreamState();
      syncToManager();
      setUIState(st.exitCode === 0 ? "done" : "error");
    }
    return;
  }

  // Active streaming — reconnect
  currentSessionId = st.sessionId || currentSessionId;
  conversationHistory = st.conversationHistory || conversationHistory;
  currentDetectedLang = st.detectedLang || null;
  processMgr.process = st.process;
  if (st.jarvisSessionId) {
    activeJarvisSessionId = st.jarvisSessionId;
    sessionManager.setActiveSession(st.jarvisSessionId);
  }

  const outputArea = terminal.getOutputArea();
  terminal.show();
  outputArea.innerHTML = "";
  const echoLine = el("div", { marginBottom: "4px" });
  echoLine.appendChild(el("span", { color: T.green }, "$ "));
  echoLine.appendChild(el("span", { color: T.textMuted, opacity: "0.6", fontSize: "10px" }, "[reconnected]"));
  outputArea.appendChild(echoLine);
  outputArea.appendChild(el("div", { height: "1px", background: `${T.accent}33`, margin: "8px 0" }));

  const recOutputContent = el("div", { color: T.text });
  if (st.buffer) recOutputContent.appendChild(markdownRenderer.renderMarkdown(st.buffer));
  outputArea.appendChild(recOutputContent);

  const recCursorEl = el("span", {
    display: "inline-block", width: "8px", height: isNarrow ? "14px" : "16px",
    background: T.accent, animation: "jarvisCursorBlink 0.8s step-end infinite",
    verticalAlign: "middle", marginLeft: "2px",
  });
  outputArea.appendChild(recCursorEl);

  let currentTurnBuffer = st.buffer;
  let speakBuffer = "";
  let speakFlushTimer = null;

  attachDelegates(st, recOutputContent, outputArea, recCursorEl, () => currentTurnBuffer, (v) => { currentTurnBuffer = v; });

  // Wrap with TTS
  const origDelta = st._onTextDelta;
  st._onTextDelta = (txt) => {
    origDelta(txt);
    if (tts.isEnabled && !tts.isMuted) {
      speakBuffer += txt;
      const sentenceEnd = /^([\s\S]*?[.!?])(\s+|\n\n)/;
      let match;
      while ((match = sentenceEnd.exec(speakBuffer)) !== null) {
        const sentence = match[1].trim();
        if (sentence) tts.speak(stripMarkdown(sentence), currentDetectedLang);
        speakBuffer = speakBuffer.slice(match[0].length);
      }
      if (speakFlushTimer) clearTimeout(speakFlushTimer);
      if (speakBuffer.trim()) {
        speakFlushTimer = setTimeout(() => {
          if (speakBuffer.trim()) { tts.speak(stripMarkdown(speakBuffer.trim()), currentDetectedLang); speakBuffer = ""; }
        }, 500);
      }
    }
  };

  const origClose = st._onClose;
  st._onClose = (code) => {
    if (speakFlushTimer) clearTimeout(speakFlushTimer);
    if (tts.isEnabled && !tts.isMuted && speakBuffer.trim()) tts.speak(stripMarkdown(speakBuffer.trim()), currentDetectedLang);
    origClose(code);
  };

  st._onDisplayCard = () => ({ container: recOutputContent, scrollParent: outputArea });

  // Re-render pending interactions
  for (const interaction of st.pendingInteractions) {
    if (interaction.status === "pending") {
      if (interaction.type === "permission") cards.renderPermissionCard(interaction.requestId, interaction.data, recOutputContent, outputArea);
      else if (interaction.type === "question") cards.renderQuestionCard(interaction.requestId, interaction.data, recOutputContent, outputArea);
      else if (interaction.type === "askuser") cards.renderAskUserQuestionForm(interaction.toolUseId, interaction.data, recOutputContent, outputArea);
    } else {
      cards.renderCompletedInteractionCard(interaction, recOutputContent, outputArea);
    }
  }
  for (const permItem of st.pendingPermissions) {
    if (permItem.status === "pending") cards.renderSettingsPermissionCard(permItem, recOutputContent, outputArea);
  }

  setUIState("streaming");
  terminal.setBadgeState("streaming");
  updateSessionIndicator();
  outputArea.scrollTop = outputArea.scrollHeight;
})();

return section;
