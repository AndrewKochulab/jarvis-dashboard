// Model Breakdown Panel — Model usage + cost breakdown
// Returns: { createModelBreakdownPanel }

const { el, T, isNarrow, fmtCost } = ctx;

const MODEL_COLORS = {
  opus: T.purple,
  sonnet: T.accent,
  haiku: T.green,
};

function createModelBreakdownPanel() {
  const panel = el("div", {
    background: T.panelBg, border: `1px solid ${T.panelBorder}`,
    borderRadius: "12px", padding: isNarrow ? "16px 14px" : "20px 24px",
    position: "relative", overflow: "hidden",
    animation: "jarvisCardFadeIn 0.5s ease-out 0.7s both",
  });

  panel.appendChild(el("div", {
    position: "absolute", top: "0", left: "0", right: "0", height: "2px",
    background: `linear-gradient(90deg, transparent, ${T.purple}, transparent)`,
  }));

  panel.appendChild(el("div", {
    fontSize: "11px", fontWeight: "700", letterSpacing: "2px",
    textTransform: "uppercase", color: T.textMuted,
    marginBottom: "14px", marginTop: "4px",
  }, "Model Usage"));

  const listWrap = el("div", {
    display: "flex", flexDirection: "column", gap: "12px",
  });
  panel.appendChild(listWrap);

  function update(stats) {
    listWrap.innerHTML = "";
    if (!stats.modelBreakdown || stats.modelBreakdown.length === 0) {
      listWrap.appendChild(el("div", { fontSize: "11px", color: T.textDim }, "No data yet"));
      return;
    }
    const maxCount = stats.modelBreakdown[0].count;
    for (const entry of stats.modelBreakdown) {
      const row = el("div", { display: "flex", flexDirection: "column", gap: "4px" });
      const nameRow = el("div", { display: "flex", alignItems: "center", justifyContent: "space-between" });
      nameRow.appendChild(el("span", {
        fontSize: "12px", fontWeight: "700", letterSpacing: "1.5px",
        textTransform: "uppercase", color: MODEL_COLORS[entry.model] || T.text,
      }, entry.model));
      nameRow.appendChild(el("span", {
        fontSize: "12px", fontWeight: "600", color: T.text,
      }, entry.pct + "%"));
      row.appendChild(nameRow);

      const barBg = el("div", {
        width: "100%", height: "6px", borderRadius: "3px",
        background: "rgba(58, 69, 83, 0.3)", overflow: "hidden",
      });
      barBg.appendChild(el("div", {
        width: Math.max(2, (entry.count / maxCount) * 100) + "%",
        height: "100%", borderRadius: "3px",
        background: MODEL_COLORS[entry.model] || T.text,
        transition: "width 0.5s ease",
      }));
      row.appendChild(barBg);

      row.appendChild(el("div", {
        fontSize: "10px", color: T.textMuted, letterSpacing: "0.5px",
      }, `${fmtCost(entry.cost)} \u00b7 ${entry.count} session${entry.count !== 1 ? "s" : ""}`));
      listWrap.appendChild(row);
    }
  }

  return { el: panel, update };
}

return { createModelBreakdownPanel };
