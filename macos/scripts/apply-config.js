#!/usr/bin/env node
/**
 * Reads platform.macos settings from config.json and applies them
 * to tauri.conf.json before building.
 *
 * Usage: node macos/scripts/apply-config.js
 */
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..");
const tauriConf = path.join(__dirname, "..", "src-tauri", "tauri.conf.json");
const configPath = path.join(repoRoot, "src", "config", "config.json");
const configExamplePath = path.join(repoRoot, "src", "config", "config.example.json");

// Use config.json if it exists, otherwise fall back to config.example.json
let cfgPath = fs.existsSync(configPath) ? configPath : configExamplePath;
if (!fs.existsSync(cfgPath)) {
  console.log("[apply-config] No config file found — skipping.");
  process.exit(0);
}

if (!fs.existsSync(tauriConf)) {
  console.log("[apply-config] tauri.conf.json not found — skipping.");
  process.exit(0);
}

let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
} catch (err) {
  console.warn("[apply-config] Failed to parse config:", err.message);
  process.exit(0);
}

const macos = cfg.platform?.macos;
if (!macos) {
  console.log("[apply-config] No platform.macos config found — skipping.");
  process.exit(0);
}

let tauri;
try {
  tauri = JSON.parse(fs.readFileSync(tauriConf, "utf8"));
} catch (err) {
  console.warn("[apply-config] Failed to parse tauri.conf.json:", err.message);
  process.exit(1);
}

let changed = false;

if (macos.bundleId) {
  tauri.identifier = macos.bundleId;
  console.log("[apply-config] macOS bundleId →", macos.bundleId);
  changed = true;
}

if (macos.productName) {
  tauri.productName = macos.productName;
  console.log("[apply-config] macOS productName →", macos.productName);
  changed = true;
}

if (changed) {
  fs.writeFileSync(tauriConf, JSON.stringify(tauri, null, 2) + "\n", "utf8");
  console.log("[apply-config] tauri.conf.json updated.");
} else {
  console.log("[apply-config] No changes needed.");
}
