#!/usr/bin/env bash
# install-hook.sh — wire the Nexus gate into git as a pre-commit hook.
# Run once from your repo root:  bash install-hook.sh
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
GATE_SRC="$(cd "$(dirname "$0")" && pwd)/scripts/nexus-gate.mjs"
HOOK_DIR="$REPO_ROOT/.git/hooks"
mkdir -p "$HOOK_DIR"

cat > "$HOOK_DIR/pre-commit" <<EOF
#!/usr/bin/env bash
# Hey Buddy / Nexus Security Gate — pre-commit.
# Blocks secrets, lint-weakening, unauthorized network calls.
exec node "$GATE_SRC" --staged
EOF
chmod +x "$HOOK_DIR/pre-commit"

echo ""
echo "✔ Installed pre-commit gate -> $HOOK_DIR/pre-commit"
echo "  It scans STAGED changes on every commit."
echo "  Bypass (discouraged): git commit --no-verify"
echo ""
