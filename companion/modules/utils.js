// JARVIS Companion — Shared Pure Utilities

const os = require("os");

function expandPath(p, defaultValue = "") {
  if (!p) return defaultValue;
  if (p.startsWith("~/") || p === "~") return p.replace("~", os.homedir());
  return p;
}

function stripAnsi(str) {
  return str.replace(
    /[\x1B\x9B][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g,
    ""
  );
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

module.exports = { expandPath, stripAnsi, deepMerge };
