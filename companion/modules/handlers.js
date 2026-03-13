// JARVIS Companion — Message Handlers
// Thin handler functions for each WebSocket message type.

const { AudioSession } = require("./audio");
const protocol = require("./protocol");

function handlePing(msg, conn) {
  conn.send(protocol.pong());
}

function handleCancel(msg, conn) {
  conn.cleanup();
  console.log("[JARVIS] Cancelled by client");
}

function handleNewSession(msg, conn) {
  conn.cleanup();
  conn.runner.clearSession();
  console.log("[JARVIS] Session cleared");
}

function handleAudioStart(msg, conn, pipeline, { companionConfig, networkConfig }) {
  conn.killPreviousRun();
  conn.restoreSession(msg.sessionId);
  if (msg.projectPath) conn.runner.setProjectPath(msg.projectPath);
  const ffmpegPath = companionConfig.ffmpegPath || "/opt/homebrew/bin/ffmpeg";
  const sizeLimit = networkConfig.audioSizeLimit || 10485760;
  conn.audioSession = new AudioSession(msg.format || "mp4", ffmpegPath, sizeLimit);
  console.log(`[JARVIS] Audio session started: format=${msg.format} sampleRate=${msg.sampleRate}`);
}

function handleAudioEnd(msg, conn, pipeline) {
  pipeline.processAudioEnd();
}

function handleTextCommand(msg, conn, pipeline) {
  if (!msg.text?.trim()) return;
  conn.killPreviousRun();
  conn.restoreSession(msg.sessionId);
  if (msg.projectPath) conn.runner.setProjectPath(msg.projectPath);
  pipeline.runClaude(msg.text.trim());
}

function handleTtsToggle(msg, conn) {
  if (conn.tts) conn.tts.setMuted(msg.muted === true);
}

function handlePermissionResponse(msg, conn) {
  if (!conn.runner || !msg.requestId) return;
  const sent = conn.runner.sendControlResponse({
    subtype: "success",
    request_id: msg.requestId,
    response: { behavior: msg.behavior || "deny" },
    ...(msg.updatedPermissions ? { updated_permissions: msg.updatedPermissions } : {}),
  });
  console.log(`[JARVIS] Permission response ← client: ${msg.behavior} (${msg.requestId}) ${sent ? "sent" : "FAILED"}`);
}

function handleQuestionResponse(msg, conn) {
  if (!conn.runner || !msg.requestId) return;
  const sent = conn.runner.sendControlResponse({
    subtype: "elicitation_complete",
    request_id: msg.requestId,
    response: msg.answer,
  });
  console.log(`[JARVIS] Question response ← client: (${msg.requestId}) ${sent ? "sent" : "FAILED"}`);
}

function handleBinaryAudio(buffer, conn) {
  if (!conn.audioSession) {
    console.log(`[JARVIS] Binary data received but no audio session (${buffer.length} bytes)`);
    return;
  }
  console.log(`[JARVIS] Audio chunk: ${buffer.length} bytes (total: ${conn.audioSession._totalSize + buffer.length})`);
  const result = conn.audioSession.appendChunk(Buffer.from(buffer));
  if (!result.ok) {
    conn.send(protocol.error("audio", result.error));
    conn.audioSession = null;
  }
}

module.exports = {
  handlePing,
  handleCancel,
  handleNewSession,
  handleAudioStart,
  handleAudioEnd,
  handleTextCommand,
  handleTtsToggle,
  handlePermissionResponse,
  handleQuestionResponse,
  handleBinaryAudio,
};
