// Peak Hours Panel — 24-hour bar chart
// Returns: { createPeakHoursPanel }

const { el, T, isNarrow } = ctx;

function createPeakHoursPanel() {
  const panel = el("div", {
    background: T.panelBg, border: `1px solid ${T.panelBorder}`,
    borderRadius: "12px", padding: isNarrow ? "16px 14px" : "20px 24px",
    position: "relative", overflow: "hidden",
    animation: "jarvisCardFadeIn 0.5s ease-out 0.6s both",
  });

  panel.appendChild(el("div", {
    position: "absolute", top: "0", left: "0", right: "0", height: "2px",
    background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)`,
  }));

  panel.appendChild(el("div", {
    fontSize: "11px", fontWeight: "700", letterSpacing: "2px",
    textTransform: "uppercase", color: T.textMuted,
    marginBottom: "14px", marginTop: "4px",
  }, "Peak Hours"));

  const chartWrap = el("div", { display: "flex", flexDirection: "column", gap: "6px" });
  panel.appendChild(chartWrap);

  const barsRow = el("div", {
    display: "flex", alignItems: "flex-end", gap: "2px", height: "80px",
  });
  chartWrap.appendChild(barsRow);

  const labelsRow = el("div", { display: "flex", gap: "2px" });
  chartWrap.appendChild(labelsRow);

  function update(stats) {
    barsRow.innerHTML = "";
    labelsRow.innerHTML = "";
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
      barsRow.appendChild(bar);

      labelsRow.appendChild(el("div", {
        flex: "1", fontSize: "8px",
        color: h % 2 === 0 ? T.textDim : "transparent",
        textAlign: "center", minWidth: "0",
      }, String(h)));
    }
  }

  return { el: panel, update };
}

return { createPeakHoursPanel };
