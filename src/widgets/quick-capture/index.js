// Quick Capture Widget — Orchestrator
// Note capture to inbox folder with optional voice-to-text
// Returns: HTMLElement

const { el, T, config, isNarrow, dv, nodeFs, nodePath, voiceService, addHoverEffect } = ctx;
const captureCfg = config.widgets?.quickCapture || {};
const targetFolder = captureCfg.targetFolder || "Inbox";
const captureTag = captureCfg.tag || "inbox/capture";

function loadSub(rel) {
  const code = nodeFs.readFileSync(
    nodePath.join(ctx._srcDir, "widgets", "quick-capture", rel), "utf8"
  );
  return new Function("ctx", code)(ctx);
}

const { createCaptureInput } = loadSub("ui/capture-input.js");
const { createMicButton } = loadSub("ui/mic-button.js");

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
const captureInput = createCaptureInput("Capture a thought...");
section.appendChild(captureInput.el.input);

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

addHoverEffect(btn, {
  boxShadow: "0 0 20px rgba(124,107,255,0.3), 0 0 40px rgba(124,107,255,0.1)",
  borderColor: T.purple + "88",
  transform: "scale(1.02)",
  background: "rgba(124,107,255,0.1)",
}, {
  boxShadow: "none",
  borderColor: T.purple + "55",
  transform: "scale(1)",
  background: "rgba(124,107,255,0.06)",
});

// Voice mic button
if (voiceService.isAvailable) {
  const micButton = createMicButton(voiceService, (text) => {
    const existing = captureInput.getValue();
    const sep = existing.length > 0 && !existing.endsWith(" ") && !existing.endsWith("\n") ? " " : "";
    captureInput.setValue(existing + sep + text);
    captureInput.el.input.scrollTop = captureInput.el.input.scrollHeight;
  });
  buttonRow.appendChild(micButton.el.btn);

  // Safety-net cleanup
  const cleanupMs = ctx.perf?.cleanupIntervalMs || 5000;
  let cleanupId = setInterval(() => {
    if (!document.contains(section)) {
      voiceService.cleanup();
      clearInterval(cleanupId);
    }
  }, cleanupMs);
  ctx.intervals.push(cleanupId);

  ctx.registerPausable(
    () => {
      cleanupId = setInterval(() => {
        if (!document.contains(section)) {
          voiceService.cleanup();
          clearInterval(cleanupId);
        }
      }, cleanupMs);
      ctx.intervals.push(cleanupId);
    },
    () => { clearInterval(cleanupId); }
  );
}

btn.addEventListener("click", () => {
  if (voiceService.getState() === "recording") {
    voiceService.cancelRecording();
  }
  if (voiceService.getState() === "transcribing") {
    new Notice("Wait for transcription to finish.");
    return;
  }

  const text = captureInput.getValue().trim();
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
    captureInput.clear();
    new Notice(`Captured to ${targetFolder}`);
  } catch (e) {
    new Notice("Capture failed: " + e.message);
  }
});

return section;
