// Quick Launch Widget
// Bookmarks grid for apps and URLs, with optional group headers
// Returns: HTMLElement

const { el, T, config, isNarrow } = ctx;
const qlConfig = config.widgets?.quickLaunch || {};

// Normalize: support both flat bookmarks array (legacy) and groups array (new)
let groups;
if (qlConfig.groups && Array.isArray(qlConfig.groups)) {
  groups = qlConfig.groups;
} else if (qlConfig.bookmarks && Array.isArray(qlConfig.bookmarks)) {
  groups = [{ name: null, bookmarks: qlConfig.bookmarks }];
} else {
  groups = [];
}

// Show group headers only when multiple groups exist
const showHeaders = groups.length > 1;

const section = el("div", {
  background: T.panelBg, border: `1px solid ${T.panelBorder}`,
  borderRadius: "12px", padding: isNarrow ? "16px 14px" : "20px 24px",
  position: "relative", overflow: "hidden",
  animation: "jarvisCardFadeIn 0.5s ease-out 0.4s both",
});

section.appendChild(el("div", {
  position: "absolute", top: "0", left: "0", right: "0", height: "2px",
  background: `linear-gradient(90deg, transparent, ${T.orange}, transparent)`,
}));

section.appendChild(el("div", {
  fontSize: "11px", fontWeight: "700", letterSpacing: "2px",
  textTransform: "uppercase", color: T.textMuted,
  marginBottom: "16px", marginTop: "4px",
}, "Quick Launch"));

let globalIdx = 0;
const groupRefs = [];

groups.forEach((group, groupIdx) => {
  const bms = group.bookmarks || [];
  if (bms.length === 0) return;

  // Group header (only in multi-group mode)
  if (showHeaders && group.name) {
    section.appendChild(el("div", {
      fontSize: "9px", fontWeight: "600", letterSpacing: "1.5px",
      textTransform: "uppercase", color: T.textDim,
      marginTop: groupIdx === 0 ? "0" : "12px",
      marginBottom: "8px", paddingLeft: "2px",
    }, group.name));
  }

  const grid = el("div", {
    display: "grid",
    gridTemplateColumns: isNarrow ? "repeat(3, 1fr)" : `repeat(${Math.min(bms.length, 4)}, 1fr)`,
    gap: "10px",
    marginBottom: showHeaders ? "6px" : "0",
  });
  section.appendChild(grid);
  groupRefs.push({ el: grid, count: bms.length });

  bms.forEach((bm) => {
    const card = el("div", {
      display: "flex", flexDirection: "column", alignItems: "center",
      gap: "8px", padding: "12px 8px", borderRadius: "10px",
      border: `1px solid ${bm.color}20`, background: bm.color + "08",
      cursor: "pointer", transition: "all 0.3s ease",
      animation: `jarvisCardFadeIn 0.3s ease-out ${0.4 + globalIdx * 0.06}s both`,
    });
    grid.appendChild(card);

    card.addEventListener("mouseenter", () => {
      card.style.transform = "scale(1.08)";
      card.style.boxShadow = `0 0 16px ${bm.color}33`;
      card.style.borderColor = bm.color + "55";
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "scale(1)";
      card.style.boxShadow = "none";
      card.style.borderColor = bm.color + "20";
    });

    card.addEventListener("click", () => {
      if (bm.type === "app") {
        require("child_process").execFile("open", ["-a", bm.target]);
        new Notice(`Launching ${bm.name}...`);
      } else {
        require("child_process").execFile("open", [bm.target]);
        new Notice(`Opening ${bm.name}...`);
      }
    });

    card.appendChild(el("div", {
      width: "36px", height: "36px", borderRadius: "50%",
      border: `2px solid ${bm.color}55`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "16px", color: bm.color, background: bm.color + "0a",
    }, bm.icon));

    card.appendChild(el("div", {
      fontSize: "9px", fontWeight: "600", letterSpacing: "1px",
      textTransform: "uppercase", color: T.textMuted, textAlign: "center",
    }, bm.name));

    globalIdx++;
  });
});

ctx._bookmarkGroups = groupRefs;

return section;
