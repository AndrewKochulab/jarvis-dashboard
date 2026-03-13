// JARVIS Companion — Per-Connection State
// Encapsulates WebSocket, audio session, runner, TTS, and safe send for one client.

const WebSocket = require("ws");
const ClaudeRunner = require("./claude-runner");
const TTSManager = require("./tts/tts-manager");
const protocol = require("./protocol");

class ConnectionHandler {
  constructor(ws, { voiceConfig, ttsConfig, langConfig, networkConfig, companionConfig, rawConfig }) {
    this.ws = ws;
    this.audioSession = null;
    this.activeRunner = null;
    this.speakBuffer = "";
    this.tts = null;
    this.resetActivity = null;

    // Initialize TTS
    const mobileTtsMode = networkConfig.mobileTts || "local";
    if (mobileTtsMode === "server") {
      this.tts = new TTSManager({
        ...ttsConfig,
        modelsDir: langConfig.piperModelsDir || ttsConfig.piper?.modelsDir,
        fallbackLang: langConfig.fallback || "en",
        speakers: langConfig.speakers || {},
        supportedLangs: langConfig.supported || {},
      });
      this.tts.setCallbacks(
        (base64Pcm, sampleRate) => {
          this.send(protocol.ttsAudio(base64Pcm, sampleRate));
        },
        () => {
          this.send(protocol.ttsEnd());
        }
      );
    }

    // Initialize Claude runner
    const interactiveCfg = voiceConfig.interactive || {};
    const autoApproveList = interactiveCfg.autoApproveTools || [];
    const alwaysAskList = interactiveCfg.alwaysAskTools || [];
    const useInteractivePerms = interactiveCfg.interactivePermissions === true;
    const toolsToApprove = useInteractivePerms
      ? autoApproveList
      : [...new Set([...autoApproveList, ...alwaysAskList])];

    this.runner = new ClaudeRunner({
      claudePath: companionConfig.claudePath,
      projectPath: voiceConfig.terminal?.projectPath,
      model: voiceConfig.model,
      personality: voiceConfig.personality,
      allowedTools: toolsToApprove,
      interactivePermissions: useInteractivePerms,
      supportedLangs: langConfig.supported || {},
    });

    this._rawConfig = rawConfig;
  }

  send(msg) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
      return true;
    }
    return false;
  }

  killPreviousRun() {
    if (this.activeRunner) { this.activeRunner.cancel(); this.activeRunner = null; }
    if (this.tts) this.tts.stop();
    if (this.audioSession) { this.audioSession.cleanup(); this.audioSession = null; }
  }

  restoreSession(sessionId) {
    // Always sync to the client's declared session.
    // null/undefined means "new session" — clear so Claude starts fresh.
    this.runner.sessionId = sessionId || null;
  }

  cleanup() {
    if (this.audioSession) { this.audioSession.cleanup(); this.audioSession = null; }
    if (this.activeRunner) { this.activeRunner.cancel(); this.activeRunner = null; }
    if (this.tts) { this.tts.stop(); }
  }
}

module.exports = ConnectionHandler;
