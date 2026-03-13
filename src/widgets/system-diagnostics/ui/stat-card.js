// Stat Card Factory — Single stat card (icon, value, label, sub-text)
// Returns: { createStatCard }

const { el, T, isNarrow } = ctx;

function createStatCard(definition, idx) {
  const card = el("div", {
    background: T.panelBg,
    border: `1px solid ${T.panelBorder}`,
    borderRadius: "10px",
    padding: isNarrow ? "14px 12px" : "18px 20px",
    position: "relative", overflow: "hidden",
    animation: `jarvisCardFadeIn 0.5s ease-out ${0.3 + idx * 0.1}s both`,
  });

  card.appendChild(el("div", {
    position: "absolute", top: "0", left: "0", right: "0", height: "2px",
    background: `linear-gradient(90deg, transparent, ${definition.color}, transparent)`,
  }));

  const valRow = el("div", {
    display: "flex", alignItems: "center", gap: "8px",
    marginBottom: "6px", marginTop: "4px",
  });
  card.appendChild(valRow);

  valRow.appendChild(el("span", { fontSize: "12px", color: definition.color }, definition.icon));

  const valEl = el("span", {
    fontSize: isNarrow ? "20px" : "24px",
    fontWeight: "800", color: T.text,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    letterSpacing: "1px",
  }, "...");
  valRow.appendChild(valEl);

  card.appendChild(el("div", {
    fontSize: "10px", fontWeight: "600", letterSpacing: "1.5px",
    textTransform: "uppercase", color: T.textMuted,
  }, definition.label));

  const sub = el("div", {
    fontSize: "9px", color: T.textDim, marginTop: "4px", letterSpacing: "0.5px",
  }, "");
  card.appendChild(sub);

  function setValue(val) { valEl.textContent = val; }
  function setSubText(text) { sub.textContent = text; }

  return { el: { card }, setValue, setSubText };
}

return { createStatCard };
