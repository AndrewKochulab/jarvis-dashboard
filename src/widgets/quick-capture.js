// Quick Capture Widget
// Note capture to inbox folder with optional voice-to-text
// Returns: HTMLElement

const { el, T, config, isNarrow, dv, nodeFs, nodePath, voiceService } = ctx;
const captureCfg = config.widgets?.quickCapture || {};
const targetFolder = captureCfg.targetFolder || "NoteLab";
const captureTag = captureCfg.tag || "notelab/capture";

const section = el("div", {
  background: T.panelBg, border: `1px solid ${T.panelBorder}`,
  borderRadius: "12px", padding: isNarrow ? "16px 14px" : "20px 24px",
  position: "relative", overflow: "hidden",
  animation: "jarvisCardFadeIn 0.5s ease-out 0.35s both",
  display: "flex", flexDirection: "column",
});

section.appendChild(el("div", {
  position: "absolute", top: "0", left: "0", right: "0", height: "2px",
  background: `linear-gradient(90deg, transparent, ${T.purple}, transparent)`,
}));

// Title with count
const titleRow = el("div", {
  fontSize: "11px", fontWeight: "700", letterSpacing: "2px",
  textTransform: "uppercase", color: T.textMuted,
  marginBottom: "14px", marginTop: "4px",
  display: "flex", alignItems: "center", justifyContent: "space-between",
});
titleRow.appendChild(el("span", {}, "Quick Capture"));

let noteCount = 0;
try { noteCount = dv.pages(`"${targetFolder}"`).length; } catch {}

titleRow.appendChild(el("span", {
  fontSize: "9px", fontWeight: "600", color: T.purple,
  background: "rgba(124,107,255,0.1)",
  padding: "2px 8px", borderRadius: "8px", letterSpacing: "1px",
}, `${noteCount} IN ${targetFolder.toUpperCase()}`));
section.appendChild(titleRow);

// Textarea
const input = document.createElement("textarea");
Object.assign(input.style, {
  width: "100%", minHeight: isNarrow ? "80px" : "100px", flex: "1",
  background: "rgba(0,0,0,0.3)", border: `1px solid ${T.panelBorder}`,
  borderRadius: "8px", padding: "12px", color: T.text,
  fontFamily: "'Inter', -apple-system, sans-serif",
  fontSize: "13px", lineHeight: "1.6", resize: "vertical",
  outline: "none", boxSizing: "border-box", transition: "border-color 0.3s",
});
input.placeholder = "Capture a thought...";
input.addEventListener("focus", () => { input.style.borderColor = T.purple + "66"; });
input.addEventListener("blur", () => { input.style.borderColor = T.panelBorder; });
section.appendChild(input);

// Button row
const buttonRow = el("div", {
  display: "flex", gap: "8px", marginTop: "12px", alignItems: "stretch",
});
section.appendChild(buttonRow);

const btn = el("div", {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  gap: "8px", padding: "10px 20px",
  border: `1px solid ${T.purple}55`, borderRadius: "8px",
  background: "rgba(124,107,255,0.06)",
  cursor: "pointer", transition: "all 0.3s ease",
  flex: "1", boxSizing: "border-box",
});
btn.appendChild(el("span", { fontSize: "14px", color: T.purple }, "\u2726"));
btn.appendChild(el("span", {
  fontSize: "11px", fontWeight: "700", letterSpacing: "2px",
  textTransform: "uppercase", color: T.purple,
  fontFamily: "'SF Mono', 'Fira Code', monospace",
}, "Capture"));
buttonRow.appendChild(btn);

btn.addEventListener("mouseenter", () => {
  btn.style.boxShadow = "0 0 20px rgba(124,107,255,0.3), 0 0 40px rgba(124,107,255,0.1)";
  btn.style.borderColor = T.purple + "88";
  btn.style.transform = "scale(1.02)";
  btn.style.background = "rgba(124,107,255,0.1)";
});
btn.addEventListener("mouseleave", () => {
  btn.style.boxShadow = "none";
  btn.style.borderColor = T.purple + "55";
  btn.style.transform = "scale(1)";
  btn.style.background = "rgba(124,107,255,0.06)";
});

// Voice mic button
if (voiceService.isAvailable) {
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
  buttonRow.appendChild(micBtn);

  function setMicState(state) {
    if (state === "idle") {
      micBtn.style.borderColor = T.accent + "55";
      micBtn.style.background = "rgba(0,212,255,0.08)";
      micBtn.style.animation = "none";
      micIcon.style.color = T.accent;
      micIcon.textContent = "\uD83C\uDF99";
      input.style.borderColor = T.panelBorder;
    } else if (state === "recording") {
      micBtn.style.borderColor = T.accent + "aa";
      micBtn.style.background = "rgba(0,212,255,0.12)";
      micBtn.style.animation = "jarvisMicPulse 1.5s ease-in-out infinite";
      micIcon.style.color = T.accent;
      micIcon.textContent = "\u23F9";
      input.style.borderColor = T.accent + "44";
    } else if (state === "transcribing") {
      micBtn.style.borderColor = T.accent + "aa";
      micBtn.style.background = "rgba(0,212,255,0.12)";
      micBtn.style.animation = "jarvisBreathing 2s ease-in-out infinite";
      micIcon.style.color = T.accent;
      micIcon.textContent = "\u231B";
      input.style.borderColor = T.accent + "44";
    }
  }

  voiceService.onStateChange(setMicState);

  function handleTranscription() {
    voiceService.stopAndTranscribe()
      .then(text => {
        if (text) {
          const existing = input.value;
          const sep = existing.length > 0 && !existing.endsWith(" ") && !existing.endsWith("\n") ? " " : "";
          input.value = existing + sep + text;
          input.scrollTop = input.scrollHeight;
        }
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

  // Safety-net cleanup
  const cleanupId = setInterval(() => {
    if (!document.contains(section)) {
      voiceService.cleanup();
      clearInterval(cleanupId);
    }
  }, 1000);
  ctx.intervals.push(cleanupId);
}

btn.addEventListener("click", () => {
  if (voiceService.getState() === "recording") {
    voiceService.cancelRecording();
  }
  if (voiceService.getState() === "transcribing") {
    new Notice("Wait for transcription to finish.");
    return;
  }

  const text = input.value.trim();
  if (!text) { new Notice("Nothing to capture \u2014 type something first."); return; }
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0");
  const fileName = `Quick Capture ${dateStr} ${timeStr}.md`;
  const vaultBase = app.vault.adapter.basePath;
  const filePath = nodePath.join(vaultBase, targetFolder, fileName);
  const content = `---\ntags:\n  - ${captureTag}\ndate: ${dateStr}\n---\n\n${text}\n`;
  try {
    nodeFs.writeFileSync(filePath, content);
    input.value = "";
    new Notice(`Captured to ${targetFolder}`);
  } catch (e) {
    new Notice("Capture failed: " + e.message);
  }
});

return section;
