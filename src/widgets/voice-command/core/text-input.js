// Voice Command — Text input row
// Textarea + send button with auto-resize.

const { el, T, isNarrow } = ctx;

const SVG_SEND = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

function createTextInput() {
  const textarea = document.createElement("textarea");
  textarea.rows = 1;
  textarea.placeholder = "Type a command...";
  Object.assign(textarea.style, {
    flex: "1",
    background: T.panelBg,
    border: `1px solid ${T.panelBorder}`,
    borderRadius: "8px",
    padding: isNarrow ? "8px 12px" : "10px 14px",
    color: T.text,
    fontSize: isNarrow ? "12px" : "13px",
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    outline: "none",
    transition: "border-color 0.2s ease",
    resize: "none",
    overflow: "hidden",
    lineHeight: "1.4",
    minHeight: isNarrow ? "34px" : "38px",
    maxHeight: "120px",
  });

  function autoResize() {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
    textarea.style.overflow = textarea.scrollHeight > 120 ? "auto" : "hidden";
  }
  textarea.addEventListener("input", autoResize);
  textarea.addEventListener("focus", () => { textarea.style.borderColor = T.accent + "66"; });
  textarea.addEventListener("blur", () => { textarea.style.borderColor = T.panelBorder; });

  const sendButton = el("span", {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: isNarrow ? "36px" : "40px",
    height: isNarrow ? "36px" : "40px",
    borderRadius: "8px",
    background: T.accent + "15",
    border: `1px solid ${T.accent}33`,
    color: T.accent,
    cursor: "pointer",
    transition: "all 0.2s ease",
    flexShrink: "0",
  });
  sendButton.innerHTML = SVG_SEND;
  sendButton.addEventListener("mouseenter", () => {
    sendButton.style.background = T.accent + "25";
    sendButton.style.borderColor = T.accent + "66";
  });
  sendButton.addEventListener("mouseleave", () => {
    sendButton.style.background = T.accent + "15";
    sendButton.style.borderColor = T.accent + "33";
  });

  const row = el("div", {
    display: "flex",
    gap: "8px",
    marginTop: "12px",
    width: "100%",
    maxWidth: isNarrow ? "100%" : "600px",
    alignItems: "flex-end",
  });
  row.appendChild(textarea);
  row.appendChild(sendButton);

  let _onSend = null;

  function handleSend() {
    if (_onSend) _onSend(textarea.value.trim());
  }

  sendButton.addEventListener("click", handleSend);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });

  return {
    getValue() { return textarea.value.trim(); },
    clear() {
      textarea.value = "";
      textarea.style.height = "auto";
      textarea.style.height = (isNarrow ? 34 : 38) + "px";
    },
    setDisabled(bool) {
      textarea.disabled = bool;
      sendButton.style.opacity = bool ? "0.3" : "1";
      sendButton.style.pointerEvents = bool ? "none" : "auto";
    },
    focus() { textarea.focus(); },
    onSend(callback) { _onSend = callback; },
    el: { row, textarea, sendButton },
  };
}

return { createTextInput };
