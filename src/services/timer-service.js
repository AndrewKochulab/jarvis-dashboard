// Timer Service
// Focus timer state persistence and vault logging
// Returns: { readTimerState, writeTimerState, logFocusSession, sendSystemNotification, getTimerCachePath }

const { nodeFs, nodePath, config } = ctx;

function getTimerCachePath() {
  const rootPath = config.projects.rootPath.startsWith("~")
    ? nodePath.join(require("os").homedir(), config.projects.rootPath.slice(1))
    : config.projects.rootPath;
  const tracked = ctx.sessionParser.getTrackedProjects();
  if (tracked.length === 0) return null;
  return nodePath.join(rootPath, tracked[0].dir, "jarvis-timer-state.json");
}

function readTimerState() {
  try {
    const cachePath = getTimerCachePath();
    if (!cachePath) throw new Error("no path");
    const raw = nodeFs.readFileSync(cachePath, "utf8");
    const s = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    if (s.todayDate !== today) { s.sessionsToday = 0; s.todayDate = today; }
    return s;
  } catch {
    return {
      state: "idle", mode: "work",
      startedAt: null, pausedAt: null, elapsed: 0,
      workDuration: 1800000, breakDuration: 300000,
      sessionsToday: 0, todayDate: new Date().toISOString().slice(0, 10),
    };
  }
}

function writeTimerState(s) {
  try {
    const cachePath = getTimerCachePath();
    if (cachePath) nodeFs.writeFileSync(cachePath, JSON.stringify(s));
  } catch {}
}

function logFocusSession(durationMs, sessionsCount, mode) {
  const logPath = config.widgets?.focusTimer?.logPath || "Work/Productivity";
  const endTime = new Date();
  const dateStr = endTime.toISOString().slice(0, 10);
  const startTime = new Date(endTime.getTime() - durationMs);
  const startStr = String(startTime.getHours()).padStart(2, "0") + ":" + String(startTime.getMinutes()).padStart(2, "0");
  const endStr = String(endTime.getHours()).padStart(2, "0") + ":" + String(endTime.getMinutes()).padStart(2, "0");
  const durationMin = Math.round(durationMs / 60000);
  const typeLabel = mode === "work" ? "Focus" : "Break";

  try {
    const vaultBase = app.vault.adapter.basePath;
    const dirPath = nodePath.join(vaultBase, logPath);
    const filePath = nodePath.join(dirPath, `${dateStr} Focus Log.md`);

    if (!nodeFs.existsSync(dirPath)) nodeFs.mkdirSync(dirPath, { recursive: true });

    if (nodeFs.existsSync(filePath)) {
      const content = nodeFs.readFileSync(filePath, "utf8");
      const lines = content.split("\n");
      const headerIdx = lines.findIndex(l => l.startsWith("| # |"));
      const sepIdx = headerIdx >= 0 ? headerIdx + 1 : -1;
      let dataRows = [];
      if (sepIdx >= 0) {
        for (let i = sepIdx + 1; i < lines.length; i++) {
          if (lines[i].startsWith("| ") && !lines[i].startsWith("| #") && !lines[i].startsWith("|--") && !lines[i].startsWith("|-")) {
            dataRows.push(lines[i]);
          } else break;
        }
      }
      const nextNum = dataRows.length + 1;
      const newRow = `| ${nextNum} | ${typeLabel} | ${startStr} | ${endStr} | ${durationMin} min |`;
      const insertIdx = sepIdx + 1 + dataRows.length;
      lines.splice(insertIdx, 0, newRow);
      dataRows.push(newRow);

      let totalFocus = 0, totalBreak = 0, focusSessions = 0;
      for (const row of dataRows) {
        const durMatch = row.match(/(\d+)\s*min/);
        const dur = durMatch ? parseInt(durMatch[1], 10) : 0;
        if (row.includes("Focus")) { totalFocus += dur; focusSessions++; }
        else if (row.includes("Break")) { totalBreak += dur; }
      }
      const totalTracked = totalFocus + totalBreak;
      const prodScore = totalTracked > 0 ? Math.round((totalFocus / totalTracked) * 100) : 0;

      const summaryIdx = lines.findIndex(l => l.trim() === "## Summary");
      if (summaryIdx >= 0) {
        let endIdx = lines.length;
        for (let i = summaryIdx + 1; i < lines.length; i++) {
          if (lines[i].startsWith("## ") && lines[i].trim() !== "## Summary") { endIdx = i; break; }
        }
        lines.splice(summaryIdx, endIdx - summaryIdx);
      }
      lines.push("", "## Summary", "", "| Metric | Value |", "|--------|-------|",
        `| Total Focus Time | ${totalFocus} min |`,
        `| Total Break Time | ${totalBreak} min |`,
        `| Sessions Completed | ${focusSessions} |`,
        `| Productivity Score | ${prodScore}% |`, "");

      const fmEndIdx = lines.indexOf("---", 1);
      if (fmEndIdx > 0) {
        lines.splice(0, fmEndIdx + 1,
          "---", "tags:", "  - productivity/focus", `date: ${dateStr}`,
          `total_focus_min: ${totalFocus}`, `total_break_min: ${totalBreak}`,
          `sessions_count: ${focusSessions}`, `productivity_score: ${prodScore}`, "---");
      }
      nodeFs.writeFileSync(filePath, lines.join("\n"));
    } else {
      const isFocus = mode === "work";
      const totalFocus = isFocus ? durationMin : 0;
      const totalBreak = isFocus ? 0 : durationMin;
      const focusSessions = isFocus ? 1 : 0;
      const totalTracked = totalFocus + totalBreak;
      const prodScore = totalTracked > 0 ? Math.round((totalFocus / totalTracked) * 100) : 0;
      nodeFs.writeFileSync(filePath, [
        "---", "tags:", "  - productivity/focus", `date: ${dateStr}`,
        `total_focus_min: ${totalFocus}`, `total_break_min: ${totalBreak}`,
        `sessions_count: ${focusSessions}`, `productivity_score: ${prodScore}`, "---",
        "", `# Focus Log \u2014 ${dateStr}`, "",
        "| # | Type | Start | End | Duration |",
        "|---|------|-------|-----|----------|",
        `| 1 | ${typeLabel} | ${startStr} | ${endStr} | ${durationMin} min |`,
        "", "## Summary", "", "| Metric | Value |", "|--------|-------|",
        `| Total Focus Time | ${totalFocus} min |`,
        `| Total Break Time | ${totalBreak} min |`,
        `| Sessions Completed | ${focusSessions} |`,
        `| Productivity Score | ${prodScore}% |`, ""
      ].join("\n"));
    }
  } catch {}
}

function sendSystemNotification(title, body) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body, silent: false });
    }
  } catch {}
}

return { readTimerState, writeTimerState, logFocusSession, sendSystemNotification, getTimerCachePath };
