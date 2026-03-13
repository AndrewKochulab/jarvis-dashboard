// System Diagnostics Widget — Orchestrator
// 4 stat cards: sessions, tokens, est. cost, top model
// Returns: HTMLElement

const { el, T, config, isNarrow, fmtTokens, fmtCost, createSectionTitle } = ctx;
const periodDays = config.widgets?.systemDiagnostics?.periodDays || 30;

function loadSub(rel) {
  const code = ctx.nodeFs.readFileSync(
    ctx.nodePath.join(ctx._srcDir, "widgets", "system-diagnostics", rel), "utf8"
  );
  return new Function("ctx", code)(ctx);
}

const { createStatCard } = loadSub("ui/stat-card.js");

const section = el("div", {
  position: "relative",
  zIndex: "2",
  marginBottom: isNarrow ? "24px" : "40px",
});

// Section title
section.appendChild(createSectionTitle("System Diagnostics", {
  badge: {
    text: `${periodDays} DAYS`,
    fontSize: "10px",
    color: T.textMuted,
    bg: "rgba(107,123,141,0.1)",
  },
}));

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

const cards = {};
cardDefs.forEach((dc, idx) => {
  const card = createStatCard(dc, idx);
  grid.appendChild(card.el.card);
  cards[dc.id] = card;
});

// Register stats callback
ctx.onStatsReady.push(function(stats) {
  cards.sessions.setValue(String(stats.totalSessions));
  cards.sessions.setSubText(`${stats.totalMessages} messages`);
  cards.tokens.setValue(fmtTokens(stats.totalTokens));
  cards.tokens.setSubText(`${stats.totalToolCalls} tool calls`);
  cards.cost.setValue(fmtCost(stats.totalCost));
  cards.cost.setSubText("input + output tokens");
  cards.model.setValue(stats.favoriteModel.toUpperCase());
  cards.model.setSubText(`${stats.favPct}% of sessions`);
});

// Store grid ref for responsive resize
ctx._diagGrid = grid;

return section;
