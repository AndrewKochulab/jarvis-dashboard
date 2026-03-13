// Live Sessions Widget — Orchestrator
// Real-time Claude Code session monitoring with subagent tracking
// Returns: HTMLElement

const { el, T, config, isNarrow, sessionParser, agentCardRefs, animationsEnabled, createSectionTitle } = ctx;

function loadSub(rel) {
  const code = ctx.nodeFs.readFileSync(
    ctx.nodePath.join(ctx._srcDir, "widgets", "live-sessions", rel), "utf8"
  );
  return new Function("ctx", code)(ctx);
}

const { createSessionDiffer } = loadSub("core/session-differ.js");
const { createSessionRowBuilder } = loadSub("ui/session-row.js");
const { createStatusPanel } = loadSub("ui/status-panel.js");

const differ = createSessionDiffer();
const rowBuilder = createSessionRowBuilder();
const statusPanel = createStatusPanel();

const section = el("div", {
  position: "relative",
  zIndex: "2",
  marginTop: isNarrow ? "24px" : "32px",
  marginBottom: isNarrow ? "24px" : "40px",
});

// Section title
section.appendChild(createSectionTitle("Live Sessions"));

section.appendChild(statusPanel.el.panel);

let dotFrame = 0;

function refresh() {
  if (ctx._paused) return;
  if (ctx._jarvisStreaming) {
    dotFrame = (dotFrame + 1) % 4;
    return;
  }
  const sessions = sessionParser.getAllSessions();
  dotFrame = (dotFrame + 1) % 4;
  const dotChars = ".".repeat(dotFrame || 1);
  const hasActive = sessions.length > 0;
  const dataChanged = differ.hasChanged(sessions, hasActive);

  if (hasActive) {
    if (dataChanged) {
      const totalSubs = sessions.reduce((sum, s) => sum + (s.subagents?.length || 0), 0);
      let label;
      if (totalSubs > 0) {
        const mainLabel = sessions.length === 1 ? "Live Session" : `Live Sessions (${sessions.length})`;
        label = `${mainLabel} + ${totalSubs} agent${totalSubs > 1 ? "s" : ""}`;
      } else {
        label = sessions.length === 1 ? "Live Session" : `Live Sessions (${sessions.length})`;
      }
      statusPanel.setActive(label);
      statusPanel.clearRows();
      sessions.forEach((s, i) => {
        statusPanel.appendRow(rowBuilder.buildSessionRow(s, dotChars, i === 0));
        if (s.subagents?.length > 0) {
          s.subagents.forEach(sub => {
            statusPanel.appendRow(rowBuilder.buildSubagentRow(sub, dotChars));
          });
        }
      });
    } else {
      statusPanel.el.sessionsContainer.querySelectorAll("[data-dots]").forEach(el => {
        el.textContent = dotChars;
      });
    }
  } else {
    if (dataChanged) {
      statusPanel.setInactive();
    }
  }

  // Update agent card animations (only when data changed)
  if (dataChanged && agentCardRefs.size > 0) {
    const activeAgents = new Set();
    sessions.forEach(s => {
      if (s.activeAgent) activeAgents.add(s.activeAgent);
      if (s.subagents) s.subagents.forEach(sub => {
        if (sub.activeAgent) activeAgents.add(sub.activeAgent);
      });
    });
    agentCardRefs.forEach((refs, name) => {
      const isActive = activeAgents.has(name);
      if (refs.setActive) {
        refs.setActive(isActive);
      }
    });
  }
}

refresh();
const liveSessionsInterval = config.performance?.liveSessionsIntervalMs || 3000;
let liveId = setInterval(refresh, liveSessionsInterval);
ctx.intervals.push(liveId);

// Register with pausable system
ctx.registerPausable(
  () => {
    refresh();
    liveId = setInterval(refresh, liveSessionsInterval);
    ctx.intervals.push(liveId);
  },
  () => { clearInterval(liveId); }
);

return section;
