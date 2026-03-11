// JARVIS Companion — Authentication & Rate Limiting
// Token validation (timing-safe), connection limits, rate limiting, idle timeout.

const crypto = require("crypto");

class Auth {
  constructor(config) {
    this._token = config.token || null;
    this._maxConnections = config.maxConnections ?? 2;
    this._rateLimitPerMinute = config.rateLimitPerMinute ?? 10;
    this._idleTimeoutMs = config.idleTimeoutMs ?? 300000; // 5 minutes
    this._connections = new Set();
    this._attempts = new Map(); // ip → [timestamps]
    this._cleanupInterval = setInterval(() => this._cleanupAttempts(), 60000);
  }

  // Validate token using constant-time comparison (prevents timing attacks)
  validateToken(candidateToken) {
    if (!this._token || !candidateToken) return false;
    const expected = Buffer.from(this._token, "utf8");
    const candidate = Buffer.from(candidateToken, "utf8");
    if (expected.length !== candidate.length) return false;
    return crypto.timingSafeEqual(expected, candidate);
  }

  // Extract token from upgrade request URL query string
  extractToken(req) {
    try {
      const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
      return url.searchParams.get("token");
    } catch {
      return null;
    }
  }

  // Extract client IP from request
  getClientIP(req) {
    return (
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown"
    );
  }

  // Check if connection count is under the limit
  checkConnectionLimit() {
    return this._connections.size < this._maxConnections;
  }

  // Check rate limit for an IP
  checkRateLimit(ip) {
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const attempts = this._attempts.get(ip) || [];
    const recent = attempts.filter((t) => now - t < windowMs);
    this._attempts.set(ip, recent);
    if (recent.length >= this._rateLimitPerMinute) return false;
    recent.push(now);
    return true;
  }

  // Register a new active connection
  registerConnection(ws) {
    this._connections.add(ws);
    ws.on("close", () => this._connections.delete(ws));
  }

  // Set up idle timeout on a connection
  setupIdleTimeout(ws) {
    let lastActivity = Date.now();

    const resetActivity = () => {
      lastActivity = Date.now();
    };

    ws._resetActivity = resetActivity;

    const checker = setInterval(() => {
      if (Date.now() - lastActivity > this._idleTimeoutMs) {
        console.log("[AUTH] Closing idle connection");
        ws.close(4000, "Idle timeout");
        clearInterval(checker);
      }
    }, 30000);

    ws.on("close", () => clearInterval(checker));
    return resetActivity;
  }

  get connectionCount() {
    return this._connections.size;
  }

  // Full verification for incoming upgrade request
  verifyClient(req) {
    const ip = this.getClientIP(req);

    if (!this.checkRateLimit(ip)) {
      console.log(`[AUTH] Rate limit exceeded for ${ip}`);
      return { allowed: false, code: 429, message: "Too many attempts" };
    }

    const token = this.extractToken(req);
    if (!this.validateToken(token)) {
      console.log(`[AUTH] Invalid token from ${ip}`);
      return { allowed: false, code: 401, message: "Unauthorized" };
    }

    if (!this.checkConnectionLimit()) {
      console.log(`[AUTH] Connection limit reached (${this._connections.size}/${this._maxConnections})`);
      return { allowed: false, code: 403, message: "Too many connections" };
    }

    return { allowed: true };
  }

  _cleanupAttempts() {
    const now = Date.now();
    for (const [ip, attempts] of this._attempts) {
      const recent = attempts.filter((t) => now - t < 60000);
      if (recent.length === 0) {
        this._attempts.delete(ip);
      } else {
        this._attempts.set(ip, recent);
      }
    }
  }

  destroy() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }
}

module.exports = Auth;
