// Bookmark Card — Single bookmark with icon, label, hover, click-to-launch
// Returns: { createBookmarkCard }

const { el, T, addHoverEffect } = ctx;

function createBookmarkCard(bookmark, animDelay) {
  const bm = bookmark;
  const card = el("div", {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: "8px", padding: "12px 8px", borderRadius: "10px",
    border: `1px solid ${bm.color}20`, background: bm.color + "08",
    cursor: "pointer", transition: "all 0.3s ease",
    animation: `jarvisCardFadeIn 0.3s ease-out ${animDelay}s both`,
  });

  addHoverEffect(card, {
    transform: "scale(1.08)",
    boxShadow: `0 0 16px ${bm.color}33`,
    borderColor: bm.color + "55",
  }, {
    transform: "scale(1)",
    boxShadow: "none",
    borderColor: bm.color + "20",
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

  return { el: { card } };
}

return { createBookmarkCard };
