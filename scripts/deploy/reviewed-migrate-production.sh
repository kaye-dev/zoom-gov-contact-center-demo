#!/usr/bin/env bash

set -euo pipefail

REVIEWED_MIGRATION_SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REVIEWED_MIGRATION_PROJECT_ROOT="$(cd -- "${REVIEWED_MIGRATION_SCRIPT_DIRECTORY}/../.." && pwd)"

# Reuse the audited profile, SSM stdin, immutable image, and cleanup contracts.
# deploy.sh does not run main when sourced.
source "${REVIEWED_MIGRATION_PROJECT_ROOT}/deploy.sh"

REVIEWED_TARGET_FINGERPRINT=""
REVIEWED_PLAN_DIGEST=""
REVIEWED_OPERATION_DIGEST=""

assert_reviewed_local_context() {
  [[ "${GITHUB_ACTIONS:-}" != "true" ]] || \
    die "The one-time reviewed Production migration is restricted to an interactive local runner."
}

run_reviewed_migration_phase() {
  local phase="$1"
  local output_directory="$2"
  local expected_target_fingerprint="${3:-}"
  local expected_plan_digest="${4:-}"
  local expected_operation_digest="${5:-}"
  local container_arguments=(
    --rm --init --interactive --user 0
    --env "DEPLOY_CONTEXT_SOURCE=stdin"
    --env "REVIEWED_MIGRATION_PHASE=${phase}"
    --env "DEPLOY_AWS_ACCOUNT_ID=${DEPLOY_AWS_ACCOUNT_ID}"
    --env "DEPLOY_AWS_PROFILE=${DEPLOY_AWS_PROFILE}"
    --env "DEPLOY_BOOTSTRAP_NPM_CI=1"
    --env "DEPLOY_OUTPUT_PATH=/deploy-output/result"
    --volume "${output_directory}:/deploy-output"
  )
  [[ -z "${expected_target_fingerprint}" ]] || \
    container_arguments+=(--env "REVIEWED_EXPECTED_TARGET_FINGERPRINT=${expected_target_fingerprint}")
  [[ -z "${expected_plan_digest}" ]] || \
    container_arguments+=(--env "REVIEWED_EXPECTED_PLAN_DIGEST=${expected_plan_digest}")
  [[ -z "${expected_operation_digest}" ]] || \
    container_arguments+=(--env "REVIEWED_EXPECTED_OPERATION_DIGEST=${expected_operation_digest}")

  read_aws_account_id
  set +e
  stream_ssm_context | docker run \
    "${container_arguments[@]}" \
    "${DEPLOY_RUNNER_IMAGE}" \
    sh -ceu "${DEPLOY_PRIVATE_OUTPUT_ENTRYPOINT}" sh \
    node --import tsx scripts/deploy/reviewed-migration.ts
  local status=$?
  set -e
  if [[ -f "${output_directory}/result" && ! -L "${output_directory}/result" ]]; then
    docker run --rm --user 0 \
      --volume "${output_directory}:/deploy-output" \
      --entrypoint chown \
      "${DEPLOY_RUNNER_IMAGE}" \
      "$(id -u):$(id -g)" /deploy-output/result
  fi
  return "${status}"
}

parse_reviewed_validate_output() {
  local output_path="$1"
  local line key value
  local target_fingerprint=""
  local plan_digest=""
  local operation_digest=""
  local line_count=0
  [[ -f "${output_path}" && ! -L "${output_path}" ]] || \
    die "The reviewed validate phase did not produce a safe result file."

  while IFS= read -r line || [[ -n "${line}" ]]; do
    line_count=$((line_count + 1))
    [[ "${line}" == *=* ]] || die "The reviewed validate phase returned an invalid result line."
    key="${line%%=*}"
    value="${line#*=}"
    case "${key}" in
      target-fingerprint)
        [[ -z "${target_fingerprint}" && "${value}" =~ ^[0-9a-f]{64}$ ]] || \
          die "The reviewed target fingerprint is invalid."
        target_fingerprint="${value}"
        ;;
      reviewed-plan-digest)
        [[ -z "${plan_digest}" && "${value}" =~ ^[0-9a-f]{64}$ ]] || \
          die "The reviewed plan digest is invalid."
        plan_digest="${value}"
        ;;
      operation-digest)
        [[ -z "${operation_digest}" && "${value}" =~ ^[0-9a-f]{64}$ ]] || \
          die "The reviewed operation digest is invalid."
        operation_digest="${value}"
        ;;
      *) die "The reviewed validate phase returned an unsupported result field." ;;
    esac
  done < "${output_path}"

  [[ ${line_count} -eq 3 && -n "${target_fingerprint}" && -n "${plan_digest}" && -n "${operation_digest}" ]] || \
    die "The reviewed validate phase result is incomplete."
  REVIEWED_TARGET_FINGERPRINT="${target_fingerprint}"
  REVIEWED_PLAN_DIGEST="${plan_digest}"
  REVIEWED_OPERATION_DIGEST="${operation_digest}"
}

confirm_reviewed_migration() {
  local answer
  [[ -t 0 && -t 1 ]] || \
    die "The reviewed Production migration requires one approval in an interactive terminal."
  printf "上記のreview済みmigration 4件をclone検証後にProductionへ適用しますか? [y/N] "
  IFS= read -r answer
  if [[ ! "${answer}" =~ ^([yY]|[yY][eE][sS])$ ]]; then
    die "Reviewed migration was refused. Neon branch creation, Production migration, Vercel environment updates, and Production deploy were not started."
  fi
}

main_reviewed_migration() {
  local requested_profile validate_directory apply_directory
  requested_profile="$(parse_deploy_arguments "$@")"
  assert_reviewed_local_context
  require_host_tools
  require_clean_worktree
  resolve_aws_profile "${requested_profile}"
  read_aws_account_id
  build_deploy_runner_image
  run_aws_preflight
  maybe_create_env_file

  DEPLOY_OUTPUT_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/zoom-deploy-output.XXXXXX")"
  chmod 700 "${DEPLOY_OUTPUT_DIRECTORY}"
  validate_directory="$(prepare_phase_output_directory reviewed-validate)"
  run_reviewed_migration_phase validate "${validate_directory}"
  parse_reviewed_validate_output "${validate_directory}/result"
  confirm_reviewed_migration

  apply_directory="$(prepare_phase_output_directory reviewed-apply)"
  run_reviewed_migration_phase \
    apply \
    "${apply_directory}" \
    "${REVIEWED_TARGET_FINGERPRINT}" \
    "${REVIEWED_PLAN_DIGEST}" \
    "${REVIEWED_OPERATION_DIGEST}"

  echo "Reviewed Production migration is up to date. Continuing with the normal direct Production deployment."
  DEPLOY_INTERNAL_EXPECTED_GIT_SHA="${DEPLOY_GIT_SHA}" \
    DEPLOY_INTERNAL_EXPECTED_GIT_BRANCH="${DEPLOY_GIT_BRANCH}" \
    DEPLOY_INTERNAL_EXPECTED_TARGET_FINGERPRINT="${REVIEWED_TARGET_FINGERPRINT}" \
    DEPLOY_INTERNAL_SKIP_ENV_PROMPT=1 \
    "${SCRIPT_DIRECTORY}/deploy.sh" --profile "${DEPLOY_AWS_PROFILE}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main_reviewed_migration "$@"
fi
