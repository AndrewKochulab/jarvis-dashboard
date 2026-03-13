// JARVIS Companion — Abstract TTS Engine
// Base class for all TTS engines. Provides shared stop/callback logic.

class BaseTTSEngine {
  constructor() {
    this._activeProcess = null;
    this._epoch = 0;
    this._onAudioChunk = null;
    this._onComplete = null;
  }

  setCallbacks(onAudioChunk, onComplete) {
    this._onAudioChunk = onAudioChunk;
    this._onComplete = onComplete;
  }

  speak(text, lang, epoch) {
    throw new Error("speak() must be implemented by subclass");
  }

  stop() {
    this._epoch++;
    if (this._activeProcess) {
      try { this._activeProcess.kill("SIGTERM"); } catch {}
      this._activeProcess = null;
    }
  }
}

module.exports = BaseTTSEngine;
