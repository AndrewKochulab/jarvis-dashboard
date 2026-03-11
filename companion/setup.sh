#!/bin/bash
# JARVIS Companion — Setup Script
# Generates TLS certificates, auth token, and installs dependencies.
# Usage: bash setup.sh [--tailscale-ip <IP>]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERTS_DIR="$SCRIPT_DIR/certs"
ENV_FILE="$SCRIPT_DIR/.env"
CONFIG_DIR="$SCRIPT_DIR/../src/config"
LOCAL_CONFIG="$CONFIG_DIR/config.local.json"

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   JARVIS Companion — Setup           ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# ── Parse arguments ──
TAILSCALE_IP=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --tailscale-ip)
      TAILSCALE_IP="$2"
      shift 2
      ;;
    *)
      echo -e "${RED}Unknown argument: $1${NC}"
      exit 1
      ;;
  esac
done

# ── Check prerequisites ──
echo -e "${CYAN}[1/6] Checking prerequisites...${NC}"

check_tool() {
  if command -v "$1" &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} $1 found: $(which $1)"
  else
    echo -e "  ${RED}✗${NC} $1 not found. Install with: $2"
    return 1
  fi
}

MISSING=0
check_tool "node" "brew install node" || MISSING=1
check_tool "openssl" "brew install openssl" || MISSING=1
check_tool "ffmpeg" "brew install ffmpeg" || MISSING=1

# whisper-cli is optional (text commands still work without it)
if command -v whisper-cli &>/dev/null || [ -f "/opt/homebrew/bin/whisper-cli" ]; then
  echo -e "  ${GREEN}✓${NC} whisper-cli found"
else
  echo -e "  ${YELLOW}!${NC} whisper-cli not found (voice commands will be unavailable, text commands still work)"
  echo -e "    Install with: brew install whisper-cpp"
fi

if [ $MISSING -eq 1 ]; then
  echo -e "\n${RED}Missing prerequisites. Please install them and re-run setup.${NC}"
  exit 1
fi

# ── Generate TLS certificates ──
echo ""
echo -e "${CYAN}[2/6] Generating TLS certificates...${NC}"

mkdir -p "$CERTS_DIR"

if [ -f "$CERTS_DIR/jarvis-ca.pem" ] && [ -f "$CERTS_DIR/server.pem" ]; then
  echo -e "  ${YELLOW}!${NC} Certificates already exist. Skipping generation."
  echo "    To regenerate, delete $CERTS_DIR and re-run setup."
else
  # Generate CA key + certificate
  openssl genrsa -out "$CERTS_DIR/jarvis-ca-key.pem" 4096 2>/dev/null
  openssl req -x509 -new -nodes \
    -key "$CERTS_DIR/jarvis-ca-key.pem" \
    -sha256 -days 3650 \
    -out "$CERTS_DIR/jarvis-ca.pem" \
    -subj "/CN=JARVIS Local CA" 2>/dev/null
  echo -e "  ${GREEN}✓${NC} CA certificate generated (10-year validity)"

  # Build SAN extension
  SAN="DNS:localhost,DNS:*.local,IP:127.0.0.1"
  if [ -n "$TAILSCALE_IP" ]; then
    SAN="$SAN,IP:$TAILSCALE_IP"
    echo -e "  ${GREEN}✓${NC} Tailscale IP added to certificate: $TAILSCALE_IP"
  fi

  # Auto-detect Tailscale IP if available and not provided
  if [ -z "$TAILSCALE_IP" ] && command -v tailscale &>/dev/null; then
    DETECTED_IP=$(tailscale ip -4 2>/dev/null || true)
    if [ -n "$DETECTED_IP" ]; then
      SAN="$SAN,IP:$DETECTED_IP"
      TAILSCALE_IP="$DETECTED_IP"
      echo -e "  ${GREEN}✓${NC} Auto-detected Tailscale IP: $DETECTED_IP"
    fi
  fi

  # Generate server key + CSR + signed certificate
  openssl genrsa -out "$CERTS_DIR/server-key.pem" 2048 2>/dev/null
  openssl req -new \
    -key "$CERTS_DIR/server-key.pem" \
    -out "$CERTS_DIR/server.csr" \
    -subj "/CN=jarvis-server" 2>/dev/null

  openssl x509 -req \
    -in "$CERTS_DIR/server.csr" \
    -CA "$CERTS_DIR/jarvis-ca.pem" \
    -CAkey "$CERTS_DIR/jarvis-ca-key.pem" \
    -CAcreateserial \
    -out "$CERTS_DIR/server.pem" \
    -days 730 -sha256 \
    -extfile <(printf "subjectAltName=$SAN") 2>/dev/null

  # Clean up CSR and serial
  rm -f "$CERTS_DIR/server.csr" "$CERTS_DIR/jarvis-ca.srl"

  echo -e "  ${GREEN}✓${NC} Server certificate generated (2-year validity)"
  echo -e "  ${GREEN}✓${NC} SAN: $SAN"
fi

# ── Generate auth token ──
echo ""
echo -e "${CYAN}[3/6] Generating auth token...${NC}"

if [ -f "$ENV_FILE" ]; then
  echo -e "  ${YELLOW}!${NC} Token already exists in .env. Skipping."
  TOKEN=$(grep "JARVIS_AUTH_TOKEN=" "$ENV_FILE" | cut -d'=' -f2)
else
  TOKEN=$(openssl rand -hex 32)
  echo "JARVIS_AUTH_TOKEN=$TOKEN" > "$ENV_FILE"
  echo -e "  ${GREEN}✓${NC} Auth token generated and saved to .env"
fi

# ── Create config.local.json ──
echo ""
echo -e "${CYAN}[4/6] Creating local config...${NC}"

HOSTNAME=$(scutil --get LocalHostName 2>/dev/null || hostname -s 2>/dev/null || echo "localhost")

if [ -f "$LOCAL_CONFIG" ]; then
  echo -e "  ${YELLOW}!${NC} config.local.json already exists. Skipping."
else
  TAILSCALE_VALUE="null"
  if [ -n "$TAILSCALE_IP" ]; then
    TAILSCALE_VALUE="\"$TAILSCALE_IP\""
  fi

  cat > "$LOCAL_CONFIG" << HEREDOC
{
  "network": {
    "host": "${HOSTNAME}.local",
    "token": "${TOKEN}",
    "tailscaleHost": ${TAILSCALE_VALUE}
  }
}
HEREDOC
  echo -e "  ${GREEN}✓${NC} config.local.json created with host: ${HOSTNAME}.local"
fi

# ── Install npm dependencies ──
echo ""
echo -e "${CYAN}[5/6] Installing dependencies...${NC}"
cd "$SCRIPT_DIR"
npm install --silent
echo -e "  ${GREEN}✓${NC} npm install complete"

# ── Generate LaunchAgent plist ──
echo ""
echo -e "${CYAN}[6/6] Generating LaunchAgent plist...${NC}"

NODE_PATH=$(which node)
PLIST_FILE="$SCRIPT_DIR/com.jarvis.companion.plist"

cat > "$PLIST_FILE" << HEREDOC
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.jarvis.companion</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_PATH}</string>
        <string>${SCRIPT_DIR}/server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${SCRIPT_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>/tmp/jarvis-companion.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/jarvis-companion.err</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${HOME}/.local/bin</string>
    </dict>
    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>
HEREDOC

echo -e "  ${GREEN}✓${NC} LaunchAgent plist generated"

# ── Summary ──
echo ""
echo -e "${CYAN}══════════════════════════════════════${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${CYAN}══════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Server URL:${NC}  wss://${HOSTNAME}.local:7777"
if [ -n "$TAILSCALE_IP" ]; then
  echo -e "  ${CYAN}Tailscale:${NC}   wss://${TAILSCALE_IP}:7777"
fi
echo -e "  ${CYAN}Auth token:${NC}  ${TOKEN:0:8}...${TOKEN:56:8}"
echo ""
echo -e "  ${CYAN}Start server:${NC}"
echo "    cd companion && npm start"
echo ""
echo -e "  ${CYAN}Install as LaunchAgent (auto-start on login):${NC}"
echo "    cp $PLIST_FILE ~/Library/LaunchAgents/"
echo "    launchctl load ~/Library/LaunchAgents/com.jarvis.companion.plist"
echo ""
echo -e "  ${CYAN}Install CA cert on iOS (one-time):${NC}"
echo "    1. AirDrop ${CERTS_DIR}/jarvis-ca.pem to your iPhone"
echo "    2. Settings → General → VPN & Device Management → Install"
echo "    3. Settings → General → About → Certificate Trust Settings → Enable"
echo ""
