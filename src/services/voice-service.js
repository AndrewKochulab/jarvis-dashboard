// Voice Service
// Audio recording via MediaRecorder and transcription via whisper-cpp
// Returns: service object

const { nodeFs, nodePath, config } = ctx;
const { spawn } = require("child_process");

const voiceCfg = config.widgets?.quickCapture?.voice || {};
const voiceLang = voiceCfg.lang || "en";

const whisperSearchPaths = ["/opt/homebrew/bin/whisper-cli", "/usr/local/bin/whisper-cli"];
let whisperPath = voiceCfg.whisperPath || null;
if (!whisperPath) {
  for (const p of whisperSearchPaths) {
    if (nodeFs.existsSync(p)) { whisperPath = p; break; }
  }
}
const whisperModel = voiceCfg.whisperModel || "/opt/homebrew/share/whisper-cpp/ggml-base.en.bin";
const available = voiceCfg.enabled !== false && !!whisperPath && nodeFs.existsSync(whisperModel);

let state = "idle";
let activeStream = null;
let activeRecorder = null;
let recordedChunks = [];
let whisperProcess = null;
const stateListeners = [];

function setState(newState) {
  state = newState;
  for (const cb of stateListeners) { try { cb(state); } catch (e) {} }
}

function buildWav(float32, sampleRate) {
  const len = float32.length;
  const buf = new ArrayBuffer(44 + len * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + len * 2, true);
  w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, len * 2, true);
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return Buffer.from(buf);
}

async function startRecording() {
  if (state !== "idle") return;
  activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recordedChunks = [];
  activeRecorder = new MediaRecorder(activeStream);
  activeRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  activeRecorder.start();
  setState("recording");
}

async function stopAndTranscribe() {
  if (state !== "recording" || !activeRecorder || activeRecorder.state === "inactive") {
    setState("idle");
    return "";
  }

  const chunks = await new Promise((resolve) => {
    activeRecorder.onstop = () => resolve(recordedChunks);
    activeRecorder.stop();
  });
  if (activeStream) { activeStream.getTracks().forEach(t => t.stop()); activeStream = null; }
  activeRecorder = null;

  if (chunks.length === 0) { setState("idle"); return ""; }

  setState("transcribing");

  const blob = new Blob(chunks);
  const arrayBuf = await blob.arrayBuffer();
  const tempCtx = new AudioContext();
  const audioBuf = await tempCtx.decodeAudioData(arrayBuf);
  await tempCtx.close();

  const numSamples = Math.ceil(audioBuf.duration * 16000);
  const offlineCtx = new OfflineAudioContext(1, numSamples, 16000);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuf;
  source.connect(offlineCtx.destination);
  source.start(0);
  const resampled = await offlineCtx.startRendering();
  const float32 = resampled.getChannelData(0);

  const tmpPath = nodePath.join(require("os").tmpdir(), "jarvis-voice-capture.wav");
  nodeFs.writeFileSync(tmpPath, buildWav(float32, 16000));

  return new Promise((resolve, reject) => {
    whisperProcess = spawn(whisperPath, [
      "-m", whisperModel, "-f", tmpPath,
      "--no-timestamps", "-l", voiceLang, "--print-progress", "false",
    ]);

    let result = "";
    whisperProcess.stdout.on("data", (data) => { result += data.toString(); });
    whisperProcess.stderr.on("data", () => {});

    whisperProcess.on("close", (code) => {
      whisperProcess = null;
      try { nodeFs.unlinkSync(tmpPath); } catch (e) {}
      const text = (code === 0 && result.trim())
        ? result.trim().replace(/^\[.*?\]\s*/gm, "").trim()
        : "";
      setState("idle");
      resolve(text);
    });

    whisperProcess.on("error", (err) => {
      whisperProcess = null;
      try { nodeFs.unlinkSync(tmpPath); } catch (e) {}
      setState("idle");
      reject(err);
    });
  });
}

function cancelRecording() {
  if (activeRecorder && activeRecorder.state !== "inactive") {
    try { activeRecorder.stop(); } catch (e) {}
  }
  activeRecorder = null;
  if (activeStream) { activeStream.getTracks().forEach(t => t.stop()); activeStream = null; }
  recordedChunks = [];
  setState("idle");
}

function cleanup() {
  if (activeStream) { activeStream.getTracks().forEach(t => t.stop()); activeStream = null; }
  if (activeRecorder && activeRecorder.state !== "inactive") { try { activeRecorder.stop(); } catch (e) {} }
  activeRecorder = null;
  if (whisperProcess) { try { whisperProcess.kill("SIGTERM"); } catch (e) {} whisperProcess = null; }
  recordedChunks = [];
  setState("idle");
}

return {
  startRecording,
  stopAndTranscribe,
  cancelRecording,
  getState: () => state,
  onStateChange: (cb) => stateListeners.push(cb),
  cleanup,
  isAvailable: available,
};
