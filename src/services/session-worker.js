// Session Worker — runs heavy I/O in a background thread
// Handles: session parsing, subagent scanning, pgrep, stats computation
// Communicates with main thread via postMessage/onmessage

const { parentPort, workerData } = require("worker_threads");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const os = require("os");

// ── Caches (persisted within worker lifetime) ──
const sessionFileCache = new Map();
const agentCache = new Map();
const subagentDescCache = new Map();
const subDescFileCache = new Map();

let _processCache = false;
let _processCacheAt = 0;

function expandHome(p) {
  if (p.startsWith("~")) return path.join(os.homedir(), p.slice(1));
  return p;
}

// ── Process detection ──
function isClaudeProcessRunning(cacheMs) {
  if (Date.now() - _processCacheAt < cacheMs) return _processCache;
  try {
    const out = execSync("pgrep -fa 'claude' 2>/dev/null || true", { encoding: "utf8", timeout: 3000 });
    _processCache = out.split("\n").some(line => line.includes("/claude") && !line.includes("pgrep"));
  } catch { _processCache = false; }
  _processCacheAt = Date.now();
  return _processCache;
}

// ── Session file parsing ──
function parseSessionFile(filePath, ageSeconds, agentNames, skillToAgent) {
  try {
    const stat = fs.statSync(filePath);
    const readSize = Math.min(stat.size, 32768);
    const buf = Buffer.alloc(readSize);
    const fd = fs.openSync(filePath, "r");
    fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
    fs.closeSync(fd);

    const lines = buf.toString("utf8").split("\n").filter(Boolean);
    let slug = null, model = null, currentTool = null, toolInput = null;
    let activeAgent = null, lastStopReason = null;

    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        if (!lines[i].startsWith("{")) continue;
        const rec = JSON.parse(lines[i]);
        if (rec.type === "assistant" && rec.message?.stop_reason === "end_turn") return null;
        if (rec.type === "system" && rec.subtype === "turn_duration") return null;
        break;
      } catch {}
    }

    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        if (!lines[i].startsWith("{")) continue;
        const rec = JSON.parse(lines[i]);
        if (!slug && rec.slug) slug = rec.slug;
        if (!model && rec.message?.model) model = rec.message.model;
        if (!lastStopReason && rec.type === "assistant" && rec.message?.stop_reason) {
          lastStopReason = rec.message.stop_reason;
        }
        if (rec.type === "assistant" && rec.message?.content) {
          for (const block of rec.message.content) {
            if (block.type !== "tool_use") continue;
            if (!currentTool) {
              currentTool = block.name;
              toolInput = block.input;
            }
            if (!activeAgent) {
              if (block.name === "Agent" && block.input?.subagent_type && agentNames.includes(block.input.subagent_type)) {
                activeAgent = block.input.subagent_type;
              } else if (block.name === "Skill" && block.input?.skill_name && skillToAgent[block.input.skill_name]) {
                activeAgent = skillToAgent[block.input.skill_name];
              }
            }
          }
        }
        if (slug && currentTool && activeAgent && lastStopReason) break;
      } catch {}
    }

    if (!activeAgent) {
      if (agentCache.has(filePath)) {
        activeAgent = agentCache.get(filePath);
      } else if (stat.size > readSize) {
        const headSize = Math.min(stat.size, 24576);
        const headBuf = Buffer.alloc(headSize);
        const fd2 = fs.openSync(filePath, "r");
        fs.readSync(fd2, headBuf, 0, headSize, 0);
        fs.closeSync(fd2);
        const headLines = headBuf.toString("utf8").split("\n").filter(Boolean);
        for (let i = 0; i < headLines.length; i++) {
          try {
            if (!headLines[i].startsWith("{")) continue;
            const rec = JSON.parse(headLines[i]);
            if (rec.type === "assistant" && rec.message?.content) {
              for (const block of rec.message.content) {
                if (block.type !== "tool_use") continue;
                if (block.name === "Agent" && block.input?.subagent_type && agentNames.includes(block.input.subagent_type)) {
                  activeAgent = block.input.subagent_type;
                } else if (block.name === "Skill" && block.input?.skill_name && skillToAgent[block.input.skill_name]) {
                  activeAgent = skillToAgent[block.input.skill_name];
                }
                if (activeAgent) break;
              }
            }
            if (activeAgent) break;
          } catch {}
        }
      }
    }
    if (activeAgent) agentCache.set(filePath, activeAgent);

    return { slug, model, currentTool, toolInput, activeAgent, stopReason: lastStopReason, ageSeconds: Math.round(ageSeconds) };
  } catch { return null; }
}

// ── Subagent description scanning with mtime cache ──
function getSubagentDescriptions(mainSessionPath) {
  try {
    const stat = fs.statSync(mainSessionPath);
    const cached = subDescFileCache.get(mainSessionPath);
    if (cached && cached.mtimeMs === stat.mtimeMs) return;

    const readSize = Math.min(stat.size, 65536);
    const buf = Buffer.alloc(readSize);
    const fd = fs.openSync(mainSessionPath, "r");
    fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
    fs.closeSync(fd);

    const lines = buf.toString("utf8").split("\n").filter(Boolean);
    const toolUseMap = new Map();

    function scanLines(lineArr) {
      for (const line of lineArr) {
        try {
          if (!line.startsWith("{")) continue;
          const rec = JSON.parse(line);
          if (rec.type === "assistant" && rec.message?.content) {
            for (const block of rec.message.content) {
              if (block.type === "tool_use" && block.name === "Agent" && block.input?.description) {
                toolUseMap.set(block.id, {
                  description: block.input.description,
                  subagentType: block.input.subagent_type || null,
                });
              }
            }
          }
          if (rec.type === "progress" && rec.data?.type === "agent_progress" && rec.data.agentId && rec.parentToolUseID) {
            const info = toolUseMap.get(rec.parentToolUseID);
            if (info) subagentDescCache.set(rec.data.agentId, info);
          }
          if (rec.type === "user" && rec.message?.content) {
            for (const block of rec.message.content) {
              if (block.toolUseResult?.agentId && block.tool_use_id) {
                const info = toolUseMap.get(block.tool_use_id);
                if (info) subagentDescCache.set(block.toolUseResult.agentId, info);
              }
            }
          }
        } catch {}
      }
    }

    scanLines(lines);

    if (stat.size > readSize) {
      const headSize = Math.min(stat.size, 32768);
      const headBuf = Buffer.alloc(headSize);
      const fd2 = fs.openSync(mainSessionPath, "r");
      fs.readSync(fd2, headBuf, 0, headSize, 0);
      fs.closeSync(fd2);
      scanLines(headBuf.toString("utf8").split("\n").filter(Boolean));
    }

    subDescFileCache.set(mainSessionPath, { mtimeMs: stat.mtimeMs });
  } catch {}
}

// ── Subagent session scanning ──
function getSubagentsForSession(projPath, sessionFileName, processRunning, agentNames, skillToAgent) {
  try {
    const sessionUuid = sessionFileName.replace(".jsonl", "");
    const subagentsDir = path.join(projPath, sessionUuid, "subagents");
    if (!fs.existsSync(subagentsDir)) return [];

    const files = fs.readdirSync(subagentsDir)
      .filter(f => f.startsWith("agent-") && f.endsWith(".jsonl"))
      .map(f => {
        try { return { name: f, mtime: fs.statSync(path.join(subagentsDir, f)).mtimeMs }; }
        catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);

    const subagents = [];
    for (const file of files) {
      const age = (Date.now() - file.mtime) / 1000;
      if (age > 30 && !processRunning) continue;
      if (age > 120) continue;

      const fp = path.join(subagentsDir, file.name);
      const cached = sessionFileCache.get(fp);
      let info;
      if (cached && cached.mtimeMs === file.mtime) {
        info = cached.result ? { ...cached.result, ageSeconds: Math.round(age) } : null;
      } else {
        info = parseSessionFile(fp, age, agentNames, skillToAgent);
        sessionFileCache.set(fp, { mtimeMs: file.mtime, result: info });
      }

      if (info) {
        const agentId = file.name.replace("agent-", "").replace(".jsonl", "");
        info.isSubagent = true;
        info.agentId = agentId;
        let desc = subagentDescCache.get(agentId);
        if (!desc) {
          try {
            const metaPath = path.join(subagentsDir, file.name.replace(".jsonl", ".meta.json"));
            const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
            desc = { description: null, subagentType: meta.agentType || null };
          } catch {}
        }
        info.description = desc?.description || `Task ${agentId.slice(0, 7)}`;
        info.subagentType = desc?.subagentType || null;
        subagents.push(info);
      }
    }
    return subagents;
  } catch { return []; }
}

// ── Stats computation ──
function getModelFamily(model) {
  if (!model) return "sonnet";
  const m = model.toLowerCase();
  if (m.includes("opus")) return "opus";
  if (m.includes("haiku")) return "haiku";
  return "sonnet";
}

function parseFullSession(filePath, pricing) {
  try {
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n").filter(Boolean);

    let slug = null, model = null, startTime = null, endTime = null;
    let messages = 0, toolCalls = 0, inputTokens = 0, outputTokens = 0;
    const hours = {};

    for (let i = 0; i < lines.length; i++) {
      try {
        if (!lines[i].startsWith("{")) continue;
        const rec = JSON.parse(lines[i]);
        if (!slug && rec.slug) slug = rec.slug;
        if (rec.timestamp) {
          if (!startTime) startTime = rec.timestamp;
          endTime = rec.timestamp;
          const h = new Date(rec.timestamp).getHours();
          hours[h] = (hours[h] || 0) + 1;
        }
        if (rec.type === "assistant" || rec.type === "user") messages++;
        if (rec.type === "assistant" && rec.message) {
          if (!model && rec.message.model) model = rec.message.model;
          if (rec.message.usage) {
            inputTokens += rec.message.usage.input_tokens || 0;
            outputTokens += rec.message.usage.output_tokens || 0;
          }
          if (rec.message.content) {
            for (const block of rec.message.content) {
              if (block.type === "tool_use") toolCalls++;
            }
          }
        }
      } catch {}
    }

    const family = getModelFamily(model);
    const rates = pricing[family] || pricing.sonnet;
    const cost = (inputTokens * rates.input + outputTokens * rates.output) / 1e6;

    return { mtime: stat.mtimeMs, slug, model, startTime, endTime, messages, toolCalls, inputTokens, outputTokens, cost, hours };
  } catch {
    return { mtime: 0, slug: null, model: null, startTime: null, endTime: null, messages: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0, cost: 0, hours: {} };
  }
}

function computeStats(config) {
  const pricing = config.pricing || {
    opus: { input: 15, output: 75 },
    sonnet: { input: 3, output: 15 },
    haiku: { input: 0.80, output: 4 },
  };

  const rootPath = expandHome(config.projects.rootPath);
  let tracked;
  if (config.projects.mode === "manual") {
    tracked = config.projects.tracked || [];
  } else {
    tracked = [];
    try {
      const entries = fs.readdirSync(rootPath);
      for (const entry of entries) {
        if (!entry.startsWith("-")) continue;
        try {
          if (!fs.statSync(path.join(rootPath, entry)).isDirectory()) continue;
          const parts = entry.split("-").filter(Boolean);
          tracked.push({ dir: entry, label: parts[parts.length - 1] || entry });
        } catch {}
      }
    } catch {}
  }

  if (tracked.length === 0) return aggregateStats({ sessions: {} });

  const statsDir = path.join(rootPath, tracked[0].dir);
  const cachePath = path.join(statsDir, "jarvis-dashboard-cache.json");
  let cache = { computedAt: 0, sessions: {} };
  try { cache = JSON.parse(fs.readFileSync(cachePath, "utf8")); } catch {}

  const cacheDuration = config.widgets?.systemDiagnostics?.cacheDurationMs || 300000;
  if (Date.now() - cache.computedAt < cacheDuration) return aggregateStats(cache);

  const periodDays = config.widgets?.systemDiagnostics?.periodDays || 30;
  const cutoff = Date.now() - periodDays * 86400000;
  let files;
  try {
    files = fs.readdirSync(statsDir)
      .filter(f => f.endsWith(".jsonl"))
      .map(f => { try { return { name: f, mtime: fs.statSync(path.join(statsDir, f)).mtimeMs }; } catch { return null; } })
      .filter(f => f && f.mtime >= cutoff);
  } catch { return aggregateStats(cache); }

  const newCache = { computedAt: Date.now(), sessions: {} };
  for (const file of files) {
    if (cache.sessions[file.name] && cache.sessions[file.name].mtime === file.mtime) {
      newCache.sessions[file.name] = cache.sessions[file.name];
    } else {
      newCache.sessions[file.name] = parseFullSession(path.join(statsDir, file.name), pricing);
    }
  }

  try { fs.writeFileSync(cachePath, JSON.stringify(newCache)); } catch {}
  return aggregateStats(newCache);
}

function aggregateStats(cache) {
  const entries = Object.values(cache.sessions);
  let totalSessions = entries.length;
  let totalMessages = 0, totalTokens = 0, totalCost = 0, totalToolCalls = 0;
  const modelCounts = {};
  const dailyActivity = {};
  const hourlyActivity = new Array(24).fill(0);

  for (const s of entries) {
    totalMessages += s.messages || 0;
    totalTokens += (s.inputTokens || 0) + (s.outputTokens || 0);
    totalCost += s.cost || 0;
    totalToolCalls += s.toolCalls || 0;

    const fam = getModelFamily(s.model);
    modelCounts[fam] = (modelCounts[fam] || 0) + 1;

    if (s.startTime) {
      const dateKey = s.startTime.slice(0, 10);
      if (!dailyActivity[dateKey]) dailyActivity[dateKey] = { messages: 0, sessions: 0 };
      dailyActivity[dateKey].messages += s.messages || 0;
      dailyActivity[dateKey].sessions += 1;
    }

    if (s.hours) {
      for (const [h, count] of Object.entries(s.hours)) {
        hourlyActivity[Number(h)] += count;
      }
    }
  }

  let favoriteModel = "sonnet";
  let maxCount = 0;
  for (const [m, c] of Object.entries(modelCounts)) {
    if (c > maxCount) { maxCount = c; favoriteModel = m; }
  }
  const favPct = totalSessions > 0 ? Math.round((maxCount / totalSessions) * 100) : 0;

  const modelCosts = {};
  for (const s of entries) {
    const fam = getModelFamily(s.model);
    modelCosts[fam] = (modelCosts[fam] || 0) + (s.cost || 0);
  }

  const modelBreakdown = Object.entries(modelCounts).map(([model, count]) => ({
    model, count,
    pct: totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0,
    cost: modelCosts[model] || 0,
  })).sort((a, b) => b.count - a.count);

  return { totalSessions, totalMessages, totalTokens, totalCost, totalToolCalls, favoriteModel, favPct, dailyActivity, hourlyActivity, modelBreakdown };
}

// ── Message handler ──
parentPort.on("message", (msg) => {
  try {
    if (msg.type === "parseSessions") {
      const { projects, rootPath, agentNames, skillToAgent, processCheckCacheMs } = msg;
      const processRunning = isClaudeProcessRunning(processCheckCacheMs || 10000);
      const sessions = [];
      const activeFiles = new Set();

      for (const proj of projects) {
        const projPath = path.join(rootPath, proj.dir);
        let files;
        try {
          files = fs.readdirSync(projPath)
            .filter(f => f.endsWith(".jsonl"))
            .map(f => {
              try { return { name: f, mtime: fs.statSync(path.join(projPath, f)).mtimeMs }; }
              catch { return null; }
            })
            .filter(Boolean)
            .sort((a, b) => b.mtime - a.mtime);
        } catch { continue; }

        for (const file of files) {
          const age = (Date.now() - file.mtime) / 1000;
          if (age > 30 && !processRunning) continue;
          if (age > 120) continue;
          const fp = path.join(projPath, file.name);

          const cached = sessionFileCache.get(fp);
          let info;
          if (cached && cached.mtimeMs === file.mtime) {
            info = cached.result ? { ...cached.result, ageSeconds: Math.round(age) } : null;
          } else {
            info = parseSessionFile(fp, age, agentNames, skillToAgent);
            sessionFileCache.set(fp, { mtimeMs: file.mtime, result: info });
          }

          if (info) {
            info.project = proj.label;
            getSubagentDescriptions(fp);
            info.subagents = getSubagentsForSession(projPath, file.name, processRunning, agentNames, skillToAgent);
            for (const sub of info.subagents) sub.project = proj.label;
            sessions.push(info);
            activeFiles.add(fp);
          }
        }
      }

      for (const key of agentCache.keys()) {
        if (!activeFiles.has(key)) agentCache.delete(key);
      }

      parentPort.postMessage({
        type: "sessions",
        sessions: sessions.sort((a, b) => a.ageSeconds - b.ageSeconds),
        processRunning,
      });
    }

    if (msg.type === "computeStats") {
      const stats = computeStats(msg.config);
      parentPort.postMessage({ type: "stats", stats });
    }
  } catch (e) {
    parentPort.postMessage({ type: "error", error: e.message });
  }
});
