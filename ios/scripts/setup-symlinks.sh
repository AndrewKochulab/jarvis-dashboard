#!/bin/bash
# Creates symlinks so the web/ directory can reference src/ and shared/
# Run from ios/ directory

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$SCRIPT_DIR/../web"

# Symlink src/
if [ ! -e "$WEB_DIR/src" ]; then
    ln -s "../../src" "$WEB_DIR/src"
    echo "[symlink] web/src → ../../src"
fi

# Symlink shared/
if [ ! -e "$WEB_DIR/shared" ]; then
    ln -s "../../shared" "$WEB_DIR/shared"
    echo "[symlink] web/shared → ../../shared"
fi

# Apply config (bundle ID, team ID) from config.json
bash "$SCRIPT_DIR/apply-config.sh"

echo "[setup] Done."
