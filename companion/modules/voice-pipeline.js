// JARVIS Companion — Voice Pipeline
// Audio → Transcribe → Claude → TTS orchestration for a single connection.

const fs = require("fs");
const protocol = require("./protocol");
const { extractSentences } = require("./text-processing");

class VoicePipeline {
  constructor(conn, { transcriber, langConfig }) {
    this._conn = conn;
    this._transcriber = transcriber;
    this._langConfig = langConfig;
  }

  async processAudioEnd() {
    const conn = this._conn;

    if (!conn.audioSession) {
      conn.send(protocol.error("audio", "No audio session active"));
      return;
    }

    const session = conn.audioSession;
    conn.audioSession = null;

    try {
      const wavPath = await session.convertToWav();
      const wavStat = fs.statSync(wavPath);
      console.log(`[JARVIS] WAV file: ${wavPath} (${wavStat.size} bytes)`);

      const result = await this._transcriber.transcribe(wavPath);
      const text = typeof result === "string" ? result : result.text;
      let detectedLang = typeof result === "string" ? null : result.detectedLang;
      console.log(`[JARVIS] Transcription: "${text}" (lang: ${detectedLang || "default"})`);

      if (!text) {
        conn.send(protocol.error("transcription", "Empty transcription — please try again"));
        return;
      }

      // Filter detected language against supported list
      const supportedLangs = this._langConfig.supported || {};
      if (detectedLang && Object.keys(supportedLangs).length > 0 && !supportedLangs[detectedLang]) {
        console.log(`[JARVIS] Detected '${detectedLang}' not in supported languages, falling back to '${this._langConfig.fallback || "en"}'`);
        detectedLang = this._langConfig.fallback || "en";
      }

      if (detectedLang) {
        console.log(`[JARVIS] Detected language: ${detectedLang}`);
      }

      if (conn.tts && detectedLang) {
        conn.tts.setLanguage(detectedLang);
      }

      conn.send(protocol.transcription(text, detectedLang));
      this.runClaude(text, detectedLang);
    } catch (err) {
      session.cleanup();
      conn.send(protocol.error("transcription", err.message));
    }
  }

  runClaude(text, detectedLang) {
    const conn = this._conn;
    const langConfig = this._langConfig;

    // Prepend language tag for Claude
    let messageText = text;
    const supportedLangs = langConfig.supported || {};
    if (detectedLang && Object.keys(supportedLangs).length > 0 && supportedLangs[detectedLang]) {
      const langLabel = supportedLangs[detectedLang].label || detectedLang;
      messageText = `[Language: ${langLabel}]\n${text}`;
    }

    conn.speakBuffer = "";
    conn.activeRunner = conn.runner.run(messageText, {
      onDelta: (delta) => {
        if (conn.resetActivity) conn.resetActivity();
        if (!conn.send(protocol.streamDelta(delta))) return;

        // TTS sentence buffering
        if (conn.tts?.isEnabled) {
          conn.speakBuffer += delta;
          const { sentences, remainder } = extractSentences(conn.speakBuffer);
          conn.speakBuffer = remainder;
          sentences.forEach((s) => conn.tts.enqueue(s, detectedLang));
        }
      },
      onEnd: ({ exitCode, sessionId }) => {
        conn.activeRunner = null;
        if (conn.tts?.isEnabled && conn.speakBuffer.trim()) {
          conn.tts.enqueue(conn.speakBuffer.trim(), detectedLang);
        }
        conn.speakBuffer = "";
        conn.send(protocol.streamEnd(sessionId));
        console.log(`[JARVIS] Turn complete (exit ${exitCode}, session ${sessionId?.slice(0, 7) || "none"})`);
      },
      onError: (err) => {
        conn.activeRunner = null;
        conn.send(protocol.error("claude", err.message));
      },
      onPermissionRequest: (requestId, request) => {
        if (conn.resetActivity) conn.resetActivity();
        // Auto-approve tools from config
        const autoApprove = conn._rawConfig.widgets?.voiceCommand?.interactive?.autoApproveTools || [];
        if (autoApprove.includes(request.tool_name)) {
          console.log(`[JARVIS] Auto-approving tool: ${request.tool_name} (${requestId})`);
          if (conn.activeRunner) {
            conn.activeRunner.sendControlResponse({
              type: "control_response",
              response: { subtype: "success", request_id: requestId, response: { behavior: "allow" } },
            });
          }
          return;
        }
        conn.send(protocol.permissionRequest(requestId, request));
        console.log(`[JARVIS] Permission request → client: ${request.tool_name} (${requestId})`);
      },
      onQuestionRequest: (requestId, request) => {
        if (conn.resetActivity) conn.resetActivity();
        conn.send(protocol.questionRequest(requestId, request));
        console.log(`[JARVIS] Question request → client: ${requestId}`);
      },
    });
  }
}

module.exports = VoicePipeline;
