// TTS Service
// Text-to-speech with sequential sentence queue and multiple engine backends
// Returns: service API object

const { nodeFs, config } = ctx;
const { spawn } = require("child_process");

const ttsCfg = config.widgets?.voiceCommand?.tts || {};
const enabled = ttsCfg.enabled === true;

function expandPath(p) {
  if (!p) return "";
  if (p.startsWith("~/") || p === "~") return p.replace("~", require("os").homedir());
  return p;
}

// ── TTSQueue — sequential playback of text chunks ──

class TTSQueue {
  constructor(speakFn) {
    this._q = [];
    this._busy = false;
    this._fn = speakFn; // (text, onDone) => void
  }

  enqueue(text) {
    const clean = text.trim();
    if (!clean) return;
    this._q.push(clean);
    if (!this._busy) this._next();
  }

  _next() {
    if (this._q.length === 0) { this._busy = false; return; }
    this._busy = true;
    this._fn(this._q.shift(), () => this._next());
  }

  stop() {
    this._q = [];
    this._busy = false;
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
  return {
    speak(text, onDone) {
      proc = spawn("say", ["-v", voice, "-r", String(rate), text]);
      proc.on("close", () => { proc = null; onDone(); });
      proc.on("error", () => { proc = null; onDone(); });
    },
    stop() {
      if (proc) { try { proc.kill("SIGTERM"); } catch (e) {} proc = null; }
    },
  };
}

// ── Engine C — piper (neural TTS, optional) ──

function buildPiperArgs(modelPath, piperCfg) {
  const args = ["--model", modelPath];
  if (piperCfg.lengthScale != null) args.push("--length-scale", String(piperCfg.lengthScale));
  if (piperCfg.noiseScale != null) args.push("--noise-scale", String(piperCfg.noiseScale));
  if (piperCfg.noiseWScale != null) args.push("--noise-w-scale", String(piperCfg.noiseWScale));
  if (piperCfg.sentenceSilence != null) args.push("--sentence-silence", String(piperCfg.sentenceSilence));
  if (piperCfg.volume != null) args.push("--volume", String(piperCfg.volume));
  return args;
}

function createPiperEngine(binaryPath, modelPath, piperCfg) {
  let piperProc = null;
  let playerProc = null;
  const baseArgs = buildPiperArgs(modelPath, piperCfg);

  return {
    speak(text, onDone) {
      const tmpFile = `/tmp/jarvis-tts-${Date.now()}.wav`;
      piperProc = spawn(binaryPath, [...baseArgs, "--output_file", tmpFile]);
      piperProc.stdin.write(text);
      piperProc.stdin.end();
      piperProc.on("close", () => {
        piperProc = null;
        playerProc = spawn("afplay", [tmpFile]);
        playerProc.on("close", () => {
          playerProc = null;
          try { require("fs").unlinkSync(tmpFile); } catch {}
          onDone();
        });
        playerProc.on("error", () => { playerProc = null; onDone(); });
      });
      piperProc.on("error", () => { piperProc = null; onDone(); });
    },
    stop() {
      if (playerProc) { try { playerProc.kill("SIGTERM"); } catch (e) {} playerProc = null; }
      if (piperProc) { try { piperProc.kill("SIGTERM"); } catch (e) {} piperProc = null; }
    },
  };
}

// ── Engine selection ──

let engine = null;
let queue = null;
let _muted = false;

if (enabled) {
  const engineType = ttsCfg.engine || "say";

  if (engineType === "piper") {
    const binPath = expandPath(ttsCfg.piper?.binaryPath || "");
    const modelPath = expandPath(ttsCfg.piper?.modelPath || "");
    if (binPath && nodeFs.existsSync(binPath) && modelPath && nodeFs.existsSync(modelPath)) {
      engine = createPiperEngine(binPath, modelPath, ttsCfg.piper || {});
    } else {
      console.warn("[TTSService] piper binary not found, falling back to say");
      engine = createSayEngine(ttsCfg.say?.voice || "Samantha", ttsCfg.say?.rate || 185);
    }
  } else if (engineType === "speechSynthesis") {
    engine = createSpeechSynthesisEngine();
  } else {
    engine = createSayEngine(ttsCfg.say?.voice || "Samantha", ttsCfg.say?.rate || 185);
  }

  queue = new TTSQueue((text, onDone) => engine.speak(text, onDone));
}

// ── Public API ──

return {
  speak(text) {
    if (!enabled || _muted || !queue) return;
    queue.enqueue(text);
  },

  stop() {
    if (queue) queue.stop();
    if (engine) engine.stop();
  },

  mute() {
    _muted = true;
    if (queue) queue.stop();
    if (engine) engine.stop();
  },

  unmute() { _muted = false; },

  cleanup() {
    if (queue) queue.stop();
    if (engine) engine.stop();
    _muted = false;
  },

  get isSpeaking() { return queue?.busy ?? false; },
  get isMuted() { return _muted; },
  get isEnabled() { return enabled; },
};
