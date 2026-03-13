// Clock — Date + live clock with interval/pausable management
// Returns: { createClock }

const { el, T, isNarrow } = ctx;

function createClock(clockMs) {
  const clockRow = el("div", {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: isNarrow ? "12px" : "24px",
    marginTop: "20px",
    flexWrap: "wrap",
  });

  const now = new Date();
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const dateStr = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

  clockRow.appendChild(el("span", {
    fontSize: isNarrow ? "11px" : "13px",
    color: T.textMuted,
    letterSpacing: "1px",
  }, dateStr));

  clockRow.appendChild(el("span", {
    width: "1px",
    height: "16px",
    background: T.textDim,
    display: "inline-block",
  }));

  const clockEl = el("span", {
    fontSize: isNarrow ? "14px" : "18px",
    fontWeight: "700",
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    color: T.accent,
    letterSpacing: "2px",
  });
  clockRow.appendChild(clockEl);

  const showSeconds = clockMs < 60000;

  function updateClock() {
    const n = new Date();
    const h = String(n.getHours()).padStart(2, "0");
    const m = String(n.getMinutes()).padStart(2, "0");
    if (showSeconds) {
      const s = String(n.getSeconds()).padStart(2, "0");
      clockEl.textContent = `${h}:${m}:${s}`;
    } else {
      clockEl.textContent = `${h}:${m}`;
    }
  }
  updateClock();

  let clockId = setInterval(updateClock, clockMs);
  ctx.intervals.push(clockId);

  // Register with pausable system
  ctx.registerPausable(
    () => {
      updateClock();
      clockId = setInterval(updateClock, clockMs);
      ctx.intervals.push(clockId);
    },
    () => { clearInterval(clockId); }
  );

  return { el: { row: clockRow } };
}

return { createClock };
