# Security

## Overview

Jarvis Dashboard processes all data locally. No data is sent to external servers. The security model focuses on protecting the WebSocket connection between mobile clients and the companion server.

## TLS Certificates

The companion server uses self-signed TLS certificates for encrypted WebSocket connections (WSS).

### Certificate Chain

```
JARVIS Local CA (jarvis-ca.pem)          — Root CA, 10-year validity, 4096-bit RSA
  └── jarvis-server (server.pem)         — Server cert, 2-year validity, 2048-bit RSA
      └── server-key.pem                 — Server private key
```

### Subject Alternative Names (SAN)

The server certificate includes these SANs by default:

- `DNS:localhost` — Local connections
- `DNS:*.local` — Bonjour/mDNS names (e.g., `my-mac.local`)
- `IP:127.0.0.1` — Loopback
- `IP:<tailscale-ip>` — Added if Tailscale is detected or `--tailscale-ip` is provided

### Generation

Certificates are generated automatically by `companion/setup.sh`:

```bash
# Automatic (recommended)
cd companion && bash setup.sh

# With explicit Tailscale IP
bash setup.sh --tailscale-ip 100.64.1.2
```

The script auto-detects Tailscale IP if installed. See [Certificates](../certificates/README.md) for manual generation and device installation.

### Certificate Locations

| File | Path | Purpose |
|---|---|---|
| CA Certificate | `companion/certs/jarvis-ca.pem` | Install on clients (iOS, macOS) |
| CA Private Key | `companion/certs/jarvis-ca-key.pem` | Signs server certs (keep secure) |
| Server Certificate | `companion/certs/server.pem` | Used by WSS server |
| Server Private Key | `companion/certs/server-key.pem` | Used by WSS server |

All certificate files are gitignored.

## Authentication Token

### Generation

A 64-character hex token is generated during setup:

```bash
openssl rand -hex 32
```

### Storage

| Location | Purpose |
|---|---|
| `companion/.env` | Server reads token from `JARVIS_AUTH_TOKEN` |
| `src/config/config.local.json` | Desktop clients read from `network.token` |
| iOS Keychain | iOS app stores token securely in Keychain |

### Validation

The server validates tokens using timing-safe comparison to prevent timing attacks:

```js
// Constant-time comparison (not vulnerable to short-circuit timing)
crypto.timingSafeEqual(Buffer.from(clientToken), Buffer.from(serverToken))
```

Invalid tokens result in:
- Connection closed with code `4001`
- Connection not counted against rate limits
- No further messages processed

## Rate Limiting

| Setting | Default | Description |
|---|---|---|
| `companion.maxConnections` | `2` | Maximum simultaneous WebSocket connections |
| `companion.rateLimitPerMinute` | `10` | Maximum Claude requests per minute per client |
| `companion.idleTimeoutMs` | `300000` (5 min) | Idle connection timeout |
| `network.audioSizeLimit` | `10485760` (10 MB) | Maximum audio payload size |
| `network.connectionTimeout` | `10000` (10 sec) | Connection establishment timeout |

## Dual-Server Architecture

| Server | Port | Security | Use Case |
|---|---|---|---|
| WSS (TLS) | 7777 | TLS + token auth | Remote connections (iOS, mobile Obsidian) |
| WS (plain) | 7778 | No encryption, localhost only | Local connections (macOS app, desktop Obsidian) |

The local WS server on port 7778 binds to `localhost` only and does not require authentication. It is only accessible from the same machine.

## Credential Storage by Platform

### Obsidian Desktop
- Token stored in `src/config/config.local.json` (gitignored)
- File-based, no encryption at rest
- Protected by file system permissions

### macOS (Tauri)
- Token stored in `src/config/config.local.json`
- App sandboxed by macOS (when signed)
- CSP policy restricts JavaScript execution

### iOS (SwiftUI)
- Token stored in iOS Keychain via `KeychainService.swift`
- Hardware-backed encryption (Secure Enclave on supported devices)
- Survives app reinstalls, protected by device passcode
- Host and port also stored in Keychain

## Tailscale VPN

For remote access (outside local network), Tailscale provides a zero-config VPN:

1. Install Tailscale on both Mac (server) and iOS device
2. Run setup with Tailscale: `bash setup.sh --tailscale-ip <IP>` (or let it auto-detect)
3. The Tailscale IP is added to the certificate's SAN
4. Configure `network.tailscaleHost` in `config.local.json`
5. Connect via `wss://<tailscale-ip>:7777?token=<token>`

Tailscale encrypts traffic end-to-end (WireGuard), adding a second layer on top of TLS.

## Content Security Policy (Tauri)

The macOS Tauri app applies a strict CSP:

```json
{
  "security": {
    "csp": "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'"
  }
}
```

- `unsafe-eval` is required for the `new Function("ctx", code)` module loading system
- `unsafe-inline` is required for dynamic style application
- No external resource loading allowed

## Best Practices

1. **Rotate the auth token** periodically by deleting `companion/.env` and re-running `setup.sh`
2. **Renew certificates** before expiry (2-year server cert) by deleting `companion/certs/` and re-running `setup.sh`
3. **Use Tailscale** for remote access instead of exposing ports directly
4. **Keep config.local.json gitignored** — never commit credentials
5. **Restrict maxConnections** to the number of devices you actually use
6. **Monitor server logs** at `/tmp/jarvis-companion.log` for unauthorized connection attempts
