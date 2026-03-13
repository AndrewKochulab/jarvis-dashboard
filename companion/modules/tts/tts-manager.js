// JARVIS Companion — TTS Queue & Dispatch
// Manages TTS queue, engine selection, and language-based fallback.

const SayEngine = require("./say-engine");
const PiperEngine = require("./piper-engine");
const { stripMarkdown } = require("../text-processing");

class TTSManager {
  constructor(config) {
    this._enabled = config.enabled === true;
    this._muted = false;
    this._queue = [];
    this._busy = false;
    this._epoch = 0;

    // Multi-language support
    this._fallbackLang = config.fallbackLang || "en";
    this._currentLang = this._fallbackLang;
    this._supportedLangs = config.supportedLangs || {};
    this._hasSupportedLangs = Object.keys(this._supportedLangs).length > 0;

    // Create engines
    this._sayEngine = new SayEngine(config.say || { voice: "Samantha", rate: 185 });
    this._piperEngine = new PiperEngine({
      binaryPath: config.piper?.binaryPath,
      piper: config.piper || {},
      modelsDir: config.modelsDir,
      fallbackLang: this._fallbackLang,
      supportedLangs: this._supportedLangs,
      speakers: config.speakers || {},
    });

    // Select primary engine
    this._engineName = config.engine || "say";
    this._engine = this._engineName === "piper" ? this._piperEngine : this._sayEngine;

    // Log piper model discovery
    if (this._piperEngine.modelsCount > 0) {
      console.log(`[TTS] Piper models discovered: ${this._piperEngine.getModelInfo()}`);
      console.log(`[TTS] Fallback language: ${this._fallbackLang}`);
    }

    // Callbacks set later via setCallbacks
    this._onAudioChunk = null;
    this._onTtsEnd = null;
  }

  get isEnabled() { return this._enabled && !this._muted; }

  setCallbacks(onAudioChunk, onTtsEnd) {
    this._onAudioChunk = onAudioChunk;
    this._onTtsEnd = onTtsEnd;

    // Wire engine callbacks
    const wireEngine = (engine) => {
      engine.setCallbacks(
        (base64Pcm, sampleRate) => {
          if (this._onAudioChunk) this._onAudioChunk(base64Pcm, sampleRate);
        },
        (result) => {
          // On piper failure, retry with say engine as fallback
          if (!result.success && engine === this._piperEngine) {
            const item = this._currentItem;
            if (item) {
              this._sayEngine.speak(item.text, item.lang, this._epoch);
              return;
            }
          }
          this._processNext();
        }
      );
    };

    wireEngine(this._sayEngine);
    wireEngine(this._piperEngine);
  }

  setMuted(muted) { this._muted = muted; }

  setLanguage(langCode) {
    if (!langCode) return;
    if (this._hasSupportedLangs && !this._supportedLangs[langCode]) {
      this._currentLang = this._fallbackLang;
    } else {
      this._currentLang = langCode;
    }
  }

  enqueue(text, lang) {
    if (!this._enabled || this._muted) return;
    const clean = stripMarkdown(text).trim();
    if (!clean) return;
    let effectiveLang = this._currentLang;
    if (lang) {
      effectiveLang = (this._hasSupportedLangs && !this._supportedLangs[lang])
        ? this._fallbackLang : lang;
    }
    this._queue.push({ text: clean, lang: effectiveLang });
    if (!this._busy) this._processNext();
  }

  _processNext() {
    if (this._queue.length === 0) {
      this._busy = false;
      this._currentItem = null;
      if (this._onTtsEnd) this._onTtsEnd();
      return;
    }
    this._busy = true;
    const item = this._queue.shift();
    this._currentItem = item;
    this._engine.speak(item.text, item.lang, this._epoch);
  }

  stop() {
    this._queue = [];
    this._busy = false;
    this._currentItem = null;
    this._epoch++;
    this._sayEngine.stop();
    this._piperEngine.stop();
  }
}

module.exports = TTSManager;
