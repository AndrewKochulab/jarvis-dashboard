// System Diagnostics Widget
// 4 stat cards: sessions, tokens, est. cost, top model
// Returns: HTMLElement

const { el, T, config, isNarrow, fmtTokens, fmtCost } = ctx;
const periodDays = config.widgets?.systemDiagnostics?.periodDays || 30;

const section = el("div", {
  position: "relative",
  zIndex: "2",
  marginBottom: isNarrow ? "24px" : "40px",
});

// Section title
const titleRow = el("div", {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  marginBottom: "16px",
});
section.appendChild(titleRow);

titleRow.appendChild(el("div", {
  flex: "0 0 4px", height: "24px", background: T.accent, borderRadius: "2px",
}));

titleRow.appendChild(el("span", {
  fontSize: isNarrow ? "14px" : "18px",
  fontWeight: "700", letterSpacing: "3px",
  textTransform: "uppercase", color: T.text,
}, "System Diagnostics"));

titleRow.appendChild(el("span", {
  fontSize: "10px", fontWeight: "600", color: T.textMuted,
  background: "rgba(107,123,141,0.1)",
  padding: "2px 8px", borderRadius: "8px", letterSpacing: "1px",
}, `${periodDays} DAYS`));

// Grid
const grid = el("div", {
  display: "grid",
  gridTemplateColumns: isNarrow ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
  gap: isNarrow ? "10px" : "16px",
});
section.appendChild(grid);

const cardDefs = [
  { id: "sessions", icon: "\u25c8", label: "Sessions", color: T.accent },
  { id: "tokens",   icon: "\u25c8", label: "Tokens",   color: T.purple },
  { id: "cost",     icon: "\u25c8", label: "Est. Cost", color: T.gold },
  { id: "model",    icon: "\u25c8", label: "Top Model", color: T.green },
];

const valueEls = {};

cardDefs.forEach((dc, idx) => {
  const card = el("div", {
    background: T.panelBg,
    border: `1px solid ${T.panelBorder}`,
    borderRadius: "10px",
    padding: isNarrow ? "14px 12px" : "18px 20px",
    position: "relative", overflow: "hidden",
    animation: `jarvisCardFadeIn 0.5s ease-out ${0.3 + idx * 0.1}s both`,
  });
  grid.appendChild(card);

  card.appendChild(el("div", {
    position: "absolute", top: "0", left: "0", right: "0", height: "2px",
    background: `linear-gradient(90deg, transparent, ${dc.color}, transparent)`,
  }));

  const valRow = el("div", {
    display: "flex", alignItems: "center", gap: "8px",
    marginBottom: "6px", marginTop: "4px",
  });
  card.appendChild(valRow);

  valRow.appendChild(el("span", { fontSize: "12px", color: dc.color }, dc.icon));

  const valEl = el("span", {
    fontSize: isNarrow ? "20px" : "24px",
    fontWeight: "800", color: T.text,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    letterSpacing: "1px",
  }, "...");
  valRow.appendChild(valEl);
  valueEls[dc.id] = valEl;

  card.appendChild(el("div", {
    fontSize: "10px", fontWeight: "600", letterSpacing: "1.5px",
    textTransform: "uppercase", color: T.textMuted,
  }, dc.label));

  const sub = el("div", {
    fontSize: "9px", color: T.textDim, marginTop: "4px", letterSpacing: "0.5px",
  }, "");
  card.appendChild(sub);
  valueEls[dc.id + "_sub"] = sub;
});

// Register stats callback
ctx.onStatsReady.push(function(stats) {
  valueEls.sessions.textContent = String(stats.totalSessions);
  valueEls.sessions_sub.textContent = `${stats.totalMessages} messages`;
  valueEls.tokens.textContent = fmtTokens(stats.totalTokens);
  valueEls.tokens_sub.textContent = `${stats.totalToolCalls} tool calls`;
  valueEls.cost.textContent = fmtCost(stats.totalCost);
  valueEls.cost_sub.textContent = "input + output tokens";
  valueEls.model.textContent = stats.favoriteModel.toUpperCase();
  valueEls.model_sub.textContent = `${stats.favPct}% of sessions`;
});

// Store grid ref for responsive resize
ctx._diagGrid = grid;

return section;
