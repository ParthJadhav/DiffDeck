#!/usr/bin/env bash
# Dev launcher: ensures the fake repo exists, builds cli-diff, and runs it
# against the fake repo so you can iterate on the UI with realistic data.
#
# Usage:
#   bun run dev                  # default: HEAD diff (working tree)
#   bun run dev -- --cached      # show staged changes
#   bun run dev -- HEAD~1 HEAD   # forward any args after `--` to git diff

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$ROOT_DIR/.dev/fake-repo"
PORT="${CLI_DIFF_DEV_PORT:-4173}"

if [ ! -d "$REPO_DIR/.git" ] || [ "${REBUILD_FAKE_REPO:-0}" = "1" ]; then
  echo "==> Setting up fake repo"
  bash "$ROOT_DIR/scripts/setup-fake-repo.sh"
fi

echo "==> Building cli-diff"
(cd "$ROOT_DIR" && bun run build)

echo "==> Starting cli-diff against $REPO_DIR (port $PORT)"
exec node "$ROOT_DIR/dist/server/cli.js" \
  --repo "$REPO_DIR" \
  --port "$PORT" \
  "$@"
