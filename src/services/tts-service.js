// TTS Service
// Text-to-speech with sequential sentence queue and multiple engine backends
// Returns: service API object

const { nodeFs, config } = ctx;
const { spawn } = require("child_process");

const ttsCfg = config.widgets?.voiceCommand?.tts || {};
const langCfg = config.language || {};
const enabled = ttsCfg.enabled === true;

function expandPath(p) {
  if (!p) return "";
  if (p.startsWith("~/") || p === "~") return p.replace("~", require("os").homedir());
  return p;
}

// Discover available Piper models in a directory
function discoverPiperModels(modelsDir, preferredModelPath) {
  const models = new Map();
  const dir = expandPath(modelsDir || "");
  if (!dir || !nodeFs.existsSync(dir)) return models;

  const qualityOrder = { x_low: 0, low: 1, medium: 2, high: 3 };
  let files;
  try { files = require("fs").readdirSync(dir).filter(f => f.endsWith(".onnx")); } catch { return models; }

  for (const file of files) {
    const match = file.match(/^([a-z]{2})_([A-Z]{2})-(.+)-(x_low|low|medium|high)\.onnx$/);
    if (!match) continue;
    const [, lang, region, speaker, quality] = match;
    const modelPath = require("path").join(dir, file);

    if (!models.has(lang)) {
      models.set(lang, { modelPath, lang, region, speaker, quality });
    } else {
      const existing = models.get(lang);
      if ((qualityOrder[quality] || 0) > (qualityOrder[existing.quality] || 0)) {
        models.set(lang, { modelPath, lang, region, speaker, quality });
      }
    }
  }

  // Override with user's preferred model — ensures configured voice takes priority
  if (preferredModelPath) {
    const filename = require("path").basename(preferredModelPath);
    const prefMatch = filename.match(/^([a-z]{2})_([A-Z]{2})-(.+)-(x_low|low|medium|high)\.onnx$/);
    if (prefMatch) {
      const [, lang, region, speaker, quality] = prefMatch;
      models.set(lang, { modelPath: preferredModelPath, lang, region, speaker, quality });
    }
  }

  return models;
}

// ── TTSQueue — sequential playback of text chunks ──

class TTSQueue {
  constructor(speakFn) {
    this._q = [];
    this._busy = false;
    this._fn = speakFn; // ({ text, lang }, onDone) => void
    this._epoch = 0;
  }

  enqueue(text, lang) {
    const clean = text.trim();
    if (!clean) return;
    this._q.push({ text: clean, lang });
    if (!this._busy) this._next();
  }

  _next() {
    if (this._q.length === 0) { this._busy = false; return; }
    this._busy = true;
    const epoch = this._epoch;
    this._fn(this._q.shift(), () => {
      if (this._epoch !== epoch) return; // stop() was called, ignore stale callback
      this._next();
    });
  }

  stop() {
    this._q = [];
    this._busy = false;
    this._epoch++;
  }

  get busy() { return this._busy; }
}

// ── Engine A — speechSynthesis (browser built-in) ──

function createSpeechSynthesisEngine() {
  return {
    speak(text, onDone) {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.1;
      u.onend = onDone;
      u.onerror = onDone;
      window.speechSynthesis.speak(u);
    },
    stop() { window.speechSynthesis.cancel(); },
  };
}

// ── Engine B — say (macOS, recommended default) ──

function createSayEngine(voice, rate) {
  let proc = null;
  let _epoch = 0;
  return {
    speak(text, onDone) {
      const myEpoch = ++_epoch;
      proc = spawn("say", ["-v", voice, "-r", String(rate), text]);
      proc.on("close", () => { proc = null; if (_epoch === myEpoch) onDone(); });
      proc.on("error", () => { proc = null; if (_epoch === myEpoch) onDone(); });
    },
    stop() {
      _epoch++;
      if (proc) { try { proc.kill("SIGTERM"); } catch (e) {} proc = null; }
    },
  };
}

// ── Engine C — piper (neural TTS, optional) ──

function buildPiperArgs(modelPath, piperCfg, speakerId) {
  const args = ["--model", modelPath];
  if (speakerId != null) args.push("--speaker", String(speakerId));
  if (piperCfg.lengthScale != null) args.push("--length-scale", String(piperCfg.lengthScale));
  if (piperCfg.noiseScale != null) args.push("--noise-scale", String(piperCfg.noiseScale));
  if (piperCfg.noiseWScale != null) args.push("--noise-w-scale", String(piperCfg.noiseWScale));
  if (piperCfg.sentenceSilence != null) args.push("--sentence-silence", String(piperCfg.sentenceSilence));
  if (piperCfg.volume != null) args.push("--volume", String(piperCfg.volume));
  return args;
}

function createPiperEngine(binaryPath, modelPath, piperCfg, speakerId) {
  let piperProc = null;
  let playerProc = null;
  let _epoch = 0;
  const baseArgs = buildPiperArgs(modelPath, piperCfg, speakerId);

  return {
    speak(text, onDone) {
      const myEpoch = ++_epoch;
      const tmpFile = `/tmp/jarvis-tts-${Date.now()}.wav`;
      piperProc = spawn(binaryPath, [...baseArgs, "--output_file", tmpFile]);
      piperProc.stdin.write(text);
      piperProc.stdin.end();
      piperProc.on("close", () => {
        piperProc = null;
        if (_epoch !== myEpoch) { try { require("fs").unlinkSync(tmpFile); } catch {} return; }
        playerProc = spawn("afplay", [tmpFile]);
        playerProc.on("close", () => {
          playerProc = null;
          try { require("fs").unlinkSync(tmpFile); } catch {}
          if (_epoch === myEpoch) onDone();
        });
        playerProc.on("error", () => { playerProc = null; if (_epoch === myEpoch) onDone(); });
      });
      piperProc.on("error", () => { piperProc = null; if (_epoch === myEpoch) onDone(); });
    },
    stop() {
      _epoch++;
      if (playerProc) { try { playerProc.kill("SIGTERM"); } catch (e) {} playerProc = null; }
      if (piperProc) { try { piperProc.kill("SIGTERM"); } catch (e) {} piperProc = null; }
    },
  };
}

// ── Engine selection ──

let engine = null;
let queue = null;
let _muted = false;
let _currentLang = langCfg.fallback || "en";

// Multi-language: discover Piper models and cache engines per language
const piperModelsDir = langCfg.piperModelsDir || null;
const configuredModelPath = expandPath(ttsCfg.piper?.modelPath || "");
const discoveredModels = discoverPiperModels(piperModelsDir, configuredModelPath);
const piperEngines = new Map(); // langCode → engine
const fallbackLang = langCfg.fallback || "en";

if (discoveredModels.size > 0) {
  const langs = Array.from(discoveredModels.entries())
    .map(([lang, info]) => `${lang} (${info.lang}_${info.region}-${info.speaker}-${info.quality})`)
    .join(", ");
  console.log(`[TTSService] Piper models discovered: ${langs}`);
} else {
  console.warn(`[TTSService] No Piper models discovered. piperModelsDir=${piperModelsDir}, configuredModelPath=${configuredModelPath}`);
}

const supportedLangs = langCfg.supported || {};
const hasSupportedLangs = Object.keys(supportedLangs).length > 0;
console.log(`[TTSService] supportedLangs=${JSON.stringify(Object.keys(supportedLangs))}, hasSupportedLangs=${hasSupportedLangs}, fallbackLang=${fallbackLang}`);
const oldSpeakerMap = langCfg.speakers || {};

function getPiperEngineForLang(lang, binPath, globalPiperCfg) {
  // Validate language against supported list
  const effectiveLang = (hasSupportedLangs && lang && !supportedLangs[lang])
    ? fallbackLang : (lang || fallbackLang);

  console.log(`[TTSService] getPiperEngineForLang: input=${lang}, effective=${effectiveLang}, cached=${piperEngines.has(effectiveLang)}`);

  if (piperEngines.has(effectiveLang)) return piperEngines.get(effectiveLang);

  const modelInfo = discoveredModels.get(effectiveLang) || discoveredModels.get(fallbackLang);
  if (!modelInfo) { console.warn(`[TTSService] No model found for lang=${effectiveLang}`); return null; }

  // Merge global piper config with per-language overrides
  const langEntry = supportedLangs[effectiveLang] || {};
  const langPiper = langEntry.piper || {};
  const mergedCfg = { ...globalPiperCfg };
  for (const k of Object.keys(langPiper)) {
    if (langPiper[k] != null) mergedCfg[k] = langPiper[k];
  }

  const speakerId = langEntry.speaker ?? oldSpeakerMap[effectiveLang] ?? null;
  console.log(`[TTSService] Creating engine: lang=${effectiveLang}, model=${modelInfo.modelPath}, speaker=${speakerId}`);
  const eng = createPiperEngine(binPath, modelInfo.modelPath, mergedCfg, speakerId);
  piperEngines.set(effectiveLang, eng);
  return eng;
}

if (enabled) {
  const engineType = ttsCfg.engine || "say";

  if (engineType === "piper") {
    const binPath = expandPath(ttsCfg.piper?.binaryPath || "");
    const modelPath = expandPath(ttsCfg.piper?.modelPath || "");
    if (binPath && nodeFs.existsSync(binPath) && (discoveredModels.size > 0 || (modelPath && nodeFs.existsSync(modelPath)))) {
      if (discoveredModels.size === 0) {
        // No discovered models — use single configured model (original behavior)
        engine = createPiperEngine(binPath, modelPath, ttsCfg.piper || {});
      }
      // When discoveredModels.size > 0, engine is resolved per speak() call
    } else {
      console.warn("[TTSService] piper binary not found, falling back to say");
      engine = createSayEngine(ttsCfg.say?.voice || "Samantha", ttsCfg.say?.rate || 185);
    }
  } else if (engineType === "speechSynthesis") {
    engine = createSpeechSynthesisEngine();
  } else {
    engine = createSayEngine(ttsCfg.say?.voice || "Samantha", ttsCfg.say?.rate || 185);
  }

  queue = new TTSQueue((item, onDone) => {
    console.log(`[TTSService] Queue dequeue: lang=${item.lang}, text="${item.text.slice(0, 40)}…", discoveredModels=${discoveredModels.size}, engine=${ttsCfg.engine}`);
    // If multi-language Piper models are discovered, resolve engine per language
    if (discoveredModels.size > 0 && ttsCfg.engine === "piper") {
      const binPath = expandPath(ttsCfg.piper?.binaryPath || "");
      const langEngine = getPiperEngineForLang(item.lang, binPath, ttsCfg.piper || {});
      if (langEngine) {
        langEngine.speak(item.text, onDone);
        return;
      }
    }
    // Fall back to static engine
    console.warn(`[TTSService] Falling back to static engine (engine=${!!engine})`);
    if (engine) engine.speak(item.text, onDone);
    else onDone();
  });
}

// ── Public API ──

return {
  speak(text, lang) {
    if (!enabled || _muted || !queue) return;
    const effectiveLang = lang
      ? ((hasSupportedLangs && !supportedLangs[lang]) ? fallbackLang : lang)
      : _currentLang;
    if (lang) _currentLang = effectiveLang;
    console.log(`[TTSService] speak(): lang=${lang}, effectiveLang=${effectiveLang}, _currentLang=${_currentLang}, text="${text.slice(0, 40)}…"`);
    queue.enqueue(text, effectiveLang);
  },

  stop() {
    if (queue) queue.stop();
    if (engine) engine.stop();
    piperEngines.forEach((eng) => eng.stop());
  },

  mute() {
    _muted = true;
    if (queue) queue.stop();
    if (engine) engine.stop();
    piperEngines.forEach((eng) => eng.stop());
  },

  unmute() { _muted = false; },

  cleanup() {
    if (queue) queue.stop();
    if (engine) engine.stop();
    piperEngines.forEach((eng) => eng.stop());
    _muted = false;
  },

  get isSpeaking() { return queue?.busy ?? false; },
  get isMuted() { return _muted; },
  get isEnabled() { return enabled; },
};
