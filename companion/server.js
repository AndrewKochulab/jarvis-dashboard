// JARVIS Companion Server
// Secure WSS server that handles voice processing for Obsidian mobile.
// Pipeline: audio → ffmpeg → whisper-cpp → claude CLI → TTS → mobile

const { loadConfig } = require("./modules/config");
const { createServer } = require("./modules/server-factory");

try {
  const config = loadConfig(__dirname);
  const server = createServer(config);
  server.start();
} catch (err) {
  console.error(`[JARVIS] Fatal: ${err.message}`);
  process.exit(1);
}
