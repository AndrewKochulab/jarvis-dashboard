// Stats Engine Service
// 30-day analytics computation with file-based caching
// Returns: { computeStats }

const { nodeFs, nodePath, config } = ctx;
const { getModelFamily, fmtTokens, fmtCost } = ctx;

const pricing = config.pricing || {
  opus:   { input: 15, output: 75 },
  sonnet: { input: 3, output: 15 },
  haiku:  { input: 0.80, output: 4 },
};

function getStatsDir() {
  const rootPath = config.projects.rootPath.startsWith("~")
    ? nodePath.join(require("os").homedir(), config.projects.rootPath.slice(1))
    : config.projects.rootPath;
  const tracked = ctx.sessionParser.getTrackedProjects();
  if (tracked.length === 0) return null;
  return nodePath.join(rootPath, tracked[0].dir);
}

function parseFullSession(filePath) {
  try {
    const stat = nodeFs.statSync(filePath);
    const content = nodeFs.readFileSync(filePath, "utf8");
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
  } catch { return { mtime: 0, slug: null, model: null, startTime: null, endTime: null, messages: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0, cost: 0, hours: {} }; }
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
    model,
    count,
    pct: totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0,
    cost: modelCosts[model] || 0,
  })).sort((a, b) => b.count - a.count);

  return { totalSessions, totalMessages, totalTokens, totalCost, totalToolCalls, favoriteModel, favPct, dailyActivity, hourlyActivity, modelBreakdown };
}

function computeStats() {
  const statsDir = getStatsDir();
  if (!statsDir) return aggregateStats({ sessions: {} });

  const cachePath = nodePath.join(statsDir, "jarvis-dashboard-cache.json");
  let cache = { computedAt: 0, sessions: {} };
  try { cache = JSON.parse(nodeFs.readFileSync(cachePath, "utf8")); } catch {}

  const cacheDuration = config.widgets?.systemDiagnostics?.cacheDurationMs || 300000;
  if (Date.now() - cache.computedAt < cacheDuration) return aggregateStats(cache);

  const periodDays = config.widgets?.systemDiagnostics?.periodDays || 30;
  const cutoff = Date.now() - periodDays * 86400000;
  let files;
  try {
    files = nodeFs.readdirSync(statsDir)
      .filter(f => f.endsWith(".jsonl"))
      .map(f => { try { return { name: f, mtime: nodeFs.statSync(nodePath.join(statsDir, f)).mtimeMs }; } catch { return null; } })
      .filter(f => f && f.mtime >= cutoff);
  } catch { return aggregateStats(cache); }

  const newCache = { computedAt: Date.now(), sessions: {} };
  for (const file of files) {
    if (cache.sessions[file.name] && cache.sessions[file.name].mtime === file.mtime) {
      newCache.sessions[file.name] = cache.sessions[file.name];
    } else {
      newCache.sessions[file.name] = parseFullSession(nodePath.join(statsDir, file.name));
    }
  }

  try { nodeFs.writeFileSync(cachePath, JSON.stringify(newCache)); } catch {}
  return aggregateStats(newCache);
}

return { computeStats };
