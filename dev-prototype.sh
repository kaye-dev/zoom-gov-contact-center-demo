#!/usr/bin/env zsh

set -euo pipefail

readonly DEV_PROTOTYPE_SCRIPT_DIR="${0:A:h}"

usage() {
  print -r -- "Usage: ./dev-prototype.sh [slug]"
  print -r -- "       ./dev-prototype.sh --retain <slug>"
  print -r -- ""
  print -r -- "With no slug, serves the most recently modified prototype."
}

if (( $# > 2 )); then
  usage >&2
  exit 1
fi

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "${1:-}" == "--retain" ]]; then
  if (( $# != 2 )); then
    usage >&2
    exit 1
  fi
  exec "${DEV_PROTOTYPE_SCRIPT_DIR}/dev-confirmation.sh" start "$2" prototype
fi

if (( $# > 1 )); then
  usage >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  print -u2 "Node.js is not installed or is unavailable on PATH."
  exit 1
fi

exec node "${DEV_PROTOTYPE_SCRIPT_DIR}/scripts/prototype-entry.mjs" serve "$@"
