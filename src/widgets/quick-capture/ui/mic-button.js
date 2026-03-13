// Mic Button — Voice recording button with state management
// Returns: { createMicButton }

const { el, T, isNarrow } = ctx;

function createMicButton(voiceService, onText) {
  const micBtn = el("div", {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: isNarrow ? "40px" : "44px",
    minWidth: isNarrow ? "40px" : "44px",
    padding: "10px 0",
    border: `1px solid ${T.accent}55`, borderRadius: "8px",
    background: "rgba(0,212,255,0.08)",
    cursor: "pointer", transition: "all 0.3s ease",
    boxSizing: "border-box",
    touchAction: "none", userSelect: "none",
  });

  const micIcon = el("span", {
    fontSize: "16px", color: T.accent,
    transition: "color 0.3s ease", lineHeight: "1",
  }, "\uD83C\uDF99");
  micBtn.appendChild(micIcon);

  function setMicState(state) {
    if (state === "idle") {
      micBtn.style.borderColor = T.accent + "55";
      micBtn.style.background = "rgba(0,212,255,0.08)";
      micBtn.style.animation = "none";
      micIcon.style.color = T.accent;
      micIcon.textContent = "\uD83C\uDF99";
    } else if (state === "recording") {
      micBtn.style.borderColor = T.accent + "aa";
      micBtn.style.background = "rgba(0,212,255,0.12)";
      micBtn.style.animation = "jarvisMicPulse 1.5s ease-in-out infinite";
      micIcon.style.color = T.accent;
      micIcon.textContent = "\u23F9";
    } else if (state === "transcribing") {
      micBtn.style.borderColor = T.accent + "aa";
      micBtn.style.background = "rgba(0,212,255,0.12)";
      micBtn.style.animation = "jarvisBreathing 2s ease-in-out infinite";
      micIcon.style.color = T.accent;
      micIcon.textContent = "\u231B";
    }
  }

  voiceService.onStateChange(setMicState);

  function handleTranscription() {
    voiceService.stopAndTranscribe()
      .then(text => {
        if (text) onText(text);
      })
      .catch(e => new Notice("Transcription failed: " + e.message, 5000));
  }

  // Long-press + tap support
  let isLongPress = false;
  let longPressTimer = null;

  micBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (voiceService.getState() === "transcribing") return;

    isLongPress = false;
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      isLongPress = true;
      if (voiceService.getState() === "idle") {
        voiceService.startRecording().catch(err => new Notice("Recording failed: " + err.message, 5000));
      }
    }, 300);
  });

  micBtn.addEventListener("pointerup", (e) => {
    e.preventDefault();
    if (voiceService.getState() === "transcribing") return;

    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
      // Tap: toggle
      if (voiceService.getState() === "idle") {
        voiceService.startRecording().catch(err => new Notice("Recording failed: " + err.message, 5000));
      } else if (voiceService.getState() === "recording") {
        handleTranscription();
      }
    } else if (isLongPress) {
      isLongPress = false;
      if (voiceService.getState() === "recording") {
        handleTranscription();
      }
    }
  });

  micBtn.addEventListener("pointerleave", () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (isLongPress && voiceService.getState() === "recording") {
      isLongPress = false;
      handleTranscription();
    }
    isLongPress = false;
  });

  // Hover effects
  micBtn.addEventListener("mouseenter", () => {
    if (voiceService.getState() === "idle") {
      micBtn.style.borderColor = T.accent + "88";
      micBtn.style.background = "rgba(0,212,255,0.15)";
      micBtn.style.boxShadow = "0 0 12px rgba(0,212,255,0.2)";
    }
  });
  micBtn.addEventListener("mouseleave", () => {
    if (voiceService.getState() === "idle") {
      micBtn.style.borderColor = T.accent + "55";
      micBtn.style.background = "rgba(0,212,255,0.08)";
      micBtn.style.boxShadow = "none";
    }
  });

  function cleanup() {
    voiceService.cleanup();
  }

  return { el: { btn: micBtn }, setInputBorderColor: null, cleanup };
}

return { createMicButton };
