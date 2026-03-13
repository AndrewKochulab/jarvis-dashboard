// Mission Control Widget — Orchestrator
// Navigation hub to other dashboards
// Returns: HTMLElement

const { el, T, config, isNarrow, createSectionTitle } = ctx;
const dashboards = config.widgets?.missionControl?.dashboards || [];

function loadSub(rel) {
  const code = ctx.nodeFs.readFileSync(
    ctx.nodePath.join(ctx._srcDir, "widgets", "mission-control", rel), "utf8"
  );
  return new Function("ctx", code)(ctx);
}

const { createNavButton } = loadSub("ui/nav-button.js");

const section = el("div", {
  position: "relative",
  zIndex: "2",
});

// Title
section.appendChild(createSectionTitle("Mission Control", { marginBottom: "20px" }));

// Navigation grid
const grid = el("div", {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: "14px",
});
section.appendChild(grid);

dashboards.forEach((dash, idx) => {
  const navBtn = createNavButton(dash, idx);
  grid.appendChild(navBtn.el.btn);
});

return section;
