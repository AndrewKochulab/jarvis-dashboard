// Header Widget — Orchestrator
// Title, status, clock, typing subtitle, decorative line
// Returns: HTMLElement

const { el, T, isNarrow, perf } = ctx;
const clockMs = perf?.clockIntervalMs || 1000;

function loadSub(rel) {
  const code = ctx.nodeFs.readFileSync(
    ctx.nodePath.join(ctx._srcDir, "widgets", "header", rel), "utf8"
  );
  return new Function("ctx", code)(ctx);
}

const { createStatusLine } = loadSub("ui/status-line.js");
const { createTitleDisplay } = loadSub("ui/title-display.js");
const { createClock } = loadSub("ui/clock.js");

const section = el("div", {
  position: "relative",
  zIndex: "2",
  paddingTop: isNarrow ? "44px" : "0",
});

// Status line
const statusLine = createStatusLine();
section.appendChild(statusLine.el.row);
// Expose update function so voice-command widget can set connection status
ctx._statusLineUpdate = statusLine.update;

// Title + subtitle
const titleDisplay = createTitleDisplay();
section.appendChild(titleDisplay.el.title);
section.appendChild(titleDisplay.el.subtitleWrap);

// Clock
const clock = createClock(clockMs);
section.appendChild(clock.el.row);

// Decorative line
section.appendChild(el("div", {
  width: isNarrow ? "60%" : "40%",
  height: "1px",
  background: "linear-gradient(90deg, transparent, " + T.accent + ", transparent)",
  margin: "24px auto 0",
  opacity: "0.5",
}));

return section;
