#!/usr/bin/env bash

set -euo pipefail

SETUP_SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy.sh
source "${SETUP_SCRIPT_DIRECTORY}/deploy.sh"

SETUP_CONTAINER_ARGUMENTS=()

parse_setup_wrapper_arguments() {
  SETUP_REQUESTED_PROFILE=""
  SETUP_RECONFIGURE=0
  SETUP_ROTATE=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --profile)
        [[ -z "${SETUP_REQUESTED_PROFILE}" && $# -ge 2 && -n "$2" ]] || \
          die "--profile must be specified exactly once with a non-empty value."
        SETUP_REQUESTED_PROFILE="$2"
        shift 2
        ;;
      --reconfigure)
        [[ ${SETUP_RECONFIGURE} -eq 0 ]] || die "--reconfigure must not be repeated."
        SETUP_RECONFIGURE=1
        shift
        ;;
      --rotate)
        [[ -z "${SETUP_ROTATE}" && $# -ge 2 ]] || \
          die "--rotate must be specified at most once with a value."
        case "$2" in
          vercel-token|neon-api-key|admin-password) SETUP_ROTATE="$2" ;;
          *) die "--rotate must be vercel-token, neon-api-key, or admin-password." ;;
        esac
        shift 2
        ;;
      *) die "Unsupported setup argument: $1" ;;
    esac
  done
}

build_setup_container_arguments() {
  [[ -n "${DEPLOY_AWS_PROFILE:-}" ]] || die "A validated AWS profile is required."
  SETUP_CONTAINER_ARGUMENTS=(
    node
    --import
    tsx
    scripts/deploy/setup-aws.ts
    --profile
    "${DEPLOY_AWS_PROFILE}"
  )
  [[ ${SETUP_RECONFIGURE} -eq 0 ]] || SETUP_CONTAINER_ARGUMENTS+=(--reconfigure)
  [[ -z "${SETUP_ROTATE}" ]] || SETUP_CONTAINER_ARGUMENTS+=(--rotate "${SETUP_ROTATE}")
}

main_setup() {
  local aws_directory
  parse_setup_wrapper_arguments "$@"
  [[ -t 0 && -t 1 ]] || \
    die "setup-deploy-aws.sh must be run directly from an interactive terminal."
  require_host_tools
  require_clean_worktree
  resolve_aws_profile "${SETUP_REQUESTED_PROFILE}"
  build_deploy_runner_image
  aws_directory="$(prepare_aws_host_directory)"
  build_setup_container_arguments
  docker run --rm --interactive --tty \
    --volume "${aws_directory}:/home/node/.aws:ro" \
    --tmpfs "${AWS_NODE_CLI_CACHE_TMPFS}" \
    "${DEPLOY_RUNNER_IMAGE}" \
    "${SETUP_CONTAINER_ARGUMENTS[@]}"
  maybe_create_env_file
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main_setup "$@"
fi
