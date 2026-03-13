// Status Panel — Panel chrome with indicator dot, label, accent line
// Returns: { createStatusPanel }

const { el, T, isNarrow, animationsEnabled } = ctx;

function createStatusPanel() {
  const panel = el("div", {
    background: T.panelBg,
    border: `1px solid ${T.panelBorder}`,
    borderRadius: "12px",
    padding: isNarrow ? "16px" : "20px 24px",
    position: "relative",
    overflow: "hidden",
    transition: "border-color 0.5s ease, box-shadow 0.5s ease",
    animation: "jarvisCardFadeIn 0.5s ease-out 0.2s both",
    contain: "layout style",
  });

  const accentLine = el("div", {
    position: "absolute",
    top: "0", left: "0", right: "0", height: "2px",
    background: `linear-gradient(90deg, transparent, ${T.textDim}, transparent)`,
    transition: "background 0.5s ease",
  });
  panel.appendChild(accentLine);

  // Status row
  const statusRow = el("div", {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "0px",
  });
  panel.appendChild(statusRow);

  const liveDot = el("span", {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: T.textDim,
    display: "inline-block",
    flexShrink: "0",
    transition: "background 0.5s, box-shadow 0.5s",
  });
  statusRow.appendChild(liveDot);

  const statusLabel = el("span", {
    fontSize: "11px",
    fontWeight: "600",
    letterSpacing: "2px",
    textTransform: "uppercase",
    color: T.textDim,
    transition: "color 0.5s",
  }, "No Active Session");
  statusRow.appendChild(statusLabel);

  const sessionsContainer = el("div", { display: "none" });
  panel.appendChild(sessionsContainer);

  const hint = el("div", {
    fontSize: "10px",
    color: T.textDim,
    marginTop: "8px",
    letterSpacing: "0.5px",
  }, "Launch Claude Code to start monitoring");
  panel.appendChild(hint);

  function setActive(label) {
    liveDot.style.background = T.green;
    liveDot.style.boxShadow = `0 0 6px ${T.green}, 0 0 12px ${T.green}66`;
    liveDot.style.animation = animationsEnabled ? "jarvisPulse 1.5s ease-in-out infinite" : "none";
    statusLabel.textContent = label;
    statusLabel.style.color = T.green;
    accentLine.style.background = `linear-gradient(90deg, transparent, ${T.green}, transparent)`;
    panel.style.borderColor = T.green + "30";
    panel.style.boxShadow = `0 0 20px ${T.green}10, inset 0 0 30px ${T.green}05`;
    sessionsContainer.style.display = "block";
    hint.style.display = "none";
  }

  function setInactive() {
    liveDot.style.background = T.textDim;
    liveDot.style.boxShadow = "none";
    liveDot.style.animation = "none";
    statusLabel.textContent = "No Active Session";
    statusLabel.style.color = T.textDim;
    accentLine.style.background = `linear-gradient(90deg, transparent, ${T.textDim}, transparent)`;
    panel.style.borderColor = T.panelBorder;
    panel.style.boxShadow = "none";
    sessionsContainer.style.display = "none";
    sessionsContainer.innerHTML = "";
    hint.style.display = "block";
  }

  function clearRows() {
    sessionsContainer.innerHTML = "";
  }

  function appendRow(rowEl) {
    sessionsContainer.appendChild(rowEl);
  }

  return {
    el: { section: null, panel, sessionsContainer },
    setActive, setInactive, clearRows, appendRow,
  };
}

return { createStatusPanel };
