// Agent Cards Widget — Orchestrator
// Robot avatars, skills pills, status indicators
// Returns: HTMLElement

const { el, T, isNarrow, isWide, agents, agentCardRefs, createSectionTitle } = ctx;

function loadSub(rel) {
  const code = ctx.nodeFs.readFileSync(
    ctx.nodePath.join(ctx._srcDir, "widgets", "agent-cards", rel), "utf8"
  );
  return new Function("ctx", code)(ctx);
}

const { createAgentCard } = loadSub("ui/agent-card.js");

const section = el("div", {
  position: "relative",
  zIndex: "2",
  marginBottom: isNarrow ? "24px" : "40px",
});

// Title row
section.appendChild(createSectionTitle("Active Agents", {
  marginBottom: "20px",
  badge: { text: `${agents.length} ONLINE` },
}));

// Grid
const grid = el("div", {
  display: "grid",
  gridTemplateColumns: isNarrow ? "1fr" : (isWide ? "repeat(3, 1fr)" : "1fr"),
  gap: isNarrow ? "12px" : "20px",
});
section.appendChild(grid);

// Build cards
agents.forEach((agent, idx) => {
  const result = createAgentCard(agent, idx);
  grid.appendChild(result.el.card);
  agentCardRefs.set(agent.name, { ...result.refs, setActive: result.setActive });
});

// Store grid ref for responsive resize
ctx._agentsGrid = grid;

return section;
