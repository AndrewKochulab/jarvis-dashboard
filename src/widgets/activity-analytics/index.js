// Activity Analytics Widget — Orchestrator
// 3-panel: heatmap, peak hours, model breakdown
// Returns: HTMLElement

const { el, T, isNarrow, createSectionTitle } = ctx;

function loadSub(rel) {
  const code = ctx.nodeFs.readFileSync(
    ctx.nodePath.join(ctx._srcDir, "widgets", "activity-analytics", rel), "utf8"
  );
  return new Function("ctx", code)(ctx);
}

const { createHeatmapPanel } = loadSub("ui/heatmap-panel.js");
const { createPeakHoursPanel } = loadSub("ui/peak-hours-panel.js");
const { createModelBreakdownPanel } = loadSub("ui/model-breakdown-panel.js");

const section = el("div", {
  position: "relative",
  zIndex: "2",
  marginBottom: isNarrow ? "24px" : "40px",
});

// Title
section.appendChild(createSectionTitle("Activity Analytics"));

// Grid
const grid = el("div", {
  display: "grid",
  gridTemplateColumns: isNarrow ? "1fr" : "repeat(3, 1fr)",
  gap: isNarrow ? "12px" : "20px",
});
section.appendChild(grid);

const heatmap = createHeatmapPanel();
const peakHours = createPeakHoursPanel();
const modelBreakdown = createModelBreakdownPanel();

grid.appendChild(heatmap.el);
grid.appendChild(peakHours.el);
grid.appendChild(modelBreakdown.el);

ctx.onStatsReady.push((stats) => {
  heatmap.update(stats);
  peakHours.update(stats);
  modelBreakdown.update(stats);
});

ctx._analyticsGrid = grid;

return section;
