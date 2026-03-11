// JARVIS Companion — Message Protocol
// Defines the WebSocket message contract between mobile client and server.
// All messages are JSON strings over text frames. Audio data uses binary frames.

const protocol = {
  // ── Server → Client message builders ──

  connected: (version = "1.0") =>
    JSON.stringify({ type: "connected", version }),

  transcription: (text, detectedLang) =>
    JSON.stringify({ type: "transcription", text, ...(detectedLang ? { detectedLang } : {}) }),

  streamDelta: (text) =>
    JSON.stringify({ type: "stream_delta", text }),

  streamEnd: (sessionId) =>
    JSON.stringify({ type: "stream_end", sessionId: sessionId ?? null }),

  ttsAudio: (base64Pcm, sampleRate = 22050) =>
    JSON.stringify({ type: "tts_audio", data: base64Pcm, sampleRate }),

  ttsEnd: () =>
    JSON.stringify({ type: "tts_end" }),

  error: (stage, message) =>
    JSON.stringify({ type: "error", stage, message }),

  pong: () =>
    JSON.stringify({ type: "pong" }),

  // ── Interactive control messages (permissions & questions) ──

  permissionRequest: (requestId, request) =>
    JSON.stringify({ type: "permission_request", requestId, request }),

  questionRequest: (requestId, request) =>
    JSON.stringify({ type: "question_request", requestId, request }),

  // ── Parse inbound message — returns null on malformed input ──
  parse: (raw) => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
};

module.exports = protocol;
