// Circular Display — Conic-gradient progress ring with time and mode
// Returns: { createCircularDisplay }

const { el, T, isNarrow } = ctx;

function createCircularDisplay() {
  const wrap = el("div", {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: "14px", marginBottom: "16px",
  });

  const circleSize = isNarrow ? 120 : 140;
  const innerSize = circleSize - 20;

  const circle = el("div", {
    width: circleSize + "px", height: circleSize + "px", borderRadius: "50%",
    position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
    background: `conic-gradient(${T.accent} 0deg, rgba(58,69,83,0.3) 0deg)`,
    transition: "background 0.3s ease",
  });
  wrap.appendChild(circle);

  const inner = el("div", {
    width: innerSize + "px", height: innerSize + "px", borderRadius: "50%",
    background: T.panelBg, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", position: "absolute",
  });
  circle.appendChild(inner);

  const timeEl = el("div", {
    fontSize: isNarrow ? "26px" : "32px", fontWeight: "800",
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    color: T.text, letterSpacing: "2px",
  }, "30:00");
  inner.appendChild(timeEl);

  const modeEl = el("div", {
    fontSize: "9px", fontWeight: "600", letterSpacing: "2px",
    textTransform: "uppercase", color: T.accent, marginTop: "2px",
  }, "WORK");
  inner.appendChild(modeEl);

  function update(progress, mode, remainingMs) {
    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs % 60000) / 1000);
    timeEl.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

    const degrees = Math.round(progress * 360);
    const color = mode === "work" ? T.accent : T.green;
    circle.style.background = `conic-gradient(${color} ${degrees}deg, rgba(58,69,83,0.3) ${degrees}deg)`;
    modeEl.textContent = mode.toUpperCase();
    modeEl.style.color = color;
  }

  function setAnimating(active) {
    circle.style.animation = active ? "jarvisTimerPulse 2s ease-in-out infinite" : "none";
  }

  return { el: { wrap, circle, timeEl, modeEl }, update, setAnimating };
}

return { createCircularDisplay };
