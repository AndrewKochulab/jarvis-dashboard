// Activity Row — Single file row with click, folder badge, time delta
// Returns: { createActivityRow }

const { el, T, isNarrow } = ctx;

function createActivityRow(page, idx, isLast) {
  const row = el("div", {
    display: "flex", alignItems: "center", gap: "12px",
    padding: isNarrow ? "10px 14px" : "12px 24px",
    borderBottom: isLast ? "none" : `1px solid ${T.panelBorder}`,
    cursor: "pointer", transition: "background 0.2s",
  });

  row.addEventListener("mouseenter", () => { row.style.background = T.hoverBg; });
  row.addEventListener("mouseleave", () => { row.style.background = "transparent"; });
  row.addEventListener("click", () => {
    app.workspace.openLinkText(page.file.path, "/", false);
  });

  row.appendChild(el("span", {
    fontSize: "14px", color: T.green, flexShrink: "0",
  }, "\u25c8"));

  row.appendChild(el("span", {
    fontSize: isNarrow ? "12px" : "13px",
    color: T.text, fontWeight: "500", flex: "1",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  }, page.file.name));

  const folder = page.file.folder || "/";
  row.appendChild(el("span", {
    fontSize: "9px", fontWeight: "500", color: T.textMuted,
    background: "rgba(107,123,141,0.1)",
    padding: "2px 6px", borderRadius: "4px",
    letterSpacing: "0.5px", whiteSpace: "nowrap", flexShrink: "0",
    display: isNarrow ? "none" : "inline",
  }, folder.length > 25 ? "\u2026" + folder.slice(-22) : folder));

  const mtime = new Date(page.file.mtime);
  const diffMs = Date.now() - mtime.getTime();
  let timeStr;
  if (diffMs < 60000) timeStr = "just now";
  else if (diffMs < 3600000) timeStr = Math.floor(diffMs / 60000) + "m ago";
  else if (diffMs < 86400000) timeStr = Math.floor(diffMs / 3600000) + "h ago";
  else timeStr = Math.floor(diffMs / 86400000) + "d ago";

  row.appendChild(el("span", {
    fontSize: "10px", color: T.textDim,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    whiteSpace: "nowrap", flexShrink: "0",
  }, timeStr));

  return { el: { row } };
}

return { createActivityRow };
