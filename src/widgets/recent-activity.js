// Recent Activity Widget
// Shows recently modified vault files
// Returns: HTMLElement

const { el, T, config, isNarrow, dv } = ctx;
const actCfg = config.widgets?.recentActivity || {};
const count = actCfg.count || 10;
const excludePatterns = (actCfg.excludePatterns || []).map(p => new RegExp(p));

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
  flex: "0 0 4px", height: "24px", background: T.green, borderRadius: "2px",
}));

titleRow.appendChild(el("span", {
  fontSize: isNarrow ? "14px" : "18px",
  fontWeight: "700", letterSpacing: "3px",
  textTransform: "uppercase", color: T.text,
}, "Recent Activity"));

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
      const row = el("div", {
        display: "flex", alignItems: "center", gap: "12px",
        padding: isNarrow ? "10px 14px" : "12px 24px",
        borderBottom: idx < recentPages.length - 1 ? `1px solid ${T.panelBorder}` : "none",
        cursor: "pointer", transition: "background 0.2s",
      });
      panel.appendChild(row);

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
    });
  } catch {}
}, 150);

return section;
