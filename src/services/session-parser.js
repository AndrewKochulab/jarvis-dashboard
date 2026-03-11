// Session Parser Service
// Reads Claude Code JSONL transcripts, detects active sessions & subagents
// Returns: { getAllSessions, isClaudeProcessRunning }

const { nodeFs, nodePath, config, agentNames, skillToAgent } = ctx;

const agentCache = new Map();
const subagentDescCache = new Map();
const sessionFileCache = new Map(); // filePath -> { mtimeMs, result }
const subagentDirCache = new Map(); // subagentsDir -> { mtimeMs, files }
let discoveredProjects = null;
let discoveredAt = 0;
const SCAN_CACHE_MS = config.performance?.projectDiscoveryCacheMs || 300000;

// Cache for isClaudeProcessRunning() to avoid spawning pgrep every cycle
let _processCache = null;
let _processCacheAt = 0;
const PROCESS_CACHE_MS = config.performance?.processCheckCacheMs || 10000;

function expandHome(p) {
  if (p.startsWith("~")) {
    return nodePath.join(require("os").homedir(), p.slice(1));
  }
  return p;
}

function getTrackedProjects() {
  if (config.projects.mode === "manual") {
    return config.projects.tracked || [];
  }
  if (discoveredProjects && Date.now() - discoveredAt < SCAN_CACHE_MS) {
    return discoveredProjects;
  }
  const rootPath = expandHome(config.projects.rootPath);
  discoveredProjects = [];
  try {
    const entries = nodeFs.readdirSync(rootPath);
    for (const entry of entries) {
      if (!entry.startsWith("-")) continue;
      const fullPath = nodePath.join(rootPath, entry);
      try {
        const stat = nodeFs.statSync(fullPath);
        if (!stat.isDirectory()) continue;
        const parts = entry.split("-").filter(Boolean);
        const label = parts[parts.length - 1] || entry;
        discoveredProjects.push({ dir: entry, label });
      } catch {}
    }
  } catch {}
  discoveredAt = Date.now();
  return discoveredProjects;
}

function isClaudeProcessRunning() {
  if (_processCache !== null && Date.now() - _processCacheAt < PROCESS_CACHE_MS) {
    return _processCache;
  }
  try {
    const out = require("child_process").execSync(
      "pgrep -fa 'claude' 2>/dev/null || true",
      { encoding: "utf8", timeout: 3000 }
    );
    _processCache = out.split("\n").some(line =>
      line.includes("/claude") && !line.includes("pgrep")
    );
  } catch { _processCache = false; }
  _processCacheAt = Date.now();
  return _processCache;
}

function parseSessionFile(filePath, ageSeconds) {
  try {
    const stat = nodeFs.statSync(filePath);
    const readSize = Math.min(stat.size, 32768);
    const buf = Buffer.alloc(readSize);
    const fd = nodeFs.openSync(filePath, "r");
    nodeFs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
    nodeFs.closeSync(fd);

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
              if (block.name === "Agent" && block.input?.subagent_type && agentNames.has(block.input.subagent_type)) {
                activeAgent = block.input.subagent_type;
              } else if (block.name === "Skill" && block.input?.skill_name && skillToAgent.has(block.input.skill_name)) {
                activeAgent = skillToAgent.get(block.input.skill_name);
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
        const fd2 = nodeFs.openSync(filePath, "r");
        nodeFs.readSync(fd2, headBuf, 0, headSize, 0);
        nodeFs.closeSync(fd2);
        const headLines = headBuf.toString("utf8").split("\n").filter(Boolean);
        for (let i = 0; i < headLines.length; i++) {
          try {
            if (!headLines[i].startsWith("{")) continue;
            const rec = JSON.parse(headLines[i]);
            if (rec.type === "assistant" && rec.message?.content) {
              for (const block of rec.message.content) {
                if (block.type !== "tool_use") continue;
                if (block.name === "Agent" && block.input?.subagent_type && agentNames.has(block.input.subagent_type)) {
                  activeAgent = block.input.subagent_type;
                } else if (block.name === "Skill" && block.input?.skill_name && skillToAgent.has(block.input.skill_name)) {
                  activeAgent = skillToAgent.get(block.input.skill_name);
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

function getSubagentDescriptions(mainSessionPath) {
  try {
    const stat = nodeFs.statSync(mainSessionPath);
    const readSize = Math.min(stat.size, 65536);
    const buf = Buffer.alloc(readSize);
    const fd = nodeFs.openSync(mainSessionPath, "r");
    nodeFs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
    nodeFs.closeSync(fd);

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
      const fd2 = nodeFs.openSync(mainSessionPath, "r");
      nodeFs.readSync(fd2, headBuf, 0, headSize, 0);
      nodeFs.closeSync(fd2);
      scanLines(headBuf.toString("utf8").split("\n").filter(Boolean));
    }
  } catch {}
}

function getSubagentsForSession(projPath, sessionFileName, processRunning) {
  try {
    const sessionUuid = sessionFileName.replace(".jsonl", "");
    const subagentsDir = nodePath.join(projPath, sessionUuid, "subagents");
    if (!nodeFs.existsSync(subagentsDir)) return [];

    const files = nodeFs.readdirSync(subagentsDir)
      .filter(f => f.startsWith("agent-") && f.endsWith(".jsonl"))
      .map(f => {
        try { return { name: f, mtime: nodeFs.statSync(nodePath.join(subagentsDir, f)).mtimeMs }; }
        catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);

    const subagents = [];
    for (const file of files) {
      const age = (Date.now() - file.mtime) / 1000;
      if (age > 30 && !processRunning) continue;
      if (age > 120) continue;

      const fp = nodePath.join(subagentsDir, file.name);

      // Use mtime-based cache for subagent files too
      const cached = sessionFileCache.get(fp);
      let info;
      if (cached && cached.mtimeMs === file.mtime) {
        info = cached.result ? { ...cached.result, ageSeconds: Math.round(age) } : null;
      } else {
        info = parseSessionFile(fp, age);
        sessionFileCache.set(fp, { mtimeMs: file.mtime, result: info });
      }

      if (info) {
        const agentId = file.name.replace("agent-", "").replace(".jsonl", "");
        info.isSubagent = true;
        info.agentId = agentId;

        let desc = subagentDescCache.get(agentId);
        if (!desc) {
          try {
            const metaPath = nodePath.join(subagentsDir, file.name.replace(".jsonl", ".meta.json"));
            const meta = JSON.parse(nodeFs.readFileSync(metaPath, "utf8"));
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

function getAllSessions() {
  try {
    const processRunning = isClaudeProcessRunning();
    const sessions = [];
    const activeFiles = new Set();
    const rootPath = expandHome(config.projects.rootPath);
    const trackedProjects = getTrackedProjects();

    for (const proj of trackedProjects) {
      const projPath = nodePath.join(rootPath, proj.dir);
      let files;
      try {
        files = nodeFs.readdirSync(projPath)
          .filter(f => f.endsWith(".jsonl"))
          .map(f => {
            try { return { name: f, mtime: nodeFs.statSync(nodePath.join(projPath, f)).mtimeMs }; }
            catch { return null; }
          })
          .filter(Boolean)
          .sort((a, b) => b.mtime - a.mtime);
      } catch { continue; }

      for (const file of files) {
        const age = (Date.now() - file.mtime) / 1000;
        if (age > 30 && !processRunning) continue;
        if (age > 120) continue;
        const fp = nodePath.join(projPath, file.name);

        // Use mtime-based cache to avoid re-reading unchanged files
        const cached = sessionFileCache.get(fp);
        let info;
        if (cached && cached.mtimeMs === file.mtime) {
          info = cached.result ? { ...cached.result, ageSeconds: Math.round(age) } : null;
        } else {
          info = parseSessionFile(fp, age);
          sessionFileCache.set(fp, { mtimeMs: file.mtime, result: info });
        }

        if (info) {
          info.project = proj.label;
          getSubagentDescriptions(fp);
          info.subagents = getSubagentsForSession(projPath, file.name, processRunning);
          for (const sub of info.subagents) {
            sub.project = proj.label;
          }
          sessions.push(info);
          activeFiles.add(fp);
        }
      }
    }

    for (const key of agentCache.keys()) {
      if (!activeFiles.has(key)) agentCache.delete(key);
    }
    return sessions.sort((a, b) => a.ageSeconds - b.ageSeconds);
  } catch { return []; }
}

return { getAllSessions, isClaudeProcessRunning, getTrackedProjects };
