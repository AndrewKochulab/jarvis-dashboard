// Header Widget
// Title, status, clock, typing subtitle, decorative line
// Returns: HTMLElement (header section)

const { el, T, config, isNarrow } = ctx;
const dashCfg = config.dashboard || {};

const section = el("div", {
  position: "relative",
  zIndex: "2",
});

// Status line
const statusRow = el("div", {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  marginBottom: "16px",
});
section.appendChild(statusRow);

const statusDot = el("span", {
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  background: T.green,
  display: "inline-block",
  animation: "jarvisPulse 1.5s ease-in-out infinite",
});
statusRow.appendChild(statusDot);

const statusText = el("span", {
  fontSize: "11px",
  fontWeight: "600",
  letterSpacing: "3px",
  textTransform: "uppercase",
  color: T.green,
}, dashCfg.statusText || "System Online");
statusRow.appendChild(statusText);

// Title
const title = el("h1", {
  fontSize: isNarrow ? "36px" : "56px",
  fontWeight: "800",
  letterSpacing: isNarrow ? "8px" : "16px",
  margin: "0 0 8px 0",
  color: T.accent,
  animation: "jarvisGlow 3s ease-in-out infinite",
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  textAlign: "center",
}, dashCfg.title || "J.A.R.V.I.S.");
section.appendChild(title);

// Typing subtitle
const subtitleWrap = el("div", {
  display: "flex",
  justifyContent: "center",
});
section.appendChild(subtitleWrap);

const subtitleOuter = el("div", {
  display: "inline-block",
  position: "relative",
  overflow: "hidden",
  maxWidth: "100%",
});
subtitleWrap.appendChild(subtitleOuter);

const subtitleInner = el("div", {
  display: "inline-block",
  overflow: "hidden",
  whiteSpace: "nowrap",
  animation: "jarvisTyping 2.5s steps(40, end) forwards",
  borderRight: "2px solid " + T.accent,
  width: "0",
  fontSize: isNarrow ? "12px" : "15px",
  fontWeight: "400",
  letterSpacing: "2px",
  color: T.textMuted,
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  paddingRight: "4px",
});
subtitleInner.textContent = dashCfg.subtitle || "Just A Rather Very Intelligent System";
subtitleOuter.appendChild(subtitleInner);

setTimeout(() => {
  subtitleInner.style.borderRightColor = T.accent;
  subtitleInner.style.animation = "jarvisTyping 2.5s steps(40, end) forwards, jarvisCursorBlink 0.8s step-end infinite 2.5s";
}, 100);

// Date & Clock row
const clockRow = el("div", {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: isNarrow ? "12px" : "24px",
  marginTop: "20px",
  flexWrap: "wrap",
});
section.appendChild(clockRow);

const now = new Date();
const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const dateStr = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

const dateEl = el("span", {
  fontSize: isNarrow ? "11px" : "13px",
  color: T.textMuted,
  letterSpacing: "1px",
}, dateStr);
clockRow.appendChild(dateEl);

const divider = el("span", {
  width: "1px",
  height: "16px",
  background: T.textDim,
  display: "inline-block",
});
clockRow.appendChild(divider);

const clockEl = el("span", {
  fontSize: isNarrow ? "14px" : "18px",
  fontWeight: "700",
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  color: T.accent,
  letterSpacing: "2px",
});
clockRow.appendChild(clockEl);

function updateClock() {
  const n = new Date();
  const h = String(n.getHours()).padStart(2, "0");
  const m = String(n.getMinutes()).padStart(2, "0");
  const s = String(n.getSeconds()).padStart(2, "0");
  clockEl.textContent = `${h}:${m}:${s}`;
}
updateClock();
ctx.intervals.push(setInterval(updateClock, 1000));

// Decorative line
const headerLine = el("div", {
  width: isNarrow ? "60%" : "40%",
  height: "1px",
  background: "linear-gradient(90deg, transparent, " + T.accent + ", transparent)",
  margin: "24px auto 0",
  opacity: "0.5",
});
section.appendChild(headerLine);

return section;
