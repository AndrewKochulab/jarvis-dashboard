// Helper utilities: el(), formatters, describeAction, addHoverEffect, createSectionTitle
// Returns: { el, fmtTokens, fmtCost, formatModel, describeAction, getModelFamily, addHoverEffect, createSectionTitle }

const { T, isNarrow } = ctx;

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

function addHoverEffect(element, hoverStyles, defaultStyles) {
  element.addEventListener("mouseenter", () => Object.assign(element.style, hoverStyles));
  element.addEventListener("mouseleave", () => Object.assign(element.style, defaultStyles));
}

function createSectionTitle(title, options = {}) {
  const { color = T.accent, badge = null, marginBottom = "16px" } = options;
  const row = el("div", { display: "flex", alignItems: "center", gap: "12px", marginBottom });
  row.appendChild(el("div", { flex: "0 0 4px", height: "24px", background: color, borderRadius: "2px" }));
  row.appendChild(el("span", {
    fontSize: isNarrow ? "14px" : "18px", fontWeight: "700",
    letterSpacing: "3px", textTransform: "uppercase", color: T.text,
  }, title));
  if (badge) {
    row.appendChild(el("span", {
      fontSize: badge.fontSize || "11px", fontWeight: "600",
      color: badge.color || T.accent, background: badge.bg || "rgba(0,212,255,0.1)",
      padding: "2px 10px", borderRadius: "10px", letterSpacing: "1px",
    }, badge.text));
  }
  return row;
}

return { el, fmtTokens, fmtCost, formatModel, describeAction, getModelFamily, addHoverEffect, createSectionTitle };
