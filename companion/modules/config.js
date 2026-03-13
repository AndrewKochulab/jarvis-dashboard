// JARVIS Companion — Configuration Loading
// Loads config.json, merges config.local.json, reads .env token, loads TLS certs.

const fs = require("fs");
const path = require("path");
const { deepMerge } = require("./utils");

function loadConfig(basePath) {
  const configPath = path.resolve(basePath, "../src/config/config.json");
  const localConfigPath = path.resolve(basePath, "../src/config/config.local.json");

  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (e) {
    console.warn("[JARVIS] Could not read config.json:", e.message);
  }

  // Merge local config (contains token and other overrides)
  try {
    const localConfig = JSON.parse(fs.readFileSync(localConfigPath, "utf8"));
    config = deepMerge(config, localConfig);
  } catch {
    // config.local.json is optional
  }

  const networkConfig = config.network || {};
  const companionConfig = config.companion || {};
  const voiceConfig = config.widgets?.voiceCommand || {};
  const ttsConfig = voiceConfig.tts || {};
  const langConfig = config.language || {};
  const port = networkConfig.port ?? 7777;
  const localPort = networkConfig.localPort ?? (port + 1);

  // Load .env for auth token
  const envPath = path.resolve(basePath, ".env");
  let envToken = null;
  try {
    const envContent = fs.readFileSync(envPath, "utf8");
    const match = envContent.match(/^JARVIS_AUTH_TOKEN=(.+)$/m);
    if (match) envToken = match[1].trim();
  } catch {
    // .env is optional if token is in config
  }

  const authToken = envToken || networkConfig.token;
  if (!authToken) {
    throw new Error("No auth token found. Run 'bash setup.sh' first or set network.token in config.");
  }

  // Load TLS certs
  const certsDir = path.resolve(basePath, "certs");
  let tlsOptions = null;
  try {
    tlsOptions = {
      key: fs.readFileSync(path.join(certsDir, "server-key.pem")),
      cert: fs.readFileSync(path.join(certsDir, "server.pem")),
      ca: fs.readFileSync(path.join(certsDir, "jarvis-ca.pem")),
    };
  } catch (e) {
    throw new Error(`TLS certificates not found. Run 'bash setup.sh' first. ${e.message}`);
  }

  return Object.freeze({
    raw: config,
    networkConfig,
    companionConfig,
    voiceConfig,
    ttsConfig,
    langConfig,
    authToken,
    tlsOptions,
    port,
    localPort,
  });
}

module.exports = { loadConfig };
