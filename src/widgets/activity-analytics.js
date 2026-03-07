// Activity Analytics Widget
// 3-panel: heatmap, peak hours, model breakdown
// Returns: HTMLElement

const { el, T, config, isNarrow, fmtCost } = ctx;

const section = el("div", {
  position: "relative",
  zIndex: "2",
  marginBottom: isNarrow ? "24px" : "40px",
});

// Title
const titleRow = el("div", {
  display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px",
});
section.appendChild(titleRow);

titleRow.appendChild(el("div", {
  flex: "0 0 4px", height: "24px", background: T.accent, borderRadius: "2px",
}));

titleRow.appendChild(el("span", {
  fontSize: isNarrow ? "14px" : "18px",
  fontWeight: "700", letterSpacing: "3px",
  textTransform: "uppercase", color: T.text,
}, "Activity Analytics"));

// Grid
const grid = el("div", {
  display: "grid",
  gridTemplateColumns: isNarrow ? "1fr" : "repeat(3, 1fr)",
  gap: isNarrow ? "12px" : "20px",
});
section.appendChild(grid);

// Panel 1: Heatmap
const heatmapPanel = el("div", {
  background: T.panelBg, border: `1px solid ${T.panelBorder}`,
  borderRadius: "12px", padding: isNarrow ? "16px 14px" : "20px 24px",
  position: "relative", overflow: "hidden",
  animation: "jarvisCardFadeIn 0.5s ease-out 0.5s both",
});
grid.appendChild(heatmapPanel);

heatmapPanel.appendChild(el("div", {
  position: "absolute", top: "0", left: "0", right: "0", height: "2px",
  background: `linear-gradient(90deg, transparent, ${T.green}, transparent)`,
}));

heatmapPanel.appendChild(el("div", {
  fontSize: "11px", fontWeight: "700", letterSpacing: "2px",
  textTransform: "uppercase", color: T.textMuted,
  marginBottom: "14px", marginTop: "4px",
}, "Activity Heatmap"));

const heatmapContainer = el("div", {
  display: "flex", alignItems: "flex-start", gap: "6px",
});
heatmapPanel.appendChild(heatmapContainer);

const dayLabels = el("div", {
  display: "flex", flexDirection: "column", gap: "3px",
});
heatmapContainer.appendChild(dayLabels);

["Mon", "", "Wed", "", "Fri", "", "Sun"].forEach(d => {
  dayLabels.appendChild(el("div", {
    fontSize: "9px", color: T.textDim,
    height: "14px", lineHeight: "14px",
    textAlign: "right", width: "24px",
  }, d));
});

const heatmapGrid = el("div", {
  display: "flex", gap: "3px", minHeight: "0",
});
heatmapContainer.appendChild(heatmapGrid);

// Panel 2: Peak Hours
const peakPanel = el("div", {
  background: T.panelBg, border: `1px solid ${T.panelBorder}`,
  borderRadius: "12px", padding: isNarrow ? "16px 14px" : "20px 24px",
  position: "relative", overflow: "hidden",
  animation: "jarvisCardFadeIn 0.5s ease-out 0.6s both",
});
grid.appendChild(peakPanel);

peakPanel.appendChild(el("div", {
  position: "absolute", top: "0", left: "0", right: "0", height: "2px",
  background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)`,
}));

peakPanel.appendChild(el("div", {
  fontSize: "11px", fontWeight: "700", letterSpacing: "2px",
  textTransform: "uppercase", color: T.textMuted,
  marginBottom: "14px", marginTop: "4px",
}, "Peak Hours"));

const peakChartWrap = el("div", { display: "flex", flexDirection: "column", gap: "6px" });
peakPanel.appendChild(peakChartWrap);

const peakBarsRow = el("div", {
  display: "flex", alignItems: "flex-end", gap: "2px", height: "80px",
});
peakChartWrap.appendChild(peakBarsRow);

const peakLabelsRow = el("div", { display: "flex", gap: "2px" });
peakChartWrap.appendChild(peakLabelsRow);

// Panel 3: Model Breakdown
const modelPanel = el("div", {
  background: T.panelBg, border: `1px solid ${T.panelBorder}`,
  borderRadius: "12px", padding: isNarrow ? "16px 14px" : "20px 24px",
  position: "relative", overflow: "hidden",
  animation: "jarvisCardFadeIn 0.5s ease-out 0.7s both",
});
grid.appendChild(modelPanel);

modelPanel.appendChild(el("div", {
  position: "absolute", top: "0", left: "0", right: "0", height: "2px",
  background: `linear-gradient(90deg, transparent, ${T.purple}, transparent)`,
}));

modelPanel.appendChild(el("div", {
  fontSize: "11px", fontWeight: "700", letterSpacing: "2px",
  textTransform: "uppercase", color: T.textMuted,
  marginBottom: "14px", marginTop: "4px",
}, "Model Usage"));

const modelListWrap = el("div", {
  display: "flex", flexDirection: "column", gap: "12px",
});
modelPanel.appendChild(modelListWrap);

const MODEL_COLORS = {
  opus: T.purple,
  sonnet: T.accent,
  haiku: T.green,
};

// Render functions called via onStatsReady
ctx.onStatsReady.push(function(stats) {
  // Heatmap
  heatmapGrid.innerHTML = "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let maxMsg = 1;
  for (const v of Object.values(stats.dailyActivity)) {
    if (v.messages > maxMsg) maxMsg = v.messages;
  }
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 29);
  const startDay = startDate.getDay();
  const alignOffset = startDay === 0 ? 6 : startDay - 1;
  startDate.setDate(startDate.getDate() - alignOffset);

  const d = new Date(startDate);
  while (d <= today) {
    const weekCol = el("div", { display: "flex", flexDirection: "column", gap: "3px" });
    heatmapGrid.appendChild(weekCol);
    for (let dow = 0; dow < 7; dow++) {
      const dateStr = d.toISOString().slice(0, 10);
      const activity = stats.dailyActivity[dateStr];
      const msgs = activity ? activity.messages : 0;
      const intensity = msgs > 0 ? Math.max(0.15, msgs / maxMsg) : 0;
      const cell = el("div", {
        width: "14px", height: "14px", borderRadius: "3px",
        background: intensity > 0 ? `rgba(68, 201, 143, ${intensity})` : "rgba(58, 69, 83, 0.3)",
        cursor: msgs > 0 ? "pointer" : "default", transition: "transform 0.15s",
      });
      if (msgs > 0) {
        const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
        const monthName = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
        cell.title = `${dayName} ${monthName} ${d.getDate()} \u2014 ${msgs} messages`;
        cell.addEventListener("mouseenter", () => { cell.style.transform = "scale(1.3)"; });
        cell.addEventListener("mouseleave", () => { cell.style.transform = "scale(1)"; });
      }
      const thirtyAgo = new Date(today);
      thirtyAgo.setDate(thirtyAgo.getDate() - 29);
      if (d < thirtyAgo || d > today) cell.style.opacity = "0.2";
      weekCol.appendChild(cell);
      d.setDate(d.getDate() + 1);
    }
  }

  // Peak hours
  peakBarsRow.innerHTML = "";
  peakLabelsRow.innerHTML = "";
  const maxH = Math.max(1, ...stats.hourlyActivity);
  for (let h = 0; h < 24; h++) {
    const count = stats.hourlyActivity[h] || 0;
    const pct = count / maxH;
    const barHeight = Math.max(2, pct * 76);
    const bar = el("div", {
      flex: "1", height: barHeight + "px", borderRadius: "2px 2px 0 0",
      background: pct > 0.6 ? T.accent : pct > 0.3 ? T.accentDim : "rgba(0, 212, 255, 0.12)",
      transition: "height 0.3s ease", cursor: "pointer", minWidth: "0",
    });
    bar.title = `${h}:00 \u2014 ${count} records`;
    bar.addEventListener("mouseenter", () => { bar.style.opacity = "0.7"; });
    bar.addEventListener("mouseleave", () => { bar.style.opacity = "1"; });
    peakBarsRow.appendChild(bar);

    peakLabelsRow.appendChild(el("div", {
      flex: "1", fontSize: "8px",
      color: h % 2 === 0 ? T.textDim : "transparent",
      textAlign: "center", minWidth: "0",
    }, String(h)));
  }

  // Model breakdown
  modelListWrap.innerHTML = "";
  if (!stats.modelBreakdown || stats.modelBreakdown.length === 0) {
    modelListWrap.appendChild(el("div", { fontSize: "11px", color: T.textDim }, "No data yet"));
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
    modelListWrap.appendChild(row);
  }
});

ctx._analyticsGrid = grid;

return section;
