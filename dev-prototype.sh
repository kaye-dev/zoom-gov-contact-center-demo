#!/usr/bin/env zsh

set -euo pipefail

readonly DEV_PROTOTYPE_SCRIPT_DIR="${0:A:h}"

usage() {
  print -r -- "Usage: ./dev-prototype.sh [plan-id]"
  print -r -- ""
  print -r -- "With no plan ID, serves the most recently modified prototype."
}

if (( $# > 1 )); then
  usage >&2
  exit 1
fi

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  print -u2 "Node.js is not installed or is unavailable on PATH."
  exit 1
fi

typeset plan_id="${1:-}"
typeset artifact_path=""

if [[ -n "${plan_id}" ]]; then
  if [[ ! "${plan_id}" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
    print -u2 "Plan ID must contain only lowercase letters, digits, and hyphens."
    exit 1
  fi

  artifact_path="plans/tmp/${plan_id}/prototype"
  if [[ ! -f "${DEV_PROTOTYPE_SCRIPT_DIR}/${artifact_path}/index.html" ]]; then
    print -u2 "Prototype entry point is unavailable: ${artifact_path}/index.html"
    exit 1
  fi
else
  typeset -a prototype_files
  typeset candidate
  typeset relative_candidate

  prototype_files=("${DEV_PROTOTYPE_SCRIPT_DIR}"/plans/tmp/*/prototype/**/*(N.om))

  for candidate in "${prototype_files[@]}"; do
    relative_candidate="${candidate#${DEV_PROTOTYPE_SCRIPT_DIR}/plans/tmp/}"
    plan_id="${relative_candidate%%/*}"

    if [[ "${plan_id}" =~ ^[a-z0-9][a-z0-9-]*$ ]] &&
      [[ -f "${DEV_PROTOTYPE_SCRIPT_DIR}/plans/tmp/${plan_id}/prototype/index.html" ]]; then
      artifact_path="plans/tmp/${plan_id}/prototype"
      break
    fi
  done

  if [[ -z "${artifact_path}" ]]; then
    print -u2 "No prototype was found under plans/tmp/<plan-id>/prototype."
    print -u2 "Create one first, or pass its plan ID explicitly."
    exit 1
  fi
fi

print -r -- "Prototype: ${artifact_path}"
exec node "${DEV_PROTOTYPE_SCRIPT_DIR}/scripts/serve-plan-artifact.mjs" "${artifact_path}"
