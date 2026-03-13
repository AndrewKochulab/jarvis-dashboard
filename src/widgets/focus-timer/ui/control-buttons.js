// Control Buttons — Start/Pause + Reset button pair
// Returns: { createControlButtons }

const { el, T, addHoverEffect } = ctx;

function createControlButtons(onStartPause, onReset) {
  const row = el("div", {
    display: "flex", gap: "8px", justifyContent: "center",
  });

  const startBtn = el("div", {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    gap: "6px", padding: "10px 28px",
    border: `1px solid ${T.accent}55`, borderRadius: "8px",
    background: "rgba(0, 212, 255, 0.06)",
    cursor: "pointer", transition: "all 0.3s ease",
  });
  const startBtnIcon = el("span", { fontSize: "14px", color: T.accent }, "\u25b6");
  const startBtnText = el("span", {
    fontSize: "11px", fontWeight: "700", letterSpacing: "2px",
    textTransform: "uppercase", color: T.accent,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
  }, "Start");
  startBtn.appendChild(startBtnIcon);
  startBtn.appendChild(startBtnText);
  row.appendChild(startBtn);

  addHoverEffect(startBtn, {
    boxShadow: `0 0 20px ${T.accentDim}, 0 0 40px rgba(0,212,255,0.1)`,
    borderColor: T.accent + "88",
    transform: "scale(1.02)",
    background: "rgba(0, 212, 255, 0.1)",
  }, {
    boxShadow: "none",
    borderColor: T.accent + "55",
    transform: "scale(1)",
    background: "rgba(0, 212, 255, 0.06)",
  });

  const resetBtn = el("div", {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    gap: "6px", padding: "10px 20px",
    border: `1px solid ${T.red}44`, borderRadius: "8px",
    background: "rgba(231, 76, 60, 0.06)",
    cursor: "pointer", transition: "all 0.3s ease",
  });
  resetBtn.appendChild(el("span", {
    fontSize: "11px", fontWeight: "700", letterSpacing: "2px",
    textTransform: "uppercase", color: T.red,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
  }, "Reset"));
  row.appendChild(resetBtn);

  addHoverEffect(resetBtn, {
    boxShadow: "0 0 16px rgba(231,76,60,0.2)",
    borderColor: T.red + "77",
    transform: "scale(1.02)",
  }, {
    boxShadow: "none",
    borderColor: T.red + "44",
    transform: "scale(1)",
  });

  startBtn.addEventListener("click", onStartPause);
  resetBtn.addEventListener("click", onReset);

  function updateLabel(state) {
    if (state === "running") {
      startBtnIcon.textContent = "\u23f8";
      startBtnText.textContent = "Pause";
    } else if (state === "paused") {
      startBtnIcon.textContent = "\u25b6";
      startBtnText.textContent = "Resume";
    } else {
      startBtnIcon.textContent = "\u25b6";
      startBtnText.textContent = "Start";
    }
  }

  return { el: { row }, updateLabel };
}

return { createControlButtons };
