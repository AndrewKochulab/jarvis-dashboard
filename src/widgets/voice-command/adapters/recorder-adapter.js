// Voice Command — Recorder adapter
// Desktop local: wraps ctx.voiceService
// Desktop remote + Mobile: MediaRecorder → WebSocket binary streaming

function createRecorder(options) {
  const { mode, voiceService, networkClient, getCurrentSessionId, getProjectPath } = options;

  // ── Local desktop recording (via voiceService / Whisper) ──
  if (mode === "local" && voiceService) {
    return {
      get isRecording() { return voiceService.getState() === "recording"; },
      async start() { return voiceService.startRecording(); },
      async stopAndTranscribe() { return voiceService.stopAndTranscribe(); },
      stop() {},
      cancel() { voiceService.cancelRecording(); },
      onStateChange(cb) { voiceService.onStateChange(cb); },
      cleanup() {},
    };
  }

  // ── Remote / Mobile recording (MediaRecorder → WebSocket) ──
  let _stream = null;
  let _recorder = null;
  let _recording = false;
  let _format = "webm";

  return {
    get isRecording() { return _recording; },
    get format() { return _format; },

    async start() {
      _stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
      });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/mp4";
      _format = mimeType.includes("mp4") ? "mp4" : "webm";
      _recorder = new MediaRecorder(_stream, { mimeType });
      _recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && networkClient?.isConnected) {
          e.data.arrayBuffer().then((buf) => {
            networkClient.sendBinary(new Uint8Array(buf));
          });
        }
      };
      const sessionId = getCurrentSessionId ? getCurrentSessionId() : null;
      const projectPath = getProjectPath ? getProjectPath() : null;
      networkClient.sendAudioStart(_format, 44100, sessionId, projectPath);
      _recorder.start(250);
      _recording = true;
    },

    stop() {
      if (_recorder && _recorder.state !== "inactive") _recorder.stop();
      if (_stream) { _stream.getTracks().forEach((t) => t.stop()); _stream = null; }
      _recording = false;
      networkClient.sendAudioEnd();
    },

    cancel() {
      _recording = false;
      if (_recorder && _recorder.state !== "inactive") {
        try { _recorder.stop(); } catch {}
      }
      if (_stream) { _stream.getTracks().forEach((t) => t.stop()); _stream = null; }
      networkClient.sendCancel();
    },

    onStateChange() {},
    cleanup() {
      if (_recording) this.cancel();
    },
  };
}

return { createRecorder };
