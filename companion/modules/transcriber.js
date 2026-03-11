// JARVIS Companion — Whisper-cpp Transcriber
// Wraps whisper-cli for server-side audio transcription.
// Mirrors the spawning pattern from src/services/voice-service.js

const { spawn } = require("child_process");
const fs = require("fs");

class Transcriber {
  constructor(config) {
    this._whisperPath = config.whisperPath || "/opt/homebrew/bin/whisper-cli";
    this._modelPath = config.whisperModel || "/opt/homebrew/share/whisper-cpp/ggml-base.en.bin";
    this._lang = config.whisperLang || "en";
    this._autoDetect = this._lang === "auto";
    this._activeProcess = null;

    // Validate: English-only model cannot auto-detect
    if (this._autoDetect && this._modelPath.includes(".en.")) {
      console.warn("[Transcriber] WARNING: Whisper model appears English-only (.en suffix). Auto-detect disabled. Use ggml-base.bin for multilingual.");
      this._autoDetect = false;
      this._lang = "en";
    }
  }

  get isAvailable() {
    return fs.existsSync(this._whisperPath) && fs.existsSync(this._modelPath);
  }

  transcribe(wavPath) {
    return new Promise((resolve, reject) => {
      if (!this.isAvailable) {
        reject(new Error(`whisper-cli not found at ${this._whisperPath} or model missing at ${this._modelPath}`));
        return;
      }

      this._activeProcess = spawn(this._whisperPath, [
        "-m", this._modelPath,
        "-f", wavPath,
        "--no-timestamps",
        "-l", this._autoDetect ? "auto" : this._lang,


      ]);

      let result = "";
      let errorOutput = "";

      this._activeProcess.stdout.on("data", (data) => {
        result += data.toString();
      });

      this._activeProcess.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      this._activeProcess.on("close", (code) => {
        this._activeProcess = null;
        // Clean up WAV file after transcription
        try { fs.unlinkSync(wavPath); } catch {}

        if (code !== 0) {
          reject(new Error(`whisper-cli exited with code ${code}: ${errorOutput.trim()}`));
          return;
        }

        // Strip whisper timestamp prefixes like [00:00:00.000 --> 00:00:02.000]
        const text = result
          .trim()
          .replace(/^\[.*?\]\s*/gm, "")
          .trim();

        // Parse detected language from stderr when auto-detect is on
        // whisper-cpp outputs: "auto-detected language: en (p = 0.97)"
        let detectedLang = null;
        if (this._autoDetect) {
          const langMatch = errorOutput.match(/auto-detected language:\s*(\w+)/);
          if (langMatch) {
            detectedLang = langMatch[1];
          }
        }

        resolve({ text: text || "", detectedLang });
      });

      this._activeProcess.on("error", (err) => {
        this._activeProcess = null;
        try { fs.unlinkSync(wavPath); } catch {}
        reject(new Error(`whisper-cli error: ${err.message}`));
      });
    });
  }

  cancel() {
    if (this._activeProcess) {
      try { this._activeProcess.kill("SIGTERM"); } catch {}
      this._activeProcess = null;
    }
  }
}

module.exports = Transcriber;
