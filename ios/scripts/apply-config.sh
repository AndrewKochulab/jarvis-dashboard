#!/bin/bash
# Reads platform.ios settings from config.json and applies them to the Xcode project.
# Run from the repo root or ios/ directory before building.
#
# Usage: bash ios/scripts/apply-config.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PBXPROJ="$REPO_ROOT/ios/JarvisApp.xcodeproj/project.pbxproj"
CONFIG="$REPO_ROOT/src/config/config.json"
CONFIG_EXAMPLE="$REPO_ROOT/src/config/config.example.json"

# Use config.json if it exists, otherwise fall back to config.example.json
if [ -f "$CONFIG" ]; then
  CFG="$CONFIG"
elif [ -f "$CONFIG_EXAMPLE" ]; then
  CFG="$CONFIG_EXAMPLE"
else
  echo "[apply-config] No config file found — skipping."
  exit 0
fi

if [ ! -f "$PBXPROJ" ]; then
  echo "[apply-config] project.pbxproj not found — skipping."
  exit 0
fi

# Extract values using node (always available in this project)
read_config() {
  node -e "
    const cfg = JSON.parse(require('fs').readFileSync('$CFG', 'utf8'));
    const val = cfg.platform?.ios?.['$1'] || '';
    process.stdout.write(val);
  " 2>/dev/null
}

BUNDLE_ID=$(read_config bundleId)
TEAM_ID=$(read_config teamId)

CHANGED=0

if [ -n "$BUNDLE_ID" ]; then
  sed -i '' "s/PRODUCT_BUNDLE_IDENTIFIER = [^;]*;/PRODUCT_BUNDLE_IDENTIFIER = $BUNDLE_ID;/g" "$PBXPROJ"
  echo "[apply-config] iOS bundleId → $BUNDLE_ID"
  CHANGED=1
fi

if [ -n "$TEAM_ID" ]; then
  sed -i '' "s/DEVELOPMENT_TEAM = \"[^\"]*\";/DEVELOPMENT_TEAM = $TEAM_ID;/g" "$PBXPROJ"
  # Also handle unquoted form
  sed -i '' "s/DEVELOPMENT_TEAM = [^;\"]*;/DEVELOPMENT_TEAM = $TEAM_ID;/g" "$PBXPROJ"
  echo "[apply-config] iOS teamId → $TEAM_ID"
  CHANGED=1
fi

if [ $CHANGED -eq 0 ]; then
  echo "[apply-config] No iOS platform config found — project unchanged."
fi
