// Nav Button — Single dashboard navigation button
// Returns: { createNavButton }

const { el, T, isNarrow, addHoverEffect } = ctx;

function createNavButton(dashboard, idx) {
  const dash = dashboard;
  const btn = el("div", {
    background: T.panelBg, border: `1px solid ${dash.color}25`,
    borderRadius: "10px", padding: isNarrow ? "14px 16px" : "18px 24px",
    display: "flex", alignItems: "center", gap: "14px",
    cursor: "pointer", transition: "all 0.3s ease",
    animation: `jarvisCardFadeIn 0.4s ease-out ${0.5 + idx * 0.1}s both`,
  });

  addHoverEffect(btn, {
    transform: "scale(1.02)",
    boxShadow: `0 0 16px ${dash.color}22, 0 4px 12px rgba(0,0,0,0.2)`,
    borderColor: dash.color + "55",
  }, {
    transform: "scale(1)",
    boxShadow: "none",
    borderColor: dash.color + "25",
  });

  btn.addEventListener("click", () => {
    app.workspace.openLinkText(dash.path, "/", false);
  });

  btn.appendChild(el("div", {
    width: "42px", height: "42px", borderRadius: "50%",
    border: `2px solid ${dash.color}55`,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "18px", flexShrink: "0",
    color: dash.color, background: dash.color + "0a",
  }, dash.icon));

  const textWrap = el("div", { flex: "1" });
  btn.appendChild(textWrap);

  textWrap.appendChild(el("div", {
    fontSize: isNarrow ? "13px" : "15px",
    fontWeight: "600", color: T.text, marginBottom: "2px",
  }, dash.name));

  textWrap.appendChild(el("div", {
    fontSize: "10px", color: T.textMuted, letterSpacing: "0.5px",
  }, "Open dashboard \u2192"));

  const arrow = el("span", {
    fontSize: "18px", color: dash.color + "66", transition: "color 0.3s",
  }, "\u203a");
  btn.appendChild(arrow);

  btn.addEventListener("mouseenter", () => { arrow.style.color = dash.color; });
  btn.addEventListener("mouseleave", () => { arrow.style.color = dash.color + "66"; });

  return { el: { btn } };
}

return { createNavButton };
