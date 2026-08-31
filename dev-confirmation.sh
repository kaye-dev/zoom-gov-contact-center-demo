#!/usr/bin/env zsh

set -euo pipefail

readonly DEV_CONFIRMATION_SCRIPT_DIR="${0:A:h}"

if ! command -v node >/dev/null 2>&1; then
  print -u2 "Node.js is not installed or is unavailable on PATH."
  exit 1
fi

exec node "${DEV_CONFIRMATION_SCRIPT_DIR}/scripts/confirmation-session.mjs" "$@"
