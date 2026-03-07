// Live Sessions Widget
// Real-time Claude Code session monitoring with subagent tracking
// Returns: HTMLElement (live sessions section)

const { el, T, config, isNarrow, sessionParser, formatModel, describeAction, agentCardRefs } = ctx;

const section = el("div", {
  position: "relative",
  zIndex: "2",
  marginTop: isNarrow ? "24px" : "32px",
  marginBottom: isNarrow ? "24px" : "40px",
});

// Section title
const titleRow = el("div", {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  marginBottom: "16px",
});
section.appendChild(titleRow);

titleRow.appendChild(el("div", {
  flex: "0 0 4px",
  height: "24px",
  background: T.accent,
  borderRadius: "2px",
}));

titleRow.appendChild(el("span", {
  fontSize: isNarrow ? "14px" : "18px",
  fontWeight: "700",
  letterSpacing: "3px",
  textTransform: "uppercase",
  color: T.text,
}, "Live Sessions"));

// Panel
const panel = el("div", {
  background: T.panelBg,
  border: `1px solid ${T.panelBorder}`,
  borderRadius: "12px",
  padding: isNarrow ? "16px" : "20px 24px",
  position: "relative",
  overflow: "hidden",
  transition: "border-color 0.5s ease, box-shadow 0.5s ease",
  animation: "jarvisCardFadeIn 0.5s ease-out 0.2s both",
});
section.appendChild(panel);

const accentLine = el("div", {
  position: "absolute",
  top: "0", left: "0", right: "0", height: "2px",
  background: `linear-gradient(90deg, transparent, ${T.textDim}, transparent)`,
  transition: "background 0.5s ease",
});
panel.appendChild(accentLine);

// Status row
const statusRow = el("div", {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  marginBottom: "0px",
});
panel.appendChild(statusRow);

const liveDot = el("span", {
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  background: T.textDim,
  display: "inline-block",
  flexShrink: "0",
  transition: "background 0.5s, box-shadow 0.5s",
});
statusRow.appendChild(liveDot);

const statusLabel = el("span", {
  fontSize: "11px",
  fontWeight: "600",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: T.textDim,
  transition: "color 0.5s",
}, "No Active Session");
statusRow.appendChild(statusLabel);

const sessionsContainer = el("div", { display: "none" });
panel.appendChild(sessionsContainer);

const hint = el("div", {
  fontSize: "10px",
  color: T.textDim,
  marginTop: "8px",
  letterSpacing: "0.5px",
}, "Launch Claude Code to start monitoring");
panel.appendChild(hint);

function buildSessionRow(session, dotChars, isFirst) {
  const row = el("div", {
    paddingTop: isFirst ? "12px" : "10px",
    paddingBottom: "2px",
    borderTop: `1px solid ${T.panelBorder}`,
    marginTop: isFirst ? "12px" : "0px",
  });

  const line1 = el("div", {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "6px",
    flexWrap: "wrap",
  });
  row.appendChild(line1);

  line1.appendChild(el("span", { fontSize: "12px", color: T.accent }, "\u25b8"));

  if (session.project) {
    line1.appendChild(el("span", {
      fontSize: "9px", fontWeight: "600", letterSpacing: "0.5px",
      color: T.textMuted, background: T.accentFaint,
      padding: "1px 6px", borderRadius: "4px", whiteSpace: "nowrap",
    }, session.project));
  }

  line1.appendChild(el("span", {
    fontSize: isNarrow ? "12px" : "13px",
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    color: T.accent, letterSpacing: "0.5px",
  }, session.slug || "session"));

  line1.appendChild(el("div", { flex: "1" }));

  line1.appendChild(el("span", {
    fontSize: "9px", fontWeight: "700", letterSpacing: "1.5px",
    color: T.purple, background: "rgba(124,107,255,0.12)",
    padding: "2px 8px", borderRadius: "6px",
    border: "1px solid rgba(124,107,255,0.2)",
  }, formatModel(session.model)));

  const age = session.ageSeconds;
  line1.appendChild(el("span", {
    fontSize: "10px", color: T.textMuted,
    fontFamily: "'SF Mono', 'Fira Code', monospace", marginLeft: "4px",
  }, age < 5 ? "just now" : `${age}s ago`));

  const line2 = el("div", {
    display: "flex", alignItems: "center", gap: "8px", paddingLeft: "20px",
  });
  row.appendChild(line2);

  line2.appendChild(el("span", {
    fontSize: isNarrow ? "11px" : "12px", color: T.textMuted,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
  }, describeAction(session.currentTool, session.toolInput, session.stopReason)));

  line2.appendChild(el("span", {
    fontSize: isNarrow ? "11px" : "12px", color: T.accent,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontWeight: "700", minWidth: "18px",
  }, dotChars));

  return row;
}

function buildSubagentRow(subagent, dotChars) {
  const row = el("div", {
    paddingTop: "6px", paddingBottom: "4px",
    marginLeft: "16px", borderLeft: `2px solid ${T.orange}25`, paddingLeft: "12px",
  });

  const line1 = el("div", {
    display: "flex", alignItems: "center", gap: "6px",
    marginBottom: "4px", flexWrap: "wrap",
  });
  row.appendChild(line1);

  line1.appendChild(el("span", { fontSize: "11px", color: T.orange }, "\u21B3"));

  if (subagent.subagentType) {
    line1.appendChild(el("span", {
      fontSize: "8px", fontWeight: "600", letterSpacing: "0.5px",
      color: T.orange, background: "rgba(255,107,53,0.10)",
      padding: "1px 5px", borderRadius: "3px", whiteSpace: "nowrap",
    }, subagent.subagentType));
  }

  const descText = subagent.description || "Subagent task";
  const shortDesc = descText.length > 40 ? descText.slice(0, 40) + "\u2026" : descText;
  line1.appendChild(el("span", {
    fontSize: isNarrow ? "10px" : "11px",
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    color: T.orange, letterSpacing: "0.3px",
  }, shortDesc));

  line1.appendChild(el("div", { flex: "1" }));

  line1.appendChild(el("span", {
    fontSize: "8px", fontWeight: "700", letterSpacing: "1px",
    color: T.purple, background: "rgba(124,107,255,0.08)",
    padding: "1px 6px", borderRadius: "4px",
    border: "1px solid rgba(124,107,255,0.15)",
  }, formatModel(subagent.model)));

  const age = subagent.ageSeconds;
  line1.appendChild(el("span", {
    fontSize: "9px", color: T.textMuted,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
  }, age < 5 ? "now" : `${age}s`));

  const line2 = el("div", {
    display: "flex", alignItems: "center", gap: "6px", paddingLeft: "18px",
  });
  row.appendChild(line2);

  line2.appendChild(el("span", {
    fontSize: isNarrow ? "10px" : "11px", color: T.textMuted,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
  }, describeAction(subagent.currentTool, subagent.toolInput, subagent.stopReason)));

  line2.appendChild(el("span", {
    fontSize: isNarrow ? "10px" : "11px", color: T.orange,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontWeight: "700", minWidth: "14px",
  }, dotChars));

  return row;
}

let dotFrame = 0;

function refresh() {
  const sessions = sessionParser.getAllSessions();
  dotFrame = (dotFrame + 1) % 4;
  const dotChars = ".".repeat(dotFrame || 1);
  const hasActive = sessions.length > 0;

  if (hasActive) {
    liveDot.style.background = T.green;
    liveDot.style.boxShadow = `0 0 6px ${T.green}, 0 0 12px ${T.green}66`;
    liveDot.style.animation = "jarvisPulse 1.5s ease-in-out infinite";
    const totalSubs = sessions.reduce((sum, s) => sum + (s.subagents?.length || 0), 0);
    if (totalSubs > 0) {
      const mainLabel = sessions.length === 1 ? "Live Session" : `Live Sessions (${sessions.length})`;
      statusLabel.textContent = `${mainLabel} + ${totalSubs} agent${totalSubs > 1 ? "s" : ""}`;
    } else {
      statusLabel.textContent = sessions.length === 1 ? "Live Session" : `Live Sessions (${sessions.length})`;
    }
    statusLabel.style.color = T.green;
    accentLine.style.background = `linear-gradient(90deg, transparent, ${T.green}, transparent)`;
    panel.style.borderColor = T.green + "30";
    panel.style.boxShadow = `0 0 20px ${T.green}10, inset 0 0 30px ${T.green}05`;

    sessionsContainer.style.display = "block";
    sessionsContainer.innerHTML = "";
    sessions.forEach((s, i) => {
      sessionsContainer.appendChild(buildSessionRow(s, dotChars, i === 0));
      if (s.subagents?.length > 0) {
        s.subagents.forEach(sub => {
          sessionsContainer.appendChild(buildSubagentRow(sub, dotChars));
        });
      }
    });
    hint.style.display = "none";
  } else {
    liveDot.style.background = T.textDim;
    liveDot.style.boxShadow = "none";
    liveDot.style.animation = "none";
    statusLabel.textContent = "No Active Session";
    statusLabel.style.color = T.textDim;
    accentLine.style.background = `linear-gradient(90deg, transparent, ${T.textDim}, transparent)`;
    panel.style.borderColor = T.panelBorder;
    panel.style.boxShadow = "none";
    sessionsContainer.style.display = "none";
    sessionsContainer.innerHTML = "";
    hint.style.display = "block";
  }

  // Update agent card animations
  if (agentCardRefs.size > 0) {
    const activeAgents = new Set();
    sessions.forEach(s => {
      if (s.activeAgent) activeAgents.add(s.activeAgent);
      if (s.subagents) s.subagents.forEach(sub => {
        if (sub.activeAgent) activeAgents.add(sub.activeAgent);
      });
    });
    agentCardRefs.forEach((refs, name) => {
      const isActive = activeAgents.has(name);
      if (isActive) {
        refs.card.dataset.agentActive = "true";
        refs.glowRing.style.display = "block";
        refs.orbitDot.style.display = "block";
        refs.robot.style.animation = "jarvisBreathing 1.5s ease-in-out infinite";
        refs.sDot.style.background = T.accent;
        refs.sDot.style.boxShadow = `0 0 6px ${T.accent}`;
        refs.sText.textContent = "Working";
        refs.sText.style.color = T.accent;
        refs.card.style.borderColor = refs.agentColor + "35";
        refs.card.style.boxShadow = `0 0 16px ${refs.agentColor}15, inset 0 0 20px ${refs.agentColor}05`;
      } else {
        refs.card.dataset.agentActive = "false";
        refs.glowRing.style.display = "none";
        refs.orbitDot.style.display = "none";
        refs.robot.style.animation = "jarvisBreathing 2.5s ease-in-out infinite";
        refs.sDot.style.background = T.green;
        refs.sDot.style.boxShadow = "none";
        refs.sText.textContent = "Available";
        refs.sText.style.color = T.green;
        refs.card.style.borderColor = T.panelBorder;
        refs.card.style.boxShadow = "none";
      }
    });
  }
}

refresh();
ctx.intervals.push(setInterval(refresh, 3000));

return section;
