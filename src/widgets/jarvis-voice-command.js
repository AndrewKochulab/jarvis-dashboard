// JARVIS Voice Command Widget
// Arc reactor-style circular button — record voice, transcribe, stream Claude response in-panel
// Returns: HTMLElement

const { el, T, config, isNarrow, voiceService, ttsService, nodeFs, nodePath, markdownRenderer, animationsEnabled, perf, sessionManager } = ctx;
const cmdCfg = config.widgets?.voiceCommand || {};
const interactiveCfg = cmdCfg.interactive || {};
if (cmdCfg.enabled === false) return el("div", {});
const animOrNone = (s) => animationsEnabled ? s : "none";

// ── Session manager integration ──
let activeJarvisSessionId = null; // current Jarvis session ID (from session-manager)

// ── Global streaming state (survives DataviewJS re-renders) ──
// When Obsidian re-renders the block, the old widget is destroyed but the
// claude process keeps running. The new widget instance reconnects via this global.
if (typeof window.__jarvisStreamState === "undefined") {
  window.__jarvisStreamState = null;
}

// ── Mode detection ──
const isRemoteMode = cmdCfg.mode === "remote";
const networkClient = isRemoteMode ? ctx.networkClient : null;
const remoteTtsMode = isRemoteMode ? (cmdCfg.remoteTts || "local") : null;

const available = isRemoteMode ? true : voiceService.isAvailable;
const zoomMin = cmdCfg.zoomMin ?? 0.92;
const zoomMax = cmdCfg.zoomMax ?? 1.08;

// ── Terminal config ──
const termCfg = cmdCfg.terminal || {};
const showCommand = termCfg.showCommand !== false;
const termTitle = termCfg.title || "JARVIS OUTPUT";
const showProjectTag = termCfg.showProjectTag !== false;
const showStatusBadge = termCfg.showStatusBadge !== false;
const showCopyButton = termCfg.showCopyButton !== false;
const showCompletionLabel = termCfg.showCompletionLabel !== false;
const completionLabel = termCfg.completionLabel || "Process complete";
const showStatusLabels = termCfg.showStatusLabels !== false;
const showToolUseLabels = termCfg.showToolUseLabels !== false;

// ── Dynamic project path (replaces hardcoded termProjectPath) ──
function getActiveProjectPath() {
  const session = sessionManager.getActiveSession();
  if (session) {
    return sessionManager.getProjectPath(session.projectIndex);
  }
  // Fallback: use first tracked project or null
  const defaultIdx = config.projects?.defaultProjectIndex || 0;
  return sessionManager.getProjectPath(defaultIdx);
}

// ── Personality config ──
const personalityCfg = cmdCfg.personality || {};

// ── Local-only: Resolve claude binary path ──
let claudePath = null;
let claudeProcess = null;
if (!isRemoteMode) {
  const claudeSearchPaths = [
    nodePath.join(require("os").homedir(), ".local", "bin", "claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
  ];
  claudePath = termCfg.claudePath || null;
  if (!claudePath) {
    for (const p of claudeSearchPaths) {
      if (nodeFs.existsSync(p)) { claudePath = p; break; }
    }
  }
}

// ── Shared state ──
let fullBuffer = "";
let currentSessionId = null;
let currentDetectedLang = null;
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
  // Clean up any temporary permissions before destroying state
  const st = window.__jarvisStreamState;
  if (st?.tempPermissions?.length > 0) {
    st.tempPermissions.forEach(entry => removeSettingsPermission(entry));
    st.tempPermissions = [];
  }
  if (!isRemoteMode && claudeProcess) {
    try { claudeProcess.kill("SIGTERM"); } catch (e) {}
    claudeProcess = null;
  }
  window.__jarvisStreamState = null;
}

// ── settings.local.json permission management ──
function getSettingsPath() {
  const cwd = expandPath(getActiveProjectPath()) || app.vault.adapter.basePath;
  return nodePath.join(cwd, ".claude", "settings.local.json");
}

function readSettings() {
  try {
    const p = getSettingsPath();
    if (nodeFs.existsSync(p)) return JSON.parse(nodeFs.readFileSync(p, "utf8"));
  } catch {}
  return {};
}

function addSettingsPermission(entry) {
  try {
    const p = getSettingsPath();
    const settings = readSettings();
    settings.permissions = settings.permissions || {};
    settings.permissions.allow = settings.permissions.allow || [];
    if (!settings.permissions.allow.includes(entry)) {
      settings.permissions.allow.push(entry);
      nodeFs.writeFileSync(p, JSON.stringify(settings, null, 2));
      console.log("[JARVIS] Permission added:", entry, "→", p);
    } else {
      console.log("[JARVIS] Permission already exists:", entry);
    }
    return true;
  } catch (e) {
    console.error("[JARVIS] Failed to add permission:", entry, e.message);
    return false;
  }
}

function removeSettingsPermission(entry) {
  try {
    const settings = readSettings();
    const allow = settings.permissions?.allow || [];
    const idx = allow.indexOf(entry);
    if (idx >= 0) {
      allow.splice(idx, 1);
      nodeFs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
    }
  } catch {}
}

// ── Permission retry: kill-and-restart with --resume ──
// Claude CLI caches permissions at startup. For the retry process, we add
// user-approved tool names directly to --allowedTools (guaranteed to work).
function spawnRetryProcess() {
  const st = window.__jarvisStreamState;
  if (!st || !st.sessionId) {
    console.error("[JARVIS] Cannot retry — no streamState or sessionId");
    return;
  }

  const approvedTools = [...(st.retryAllowedTools || [])];
  console.log("[JARVIS] Starting retry. sessionId:", st.sessionId,
    "approved tools for --allowedTools:", approvedTools);

  currentSessionId = st.sessionId;
  st.pendingPermissions.forEach(p => { if (p.status === "approved") p.status = "retrying"; });
  st.resultReceived = false;
  st.lineBuf = "";

  const { spawn } = require("child_process");
  const cwd = expandPath(getActiveProjectPath()) || app.vault.adapter.basePath;
  const childEnv = Object.assign({}, process.env, { FORCE_COLOR: "0" });
  delete childEnv.CLAUDECODE;
  delete childEnv.CLAUDE_CODE_ENTRYPOINT;
  delete childEnv.CLAUDE_CODE_MAX_OUTPUT_TOKENS;

  // Build args and merge approved tools into --allowedTools
  const args = buildClaudeArgs();
  if (approvedTools.length > 0) {
    const idx = args.indexOf("--allowedTools");
    if (idx >= 0 && idx + 1 < args.length) {
      const current = args[idx + 1].split(",");
      const merged = [...new Set([...current, ...approvedTools])];
      args[idx + 1] = merged.join(",");
    } else {
      args.push("--allowedTools", approvedTools.join(","));
    }
  }

  const newProc = spawn(claudePath, args, {
    cwd, env: childEnv, stdio: ["pipe", "pipe", "pipe"],
  });

  claudeProcess = newProc;
  st.process = newProc;
  st.uiState = "streaming";

  newProc.stdin.write(JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "text", text: "Permission granted. Please retry the file operation." }] },
  }) + "\n");

  attachProcessHandlers(newProc);
  console.log("[JARVIS] Spawned retry process with --resume", currentSessionId,
    "--allowedTools:", args[args.indexOf("--allowedTools") + 1]);
}

function spawnAskUserResumeProcess(answerText) {
  const st = window.__jarvisStreamState;
  if (!st || !st.sessionId) {
    console.error("[JARVIS] Cannot resume for AskUserQuestion — no streamState or sessionId");
    return;
  }

  currentSessionId = st.sessionId;
  st.resultReceived = false;
  st.lineBuf = "";
  st.uiState = "streaming";

  const { spawn } = require("child_process");
  const cwd = expandPath(getActiveProjectPath()) || app.vault.adapter.basePath;
  const childEnv = Object.assign({}, process.env, { FORCE_COLOR: "0" });
  delete childEnv.CLAUDECODE;
  delete childEnv.CLAUDE_CODE_ENTRYPOINT;
  delete childEnv.CLAUDE_CODE_MAX_OUTPUT_TOKENS;

  const args = buildClaudeArgs();
  const newProc = spawn(claudePath, args, {
    cwd, env: childEnv, stdio: ["pipe", "pipe", "pipe"],
  });

  claudeProcess = newProc;
  st.process = newProc;

  newProc.stdin.write(JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "text", text: answerText }] },
  }) + "\n");

  attachProcessHandlers(newProc);
  console.log("[JARVIS] Spawned AskUserQuestion resume process, sessionId:", currentSessionId);
}

function closeStdinIfDone(st) {
  st.uiState = "closing";
  if (st.process?.stdin?.writable) st.process.stdin.end();
}

// ── Session utilities ──
function getProjectSessionDir() {
  const cwd = expandPath(getActiveProjectPath()) || app.vault.adapter.basePath;
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

function buildPersonalityPrompt() {
  const template = personalityCfg.prompt;
  if (!template) return null;
  const name = personalityCfg.userName || "sir";
  const assistant = personalityCfg.assistantName || "JARVIS";
  let prompt = template.replace(/\{userName\}/g, name).replace(/\{assistantName\}/g, assistant);

  // Inject language instruction from supported languages config
  const langCfg = config.language || {};
  const supported = langCfg.supported;
  if (supported && Object.keys(supported).length > 0) {
    const tpl = personalityCfg.languageInstruction
      || "Always respond in the same language the user speaks. Supported languages: {languages}.";
    const names = Object.values(supported).map(e => e.label).filter(Boolean).join(", ")
      || Object.keys(supported).join(", ");
    prompt += "\n" + tpl.replace(/\{languages\}/g, names);
  }

  return prompt;
}

function buildClaudeArgs() {
  const args = [];
  if (currentSessionId) args.push("--resume", currentSessionId);
  args.push(
    "-p",
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--replay-user-messages",
    "--include-partial-messages"
  );

  // Build --allowedTools from interactive config
  const autoApprove = interactiveCfg.autoApproveTools || [];
  const alwaysAsk = interactiveCfg.alwaysAskTools || [];
  if (interactiveCfg.interactivePermissions) {
    // Only pre-approve autoApproveTools — alwaysAskTools trigger control_request
    if (autoApprove.length > 0) {
      args.push("--allowedTools", autoApprove.join(","));
    }
  } else {
    // Phase 1 (default): pre-approve all tools (no interactive permissions)
    const allAllowed = [...new Set([...autoApprove, ...alwaysAsk])];
    if (allAllowed.length > 0) {
      args.push("--allowedTools", allAllowed.join(","));
    }
  }

  const model = cmdCfg.model || null;
  if (model) args.push("--model", model);
  const personality = buildPersonalityPrompt();
  if (personality) args.push("--append-system-prompt", personality);
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
const SVG_SEND = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

// ═══════════════════════════════════════════════════
// ── Interactive Permissions & Questions ──
// ═══════════════════════════════════════════════════

// Pending question answers for batch submit
const pendingQuestions = new Map(); // requestId → { answered: bool, answer: any, message: string }
let batchSubmitBtn = null;
let batchSubmitContainer = null;

function updateBatchSubmitState() {
  if (!batchSubmitBtn || pendingQuestions.size === 0) return;
  const allAnswered = [...pendingQuestions.values()].every(q => q.answered);
  if (allAnswered) {
    batchSubmitBtn.style.opacity = "1";
    batchSubmitBtn.style.cursor = "pointer";
    batchSubmitBtn.style.animation = animOrNone("jarvisSubmitPulse 2s ease-in-out infinite");
  } else {
    batchSubmitBtn.style.opacity = "0.4";
    batchSubmitBtn.style.cursor = "not-allowed";
    batchSubmitBtn.style.animation = "none";
  }
}

function handleBatchSubmit() {
  const unanswered = [...pendingQuestions.entries()]
    .filter(([, q]) => !q.answered)
    .map(([, q]) => q.message);
  if (unanswered.length > 0) {
    new Notice(`Please answer: ${unanswered.join(", ")}`, 4000);
    return;
  }
  // Send all answers and persist
  const st = window.__jarvisStreamState;
  pendingQuestions.forEach((q, requestId) => {
    sendControlResponse(requestId, {
      subtype: "elicitation_complete",
      request_id: requestId,
      response: { selected: q.answer },
    });
    if (st) {
      const item = st.pendingInteractions.find(i => i.requestId === requestId);
      if (item) { item.status = "completed"; item.answer = q.answer; }
    }
    conversationHistory.push({
      role: "question", message: q.message, options: [],
      answer: q.answer, requestId, timestamp: Date.now(),
    });
  });
  syncToManager();
  // Disable all cards + submit button
  if (batchSubmitContainer) {
    batchSubmitContainer.style.opacity = "0.5";
    batchSubmitContainer.style.pointerEvents = "none";
  }
  pendingQuestions.clear();
  batchSubmitBtn = null;
  batchSubmitContainer = null;
}

function sendLocalControlResponse(response) {
  if (!claudeProcess || !claudeProcess.stdin?.writable) return false;
  try {
    claudeProcess.stdin.write(JSON.stringify({
      type: "control_response",
      response,
    }) + "\n");
    return true;
  } catch {
    return false;
  }
}

function sendControlResponse(requestId, response) {
  if (isRemoteMode && networkClient) {
    // Remote: route through companion server
    if (response.subtype === "success" && response.response?.behavior) {
      networkClient.sendPermissionResponse(requestId, response.response.behavior, response.updated_permissions);
    } else if (response.subtype === "elicitation_complete") {
      networkClient.sendQuestionResponse(requestId, response.response);
    }
  } else {
    // Local: write directly to Claude's stdin
    sendLocalControlResponse(response);
  }
}

// ── Card base styles ──
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

// ── Permission Card ──
function renderPermissionCard(requestId, request, container, scrollParent) {
  const card = el("div", cardBaseStyles());

  // Header
  const header = el("div", {
    display: "flex", alignItems: "center", gap: "8px",
    marginBottom: "10px", paddingBottom: "8px",
    borderBottom: `1px solid ${T.accent}22`,
  });
  const icon = el("span", { fontSize: "14px" }, "\u26A1");
  const title = el("span", {
    color: T.accent, fontSize: isNarrow ? "11px" : "12px",
    fontWeight: "bold", letterSpacing: "1.5px", textTransform: "uppercase",
  }, "TOOL PERMISSION REQUEST");
  header.appendChild(icon);
  header.appendChild(title);
  card.appendChild(header);

  // Tool info
  const toolName = request.tool_name || "Unknown";
  const description = request.description || "";
  const input = request.input || {};

  const toolRow = el("div", { marginBottom: "6px" });
  const toolLabel = el("span", { color: T.textMuted, fontSize: "11px" }, "Tool: ");
  const toolValue = el("span", { color: T.gold, fontSize: "12px", fontWeight: "bold" }, toolName);
  toolRow.appendChild(toolLabel);
  toolRow.appendChild(toolValue);
  card.appendChild(toolRow);

  if (description) {
    const descRow = el("div", { color: T.text, fontSize: "11px", marginBottom: "8px", opacity: "0.8" }, description);
    card.appendChild(descRow);
  }

  // Diff preview for Edit tool
  if (toolName === "Edit" && input.file_path) {
    const fileRow = el("div", { marginBottom: "6px" });
    const fileLabel = el("span", { color: T.textMuted, fontSize: "11px" }, "File: ");
    const fileValue = el("span", { color: T.text, fontSize: "11px" }, input.file_path.split("/").slice(-2).join("/"));
    fileRow.appendChild(fileLabel);
    fileRow.appendChild(fileValue);
    card.appendChild(fileRow);

    if (input.old_string || input.new_string) {
      const diffBox = el("div", {
        background: "rgba(0,0,0,0.4)", borderRadius: "4px",
        padding: "8px", marginBottom: "8px", fontSize: "10px",
        border: `1px solid ${T.panelBorder}`, maxHeight: "120px", overflow: "auto",
      });
      if (input.old_string) {
        const oldLine = el("div", { color: T.red, whiteSpace: "pre-wrap", wordBreak: "break-all" },
          "- " + (input.old_string.length > 200 ? input.old_string.slice(0, 200) + "..." : input.old_string));
        diffBox.appendChild(oldLine);
      }
      if (input.new_string) {
        const newLine = el("div", { color: T.green, whiteSpace: "pre-wrap", wordBreak: "break-all", marginTop: "4px" },
          "+ " + (input.new_string.length > 200 ? input.new_string.slice(0, 200) + "..." : input.new_string));
        diffBox.appendChild(newLine);
      }
      card.appendChild(diffBox);
    }
  }

  // Bash command preview
  if (toolName === "Bash" && input.command) {
    const cmdBox = el("div", {
      background: "rgba(0,0,0,0.4)", borderRadius: "4px",
      padding: "8px", marginBottom: "8px", fontSize: "10px",
      color: T.gold, border: `1px solid ${T.panelBorder}`,
      whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "80px", overflow: "auto",
    }, "$ " + (input.command.length > 300 ? input.command.slice(0, 300) + "..." : input.command));
    card.appendChild(cmdBox);
  }

  // Write tool — file path + content preview
  if (toolName === "Write" && input.file_path) {
    const fileRow = el("div", { marginBottom: "6px" });
    const fileLabel = el("span", { color: T.textMuted, fontSize: "11px" }, "File: ");
    const fileValue = el("span", { color: T.text, fontSize: "11px" }, input.file_path.split("/").slice(-2).join("/"));
    fileRow.appendChild(fileLabel);
    fileRow.appendChild(fileValue);
    card.appendChild(fileRow);
  }

  // Action buttons
  const btnRow = el("div", { display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" });

  function makeBtn(label, bg, hoverBg) {
    const btn = el("div", {
      padding: "6px 14px", borderRadius: "4px", cursor: "pointer",
      background: bg, color: "#fff", fontSize: "11px", fontWeight: "bold",
      letterSpacing: "1px", textAlign: "center", transition: "all 0.2s",
      border: `1px solid ${bg}`,
    }, label);
    btn.addEventListener("mouseenter", () => { btn.style.background = hoverBg; btn.style.boxShadow = `0 0 10px ${bg}66`; });
    btn.addEventListener("mouseleave", () => { btn.style.background = bg; btn.style.boxShadow = "none"; });
    return btn;
  }

  const allowBtn = makeBtn("ALLOW", T.green, "#55daa0");
  const alwaysBtn = makeBtn("ALWAYS ALLOW", T.purple, "#8d7cff");
  const denyBtn = makeBtn("DENY", T.red, "#ff5f4f");

  function disableCard() {
    card.style.opacity = "0.5";
    card.style.pointerEvents = "none";
  }

  allowBtn.addEventListener("click", () => {
    disableCard();
    const st = window.__jarvisStreamState;
    if (st) {
      const item = st.pendingInteractions.find(i => i.requestId === requestId);
      if (item) { item.status = "completed"; item.answer = "allow"; }
    }
    sendControlResponse(requestId, {
      subtype: "success",
      request_id: requestId,
      response: { behavior: "allow" },
    });
    conversationHistory.push({
      role: "permission", tool: toolName, input,
      decision: "allow", requestId, timestamp: Date.now(),
    });
    syncToManager();
  });

  alwaysBtn.addEventListener("click", () => {
    disableCard();
    const st = window.__jarvisStreamState;
    if (st) {
      const item = st.pendingInteractions.find(i => i.requestId === requestId);
      if (item) { item.status = "completed"; item.answer = "allowAlways"; }
    }
    sendControlResponse(requestId, {
      subtype: "success",
      request_id: requestId,
      response: { behavior: "allowAlways" },
      updated_permissions: [{ type: "allow_tool", tool_name: toolName }],
    });
    conversationHistory.push({
      role: "permission", tool: toolName, input,
      decision: "allowAlways", requestId, timestamp: Date.now(),
    });
    syncToManager();
  });

  denyBtn.addEventListener("click", () => {
    disableCard();
    const st = window.__jarvisStreamState;
    if (st) {
      const item = st.pendingInteractions.find(i => i.requestId === requestId);
      if (item) { item.status = "completed"; item.answer = "deny"; }
    }
    sendControlResponse(requestId, {
      subtype: "success",
      request_id: requestId,
      response: { behavior: "deny" },
    });
    conversationHistory.push({
      role: "permission", tool: toolName, input,
      decision: "deny", requestId, timestamp: Date.now(),
    });
    syncToManager();
  });

  btnRow.appendChild(allowBtn);
  btnRow.appendChild(alwaysBtn);
  btnRow.appendChild(denyBtn);
  card.appendChild(btnRow);

  container.appendChild(card);
  if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight;

  // TTS announcement
  if (ttsService && ttsService.isEnabled && !ttsService.isMuted) {
    const toolDesc = description || `use ${toolName}`;
    ttsService.speak(`Sir, JARVIS needs to ${toolDesc}. Allow?`);
  }
}

// ── Settings-based Permission Card (for built-in tools via settings.local.json) ──
function renderSettingsPermissionCard(permItem, container, scrollParent) {
  const card = el("div", cardBaseStyles());

  // Header
  const header = el("div", {
    display: "flex", alignItems: "center", gap: "8px",
    marginBottom: "10px", paddingBottom: "8px",
    borderBottom: `1px solid ${T.accent}22`,
  });
  const icon = el("span", { fontSize: "14px" }, "\u26A1");
  const title = el("span", {
    color: T.accent, fontSize: isNarrow ? "11px" : "12px",
    fontWeight: "bold", letterSpacing: "1.5px", textTransform: "uppercase",
  }, "TOOL PERMISSION REQUEST");
  header.appendChild(icon);
  header.appendChild(title);
  card.appendChild(header);

  const toolName = permItem.toolName;
  const input = permItem.input || {};

  // Tool name row
  const toolRow = el("div", { marginBottom: "6px" });
  toolRow.appendChild(el("span", { color: T.textMuted, fontSize: "11px" }, "Tool: "));
  toolRow.appendChild(el("span", { color: T.gold, fontSize: "12px", fontWeight: "bold" }, toolName));
  card.appendChild(toolRow);

  // File path preview for Write/Edit
  if ((toolName === "Write" || toolName === "Edit") && input.file_path) {
    const fileRow = el("div", { marginBottom: "6px" });
    fileRow.appendChild(el("span", { color: T.textMuted, fontSize: "11px" }, "File: "));
    fileRow.appendChild(el("span", { color: T.text, fontSize: "11px" }, input.file_path.split("/").slice(-2).join("/")));
    card.appendChild(fileRow);
  }

  // Edit diff preview
  if (toolName === "Edit" && (input.old_string || input.new_string)) {
    const diffBox = el("div", {
      background: "rgba(0,0,0,0.4)", borderRadius: "4px",
      padding: "8px", marginBottom: "8px", fontSize: "10px",
      border: `1px solid ${T.panelBorder}`, maxHeight: "120px", overflow: "auto",
    });
    if (input.old_string) {
      diffBox.appendChild(el("div", { color: T.red, whiteSpace: "pre-wrap", wordBreak: "break-all" },
        "- " + (input.old_string.length > 200 ? input.old_string.slice(0, 200) + "..." : input.old_string)));
    }
    if (input.new_string) {
      diffBox.appendChild(el("div", { color: T.green, whiteSpace: "pre-wrap", wordBreak: "break-all", marginTop: "4px" },
        "+ " + (input.new_string.length > 200 ? input.new_string.slice(0, 200) + "..." : input.new_string)));
    }
    card.appendChild(diffBox);
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

  // Action buttons
  const btnRow = el("div", { display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" });

  function makeBtn(label, bg, hoverBg) {
    const btn = el("div", {
      padding: "6px 14px", borderRadius: "4px", cursor: "pointer",
      background: bg, color: "#fff", fontSize: "11px", fontWeight: "bold",
      letterSpacing: "1px", textAlign: "center", transition: "all 0.2s",
      border: `1px solid ${bg}`,
    }, label);
    btn.addEventListener("mouseenter", () => { btn.style.background = hoverBg; btn.style.boxShadow = `0 0 10px ${bg}66`; });
    btn.addEventListener("mouseleave", () => { btn.style.background = bg; btn.style.boxShadow = "none"; });
    return btn;
  }

  const allowBtn = makeBtn("ALLOW", T.green, "#55daa0");
  const alwaysBtn = makeBtn("ALWAYS ALLOW", T.purple, "#8d7cff");
  const denyBtn = makeBtn("DENY", T.red, "#ff5f4f");

  function disableCard(badge) {
    card.style.opacity = "0.6";
    card.style.pointerEvents = "none";
    btnRow.innerHTML = "";
    const badgeEl = el("span", {
      color: badge === "DENIED" ? T.red : T.green,
      fontSize: "11px", fontWeight: "bold", letterSpacing: "1px",
    }, badge);
    btnRow.appendChild(badgeEl);
  }
  permItem._disableCard = disableCard;

  // Helper: auto-resolve sibling permission items with same dirEntry + toolName
  function autoResolveSiblings(status, badge) {
    const st = window.__jarvisStreamState;
    if (!st || !permItem.dirEntry) return;
    for (const p of st.pendingPermissions) {
      if (p !== permItem && (p.status === "pending" || p.status === "auto-covered") &&
          p.dirEntry === permItem.dirEntry && p.toolName === permItem.toolName) {
        p.status = status;
        if (p._disableCard) p._disableCard(badge);
      }
    }
  }

  allowBtn.addEventListener("click", () => {
    disableCard("ALLOWED");
    const st = window.__jarvisStreamState;
    if (!st) return;
    // ALLOW is temporary — add tool name to retryAllowedTools for --allowedTools flag.
    // This bypasses settings.local.json path matching (which is unreliable for dynamic entries).
    st.retryAllowedTools = st.retryAllowedTools || new Set();
    st.retryAllowedTools.add(permItem.toolName);
    console.log("[JARVIS] ALLOW clicked — tool added to retry allowlist:", permItem.toolName);
    permItem.status = "approved";
    autoResolveSiblings("approved", "ALLOWED");
    conversationHistory.push({
      role: "permission", tool: toolName, input,
      decision: "allow", timestamp: Date.now(),
    });
    syncToManager();
    // If all pending resolved, spawn retry process with approved tools in --allowedTools
    const allResolved = st.pendingPermissions.every(p => p.status !== "pending");
    if (allResolved) {
      spawnRetryProcess();
    }
  });

  alwaysBtn.addEventListener("click", () => {
    disableCard("ALWAYS ALLOWED");
    const st = window.__jarvisStreamState;
    if (!st) return;
    // ALWAYS ALLOW — add to settings.local.json (permanent) AND retryAllowedTools (immediate)
    const entry = permItem.dirEntry || permItem.specificEntry;
    addSettingsPermission(entry);
    st.retryAllowedTools = st.retryAllowedTools || new Set();
    st.retryAllowedTools.add(permItem.toolName);
    console.log("[JARVIS] ALWAYS ALLOW clicked — tool:", permItem.toolName, "entry:", entry);
    permItem.status = "approved";
    autoResolveSiblings("approved", "ALLOWED");
    conversationHistory.push({
      role: "permission", tool: toolName, input,
      decision: "allowAlways", timestamp: Date.now(),
    });
    syncToManager();
    const allResolved = st.pendingPermissions.every(p => p.status !== "pending");
    if (allResolved) {
      spawnRetryProcess();
    }
  });

  denyBtn.addEventListener("click", () => {
    disableCard("DENIED");
    const st = window.__jarvisStreamState;
    if (!st) return;
    permItem.status = "denied";
    autoResolveSiblings("denied", "DENIED");
    conversationHistory.push({
      role: "permission", tool: toolName, input,
      decision: "deny", timestamp: Date.now(),
    });
    syncToManager();
    const allResolved = st.pendingPermissions.every(p => p.status !== "pending");
    if (allResolved) {
      // Clear retry allowlist — all denied, nothing to retry
      st.retryAllowedTools = null;
      // Finalize — process is already dead (exited during waiting_permission)
      if (!st.process) {
        st.uiState = "done";
        if (st._onClose) st._onClose(0);
      } else {
        closeStdinIfDone(st);
      }
    }
  });

  btnRow.appendChild(allowBtn);
  btnRow.appendChild(alwaysBtn);
  btnRow.appendChild(denyBtn);
  card.appendChild(btnRow);

  container.appendChild(card);
  if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight;

  // TTS announcement
  if (ttsService && ttsService.isEnabled && !ttsService.isMuted) {
    const userName = personalityCfg.userName || "sir";
    ttsService.speak(`${userName}, permission needed to use ${toolName}. Allow?`);
  }

  return card;
}

// ── Question Card (Elicitation) ──
function renderQuestionCard(requestId, request, container, scrollParent) {
  const isBatchMode = interactiveCfg.batchQuestions === true;
  const card = el("div", cardBaseStyles());

  // Header
  const header = el("div", {
    display: "flex", alignItems: "center", gap: "8px",
    marginBottom: "10px", paddingBottom: "8px",
    borderBottom: `1px solid ${T.accent}22`,
  });
  const icon = el("span", { fontSize: "14px" }, "\uD83D\uDCAC");
  const title = el("span", {
    color: T.accent, fontSize: isNarrow ? "11px" : "12px",
    fontWeight: "bold", letterSpacing: "1.5px", textTransform: "uppercase",
  }, "JARVIS NEEDS YOUR INPUT");
  header.appendChild(icon);
  header.appendChild(title);
  card.appendChild(header);

  // Question text
  const message = request.message || "Please provide your input.";
  const questionText = el("div", {
    color: T.text, fontSize: "12px", marginBottom: "10px",
    fontStyle: "italic", lineHeight: "1.5",
  }, `"${message}"`);
  card.appendChild(questionText);

  let selectedAnswer = null;
  const options = request.options || [];

  // Track this question in batch state
  if (isBatchMode) {
    pendingQuestions.set(requestId, { answered: false, answer: null, message });
  }

  // Radio options
  if (options.length > 0) {
    const optionsContainer = el("div", { marginBottom: "10px" });

    options.forEach((option, idx) => {
      const optionLabel = typeof option === "string" ? option : (option.label || option.value || String(option));
      const optionValue = typeof option === "string" ? option : (option.value || option.label || String(option));

      const row = el("div", {
        display: "flex", alignItems: "center", gap: "8px",
        padding: "6px 8px", borderRadius: "4px", cursor: "pointer",
        transition: "all 0.15s",
        marginBottom: "2px",
        borderLeft: "3px solid transparent",
      });

      const radio = el("div", {
        width: "14px", height: "14px", borderRadius: "50%",
        border: `2px solid ${T.textMuted}`, flexShrink: "0",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "border-color 0.15s",
      });
      const radioDot = el("div", {
        width: "6px", height: "6px", borderRadius: "50%",
        background: "transparent", transition: "background 0.15s",
      });
      radio.appendChild(radioDot);

      const label = el("span", { color: T.text, fontSize: "11px" }, optionLabel);

      row.appendChild(radio);
      row.appendChild(label);

      row.addEventListener("mouseenter", () => { if (selectedAnswer !== optionValue) row.style.background = `${T.accent}11`; });
      row.addEventListener("mouseleave", () => { if (selectedAnswer !== optionValue) row.style.background = "transparent"; });

      row.addEventListener("click", () => {
        // Deselect all
        optionsContainer.querySelectorAll("div[data-radio]").forEach((r) => {
          r.style.borderColor = T.textMuted;
          r.firstChild.style.background = "transparent";
        });
        // Reset all row styles
        optionsContainer.querySelectorAll("[data-option-row]").forEach((r) => {
          r.style.background = "transparent";
          r.style.borderLeft = "3px solid transparent";
          r.style.animation = "none";
        });
        // Select this
        radio.style.borderColor = T.accent;
        radioDot.style.background = T.accent;
        row.style.background = `${T.accent}15`;
        row.style.borderLeft = `3px solid ${T.accent}`;
        row.style.animation = animOrNone("jarvisOptionSelected 2s ease-in-out infinite");
        selectedAnswer = optionValue;
        if (isBatchMode) {
          const q = pendingQuestions.get(requestId);
          if (q) { q.answered = true; q.answer = optionValue; }
          updateBatchSubmitState();
        } else {
          updateSubmitState();
        }
        // Clear custom text if option selected
        if (customInput) customInput.value = "";
      });

      radio.setAttribute("data-radio", "true");
      row.setAttribute("data-option-row", "true");
      optionsContainer.appendChild(row);
    });

    card.appendChild(optionsContainer);
  }

  // Custom text input
  const customLabel = el("div", {
    color: T.textMuted, fontSize: "10px", marginBottom: "4px",
  }, options.length > 0 ? "Or type your own answer:" : "Your answer:");

  const customInput = el("textarea", {
    width: "100%", boxSizing: "border-box",
    padding: "8px 10px", borderRadius: "4px",
    background: "rgba(0,0,0,0.4)", color: T.text,
    border: `1px solid ${T.panelBorder}`,
    fontSize: "11px", fontFamily: "monospace",
    outline: "none", resize: "none", overflow: "hidden",
    lineHeight: "1.4", minHeight: "32px", maxHeight: "80px",
  });
  customInput.rows = 1;
  customInput.setAttribute("placeholder", "Type your answer...");
  customInput.addEventListener("focus", () => { customInput.style.borderColor = `${T.accent}66`; });
  customInput.addEventListener("blur", () => { customInput.style.borderColor = T.panelBorder; });
  function autoResizeQuestion() {
    customInput.style.height = "auto";
    customInput.style.height = Math.min(customInput.scrollHeight, 80) + "px";
    customInput.style.overflow = customInput.scrollHeight > 80 ? "auto" : "hidden";
  }
  customInput.addEventListener("input", () => {
    autoResizeQuestion();
    if (customInput.value.trim()) {
      selectedAnswer = customInput.value.trim();
      // Deselect radio options
      card.querySelectorAll("div[data-radio]").forEach((r) => {
        r.style.borderColor = T.textMuted;
        r.firstChild.style.background = "transparent";
      });
      card.querySelectorAll("[data-option-row]").forEach((r) => {
        r.style.background = "transparent";
        r.style.borderLeft = "3px solid transparent";
        r.style.animation = "none";
      });
      if (isBatchMode) {
        const q = pendingQuestions.get(requestId);
        if (q) { q.answered = true; q.answer = selectedAnswer; }
        updateBatchSubmitState();
      }
    } else {
      selectedAnswer = null;
      if (isBatchMode) {
        const q = pendingQuestions.get(requestId);
        if (q) { q.answered = false; q.answer = null; }
        updateBatchSubmitState();
      }
    }
    if (!isBatchMode) updateSubmitState();
  });

  card.appendChild(customLabel);
  card.appendChild(customInput);

  if (isBatchMode) {
    // Batch mode: individual cards have no submit button.
    // A shared SUBMIT ALL button is rendered once and updated as questions arrive.
    container.appendChild(card);

    if (!batchSubmitContainer) {
      batchSubmitContainer = el("div", { marginTop: "8px" });
      batchSubmitBtn = el("div", {
        padding: "8px 20px", borderRadius: "4px", cursor: "not-allowed",
        background: T.green, color: "#fff", fontSize: "11px", fontWeight: "bold",
        letterSpacing: "1px", textAlign: "center", marginTop: "10px",
        opacity: "0.4", transition: "all 0.2s",
        border: `1px solid ${T.green}`,
      }, "SUBMIT ALL");

      batchSubmitBtn.addEventListener("click", handleBatchSubmit);
      batchSubmitBtn.addEventListener("mouseenter", () => {
        const allAnswered = [...pendingQuestions.values()].every(q => q.answered);
        if (allAnswered && pendingQuestions.size > 0) {
          batchSubmitBtn.style.boxShadow = `0 0 12px ${T.green}66`;
        }
      });
      batchSubmitBtn.addEventListener("mouseleave", () => {
        batchSubmitBtn.style.boxShadow = "none";
      });

      batchSubmitContainer.appendChild(batchSubmitBtn);
      container.appendChild(batchSubmitContainer);
    }

    // Enter key in custom input triggers batch submit
    customInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleBatchSubmit();
    });

    updateBatchSubmitState();
  } else {
    // Single-question mode: each card has its own submit button
    const submitBtn = el("div", {
      padding: "8px 20px", borderRadius: "4px", cursor: "not-allowed",
      background: T.green, color: "#fff", fontSize: "11px", fontWeight: "bold",
      letterSpacing: "1px", textAlign: "center", marginTop: "10px",
      opacity: "0.4", transition: "all 0.2s",
      border: `1px solid ${T.green}`,
    }, "SUBMIT");

    let submitEnabled = false;

    function updateSubmitState() {
      if (selectedAnswer) {
        submitEnabled = true;
        submitBtn.style.opacity = "1";
        submitBtn.style.cursor = "pointer";
        submitBtn.style.animation = animOrNone("jarvisSubmitPulse 2s ease-in-out infinite");
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
      const st = window.__jarvisStreamState;
      if (st) {
        const item = st.pendingInteractions.find(i => i.requestId === requestId);
        if (item) { item.status = "completed"; item.answer = selectedAnswer; }
      }
      sendControlResponse(requestId, {
        subtype: "elicitation_complete",
        request_id: requestId,
        response: { selected: selectedAnswer },
      });
      conversationHistory.push({
        role: "question", message: request.message, options: request.options,
        answer: selectedAnswer, requestId, timestamp: Date.now(),
      });
      syncToManager();
    });

    submitBtn.addEventListener("mouseenter", () => {
      if (submitEnabled) { submitBtn.style.boxShadow = `0 0 12px ${T.green}66`; }
    });
    submitBtn.addEventListener("mouseleave", () => {
      submitBtn.style.boxShadow = "none";
    });

    // Enter key submits
    customInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && submitEnabled && selectedAnswer) {
        submitBtn.click();
      }
    });

    card.appendChild(submitBtn);
    container.appendChild(card);
  }

  if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight;

  // TTS announcement
  if (ttsService && ttsService.isEnabled && !ttsService.isMuted) {
    let ttsMsg = `Sir, ${message}`;
    if (options.length > 0) {
      const optLabels = options.map((o) => typeof o === "string" ? o : (o.label || o.value || String(o)));
      ttsMsg += ` Options are: ${optLabels.join(", ")}.`;
    }
    ttsService.speak(ttsMsg);
  }
}

// ── Completed Interaction Card (for history restore & answered cards) ──
function renderCompletedInteractionCard(interaction, container, scrollParent) {
  const card = el("div", {
    ...cardBaseStyles(),
    opacity: "0.5",
    pointerEvents: "none",
  });

  if (interaction.type === "permission") {
    // Header
    const header = el("div", {
      display: "flex", alignItems: "center", gap: "8px",
      marginBottom: "8px", paddingBottom: "6px",
      borderBottom: `1px solid ${T.accent}22`,
    });
    header.appendChild(el("span", { fontSize: "14px" }, "\u26A1"));
    header.appendChild(el("span", {
      color: T.accent, fontSize: isNarrow ? "10px" : "11px",
      fontWeight: "bold", letterSpacing: "1.5px", textTransform: "uppercase",
    }, "TOOL PERMISSION"));
    card.appendChild(header);

    // Tool name
    const toolRow = el("div", { marginBottom: "4px" });
    toolRow.appendChild(el("span", { color: T.textMuted, fontSize: "10px" }, "Tool: "));
    toolRow.appendChild(el("span", { color: T.gold, fontSize: "11px", fontWeight: "bold" }, interaction.tool || "Unknown"));
    card.appendChild(toolRow);

    // Input preview
    const input = interaction.input || {};
    if (input.command) {
      card.appendChild(el("div", {
        background: "rgba(0,0,0,0.4)", borderRadius: "4px",
        padding: "6px", marginBottom: "6px", fontSize: "10px",
        color: T.gold, border: `1px solid ${T.panelBorder}`,
        whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "60px", overflow: "auto",
      }, "$ " + (input.command.length > 200 ? input.command.slice(0, 200) + "..." : input.command)));
    }
    if (input.file_path) {
      const fileRow = el("div", { marginBottom: "4px" });
      fileRow.appendChild(el("span", { color: T.textMuted, fontSize: "10px" }, "File: "));
      fileRow.appendChild(el("span", { color: T.text, fontSize: "10px" }, input.file_path.split("/").slice(-2).join("/")));
      card.appendChild(fileRow);
    }

    // Decision badge
    const decision = interaction.decision || "unknown";
    const badgeColor = decision === "allow" || decision === "allowAlways" ? T.green
      : decision === "deny" ? T.red
      : decision === "auto" ? T.purple
      : T.textMuted;
    const badgeLabel = decision === "allow" ? "ALLOWED"
      : decision === "allowAlways" ? "ALWAYS ALLOWED"
      : decision === "deny" ? "DENIED"
      : decision === "auto" ? "AUTO-APPROVED"
      : decision.toUpperCase();
    const badge = el("div", {
      display: "inline-block", padding: "3px 10px", borderRadius: "3px",
      background: `${badgeColor}22`, color: badgeColor,
      fontSize: "10px", fontWeight: "bold", letterSpacing: "1px",
      marginTop: "6px", border: `1px solid ${badgeColor}44`,
    }, badgeLabel);
    card.appendChild(badge);

  } else if (interaction.type === "question") {
    // Header
    const header = el("div", {
      display: "flex", alignItems: "center", gap: "8px",
      marginBottom: "8px", paddingBottom: "6px",
      borderBottom: `1px solid ${T.accent}22`,
    });
    header.appendChild(el("span", { fontSize: "14px" }, "\uD83D\uDCAC"));
    header.appendChild(el("span", {
      color: T.accent, fontSize: isNarrow ? "10px" : "11px",
      fontWeight: "bold", letterSpacing: "1.5px", textTransform: "uppercase",
    }, "INPUT PROVIDED"));
    card.appendChild(header);

    // Question text
    if (interaction.message) {
      card.appendChild(el("div", {
        color: T.text, fontSize: "11px", marginBottom: "6px",
        fontStyle: "italic", lineHeight: "1.4",
      }, `"${interaction.message}"`));
    }

    // Answer badge
    const answer = interaction.answer || "—";
    const answerBadge = el("div", {
      display: "inline-block", padding: "3px 10px", borderRadius: "3px",
      background: `${T.green}22`, color: T.green,
      fontSize: "10px", fontWeight: "bold", letterSpacing: "1px",
      marginTop: "4px", border: `1px solid ${T.green}44`,
    }, `ANSWER: ${typeof answer === "string" && answer.length > 80 ? answer.slice(0, 80) + "..." : answer}`);
    card.appendChild(answerBadge);

  } else if (interaction.type === "askuser") {
    // Header
    const header = el("div", {
      display: "flex", alignItems: "center", gap: "8px",
      marginBottom: "8px", paddingBottom: "6px",
      borderBottom: `1px solid ${T.accent}22`,
    });
    header.appendChild(el("span", { fontSize: "14px" }, "\uD83D\uDCAC"));
    header.appendChild(el("span", {
      color: T.accent, fontSize: isNarrow ? "10px" : "11px",
      fontWeight: "bold", letterSpacing: "1.5px", textTransform: "uppercase",
    }, "INPUT PROVIDED"));
    card.appendChild(header);

    const questions = interaction.data?.questions || [];
    questions.forEach((q, idx) => {
      if (q.header) {
        card.appendChild(el("div", {
          color: T.accent, fontSize: "10px", fontWeight: "bold",
          marginTop: idx > 0 ? "6px" : "0", letterSpacing: "1px",
        }, q.header.toUpperCase()));
      }
      const answer = Array.isArray(interaction.answer) ? interaction.answer[idx] : "\u2014";
      card.appendChild(el("div", {
        color: T.green, fontSize: "11px", marginBottom: "4px",
      }, `\u2192 ${answer}`));
    });
  }

  container.appendChild(card);
  if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight;
}

// ── Display-Only Permission Card (fallback when control_request didn't fire) ──
function renderDisplayOnlyPermissionCard(toolName, input, st) {
  if (!st._onDisplayCard) return;
  const { container, scrollParent } = st._onDisplayCard();
  const card = el("div", {
    ...cardBaseStyles(),
    opacity: "0.6",
    pointerEvents: "none",
  });

  const header = el("div", {
    display: "flex", alignItems: "center", gap: "8px",
    marginBottom: "8px", paddingBottom: "6px",
    borderBottom: `1px solid ${T.accent}22`,
  });
  header.appendChild(el("span", { fontSize: "14px" }, "\u26A1"));
  header.appendChild(el("span", {
    color: T.accent, fontSize: isNarrow ? "10px" : "11px",
    fontWeight: "bold", letterSpacing: "1.5px", textTransform: "uppercase",
  }, "TOOL EXECUTED"));
  card.appendChild(header);

  const toolRow = el("div", { marginBottom: "4px" });
  toolRow.appendChild(el("span", { color: T.textMuted, fontSize: "10px" }, "Tool: "));
  toolRow.appendChild(el("span", { color: T.gold, fontSize: "11px", fontWeight: "bold" }, toolName));
  card.appendChild(toolRow);

  if (input.command) {
    card.appendChild(el("div", {
      background: "rgba(0,0,0,0.4)", borderRadius: "4px",
      padding: "6px", marginBottom: "6px", fontSize: "10px",
      color: T.gold, border: `1px solid ${T.panelBorder}`,
      whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "80px", overflow: "auto",
    }, "$ " + (input.command.length > 300 ? input.command.slice(0, 300) + "..." : input.command)));
  }
  if (input.file_path) {
    const fileRow = el("div", { marginBottom: "4px" });
    fileRow.appendChild(el("span", { color: T.textMuted, fontSize: "10px" }, "File: "));
    fileRow.appendChild(el("span", { color: T.text, fontSize: "10px" }, input.file_path.split("/").slice(-2).join("/")));
    card.appendChild(fileRow);
  }
  if ((toolName === "Edit") && input.old_string) {
    const diffBox = el("div", {
      background: "rgba(0,0,0,0.4)", borderRadius: "4px",
      padding: "6px", marginBottom: "6px", fontSize: "10px",
      border: `1px solid ${T.panelBorder}`, maxHeight: "80px", overflow: "auto",
    });
    diffBox.appendChild(el("div", { color: T.red, whiteSpace: "pre-wrap", wordBreak: "break-all" },
      "- " + (input.old_string.length > 150 ? input.old_string.slice(0, 150) + "..." : input.old_string)));
    if (input.new_string) {
      diffBox.appendChild(el("div", { color: T.green, whiteSpace: "pre-wrap", wordBreak: "break-all", marginTop: "2px" },
        "+ " + (input.new_string.length > 150 ? input.new_string.slice(0, 150) + "..." : input.new_string)));
    }
    card.appendChild(diffBox);
  }

  const badge = el("div", {
    display: "inline-block", padding: "3px 10px", borderRadius: "3px",
    background: `${T.purple}22`, color: T.purple,
    fontSize: "10px", fontWeight: "bold", letterSpacing: "1px",
    marginTop: "6px", border: `1px solid ${T.purple}44`,
  }, "AUTO-APPROVED");
  card.appendChild(badge);

  container.appendChild(card);
  if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight;
}

// ── Display-Only Question Card (fallback when AskUserQuestion auto-executed) ──
function renderDisplayOnlyQuestionCard(input, st) {
  if (!st._onDisplayCard) return;
  const { container, scrollParent } = st._onDisplayCard();
  const card = el("div", {
    ...cardBaseStyles(),
    opacity: "0.6",
    pointerEvents: "none",
  });

  const header = el("div", {
    display: "flex", alignItems: "center", gap: "8px",
    marginBottom: "8px", paddingBottom: "6px",
    borderBottom: `1px solid ${T.accent}22`,
  });
  header.appendChild(el("span", { fontSize: "14px" }, "\uD83D\uDCAC"));
  header.appendChild(el("span", {
    color: T.accent, fontSize: isNarrow ? "10px" : "11px",
    fontWeight: "bold", letterSpacing: "1.5px", textTransform: "uppercase",
  }, "JARVIS ASKED"));
  card.appendChild(header);

  const question = input.question || input.message || input.text || "—";
  card.appendChild(el("div", {
    color: T.text, fontSize: "11px", marginBottom: "8px",
    fontStyle: "italic", lineHeight: "1.4",
  }, `"${typeof question === "string" && question.length > 200 ? question.slice(0, 200) + "..." : question}"`));

  const badge = el("div", {
    display: "inline-block", padding: "3px 10px", borderRadius: "3px",
    background: `${T.orange}22`, color: T.orange,
    fontSize: "10px", fontWeight: "bold", letterSpacing: "1px",
    marginTop: "4px", border: `1px solid ${T.orange}44`,
  }, "AUTO-EXECUTED (no interactive card)");
  card.appendChild(badge);

  container.appendChild(card);
  if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight;
}

// ── Status Label (inline pill badge for tool/skill/agent activity) ──
// Layout rules:
//   text → label: label starts on a new line (status row is display:block)
//   label → label (same type): deduplicated, skip rendering
//   label → label (diff type): same row, with spacing
//   label → text: text starts on a new line (textWrap div)
// opts.replay — if true, skip dedup tracking and history recording (used during restore)
function renderStatusLabel(type, text, container, scrollParent, opts) {
  if (!showStatusLabels) return;
  const st = window.__jarvisStreamState;
  const isReplay = opts && opts.replay;
  const typeConfig = {
    skill:    { icon: "\uD83C\uDFAF", label: "SKILL",    color: T.purple },
    agent:    { icon: "\uD83E\uDD16", label: "AGENT",    color: T.accent },
    tool:     { icon: "\u26A1",       label: "TOOL",     color: T.gold },
    search:   { icon: "\uD83D\uDD0D", label: "SEARCH",   color: T.green },
    thinking: { icon: "\uD83D\uDCAD", label: "THINKING", color: T.textMuted },
  };
  const cfg = typeConfig[type] || typeConfig.tool;

  // Dedup: skip if consecutive label has same type+text (live streaming only)
  if (!isReplay) {
    const labelKey = `${type}:${text || ""}`;
    if (st && st._lastStatusLabel === labelKey) return;
    if (st) st._lastStatusLabel = labelKey;
    // Record in conversation history for persistence
    conversationHistory.push({ role: "status", type, label: text || "", timestamp: Date.now() });
  }

  const badge = el("div", {
    display: "inline-flex", alignItems: "center", gap: "5px",
    padding: "3px 10px", borderRadius: "12px",
    background: `${cfg.color}18`, border: `1px solid ${cfg.color}33`,
    fontSize: "10px", fontFamily: "monospace", lineHeight: "1.4",
  });
  badge.appendChild(el("span", { fontSize: "10px" }, cfg.icon));
  badge.appendChild(el("span", {
    color: cfg.color, fontWeight: "bold", letterSpacing: "1px", textTransform: "uppercase",
  }, cfg.label));

  if (text) {
    badge.appendChild(el("span", { color: T.textMuted, fontSize: "9px" }, "\u00B7"));
    const detail = text.length > 50 ? text.slice(0, 50) + "\u2026" : text;
    badge.appendChild(el("span", {
      color: T.text, fontSize: "10px", opacity: "0.8",
    }, detail));
  }

  // Find or create a status row — consecutive labels share a row,
  // a new row is created after text or other non-label content
  const lastChild = container.lastChild;
  let row;
  if (lastChild && lastChild.dataset && lastChild.dataset.statusRow) {
    row = lastChild;
  } else {
    row = el("div", {
      display: "block", marginTop: "6px", marginBottom: "4px",
    });
    row.dataset.statusRow = "true";
    container.appendChild(row);
  }

  row.appendChild(badge);
  // Add spacing between consecutive badges via margin
  badge.style.marginRight = "6px";
  badge.style.marginBottom = "2px";
  if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight;
}

// ── Interactive AskUserQuestion Form (pill-based multi-question card) ──
function renderAskUserQuestionForm(toolUseId, input, container, scrollParent) {
  const questions = input.questions || [];
  if (questions.length === 0) return;

  const st = window.__jarvisStreamState;
  const isSingle = questions.length === 1;

  // Dedup: skip if already rendered (both content_block_stop and assistant event can trigger this)
  if (st) {
    const alreadyTracked = st.pendingInteractions.find(i => i.toolUseId === toolUseId);
    if (alreadyTracked) {
      console.log("[JARVIS] AskUserQuestion form already rendered, skipping duplicate:", toolUseId);
      return;
    }
    st.pendingInteractions.push({
      type: "askuser", toolUseId, data: input,
      status: "pending", answer: null, timestamp: Date.now(),
    });
  }

  // Answer tracking: questionIndex → { value, source }
  const answers = new Map();
  questions.forEach((q, idx) => answers.set(idx, { value: null, source: null }));

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

  // Collect text inputs for keyboard navigation
  const textInputs = [];

  // Submit button (created early, appended later)
  let submitBtn = null;

  function allAnswered() {
    return [...answers.values()].every(a => a.value !== null && a.value !== "");
  }

  function updateSubmitState() {
    if (!submitBtn) return;
    if (allAnswered()) {
      submitBtn.style.opacity = "1";
      submitBtn.style.cursor = "pointer";
      submitBtn.style.animation = animOrNone("jarvisSubmitPulse 2s ease-in-out infinite");
    } else {
      submitBtn.style.opacity = "0.4";
      submitBtn.style.cursor = "not-allowed";
      submitBtn.style.animation = "none";
    }
  }

  function handleSubmit() {
    if (!allAnswered()) {
      console.log("[JARVIS] AskUserQuestion submit blocked — not all answered");
      return;
    }

    // Build structured answer text
    const answerLines = questions.map((q, idx) => {
      const a = answers.get(idx);
      return `${q.header || ("Question " + (idx + 1))}: ${a.value}`;
    });
    const responseText = answerLines.join("\n");
    const answerArray = questions.map((q, idx) => answers.get(idx).value);

    // Read stream state fresh at submit time (not captured at render time)
    const currentSt = window.__jarvisStreamState;
    if (!currentSt) {
      console.log("[JARVIS] AskUserQuestion submit failed — no active stream state");
      return;
    }

    // Update pending interaction
    const pendingAsk = currentSt.pendingInteractions.find(i => i.toolUseId === toolUseId);
    if (pendingAsk) {
      pendingAsk.status = "completed";
      pendingAsk.answer = answerArray;
    }

    // If a control_request (elicitation) was linked and process is alive, respond to it
    if (pendingAsk?.elicitationRequestId && currentSt.process?.stdin?.writable) {
      sendControlResponse(pendingAsk.elicitationRequestId, {
        subtype: "elicitation_complete",
        request_id: pendingAsk.elicitationRequestId,
        response: { selected: responseText },
      });
      console.log("[JARVIS] AskUserQuestion answered via elicitation:", pendingAsk.elicitationRequestId);
    } else if (currentSt.process?.stdin?.writable) {
      // Process still alive — send as follow-up user message
      currentSt.process.stdin.write(JSON.stringify({
        type: "user",
        message: { role: "user", content: [{ type: "text", text: responseText }] },
      }) + "\n");
      console.log("[JARVIS] AskUserQuestion answered via user message (stdin)");
    } else {
      // Process already exited — spawn a new resume process with the answer
      console.log("[JARVIS] AskUserQuestion — process exited, spawning resume with answer");
      spawnAskUserResumeProcess(responseText);
    }

    // Disable card
    card.style.opacity = "0.5";
    card.style.pointerEvents = "none";

    // Track in conversation history
    conversationHistory.push({
      role: "question",
      message: questions.map(q => q.question || q.header || "").join("; "),
      options: [], answer: responseText, requestId: null, timestamp: Date.now(),
    });
    syncToManager();
  }

  // Render each question section
  questions.forEach((q, idx) => {
    // Section header
    if (q.header) {
      card.appendChild(el("div", {
        color: T.accent, fontSize: "10px", fontWeight: "bold",
        letterSpacing: "1.5px", textTransform: "uppercase",
        marginTop: idx > 0 ? "6px" : "0", marginBottom: "4px",
      }, q.header));
    }

    // Question text
    if (q.question) {
      card.appendChild(el("div", {
        color: T.text, fontSize: "11px", marginBottom: "8px",
        fontStyle: "italic", lineHeight: "1.4",
      }, `"${q.question}"`));
    }

    // Pill buttons container
    const options = q.options || [];
    const pillsWrap = el("div", {
      display: "flex", flexWrap: "wrap", marginBottom: "6px",
    });

    const pills = [];

    options.forEach((opt) => {
      const label = opt.label || String(opt);
      const desc = opt.description || "";
      const truncDesc = desc.length > 100 ? desc.slice(0, 100) + "..." : desc;

      const pill = el("div", {
        display: "inline-flex", flexDirection: "column", alignItems: "flex-start",
        padding: "8px 14px", borderRadius: "20px",
        border: `1px solid ${T.panelBorder}`, background: "rgba(0,0,0,0.3)",
        cursor: "pointer", transition: "all 0.2s",
        marginRight: "6px", marginBottom: "6px",
      });

      pill.appendChild(el("span", {
        fontSize: "11px", color: T.text,
      }, label));

      if (truncDesc) {
        pill.appendChild(el("span", {
          fontSize: "9px", color: T.textMuted, marginTop: "2px",
        }, truncDesc));
      }

      let selected = false;

      pill.addEventListener("mouseenter", () => {
        if (!selected) pill.style.background = `${T.accent}11`;
      });
      pill.addEventListener("mouseleave", () => {
        if (!selected) pill.style.background = "rgba(0,0,0,0.3)";
      });

      pill.addEventListener("click", () => {
        if (q.multiSelect) {
          // Toggle selection
          selected = !selected;
          if (selected) {
            pill.style.background = `${T.accent}22`;
            pill.style.borderColor = T.accent;
            pill.style.boxShadow = `0 0 8px ${T.accent}33`;
          } else {
            pill.style.background = "rgba(0,0,0,0.3)";
            pill.style.borderColor = T.panelBorder;
            pill.style.boxShadow = "none";
          }
          // Collect all selected pills for this question
          const selectedLabels = pills.filter(p => p._selected).map(p => p._label);
          if (selectedLabels.length > 0) {
            answers.set(idx, { value: selectedLabels.join(", "), source: "pill" });
          } else {
            answers.set(idx, { value: null, source: null });
          }
          pill._selected = selected;
        } else {
          // Deselect all pills in same question
          pills.forEach(p => {
            p._selected = false;
            p.style.background = "rgba(0,0,0,0.3)";
            p.style.borderColor = T.panelBorder;
            p.style.boxShadow = "none";
          });
          // Select this pill
          selected = true;
          pill._selected = true;
          pill.style.background = `${T.accent}22`;
          pill.style.borderColor = T.accent;
          pill.style.boxShadow = `0 0 8px ${T.accent}33`;
          answers.set(idx, { value: label, source: "pill" });
        }
        // Clear custom text input for this question
        const ti = textInputs[idx];
        if (ti) ti.value = "";
        updateSubmitState();
      });

      pill._selected = false;
      pill._label = label;
      pills.push(pill);
      pillsWrap.appendChild(pill);
    });

    if (options.length > 0) card.appendChild(pillsWrap);

    // Custom text input
    const customLabel = el("div", {
      color: T.textMuted, fontSize: "10px", marginBottom: "4px",
    }, options.length > 0 ? "Or type your own:" : "Your answer:");

    const customInput = el("textarea", {
      width: isSingle ? "calc(100% - 100px)" : "100%",
      boxSizing: "border-box",
      padding: "8px 10px", borderRadius: "4px",
      background: "rgba(0,0,0,0.4)", color: T.text,
      border: `1px solid ${T.panelBorder}`,
      fontSize: "11px", fontFamily: "monospace",
      outline: "none", resize: "none", overflow: "hidden",
      lineHeight: "1.4", minHeight: "32px", maxHeight: "80px",
    });
    customInput.rows = 1;
    customInput.setAttribute("placeholder", "Type your answer...");
    customInput.addEventListener("focus", () => { customInput.style.borderColor = `${T.accent}66`; });
    customInput.addEventListener("blur", () => { customInput.style.borderColor = T.panelBorder; });
    function autoResizeAskInput() {
      customInput.style.height = "auto";
      customInput.style.height = Math.min(customInput.scrollHeight, 80) + "px";
      customInput.style.overflow = customInput.scrollHeight > 80 ? "auto" : "hidden";
    }
    customInput.addEventListener("input", () => {
      autoResizeAskInput();
      if (customInput.value.trim()) {
        answers.set(idx, { value: customInput.value.trim(), source: "custom" });
        // Deselect all pills for this question
        pills.forEach(p => {
          p._selected = false;
          p.style.background = "rgba(0,0,0,0.3)";
          p.style.borderColor = T.panelBorder;
          p.style.boxShadow = "none";
        });
      } else {
        answers.set(idx, { value: null, source: null });
      }
      updateSubmitState();
    });

    textInputs[idx] = customInput;

    card.appendChild(customLabel);

    if (isSingle) {
      // Single question: inline row with [input] [SUBMIT]
      const inlineRow = el("div", {
        display: "flex", alignItems: "center", gap: "8px",
      });
      inlineRow.appendChild(customInput);

      submitBtn = el("div", {
        padding: "8px 16px", borderRadius: "4px", cursor: "not-allowed",
        background: T.green, color: "#fff", fontSize: "11px", fontWeight: "bold",
        letterSpacing: "1px", textAlign: "center",
        opacity: "0.4", transition: "all 0.2s",
        border: `1px solid ${T.green}`, whiteSpace: "nowrap", flexShrink: "0",
      }, "SUBMIT");

      submitBtn.addEventListener("click", handleSubmit);
      submitBtn.addEventListener("mouseenter", () => {
        if (allAnswered()) submitBtn.style.boxShadow = `0 0 12px ${T.green}66`;
      });
      submitBtn.addEventListener("mouseleave", () => {
        submitBtn.style.boxShadow = "none";
      });

      inlineRow.appendChild(submitBtn);
      card.appendChild(inlineRow);

      // Enter sends, Shift+Enter adds newline
      customInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && allAnswered()) { e.preventDefault(); handleSubmit(); }
      });
    } else {
      // Multi question: just the text input, no inline submit
      card.appendChild(customInput);

      // Enter moves to next / submits, Shift+Enter adds newline
      customInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const nextIdx = idx + 1;
          if (nextIdx < textInputs.length) {
            textInputs[nextIdx]?.focus();
          } else if (allAnswered()) {
            handleSubmit();
          }
        }
      });
    }

    // Divider between questions (not after last)
    if (!isSingle && idx < questions.length - 1) {
      card.appendChild(el("div", {
        borderTop: `1px dashed ${T.panelBorder}`,
        margin: "10px 0",
      }));
    }
  });

  // Multi-question: bottom submit button
  if (!isSingle) {
    submitBtn = el("div", {
      padding: "8px 20px", borderRadius: "4px", cursor: "not-allowed",
      background: T.green, color: "#fff", fontSize: "11px", fontWeight: "bold",
      letterSpacing: "1px", textAlign: "center", marginTop: "12px",
      opacity: "0.4", transition: "all 0.2s",
      border: `1px solid ${T.green}`,
    }, "SUBMIT");

    submitBtn.addEventListener("click", handleSubmit);
    submitBtn.addEventListener("mouseenter", () => {
      if (allAnswered()) submitBtn.style.boxShadow = `0 0 12px ${T.green}66`;
    });
    submitBtn.addEventListener("mouseleave", () => {
      submitBtn.style.boxShadow = "none";
    });

    card.appendChild(submitBtn);
  }

  // Remove streamed text that duplicates the form (Claude often generates
  // a text version of the same questions alongside the AskUserQuestion tool_use)
  const currentSt = window.__jarvisStreamState;
  if (currentSt?._turnTextNodes?.length > 0) {
    currentSt._turnTextNodes.forEach(node => {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    currentSt._turnTextNodes = [];
  }

  container.appendChild(card);
  if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight;

  // TTS announcement: read the first question
  if (ttsService && ttsService.isEnabled && !ttsService.isMuted) {
    const firstQ = questions[0];
    let ttsMsg = `Sir, ${firstQ.question || firstQ.header || "I have a question for you."}`;
    const optLabels = (firstQ.options || []).map(o => o.label || String(o));
    if (optLabels.length > 0) {
      ttsMsg += ` Options are: ${optLabels.join(", ")}.`;
    }
    ttsService.speak(ttsMsg);
  }
}

// ═══════════════════════════════════════════
// ── RemoteRecorder (remote mode only) ──
// ═══════════════════════════════════════════

class RemoteRecorder {
  constructor() {
    this._stream = null;
    this._recorder = null;
    this._recording = false;
    this._format = "webm";
  }

  get isRecording() { return this._recording; }
  get format() { return this._format; }

  async start() {
    this._stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
    });
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
    networkClient.sendAudioStart(this._format, 44100, currentSessionId);
    this._recorder.start(250);
    this._recording = true;
  }

  stop() {
    if (this._recorder && this._recorder.state !== "inactive") this._recorder.stop();
    if (this._stream) { this._stream.getTracks().forEach((t) => t.stop()); this._stream = null; }
    this._recording = false;
    networkClient.sendAudioEnd();
  }

  cancel() {
    this._recording = false;
    if (this._recorder && this._recorder.state !== "inactive") {
      try { this._recorder.stop(); } catch {}
    }
    if (this._stream) { this._stream.getTracks().forEach((t) => t.stop()); this._stream = null; }
    networkClient.sendCancel();
  }
}

const remoteRecorder = isRemoteMode ? new RemoteRecorder() : null;

// ═══════════════════════════════════════════
// ── AudioPlayer (remote mode, server TTS) ──
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
    if (!this._ctx) this._ctx = new AudioContext({ sampleRate: this._sampleRate });
    if (this._ctx.state === "suspended") this._ctx.resume().catch(() => {});
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

let audioPlayer = null;
if (isRemoteMode && remoteTtsMode === "server") {
  audioPlayer = new AudioPlayer();
}

// ── Session-manager sync (replaces readVoiceState / writeVoiceState) ──
function syncFromManager() {
  const session = sessionManager.getActiveSession();
  if (session) {
    activeJarvisSessionId = session.id;
    currentSessionId = session.sessionId;
    conversationHistory = session.conversationHistory;
    fullBuffer = session.fullBuffer;
  } else {
    activeJarvisSessionId = null;
    currentSessionId = null;
    conversationHistory = [];
    fullBuffer = "";
  }
}

function syncToManager() {
  if (!activeJarvisSessionId) return;
  const session = sessionManager.getSession(activeJarvisSessionId);
  if (session) {
    session.sessionId = currentSessionId;
    session.conversationHistory = conversationHistory;
    session.fullBuffer = fullBuffer;
    session.lastActiveAt = Date.now();
    sessionManager.saveImmediate();
  }
}

// ── Restore persisted session state from session-manager ──
// On first load, ensure an active session exists
if (!sessionManager.getActiveSession()) {
  const defaultIdx = config.projects?.defaultProjectIndex || 0;
  sessionManager.createSession(defaultIdx);
}
syncFromManager();

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
  animation: animOrNone("jarvisArcRotate 12s linear infinite"),
  pointerEvents: "none",
  willChange: animationsEnabled ? "transform" : "auto",
});
btnContainer.appendChild(outerRing);

// ── Middle glow ring ── (static box-shadow, animated opacity)
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
    animation: animationsEnabled ? `jarvisOrbitDotLarge ${3 + i}s linear infinite ${i * 1.2}s` : "none",
    pointerEvents: "none", opacity: "0.7",
    willChange: animationsEnabled ? "transform" : "auto",
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
// ── Project Selector (replaces old session bar) ──
// ═══════════════════════════════════════════

let projectDropdownOpen = false;
let projectDropdownEl = null;

function getActiveProjectIndex() {
  const session = sessionManager.getActiveSession();
  return session ? session.projectIndex : (config.projects?.defaultProjectIndex || 0);
}

const projectSelectorDot = el("span", {
  display: "inline-block",
  width: "8px", height: "8px",
  borderRadius: "50%",
  flexShrink: "0",
  transition: "background 0.2s ease",
});

const projectSelectorIcon = el("span", {
  fontSize: "14px",
  lineHeight: "1",
  flexShrink: "0",
});

const projectSelectorLabel = el("span", {
  fontSize: "11px", fontWeight: "600",
  letterSpacing: "0.5px",
  color: T.text,
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  flex: "1",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const projectSelectorChevron = el("span", {
  fontSize: "14px",
  color: T.textMuted,
  transition: "transform 0.15s ease, color 0.15s ease",
  flexShrink: "0",
}, "\u25BE");

const projectSelector = el("div", {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "8px 14px",
  marginTop: "12px",
  background: T.panelBg,
  border: `1px solid ${T.panelBorder}`,
  borderRadius: "8px",
  maxWidth: isNarrow ? "100%" : "600px",
  width: "100%",
  cursor: "pointer",
  transition: "border-color 0.2s ease",
  position: "relative",
  userSelect: "none",
});
projectSelector.appendChild(projectSelectorDot);
projectSelector.appendChild(projectSelectorIcon);
projectSelector.appendChild(projectSelectorLabel);
projectSelector.appendChild(projectSelectorChevron);
section.appendChild(projectSelector);

function shouldShowProjectSelector() {
  const all = sessionManager.getAllSessions();
  return all.length === 0 || all.every(s => s.conversationHistory.length === 0 && !s.sessionId);
}

function updateProjectSelector() {
  projectSelector.style.display = shouldShowProjectSelector() ? "flex" : "none";
  const idx = getActiveProjectIndex();
  const color = sessionManager.getProjectColor(idx);
  const icon = sessionManager.getProjectIcon(idx);
  const proj = sessionManager.getProject(idx);
  const label = proj?.label || `Project ${idx}`;
  projectSelectorDot.style.background = color;
  projectSelectorIcon.textContent = icon;
  projectSelectorLabel.textContent = label;
  projectSelectorLabel.style.color = color;
}
updateProjectSelector();

projectSelector.addEventListener("mouseenter", () => {
  if (uiState !== "streaming" && uiState !== "launching") {
    projectSelector.style.borderColor = T.accent + "44";
  }
});
projectSelector.addEventListener("mouseleave", () => {
  if (!projectDropdownOpen) projectSelector.style.borderColor = T.panelBorder;
});

function closeProjectDropdown() {
  if (projectDropdownEl && projectDropdownEl.parentNode) {
    projectDropdownEl.parentNode.removeChild(projectDropdownEl);
  }
  projectDropdownEl = null;
  projectDropdownOpen = false;
  projectSelectorChevron.style.transform = "";
  projectSelector.style.borderColor = T.panelBorder;
}

function openProjectDropdown() {
  if (projectDropdownOpen) { closeProjectDropdown(); return; }
  if (uiState === "streaming" || uiState === "launching") return;
  cancelTabEdit();

  projectDropdownOpen = true;
  projectSelectorChevron.style.transform = "rotate(180deg)";
  projectSelector.style.borderColor = T.accent + "44";

  const rect = projectSelector.getBoundingClientRect();
  const dropdown = el("div", {
    position: "fixed",
    top: (rect.bottom + 4) + "px",
    left: rect.left + "px",
    width: rect.width + "px",
    background: T.panelBg,
    border: `1px solid ${T.accent}33`,
    borderRadius: "8px",
    overflow: "hidden",
    zIndex: "10000",
    maxHeight: "240px",
    overflowY: "auto",
    boxShadow: `0 8px 24px rgba(0,0,0,0.4), 0 0 1px ${T.accent}22`,
  });
  dropdown.classList.add("jarvis-project-dropdown");

  const currentIdx = getActiveProjectIndex();
  const tracked = sessionManager.tracked;

  for (let i = 0; i < tracked.length; i++) {
    const proj = tracked[i];
    const color = sessionManager.getProjectColor(i);
    const icon = sessionManager.getProjectIcon(i);
    const isActive = i === currentIdx;

    const item = el("div", {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 14px",
      cursor: "pointer",
      transition: "background 0.1s ease",
      background: isActive ? `${color}12` : "transparent",
    });

    item.appendChild(el("span", {
      display: "inline-block",
      width: "6px", height: "6px",
      borderRadius: "50%",
      background: color,
      flexShrink: "0",
    }));

    item.appendChild(el("span", {
      fontSize: "13px", lineHeight: "1", flexShrink: "0",
    }, icon));

    item.appendChild(el("span", {
      fontSize: "11px", fontWeight: "600",
      letterSpacing: "0.5px",
      color: isActive ? color : T.text,
      fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
      flex: "1",
    }, proj.label));

    if (isActive) {
      item.appendChild(el("span", {
        fontSize: "12px", color, flexShrink: "0",
      }, "\u2713"));
    }

    const projIdx = i;
    item.addEventListener("mouseenter", () => {
      if (!isActive) item.style.background = `${color}08`;
    });
    item.addEventListener("mouseleave", () => {
      item.style.background = isActive ? `${color}12` : "transparent";
    });
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      closeProjectDropdown();
      if (projIdx !== currentIdx) {
        createNewSession(projIdx);
      }
    });

    dropdown.appendChild(item);
  }

  projectDropdownEl = dropdown;
  document.body.appendChild(dropdown);
}

projectSelector.addEventListener("click", (e) => {
  e.stopPropagation();
  openProjectDropdown();
});

// Click-outside to close dropdown
function handleClickOutsideDropdown(e) {
  if (projectDropdownOpen && !projectSelector.contains(e.target) && !(projectDropdownEl && projectDropdownEl.contains(e.target))) {
    closeProjectDropdown();
  }
}
document.addEventListener("click", handleClickOutsideDropdown);
ctx.cleanups.push(() => { document.removeEventListener("click", handleClickOutsideDropdown); closeProjectDropdown(); });

// ═══════════════════════════════════════════
// ── Text input row (both modes) ──
// ═══════════════════════════════════════════

const textInput = document.createElement("textarea");
textInput.rows = 1;
textInput.placeholder = "Type a command...";
Object.assign(textInput.style, {
  flex: "1",
  background: T.panelBg,
  border: `1px solid ${T.panelBorder}`,
  borderRadius: "8px",
  padding: isNarrow ? "8px 12px" : "10px 14px",
  color: T.text,
  fontSize: isNarrow ? "12px" : "13px",
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  outline: "none",
  transition: "border-color 0.2s ease",
  resize: "none",
  overflow: "hidden",
  lineHeight: "1.4",
  minHeight: isNarrow ? "34px" : "38px",
  maxHeight: "120px",
});
function autoResizeTextInput() {
  textInput.style.height = "auto";
  textInput.style.height = Math.min(textInput.scrollHeight, 120) + "px";
  textInput.style.overflow = textInput.scrollHeight > 120 ? "auto" : "hidden";
}
textInput.addEventListener("input", autoResizeTextInput);
textInput.addEventListener("focus", () => { textInput.style.borderColor = T.accent + "66"; });
textInput.addEventListener("blur", () => { textInput.style.borderColor = T.panelBorder; });

const sendBtn = el("span", {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: isNarrow ? "36px" : "40px",
  height: isNarrow ? "36px" : "40px",
  borderRadius: "8px",
  background: T.accent + "15",
  border: `1px solid ${T.accent}33`,
  color: T.accent,
  cursor: "pointer",
  transition: "all 0.2s ease",
  flexShrink: "0",
});
sendBtn.innerHTML = SVG_SEND;
sendBtn.addEventListener("mouseenter", () => {
  sendBtn.style.background = T.accent + "25";
  sendBtn.style.borderColor = T.accent + "66";
});
sendBtn.addEventListener("mouseleave", () => {
  sendBtn.style.background = T.accent + "15";
  sendBtn.style.borderColor = T.accent + "33";
});

const textInputRow = el("div", {
  display: "flex",
  gap: "8px",
  marginTop: "12px",
  width: "100%",
  maxWidth: isNarrow ? "100%" : "600px",
  alignItems: "flex-end",
});
textInputRow.appendChild(textInput);
textInputRow.appendChild(sendBtn);
section.appendChild(textInputRow);

// ═══════════════════════════════════════════
// ── Connection status bar (remote mode only) ──
// ═══════════════════════════════════════════

let connBar = null;
if (isRemoteMode) {
  const connDot = el("span", {
    display: "inline-block",
    width: "6px", height: "6px",
    borderRadius: "50%",
    background: T.textMuted,
    flexShrink: "0",
    transition: "background 0.3s ease",
  });

  const connLabel = el("span", {
    fontSize: "10px", fontWeight: "600",
    letterSpacing: "1.5px", textTransform: "uppercase",
    color: T.textMuted,
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    transition: "color 0.3s ease",
  }, "Disconnected");

  const connBtn = el("span", {
    fontSize: "10px", fontWeight: "600",
    letterSpacing: "1px",
    color: T.accent,
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    padding: "3px 10px",
    borderRadius: "6px",
    border: `1px solid ${T.accent}44`,
    cursor: "pointer",
    transition: "all 0.2s ease",
    display: "none",
  }, "Connect");
  connBtn.addEventListener("click", () => networkClient?.connect());
  connBtn.addEventListener("mouseenter", () => {
    connBtn.style.background = T.accent + "15";
    connBtn.style.borderColor = T.accent + "77";
  });
  connBtn.addEventListener("mouseleave", () => {
    connBtn.style.background = "transparent";
    connBtn.style.borderColor = T.accent + "44";
  });

  connBar = el("div", {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 14px",
    marginTop: "12px",
    background: T.panelBg,
    border: `1px solid ${T.panelBorder}`,
    borderRadius: "8px",
    maxWidth: isNarrow ? "100%" : "600px",
    width: "100%",
  });
  connBar.appendChild(connDot);
  connBar.appendChild(connLabel);
  connBar.appendChild(el("div", { flex: "1" }));
  connBar.appendChild(connBtn);
  section.appendChild(connBar);

  function updateConnectionUI(s) {
    if (s === "connected") {
      connDot.style.background = T.green;
      connLabel.textContent = "Connected";
      connLabel.style.color = T.green;
      connBtn.style.display = "none";
    } else if (s === "connecting" || s === "reconnecting") {
      connDot.style.background = T.orange;
      connLabel.textContent = s === "connecting" ? "Connecting..." : "Reconnecting...";
      connLabel.style.color = T.orange;
      connBtn.style.display = "none";
    } else {
      connDot.style.background = T.textMuted;
      connLabel.textContent = "Disconnected";
      connLabel.style.color = T.textMuted;
      connBtn.textContent = "Connect";
      connBtn.style.display = "inline";
    }
  }
  networkClient.onStateChange(updateConnectionUI);
  updateConnectionUI(networkClient.state);
}

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
}, termTitle));

// Spacer
terminalHeader.appendChild(el("div", { flex: "1" }));

// Project tag [📓 MyLifeVault]
const projectTag = el("span", {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  fontSize: "10px",
  fontWeight: "600",
  letterSpacing: "0.5px",
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  padding: "2px 8px",
  borderRadius: "6px",
  marginRight: "8px",
  transition: "all 0.2s ease",
});
const projectTagIcon = el("span", { fontSize: "11px", lineHeight: "1" });
const projectTagLabel = el("span", {});
projectTag.appendChild(projectTagIcon);
projectTag.appendChild(projectTagLabel);
projectTag.style.display = showProjectTag ? "inline-flex" : "none";
terminalHeader.appendChild(projectTag);

function updateProjectTag() {
  const idx = getActiveProjectIndex();
  const color = sessionManager.getProjectColor(idx);
  const icon = sessionManager.getProjectIcon(idx);
  const proj = sessionManager.getProject(idx);
  const label = proj?.label || `Project ${idx}`;
  projectTagIcon.textContent = icon;
  projectTagLabel.textContent = label;
  projectTag.style.color = color;
  projectTag.style.borderColor = color + "44";
  projectTag.style.border = `1px solid ${color}44`;
  projectTag.style.background = color + "12";
}
updateProjectTag();

// Status badge [● claude]
const badgeDot = el("span", {
  display: "inline-block",
  width: "6px", height: "6px",
  borderRadius: "50%",
  background: T.textMuted,
  marginRight: "6px",
  transition: "background 0.3s ease",
});

const badgeLabel = el("span", {}, "jarvis");

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
statusBadge.style.display = showStatusBadge ? "inline-flex" : "none";
terminalHeader.appendChild(statusBadge);

function updateBadgeState(state) {
  if (state === "running") {
    badgeDot.style.background = T.green;
    badgeDot.style.animation = animOrNone("jarvisPulse 2s ease-in-out infinite");
    badgeLabel.textContent = "jarvis";
    statusBadge.style.color = T.green;
  } else if (state === "success") {
    badgeDot.style.background = T.green;
    badgeDot.style.animation = "none";
    badgeLabel.textContent = "\u2713 jarvis";
    statusBadge.style.color = T.green;
  } else if (state === "error") {
    badgeDot.style.background = T.red;
    badgeDot.style.animation = "none";
    badgeLabel.textContent = "\u2717 jarvis";
    statusBadge.style.color = T.red;
  } else {
    badgeDot.style.background = T.textMuted;
    badgeDot.style.animation = "none";
    badgeLabel.textContent = "jarvis";
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
  let speakPulseId = setInterval(() => {
    if (!ttsService) return;
    if (ttsService.isSpeaking && !ttsService.isMuted) {
      muteBtn.style.animation = animOrNone("jarvisPulse 2s ease-in-out infinite");
    } else if (muteBtn.style.animation) {
      muteBtn.style.animation = "";
    }
  }, 500);
  ctx.intervals.push(speakPulseId);

  // Register with pausable system
  ctx.registerPausable(
    () => {
      speakPulseId = setInterval(() => {
        if (!ttsService) return;
        if (ttsService.isSpeaking && !ttsService.isMuted) {
          muteBtn.style.animation = animOrNone("jarvisPulse 2s ease-in-out infinite");
        } else if (muteBtn.style.animation) {
          muteBtn.style.animation = "";
        }
      }, 500);
      ctx.intervals.push(speakPulseId);
    },
    () => { clearInterval(speakPulseId); }
  );
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
copyBtn.style.display = showCopyButton ? "inline" : "none";
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

// ═══════════════════════════════════════════
// ── Session Tab Bar ──
// ═══════════════════════════════════════════

const tabBar = el("div", { display: "none" });
tabBar.classList.add("jarvis-tab-bar");
terminalPanel.appendChild(tabBar);

// ── Editable tab state ──
let editingTabId = null;
let editingInput = null;

function cancelTabEdit() {
  if (editingTabId) {
    editingTabId = null;
    editingInput = null;
    renderTabBar();
  }
}

function startTabEdit(sessionId, labelSpan) {
  if (editingTabId) cancelTabEdit();
  const sess = sessionManager.getSession(sessionId);
  if (!sess) return;
  const color = sess.sessionColor || sess.projectColor || sessionManager.getProjectColor(sess.projectIndex);
  const icon = sess.projectIcon || sessionManager.getProjectIcon(sess.projectIndex);
  const currentName = sess.customName || `${icon} ${sess.projectLabel}`;
  const input = document.createElement("input");
  input.type = "text";
  input.value = currentName;
  Object.assign(input.style, {
    font: "10px 'SF Mono', 'Fira Code', 'Consolas', monospace",
    fontWeight: "600",
    letterSpacing: "0.5px",
    background: "transparent",
    border: "none",
    borderBottom: `1px solid ${color}`,
    color: color,
    outline: "none",
    padding: "0",
    width: Math.max(60, Math.min(200, labelSpan.offsetWidth + 10)) + "px",
    minWidth: "60px",
    maxWidth: "200px",
  });
  labelSpan.textContent = "";
  labelSpan.appendChild(input);
  input.focus();
  input.select();
  editingTabId = sessionId;
  editingInput = input;

  function commitEdit() {
    const val = input.value.trim();
    sess.customName = val || null;
    sessionManager.saveImmediate();
    editingTabId = null;
    editingInput = null;
    renderTabBar();
  }
  function cancelEdit() {
    editingTabId = null;
    editingInput = null;
    renderTabBar();
  }
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
    else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
  });
  input.addEventListener("blur", cancelEdit);
}

// ── Drag & drop state ──
let dragSourceId = null;

function renderTabBar() {
  const allSessions = sessionManager.getAllSessions();
  tabBar.innerHTML = "";

  if (allSessions.length === 0) {
    tabBar.style.display = "none";
    return;
  }
  tabBar.style.display = "flex";

  const activeId = sessionManager.getActiveSessionId();

  for (const sess of allSessions) {
    const isActive = sess.id === activeId;
    const color = sess.sessionColor || sess.projectColor || sessionManager.getProjectColor(sess.projectIndex);
    const icon = sess.projectIcon || sessionManager.getProjectIcon(sess.projectIndex);

    const tab = el("div", {
      color: isActive ? color : T.textMuted,
      borderBottomColor: isActive ? color : "transparent",
      background: isActive ? `${color}08` : "transparent",
    });
    tab.classList.add("jarvis-tab");

    // Colored dot
    tab.appendChild(el("span", {
      display: "inline-block",
      width: "5px", height: "5px",
      borderRadius: "50%",
      background: color,
      opacity: isActive ? "1" : "0.6",
      flexShrink: "0",
    }));

    // Label
    const displayText = sess.customName || `${icon} ${sess.projectLabel}`;
    const labelSpan = el("span", {}, displayText);
    tab.appendChild(labelSpan);

    // Double-click to edit tab name
    labelSpan.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startTabEdit(sess.id, labelSpan);
    });

    // Notification badge (shown when background stream completes)
    if (!isActive && sess.status === "done" && sess._notifyBadge) {
      const badge = el("span", { background: color });
      badge.classList.add("jarvis-tab-badge");
      tab.appendChild(badge);
    }

    // Close button
    const closeTabBtn = el("span", {
      color: T.textMuted,
      cursor: "pointer",
    }, "\u2715");
    closeTabBtn.classList.add("jarvis-tab-close");
    closeTabBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeSession(sess.id);
    });
    tab.appendChild(closeTabBtn);

    tab.addEventListener("click", () => {
      if (!isActive) switchToSession(sess.id);
    });

    // ── Drag & drop ──
    tab.draggable = true;
    tab.dataset.sessionId = sess.id;
    tab.addEventListener("dragstart", (e) => {
      dragSourceId = sess.id;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", sess.id);
      tab.classList.add("jarvis-dragging");
    });
    tab.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragSourceId && dragSourceId !== sess.id) {
        tab.classList.add("jarvis-drag-over");
      }
    });
    tab.addEventListener("dragleave", () => {
      tab.classList.remove("jarvis-drag-over");
    });
    tab.addEventListener("drop", (e) => {
      e.preventDefault();
      tab.classList.remove("jarvis-drag-over");
      const sourceId = e.dataTransfer.getData("text/plain");
      if (sourceId && sourceId !== sess.id) {
        const allS = sessionManager.getAllSessions();
        const targetIdx = allS.findIndex(s => s.id === sess.id);
        if (targetIdx >= 0) {
          sessionManager.moveSession(sourceId, targetIdx);
          renderTabBar();
        }
      }
    });
    tab.addEventListener("dragend", () => {
      tab.classList.remove("jarvis-dragging");
      dragSourceId = null;
    });

    tabBar.appendChild(tab);
  }

  // "+" button to add new session
  const addBtn = el("div", {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    cursor: "pointer",
    color: T.textMuted,
    fontSize: "14px",
    fontWeight: "600",
    transition: "color 0.15s ease",
    flexShrink: "0",
  }, "+");
  addBtn.addEventListener("mouseenter", () => { addBtn.style.color = T.accent; });
  addBtn.addEventListener("mouseleave", () => { addBtn.style.color = T.textMuted; });
  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showTabAddPicker(addBtn);
  });
  tabBar.appendChild(addBtn);
}

// Mini project picker for "+" button
let tabAddPickerEl = null;

function showTabAddPicker(anchorEl) {
  cancelTabEdit();
  if (tabAddPickerEl) { hideTabAddPicker(); return; }

  const picker = el("div", {
    position: "fixed",
    background: T.panelBg,
    border: `1px solid ${T.accent}33`,
    borderRadius: "8px",
    overflow: "hidden",
    zIndex: "10000",
    maxHeight: "200px",
    overflowY: "auto",
    boxShadow: `0 8px 24px rgba(0,0,0,0.4)`,
    minWidth: "180px",
  });
  picker.classList.add("jarvis-project-dropdown");

  const tracked = sessionManager.tracked;
  for (let i = 0; i < tracked.length; i++) {
    const proj = tracked[i];
    const color = sessionManager.getProjectColor(i);
    const icon = sessionManager.getProjectIcon(i);

    const item = el("div", {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "7px 12px",
      cursor: "pointer",
      transition: "background 0.1s ease",
    });

    item.appendChild(el("span", {
      display: "inline-block",
      width: "5px", height: "5px",
      borderRadius: "50%",
      background: color,
      flexShrink: "0",
    }));

    item.appendChild(el("span", {
      fontSize: "12px", lineHeight: "1", flexShrink: "0",
    }, icon));

    item.appendChild(el("span", {
      fontSize: "10px", fontWeight: "600",
      letterSpacing: "0.5px",
      color: T.text,
      fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    }, proj.label));

    const projIdx = i;
    item.addEventListener("mouseenter", () => { item.style.background = `${color}08`; });
    item.addEventListener("mouseleave", () => { item.style.background = "transparent"; });
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      hideTabAddPicker();
      createNewSession(projIdx);
    });

    picker.appendChild(item);
  }

  tabAddPickerEl = picker;
  document.body.appendChild(picker);

  // Position below the anchor
  const rect = anchorEl.getBoundingClientRect();
  picker.style.top = (rect.bottom + 4) + "px";
  picker.style.left = Math.max(4, rect.left - 80) + "px";
}

function hideTabAddPicker() {
  if (tabAddPickerEl && tabAddPickerEl.parentNode) {
    tabAddPickerEl.parentNode.removeChild(tabAddPickerEl);
  }
  tabAddPickerEl = null;
}

function handleClickOutsideTabPicker(e) {
  if (tabAddPickerEl && !tabAddPickerEl.contains(e.target)) {
    hideTabAddPicker();
  }
}
document.addEventListener("click", handleClickOutsideTabPicker);
ctx.cleanups.push(() => { document.removeEventListener("click", handleClickOutsideTabPicker); hideTabAddPicker(); });

// Close all dropdowns on scroll (capture phase catches inner scrollable containers)
function closeAllDropdowns() { closeProjectDropdown(); hideTabAddPicker(); }
document.addEventListener("scroll", closeAllDropdowns, { passive: true, capture: true });
ctx.cleanups.push(() => document.removeEventListener("scroll", closeAllDropdowns, { capture: true }));

// Initial render
renderTabBar();

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
  // Update project selector + tag + tab bar on session change
  updateProjectSelector();
  updateProjectTag();
  renderTabBar();
}

function clearSession() {
  if (isRemoteMode) {
    if (audioPlayer) audioPlayer.stop();
    if (remoteTtsMode === "local" && ttsService) ttsService.stop();
    networkClient?.sendNewSession();
  } else {
    if (ttsService) ttsService.stop();
    killClaudeProcess();
  }
  currentSessionId = null;
  conversationHistory = [];
  preSpawnJsonlSet = null;
  fullBuffer = "";
  terminalOutput.innerHTML = "";
  updateBadgeState("idle");
  syncToManager();
  updateSessionIndicator();
  if (terminalPanel.style.display !== "none") closeTerminalPanel();
  setUIState("idle");
}

// ── Multi-session management ──
function switchToSession(jarvisSessionId) {
  if (jarvisSessionId === activeJarvisSessionId) return;
  cancelTabEdit();
  // Save current state
  syncToManager();
  // Update active session status
  const current = sessionManager.getActiveSession();
  if (current && current.status === "streaming") {
    // Keep streaming in background — don't kill process
    current._notifyBadge = false;
  }
  // Switch
  sessionManager.setActiveSession(jarvisSessionId);
  syncFromManager();
  // Re-render terminal with new session's history
  replayTerminalForActiveSession();
  updateSessionIndicator();
  updateProjectSelector();
  updateProjectTag();
  // Update UI state based on the switched-to session's status
  const newSession = sessionManager.getActiveSession();
  if (newSession) {
    newSession._notifyBadge = false; // Clear notification on view
    if (newSession.status === "streaming") {
      setUIState("streaming");
    } else if (newSession.conversationHistory.length > 0) {
      setUIState("done");
    } else {
      setUIState("idle");
    }
  }
}

function createNewSession(projectIndex) {
  // Save current state
  syncToManager();
  cancelTabEdit();
  // Create new session
  const session = sessionManager.createSession(projectIndex);
  activeJarvisSessionId = session.id;
  currentSessionId = null;
  conversationHistory = [];
  fullBuffer = "";
  preSpawnJsonlSet = null;
  // Clear terminal output but keep panel open (tab bar stays visible)
  terminalOutput.innerHTML = "";
  updateBadgeState("idle");
  updateSessionIndicator();
  updateProjectSelector();
  updateProjectTag();
  setUIState("idle");
}

function closeSession(jarvisSessionId) {
  cancelTabEdit();
  const session = sessionManager.getSession(jarvisSessionId);
  if (!session) return;
  // Kill process if this session is actively streaming
  if (session.status === "streaming" && jarvisSessionId === activeJarvisSessionId) {
    if (isRemoteMode) {
      networkClient?.sendCancel();
    } else {
      killClaudeProcess();
    }
  }
  const wasActive = jarvisSessionId === activeJarvisSessionId;
  sessionManager.removeSession(jarvisSessionId);
  if (wasActive) {
    // Switch to next available session or create default
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
      terminalOutput.innerHTML = "";
      if (terminalPanel.style.display !== "none") closeTerminalPanel();
    }
    setUIState("idle");
    updateBadgeState("idle");
  }
  updateSessionIndicator();
  updateProjectSelector();
  updateProjectTag();
}

function replayTerminalForActiveSession() {
  terminalOutput.innerHTML = "";
  if (!currentSessionId && conversationHistory.length === 0) return;

  let _replayThinkingShown = false;
  for (let i = 0; i < conversationHistory.length; i++) {
    const turn = conversationHistory[i];
    if (turn.role === "user") {
      _replayThinkingShown = false;
      if (i > 0) appendTurnSeparator();
      const echoLine = el("div", { marginBottom: "4px", wordBreak: "break-word", whiteSpace: "pre-wrap" });
      echoLine.appendChild(el("span", { color: T.green }, "$ "));
      if (showCommand) {
        const isResTurn = i > 0;
        const cmdText = isResTurn
          ? `claude --resume ${currentSessionId?.slice(0, 7) || "???"}\u2026 ${turn.text}`
          : `claude --print ${turn.text}`;
        echoLine.appendChild(el("span", { color: T.textMuted }, cmdText));
      } else {
        echoLine.appendChild(el("span", { color: T.textMuted }, turn.text));
      }
      const userText = turn.text;
      addMessageCopyIcon(echoLine, () => userText);
      terminalOutput.appendChild(echoLine);
      terminalOutput.appendChild(el("div", {
        height: "1px", background: `${T.accent}33`, margin: "8px 0",
      }));
    } else if (turn.role === "tool") {
      if (!showToolUseLabels) continue;
      const skipTools = { Skill: 1, Agent: 1, WebSearch: 1, WebFetch: 1 };
      if (skipTools[turn.text]) continue;
      const infoLine = el("div", {
        color: T.gold, fontSize: "10px", opacity: "0.7",
        marginTop: "4px", letterSpacing: "0.5px",
      }, `\u26A1 ${turn.text}`);
      terminalOutput.appendChild(infoLine);
    } else if (turn.role === "permission") {
      renderCompletedInteractionCard({
        type: "permission", tool: turn.tool, input: turn.input,
        decision: turn.decision, requestId: turn.requestId,
      }, terminalOutput, terminalOutput);
    } else if (turn.role === "question") {
      renderCompletedInteractionCard({
        type: "question", message: turn.message, options: turn.options,
        answer: turn.answer, requestId: turn.requestId,
      }, terminalOutput, terminalOutput);
    } else if (turn.role === "status") {
      if (turn.type === "thinking") {
        if (!_replayThinkingShown) {
          _replayThinkingShown = true;
          renderStatusLabel(turn.type, turn.label, terminalOutput, terminalOutput, { replay: true });
        }
        continue;
      }
      renderStatusLabel(turn.type, turn.label, terminalOutput, terminalOutput, { replay: true });
    } else if (turn.role === "assistant") {
      const assistantDiv = el("div", { color: T.text, position: "relative" });
      assistantDiv.appendChild(markdownRenderer.renderMarkdown(turn.text));
      const assistantText = turn.text;
      addMessageCopyIcon(assistantDiv, () => assistantText);
      terminalOutput.appendChild(assistantDiv);
      if (showCompletionLabel) {
        terminalOutput.appendChild(el("div", {
          color: T.accent, opacity: "0.6", marginTop: "8px",
          fontSize: isNarrow ? "10px" : "11px", letterSpacing: "1px",
        }, `[${completionLabel}]`));
      }
    }
  }

  if (conversationHistory.length > 0) {
    openTerminalPanel();
    updateBadgeState("success");
  }
}

closeBtn.addEventListener("click", () => {
  if (isRemoteMode) {
    if (uiState === "streaming" || uiState === "transcribing") networkClient?.sendCancel();
    if (audioPlayer) audioPlayer.stop();
    if (remoteTtsMode === "local" && ttsService) ttsService.stop();
  } else {
    if (ttsService) ttsService.stop();
    killClaudeProcess();
  }
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

if (conversationHistory.length > 0) {
  replayTerminalForActiveSession();
  updateSessionIndicator();
  setUIState("done");
}

// ═══════════════════════════════════════════
// ── State management ──
// ═══════════════════════════════════════════

function setUIState(newState) {
  uiState = newState;
  // Signal to other widgets (especially live-sessions) that JARVIS is streaming
  ctx._jarvisStreaming = (newState === "streaming" || newState === "launching");

  if (newState === "idle") {
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
    const hasHistory = currentSessionId || conversationHistory.length > 0;
    statusText.textContent = hasHistory ? "Speak your next message..." : "Tap to speak to JARVIS";
    statusText.style.color = hasHistory ? T.accent : T.textMuted;
    previewEl.style.display = "none";
    previewEl.style.opacity = "0";

  } else if (newState === "recording") {
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
    // Zoom wave on entire button — synced at 3s with core breathing
    btnContainer.style.setProperty("--jarvis-zoom-min", zoomMin);
    btnContainer.style.setProperty("--jarvis-zoom-max", zoomMax);
    btnContainer.style.animation = animOrNone("jarvisRecordZoom 3s ease-in-out infinite");
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
    core.style.animation = animOrNone("jarvisBreathing 2s ease-in-out infinite");
    outerRing.style.animation = animOrNone("jarvisArcRotate 6s linear infinite");
    outerRing.style.borderColor = T.accent + "44";
    glowRing.style.animation = animOrNone("jarvisArcPulse 2s ease-in-out infinite");
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
    outerRing.style.animation = animOrNone("jarvisArcRotate 2s linear infinite");
    outerRing.style.borderColor = T.green + "44";
    glowRing.style.animation = "none";
    glowRing.style.boxShadow = `0 0 30px ${T.green}30`;
    btnContainer.style.animation = "none";
    statusText.textContent = "Launching JARVIS...";
    statusText.style.color = T.green;

  } else if (newState === "streaming") {
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
    updateBadgeState("running");

  } else if (newState === "done") {
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
    const hasHistory = currentSessionId || conversationHistory.length > 0;
    statusText.textContent = hasHistory ? "Tap to continue the conversation" : "Tap to speak to JARVIS";
    statusText.style.color = hasHistory ? T.accent : T.textMuted;
    updateBadgeState("success");

  } else if (newState === "error") {
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
    updateBadgeState("error");
  }

  // Disable text input and project selector during active states
  const inputBusy = (newState === "recording" || newState === "transcribing" || newState === "launching");
  const selectorBusy = (newState === "streaming" || newState === "launching" || newState === "recording" || newState === "transcribing");
  textInput.disabled = inputBusy;
  sendBtn.style.opacity = inputBusy ? "0.3" : "1";
  sendBtn.style.pointerEvents = inputBusy ? "none" : "auto";
  projectSelector.style.opacity = selectorBusy ? "0.5" : "1";
  projectSelector.style.pointerEvents = selectorBusy ? "none" : "auto";

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

// ── Voice service state sync (local mode only) ──
if (!isRemoteMode) {
  voiceService.onStateChange((vsState) => {
    if (vsState === "idle" && uiState === "recording") {
      stopRecordTimer();
      setUIState("idle");
    }
  });
}

// ── Cancel recording ──
function cancelRecording() {
  stopRecordTimer();
  voiceService.cancelRecording();
  setUIState("idle");
  new Notice("Voice command cancelled.");
}

// ── Escape key handler ──
function handleKeyDown(e) {
  // Ctrl+C / Cmd+C to cancel during streaming
  if ((e.ctrlKey || e.metaKey) && e.key === "c" && (uiState === "streaming" || uiState === "transcribing")) {
    e.preventDefault();
    if (isRemoteMode) {
      networkClient?.sendCancel();
      if (audioPlayer) audioPlayer.stop();
      if (remoteTtsMode === "local" && ttsService) ttsService.stop();
    } else {
      if (ttsService) ttsService.stop();
      killClaudeProcess();
    }
    const cancelLine = el("div", { color: T.accent, opacity: "0.6", marginTop: "8px", fontSize: isNarrow ? "10px" : "11px", letterSpacing: "1px" }, "[Cancelled]");
    terminalOutput.appendChild(cancelLine);
    setUIState("done");
    return;
  }
  if (e.key === "Escape") {
    if (uiState === "recording") {
      e.preventDefault();
      if (isRemoteMode) {
        remoteRecorder.cancel();
        stopRecordTimer();
        setUIState("idle");
      } else {
        cancelRecording();
      }
    } else if (uiState === "streaming" || uiState === "transcribing") {
      e.preventDefault();
      if (isRemoteMode) {
        networkClient?.sendCancel();
        if (audioPlayer) audioPlayer.stop();
        if (remoteTtsMode === "local" && ttsService) ttsService.stop();
      } else {
        if (ttsService) ttsService.stop();
        killClaudeProcess();
      }
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
  syncToManager();
  if (isRemoteMode) {
    if (remoteRecorder?.isRecording) remoteRecorder.cancel();
    if (audioPlayer) audioPlayer.stop();
  } else {
    // During active streaming/closing: DON'T kill the process — a new widget instance will reconnect.
    // Only null out delegates if this widget still owns them (prevents race with reconnect).
    const st = window.__jarvisStreamState;
    if (st && (st.uiState === "streaming" || st.uiState === "closing")) {
      if (st._activeSection === section) {
        st._onTextDelta = null;
        st._onToolUse = null;
        st._onStderr = null;
        st._onClose = null;
        st._onPermissionRequest = null;
        st._onQuestionRequest = null;
        st._onDisplayCard = null;
      }
    } else {
      killClaudeProcess();
    }
  }
});

// ── Text input send handler ──
function handleTextSend() {
  cancelTabEdit();
  const text = textInput.value.trim();
  if (!text) return;
  if (uiState === "streaming") {
    if (isRemoteMode) {
      networkClient?.sendCancel();
      if (audioPlayer) audioPlayer.stop();
      if (remoteTtsMode === "local" && ttsService) ttsService.stop();
    } else {
      if (ttsService) ttsService.stop();
      killClaudeProcess();
    }
    const cancelLine = el("div", { color: T.accent, opacity: "0.6", marginTop: "8px", fontSize: isNarrow ? "10px" : "11px", letterSpacing: "1px" }, "[Cancelled]");
    terminalOutput.appendChild(cancelLine);
    // Fall through to send new message
  } else if (uiState === "transcribing" || uiState === "launching" || uiState === "recording") {
    return;
  }

  textInput.value = "";
  textInput.style.height = "auto";
  textInput.style.height = (isNarrow ? 34 : 38) + "px";

  if (isRemoteMode) {
    if (!networkClient?.isConnected) return;
    openTerminalPanel();
    if (conversationHistory.length > 0) appendTurnSeparator();
    const echoLine = el("div", { marginBottom: "4px", wordBreak: "break-word", whiteSpace: "pre-wrap" });
    echoLine.appendChild(el("span", { color: T.green }, "$ "));
    echoLine.appendChild(el("span", { color: T.textMuted }, text));
    terminalOutput.appendChild(echoLine);
    terminalOutput.appendChild(el("div", { height: "1px", background: `${T.accent}33`, margin: "8px 0" }));
    conversationHistory.push({ role: "user", text, timestamp: Date.now() });
    syncToManager();
    setUIState("streaming");
    updateBadgeState("running");
    networkClient.sendTextCommand(text, currentSessionId);
  } else {
    conversationHistory.push({ role: "user", text, timestamp: Date.now() });
    syncToManager();
    setUIState("launching");
    setTimeout(() => launchClaudeInPanel(text), 200);
  }
}

sendBtn.addEventListener("click", handleTextSend);
textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTextSend(); }
});

// ── Core actions ──
function beginRecording() {
  if (ttsService) ttsService.stop();
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
    .then(result => {
      // Support both new { text, detectedLang } and legacy string return
      const text = typeof result === "string" ? result : result.text;
      const detectedLang = typeof result === "string" ? null : result.detectedLang;
      console.log(`[VoiceCmd] finishRecording: detectedLang=${detectedLang}, prev currentDetectedLang=${currentDetectedLang}`);
      currentDetectedLang = detectedLang;

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
        syncToManager();
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
// ── Per-message copy icon ──
// ═══════════════════════════════════════════

function addMessageCopyIcon(container, getText) {
  const icon = el("span", {
    position: "absolute", top: "2px", right: "2px",
    fontSize: "10px", color: T.textMuted, cursor: "pointer",
    opacity: "0", transition: "opacity 0.2s",
    padding: "2px 5px", borderRadius: "3px",
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
  container.addEventListener("mouseenter", () => { icon.style.opacity = "0.7"; });
  container.addEventListener("mouseleave", () => { icon.style.opacity = "0"; });
  container.appendChild(icon);
}

// ═══════════════════════════════════════════
// ── Claude process handlers (shared by initial spawn & retry) ──
// ═══════════════════════════════════════════

function attachProcessHandlers(proc) {
  proc.stdout.on("data", (chunk) => {
    const st = window.__jarvisStreamState;
    if (!st) return;
    st.lineBuf += stripAnsi(chunk.toString("utf8"));
    const lines = st.lineBuf.split("\n");
    st.lineBuf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line);
        // Text delta — accumulate globally + delegate to DOM
        if (evt.type === "stream_event" &&
            evt.event?.type === "content_block_delta" &&
            evt.event?.delta?.type === "text_delta") {
          const txt = evt.event.delta.text;
          st.buffer += txt;
          if (st._onTextDelta) st._onTextDelta(txt);
        }
        // Tool-use start — track block for input_json_delta accumulation
        if (evt.type === "stream_event" &&
            evt.event?.type === "content_block_start" &&
            evt.event?.content_block?.type === "tool_use") {
          const block = evt.event.content_block;
          st.activeToolBlock = {
            name: block.name,
            id: block.id,
            index: evt.event.index,
            inputJsonChunks: [],
            controlRequestFired: false,
          };
          st.toolEvents.push(block.name);
          if (st._onToolUse) st._onToolUse(block.name);
        }
        // Accumulate tool input JSON
        if (evt.type === "stream_event" &&
            evt.event?.type === "content_block_delta" &&
            evt.event?.delta?.type === "input_json_delta") {
          if (st.activeToolBlock) {
            st.activeToolBlock.inputJsonChunks.push(evt.event.delta.partial_json);
          }
        }
        // Tool-use complete — render permission card or display-only card
        if (evt.type === "stream_event" &&
            evt.event?.type === "content_block_stop" &&
            st.activeToolBlock) {
          const block = st.activeToolBlock;
          st.activeToolBlock = null;
          let parsedInput = {};
          try { parsedInput = JSON.parse(block.inputJsonChunks.join("")); } catch {}
          const alwaysAsk = interactiveCfg.alwaysAskTools || [];

          if (interactiveCfg.interactivePermissions && alwaysAsk.includes(block.name)) {
            // Interactive mode: show settings-based permission card for alwaysAsk tools.
            // CLI will deny the tool (not in --allowedTools). User clicks ALLOW → we update
            // settings.local.json → spawn new process with --resume → Claude retries and succeeds.
            let specificEntry, dirEntry;
            if (block.name === "Bash" && parsedInput.command) {
              // Bash: exact command for ALLOW, base command + wildcard for ALWAYS ALLOW
              const cmd = parsedInput.command;
              specificEntry = `Bash(${cmd})`;
              const baseCmd = cmd.split(/\s+/)[0];
              dirEntry = `Bash(${baseCmd} *)`;
            } else {
              // Write/Edit: directory glob pattern for ALWAYS ALLOW (settings.local.json)
              // Uses // format to match existing CLI-created entries (e.g., Write(//Users/.../NoteLab/**))
              const filePath = parsedInput.file_path || parsedInput.path || "";
              const parentDir = filePath ? nodePath.dirname(filePath) : "";
              specificEntry = filePath ? `${block.name}(/${filePath})` : block.name;
              dirEntry = parentDir ? `${block.name}(/${parentDir}/**)` : null;
            }

            // Dedup: if an existing card covers the same tool+directory, skip rendering
            const existingPerm = dirEntry && st.pendingPermissions.find(p =>
              p.dirEntry === dirEntry && p.toolName === block.name && p.status !== "denied"
            );
            if (existingPerm) {
              console.log("[JARVIS] Permission card dedup — covered by existing:", dirEntry);
              st.pendingPermissions.push({
                toolName: block.name, input: parsedInput,
                specificEntry, dirEntry,
                status: "auto-covered", id: block.id,
              });
            } else {
              const permItem = {
                toolName: block.name, input: parsedInput,
                specificEntry, dirEntry,
                status: "pending", id: block.id,
              };
              st.pendingPermissions.push(permItem);

              // Render via delegate (points to current widget's DOM)
              if (st._onDisplayCard) {
                const refs = st._onDisplayCard("permission", permItem);
                if (refs) renderSettingsPermissionCard(permItem, refs.container, refs.scrollParent);
              }
            }
          } else if (block.name === "AskUserQuestion") {
            // Interactive AskUserQuestion form (works in both interactive and non-interactive mode)
            const questions = parsedInput.questions || [];
            if (questions.length > 0 && st._onDisplayCard) {
              const refs = st._onDisplayCard("askuser");
              if (refs) {
                renderAskUserQuestionForm(block.id, parsedInput, refs.container, refs.scrollParent);
              }
            } else if (parsedInput.question || parsedInput.message) {
              // Fallback: single question in flat format (no questions[] array)
              renderDisplayOnlyQuestionCard(parsedInput, st);
            }
          } else if (!interactiveCfg.interactivePermissions) {
            // Non-interactive mode: display-only cards for visibility
            if (alwaysAsk.includes(block.name)) {
              renderDisplayOnlyPermissionCard(block.name, parsedInput, st);
              conversationHistory.push({
                role: "permission", tool: block.name, input: parsedInput,
                decision: "auto", requestId: null, timestamp: Date.now(),
              });
            }
          }

          // Status labels for notable tool invocations (Skill, Agent, Search, etc.)
          const statusTools = { Skill: "skill", Agent: "agent", WebSearch: "search", WebFetch: "search" };
          const labelType = statusTools[block.name];
          if (labelType && st._onDisplayCard) {
            let labelText = "";
            if (block.name === "Skill") {
              labelText = parsedInput.skill || "";
            } else if (block.name === "Agent") {
              labelText = parsedInput.description || "";
            } else if (block.name === "WebSearch") {
              labelText = parsedInput.query || "";
            } else if (block.name === "WebFetch") {
              labelText = parsedInput.url ? parsedInput.url.replace(/^https?:\/\//, "").split("/")[0] : "";
            }
            const refs = st._onDisplayCard();
            if (refs) renderStatusLabel(labelType, labelText, refs.container, refs.scrollParent);
          }
        }
        // Handle interactive control requests
        if (evt.type === "control_request") {
          console.log("[JARVIS] control_request received:", evt.request?.subtype, evt.request_id);
          const req = evt.request || {};
          if (st.activeToolBlock && st.activeToolBlock.name === req.tool_name) {
            st.activeToolBlock.controlRequestFired = true;
          }
          if (req.subtype === "can_use_tool") {
            const autoApprove = interactiveCfg.autoApproveTools || [];
            if (autoApprove.includes(req.tool_name)) {
              console.log("[JARVIS] Auto-approving tool:", req.tool_name);
              sendControlResponse(evt.request_id, {
                subtype: "success",
                request_id: evt.request_id,
                response: { behavior: "allow" },
              });
            } else if (st._onPermissionRequest) {
              st._onPermissionRequest(evt.request_id, req);
            }
          } else if (req.subtype === "elicitation") {
            // Check if this is for a pending AskUserQuestion form
            const pendingAsk = st.pendingInteractions.find(i =>
              i.type === "askuser" && i.status === "pending"
            );
            if (pendingAsk) {
              // Store the requestId on the pending interaction for response routing
              pendingAsk.elicitationRequestId = evt.request_id;
              console.log("[JARVIS] Linked elicitation request to pending AskUserQuestion form:", evt.request_id);
            } else if (st._onQuestionRequest) {
              st._onQuestionRequest(evt.request_id, req);
            }
          }
        }
        // Session ID extraction
        if (evt.session_id && !st.sessionId) st.sessionId = evt.session_id;
        // Handle result event
        if (evt.type === "result") {
          if (evt.session_id) st.sessionId = evt.session_id;
          st.resultReceived = true;

          // Check if there are pending permission decisions (settings.local.json flow)
          const hasPending = interactiveCfg.interactivePermissions &&
            st.pendingPermissions.some(p => p.status === "pending");
          // Check if there are pending AskUserQuestion forms waiting for user input
          const hasPendingAskUser = st.pendingInteractions.some(
            i => i.type === "askuser" && i.status === "pending"
          );
          if (hasPending) {
            // Mark as waiting — close stdin so process exits cleanly.
            // We'll spawn a new process with --resume after user clicks ALLOW/DENY.
            st.uiState = "waiting_permission";
            console.log("[JARVIS] Result received, waiting for permission decisions");
            if (st.process?.stdin?.writable) st.process.stdin.end();
          } else if (hasPendingAskUser) {
            // Keep process alive — user hasn't answered the AskUserQuestion form yet.
            // Their answer will be sent as a follow-up user message via stdin.
            st.uiState = "waiting_askuser";
            console.log("[JARVIS] Result received, waiting for AskUserQuestion input");
          } else {
            st.uiState = "closing";
            if (st.process?.stdin?.writable) st.process.stdin.end();
          }
        }
        // Fallback: extract from result event if no deltas were received
        if (evt.type === "result" && evt.result && !st.buffer) {
          st.buffer += evt.result;
          if (st._onTextDelta) st._onTextDelta(evt.result);
        }
        // Handle assistant event — contains complete message with tool_use blocks
        // This is the reliable source for AskUserQuestion since streaming events may not fire
        if (evt.type === "assistant" && evt.message?.content) {
          let hasThinking = false;
          for (const block of evt.message.content) {
            if (block.type === "thinking" && !hasThinking) {
              hasThinking = true;
              // Only show THINKING label once at the start of the session
              if (!st._thinkingShown && st._onDisplayCard) {
                st._thinkingShown = true;
                const refs = st._onDisplayCard();
                if (refs) renderStatusLabel("thinking", "", refs.container, refs.scrollParent);
              }
            }
            if (block.type === "tool_use" && block.name === "AskUserQuestion" && block.input) {
              // Check if already rendered via content_block_stop path
              const alreadyRendered = st.pendingInteractions.some(
                i => i.type === "askuser" && i.toolUseId === block.id
              );
              if (!alreadyRendered) {
                const questions = block.input.questions || [];
                if (questions.length > 0 && st._onDisplayCard) {
                  const refs = st._onDisplayCard("askuser");
                  if (refs) {
                    renderAskUserQuestionForm(block.id, block.input, refs.container, refs.scrollParent);
                    console.log("[JARVIS] AskUserQuestion form rendered from assistant event:", block.id);
                  }
                } else if (block.input.question || block.input.message) {
                  renderDisplayOnlyQuestionCard(block.input, st);
                }
              }
            }
          }
        }
        // Debug: log unhandled event types
        if (evt.type && evt.type !== "stream_event" && evt.type !== "control_request" && evt.type !== "result" && evt.type !== "assistant" && evt.type !== "user") {
          console.log("[JARVIS-DEBUG] unhandled event type:", evt.type, JSON.stringify(evt).substring(0, 2000));
        }
      } catch (e) {
        console.log("[JARVIS-DEBUG] JSON parse failed:", line.substring(0, 1000), e.message);
      }
    }
  });

  proc.stderr.on("data", (chunk) => {
    const st = window.__jarvisStreamState;
    if (st?._onStderr) st._onStderr(chunk.toString("utf8"));
  });

  proc.on("close", (code) => {
    const st = window.__jarvisStreamState;
    if (st) {
      // If a new process was already spawned (retry), ignore this close from the old one
      if (st.process && st.process !== proc) {
        console.log("[JARVIS] Ignoring close event from superseded process");
        return;
      }
      st.process = null;

      // Permission retry pending — respawn with --resume (reads updated settings.local.json)
      if (st._retryPending) {
        st._retryPending = false;
        spawnRetryProcess();
        return;
      }

      // Waiting for user permission decision — keep streamState alive, don't cleanup UI
      if (st.uiState === "waiting_permission") {
        console.log("[JARVIS] Process exited while waiting for permission decision");
        return;
      }

      // Waiting for AskUserQuestion input — keep streamState alive
      if (st.uiState === "waiting_askuser") {
        console.log("[JARVIS] Process exited while waiting for AskUserQuestion input");
        return;
      }

      st.exitCode = code;
      st.uiState = "done";
      // Mark pending askuser interactions as expired (process can no longer receive answers)
      st.pendingInteractions.forEach(i => {
        if (i.type === "askuser" && i.status === "pending") {
          i.status = "expired";
        }
      });
      // Remove temporary permissions added during this session
      if (st.tempPermissions?.length > 0) {
        st.tempPermissions.forEach(entry => removeSettingsPermission(entry));
        st.tempPermissions = [];
      }
    }
    if (st?._onClose) {
      st._onClose(code);
    } else if (st) {
      // Delegates not attached (widget between re-renders) — persist state for next reconnect
      if (code === 0 && st.buffer) {
        st.conversationHistory.push({ role: "assistant", text: st.buffer, timestamp: Date.now() });
      }
    }
  });

  proc.on("error", (err) => {
    const st = window.__jarvisStreamState;
    if (st) {
      // Ignore errors from superseded processes
      if (st.process && st.process !== proc) {
        console.log("[JARVIS] Ignoring error from superseded process");
        return;
      }
      st.uiState = "error";
      st.process = null;
      // Clean up temp permissions on error
      if (st.tempPermissions?.length > 0) {
        st.tempPermissions.forEach(entry => removeSettingsPermission(entry));
        st.tempPermissions = [];
      }
    }
    if (st?._onClose) {
      st._onClose(-1);
    } else {
      window.__jarvisStreamState = null;
    }
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
  if (ttsService) ttsService.stop();

  const isResume = !!currentSessionId;
  const cwd = expandPath(getActiveProjectPath()) || app.vault.adapter.basePath;

  if (!isResume) {
    fullBuffer = "";
    terminalOutput.innerHTML = "";
    preSpawnJsonlSet = snapshotJsonlFiles();
  } else {
    appendTurnSeparator();
    fullBuffer += "\n\n---\n\n";
  }

  // Echo line (always visible — $ + user prompt, optionally with CLI command)
  const echoLine = el("div", { marginBottom: "4px", wordBreak: "break-word", whiteSpace: "pre-wrap" });
  echoLine.appendChild(el("span", { color: T.green }, "$ "));
  if (showCommand) {
    const cmdText = isResume
      ? `claude --resume ${currentSessionId.slice(0, 7)}\u2026 ${text}`
      : `claude --print ${text}`;
    echoLine.appendChild(el("span", { color: T.textMuted }, cmdText));
  } else {
    echoLine.appendChild(el("span", { color: T.textMuted }, text));
  }
  addMessageCopyIcon(echoLine, () => text);
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

  claudeProcess = spawn(claudePath, buildClaudeArgs(), {
    cwd: cwd,
    env: childEnv,
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Prepend language tag for Claude when detected language is in supported list
  let messageText = text;
  const supported = (config.language?.supported) || {};
  if (currentDetectedLang && Object.keys(supported).length > 0 && supported[currentDetectedLang]) {
    const langLabel = supported[currentDetectedLang].label || currentDetectedLang;
    messageText = `[Language: ${langLabel}]\n${text}`;
  }

  // Send user message via stream-json stdin (do NOT close stdin — needed for control_response)
  claudeProcess.stdin.write(JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "text", text: messageText }] },
  }) + "\n");

  setUIState("streaming");

  // ── Global stream state for re-render resilience ──
  // Parsing and buffer accumulation happen in global listeners (survive re-renders).
  // DOM updates happen via delegates that point to the current widget instance.
  let currentTurnBuffer = "";
  let speakBuffer = "";
  let speakFlushTimer = null;

  const streamState = {
    process: claudeProcess,
    sessionId: currentSessionId,
    jarvisSessionId: activeJarvisSessionId,  // Track which Jarvis session owns this stream
    projectIndex: getActiveProjectIndex(),
    detectedLang: currentDetectedLang,
    buffer: "",              // accumulated text output
    lineBuf: "",             // NDJSON line buffer
    toolEvents: [],          // tool names used during this turn (for history replay)
    conversationHistory: [...conversationHistory],
    preSpawnJsonlSet: preSpawnJsonlSet,
    uiState: "streaming",
    exitCode: null,
    // Delegates — point to current widget's DOM handlers (nulled on cleanup, reattached on reconnect)
    _onTextDelta: null,
    _onToolUse: null,
    _onStderr: null,
    _onClose: null,
    _onPermissionRequest: null,
    _onQuestionRequest: null,
    _onDisplayCard: null,
    pendingInteractions: [],      // tracks permission/question state for reconnect & persistence
    activeToolBlock: null,        // tracks current tool input for input_json_delta parsing
    _activeSection: null,         // reference to the widget's section element that owns delegates
    pendingPermissions: [],       // settings.local.json permission gate: [{toolName, input, specificEntry, dirEntry, status, id}]
    retryAllowedTools: null,      // Set of tool names approved by ALLOW — merged into --allowedTools for retry
    tempPermissions: [],          // entries added by ALWAYS ALLOW (kept for backward compat)
    resultReceived: false,        // true when result event arrives (for deferred stdin close)
    _retryPending: false,         // true when permission retry needs process restart
    _lastStatusLabel: null,       // dedup key for consecutive status labels (e.g., "thinking:")
    _thinkingShown: false,        // true after first THINKING label rendered (show only once per turn)
  };
  window.__jarvisStreamState = streamState;

  // Update session status
  const _ownerSession = sessionManager.getSession(activeJarvisSessionId);
  if (_ownerSession) _ownerSession.status = "streaming";

  // ── Set DOM delegates for current widget instance ──
  function attachDelegates(st, oc, to, ce) {
    st._turnTextNodes = [];
    const streamRenderer = markdownRenderer.createStreamRenderer(oc);
    st._streamRenderer = streamRenderer;
    st._onTextDelta = (txt) => {
      currentTurnBuffer += txt;
      fullBuffer += txt;
      // Reset label dedup so next label after text creates a fresh badge
      st._lastStatusLabel = null;
      streamRenderer.append(txt);
      st._turnTextNodes = streamRenderer.getTextNodes();
      to.scrollTop = to.scrollHeight;
      // TTS: extract complete sentences and enqueue
      if (ttsService && ttsService.isEnabled && !ttsService.isMuted) {
        speakBuffer += txt;
        const sentenceEnd = /^([\s\S]*?[.!?])(\s+|\n\n)/;
        let match;
        while ((match = sentenceEnd.exec(speakBuffer)) !== null) {
          const sentence = match[1].trim();
          if (sentence) {
            console.log(`[VoiceCmd] TTS sentence: currentDetectedLang=${currentDetectedLang}, text="${sentence.slice(0, 40)}…"`);
            ttsService.speak(stripMarkdown(sentence), currentDetectedLang);
          }
          speakBuffer = speakBuffer.slice(match[0].length);
        }
        if (speakFlushTimer) clearTimeout(speakFlushTimer);
        if (speakBuffer.trim()) {
          speakFlushTimer = setTimeout(() => {
            if (speakBuffer.trim()) {
              console.log(`[VoiceCmd] TTS flush: currentDetectedLang=${currentDetectedLang}, text="${speakBuffer.trim().slice(0, 40)}…"`);
              ttsService.speak(stripMarkdown(speakBuffer.trim()), currentDetectedLang);
              speakBuffer = "";
            }
          }, 500);
        }
      }
    };
    st._onToolUse = (toolName) => {
      // Skip recording for tools that get styled status labels (avoids [skill] + [skill: name] duplication)
      const hasStatusLabel = { Skill: 1, Agent: 1, WebSearch: 1, WebFetch: 1 };
      if (!hasStatusLabel[toolName]) {
        conversationHistory.push({ role: "tool", text: toolName, timestamp: Date.now() });
      }
      if (!showToolUseLabels) return;
      const alwaysAsk = interactiveCfg.alwaysAskTools || [];
      if (alwaysAsk.includes(toolName) && !hasStatusLabel[toolName]) {
        const infoLine = el("div", {
          color: T.gold, fontSize: "10px", opacity: "0.7",
          marginTop: "4px", letterSpacing: "0.5px",
        }, `\u26A1 ${toolName}`);
        oc.appendChild(infoLine);
        to.scrollTop = to.scrollHeight;
      }
    };
    st._onStderr = (text) => {
      const cleaned = stripAnsi(text);
      fullBuffer += cleaned;
      oc.appendChild(el("span", { color: T.red }, cleaned));
      to.scrollTop = to.scrollHeight;
    };
    st._onClose = (code) => {
      claudeProcess = null;
      // Finalize markdown stream renderer (highlight any pending code blocks)
      if (st._streamRenderer) st._streamRenderer.finalize();
      // Remove blinking cursor
      if (ce.parentNode) ce.parentNode.removeChild(ce);
      // Add per-message copy icon to assistant response
      if (currentTurnBuffer) {
        addMessageCopyIcon(oc, () => currentTurnBuffer);
      }
      // Add completion line
      if (showCompletionLabel || code !== 0) {
        const completeLine = el("div", {
          color: code === 0 ? T.accent : T.red,
          opacity: code === 0 ? "0.6" : "1",
          marginTop: "8px",
          fontSize: isNarrow ? "10px" : "11px",
          letterSpacing: "1px",
        }, code === 0 ? `[${completionLabel}]` : `[Process exited with code ${code}]`);
        to.appendChild(completeLine);
      }
      to.scrollTop = to.scrollHeight;
      // TTS: clear flush timer and speak remaining
      if (speakFlushTimer) clearTimeout(speakFlushTimer);
      if (ttsService && ttsService.isEnabled && !ttsService.isMuted && speakBuffer.trim()) {
        ttsService.speak(stripMarkdown(speakBuffer.trim()), currentDetectedLang);
      }
      speakBuffer = "";
      // Session detection
      if (code === 0 && preSpawnJsonlSet && !currentSessionId) {
        const detectedId = detectNewSession(preSpawnJsonlSet);
        if (detectedId) currentSessionId = detectedId;
        preSpawnJsonlSet = null;
      }
      if (st.sessionId && !currentSessionId) currentSessionId = st.sessionId;
      // Track conversation history
      if (code === 0 && currentTurnBuffer) {
        conversationHistory.push({ role: "assistant", text: currentTurnBuffer, timestamp: Date.now() });
      }
      // Handle background stream completion (user switched tabs while this was streaming)
      const ownerSession = st.jarvisSessionId ? sessionManager.getSession(st.jarvisSessionId) : null;
      if (ownerSession) {
        ownerSession.sessionId = currentSessionId;
        ownerSession.conversationHistory = conversationHistory;
        ownerSession.fullBuffer = fullBuffer;
        ownerSession.status = code === 0 ? "done" : "error";
        ownerSession.lastActiveAt = Date.now();
        // If stream completed in background (different active session), set notification badge
        if (st.jarvisSessionId !== sessionManager.getActiveSessionId()) {
          ownerSession._notifyBadge = true;
          sessionManager.saveImmediate();
          renderTabBar(); // Update tab to show badge
          window.__jarvisStreamState = null;
          return; // Don't change UI state — user is viewing another session
        }
      }
      syncToManager();
      window.__jarvisStreamState = null;
      setUIState(code === 0 ? "done" : "error");
    };
    st._onPermissionRequest = (requestId, request) => {
      st.pendingInteractions.push({
        type: "permission", requestId, data: request,
        status: "pending", answer: null, timestamp: Date.now(),
      });
      renderPermissionCard(requestId, request, oc, to);
    };
    st._onQuestionRequest = (requestId, request) => {
      st.pendingInteractions.push({
        type: "question", requestId, data: request,
        status: "pending", answer: null, timestamp: Date.now(),
      });
      renderQuestionCard(requestId, request, oc, to);
    };
    st._onDisplayCard = () => ({ container: oc, scrollParent: to });
  }
  attachDelegates(streamState, outputContent, terminalOutput, cursorEl);
  streamState._activeSection = section;

  // ── Global process listeners (survive re-renders, delegate to current widget) ──
  attachProcessHandlers(claudeProcess);
}

// ═══════════════════════════════════════════
// ── Pointer events (tap + long-press) ──
// ═══════════════════════════════════════════

if (isRemoteMode) {
  // Remote mode: simple click-based interaction (like mobile)
  btnContainer.addEventListener("click", async () => {
    if (!networkClient?.isConnected) {
      networkClient?.connect();
      return;
    }

    if (uiState === "idle" || uiState === "done" || uiState === "error") {
      try {
        await remoteRecorder.start();
        if (terminalOutput.textContent.trim()) openTerminalPanel();
        setUIState("recording");
        startRecordTimer();
      } catch (err) {
        new Notice("Microphone error: " + err.message, 5000);
        setUIState("error");
      }
    } else if (uiState === "recording") {
      remoteRecorder.stop();
      stopRecordTimer();
      if (conversationHistory.length > 0) appendTurnSeparator();
      setUIState("transcribing");
    } else if (uiState === "streaming" || uiState === "transcribing") {
      remoteRecorder.cancel();
      if (remoteTtsMode === "local" && ttsService) ttsService.stop();
      if (audioPlayer) audioPlayer.stop();
      networkClient.sendCancel();
      const cancelLine = el("div", {
        color: T.accent, opacity: "0.6", marginTop: "8px",
        fontSize: isNarrow ? "10px" : "11px", letterSpacing: "1px",
      }, "[Cancelled]");
      terminalOutput.appendChild(cancelLine);
      setUIState("done");
    }

    // Resume AudioContext on user gesture
    if (audioPlayer?._ctx?.state === "suspended") {
      audioPlayer._ctx.resume().catch(() => {});
    }
  });
} else {
  // Local mode: pointer-based (existing behavior)
  let isLongPress = false;
  let longPressTimer = null;

  btnContainer.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (uiState === "transcribing" || uiState === "launching") return;
    if (uiState === "streaming") {
      if (isRemoteMode) {
        networkClient?.sendCancel();
        if (audioPlayer) audioPlayer.stop();
        if (remoteTtsMode === "local" && ttsService) ttsService.stop();
      } else {
        if (ttsService) ttsService.stop();
        killClaudeProcess();
      }
      const cancelLine = el("div", { color: T.accent, opacity: "0.6", marginTop: "8px", fontSize: isNarrow ? "10px" : "11px", letterSpacing: "1px" }, "[Cancelled]");
      terminalOutput.appendChild(cancelLine);
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

  btnContainer.addEventListener("pointerup", (e) => {
    e.preventDefault();
    if (uiState === "transcribing" || uiState === "launching") return;
    if (uiState === "streaming") return; // Already handled in pointerdown

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
}

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

// ═══════════════════════════════════════════
// ── Server message handlers (remote mode) ──
// ═══════════════════════════════════════════

if (isRemoteMode && networkClient) {
  let remoteFullBuffer = "";
  let remoteSpeakBuffer = "";
  let pendingUserInput = "";
  let activeOutputContent = null;
  let activeCursorEl = null;
  let activeStreamRenderer = null;

  networkClient.on("transcription", (msg) => {
    pendingUserInput = msg.text;
    currentDetectedLang = msg.detectedLang || null;
    openTerminalPanel();
    const echoLine = el("div", { marginBottom: "4px", wordBreak: "break-word", whiteSpace: "pre-wrap" });
    echoLine.appendChild(el("span", { color: T.green }, "$ "));
    echoLine.appendChild(el("span", { color: T.textMuted }, msg.text));
    addMessageCopyIcon(echoLine, () => msg.text);
    terminalOutput.appendChild(echoLine);
    terminalOutput.appendChild(el("div", { height: "1px", background: `${T.accent}33`, margin: "8px 0" }));

    activeOutputContent = el("div", { color: T.text });
    terminalOutput.appendChild(activeOutputContent);
    activeStreamRenderer = markdownRenderer.createStreamRenderer(activeOutputContent);

    activeCursorEl = el("span", {
      display: "inline-block", width: "8px", height: isNarrow ? "14px" : "16px",
      background: T.accent, animation: "jarvisCursorBlink 0.8s step-end infinite",
      verticalAlign: "middle", marginLeft: "2px",
    });
    terminalOutput.appendChild(activeCursorEl);

    conversationHistory.push({ role: "user", text: msg.text, timestamp: Date.now() });
    setUIState("streaming");
    updateBadgeState("running");
    remoteFullBuffer = "";
  });

  networkClient.on("stream_delta", (msg) => {
    remoteFullBuffer += msg.text;
    fullBuffer += msg.text;

    // If no output container yet (text_command path — no transcription event)
    if (!activeOutputContent) {
      openTerminalPanel();
      activeOutputContent = el("div", { color: T.text });
      terminalOutput.appendChild(activeOutputContent);
      activeStreamRenderer = markdownRenderer.createStreamRenderer(activeOutputContent);
      activeCursorEl = el("span", {
        display: "inline-block", width: "8px", height: isNarrow ? "14px" : "16px",
        background: T.accent, animation: "jarvisCursorBlink 0.8s step-end infinite",
        verticalAlign: "middle", marginLeft: "2px",
      });
      terminalOutput.appendChild(activeCursorEl);
      updateBadgeState("running");
    }

    activeStreamRenderer.append(msg.text);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;

    // TTS: extract sentences (local TTS mode)
    if (remoteTtsMode === "local" && ttsService && ttsService.isEnabled && !ttsService.isMuted) {
      remoteSpeakBuffer += msg.text;
      const sentenceEnd = /^([\s\S]*?[.!?])(\s+|\n\n)/;
      let match;
      while ((match = sentenceEnd.exec(remoteSpeakBuffer)) !== null) {
        const sentence = match[1].trim();
        if (sentence) ttsService.speak(stripMarkdown(sentence), currentDetectedLang);
        remoteSpeakBuffer = remoteSpeakBuffer.slice(match[0].length);
      }
    }
  });

  networkClient.on("stream_end", (msg) => {
    if (activeCursorEl?.parentNode) activeCursorEl.parentNode.removeChild(activeCursorEl);
    activeCursorEl = null;

    if (msg.sessionId) {
      currentSessionId = msg.sessionId;
      updateSessionIndicator();
    }

    // Finalize markdown stream renderer
    if (activeStreamRenderer) activeStreamRenderer.finalize();

    // Add per-message copy icon to assistant response
    if (activeOutputContent && remoteFullBuffer) {
      const bufCopy = remoteFullBuffer;
      addMessageCopyIcon(activeOutputContent, () => bufCopy);
    }

    if (remoteFullBuffer) {
      conversationHistory.push({ role: "assistant", text: remoteFullBuffer, timestamp: Date.now() });
    }
    syncToManager();

    // Speak remaining buffer (local TTS)
    if (remoteTtsMode === "local" && ttsService && ttsService.isEnabled && !ttsService.isMuted && remoteSpeakBuffer.trim()) {
      ttsService.speak(stripMarkdown(remoteSpeakBuffer.trim()), currentDetectedLang);
    }
    remoteSpeakBuffer = "";
    pendingUserInput = "";

    if (showCompletionLabel) {
      terminalOutput.appendChild(el("div", {
        color: T.accent, opacity: "0.6", marginTop: "8px",
        fontSize: isNarrow ? "10px" : "11px", letterSpacing: "1px",
      }, `[${completionLabel}]`));
    }
    terminalOutput.scrollTop = terminalOutput.scrollHeight;

    remoteFullBuffer = "";
    activeOutputContent = null;
    activeStreamRenderer = null;
    setUIState("done");
    updateBadgeState("success");
  });

  networkClient.on("tts_audio", (msg) => {
    if (audioPlayer) audioPlayer.enqueueChunk(msg.data, msg.sampleRate);
  });

  networkClient.on("tts_end", () => {});

  networkClient.on("permission_request", (msg) => {
    // Ensure terminal is open and has an output area
    if (!activeOutputContent) {
      openTerminalPanel();
      activeOutputContent = el("div", { color: T.text });
      terminalOutput.appendChild(activeOutputContent);
    }
    renderPermissionCard(msg.requestId, msg.request, terminalOutput, terminalOutput);
  });

  networkClient.on("question_request", (msg) => {
    if (!activeOutputContent) {
      openTerminalPanel();
      activeOutputContent = el("div", { color: T.text });
      terminalOutput.appendChild(activeOutputContent);
    }
    renderQuestionCard(msg.requestId, msg.request, terminalOutput, terminalOutput);
  });

  networkClient.on("error", (msg) => {
    if (activeCursorEl?.parentNode) activeCursorEl.parentNode.removeChild(activeCursorEl);
    activeCursorEl = null;
    activeOutputContent = null;

    const errLine = el("div", { color: T.red, marginTop: "8px" },
      `[Error: ${msg.stage || "unknown"} \u2014 ${msg.message || "Unknown error"}]`);
    terminalOutput.appendChild(errLine);
    setUIState("error");
    remoteSpeakBuffer = "";
    remoteFullBuffer = "";
    updateBadgeState("error");
  });
}

// ── Safety-net cleanup (configurable interval) ──
const cleanupMs = perf?.cleanupIntervalMs || 5000;
let cleanupId = setInterval(() => {
  if (!document.contains(section)) {
    stopRecordTimer();
    if (isRemoteMode) {
      if (remoteRecorder?.isRecording) remoteRecorder.cancel();
      if (audioPlayer) audioPlayer.stop();
    } else {
      // During active streaming/closing: don't kill the process — a re-rendered widget will reconnect.
      // Only null delegates if this widget still owns them (prevents race with reconnect).
      const st = window.__jarvisStreamState;
      if (st && (st.uiState === "streaming" || st.uiState === "closing")) {
        if (st._activeSection === section) {
          st._onTextDelta = null;
          st._onToolUse = null;
          st._onStderr = null;
          st._onClose = null;
          st._onPermissionRequest = null;
          st._onQuestionRequest = null;
          st._onDisplayCard = null;
        }
      } else {
        killClaudeProcess();
      }
      if (voiceService.getState() === "recording") voiceService.cancelRecording();
    }
    document.removeEventListener("keydown", handleKeyDown);
    clearInterval(cleanupId);
  }
}, cleanupMs);
ctx.intervals.push(cleanupId);

// Register cleanup interval with pausable system
ctx.registerPausable(
  () => {
    cleanupId = setInterval(() => {
      if (!document.contains(section)) {
        clearInterval(cleanupId);
      }
    }, cleanupMs);
    ctx.intervals.push(cleanupId);
  },
  () => { clearInterval(cleanupId); }
);

// ── Reconnect to active streaming if re-rendered ──
(function reconnectIfStreaming() {
  const st = window.__jarvisStreamState;
  if (!st || isRemoteMode) return; // only reconnect in local mode

  st._activeSection = section; // Claim ownership — prevents old widget cleanup from nulling our delegates

  if (st.uiState !== "streaming" && st.uiState !== "closing" && st.uiState !== "waiting_permission" && st.uiState !== "waiting_askuser") {
    // Process finished during re-render — show final state and clean up
    if (st.uiState === "done" || st.uiState === "error") {
      currentSessionId = st.sessionId || currentSessionId;
      if (st.buffer) {
        openTerminalPanel();
        const recoverContent = el("div", { color: T.text });
        recoverContent.appendChild(markdownRenderer.renderMarkdown(st.buffer));
        terminalOutput.appendChild(recoverContent);
        if (showCompletionLabel || st.exitCode !== 0) {
          const completeLine = el("div", {
            color: st.exitCode === 0 ? T.accent : T.red,
            opacity: st.exitCode === 0 ? "0.6" : "1",
            marginTop: "8px",
            fontSize: isNarrow ? "10px" : "11px",
            letterSpacing: "1px",
          }, st.exitCode === 0 ? `[${completionLabel}]` : `[Process exited with code ${st.exitCode}]`);
          terminalOutput.appendChild(completeLine);
        }
        addMessageCopyIcon(recoverContent, () => st.buffer);
      }
      conversationHistory = st.conversationHistory || conversationHistory;
      window.__jarvisStreamState = null;
      syncToManager();
      setUIState(st.exitCode === 0 ? "done" : "error");
    }
    return;
  }

  // Active streaming — reconnect
  currentSessionId = st.sessionId || currentSessionId;
  conversationHistory = st.conversationHistory || conversationHistory;
  currentDetectedLang = st.detectedLang || null;
  claudeProcess = st.process;
  if (st.jarvisSessionId) {
    activeJarvisSessionId = st.jarvisSessionId;
    sessionManager.setActiveSession(st.jarvisSessionId);
  }

  // Show terminal with accumulated buffer
  openTerminalPanel();
  terminalOutput.innerHTML = "";
  const echoLine = el("div", { marginBottom: "4px" });
  echoLine.appendChild(el("span", { color: T.green }, "$ "));
  echoLine.appendChild(el("span", { color: T.textMuted, opacity: "0.6", fontSize: "10px" }, "[reconnected]"));
  terminalOutput.appendChild(echoLine);
  terminalOutput.appendChild(el("div", { height: "1px", background: `${T.accent}33`, margin: "8px 0" }));

  const recOutputContent = el("div", { color: T.text });
  if (st.buffer) {
    recOutputContent.appendChild(markdownRenderer.renderMarkdown(st.buffer));
  }
  terminalOutput.appendChild(recOutputContent);

  const recCursorEl = el("span", {
    display: "inline-block", width: "8px",
    height: isNarrow ? "14px" : "16px",
    background: T.accent,
    animation: "jarvisCursorBlink 0.8s step-end infinite",
    verticalAlign: "middle", marginLeft: "2px",
  });
  terminalOutput.appendChild(recCursorEl);

  // Reattach delegates to new DOM refs
  let currentTurnBuffer = st.buffer;
  let speakBuffer = "";
  let speakFlushTimer = null;
  const recStreamRenderer = markdownRenderer.createStreamRenderer(recOutputContent);

  st._turnTextNodes = [];
  st._streamRenderer = recStreamRenderer;
  st._onTextDelta = (txt) => {
    currentTurnBuffer += txt;
    fullBuffer += txt;
    // Reset label dedup so next label after text creates a fresh badge
    st._lastStatusLabel = null;
    recStreamRenderer.append(txt);
    st._turnTextNodes = recStreamRenderer.getTextNodes();
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
    if (ttsService && ttsService.isEnabled && !ttsService.isMuted) {
      speakBuffer += txt;
      const sentenceEnd = /^([\s\S]*?[.!?])(\s+|\n\n)/;
      let match;
      while ((match = sentenceEnd.exec(speakBuffer)) !== null) {
        const sentence = match[1].trim();
        if (sentence) ttsService.speak(stripMarkdown(sentence), currentDetectedLang);
        speakBuffer = speakBuffer.slice(match[0].length);
      }
      if (speakFlushTimer) clearTimeout(speakFlushTimer);
      if (speakBuffer.trim()) {
        speakFlushTimer = setTimeout(() => {
          if (speakBuffer.trim()) {
            ttsService.speak(stripMarkdown(speakBuffer.trim()), currentDetectedLang);
            speakBuffer = "";
          }
        }, 500);
      }
    }
  };
  st._onToolUse = (toolName) => {
    // Skip recording for tools that get styled status labels (avoids [skill] + [skill: name] duplication)
    const hasStatusLabel = { Skill: 1, Agent: 1, WebSearch: 1, WebFetch: 1 };
    if (!hasStatusLabel[toolName]) {
      conversationHistory.push({ role: "tool", text: toolName, timestamp: Date.now() });
    }
    if (!showToolUseLabels) return;
    const alwaysAsk = interactiveCfg.alwaysAskTools || [];
    if (alwaysAsk.includes(toolName) && !hasStatusLabel[toolName]) {
      const infoLine = el("div", {
        color: T.gold, fontSize: "10px", opacity: "0.7",
        marginTop: "4px", letterSpacing: "0.5px",
      }, `\u26A1 ${toolName}`);
      recOutputContent.appendChild(infoLine);
      terminalOutput.scrollTop = terminalOutput.scrollHeight;
    }
  };
  st._onStderr = (text) => {
    const cleaned = stripAnsi(text);
    fullBuffer += cleaned;
    recOutputContent.appendChild(el("span", { color: T.red }, cleaned));
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
  };
  st._onClose = (code) => {
    claudeProcess = null;
    // Finalize markdown stream renderer
    if (recStreamRenderer) recStreamRenderer.finalize();
    if (recCursorEl.parentNode) recCursorEl.parentNode.removeChild(recCursorEl);
    if (currentTurnBuffer) {
      addMessageCopyIcon(recOutputContent, () => currentTurnBuffer);
    }
    if (showCompletionLabel || code !== 0) {
      const completeLine = el("div", {
        color: code === 0 ? T.accent : T.red,
        opacity: code === 0 ? "0.6" : "1",
        marginTop: "8px",
        fontSize: isNarrow ? "10px" : "11px",
        letterSpacing: "1px",
      }, code === 0 ? `[${completionLabel}]` : `[Process exited with code ${code}]`);
      terminalOutput.appendChild(completeLine);
    }
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
    if (speakFlushTimer) clearTimeout(speakFlushTimer);
    if (ttsService && ttsService.isEnabled && !ttsService.isMuted && speakBuffer.trim()) {
      ttsService.speak(stripMarkdown(speakBuffer.trim()), currentDetectedLang);
    }
    if (code === 0 && preSpawnJsonlSet && !currentSessionId) {
      const detectedId = detectNewSession(preSpawnJsonlSet);
      if (detectedId) currentSessionId = detectedId;
    }
    if (st.sessionId && !currentSessionId) currentSessionId = st.sessionId;
    if (code === 0 && currentTurnBuffer) {
      conversationHistory.push({ role: "assistant", text: currentTurnBuffer, timestamp: Date.now() });
    }
    // Handle background stream completion
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
        renderTabBar();
        window.__jarvisStreamState = null;
        return;
      }
    }
    syncToManager();
    window.__jarvisStreamState = null;
    setUIState(code === 0 ? "done" : "error");
  };
  st._onPermissionRequest = (requestId, request) => {
    st.pendingInteractions.push({
      type: "permission", requestId, data: request,
      status: "pending", answer: null, timestamp: Date.now(),
    });
    renderPermissionCard(requestId, request, recOutputContent, terminalOutput);
  };
  st._onQuestionRequest = (requestId, request) => {
    st.pendingInteractions.push({
      type: "question", requestId, data: request,
      status: "pending", answer: null, timestamp: Date.now(),
    });
    renderQuestionCard(requestId, request, recOutputContent, terminalOutput);
  };
  st._onDisplayCard = () => ({ container: recOutputContent, scrollParent: terminalOutput });

  // Re-render pending interactions that were in-flight during re-render
  for (const interaction of st.pendingInteractions) {
    if (interaction.status === "pending") {
      if (interaction.type === "permission") {
        renderPermissionCard(interaction.requestId, interaction.data, recOutputContent, terminalOutput);
      } else if (interaction.type === "question") {
        renderQuestionCard(interaction.requestId, interaction.data, recOutputContent, terminalOutput);
      } else if (interaction.type === "askuser") {
        renderAskUserQuestionForm(interaction.toolUseId, interaction.data, recOutputContent, terminalOutput);
      }
    } else {
      renderCompletedInteractionCard(interaction, recOutputContent, terminalOutput);
    }
  }

  // Re-render pending settings.local.json permission cards
  for (const permItem of st.pendingPermissions) {
    if (permItem.status === "pending") {
      renderSettingsPermissionCard(permItem, recOutputContent, terminalOutput);
    }
  }

  setUIState(st.uiState === "waiting_permission" ? "streaming" : "streaming");
  updateBadgeState("streaming");
  updateSessionIndicator();
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
})();

return section;
