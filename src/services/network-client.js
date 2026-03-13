// Network Client Service
// WebSocket client for connecting to the JARVIS companion server (WSS + token auth).
// Works in both desktop Obsidian (Electron) and mobile Obsidian (WKWebView).
// Desktop: connects to localhost, disables TLS verification for self-signed certs.
// Mobile: connects to configured host, relies on installed CA cert.
// Returns: service API object

const networkConfig = ctx.config?.network || {};
const localConfig = ctx._localConfig?.network || {};
const mergedConfig = { ...networkConfig, ...localConfig };

// Desktop detection: if nodeFs is available, we're on desktop (Electron)
const isDesktop = !!ctx.nodeFs;

// On desktop, use plain ws:// to localhost (avoids TLS cert issues in Electron)
// On mobile, use wss:// to configured remote host with installed CA cert
const wsProtocol = isDesktop ? "ws" : "wss";
const host = isDesktop ? "localhost" : (mergedConfig.tailscaleHost || mergedConfig.host || "localhost");
const port = isDesktop ? (mergedConfig.localPort || 7778) : (mergedConfig.port || 7777);
const token = mergedConfig.token || "";
const autoConnect = mergedConfig.autoConnect !== false;
const heartbeatInterval = mergedConfig.heartbeatInterval || 30000;
const reconnectMaxDelay = mergedConfig.reconnectMaxDelay || 30000;
const connectionTimeout = mergedConfig.connectionTimeout || 10000;

let ws = null;
let state = "disconnected"; // disconnected | connecting | connected | reconnecting
let intentionalDisconnect = false;
let reconnectAttempt = 0;
let reconnectTimer = null;
let heartbeatTimer = null;
let pongTimer = null;

const handlers = {}; // type → [callback]
const stateListeners = [];

function setState(newState) {
  state = newState;
  for (const cb of stateListeners) { try { cb(state); } catch {} }
  // Report to native bridge (iOS)
  if (typeof window !== "undefined" && window.__reportConnectionStatus) {
    try { window.__reportConnectionStatus(newState); } catch {}
  }
}

function on(type, fn) {
  if (!handlers[type]) handlers[type] = [];
  handlers[type].push(fn);
}

function off(type, fn) {
  if (handlers[type]) {
    handlers[type] = handlers[type].filter(cb => cb !== fn);
  }
}

function emit(type, data) {
  const cbs = handlers[type] || [];
  for (const cb of cbs) { try { cb(data); } catch {} }
}

function connect() {
  if (state === "connected" || state === "connecting") return;
  if (!token) {
    console.warn("[NetworkClient] No auth token configured");
    setState("disconnected");
    return;
  }

  intentionalDisconnect = false;
  setState(reconnectAttempt > 0 ? "reconnecting" : "connecting");

  const url = `${wsProtocol}://${host}:${port}?token=${encodeURIComponent(token)}`;

  try {
    ws = new WebSocket(url);
  } catch (e) {
    console.error("[NetworkClient] WebSocket creation failed:", e.message);
    setState("disconnected");
    scheduleReconnect();
    return;
  }

  const timeout = setTimeout(() => {
    if (state !== "connected") {
      console.warn("[NetworkClient] Connection timeout");
      try { ws.close(); } catch {}
      setState("disconnected");
      scheduleReconnect();
    }
  }, connectionTimeout);

  function onOpen() {
    clearTimeout(timeout);
    reconnectAttempt = 0;
    setState("connected");
    startHeartbeat();
    console.log("[NetworkClient] Connected to companion server");
  }

  function onMessage(event) {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    emit(msg.type, msg);
    if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
  }

  function onClose() {
    clearTimeout(timeout);
    stopHeartbeat();
    ws = null;
    if (!intentionalDisconnect) {
      setState("disconnected");
      scheduleReconnect();
    } else {
      setState("disconnected");
    }
  }

  function onError() {
    clearTimeout(timeout);
    console.error("[NetworkClient] WebSocket error");
  }

  ws.onopen = onOpen;
  ws.onmessage = onMessage;
  ws.onclose = onClose;
  ws.onerror = onError;
}

function disconnect() {
  intentionalDisconnect = true;
  clearReconnectTimer();
  stopHeartbeat();
  if (ws) {
    try { ws.close(); } catch {}
    ws = null;
  }
  setState("disconnected");
}

const WS_OPEN = 1; // WebSocket.OPEN === 1

function send(obj) {
  if (ws && ws.readyState === WS_OPEN) {
    ws.send(JSON.stringify(obj));
    return true;
  }
  return false;
}

function sendBinary(data) {
  if (ws && ws.readyState === WS_OPEN) {
    ws.send(data);
    return true;
  }
  return false;
}

// ── Reconnect with exponential backoff + jitter ──

function scheduleReconnect() {
  if (intentionalDisconnect) return;
  clearReconnectTimer();
  reconnectAttempt++;

  const baseDelay = Math.min(1000 * Math.pow(2, reconnectAttempt - 1), reconnectMaxDelay);
  const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1); // ±20%
  const delay = Math.max(100, Math.round(baseDelay + jitter));

  console.log(`[NetworkClient] Reconnecting in ${delay}ms (attempt ${reconnectAttempt})`);
  setState("reconnecting");

  reconnectTimer = setTimeout(() => {
    if (!intentionalDisconnect) connect();
  }, delay);
}

function clearReconnectTimer() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
}

// ── Heartbeat ──

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WS_OPEN) {
      send({ type: "ping" });

      // If no pong within 10s, connection is dead
      pongTimer = setTimeout(() => {
        console.warn("[NetworkClient] Pong timeout — connection dead");
        try { ws.close(); } catch {}
      }, 10000);
    }
  }, heartbeatInterval);
}

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
}

// ── iOS visibility change handling ──

if (typeof document !== "undefined") {
  const visHandler = () => {
    if (document.visibilityState === "visible") {
      // Force-close any stale WebSocket (iOS may kill the connection in background
      // without firing onclose, leaving ws in a broken state)
      clearReconnectTimer();
      intentionalDisconnect = false;
      if (ws) {
        try { ws.onclose = null; ws.onerror = null; ws.close(); } catch {}
        ws = null;
      }
      stopHeartbeat();
      reconnectAttempt = 0;
      setState("disconnected");
      connect();
    }
  };
  document.addEventListener("visibilitychange", visHandler);
  if (ctx.cleanups) {
    ctx.cleanups.push(() => document.removeEventListener("visibilitychange", visHandler));
  }
}

// ── Auto-connect ──
if (autoConnect && token) {
  connect();
}

// ── Cleanup ──
function cleanup() {
  disconnect();
  for (const type of Object.keys(handlers)) handlers[type] = [];
  stateListeners.length = 0;
}

if (ctx.cleanups) ctx.cleanups.push(cleanup);

return {
  connect,
  disconnect,
  send,
  sendBinary,
  sendAudioStart: (format, sampleRate, sessionId, projectPath) => send({ type: "audio_start", format, sampleRate, sessionId: sessionId || undefined, projectPath: projectPath || undefined }),
  sendAudioEnd: () => send({ type: "audio_end" }),
  sendTextCommand: (text, sessionId, projectPath) => send({ type: "text_command", text, sessionId: sessionId || undefined, projectPath: projectPath || undefined }),
  sendCancel: () => send({ type: "cancel" }),
  sendNewSession: () => send({ type: "new_session" }),
  sendPing: () => send({ type: "ping" }),
  sendPermissionResponse: (requestId, behavior, updatedPermissions) => send({ type: "permission_response", requestId, behavior, ...(updatedPermissions ? { updatedPermissions } : {}) }),
  sendQuestionResponse: (requestId, answer) => send({ type: "question_response", requestId, answer }),
  on,
  off,
  onStateChange: (cb) => stateListeners.push(cb),
  cleanup,
  get state() { return state; },
  get isConnected() { return state === "connected"; },
  get reconnectAttempt() { return reconnectAttempt; },
};
