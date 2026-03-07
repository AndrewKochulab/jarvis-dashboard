// Theme & Responsive Sizing
// Returns: { T, isNarrow, isMedium, isWide, CARD_PAD, FONT_SM, leafEl }

const cw = ctx.container.clientWidth || ctx.container.offsetWidth || 600;
const leafEl = ctx.container.closest(".workspace-leaf");
const isNarrow = cw < 500;
const isMedium = cw >= 500 && cw < 800;
const isWide = (leafEl ? leafEl.clientWidth : (window.innerWidth || 0)) >= 950;

const CARD_PAD = isNarrow ? "14px 12px" : "20px 24px";
const FONT_SM = isNarrow ? "10px" : "12px";

const defaults = {
  bg:          "#0a0a1a",
  panelBg:     "#0d1117",
  panelBorder: "rgba(0, 212, 255, 0.12)",
  hoverBg:     "#12182a",
  accent:      "#00d4ff",
  accentDim:   "rgba(0, 212, 255, 0.3)",
  accentFaint: "rgba(0, 212, 255, 0.08)",
  purple:      "#7c6bff",
  green:       "#44c98f",
  red:         "#e74c3c",
  orange:      "#ff6b35",
  gold:        "#f6d365",
  text:        "#e0e6ed",
  textMuted:   "#6b7b8d",
  textDim:     "#3a4553",
};

const T = Object.assign({}, defaults, ctx.config.theme || {});

return { T, isNarrow, isMedium, isWide, CARD_PAD, FONT_SM, leafEl };
