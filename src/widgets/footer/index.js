// Footer Widget
// Summary line with agent count and vault stats
// Returns: HTMLElement

const { el, T, isNarrow, dv, agents } = ctx;

const section = el("div", {
  textAlign: "center",
  paddingTop: "20px",
  position: "relative",
  zIndex: "2",
});

section.appendChild(el("div", {
  width: isNarrow ? "60%" : "30%",
  height: "1px",
  background: "linear-gradient(90deg, transparent, " + T.panelBorder + ", transparent)",
  margin: "0 auto 16px",
}));

let vaultCount = 0;
try { vaultCount = dv.pages().length; } catch {}

section.appendChild(el("div", {
  fontSize: "10px",
  color: T.textDim,
  letterSpacing: "2px",
  textTransform: "uppercase",
}, `${agents.length} Agents \u00b7 ${vaultCount} Vault Notes \u00b7 Powered by Claude Code`));

return section;
