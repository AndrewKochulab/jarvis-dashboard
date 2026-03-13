// Voice Command — Terminal output panel
// Header bar with close, title, project tag, status badge, TTS mute, copy button.
// Output area with helpers for appending text, separators, stream blocks.

const { el, T, config, isNarrow } = ctx;
const animationsEnabled = ctx.animationsEnabled !== false;
const animOrNone = (s) => animationsEnabled ? s : "none";
const cmdCfg = config.widgets?.voiceCommand || {};
const termCfg = cmdCfg.terminal || {};

const showCommand = termCfg.showCommand !== false;
const termTitle = termCfg.title || "JARVIS OUTPUT";
const showProjectTag = termCfg.showProjectTag !== false;
const showStatusBadge = termCfg.showStatusBadge !== false;
const showCopyButton = termCfg.showCopyButton !== false;
const showCompletionLabel = termCfg.showCompletionLabel !== false;
const completionLabel = termCfg.completionLabel || "Process complete";
const showToolUseLabels = termCfg.showToolUseLabels !== false;

const SVG_SPEAKER_ON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
const SVG_SPEAKER_OFF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';

function createTerminalPanel(options) {
  const { onClose, getTtsService, getFullText, onMuteToggle } = options || {};

  // ── Panel ──
  const panel = el("div", {
    display: "none",
    marginTop: "16px",
    width: "100%",
    maxWidth: isNarrow ? "100%" : "600px",
    background: T.panelBg,
    border: `1px solid ${T.panelBorder}`,
    borderRadius: "12px",
    overflow: "hidden",
  });

  // ── Header bar ──
  const header = el("div", {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: isNarrow ? "8px 12px" : "10px 16px",
    background: "rgba(0,0,0,0.3)",
    borderBottom: `1px solid ${T.panelBorder}`,
    flexWrap: "nowrap",
    overflow: "hidden",
  });
  panel.appendChild(header);

  // Close button
  const closeBtn = el("span", {
    fontSize: "14px",
    color: T.textMuted,
    cursor: "pointer",
    padding: "2px 6px",
    borderRadius: "4px",
    transition: "all 0.2s ease",
    lineHeight: "1",
  }, "\u2715");
  closeBtn.addEventListener("mouseenter", () => {
    closeBtn.style.color = T.red;
    closeBtn.style.background = "rgba(231,76,60,0.15)";
  });
  closeBtn.addEventListener("mouseleave", () => {
    closeBtn.style.color = T.textMuted;
    closeBtn.style.background = "transparent";
  });
  closeBtn.addEventListener("click", () => { if (onClose) onClose(); });
  header.appendChild(closeBtn);

  // Title
  header.appendChild(el("span", {
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "2px",
    textTransform: "uppercase",
    color: T.textMuted,
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    whiteSpace: "nowrap",
    flexShrink: "0",
  }, termTitle));

  // Spacer
  header.appendChild(el("div", { flex: "1" }));

  // Project tag
  const projectTagIcon = el("span", { fontSize: "11px", lineHeight: "1" });
  const projectTagLabel = el("span", {});
  const projectTag = el("span", {
    display: showProjectTag ? "inline-flex" : "none",
    alignItems: "center",
    gap: "4px",
    fontSize: "10px",
    fontWeight: "600",
    letterSpacing: "0.5px",
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    padding: "2px 8px",
    borderRadius: "6px",
    marginRight: "8px",
    transition: "all 0.2s ease",
  });
  projectTag.appendChild(projectTagIcon);
  projectTag.appendChild(projectTagLabel);
  header.appendChild(projectTag);

  // Status badge (hidden on narrow/mobile since native badge covers it)
  const badgeDot = el("span", {
    display: "inline-block",
    width: "6px", height: "6px",
    borderRadius: "50%",
    background: T.textMuted,
    marginRight: "6px",
    transition: "background 0.3s ease",
  });
  const badgeLabel = el("span", {}, "jarvis");
  const statusBadge = el("span", {
    display: (showStatusBadge && !isNarrow) ? "inline-flex" : "none",
    alignItems: "center",
    fontSize: "10px",
    fontWeight: "600",
    letterSpacing: "1px",
    color: T.textMuted,
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    padding: "2px 8px",
    borderRadius: "8px",
    background: "rgba(0,0,0,0.3)",
    marginRight: "8px",
  });
  statusBadge.appendChild(badgeDot);
  statusBadge.appendChild(badgeLabel);
  header.appendChild(statusBadge);

  // Mute button
  const muteBtn = el("span", {
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: "6px",
    transition: "all 0.2s ease",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    color: T.accent,
    marginRight: "4px",
  });
  muteBtn.innerHTML = SVG_SPEAKER_ON;
  muteBtn.addEventListener("click", () => { if (onMuteToggle) onMuteToggle(); });
  muteBtn.addEventListener("mouseenter", () => { muteBtn.style.background = "rgba(0,212,255,0.1)"; });
  muteBtn.addEventListener("mouseleave", () => { muteBtn.style.background = "transparent"; });
  header.appendChild(muteBtn);

  // Copy button
  const copyBtnLabel = el("span", {}, "Copy");
  const copyBtn = el("span", {
    fontSize: "10px",
    fontWeight: "600",
    letterSpacing: "1px",
    color: T.accent,
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    padding: "4px 10px",
    borderRadius: "6px",
    border: `1px solid ${T.accent}44`,
    cursor: "pointer",
    transition: "all 0.2s ease",
  });
  copyBtn.appendChild(copyBtnLabel);
  copyBtn.style.display = showCopyButton ? "inline" : "none";
  copyBtn.addEventListener("mouseenter", () => {
    copyBtn.style.background = "rgba(0,212,255,0.1)";
    copyBtn.style.borderColor = T.accent + "77";
  });
  copyBtn.addEventListener("mouseleave", () => {
    copyBtn.style.background = "transparent";
    copyBtn.style.borderColor = T.accent + "44";
  });
  copyBtn.addEventListener("click", () => {
    const text = getFullText ? getFullText() : "";
    navigator.clipboard.writeText(text).then(() => {
      copyBtnLabel.textContent = "Copied!";
      copyBtn.style.borderColor = T.green + "66";
      copyBtn.style.color = T.green;
      setTimeout(() => {
        copyBtnLabel.textContent = "Copy";
        copyBtn.style.borderColor = T.accent + "44";
        copyBtn.style.color = T.accent;
      }, 1500);
    });
  });
  header.appendChild(copyBtn);

  // ── Output area ──
  const outputArea = el("div", {
    padding: isNarrow ? "12px 14px" : "16px 20px",
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    fontSize: isNarrow ? "12px" : "14px",
    lineHeight: "2",
    color: T.text,
    maxHeight: "420px",
    overflowY: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  });
  panel.appendChild(outputArea);

  // ── API ──
  function show() {
    panel.style.display = "block";
    panel.offsetHeight;
    panel.style.animation = "jarvisTerminalSlideIn 280ms ease-out forwards";
  }

  function hide(keepContent) {
    panel.style.animation = "jarvisTerminalSlideOut 220ms ease-in forwards";
    setTimeout(() => {
      panel.style.display = "none";
      panel.style.animation = "";
      if (!keepContent) {
        outputArea.innerHTML = "";
      }
    }, 220);
  }

  function isVisible() { return panel.style.display !== "none"; }

  function appendText(text, type) {
    const color = type === "error" ? T.red : type === "muted" ? T.textMuted : T.text;
    outputArea.appendChild(el("span", { color }, text));
    outputArea.scrollTop = outputArea.scrollHeight;
  }

  function appendTurnSeparator() {
    outputArea.appendChild(el("div", {
      height: "1px",
      borderTop: `1px dashed ${T.accent}33`,
      margin: "12px 0",
    }));
  }

  function createStreamOutputBlock() {
    const outputContent = el("div", { color: T.text });
    outputArea.appendChild(outputContent);
    const cursorEl = el("span", {
      display: "inline-block",
      width: "8px",
      height: isNarrow ? "14px" : "16px",
      background: T.accent,
      animation: "jarvisCursorBlink 0.8s step-end infinite",
      verticalAlign: "middle",
      marginLeft: "2px",
    });
    outputArea.appendChild(cursorEl);
    return { outputContent, cursorEl };
  }

  function finalizeCurrentBlock(streamRenderer, cursorEl, turnBuffer) {
    if (streamRenderer) streamRenderer.finalize();
    if (cursorEl?.parentNode) cursorEl.parentNode.removeChild(cursorEl);
    if (showCompletionLabel) {
      outputArea.appendChild(el("div", {
        color: T.accent, opacity: "0.6", marginTop: "8px",
        fontSize: isNarrow ? "10px" : "11px", letterSpacing: "1px",
      }, `[${completionLabel}]`));
    }
    outputArea.scrollTop = outputArea.scrollHeight;
  }

  function appendCompletionLine(code) {
    if (showCompletionLabel || code !== 0) {
      outputArea.appendChild(el("div", {
        color: code === 0 ? T.accent : T.red,
        opacity: code === 0 ? "0.6" : "1",
        marginTop: "8px",
        fontSize: isNarrow ? "10px" : "11px",
        letterSpacing: "1px",
      }, code === 0 ? `[${completionLabel}]` : `[Process exited with code ${code}]`));
    }
    outputArea.scrollTop = outputArea.scrollHeight;
  }

  function appendEchoLine(text, isResume, sessionId) {
    const echoLine = el("div", { marginBottom: "4px", wordBreak: "break-word", whiteSpace: "pre-wrap" });
    echoLine.appendChild(el("span", { color: T.green }, "$ "));
    if (showCommand) {
      const cmdText = isResume
        ? `claude --resume ${(sessionId || "???").slice(0, 7)}\u2026 ${text}`
        : `claude --print ${text}`;
      echoLine.appendChild(el("span", { color: T.textMuted }, cmdText));
    } else {
      echoLine.appendChild(el("span", { color: T.textMuted }, text));
    }
    outputArea.appendChild(echoLine);
    outputArea.appendChild(el("div", {
      height: "1px", background: `${T.accent}33`, margin: "8px 0",
    }));
    return echoLine;
  }

  function appendCancelLine() {
    outputArea.appendChild(el("div", {
      color: T.accent, opacity: "0.6", marginTop: "8px",
      fontSize: isNarrow ? "10px" : "11px", letterSpacing: "1px",
    }, "[Cancelled]"));
  }

  function appendErrorLine(stage, message) {
    outputArea.appendChild(el("div", { color: T.red, marginTop: "8px" },
      `[Error: ${stage || "unknown"} \u2014 ${message || "Unknown error"}]`));
  }

  function clear() { outputArea.innerHTML = ""; }

  function setProjectTag(icon, label, color) {
    projectTagIcon.textContent = icon;
    projectTagLabel.textContent = label;
    projectTag.style.color = color;
    projectTag.style.borderColor = color + "44";
    projectTag.style.border = `1px solid ${color}44`;
    projectTag.style.background = color + "12";
  }

  function setBadgeState(state) {
    if (state === "running") {
      badgeDot.style.background = T.green;
      badgeDot.style.animation = animOrNone("jarvisPulse 2s ease-in-out infinite");
      badgeLabel.textContent = "jarvis";
      statusBadge.style.color = T.green;
    } else if (state === "success") {
      badgeDot.style.background = T.green;
      badgeDot.style.animation = "none";
      badgeLabel.textContent = "\u2713 jarvis";
      statusBadge.style.color = T.green;
    } else if (state === "error") {
      badgeDot.style.background = T.red;
      badgeDot.style.animation = "none";
      badgeLabel.textContent = "\u2717 jarvis";
      statusBadge.style.color = T.red;
    } else {
      badgeDot.style.background = T.textMuted;
      badgeDot.style.animation = "none";
      badgeLabel.textContent = "jarvis";
      statusBadge.style.color = T.textMuted;
    }
  }

  function setMuteState(muted) {
    muteBtn.innerHTML = muted ? SVG_SPEAKER_OFF : SVG_SPEAKER_ON;
    muteBtn.style.color = muted ? T.textMuted : T.accent;
  }

  function setMuteVisible(visible) {
    muteBtn.style.display = visible ? "inline-flex" : "none";
  }

  function addMessageCopyIcon(container, getText) {
    const icon = el("span", {
      position: "absolute", top: "2px", right: "2px",
      fontSize: "10px", color: T.textMuted, cursor: "pointer",
      opacity: "0", transition: "opacity 0.2s",
      padding: "2px 5px", borderRadius: "3px",
      background: "rgba(0,0,0,0.4)",
    }, "copy");
    icon.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(getText()).then(() => {
        icon.textContent = "\u2713";
        icon.style.color = T.green;
        setTimeout(() => { icon.textContent = "copy"; icon.style.color = T.textMuted; }, 1200);
      });
    });
    container.style.position = "relative";
    container.addEventListener("mouseenter", () => { icon.style.opacity = "0.7"; });
    container.addEventListener("mouseleave", () => { icon.style.opacity = "0"; });
    container.appendChild(icon);
  }

  function appendToolUseLabel(toolName) {
    if (!showToolUseLabels) return;
    const infoLine = el("div", {
      color: T.gold, fontSize: "10px", opacity: "0.7",
      marginTop: "4px", letterSpacing: "0.5px",
    }, `\u26A1 ${toolName}`);
    outputArea.appendChild(infoLine);
    outputArea.scrollTop = outputArea.scrollHeight;
    return infoLine;
  }

  function getOutputArea() { return outputArea; }

  return {
    show, hide, isVisible,
    appendText, appendTurnSeparator, appendEchoLine,
    appendCancelLine, appendErrorLine, appendCompletionLine,
    createStreamOutputBlock, finalizeCurrentBlock,
    clear, setProjectTag, setBadgeState,
    setMuteState, setMuteVisible, addMessageCopyIcon,
    appendToolUseLabel, getOutputArea,
    showCommand, showCompletionLabel, completionLabel,
    showToolUseLabels, showStatusLabels: termCfg.showStatusLabels !== false,
    el: { panel, outputArea, header, closeBtn, muteBtn },
  };
}

return { createTerminalPanel };
