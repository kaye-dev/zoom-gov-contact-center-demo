#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENTRYPOINT="${SCRIPT_DIRECTORY}/scripts/deploy/main.ts"

print_cli_install_instructions() {
  echo "Install or update the CLIs, then retry:" >&2
  echo "npm install -g vercel@latest" >&2
  echo "npm install -g neon@latest" >&2
  echo "# NeonはmacOSなら次も選択可" >&2
  echo "brew install neonctl" >&2
}

require_deployment_clis() {
  local missing_cli=0
  local required_cli
  for required_cli in vercel neon; do
    if ! command -v "${required_cli}" >/dev/null 2>&1; then
      echo "Required CLI is missing: ${required_cli}" >&2
      missing_cli=1
    fi
  done
  if [[ "${missing_cli}" == "1" ]]; then
    print_cli_install_instructions
    return 1
  fi
}

require_clean_worktree() {
  local project_root="$1"
  if ! command -v git >/dev/null 2>&1 || \
    ! git -C "${project_root}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "deploy.sh must be run from its Git worktree." >&2
    return 1
  fi
  if [[ -n "$(git -C "${project_root}" status --porcelain=v1 --untracked-files=normal)" ]]; then
    echo "Git worktree must be clean before deployment." >&2
    return 1
  fi
}

main() {
if [[ ! -t 0 || ! -t 1 ]]; then
  echo "deploy.sh must be run directly from an interactive terminal." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 24 is required." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "${NODE_MAJOR}" != "24" ]]; then
  echo "Node.js 24 is required; current runtime is $(node --version)." >&2
  exit 1
fi

if [[ ! -f "${SCRIPT_DIRECTORY}/package-lock.json" ]]; then
  echo "package-lock.json is required." >&2
  exit 1
fi
if [[ -f "${SCRIPT_DIRECTORY}/pnpm-lock.yaml" ]]; then
  echo "pnpm-lock.yaml must be removed; npm is the package-manager source of truth." >&2
  exit 1
fi

require_clean_worktree "${SCRIPT_DIRECTORY}"
require_deployment_clis

cd "${SCRIPT_DIRECTORY}"
BOOTSTRAPPED_NPM_CI=0
if [[ ! -d "${SCRIPT_DIRECTORY}/node_modules/tsx" ]]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm is required to install the locked project dependencies." >&2
    exit 1
  fi
  npm ci
  BOOTSTRAPPED_NPM_CI=1
fi

DEPLOY_BOOTSTRAP_NPM_CI="${BOOTSTRAPPED_NPM_CI}" \
  exec node --import tsx "${ENTRYPOINT}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
