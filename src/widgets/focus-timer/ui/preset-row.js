// Preset Row — Selectable duration pill row
// Returns: { createPresetRow }

const { el, T } = ctx;

function createPresetRow(label, presets, initialMs, onSelect) {
  const row = el("div", {
    display: "flex", alignItems: "center", gap: "6px",
    justifyContent: "center", flexWrap: "wrap",
  });
  row.appendChild(el("span", {
    fontSize: "9px", color: T.textDim, letterSpacing: "1px",
    marginRight: "4px", minWidth: "36px",
  }, label));

  const pills = [];
  presets.forEach(p => {
    const selected = p.ms === initialMs;
    const pill = el("span", {
      fontSize: "10px", fontWeight: "600", letterSpacing: "0.5px",
      color: selected ? T.bg : T.accent,
      background: selected ? T.accent : "rgba(0,212,255,0.08)",
      border: `1px solid ${T.accent}33`,
      padding: "3px 10px", borderRadius: "10px",
      cursor: "pointer", transition: "all 0.2s ease",
    }, p.label);
    pill.dataset.selected = selected ? "1" : "0";
    pill.addEventListener("click", () => {
      onSelect(p.ms);
      pills.forEach((pl, i) => {
        const isSel = presets[i].ms === p.ms;
        pl.style.color = isSel ? T.bg : T.accent;
        pl.style.background = isSel ? T.accent : "rgba(0,212,255,0.08)";
        pl.dataset.selected = isSel ? "1" : "0";
      });
    });
    pill.addEventListener("mouseenter", () => { if (pill.dataset.selected !== "1") pill.style.background = "rgba(0,212,255,0.15)"; });
    pill.addEventListener("mouseleave", () => { if (pill.dataset.selected !== "1") pill.style.background = "rgba(0,212,255,0.08)"; });
    pills.push(pill);
    row.appendChild(pill);
  });

  function setSelected(ms) {
    pills.forEach((pl, i) => {
      const isSel = presets[i].ms === ms;
      pl.style.color = isSel ? T.bg : T.accent;
      pl.style.background = isSel ? T.accent : "rgba(0,212,255,0.08)";
      pl.dataset.selected = isSel ? "1" : "0";
    });
  }

  return { el: { row }, setSelected };
}

return { createPresetRow };
