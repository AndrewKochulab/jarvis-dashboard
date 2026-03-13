// Session Differ — Pure hash-based change detection (no DOM)
// Returns: { createSessionDiffer }

function createSessionDiffer() {
  let lastHash = "";

  function hasChanged(sessions, hasActive) {
    const hash = sessions.map(s =>
      `${s.slug}|${s.model}|${s.currentTool}|${s.ageSeconds > 5 ? "o" : "n"}|${(s.subagents || []).map(sub =>
        `${sub.slug}|${sub.model}|${sub.currentTool}|${sub.ageSeconds > 5 ? "o" : "n"}`
      ).join(",")}`
    ).join(";") + "|" + hasActive;
    const changed = hash !== lastHash;
    lastHash = hash;
    return changed;
  }

  return { hasChanged };
}

return { createSessionDiffer };
