// Heatmap Panel — 30-day activity heatmap
// Returns: { createHeatmapPanel }

const { el, T, isNarrow } = ctx;

function createHeatmapPanel() {
  const panel = el("div", {
    background: T.panelBg, border: `1px solid ${T.panelBorder}`,
    borderRadius: "12px", padding: isNarrow ? "16px 14px" : "20px 24px",
    position: "relative", overflow: "hidden",
    animation: "jarvisCardFadeIn 0.5s ease-out 0.5s both",
  });

  panel.appendChild(el("div", {
    position: "absolute", top: "0", left: "0", right: "0", height: "2px",
    background: `linear-gradient(90deg, transparent, ${T.green}, transparent)`,
  }));

  panel.appendChild(el("div", {
    fontSize: "11px", fontWeight: "700", letterSpacing: "2px",
    textTransform: "uppercase", color: T.textMuted,
    marginBottom: "14px", marginTop: "4px",
  }, "Activity Heatmap"));

  const heatmapContainer = el("div", {
    display: "flex", alignItems: "flex-start", gap: "6px",
  });
  panel.appendChild(heatmapContainer);

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

  function update(stats) {
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
  }

  return { el: panel, update };
}

return { createHeatmapPanel };
