// Session Row Builders — Main session and subagent row factories
// Returns: { createSessionRowBuilder }

const { el, T, isNarrow, formatModel, describeAction } = ctx;

function createSessionRowBuilder() {

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

    const dotSpan = el("span", {
      fontSize: isNarrow ? "11px" : "12px", color: T.accent,
      fontFamily: "'SF Mono', 'Fira Code', monospace",
      fontWeight: "700", minWidth: "18px",
    }, dotChars);
    dotSpan.setAttribute("data-dots", "1");
    line2.appendChild(dotSpan);

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

    const subDotSpan = el("span", {
      fontSize: isNarrow ? "10px" : "11px", color: T.orange,
      fontFamily: "'SF Mono', 'Fira Code', monospace",
      fontWeight: "700", minWidth: "14px",
    }, dotChars);
    subDotSpan.setAttribute("data-dots", "1");
    line2.appendChild(subDotSpan);

    return row;
  }

  return { buildSessionRow, buildSubagentRow };
}

return { createSessionRowBuilder };
