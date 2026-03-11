// JARVIS Companion — Server-side TTS
// Synthesizes speech via piper or say, streams PCM audio back to mobile.
// Used only when network.mobileTts is "server" (default is "local" — mobile handles TTS itself).

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

function expandPath(p) {
  if (!p) return "";
  if (p.startsWith("~/") || p === "~") return p.replace("~", os.homedir());
  return p;
}

// Discover available Piper models in a directory
// Returns Map<langCode, { modelPath, lang, region, speaker, quality }>
function discoverPiperModels(modelsDir, preferredModelPath) {
  const models = new Map();
  const dir = expandPath(modelsDir || "");
  if (!dir || !fs.existsSync(dir)) return models;

  const qualityOrder = { x_low: 0, low: 1, medium: 2, high: 3 };
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".onnx"));

  for (const file of files) {
    const match = file.match(/^([a-z]{2})_([A-Z]{2})-(.+)-(x_low|low|medium|high)\.onnx$/);
    if (!match) continue;
    const [, lang, region, speaker, quality] = match;
    const modelPath = path.join(dir, file);

    if (!models.has(lang)) {
      models.set(lang, { modelPath, lang, region, speaker, quality });
    } else {
      // Prefer higher quality
      const existing = models.get(lang);
      if ((qualityOrder[quality] || 0) > (qualityOrder[existing.quality] || 0)) {
        models.set(lang, { modelPath, lang, region, speaker, quality });
      }
    }
  }

  // Override with user's preferred model — ensures configured voice takes priority
  if (preferredModelPath) {
    const filename = path.basename(preferredModelPath);
    const prefMatch = filename.match(/^([a-z]{2})_([A-Z]{2})-(.+)-(x_low|low|medium|high)\.onnx$/);
    if (prefMatch) {
      const [, lang, region, speaker, quality] = prefMatch;
      models.set(lang, { modelPath: preferredModelPath, lang, region, speaker, quality });
    }
  }

  return models;
}

function stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/`[^`]+`/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Extract sentence boundaries from a growing buffer
function extractSentences(buffer) {
  const sentences = [];
  const pattern = /[.!?]\s+|\n\n/;
  let buf = buffer;
  let idx;
  while ((idx = buf.search(pattern)) !== -1) {
    sentences.push(buf.slice(0, idx + 1).trim());
    buf = buf.slice(idx + 1);
  }
  return { sentences, remainder: buf };
}

class TTS {
  constructor(config) {
    this._engine = config.engine || "say";
    this._sayConfig = config.say || { voice: "Samantha", rate: 185 };
    this._piperConfig = config.piper || {};
    this._enabled = config.enabled === true;
    this._muted = false;
    this._activeProcess = null;
    this._queue = [];
    this._busy = false;
    this._epoch = 0;
    this._onAudioChunk = null;
    this._onTtsEnd = null;

    // Multi-language support
    this._fallbackLang = config.fallbackLang || "en";
    this._currentLang = this._fallbackLang;
    this._speakers = config.speakers || {};
    this._supportedLangs = config.supportedLangs || {};
    this._hasSupportedLangs = Object.keys(this._supportedLangs).length > 0;
    const configuredModelPath = expandPath(this._piperConfig.modelPath || "");
    this._piperModels = discoverPiperModels(config.modelsDir, configuredModelPath);

    if (this._piperModels.size > 0) {
      const langs = Array.from(this._piperModels.entries())
        .map(([lang, info]) => `${lang} (${info.lang}_${info.region}-${info.speaker}-${info.quality})`)
        .join(", ");
      console.log(`[TTS] Piper models discovered: ${langs}`);
      console.log(`[TTS] Fallback language: ${this._fallbackLang}`);
    }
  }

  get isEnabled() { return this._enabled && !this._muted; }

  setCallbacks(onAudioChunk, onTtsEnd) {
    this._onAudioChunk = onAudioChunk;
    this._onTtsEnd = onTtsEnd;
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
    // Resolve effective language per item
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
      if (this._onTtsEnd) this._onTtsEnd();
      return;
    }
    this._busy = true;
    const epoch = this._epoch;
    const item = this._queue.shift();

    if (this._engine === "piper") {
      this._speakPiper(item.text, item.lang, epoch);
    } else {
      this._speakSay(item.text, epoch);
    }
  }

  _speakSay(text, epoch) {
    const voice = this._sayConfig.voice || "Samantha";
    const rate = this._sayConfig.rate || 185;

    // say outputs raw PCM float32 little-endian at 22050 Hz to stdout
    this._activeProcess = spawn("say", [
      "-v", voice,
      "-r", String(rate),
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
      this._processNext();
    });

    this._activeProcess.on("error", () => {
      this._activeProcess = null;
      if (this._epoch !== epoch) return;
      this._processNext();
    });
  }

  _speakPiper(text, lang, epoch) {
    const binaryPath = expandPath(this._piperConfig.binaryPath || "");
    const effectiveLang = lang || this._currentLang;

    if (!binaryPath || !fs.existsSync(binaryPath)) {
      this._speakSay(text);
      return;
    }

    // Resolve model path: check discovered models for item's language, then fallback
    let modelPath = null;
    if (this._piperModels.size > 0) {
      const modelInfo = this._piperModels.get(effectiveLang)
        || this._piperModels.get(this._fallbackLang);
      if (modelInfo) {
        modelPath = modelInfo.modelPath;
      }
    }
    // Fall back to configured modelPath if no discovered models match
    if (!modelPath) {
      modelPath = expandPath(this._piperConfig.modelPath || "");
    }

    if (!modelPath || !fs.existsSync(modelPath)) {
      this._speakSay(text);
      return;
    }

    const tmpFile = path.join(os.tmpdir(), `jarvis-tts-${crypto.randomUUID()}.wav`);
    const args = ["--model", modelPath];

    // Merge per-language piper overrides with global config
    const langEntry = this._supportedLangs[effectiveLang] || {};
    const langPiper = langEntry.piper || {};
    const speakerId = langEntry.speaker ?? this._speakers[effectiveLang] ?? null;
    if (speakerId != null) args.push("--speaker", String(speakerId));

    const effectiveLengthScale = langPiper.lengthScale ?? this._piperConfig.lengthScale;
    const effectiveNoiseScale = langPiper.noiseScale ?? this._piperConfig.noiseScale;
    const effectiveNoiseWScale = langPiper.noiseWScale ?? this._piperConfig.noiseWScale;
    const effectiveSentenceSilence = langPiper.sentenceSilence ?? this._piperConfig.sentenceSilence;

    if (effectiveLengthScale != null) args.push("--length-scale", String(effectiveLengthScale));
    if (effectiveNoiseScale != null) args.push("--noise-scale", String(effectiveNoiseScale));
    if (effectiveNoiseWScale != null) args.push("--noise-w-scale", String(effectiveNoiseWScale));
    if (effectiveSentenceSilence != null) args.push("--sentence-silence", String(effectiveSentenceSilence));
    args.push("--output_file", tmpFile);

    this._activeProcess = spawn(binaryPath, args);
    this._activeProcess.stdin.write(text);
    this._activeProcess.stdin.end();

    this._activeProcess.on("close", (code) => {
      this._activeProcess = null;

      if (this._epoch !== epoch) {
        try { fs.unlinkSync(tmpFile); } catch {}
        return;
      }

      if (code !== 0 || !fs.existsSync(tmpFile)) {
        this._processNext();
        return;
      }

      // Read WAV, skip 44-byte header, convert PCM16 → Float32, send
      try {
        const wavData = fs.readFileSync(tmpFile);
        // Piper outputs PCM16 (16-bit signed integer) — convert to Float32 to match say engine
        const pcm16 = new Int16Array(wavData.buffer, wavData.byteOffset + 44, (wavData.length - 44) / 2);
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768;
        const pcmData = Buffer.from(float32.buffer);
        if (pcmData.length > 0 && this._onAudioChunk) {
          // Send in 8KB chunks
          for (let i = 0; i < pcmData.length; i += 8192) {
            const chunk = pcmData.subarray(i, Math.min(i + 8192, pcmData.length));
            this._onAudioChunk(chunk.toString("base64"), 22050);
          }
        }
      } catch {}

      try { fs.unlinkSync(tmpFile); } catch {}
      this._processNext();
    });

    this._activeProcess.on("error", () => {
      this._activeProcess = null;
      if (this._epoch !== epoch) return;
      this._processNext();
    });
  }

  stop() {
    this._queue = [];
    this._busy = false;
    this._epoch++;
    if (this._activeProcess) {
      try { this._activeProcess.kill("SIGTERM"); } catch {}
      this._activeProcess = null;
    }
  }
}

module.exports = { TTS, extractSentences, stripMarkdown };
