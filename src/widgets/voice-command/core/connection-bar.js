// Voice Command — Connection status bar
// Shows WebSocket connection state for remote/mobile mode.

const { el, T, isNarrow } = ctx;

function createConnectionBar(networkClient) {
  if (!networkClient) return null;

  const connDot = el("span", {
    display: "inline-block",
    width: "6px", height: "6px",
    borderRadius: "50%",
    background: T.textMuted,
    flexShrink: "0",
    transition: "background 0.3s ease",
  });

  const connLabel = el("span", {
    fontSize: "10px", fontWeight: "600",
    letterSpacing: "1.5px", textTransform: "uppercase",
    color: T.textMuted,
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    transition: "color 0.3s ease",
  }, "Disconnected");

  const connBtn = el("span", {
    fontSize: "10px", fontWeight: "600",
    letterSpacing: "1px",
    color: T.accent,
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    padding: "3px 10px",
    borderRadius: "6px",
    border: `1px solid ${T.accent}44`,
    cursor: "pointer",
    transition: "all 0.2s ease",
    display: "none",
  }, "Connect");
  connBtn.addEventListener("click", () => networkClient?.connect());
  connBtn.addEventListener("mouseenter", () => {
    connBtn.style.background = T.accent + "15";
    connBtn.style.borderColor = T.accent + "77";
  });
  connBtn.addEventListener("mouseleave", () => {
    connBtn.style.background = "transparent";
    connBtn.style.borderColor = T.accent + "44";
  });

  const bar = el("div", {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 14px",
    marginTop: "12px",
    background: T.panelBg,
    border: `1px solid ${T.panelBorder}`,
    borderRadius: "8px",
    maxWidth: isNarrow ? "100%" : "600px",
    width: "100%",
  });
  bar.appendChild(connDot);
  bar.appendChild(connLabel);
  bar.appendChild(el("div", { flex: "1" }));
  bar.appendChild(connBtn);

  function updateState(s) {
    if (s === "connected") {
      connDot.style.background = T.green;
      connLabel.textContent = "Connected";
      connLabel.style.color = T.green;
      connBtn.style.display = "none";
    } else if (s === "connecting" || s === "reconnecting") {
      connDot.style.background = T.orange;
      connLabel.textContent = s === "connecting" ? "Connecting..." : "Reconnecting...";
      connLabel.style.color = T.orange;
      connBtn.style.display = "none";
    } else {
      connDot.style.background = T.textMuted;
      connLabel.textContent = "Disconnected";
      connLabel.style.color = T.textMuted;
      connBtn.textContent = "Connect";
      connBtn.style.display = "inline";
    }
  }

  networkClient.onStateChange(updateState);
  updateState(networkClient.state);

  return {
    updateState,
    el: { bar },
  };
}

return { createConnectionBar };
