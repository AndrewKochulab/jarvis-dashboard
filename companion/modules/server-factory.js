// JARVIS Companion — Server Assembly & Lifecycle
// Wires all modules, creates HTTP/HTTPS + WS/WSS servers, handles graceful shutdown.

const http = require("http");
const https = require("https");
const os = require("os");
const WebSocket = require("ws");

const Auth = require("./auth");
const Transcriber = require("./transcriber");
const protocol = require("./protocol");
const ConnectionHandler = require("./connection-handler");
const VoicePipeline = require("./voice-pipeline");
const MessageRouter = require("./message-router");
const handlers = require("./handlers");

function createServer(config) {
  const {
    raw: rawConfig,
    networkConfig,
    companionConfig,
    voiceConfig,
    ttsConfig,
    langConfig,
    authToken,
    tlsOptions,
    port,
    localPort,
  } = config;

  // Initialize auth
  const auth = new Auth({
    token: authToken,
    maxConnections: companionConfig.maxConnections ?? 2,
    rateLimitPerMinute: companionConfig.rateLimitPerMinute ?? 10,
    idleTimeoutMs: companionConfig.idleTimeoutMs ?? 300000,
  });

  // Initialize transcriber
  const transcriber = new Transcriber({
    whisperPath: companionConfig.whisperPath,
    whisperModel: companionConfig.whisperModel || voiceConfig.whisperModel || rawConfig.widgets?.quickCapture?.voice?.whisperModel,
    whisperLang: langConfig.stt || companionConfig.whisperLang || rawConfig.widgets?.quickCapture?.voice?.lang || "en",
  });

  if (!transcriber.isAvailable) {
    console.warn("[JARVIS] whisper-cli not available. Voice commands will not work. Text commands still functional.");
  }

  // Build message router
  const router = new MessageRouter();
  router.register("ping", handlers.handlePing);
  router.register("cancel", handlers.handleCancel);
  router.register("new_session", handlers.handleNewSession);
  router.register("audio_start", (msg, conn, pipeline) => {
    handlers.handleAudioStart(msg, conn, pipeline, { companionConfig, networkConfig });
  });
  router.register("audio_end", handlers.handleAudioEnd);
  router.register("text_command", handlers.handleTextCommand);
  router.register("tts_toggle", handlers.handleTtsToggle);
  router.register("permission_response", handlers.handlePermissionResponse);
  router.register("question_response", handlers.handleQuestionResponse);
  router.setBinaryHandler(handlers.handleBinaryAudio);

  // Shared verifyClient callback
  function makeVerifyClient(info, cb) {
    const result = auth.verifyClient(info.req);
    if (result.allowed) {
      cb(true);
    } else {
      cb(false, result.code, result.message);
    }
  }

  // Connection handler
  function handleConnection(ws, req) {
    const ip = auth.getClientIP(req);
    console.log(`[JARVIS] Client connected from ${ip}`);
    auth.registerConnection(ws);
    const resetActivity = auth.setupIdleTimeout(ws);

    ws.send(protocol.connected());

    const conn = new ConnectionHandler(ws, {
      voiceConfig,
      ttsConfig,
      langConfig,
      networkConfig,
      companionConfig,
      rawConfig,
    });
    conn.resetActivity = resetActivity;

    const pipeline = new VoicePipeline(conn, { transcriber, langConfig });

    ws.on("message", async (raw, isBinary) => {
      resetActivity();

      if (isBinary) {
        router.routeBinary(raw, conn, pipeline);
        return;
      }

      const msg = protocol.parse(raw.toString("utf8"));
      if (!msg) return;
      router.route(msg, conn, pipeline);
    });

    ws.on("close", (code, reason) => {
      console.log(`[JARVIS] Client disconnected (${ip}) code=${code} reason=${reason || "none"}`);
      conn.cleanup();
      transcriber.cancel();
    });

    ws.on("error", (err) => {
      console.error(`[JARVIS] WebSocket error: ${err.message}`);
    });
  }

  // Create servers
  const httpsServer = https.createServer(tlsOptions, (req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("JARVIS Companion Server — Use WebSocket to connect.");
  });

  const wss = new WebSocket.Server({
    server: httpsServer,
    verifyClient: makeVerifyClient,
  });

  const httpServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("JARVIS Companion Server (local) — Use WebSocket to connect.");
  });

  const wsLocal = new WebSocket.Server({
    server: httpServer,
    verifyClient: makeVerifyClient,
  });

  wss.on("connection", handleConnection);
  wsLocal.on("connection", handleConnection);

  // Error handling
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

  // Graceful shutdown
  function shutdown(signal) {
    console.log(`\n[JARVIS] ${signal} received — shutting down...`);

    wss.clients.forEach((ws) => ws.close(1001, "Server shutting down"));
    wsLocal.clients.forEach((ws) => ws.close(1001, "Server shutting down"));

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

  return {
    start() {
      httpsServer.listen(port, "::", () => {
        console.log(`[JARVIS] Companion server running on wss://0.0.0.0:${port}`);
        console.log(`[JARVIS] Local: wss://localhost:${port}`);

        try {
          const hostname = os.hostname();
          if (hostname) console.log(`[JARVIS] LAN: wss://${hostname}:${port}`);
        } catch {}

        console.log(`[JARVIS] whisper-cli: ${transcriber.isAvailable ? "available" : "NOT FOUND"}`);
        console.log(`[JARVIS] STT language: ${langConfig.stt || companionConfig.whisperLang || "en"}`);
        console.log(`[JARVIS] TTS mode: ${networkConfig.mobileTts || "local"}`);
        console.log(`[JARVIS] Max connections: ${companionConfig.maxConnections ?? 2}`);
      });

      httpServer.listen(localPort, "127.0.0.1", () => {
        console.log(`[JARVIS] Local WS: ws://localhost:${localPort}`);
      });
    },
    shutdown,
  };
}

module.exports = { createServer };
