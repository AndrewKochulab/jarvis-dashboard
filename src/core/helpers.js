// Helper utilities: el(), formatters, describeAction
// Returns: { el, fmtTokens, fmtCost, formatModel, describeAction, getModelFamily }

const { T } = ctx;

function el(tag, styles, text) {
  const e = document.createElement(tag);
  if (styles) Object.assign(e.style, styles);
  if (text !== undefined) e.textContent = text;
  return e;
}

function fmtTokens(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

function fmtCost(n) {
  if (n >= 1000) return "$" + (n / 1000).toFixed(1) + "K";
  return "$" + n.toFixed(2);
}

function getModelFamily(m) {
  if (!m) return "sonnet";
  if (m.includes("opus")) return "opus";
  if (m.includes("haiku")) return "haiku";
  return "sonnet";
}

function formatModel(m) {
  if (!m) return "CLAUDE";
  if (m.includes("opus")) return "OPUS";
  if (m.includes("sonnet")) return "SONNET";
  if (m.includes("haiku")) return "HAIKU";
  return m.split("-").pop()?.toUpperCase() || "CLAUDE";
}

function describeAction(toolName, input, stopReason) {
  if (!toolName) {
    if (stopReason === "end_turn") return "Completed";
    if (stopReason === "tool_use") return "Running tool...";
    return "Thinking...";
  }
  const short = (s, n) => s && s.length > n ? s.slice(0, n) + "\u2026" : s;
  const fname = (p) => p ? p.split("/").pop() : "file";
  const map = {
    Read: () => `Reading ${fname(input?.file_path)}`,
    Edit: () => `Editing ${fname(input?.file_path)}`,
    Write: () => `Writing ${fname(input?.file_path)}`,
    Bash: () => `Running: ${short(input?.command, 30) || "command"}`,
    Glob: () => "Searching files",
    Grep: () => `Searching for "${short(input?.pattern, 20)}"`,
    WebFetch: () => "Fetching web content",
    WebSearch: () => "Searching the web",
    Agent: () => `Subagent: ${short(input?.description, 30) || "task"}`,
    Skill: () => `Skill: ${input?.skill_name || "running"}`,
    ToolSearch: () => "Loading tools",
    AskUserQuestion: () => "Awaiting user input",
    NotebookEdit: () => "Editing notebook",
    LSP: () => "Analyzing code",
    ExitPlanMode: () => "Finalizing plan",
    EnterPlanMode: () => "Entering plan mode",
  };
  return (map[toolName] || (() => `Using ${toolName}`))();
}

return { el, fmtTokens, fmtCost, formatModel, describeAction, getModelFamily };
