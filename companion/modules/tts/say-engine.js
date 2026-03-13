// JARVIS Companion — macOS Say TTS Engine
// Synthesizes speech via macOS `say` command, outputs PCM float32 at 22050 Hz.

const { spawn } = require("child_process");
const BaseTTSEngine = require("./base-engine");

class SayEngine extends BaseTTSEngine {
  constructor(config) {
    super();
    this._voice = config.voice || "Samantha";
    this._rate = config.rate || 185;
  }

  speak(text, lang, epoch) {
    this._activeProcess = spawn("say", [
      "-v", this._voice,
      "-r", String(this._rate),
      "-o", "-",
      "--data-format=LEF32@22050",
      text,
    ]);

    this._activeProcess.stdout.on("data", (chunk) => {
      if (this._onAudioChunk) {
        this._onAudioChunk(chunk.toString("base64"), 22050);
      }
    });

    this._activeProcess.on("close", () => {
      this._activeProcess = null;
      if (this._epoch !== epoch) return;
      if (this._onComplete) this._onComplete({ success: true });
    });

    this._activeProcess.on("error", () => {
      this._activeProcess = null;
      if (this._epoch !== epoch) return;
      if (this._onComplete) this._onComplete({ success: true });
    });
  }
}

module.exports = SayEngine;
