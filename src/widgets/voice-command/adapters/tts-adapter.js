// Voice Command — TTS adapter
// Desktop local: wraps ctx.ttsService (Piper)
// Desktop remote (local TTS): wraps ctx.ttsService + AudioPlayer for server PCM
// Mobile local: MobileTTS (Web SpeechSynthesis)
// Mobile/Desktop server: AudioPlayer (WebAudio PCM)
// Includes sentence extraction logic.

function createTTSAdapter(options) {
  const { mode, ttsService, ttsMode } = options;

  // ── AudioPlayer (server PCM via WebAudio) ──
  class AudioPlayer {
    constructor(sampleRate = 22050) {
      this._ctx = null;
      this._queue = [];
      this._playing = false;
      this._sampleRate = sampleRate;
      this._muted = false;
    }

    _ensureContext() {
      if (!this._ctx) this._ctx = new AudioContext({ sampleRate: this._sampleRate });
      if (this._ctx.state === "suspended") this._ctx.resume().catch(() => {});
    }

    enqueueChunk(base64Pcm, sampleRate) {
      if (this._muted) return;
      this._ensureContext();
      const binary = atob(base64Pcm);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const float32 = new Float32Array(bytes.buffer);
      const buffer = this._ctx.createBuffer(1, float32.length, sampleRate ?? this._sampleRate);
      buffer.copyToChannel(float32, 0);
      this._queue.push(buffer);
      if (!this._playing) this._playNext();
    }

    _playNext() {
      if (this._queue.length === 0) { this._playing = false; return; }
      this._playing = true;
      const buffer = this._queue.shift();
      const source = this._ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this._ctx.destination);
      source.onended = () => this._playNext();
      source.start();
    }

    stop() {
      this._queue = [];
      this._playing = false;
      if (this._ctx) { this._ctx.close().catch(() => {}); this._ctx = null; }
    }

    mute() { this._muted = true; this.stop(); }
    unmute() { this._muted = false; }
    get isMuted() { return this._muted; }
    get isSpeaking() { return this._playing; }

    resumeContext() {
      if (this._ctx?.state === "suspended") this._ctx.resume().catch(() => {});
    }
  }

  // ── MobileTTS (Web SpeechSynthesis) ──
  class MobileTTS {
    constructor() {
      this._muted = false;
      this._speaking = false;
      this._queue = [];
    }

    speak(text, lang) {
      if (this._muted || !text?.trim()) return;
      if (!window.speechSynthesis) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      if (lang) utterance.lang = lang;
      utterance.onstart = () => { this._speaking = true; };
      utterance.onend = () => {
        this._speaking = false;
        if (this._queue.length > 0) {
          const next = this._queue.shift();
          this.speak(next.text, next.lang);
        }
      };
      utterance.onerror = () => { this._speaking = false; };

      if (this._speaking) {
        this._queue.push({ text, lang });
      } else {
        window.speechSynthesis.speak(utterance);
      }
    }

    stop() {
      this._queue = [];
      this._speaking = false;
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    }

    mute() { this._muted = true; this.stop(); }
    unmute() { this._muted = false; }
    get isMuted() { return this._muted; }
    get isSpeaking() { return this._speaking; }
    get isEnabled() { return !!window.speechSynthesis; }
  }

  // ── Build the appropriate adapter ──
  // On mobile, TTS is always server-side (companion server sends tts_audio).
  // Never create local SpeechSynthesis on mobile to avoid double-speaking.
  const effectiveTtsMode = (mode === "mobile") ? "server" : ttsMode;

  let _speakFn, _stopFn, _muteFn, _unmuteFn, _isMutedFn, _isSpeakingFn, _isEnabledFn, _cleanupFn;
  let _audioPlayer = null;
  let _mobileTts = null;

  if (mode === "local" && ttsService) {
    // Desktop local: wrap Piper TTS service
    _speakFn = (text, lang) => ttsService.speak(text, lang);
    _stopFn = () => ttsService.stop();
    _muteFn = () => ttsService.mute();
    _unmuteFn = () => ttsService.unmute();
    _isMutedFn = () => ttsService.isMuted;
    _isSpeakingFn = () => ttsService.isSpeaking;
    _isEnabledFn = () => ttsService.isEnabled;
    _cleanupFn = () => {};

    // Also create AudioPlayer for server PCM if in remote mode with local TTS
    if (ttsMode === "local") {
      _audioPlayer = new AudioPlayer();
    }
  } else if (effectiveTtsMode === "server") {
    // Server TTS: use AudioPlayer only
    _audioPlayer = new AudioPlayer();
    _speakFn = () => {}; // Server pushes audio
    _stopFn = () => _audioPlayer.stop();
    _muteFn = () => _audioPlayer.mute();
    _unmuteFn = () => _audioPlayer.unmute();
    _isMutedFn = () => _audioPlayer.isMuted;
    _isSpeakingFn = () => _audioPlayer.isSpeaking;
    _isEnabledFn = () => true;
    _cleanupFn = () => _audioPlayer.stop();
  } else {
    // Mobile / fallback: Web SpeechSynthesis + AudioPlayer for server audio
    _mobileTts = new MobileTTS();
    _audioPlayer = new AudioPlayer();
    _speakFn = (text, lang) => _mobileTts.speak(text, lang);
    _stopFn = () => { _mobileTts.stop(); _audioPlayer.stop(); };
    _muteFn = () => { _mobileTts.mute(); _audioPlayer.mute(); };
    _unmuteFn = () => { _mobileTts.unmute(); _audioPlayer.unmute(); };
    _isMutedFn = () => _mobileTts.isMuted;
    _isSpeakingFn = () => _mobileTts.isSpeaking || _audioPlayer.isSpeaking;
    _isEnabledFn = () => _mobileTts.isEnabled;
    _cleanupFn = () => { _mobileTts.stop(); _audioPlayer.stop(); };
  }

  return {
    speak: _speakFn,
    stop: _stopFn,
    mute: _muteFn,
    unmute: _unmuteFn,
    toggleMute() {
      if (_isMutedFn()) _unmuteFn();
      else _muteFn();
      return _isMutedFn();
    },
    get isMuted() { return _isMutedFn(); },
    get isSpeaking() { return _isSpeakingFn(); },
    get isEnabled() { return _isEnabledFn(); },

    enqueueServerAudio(base64, sampleRate) {
      // Stop any local speech when server audio arrives to prevent double-speaking
      if (_mobileTts) _mobileTts.stop();
      if (_audioPlayer) _audioPlayer.enqueueChunk(base64, sampleRate);
    },

    resumeAudioContext() {
      if (_audioPlayer) _audioPlayer.resumeContext();
    },

    cleanup() { _cleanupFn(); },
  };
}

return { createTTSAdapter };
