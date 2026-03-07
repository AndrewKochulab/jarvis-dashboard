// Agent Cards Widget
// Robot avatars, skills pills, status indicators
// Returns: HTMLElement

const { el, T, config, isNarrow, isMedium, isWide, agents, agentCardRefs, CARD_PAD, FONT_SM } = ctx;
const editorApp = config.widgets?.communicationLink?.editorApp || "Cursor";

const section = el("div", {
  position: "relative",
  zIndex: "2",
  marginBottom: isNarrow ? "24px" : "40px",
});

// Title row
const titleRow = el("div", {
  display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px",
});
section.appendChild(titleRow);

titleRow.appendChild(el("div", {
  flex: "0 0 4px", height: "24px", background: T.accent, borderRadius: "2px",
}));

titleRow.appendChild(el("span", {
  fontSize: isNarrow ? "14px" : "18px",
  fontWeight: "700", letterSpacing: "3px",
  textTransform: "uppercase", color: T.text,
}, "Active Agents"));

titleRow.appendChild(el("span", {
  fontSize: "11px", fontWeight: "600", color: T.accent,
  background: "rgba(0,212,255,0.1)",
  padding: "2px 10px", borderRadius: "10px", letterSpacing: "1px",
}, `${agents.length} ONLINE`));

// Grid
const grid = el("div", {
  display: "grid",
  gridTemplateColumns: isNarrow ? "1fr" : (isWide ? "repeat(3, 1fr)" : "1fr"),
  gap: isNarrow ? "12px" : "20px",
});
section.appendChild(grid);

// Robot avatar builder
function buildRobot(agentName, color) {
  const robotWrap = el("div", {
    width: "56px", height: "64px", position: "relative",
    animation: "jarvisBreathing 2.5s ease-in-out infinite", flexShrink: "0",
  });

  // Antenna
  robotWrap.appendChild(el("div", {
    position: "absolute", top: "0", left: "50%", transform: "translateX(-50%)",
    width: "2px", height: "10px", background: color, borderRadius: "1px",
  }));

  robotWrap.appendChild(el("div", {
    position: "absolute", top: "-3px", left: "50%", transform: "translateX(-50%)",
    width: "6px", height: "6px", borderRadius: "50%", background: color,
    boxShadow: `0 0 6px ${color}, 0 0 12px ${color}`,
  }));

  // Head
  const nameHash = agentName.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const headStyle = nameHash % 3;
  const headRadius = headStyle === 0 ? "14px" : headStyle === 1 ? "8px" : "12px 8px";

  const head = el("div", {
    position: "absolute", top: "10px", left: "50%", transform: "translateX(-50%)",
    width: "48px", height: "38px", border: `2px solid ${color}`,
    borderRadius: headRadius, background: "rgba(0,0,0,0.4)",
    boxShadow: `inset 0 0 12px rgba(0,0,0,0.5), 0 0 8px ${color}33`,
    overflow: "hidden",
  });
  robotWrap.appendChild(head);

  // Eyes - style based on name hash
  const eyeStyle = nameHash % 3;
  if (eyeStyle === 0) {
    // Visor style
    const visor = el("div", {
      position: "absolute", top: "12px", left: "6px", right: "6px",
      height: "10px", background: `linear-gradient(90deg, ${color}, ${color}aa, ${color})`,
      borderRadius: "3px", boxShadow: `0 0 8px ${color}, 0 0 16px ${color}66`,
    });
    head.appendChild(visor);
    for (let i = 1; i <= 2; i++) {
      visor.appendChild(el("div", {
        position: "absolute", top: "0", left: `${i * 33}%`,
        width: "1px", height: "100%", background: "rgba(0,0,0,0.3)",
      }));
    }
  } else if (eyeStyle === 1) {
    // Lens style
    const lens = el("div", {
      position: "absolute", top: "8px", left: "50%", transform: "translateX(-50%)",
      width: "18px", height: "18px", borderRadius: "50%",
      border: `2px solid ${color}`,
      background: "radial-gradient(circle, " + color + "44, transparent)",
      animation: "jarvisEyeGlow 2s ease-in-out infinite", color: color,
    });
    head.appendChild(lens);
    lens.appendChild(el("div", {
      position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
      width: "6px", height: "6px", borderRadius: "50%",
      background: color, boxShadow: `0 0 4px ${color}`,
    }));
  } else {
    // Dual dot eyes
    head.appendChild(el("div", {
      position: "absolute", top: "10px", left: "10px",
      width: "8px", height: "8px", borderRadius: "50%", background: color,
      boxShadow: `0 0 6px ${color}, 0 0 12px ${color}66`,
      animation: "jarvisEyeGlow 2.5s ease-in-out infinite", color: color,
    }));
    head.appendChild(el("div", {
      position: "absolute", top: "10px", right: "10px",
      width: "8px", height: "8px", borderRadius: "50%", background: color,
      boxShadow: `0 0 6px ${color}, 0 0 12px ${color}66`,
      animation: "jarvisEyeGlow 2.5s ease-in-out infinite 0.3s", color: color,
    }));
  }

  // Mouth
  const mouth = el("div", {
    position: "absolute", bottom: "6px", left: "50%", transform: "translateX(-50%)",
    width: "20px", display: "flex", flexDirection: "column", gap: "2px", alignItems: "center",
  });
  head.appendChild(mouth);
  for (let i = 0; i < 3; i++) {
    mouth.appendChild(el("div", {
      width: `${20 - i * 4}px`, height: "1px",
      background: color + "66", borderRadius: "1px",
    }));
  }

  // Neck
  robotWrap.appendChild(el("div", {
    position: "absolute", bottom: "4px", left: "50%", transform: "translateX(-50%)",
    width: "12px", height: "6px", background: color + "33",
    borderRadius: "0 0 3px 3px",
    borderLeft: `1px solid ${color}44`, borderRight: `1px solid ${color}44`,
    borderBottom: `1px solid ${color}44`,
  }));

  return robotWrap;
}

// Build cards
agents.forEach((agent, idx) => {
  const agentColor = agent.color || T.accent;
  const skills = agent.skills || [];
  const command = agent.command || "";

  const card = el("div", {
    background: T.panelBg, border: `1px solid ${T.panelBorder}`,
    borderRadius: "12px", padding: CARD_PAD,
    position: "relative", overflow: "hidden",
    animation: `jarvisCardFadeIn 0.5s ease-out ${idx * 0.15}s both`,
    transition: "box-shadow 0.3s ease, border-color 0.3s ease",
    cursor: "pointer",
  });
  card.title = "Click to open agent config";
  grid.appendChild(card);

  card.addEventListener("click", () => {
    const filePath = agent.location === "global"
      ? agent.configPath
      : app.vault.adapter.basePath + "/" + agent.configPath;
    require("child_process").exec(`open -a "${editorApp}" "${filePath}"`);
    new Notice("Opening in " + editorApp + ": " + agent.configPath);
  });

  card.addEventListener("mouseenter", () => {
    card.style.boxShadow = `0 0 20px ${agentColor}22, 0 4px 16px rgba(0,0,0,0.3)`;
    card.style.borderColor = agentColor + "44";
  });
  card.addEventListener("mouseleave", () => {
    const isActive = card.dataset.agentActive === "true";
    card.style.boxShadow = isActive ? `0 0 16px ${agentColor}15, inset 0 0 20px ${agentColor}05` : "none";
    card.style.borderColor = isActive ? agentColor + "35" : T.panelBorder;
  });

  // Accent line
  card.appendChild(el("div", {
    position: "absolute", top: "0", left: "0", right: "0", height: "2px",
    background: `linear-gradient(90deg, transparent, ${agentColor}, transparent)`,
  }));

  // Top row: robot + info
  const topRow = el("div", {
    display: "flex", alignItems: "flex-start", gap: "16px",
    marginBottom: "14px", marginTop: "6px",
  });
  card.appendChild(topRow);

  const robotOuter = el("div", {
    position: "relative", width: "56px", height: "64px", flexShrink: "0",
  });
  topRow.appendChild(robotOuter);

  const robot = buildRobot(agent.name, agentColor);
  robotOuter.appendChild(robot);

  // Glow ring (hidden, shown when active)
  const glowRing = el("div", {
    position: "absolute", top: "6px", left: "50%", transform: "translateX(-50%)",
    width: "46px", height: "46px", borderRadius: "50%",
    background: `radial-gradient(circle, ${agentColor}20 0%, transparent 70%)`,
    boxShadow: `0 0 12px ${agentColor}44, 0 0 24px ${agentColor}22`,
    animation: "jarvisActiveRing 2s ease-in-out infinite",
    display: "none", pointerEvents: "none", zIndex: "0",
  });
  robotOuter.appendChild(glowRing);

  // Orbiting dot (hidden)
  const orbitDot = el("div", {
    position: "absolute", top: "29px", left: "28px",
    width: "4px", height: "4px", marginTop: "-2px", marginLeft: "-2px",
    borderRadius: "50%", background: agentColor,
    boxShadow: `0 0 6px ${agentColor}, 0 0 10px ${agentColor}`,
    animation: "jarvisOrbitDot 3s linear infinite",
    display: "none", pointerEvents: "none", zIndex: "3",
  });
  robotOuter.appendChild(orbitDot);

  // Info column
  const infoCol = el("div", { flex: "1", minWidth: "0" });
  topRow.appendChild(infoCol);

  // Name + badges
  const nameRow = el("div", {
    display: "flex", alignItems: "center", gap: "8px",
    marginBottom: "6px", flexWrap: "wrap",
  });
  infoCol.appendChild(nameRow);

  nameRow.appendChild(el("span", {
    fontSize: isNarrow ? "14px" : "16px", fontWeight: "700", color: T.text,
  }, agent.displayName || agent.name));

  nameRow.appendChild(el("span", {
    fontSize: "9px", fontWeight: "700", letterSpacing: "1.5px",
    color: T.purple, background: "rgba(124,107,255,0.12)",
    padding: "2px 8px", borderRadius: "6px",
    border: "1px solid rgba(124,107,255,0.2)",
    textTransform: "uppercase",
  }, (agent.model || "opus").toUpperCase()));

  const isGlobal = agent.location === "global";
  nameRow.appendChild(el("span", {
    fontSize: "8px", fontWeight: "600", letterSpacing: "1px",
    color: isGlobal ? T.orange : T.green,
    background: isGlobal ? "rgba(255,107,53,0.1)" : "rgba(68,201,143,0.1)",
    padding: "2px 6px", borderRadius: "4px",
    border: `1px solid ${isGlobal ? "rgba(255,107,53,0.2)" : "rgba(68,201,143,0.2)"}`,
    textTransform: "uppercase",
  }, isGlobal ? "GLOBAL" : "VAULT"));

  // Status
  const statusBadge = el("div", {
    display: "flex", alignItems: "center", gap: "5px", marginBottom: "8px",
  });
  infoCol.appendChild(statusBadge);

  const sDot = el("span", {
    width: "6px", height: "6px", borderRadius: "50%",
    background: T.green, display: "inline-block",
    animation: "jarvisPulse 1.5s ease-in-out infinite",
  });
  statusBadge.appendChild(sDot);

  const sText = el("span", {
    fontSize: "10px", fontWeight: "600", letterSpacing: "1.5px",
    textTransform: "uppercase", color: T.green,
  }, "Available");
  statusBadge.appendChild(sText);

  // Description
  infoCol.appendChild(el("div", {
    fontSize: FONT_SM, color: T.textMuted, lineHeight: "1.5", marginBottom: "12px",
  }, agent.description || ""));

  // Command
  if (command) {
    const cmdRow = el("div", {
      display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px",
    });
    infoCol.appendChild(cmdRow);

    cmdRow.appendChild(el("span", {
      fontSize: "10px", color: T.textMuted, fontWeight: "500",
    }, "Command:"));

    cmdRow.appendChild(el("code", {
      fontSize: "11px", fontFamily: "'SF Mono', 'Fira Code', monospace",
      color: T.accent, background: "rgba(0,212,255,0.08)",
      padding: "2px 8px", borderRadius: "4px",
      border: "1px solid rgba(0,212,255,0.15)",
    }, command));
  }

  // Skills pills
  if (skills.length > 0) {
    const pillRow = el("div", { display: "flex", flexWrap: "wrap", gap: "6px" });
    card.appendChild(pillRow);
    skills.forEach(sk => {
      pillRow.appendChild(el("span", {
        fontSize: "9px", fontWeight: "500", letterSpacing: "0.5px",
        color: agentColor, background: agentColor + "12",
        border: `1px solid ${agentColor}25`,
        padding: "2px 8px", borderRadius: "8px", whiteSpace: "nowrap",
      }, sk));
    });
  }

  // Memory freshness
  if (agent.memoryDate) {
    const memRow = el("div", {
      display: "flex", alignItems: "center", gap: "5px",
      marginTop: "12px", paddingTop: "10px",
      borderTop: "1px solid " + T.panelBorder,
    });
    card.appendChild(memRow);

    memRow.appendChild(el("span", { fontSize: "10px", color: T.textDim }, "\u25c8"));

    const memDate = new Date(agent.memoryDate);
    const today = new Date();
    const diffDays = Math.floor((today - memDate) / (1000 * 60 * 60 * 24));
    const agoStr = diffDays === 0 ? "today" : diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
    memRow.appendChild(el("span", {
      fontSize: "10px", color: T.textDim,
    }, `Memory updated ${agoStr}`));
  }

  // Store refs for live session updates
  agentCardRefs.set(agent.name, { card, sDot, sText, robot, glowRing, orbitDot, agentColor });
});

// Store grid ref for responsive resize
ctx._agentsGrid = grid;

return section;
