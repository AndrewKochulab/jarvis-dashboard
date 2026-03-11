// CSS Keyframes & Animations
// Supports config.performance.animationsEnabled toggle
// Returns: <style> HTMLElement

const animEnabled = ctx.config.performance?.animationsEnabled !== false;

const styleEl = document.createElement("style");

// ── One-shot animations (always included — fire once, not continuous) ──
const oneShotKeyframes = `
  @keyframes jarvisCardFadeIn {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes jarvisTyping {
    from { width: 0; }
    to   { width: 100%; }
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
  @keyframes jarvisRipple {
    0%   { transform: scale(1); opacity: 0.6; }
    100% { transform: scale(2.5); opacity: 0; }
  }
`;

// ── Infinite animations — full or single-frame depending on config ──
const infiniteKeyframes = animEnabled ? `
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
  @keyframes jarvisBreathing {
    0%, 100% { transform: scale(1); }
    50%      { transform: scale(1.03); }
  }
  @keyframes jarvisCursorBlink {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0; }
  }
  @keyframes jarvisEyeGlow {
    0%, 100% { opacity: 0.6; }
    50%      { opacity: 1; }
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
    0%, 100% { opacity: 0.5; }
    50%      { opacity: 1; }
  }
  @keyframes jarvisMicPulse {
    0%, 100% { opacity: 0.6; }
    50%      { opacity: 1; }
  }
  @keyframes jarvisArcRotate {
    0%   { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes jarvisArcPulse {
    0%, 100% { opacity: 0.3; }
    50%      { opacity: 0.8; }
  }
  @keyframes jarvisRecordPulse {
    0%, 100% { opacity: 0.5; }
    50%      { opacity: 1; }
  }
  @keyframes jarvisRecordZoom {
    0%, 100% { transform: scale(var(--jarvis-zoom-min, 0.92)); }
    50%      { transform: scale(var(--jarvis-zoom-max, 1.08)); }
  }
  @keyframes jarvisOrbitDotLarge {
    0%   { transform: rotate(0deg) translateX(34px) rotate(0deg); }
    100% { transform: rotate(360deg) translateX(34px) rotate(-360deg); }
  }
  @keyframes jarvisGlowPulse {
    0%, 100% { opacity: 0.4; }
    50%      { opacity: 0.8; }
  }
  @keyframes jarvisSubmitPulse {
    0%, 100% { opacity: 0.5; }
    50%      { opacity: 0.9; }
  }
  @keyframes jarvisOptionSelected {
    0%, 100% { border-left-color: rgba(0,212,255,0.4); }
    50%      { border-left-color: rgba(0,212,255,0.8); }
  }
` : `
  /* Animations disabled — static single-frame fallbacks */
  @keyframes jarvisGlow { 0%, 100% { text-shadow: 0 0 10px rgba(0,212,255,0.4), 0 0 30px rgba(0,212,255,0.2); } }
  @keyframes jarvisScanLine { 0% { top: -8%; } 100% { top: -8%; } }
  @keyframes jarvisPulse { 0%, 100% { opacity: 1; transform: scale(1); } }
  @keyframes jarvisBreathing { 0%, 100% { transform: scale(1); } }
  @keyframes jarvisCursorBlink { 0%, 100% { opacity: 1; } }
  @keyframes jarvisEyeGlow { 0%, 100% { opacity: 0.7; } }
  @keyframes jarvisFloat { 0%, 100% { transform: translateY(0px); } }
  @keyframes jarvisOrbitDot { 0%, 100% { transform: rotate(0deg) translateX(20px) rotate(0deg); } }
  @keyframes jarvisActiveRing { 0%, 100% { transform: scale(1); opacity: 0.5; } }
  @keyframes jarvisTimerPulse { 0%, 100% { opacity: 0.7; } }
  @keyframes jarvisMicPulse { 0%, 100% { opacity: 0.7; } }
  @keyframes jarvisArcRotate { 0%, 100% { transform: rotate(0deg); } }
  @keyframes jarvisArcPulse { 0%, 100% { opacity: 0.5; } }
  @keyframes jarvisRecordPulse { 0%, 100% { opacity: 0.7; } }
  @keyframes jarvisRecordZoom { 0%, 100% { transform: scale(1); } }
  @keyframes jarvisOrbitDotLarge { 0%, 100% { transform: rotate(0deg) translateX(34px) rotate(0deg); } }
  @keyframes jarvisGlowPulse { 0%, 100% { opacity: 0.6; } }
  @keyframes jarvisSubmitPulse { 0%, 100% { opacity: 0.7; } }
  @keyframes jarvisOptionSelected { 0%, 100% { border-left-color: rgba(0,212,255,0.4); } }
`;

styleEl.textContent = `
  ${oneShotKeyframes}
  ${infiniteKeyframes}

  /* ── Background pause — stops all animations when tab is hidden ── */
  .jarvis-bg-paused * {
    animation-play-state: paused !important;
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
  /* ── Project dropdown animation ── */
  @keyframes jarvisDropdownSlideIn {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── Project dropdown ── */
  .jarvis-project-dropdown {
    animation: jarvisDropdownSlideIn 0.15s ease-out forwards;
  }
  .jarvis-project-dropdown::-webkit-scrollbar {
    width: 4px;
  }
  .jarvis-project-dropdown::-webkit-scrollbar-thumb {
    background: rgba(0, 212, 255, 0.2);
    border-radius: 2px;
  }
  .jarvis-project-dropdown::-webkit-scrollbar-track {
    background: transparent;
  }

  /* ── Session tab bar ── */
  .jarvis-tab-bar {
    display: flex;
    align-items: center;
    gap: 0;
    overflow-x: auto;
    overflow-y: hidden;
    border-top: 1px solid rgba(0, 212, 255, 0.08);
    background: rgba(0, 0, 0, 0.2);
    min-height: 34px;
  }
  .jarvis-tab-bar::-webkit-scrollbar {
    height: 2px;
  }
  .jarvis-tab-bar::-webkit-scrollbar-thumb {
    background: rgba(0, 212, 255, 0.15);
    border-radius: 1px;
  }
  .jarvis-tab-bar::-webkit-scrollbar-track {
    background: transparent;
  }

  /* ── Session tab ── */
  .jarvis-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    cursor: pointer;
    white-space: nowrap;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.5px;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    border-bottom: 2px solid transparent;
    transition: all 0.15s ease;
    position: relative;
    flex-shrink: 0;
  }
  .jarvis-tab:hover {
    background: rgba(255, 255, 255, 0.03);
  }
  .jarvis-tab .jarvis-tab-close {
    opacity: 0;
    transition: opacity 0.15s ease;
    font-size: 9px;
    padding: 1px 3px;
    border-radius: 3px;
    line-height: 1;
  }
  .jarvis-tab:hover .jarvis-tab-close {
    opacity: 0.5;
  }
  .jarvis-tab .jarvis-tab-close:hover {
    opacity: 1;
    background: rgba(231, 76, 60, 0.2);
    color: #e74c3c !important;
  }

  /* ── Drag & drop ── */
  .jarvis-tab[draggable="true"] { cursor: grab; }
  .jarvis-tab.jarvis-dragging { opacity: 0.4; cursor: grabbing; }
  .jarvis-tab.jarvis-drag-over { border-left: 2px solid rgba(0, 212, 255, 0.6); }

  /* ── Tab notification badge ── */
  .jarvis-tab-badge {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    position: absolute;
    top: 4px;
    right: 4px;
    animation: jarvisPulse 2s ease-in-out infinite;
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
