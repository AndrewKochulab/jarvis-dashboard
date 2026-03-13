// Voice Command — Desktop process manager
// Claude CLI process lifecycle: resolve path, spawn, retry, stdin, handlers.

const { nodeFs, nodePath, config } = ctx;
const cmdCfg = config.widgets?.voiceCommand || {};
const interactiveCfg = cmdCfg.interactive || {};
const personalityCfg = cmdCfg.personality || {};

function createProcessManager(options) {
  const { storageAdapter, stripAnsi } = options;

  // ── Resolve claude binary path ──
  const claudeSearchPaths = [
    nodePath.join(require("os").homedir(), ".local", "bin", "claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
  ];
  let claudePath = cmdCfg.terminal?.claudePath || null;
  if (!claudePath) {
    for (const p of claudeSearchPaths) {
      if (nodeFs.existsSync(p)) { claudePath = p; break; }
    }
  }

  let claudeProcess = null;

  function buildPersonalityPrompt() {
    const template = personalityCfg.prompt;
    if (!template) return null;
    const name = personalityCfg.userName || "sir";
    const assistant = personalityCfg.assistantName || "JARVIS";
    let prompt = template.replace(/\{userName\}/g, name).replace(/\{assistantName\}/g, assistant);
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

  function buildClaudeArgs(currentSessionId) {
    const args = [];
    if (currentSessionId) args.push("--resume", currentSessionId);
    args.push("-p", "--input-format", "stream-json", "--output-format", "stream-json",
      "--replay-user-messages", "--include-partial-messages");
    const autoApprove = interactiveCfg.autoApproveTools || [];
    const alwaysAsk = interactiveCfg.alwaysAskTools || [];
    if (interactiveCfg.interactivePermissions) {
      if (autoApprove.length > 0) args.push("--allowedTools", autoApprove.join(","));
    } else {
      const allAllowed = [...new Set([...autoApprove, ...alwaysAsk])];
      if (allAllowed.length > 0) args.push("--allowedTools", allAllowed.join(","));
    }
    const model = cmdCfg.model || null;
    if (model) args.push("--model", model);
    const personality = buildPersonalityPrompt();
    if (personality) args.push("--append-system-prompt", personality);
    return args;
  }

  function spawnProcess(currentSessionId, cwd) {
    if (!claudePath) return null;
    const { spawn } = require("child_process");
    const childEnv = Object.assign({}, process.env, { FORCE_COLOR: "0" });
    delete childEnv.CLAUDECODE;
    delete childEnv.CLAUDE_CODE_ENTRYPOINT;
    delete childEnv.CLAUDE_CODE_MAX_OUTPUT_TOKENS;
    const args = buildClaudeArgs(currentSessionId);
    claudeProcess = spawn(claudePath, args, {
      cwd, env: childEnv, stdio: ["pipe", "pipe", "pipe"],
    });
    return claudeProcess;
  }

  function spawnRetryProcess(st, cwd) {
    if (!st || !st.sessionId) {
      console.error("[JARVIS] Cannot retry — no streamState or sessionId");
      return null;
    }
    const approvedTools = [...(st.retryAllowedTools || [])];
    console.log("[JARVIS] Starting retry. sessionId:", st.sessionId,
      "approved tools for --allowedTools:", approvedTools);

    st.pendingPermissions.forEach(p => { if (p.status === "approved") p.status = "retrying"; });
    st.resultReceived = false;
    st.lineBuf = "";

    const { spawn } = require("child_process");
    const childEnv = Object.assign({}, process.env, { FORCE_COLOR: "0" });
    delete childEnv.CLAUDECODE;
    delete childEnv.CLAUDE_CODE_ENTRYPOINT;
    delete childEnv.CLAUDE_CODE_MAX_OUTPUT_TOKENS;

    const args = buildClaudeArgs(st.sessionId);
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

    return newProc;
  }

  function spawnResumeProcess(st, cwd, answerText) {
    if (!st || !st.sessionId) {
      console.error("[JARVIS] Cannot resume for AskUserQuestion — no streamState or sessionId");
      return null;
    }
    st.resultReceived = false;
    st.lineBuf = "";
    st.uiState = "streaming";

    const { spawn } = require("child_process");
    const childEnv = Object.assign({}, process.env, { FORCE_COLOR: "0" });
    delete childEnv.CLAUDECODE;
    delete childEnv.CLAUDE_CODE_ENTRYPOINT;
    delete childEnv.CLAUDE_CODE_MAX_OUTPUT_TOKENS;

    const args = buildClaudeArgs(st.sessionId);
    const newProc = spawn(claudePath, args, {
      cwd, env: childEnv, stdio: ["pipe", "pipe", "pipe"],
    });
    claudeProcess = newProc;
    st.process = newProc;

    newProc.stdin.write(JSON.stringify({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: answerText }] },
    }) + "\n");

    return newProc;
  }

  function kill() {
    const st = typeof window !== "undefined" ? window.__jarvisStreamState : null;
    if (st?.tempPermissions?.length > 0) {
      st.tempPermissions.forEach(entry => storageAdapter.removeSettingsPermission(entry));
      st.tempPermissions = [];
    }
    if (claudeProcess) {
      try { claudeProcess.kill("SIGTERM"); } catch (e) {}
      claudeProcess = null;
    }
    if (typeof window !== "undefined") window.__jarvisStreamState = null;
  }

  function sendStdinMessage(msg) {
    if (!claudeProcess || !claudeProcess.stdin?.writable) return false;
    try {
      claudeProcess.stdin.write(JSON.stringify(msg) + "\n");
      return true;
    } catch { return false; }
  }

  function closeStdin() {
    if (claudeProcess?.stdin?.writable) claudeProcess.stdin.end();
  }

  function attachHandlers(proc, callbacks) {
    proc.stdout.on("data", (chunk) => {
      if (callbacks.onStdout) callbacks.onStdout(stripAnsi(chunk.toString("utf8")));
    });
    proc.stderr.on("data", (chunk) => {
      if (callbacks.onStderr) callbacks.onStderr(chunk.toString("utf8"));
    });
    proc.on("close", (code) => {
      if (callbacks.onClose) callbacks.onClose(code, proc);
    });
    proc.on("error", (err) => {
      if (callbacks.onError) callbacks.onError(err, proc);
    });
  }

  return {
    get isAvailable() { return !!claudePath; },
    get process() { return claudeProcess; },
    set process(p) { claudeProcess = p; },
    spawnProcess,
    spawnRetryProcess,
    spawnResumeProcess,
    kill,
    sendStdinMessage,
    closeStdin,
    attachHandlers,
    buildClaudeArgs,
    buildPersonalityPrompt,
    interactiveCfg,
    personalityCfg,
  };
}

return { createProcessManager };
