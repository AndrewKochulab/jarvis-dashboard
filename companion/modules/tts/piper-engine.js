// JARVIS Companion — Piper TTS Engine
// Synthesizes speech via piper binary with multi-language model discovery.

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { expandPath } = require("../utils");
const BaseTTSEngine = require("./base-engine");

class PiperEngine extends BaseTTSEngine {
  constructor(config) {
    super();
    this._binaryPath = expandPath(config.binaryPath || "");
    this._piperConfig = config.piper || {};
    this._fallbackLang = config.fallbackLang || "en";
    this._supportedLangs = config.supportedLangs || {};
    this._speakers = config.speakers || {};
    this._piperModels = this._discoverModels(config.modelsDir, expandPath(this._piperConfig.modelPath || ""));
  }

  get modelsCount() { return this._piperModels.size; }

  getModelInfo() {
    return Array.from(this._piperModels.entries())
      .map(([lang, info]) => `${lang} (${info.lang}_${info.region}-${info.speaker}-${info.quality})`)
      .join(", ");
  }

  _discoverModels(modelsDir, preferredModelPath) {
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
        const existing = models.get(lang);
        if ((qualityOrder[quality] || 0) > (qualityOrder[existing.quality] || 0)) {
          models.set(lang, { modelPath, lang, region, speaker, quality });
        }
      }
    }

    // Override with user's preferred model
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

  speak(text, lang, epoch) {
    const effectiveLang = lang || this._fallbackLang;

    if (!this._binaryPath || !fs.existsSync(this._binaryPath)) {
      if (this._onComplete) this._onComplete({ success: false });
      return;
    }

    // Resolve model path
    let modelPath = null;
    if (this._piperModels.size > 0) {
      const modelInfo = this._piperModels.get(effectiveLang)
        || this._piperModels.get(this._fallbackLang);
      if (modelInfo) modelPath = modelInfo.modelPath;
    }
    if (!modelPath) modelPath = expandPath(this._piperConfig.modelPath || "");

    if (!modelPath || !fs.existsSync(modelPath)) {
      if (this._onComplete) this._onComplete({ success: false });
      return;
    }

    const tmpFile = path.join(os.tmpdir(), `jarvis-tts-${crypto.randomUUID()}.wav`);
    const args = ["--model", modelPath];

    // Per-language piper overrides
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

    this._activeProcess = spawn(this._binaryPath, args);
    this._activeProcess.stdin.write(text);
    this._activeProcess.stdin.end();

    this._activeProcess.on("close", (code) => {
      this._activeProcess = null;

      if (this._epoch !== epoch) {
        try { fs.unlinkSync(tmpFile); } catch {}
        return;
      }

      if (code !== 0 || !fs.existsSync(tmpFile)) {
        if (this._onComplete) this._onComplete({ success: false });
        return;
      }

      // Read WAV, skip 44-byte header, convert PCM16 → Float32
      try {
        const wavData = fs.readFileSync(tmpFile);
        const pcm16 = new Int16Array(wavData.buffer, wavData.byteOffset + 44, (wavData.length - 44) / 2);
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768;
        const pcmData = Buffer.from(float32.buffer);
        if (pcmData.length > 0 && this._onAudioChunk) {
          for (let i = 0; i < pcmData.length; i += 8192) {
            const chunk = pcmData.subarray(i, Math.min(i + 8192, pcmData.length));
            this._onAudioChunk(chunk.toString("base64"), 22050);
          }
        }
      } catch {}

      try { fs.unlinkSync(tmpFile); } catch {}
      if (this._onComplete) this._onComplete({ success: true });
    });

    this._activeProcess.on("error", () => {
      this._activeProcess = null;
      if (this._epoch !== epoch) return;
      if (this._onComplete) this._onComplete({ success: false });
    });
  }
}

module.exports = PiperEngine;
