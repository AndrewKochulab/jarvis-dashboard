// Recent Activity Widget — Orchestrator
// Shows recently modified vault files
// Returns: HTMLElement

const { el, T, config, isNarrow, dv, createSectionTitle } = ctx;
const actCfg = config.widgets?.recentActivity || {};
const count = actCfg.count || 10;
const excludePatterns = (actCfg.excludePatterns || []).map(p => new RegExp(p));

function loadSub(rel) {
  const code = ctx.nodeFs.readFileSync(
    ctx.nodePath.join(ctx._srcDir, "widgets", "recent-activity", rel), "utf8"
  );
  return new Function("ctx", code)(ctx);
}

const { createActivityRow } = loadSub("ui/activity-row.js");

const section = el("div", {
  position: "relative",
  zIndex: "2",
  marginBottom: isNarrow ? "24px" : "40px",
});

// Title
section.appendChild(createSectionTitle("Recent Activity", { color: T.green }));

// Panel
const panel = el("div", {
  background: T.panelBg, border: `1px solid ${T.panelBorder}`,
  borderRadius: "12px", overflow: "hidden",
  position: "relative",
  animation: "jarvisCardFadeIn 0.5s ease-out 0.5s both",
});
section.appendChild(panel);

panel.appendChild(el("div", {
  position: "absolute", top: "0", left: "0", right: "0", height: "2px",
  background: `linear-gradient(90deg, transparent, ${T.green}, transparent)`,
}));

// Populate async
setTimeout(() => {
  try {
    const recentPages = dv.pages()
      .where(p => !excludePatterns.some(rx => rx.test(p.file.path)))
      .sort(p => p.file.mtime, "desc")
      .slice(0, count)
      .array();

    if (recentPages.length === 0) {
      panel.appendChild(el("div", {
        padding: "20px 24px", fontSize: "12px",
        color: T.textDim, letterSpacing: "0.5px",
      }, "No recent activity found."));
      return;
    }

    recentPages.forEach((page, idx) => {
      const row = createActivityRow(page, idx, idx === recentPages.length - 1);
      panel.appendChild(row.el.row);
    });
  } catch {}
}, 150);

return section;
