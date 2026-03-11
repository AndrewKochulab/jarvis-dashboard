// CSS Keyframes & Animations
// Returns: <style> HTMLElement

const styleEl = document.createElement("style");
styleEl.textContent = `
  @keyframes jarvisGlow {
    0%, 100% { text-shadow: 0 0 10px rgba(0,212,255,0.4), 0 0 30px rgba(0,212,255,0.2), 0 0 60px rgba(0,212,255,0.1); }
    50%      { text-shadow: 0 0 20px rgba(0,212,255,0.8), 0 0 50px rgba(0,212,255,0.4), 0 0 90px rgba(0,212,255,0.2); }
  }
  @keyframes jarvisScanLine {
    0%   { top: -8%; }
    100% { top: 108%; }
  }
  @keyframes jarvisPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.3; transform: scale(1.5); }
  }
  @keyframes jarvisCardFadeIn {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes jarvisBreathing {
    0%, 100% { transform: scale(1); }
    50%      { transform: scale(1.03); }
  }
  @keyframes jarvisTyping {
    from { width: 0; }
    to   { width: 100%; }
  }
  @keyframes jarvisCursorBlink {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0; }
  }
  @keyframes jarvisEyeGlow {
    0%, 100% { box-shadow: 0 0 3px currentColor, 0 0 6px currentColor; }
    50%      { box-shadow: 0 0 6px currentColor, 0 0 12px currentColor, 0 0 20px currentColor; }
  }
  @keyframes jarvisFloat {
    0%, 100% { transform: translateY(0px); }
    50%      { transform: translateY(-3px); }
  }
  @keyframes jarvisOrbitDot {
    0%   { transform: rotate(0deg) translateX(20px) rotate(0deg); }
    100% { transform: rotate(360deg) translateX(20px) rotate(-360deg); }
  }
  @keyframes jarvisActiveRing {
    0%, 100% { transform: scale(1); opacity: 0.4; }
    50%      { transform: scale(1.15); opacity: 0.8; }
  }
  @keyframes jarvisTimerPulse {
    0%, 100% { box-shadow: 0 0 8px rgba(0,212,255,0.3); }
    50%      { box-shadow: 0 0 20px rgba(0,212,255,0.6), 0 0 40px rgba(0,212,255,0.2); }
  }
  @keyframes jarvisMicPulse {
    0%, 100% { box-shadow: 0 0 6px rgba(0,212,255,0.4); border-color: rgba(0,212,255,0.6); }
    50%      { box-shadow: 0 0 18px rgba(0,212,255,0.7), 0 0 36px rgba(0,212,255,0.3); border-color: rgba(0,212,255,0.9); }
  }
  @keyframes jarvisArcRotate {
    0%   { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes jarvisArcPulse {
    0%, 100% { box-shadow: 0 0 15px rgba(0,212,255,0.3), 0 0 30px rgba(0,212,255,0.1); }
    50%      { box-shadow: 0 0 30px rgba(0,212,255,0.6), 0 0 60px rgba(0,212,255,0.3), 0 0 90px rgba(0,212,255,0.1); }
  }
  @keyframes jarvisRipple {
    0%   { transform: scale(1); opacity: 0.6; }
    100% { transform: scale(2.5); opacity: 0; }
  }
  @keyframes jarvisRecordPulse {
    0%, 100% { box-shadow: 0 0 20px rgba(0,212,255,0.5), 0 0 40px rgba(0,212,255,0.2); }
    50%      { box-shadow: 0 0 40px rgba(0,212,255,0.8), 0 0 80px rgba(0,212,255,0.4), 0 0 120px rgba(0,212,255,0.1); }
  }
  @keyframes jarvisRecordZoom {
    0%, 100% { transform: scale(var(--jarvis-zoom-min, 0.92)); }
    50%      { transform: scale(var(--jarvis-zoom-max, 1.08)); }
  }
  @keyframes jarvisOrbitDotLarge {
    0%   { transform: rotate(0deg) translateX(34px) rotate(0deg); }
    100% { transform: rotate(360deg) translateX(34px) rotate(-360deg); }
  }
  @keyframes jarvisTerminalSlideIn {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes jarvisTerminalSlideOut {
    from { opacity: 1; transform: translateY(0); }
    to   { opacity: 0; transform: translateY(-8px); }
  }
  @keyframes jarvisCardSlideIn {
    from { opacity: 0; transform: translateY(12px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes jarvisGlowPulse {
    0%, 100% { box-shadow: 0 0 8px rgba(0,212,255,0.2), inset 0 0 8px rgba(0,212,255,0.05); }
    50%      { box-shadow: 0 0 16px rgba(0,212,255,0.4), inset 0 0 12px rgba(0,212,255,0.1); }
  }
  @keyframes jarvisSubmitPulse {
    0%, 100% { box-shadow: 0 0 6px rgba(68,201,143,0.3); }
    50%      { box-shadow: 0 0 14px rgba(68,201,143,0.6), 0 0 28px rgba(68,201,143,0.2); }
  }
  @keyframes jarvisOptionSelected {
    0%, 100% { border-left-color: rgba(0,212,255,0.4); }
    50%      { border-left-color: rgba(0,212,255,0.8); }
  }
  /* ── Code block styles ── */
  .jarvis-code-block {
    margin: 8px 0;
    border-radius: 8px;
    border: 1px solid rgba(0, 212, 255, 0.12);
    overflow: hidden;
    background: #080c14;
  }
  .jarvis-code-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 12px;
    background: rgba(0, 212, 255, 0.05);
    border-bottom: 1px solid rgba(0, 212, 255, 0.08);
    font-size: 10px;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .jarvis-code-pre {
    margin: 0;
    padding: 12px 16px;
    overflow-x: auto;
    font-size: inherit;
    font-family: inherit;
    line-height: 1.5;
    white-space: pre;
    word-break: normal;
    background: transparent;
  }
  .jarvis-code-pre code {
    font-family: inherit;
  }
  .jarvis-code-copy {
    cursor: pointer;
    opacity: 0.4;
    transition: opacity 0.2s;
    user-select: none;
  }
  .jarvis-code-copy:hover {
    opacity: 1;
  }
  .jarvis-code-block + .jarvis-code-block {
    margin-top: 4px;
  }
  /* ── Scrollbar inside code blocks ── */
  .jarvis-code-pre::-webkit-scrollbar {
    height: 4px;
  }
  .jarvis-code-pre::-webkit-scrollbar-thumb {
    background: rgba(0, 212, 255, 0.2);
    border-radius: 2px;
  }
  .jarvis-code-pre::-webkit-scrollbar-track {
    background: transparent;
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

return styleEl;
