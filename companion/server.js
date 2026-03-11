// JARVIS Companion Server
// Secure WSS server that handles voice processing for Obsidian mobile.
// Pipeline: audio → ffmpeg → whisper-cpp → claude CLI → TTS → mobile

const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const WebSocket = require("ws");

const protocol = require("./modules/protocol");
const Auth = require("./modules/auth");
const { AudioSession } = require("./modules/audio");
const Transcriber = require("./modules/transcriber");
const ClaudeRunner = require("./modules/claude-runner");
const { TTS, extractSentences } = require("./modules/tts");

// ── Load config ────────────────────────────────────────────────────────────────
const configPath = path.resolve(__dirname, "../src/config/config.json");
const localConfigPath = path.resolve(__dirname, "../src/config/config.local.json");

let config = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch (e) {
  console.warn("[JARVIS] Could not read config.json:", e.message);
}

// Merge local config (contains token and other overrides)
try {
  const localConfig = JSON.parse(fs.readFileSync(localConfigPath, "utf8"));
  config = deepMerge(config, localConfig);
} catch {
  // config.local.json is optional
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

const networkConfig = config.network || {};
const companionConfig = config.companion || {};
const voiceConfig = config.widgets?.voiceCommand || {};
const ttsConfig = voiceConfig.tts || {};
const langConfig = config.language || {};
const port = networkConfig.port ?? 7777;
const localPort = networkConfig.localPort ?? (port + 1);

// ── Load .env for auth token ───────────────────────────────────────────────────
const envPath = path.resolve(__dirname, ".env");
let envToken = null;
try {
  const envContent = fs.readFileSync(envPath, "utf8");
  const match = envContent.match(/^JARVIS_AUTH_TOKEN=(.+)$/m);
  if (match) envToken = match[1].trim();
} catch {
  // .env is optional if token is in config
}

const authToken = envToken || networkConfig.token;
if (!authToken) {
  console.error("[JARVIS] No auth token found. Run 'bash setup.sh' first or set network.token in config.");
  process.exit(1);
}

// ── Load TLS certs ─────────────────────────────────────────────────────────────
const certsDir = path.resolve(__dirname, "certs");
let tlsOptions = null;

try {
  tlsOptions = {
    key: fs.readFileSync(path.join(certsDir, "server-key.pem")),
    cert: fs.readFileSync(path.join(certsDir, "server.pem")),
    ca: fs.readFileSync(path.join(certsDir, "jarvis-ca.pem")),
  };
} catch (e) {
  console.error("[JARVIS] TLS certificates not found. Run 'bash setup.sh' first.");
  console.error("[JARVIS]", e.message);
  process.exit(1);
}

// ── Initialize modules ─────────────────────────────────────────────────────────
const auth = new Auth({
  token: authToken,
  maxConnections: companionConfig.maxConnections ?? 2,
  rateLimitPerMinute: companionConfig.rateLimitPerMinute ?? 10,
  idleTimeoutMs: companionConfig.idleTimeoutMs ?? 300000,
});

const transcriber = new Transcriber({
  whisperPath: companionConfig.whisperPath,
  whisperModel: companionConfig.whisperModel || voiceConfig.whisperModel || config.widgets?.quickCapture?.voice?.whisperModel,
  whisperLang: langConfig.stt || companionConfig.whisperLang || config.widgets?.quickCapture?.voice?.lang || "en",
});

if (!transcriber.isAvailable) {
  console.warn("[JARVIS] whisper-cli not available. Voice commands will not work. Text commands still functional.");
}

// ── Create HTTPS + WSS server ──────────────────────────────────────────────────
const httpsServer = https.createServer(tlsOptions, (req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("JARVIS Companion Server — Use WebSocket to connect.");
});

const wss = new WebSocket.Server({
  server: httpsServer,
  verifyClient: (info, cb) => {
    const result = auth.verifyClient(info.req);
    if (result.allowed) {
      cb(true);
    } else {
      cb(false, result.code, result.message);
    }
  },
});

// ── Create plain HTTP + WS server (localhost only, for desktop Obsidian) ──────
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("JARVIS Companion Server (local) — Use WebSocket to connect.");
});

const wsLocal = new WebSocket.Server({
  server: httpServer,
  verifyClient: (info, cb) => {
    const result = auth.verifyClient(info.req);
    if (result.allowed) {
      cb(true);
    } else {
      cb(false, result.code, result.message);
    }
  },
});

// ── Connection handler (shared by WSS and WS servers) ─────────────────────────
function handleConnection(ws, req) {
  const ip = auth.getClientIP(req);
  console.log(`[JARVIS] Client connected from ${ip}`);
  auth.registerConnection(ws);
  const resetActivity = auth.setupIdleTimeout(ws);

  // Send connected confirmation
  ws.send(protocol.connected());

  // Per-connection state
  let audioSession = null;
  let activeRunner = null;
  let tts = null;
  let speakBuffer = "";

  // Initialize TTS for this connection
  const mobileTtsMode = networkConfig.mobileTts || "local";
  if (mobileTtsMode === "server") {
    tts = new TTS({
      ...ttsConfig,
      modelsDir: langConfig.piperModelsDir || ttsConfig.piper?.modelsDir,
      fallbackLang: langConfig.fallback || "en",
      speakers: langConfig.speakers || {},
      supportedLangs: langConfig.supported || {},
    });
    tts.setCallbacks(
      (base64Pcm, sampleRate) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(protocol.ttsAudio(base64Pcm, sampleRate));
        }
      },
      () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(protocol.ttsEnd());
        }
      }
    );
  }

  // Initialize Claude runner for this connection
  const interactiveCfg = voiceConfig.interactive || {};
  const autoApproveList = interactiveCfg.autoApproveTools || [];
  const alwaysAskList = interactiveCfg.alwaysAskTools || [];
  const useInteractivePerms = interactiveCfg.interactivePermissions === true;
  const toolsToApprove = useInteractivePerms
    ? autoApproveList
    : [...new Set([...autoApproveList, ...alwaysAskList])];

  const runner = new ClaudeRunner({
    claudePath: companionConfig.claudePath,
    projectPath: voiceConfig.terminal?.projectPath,
    model: voiceConfig.model,
    personality: voiceConfig.personality,
    allowedTools: toolsToApprove,
    interactivePermissions: useInteractivePerms,
    supportedLangs: langConfig.supported || {},
  });

  function cleanup() {
    if (audioSession) { audioSession.cleanup(); audioSession = null; }
    if (activeRunner) { activeRunner.cancel(); activeRunner = null; }
    if (tts) { tts.stop(); }
    transcriber.cancel();
  }

  function runClaude(text, detectedLang) {
    // Prepend language tag for Claude
    let messageText = text;
    const supportedLangs = langConfig.supported || {};
    if (detectedLang && Object.keys(supportedLangs).length > 0 && supportedLangs[detectedLang]) {
      const langLabel = supportedLangs[detectedLang].label || detectedLang;
      messageText = `[Language: ${langLabel}]\n${text}`;
    }

    speakBuffer = "";
    activeRunner = runner.run(messageText, {
      onDelta: (delta) => {
        resetActivity();
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(protocol.streamDelta(delta));

        // TTS sentence buffering
        if (tts?.isEnabled) {
          speakBuffer += delta;
          const { sentences, remainder } = extractSentences(speakBuffer);
          speakBuffer = remainder;
          sentences.forEach((s) => tts.enqueue(s, detectedLang));
        }
      },
      onEnd: ({ exitCode, sessionId }) => {
        activeRunner = null;
        // Speak remaining buffer
        if (tts?.isEnabled && speakBuffer.trim()) {
          tts.enqueue(speakBuffer.trim(), detectedLang);
        }
        speakBuffer = "";

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(protocol.streamEnd(sessionId));
        }
        console.log(`[JARVIS] Turn complete (exit ${exitCode}, session ${sessionId?.slice(0, 7) || "none"})`);
      },
      onError: (err) => {
        activeRunner = null;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(protocol.error("claude", err.message));
        }
      },
      onPermissionRequest: (requestId, request) => {
        resetActivity();
        // Auto-approve tools from config
        const autoApprove = config.widgets?.voiceCommand?.interactive?.autoApproveTools || [];
        if (autoApprove.includes(request.tool_name)) {
          console.log(`[JARVIS] Auto-approving tool: ${request.tool_name} (${requestId})`);
          if (activeRunner) {
            activeRunner.sendControlResponse({
              type: "control_response",
              response: { subtype: "success", request_id: requestId, response: { behavior: "allow" } },
            });
          }
          return;
        }
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(protocol.permissionRequest(requestId, request));
          console.log(`[JARVIS] Permission request → client: ${request.tool_name} (${requestId})`);
        }
      },
      onQuestionRequest: (requestId, request) => {
        resetActivity();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(protocol.questionRequest(requestId, request));
          console.log(`[JARVIS] Question request → client: ${requestId}`);
        }
      },
    });
  }

  // ── Message handler ──────────────────────────────────────────────────────────
  ws.on("message", async (raw, isBinary) => {
    resetActivity();

    // Binary frame = audio chunk
    if (isBinary) {
      if (!audioSession) return;
      const result = audioSession.appendChunk(Buffer.from(raw));
      if (!result.ok) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(protocol.error("audio", result.error));
        }
        audioSession = null;
      }
      return;
    }

    // Text frame = JSON message
    const msg = protocol.parse(raw.toString("utf8"));
    if (!msg) return;

    switch (msg.type) {
      case "ping":
        ws.send(protocol.pong());
        break;

      case "cancel":
        cleanup();
        console.log("[JARVIS] Cancelled by client");
        break;

      case "new_session":
        cleanup();
        runner.clearSession();
        console.log("[JARVIS] Session cleared");
        break;

      case "audio_start": {
        // Kill any previous run
        if (activeRunner) { activeRunner.cancel(); activeRunner = null; }
        if (tts) tts.stop();
        if (audioSession) { audioSession.cleanup(); }
        // Restore session from client for resumption
        if (msg.sessionId && !runner.sessionId) {
          runner.sessionId = msg.sessionId;
        }
        const ffmpegPath = companionConfig.ffmpegPath || "/opt/homebrew/bin/ffmpeg";
        const sizeLimit = networkConfig.audioSizeLimit || 10485760; // 10MB
        audioSession = new AudioSession(msg.format || "mp4", ffmpegPath, sizeLimit);
        break;
      }

      case "audio_end": {
        if (!audioSession) {
          ws.send(protocol.error("audio", "No audio session active"));
          break;
        }

        const session = audioSession;
        audioSession = null;

        try {
          // Convert to WAV
          const wavPath = await session.convertToWav();

          // Transcribe
          const result = await transcriber.transcribe(wavPath);
          const text = typeof result === "string" ? result : result.text;
          let detectedLang = typeof result === "string" ? null : result.detectedLang;

          if (!text) {
            ws.send(protocol.error("transcription", "Empty transcription — please try again"));
            break;
          }

          // Filter detected language against supported list
          const supportedLangs = langConfig.supported || {};
          if (detectedLang && Object.keys(supportedLangs).length > 0 && !supportedLangs[detectedLang]) {
            console.log(`[JARVIS] Detected '${detectedLang}' not in supported languages, falling back to '${langConfig.fallback || "en"}'`);
            detectedLang = langConfig.fallback || "en";
          }

          if (detectedLang) {
            console.log(`[JARVIS] Detected language: ${detectedLang}`);
          }

          // Set TTS language to match detected speech language
          if (tts && detectedLang) {
            tts.setLanguage(detectedLang);
          }

          // Send transcription to client (with detected language)
          ws.send(protocol.transcription(text, detectedLang));

          // Run Claude
          runClaude(text, detectedLang);
        } catch (err) {
          session.cleanup();
          ws.send(protocol.error("transcription", err.message));
        }
        break;
      }

      case "text_command": {
        if (!msg.text?.trim()) break;
        // Kill any previous run
        if (activeRunner) { activeRunner.cancel(); activeRunner = null; }
        if (tts) tts.stop();
        if (audioSession) { audioSession.cleanup(); audioSession = null; }

        // Restore session from client for resumption
        if (msg.sessionId && !runner.sessionId) {
          runner.sessionId = msg.sessionId;
        }

        // Run Claude directly (skip audio/transcription pipeline)
        runClaude(msg.text.trim());
        break;
      }

      case "tts_toggle": {
        if (tts) tts.setMuted(msg.muted === true);
        break;
      }

      case "permission_response": {
        // Relay permission decision from mobile client to Claude's stdin
        if (!runner || !msg.requestId) break;
        const sent = runner.sendControlResponse({
          subtype: "success",
          request_id: msg.requestId,
          response: { behavior: msg.behavior || "deny" },
          ...(msg.updatedPermissions ? { updated_permissions: msg.updatedPermissions } : {}),
        });
        console.log(`[JARVIS] Permission response ← client: ${msg.behavior} (${msg.requestId}) ${sent ? "sent" : "FAILED"}`);
        break;
      }

      case "question_response": {
        // Relay question answer from mobile client to Claude's stdin
        if (!runner || !msg.requestId) break;
        const sent = runner.sendControlResponse({
          subtype: "elicitation_complete",
          request_id: msg.requestId,
          response: msg.answer,
        });
        console.log(`[JARVIS] Question response ← client: (${msg.requestId}) ${sent ? "sent" : "FAILED"}`);
        break;
      }

      default:
        break;
    }
  });

  ws.on("close", () => {
    console.log(`[JARVIS] Client disconnected (${ip})`);
    cleanup();
  });

  ws.on("error", (err) => {
    console.error(`[JARVIS] WebSocket error: ${err.message}`);
  });
}

wss.on("connection", handleConnection);
wsLocal.on("connection", handleConnection);

// ── Server error handling ──────────────────────────────────────────────────────
wss.on("error", (err) => {
  console.error(`[JARVIS] WebSocket server error: ${err.message}`);
});

httpsServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[JARVIS] Port ${port} is already in use. Change network.port in config.json`);
    process.exit(1);
  }
  console.error(`[JARVIS] HTTPS server error: ${err.message}`);
});

wsLocal.on("error", (err) => {
  console.error(`[JARVIS] Local WebSocket server error: ${err.message}`);
});

httpServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[JARVIS] Local port ${localPort} is already in use.`);
  } else {
    console.error(`[JARVIS] Local HTTP server error: ${err.message}`);
  }
});

// ── Start server ───────────────────────────────────────────────────────────────
httpsServer.listen(port, "0.0.0.0", () => {
  console.log(`[JARVIS] Companion server running on wss://0.0.0.0:${port}`);
  console.log(`[JARVIS] Local: wss://localhost:${port}`);

  // Try to get local hostname
  try {
    const hostname = require("os").hostname();
    if (hostname) console.log(`[JARVIS] LAN: wss://${hostname}:${port}`);
  } catch {}

  console.log(`[JARVIS] whisper-cli: ${transcriber.isAvailable ? "available" : "NOT FOUND"}`);
  console.log(`[JARVIS] STT language: ${langConfig.stt || companionConfig.whisperLang || "en"}`);
  console.log(`[JARVIS] TTS mode: ${networkConfig.mobileTts || "local"}`);
  console.log(`[JARVIS] Max connections: ${companionConfig.maxConnections ?? 2}`);
});

// Start local WS server (localhost only — for desktop Obsidian)
httpServer.listen(localPort, "127.0.0.1", () => {
  console.log(`[JARVIS] Local WS: ws://localhost:${localPort}`);
});

// ── Graceful shutdown ──────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n[JARVIS] ${signal} received — shutting down...`);

  // Close all WebSocket connections
  wss.clients.forEach((ws) => {
    ws.close(1001, "Server shutting down");
  });
  wsLocal.clients.forEach((ws) => {
    ws.close(1001, "Server shutting down");
  });

  wss.close(() => {
    wsLocal.close(() => {
      httpsServer.close(() => {
        httpServer.close(() => {
          auth.destroy();
          console.log("[JARVIS] Server stopped.");
          process.exit(0);
        });
      });
    });
  });

  // Force exit after 5 seconds
  setTimeout(() => {
    console.error("[JARVIS] Forced shutdown after timeout.");
    process.exit(1);
  }, 5000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  console.error("[JARVIS] FATAL uncaught exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[JARVIS] FATAL unhandled rejection:", reason);
  process.exit(1);
});
