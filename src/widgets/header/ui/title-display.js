// Title Display — "J.A.R.V.I.S." title + typing subtitle
// Returns: { createTitleDisplay }

const { el, T, config, isNarrow, animationsEnabled } = ctx;
const dashCfg = config.dashboard || {};

function createTitleDisplay() {
  const title = el("h1", {
    fontSize: isNarrow ? "36px" : "56px",
    fontWeight: "800",
    letterSpacing: isNarrow ? "8px" : "16px",
    margin: "0 0 8px 0",
    color: T.accent,
    animation: animationsEnabled ? "jarvisGlow 3s ease-in-out infinite" : "none",
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    textAlign: "center",
    willChange: animationsEnabled ? "text-shadow" : "auto",
  }, dashCfg.title || "J.A.R.V.I.S.");
  if (!animationsEnabled) {
    title.style.textShadow = "0 0 10px rgba(0,212,255,0.4), 0 0 30px rgba(0,212,255,0.2)";
  }

  // Typing subtitle
  const subtitleWrap = el("div", {
    display: "flex",
    justifyContent: "center",
  });

  const subtitleOuter = el("div", {
    display: "inline-block",
    position: "relative",
    overflow: "hidden",
    maxWidth: "100%",
  });
  subtitleWrap.appendChild(subtitleOuter);

  const fullSubtitle = dashCfg.subtitle || "Just A Rather Very Intelligent System";
  const subtitleInner = el("div", {
    display: "inline-block",
    whiteSpace: "nowrap",
    borderRight: "2px solid " + T.accent,
    fontSize: isNarrow ? "12px" : "15px",
    fontWeight: "400",
    letterSpacing: "2px",
    color: T.textMuted,
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    paddingRight: "4px",
  });
  subtitleInner.textContent = "";
  subtitleOuter.appendChild(subtitleInner);

  // JS-based typing animation (CSS keyframes unreliable in Tauri WKWebView)
  let charIndex = 0;
  const typingSpeed = Math.max(30, Math.floor(2500 / fullSubtitle.length));
  const typingTimer = setInterval(() => {
    if (charIndex < fullSubtitle.length) {
      charIndex++;
      subtitleInner.textContent = fullSubtitle.slice(0, charIndex);
    } else {
      clearInterval(typingTimer);
      // Start cursor blink after typing completes
      if (animationsEnabled) {
        subtitleInner.style.animation = "jarvisCursorBlink 0.8s step-end infinite";
      }
    }
  }, typingSpeed);

  return { el: { title, subtitleWrap } };
}

return { createTitleDisplay };
