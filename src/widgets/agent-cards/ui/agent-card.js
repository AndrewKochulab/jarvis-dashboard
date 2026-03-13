// Agent Card Factory
// Single card with robot avatar, info, skills, memory freshness, and setActive() API
// Returns: { createAgentCard }

const { el, T, config, isNarrow, CARD_PAD, FONT_SM, animationsEnabled, addHoverEffect } = ctx;
const editorApp = config.widgets?.communicationLink?.editorApp || "Cursor";

function loadSub(rel) {
  const code = ctx.nodeFs.readFileSync(
    ctx.nodePath.join(ctx._srcDir, "widgets", "agent-cards", rel), "utf8"
  );
  return new Function("ctx", code)(ctx);
}

const { createRobotAvatar } = loadSub("ui/robot-avatar.js");

function createAgentCard(agent, idx) {
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
    contain: "layout style",
  });
  card.title = "Click to open agent config";

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

  const robot = createRobotAvatar(agent.name, agentColor);
  robotOuter.appendChild(robot);

  // Glow ring (hidden, shown when active)
  const glowRing = el("div", {
    position: "absolute", top: "6px", left: "50%", transform: "translateX(-50%)",
    width: "46px", height: "46px", borderRadius: "50%",
    background: `radial-gradient(circle, ${agentColor}20 0%, transparent 70%)`,
    boxShadow: `0 0 12px ${agentColor}44, 0 0 24px ${agentColor}22`,
    animation: animationsEnabled ? "jarvisActiveRing 2s ease-in-out infinite" : "none",
    display: "none", pointerEvents: "none", zIndex: "0",
    willChange: animationsEnabled ? "transform, opacity" : "auto",
  });
  robotOuter.appendChild(glowRing);

  // Orbiting dot (hidden)
  const orbitDot = el("div", {
    position: "absolute", top: "29px", left: "28px",
    width: "4px", height: "4px", marginTop: "-2px", marginLeft: "-2px",
    borderRadius: "50%", background: agentColor,
    boxShadow: `0 0 6px ${agentColor}, 0 0 10px ${agentColor}`,
    animation: animationsEnabled ? "jarvisOrbitDot 3s linear infinite" : "none",
    display: "none", pointerEvents: "none", zIndex: "3",
    willChange: animationsEnabled ? "transform" : "auto",
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
    animation: animationsEnabled ? "jarvisPulse 1.5s ease-in-out infinite" : "none",
    willChange: animationsEnabled ? "transform, opacity" : "auto",
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

  function setActive(isActive) {
    if (isActive) {
      card.dataset.agentActive = "true";
      glowRing.style.display = animationsEnabled ? "block" : "none";
      orbitDot.style.display = animationsEnabled ? "block" : "none";
      robot.style.animation = animationsEnabled ? "jarvisBreathing 1.5s ease-in-out infinite" : "none";
      sDot.style.background = T.accent;
      sDot.style.boxShadow = `0 0 6px ${T.accent}`;
      sText.textContent = "Working";
      sText.style.color = T.accent;
      card.style.borderColor = agentColor + "35";
      card.style.boxShadow = `0 0 16px ${agentColor}15, inset 0 0 20px ${agentColor}05`;
    } else {
      card.dataset.agentActive = "false";
      glowRing.style.display = "none";
      orbitDot.style.display = "none";
      robot.style.animation = animationsEnabled ? "jarvisBreathing 2.5s ease-in-out infinite" : "none";
      sDot.style.background = T.green;
      sDot.style.boxShadow = "none";
      sText.textContent = "Available";
      sText.style.color = T.green;
      card.style.borderColor = T.panelBorder;
      card.style.boxShadow = "none";
    }
  }

  return {
    el: { card },
    refs: { card, sDot, sText, robot, glowRing, orbitDot, agentColor },
    setActive,
  };
}

return { createAgentCard };
