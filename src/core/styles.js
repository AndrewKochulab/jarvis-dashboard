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
`;

return styleEl;
