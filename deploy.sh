#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AWS_CLI_IMAGE="public.ecr.aws/aws-cli/aws-cli:2.34.28"
AWS_ROOT_CLI_CACHE_TMPFS="/root/.aws/cli/cache:rw,noexec,nosuid,nodev,size=1m,mode=0700,uid=0,gid=0"
AWS_NODE_CLI_CACHE_TMPFS="/home/node/.aws/cli/cache:rw,noexec,nosuid,nodev,size=1m,mode=0700,uid=1000,gid=1000"
DEPLOY_RUNNER_REPOSITORY="zoom-gov-contact-center-demo-deploy"
DEPLOY_REGION="ap-northeast-1"
DEPLOY_CONFIG_PARAMETER="/zoom-gov-contact-center-demo/production/deploy/config"
DEPLOY_VERCEL_TOKEN_PARAMETER="/zoom-gov-contact-center-demo/production/deploy/vercel-token"
DEPLOY_NEON_API_KEY_PARAMETER="/zoom-gov-contact-center-demo/production/deploy/neon-api-key"
DEPLOY_ADMIN_PASSWORD_PARAMETER="/zoom-gov-contact-center-demo/production/deploy/admin-password"
DEPLOY_CONTEXT_COMPLETION_MARKER="ZOOM_DEPLOY_SSM_CONTEXT_COMPLETE_V1"
DEPLOY_PRIVATE_OUTPUT_ENTRYPOINT='chmod 700 /deploy-output && exec "$@"'

DEPLOY_BUILD_CONTEXT=""
DEPLOY_GIT_DIRECTORY=""
DEPLOY_OUTPUT_DIRECTORY=""
DEPLOY_ENV_TEMP_FILE=""
DEPLOY_RUNNER_IMAGE=""
DEPLOY_GIT_SHA=""
DEPLOY_GIT_BRANCH=""
DEPLOY_AWS_PROFILE=""
DEPLOY_AWS_ACCOUNT_ID=""
DEPLOY_EXPECTED_AWS_ACCOUNT_ID=""
DEPLOY_ENV_WAS_ABSENT=0
DEPLOY_LOG_STYLE="plain"

die() {
  echo "$*" >&2
  exit 1
}

is_deploy_color_terminal() {
  [[ -t 1 && -t 2 ]]
}

resolve_deploy_log_style() {
  if is_deploy_color_terminal && [[ -z "${NO_COLOR+x}" && "${TERM:-}" != "dumb" ]]; then
    printf 'ansi\n'
  else
    printf 'plain\n'
  fi
}

log_wrapper_step() {
  if [[ "${DEPLOY_LOG_STYLE}" == "ansi" ]]; then
    printf '\033[1;36m▶ %s\033[0m\n' "$*"
  else
    printf '▶ %s\n' "$*"
  fi
}

log_wrapper_success() {
  if [[ "${DEPLOY_LOG_STYLE}" == "ansi" ]]; then
    printf '\033[1;32m✓ %s\033[0m\n' "$*"
  else
    printf '✓ %s\n' "$*"
  fi
}

log_wrapper_warning() {
  if [[ "${DEPLOY_LOG_STYLE}" == "ansi" ]]; then
    printf '\033[1;33m⚠ %s\033[0m\n' "$*" >&2
  else
    printf '⚠ %s\n' "$*" >&2
  fi
}

safe_remove_temporary_directory() {
  local target="$1"
  local expected_prefix="$2"
  if [[ -z "${target}" || ! -d "${target}" || -L "${target}" ]]; then
    return
  fi
  case "${target}" in
    "${expected_prefix}"*) rm -rf -- "${target}" ;;
    *) echo "Refusing to remove unexpected temporary directory: ${target}" >&2 ;;
  esac
}

cleanup_deploy_wrapper() {
  if [[ -n "${DEPLOY_ENV_TEMP_FILE}" && -f "${DEPLOY_ENV_TEMP_FILE}" && ! -L "${DEPLOY_ENV_TEMP_FILE}" ]]; then
    rm -f -- "${DEPLOY_ENV_TEMP_FILE}"
  fi
  safe_remove_temporary_directory "${DEPLOY_BUILD_CONTEXT}" "${TMPDIR:-/tmp}/zoom-deploy-build."
  if [[ -n "${DEPLOY_GIT_DIRECTORY}" ]]; then
    safe_remove_temporary_directory \
      "${DEPLOY_OUTPUT_DIRECTORY}" \
      "${DEPLOY_GIT_DIRECTORY}/zoom-deploy-output."
  fi
}

trap cleanup_deploy_wrapper EXIT

require_host_tools() {
  local command_name
  for command_name in docker git tar mktemp awk id ln mkdir; do
    command -v "${command_name}" >/dev/null 2>&1 || \
      die "Required host command is missing: ${command_name}"
  done
  docker version >/dev/null 2>&1 || die "Docker is unavailable. Start Docker and retry."
}

require_clean_worktree() {
  git -C "${SCRIPT_DIRECTORY}" rev-parse --is-inside-work-tree >/dev/null 2>&1 || \
    die "deploy.sh must be run from its Git worktree."
  if [[ -n "$(git -C "${SCRIPT_DIRECTORY}" status --porcelain=v1 --untracked-files=normal)" ]]; then
    die "Git worktree must be clean before deployment."
  fi
  [[ -f "${SCRIPT_DIRECTORY}/package-lock.json" ]] || die "package-lock.json is required."
  [[ ! -f "${SCRIPT_DIRECTORY}/pnpm-lock.yaml" ]] || \
    die "pnpm-lock.yaml must be removed; npm is the package-manager source of truth."
}

prepare_deploy_output_directory() {
  local git_directory
  [[ -z "${DEPLOY_OUTPUT_DIRECTORY}" ]] || die "Deployment output directory is already initialized."
  git_directory="$(git -C "${SCRIPT_DIRECTORY}" rev-parse --absolute-git-dir)" || \
    die "Unable to resolve the Git metadata directory for deployment output."
  [[ "${git_directory}" == /* && -d "${git_directory}" && ! -L "${git_directory}" ]] || \
    die "The Git metadata directory is unavailable or unsafe for deployment output."

  DEPLOY_GIT_DIRECTORY="${git_directory}"
  DEPLOY_OUTPUT_DIRECTORY="$(mktemp -d "${DEPLOY_GIT_DIRECTORY}/zoom-deploy-output.XXXXXX")" || \
    die "Unable to create the deployment output directory."
  [[ -d "${DEPLOY_OUTPUT_DIRECTORY}" && ! -L "${DEPLOY_OUTPUT_DIRECTORY}" ]] || \
    die "The deployment output directory is unavailable or unsafe."
  chmod 700 "${DEPLOY_OUTPUT_DIRECTORY}"
}

validate_profile_name() {
  local profile="$1"
  if [[ ${#profile} -lt 1 || ${#profile} -gt 128 || ! "${profile}" =~ ^[A-Za-z0-9][A-Za-z0-9_.@+=,-]*$ ]]; then
    die "Invalid AWS profile name."
  fi
}

inspect_env_file_presence() {
  local env_path="${SCRIPT_DIRECTORY}/.env"
  DEPLOY_ENV_WAS_ABSENT=0
  if [[ ! -e "${env_path}" && ! -L "${env_path}" ]]; then
    DEPLOY_ENV_WAS_ABSENT=1
    return
  fi
  [[ ! -L "${env_path}" && -f "${env_path}" ]] || \
    die ".env must be a regular, non-symlink file."
}

read_profile_from_env_file() {
  local env_path="${SCRIPT_DIRECTORY}/.env"
  local line
  local count=0
  local value=""
  inspect_env_file_presence
  if [[ ${DEPLOY_ENV_WAS_ABSENT} -eq 1 ]]; then
    return
  fi
  while IFS= read -r line || [[ -n "${line}" ]]; do
    if [[ "${line}" =~ ^[[:space:]]*(export[[:space:]]+)?DEPLOY_AWS_PROFILE[[:space:]]*= ]]; then
      count=$((count + 1))
      if [[ ! "${line}" =~ ^[[:space:]]*DEPLOY_AWS_PROFILE[[:space:]]*=([A-Za-z0-9_.@+=,-]*)[[:space:]]*$ ]]; then
        die ".env contains an invalid DEPLOY_AWS_PROFILE assignment. Use an unquoted profile name without export or shell syntax."
      fi
      value="${BASH_REMATCH[1]}"
    fi
  done < "${env_path}"
  [[ ${count} -le 1 ]] || die ".env contains duplicate DEPLOY_AWS_PROFILE assignments."
  if [[ -n "${value}" ]]; then
    validate_profile_name "${value}"
    DEPLOY_AWS_PROFILE="${value}"
  fi
}

aws_host_directory() {
  local directory="${HOME:?HOME is required}/.aws"
  [[ -d "${directory}" && ! -L "${directory}" ]] || \
    die "AWS CLI configuration directory is unavailable or unsafe: ${directory}"
  printf '%s\n' "${directory}"
}

ensure_private_aws_directory() {
  local directory="$1"
  if [[ ! -e "${directory}" && ! -L "${directory}" ]]; then
    (umask 077; mkdir "${directory}") || true
  fi
  [[ -d "${directory}" && ! -L "${directory}" ]] || \
    die "AWS CLI cache directory is unavailable or unsafe: ${directory}"
}

prepare_aws_host_directory() {
  local aws_directory
  aws_directory="$(aws_host_directory)"
  ensure_private_aws_directory "${aws_directory}/cli"
  ensure_private_aws_directory "${aws_directory}/cli/cache"
  printf '%s\n' "${aws_directory}"
}

prepare_aws_sso_cache_directory() {
  local aws_directory
  aws_directory="$(prepare_aws_host_directory)"
  ensure_private_aws_directory "${aws_directory}/sso"
  ensure_private_aws_directory "${aws_directory}/sso/cache"
  printf '%s\n' "${aws_directory}/sso/cache"
}

run_aws_helper() {
  local aws_directory
  aws_directory="$(prepare_aws_host_directory)"
  docker run --rm \
    --volume "${aws_directory}:/root/.aws:ro" \
    --tmpfs "${AWS_ROOT_CLI_CACHE_TMPFS}" \
    "${AWS_CLI_IMAGE}" \
    "$@" \
    --region "${DEPLOY_REGION}" \
    --profile "${DEPLOY_AWS_PROFILE}"
}

run_aws_sso_login() {
  local aws_directory sso_cache_directory host_uid host_gid sso_cli_cache_tmpfs
  aws_directory="$(prepare_aws_host_directory)"
  sso_cache_directory="$(prepare_aws_sso_cache_directory)"
  host_uid="$(id -u)"
  host_gid="$(id -g)"
  [[ "${host_uid}" =~ ^[0-9]+$ && "${host_gid}" =~ ^[0-9]+$ ]] || \
    die "Could not resolve the host identity for AWS SSO login."
  sso_cli_cache_tmpfs="/aws-home/.aws/cli/cache:rw,noexec,nosuid,nodev,size=1m,mode=0700,uid=${host_uid},gid=${host_gid}"
  docker run --rm --interactive --tty \
    --user "${host_uid}:${host_gid}" \
    --env "HOME=/aws-home" \
    --volume "${aws_directory}:/aws-home/.aws:ro" \
    --volume "${sso_cache_directory}:/aws-home/.aws/sso/cache:rw" \
    --tmpfs "${sso_cli_cache_tmpfs}" \
    "${AWS_CLI_IMAGE}" \
    sso login \
    --profile "${DEPLOY_AWS_PROFILE}" \
    --use-device-code \
    --no-browser \
    --no-cli-pager
}

list_aws_profiles() {
  local aws_directory
  aws_directory="$(prepare_aws_host_directory)"
  docker run --rm \
    --volume "${aws_directory}:/root/.aws:ro" \
    --tmpfs "${AWS_ROOT_CLI_CACHE_TMPFS}" \
    "${AWS_CLI_IMAGE}" \
    configure list-profiles
}

select_aws_profile_by_index() {
  local selection="$1"
  shift
  local profiles=("$@")
  if [[ ! "${selection}" =~ ^[0-9]+$ || ${selection} -lt 1 || ${selection} -gt ${#profiles[@]} ]]; then
    die "AWS profile selection is invalid."
  fi
  DEPLOY_AWS_PROFILE="${profiles[$((selection - 1))]}"
}

resolve_aws_profile() {
  local requested_profile="$1"
  local profiles_output
  local profile
  local found=0
  local profiles=()
  if [[ -n "${requested_profile}" ]]; then
    inspect_env_file_presence
    validate_profile_name "${requested_profile}"
    DEPLOY_AWS_PROFILE="${requested_profile}"
  else
    read_profile_from_env_file
  fi
  profiles_output="$(list_aws_profiles)" || \
    die "Could not list AWS profiles with the fixed AWS CLI helper image."
  while IFS= read -r profile || [[ -n "${profile}" ]]; do
    [[ -z "${profile}" ]] && continue
    validate_profile_name "${profile}"
    profiles+=("${profile}")
    if [[ -n "${DEPLOY_AWS_PROFILE}" && "${profile}" == "${DEPLOY_AWS_PROFILE}" ]]; then
      found=1
    fi
  done <<< "${profiles_output}"
  [[ ${#profiles[@]} -gt 0 ]] || die "No AWS CLI profiles were found."
  if [[ -n "${DEPLOY_AWS_PROFILE}" ]]; then
    [[ ${found} -eq 1 ]] || \
      die "AWS profile '${DEPLOY_AWS_PROFILE}' does not exist. No fallback profile was used."
    return
  fi
  [[ -t 0 && -t 1 ]] || \
    die "No AWS profile was specified. Use --profile or DEPLOY_AWS_PROFILE in .env for non-interactive execution."
  echo "AWS profileを選択してください:" >&2
  local index=1
  for profile in "${profiles[@]}"; do
    echo "  ${index}) ${profile}" >&2
    index=$((index + 1))
  done
  local selection
  printf '> ' >&2
  IFS= read -r selection
  select_aws_profile_by_index "${selection}" "${profiles[@]}"
}

is_interactive_terminal() {
  [[ -t 0 && -t 1 ]]
}

aws_profile_uses_sso() {
  local value
  if value="$(run_aws_helper configure get sso_session 2>/dev/null)" && [[ -n "${value}" ]]; then
    return 0
  fi
  if value="$(run_aws_helper configure get sso_start_url 2>/dev/null)" && [[ -n "${value}" ]]; then
    return 0
  fi
  return 1
}

is_expired_aws_sso_error() {
  local message="$1"
  case "${message}" in
    *"Error loading SSO Token"* | \
      *"UnauthorizedSSOTokenError"* | \
      *"The SSO session associated with this profile has expired"* | \
      *"Token has expired and refresh failed"*) return 0 ;;
    *) return 1 ;;
  esac
}

maybe_login_aws_sso() {
  local authentication_error="$1"
  local answer
  is_interactive_terminal || return 1
  is_expired_aws_sso_error "${authentication_error}" || return 1
  aws_profile_uses_sso || return 1

  log_wrapper_warning "AWS profile '${DEPLOY_AWS_PROFILE}' のSSOセッションが無効または期限切れです。"
  printf 'AWS SSOへログインして処理を続行しますか? [y/N] ' >&2
  IFS= read -r answer || return 1
  [[ "${answer}" =~ ^([yY]|[yY][eE][sS])$ ]] || return 1

  log_wrapper_step "AWS SSO device authorizationを開始します。表示されるURLとcodeで認証してください。" >&2
  if ! run_aws_sso_login; then
    die "AWS SSO login failed for profile '${DEPLOY_AWS_PROFILE}'. The current operation was stopped."
  fi
  log_wrapper_success "AWS SSO login succeeded. Continuing the original command." >&2
}

read_aws_account_id() {
  local account_id authentication_error
  if account_id="$(run_aws_helper sts get-caller-identity --query Account --output text --no-cli-pager 2>&1)"; then
    :
  else
    authentication_error="${account_id}"
    account_id=""
    if maybe_login_aws_sso "${authentication_error}"; then
      if ! account_id="$(run_aws_helper sts get-caller-identity --query Account --output text --no-cli-pager 2>/dev/null)"; then
        die "AWS authentication still failed for profile '${DEPLOY_AWS_PROFILE}' after SSO login. The current operation was stopped."
      fi
    else
      die "AWS authentication failed for profile '${DEPLOY_AWS_PROFILE}'. If this profile uses IAM Identity Center (SSO), run 'aws sso login --profile ${DEPLOY_AWS_PROFILE}' and retry the original command."
    fi
  fi
  [[ "${account_id}" =~ ^[0-9]{12}$ ]] || die "AWS STS returned an invalid account ID."
  if [[ -n "${DEPLOY_EXPECTED_AWS_ACCOUNT_ID}" && "${account_id}" != "${DEPLOY_EXPECTED_AWS_ACCOUNT_ID}" ]]; then
    die "The selected AWS account changed between deployment phases."
  fi
  DEPLOY_AWS_ACCOUNT_ID="${account_id}"
  DEPLOY_EXPECTED_AWS_ACCOUNT_ID="${account_id}"
}

assert_internal_deployment_snapshot() {
  if [[ -n "${DEPLOY_INTERNAL_EXPECTED_GIT_SHA:-}" ]]; then
    [[ "${DEPLOY_INTERNAL_EXPECTED_GIT_SHA}" =~ ^[0-9a-f]{40}$ ]] || \
      die "The internally expected Git SHA is invalid."
    [[ "${DEPLOY_GIT_SHA}" == "${DEPLOY_INTERNAL_EXPECTED_GIT_SHA}" ]] || \
      die "Git HEAD changed after the reviewed Production migration approval. Production deployment was not started."
  fi
  if [[ -n "${DEPLOY_INTERNAL_EXPECTED_GIT_BRANCH:-}" ]]; then
    [[ "${DEPLOY_INTERNAL_EXPECTED_GIT_BRANCH}" != *$'\n'* ]] || \
      die "The internally expected Git branch is invalid."
    [[ "${DEPLOY_GIT_BRANCH}" == "${DEPLOY_INTERNAL_EXPECTED_GIT_BRANCH}" ]] || \
      die "Git branch changed after the reviewed Production migration approval. Production deployment was not started."
  fi
}

build_deploy_runner_image() {
  DEPLOY_GIT_SHA="$(git -C "${SCRIPT_DIRECTORY}" rev-parse HEAD)"
  DEPLOY_GIT_BRANCH="$(git -C "${SCRIPT_DIRECTORY}" symbolic-ref --quiet --short HEAD)" || \
    die "Local deployment requires a named Git branch."
  if [[ ! "${DEPLOY_GIT_SHA}" =~ ^[0-9a-f]{40}$ || -z "${DEPLOY_GIT_BRANCH}" || "${DEPLOY_GIT_BRANCH}" == *$'\n'* ]]; then
    die "Could not resolve a safe immutable Git deployment identity."
  fi
  assert_internal_deployment_snapshot
  DEPLOY_BUILD_CONTEXT="$(mktemp -d "${TMPDIR:-/tmp}/zoom-deploy-build.XXXXXX")"
  [[ -n "${DEPLOY_BUILD_CONTEXT}" && -d "${DEPLOY_BUILD_CONTEXT}" && ! -L "${DEPLOY_BUILD_CONTEXT}" ]] || \
    die "Could not create a safe Docker build context."
  git -C "${SCRIPT_DIRECTORY}" archive --format=tar "${DEPLOY_GIT_SHA}" | \
    tar -xf - -C "${DEPLOY_BUILD_CONTEXT}"
  DEPLOY_RUNNER_IMAGE="${DEPLOY_RUNNER_REPOSITORY}:${DEPLOY_GIT_SHA}"
  docker build \
    --file "${DEPLOY_BUILD_CONTEXT}/Dockerfile.deploy" \
    --build-arg "DEPLOY_GIT_SHA=${DEPLOY_GIT_SHA}" \
    --build-arg "DEPLOY_GIT_BRANCH=${DEPLOY_GIT_BRANCH}" \
    --tag "${DEPLOY_RUNNER_IMAGE}" \
    "${DEPLOY_BUILD_CONTEXT}"
}

stream_ssm_context() {
  if run_aws_helper ssm get-parameters \
      --names \
      "${DEPLOY_CONFIG_PARAMETER}" \
      "${DEPLOY_VERCEL_TOKEN_PARAMETER}" \
      "${DEPLOY_NEON_API_KEY_PARAMETER}" \
      "${DEPLOY_ADMIN_PASSWORD_PARAMETER}" \
      --with-decryption \
      --output json \
      --no-cli-pager 2>/dev/null; then
    printf '\n%s\n' "${DEPLOY_CONTEXT_COMPLETION_MARKER}"
    return
  fi
  echo "SSM GetParameters failed. Verify the selected AWS session, exact IAM permissions, region, and KMS access." >&2
  return 1
}

run_aws_preflight() {
  set +e
  stream_ssm_context | \
    docker run --rm --interactive \
      --env "DEPLOY_AWS_ACCOUNT_ID=${DEPLOY_AWS_ACCOUNT_ID}" \
      --env "DEPLOY_AWS_PROFILE=${DEPLOY_AWS_PROFILE}" \
      "${DEPLOY_RUNNER_IMAGE}" \
      node --import tsx scripts/deploy/preflight-aws.ts
  local status=$?
  set -e
  return "${status}"
}

maybe_create_env_file() {
  local env_path="${SCRIPT_DIRECTORY}/.env"
  local answer
  if [[ "${DEPLOY_INTERNAL_SKIP_ENV_PROMPT:-0}" == "1" ]]; then
    return 0
  fi
  [[ ${DEPLOY_ENV_WAS_ABSENT} -eq 1 ]] || return 0
  [[ ! -e "${env_path}" && ! -L "${env_path}" ]] || \
    die ".env appeared during deployment preflight; it was not overwritten."
  if [[ ! -t 0 || ! -t 1 ]]; then
    echo ".env is absent; skipped the optional profile save because no interactive terminal is available." >&2
    return
  fi
  echo "AWS profile '${DEPLOY_AWS_PROFILE}' の認証とデプロイ設定を確認しました。"
  printf '.env.example から .env を作成し、次回以降このprofileを使用しますか? [y/N] '
  IFS= read -r answer
  if [[ ! "${answer}" =~ ^([yY]|[yY][eE][sS])$ ]]; then
    echo ".env was not created; this deployment will continue with the selected profile."
    return
  fi
  create_env_file
}

create_env_file() {
  local env_path="${SCRIPT_DIRECTORY}/.env"
  local template_path="${SCRIPT_DIRECTORY}/.env.example"
  local placeholder_count
  [[ ! -e "${env_path}" && ! -L "${env_path}" ]] || \
    die ".env already exists; it was not overwritten."
  [[ ! -L "${template_path}" && -f "${template_path}" ]] || \
    die ".env.example must be a regular, non-symlink file."
  git -C "${SCRIPT_DIRECTORY}" ls-files --error-unmatch .env.example >/dev/null 2>&1 || \
    die ".env.example must be tracked by Git."
  git -C "${SCRIPT_DIRECTORY}" check-ignore -q .env || die ".env must remain ignored by Git."
  placeholder_count="$(awk '/^DEPLOY_AWS_PROFILE=$/ { count += 1 } END { print count + 0 }' "${template_path}")"
  [[ "${placeholder_count}" == "1" ]] || \
    die ".env.example must contain exactly one empty DEPLOY_AWS_PROFILE assignment."
  umask 077
  DEPLOY_ENV_TEMP_FILE="$(mktemp "${SCRIPT_DIRECTORY}/.env.tmp.XXXXXX")"
  chmod 600 "${DEPLOY_ENV_TEMP_FILE}"
  awk -v profile="${DEPLOY_AWS_PROFILE}" \
    '{ if ($0 == "DEPLOY_AWS_PROFILE=") print "DEPLOY_AWS_PROFILE=" profile; else print }' \
    "${template_path}" > "${DEPLOY_ENV_TEMP_FILE}"
  [[ ! -e "${env_path}" && ! -L "${env_path}" ]] || \
    die ".env appeared while it was being prepared; it was not overwritten."
  ln "${DEPLOY_ENV_TEMP_FILE}" "${env_path}" || \
    die ".env could not be created exclusively; an existing file was not overwritten."
  rm -f -- "${DEPLOY_ENV_TEMP_FILE}"
  DEPLOY_ENV_TEMP_FILE=""
  echo ".env was created with DEPLOY_AWS_PROFILE=${DEPLOY_AWS_PROFILE}."
}

prepare_phase_output_directory() {
  local phase="$1"
  local output_directory="${DEPLOY_OUTPUT_DIRECTORY}/${phase}"
  [[ ! -e "${output_directory}" && ! -L "${output_directory}" ]] || \
    die "The deployment phase output directory already exists."
  mkdir -- "${output_directory}"
  chmod 700 "${output_directory}"
  printf '%s\n' "${output_directory}"
}

run_deploy_phase() {
  local phase="$1"
  local output_directory="$2"
  local expected_target_fingerprint="${3:-}"
  local expected_plan_digest="${4:-}"
  local expected_deployment_id="${5:-}"
  local expected_previous_deployment_id="${6:-}"
  local container_arguments=(
    --rm --init --interactive --user 0
    --env "DEPLOY_CONTEXT_SOURCE=stdin"
    --env "DEPLOY_PHASE=${phase}"
    --env "DEPLOY_AWS_ACCOUNT_ID=${DEPLOY_AWS_ACCOUNT_ID}"
    --env "DEPLOY_AWS_PROFILE=${DEPLOY_AWS_PROFILE}"
    --env "DEPLOY_BOOTSTRAP_NPM_CI=1"
    --env "DEPLOY_LOG_STYLE=${DEPLOY_LOG_STYLE}"
    --env "DEPLOY_OUTPUT_PATH=/deploy-output/result"
    --volume "${output_directory}:/deploy-output"
  )
  [[ -z "${expected_target_fingerprint}" ]] || \
    container_arguments+=(--env "DEPLOY_EXPECTED_TARGET_FINGERPRINT=${expected_target_fingerprint}")
  [[ -z "${expected_plan_digest}" ]] || \
    container_arguments+=(--env "DEPLOY_EXPECTED_PLAN_DIGEST=${expected_plan_digest}")
  [[ -z "${expected_deployment_id}" ]] || \
    container_arguments+=(--env "DEPLOY_EXPECTED_DEPLOYMENT_ID=${expected_deployment_id}")
  [[ -z "${expected_previous_deployment_id}" ]] || \
    container_arguments+=(--env "DEPLOY_EXPECTED_PREVIOUS_DEPLOYMENT_ID=${expected_previous_deployment_id}")
  read_aws_account_id
  set +e
  stream_ssm_context | docker run \
    "${container_arguments[@]}" \
    "${DEPLOY_RUNNER_IMAGE}" \
    sh -ceu "${DEPLOY_PRIVATE_OUTPUT_ENTRYPOINT}" sh \
    node --no-warnings --import tsx scripts/deploy/main.ts
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

parse_validate_output() {
  local output_path="$1"
  local line key value
  local migration_required=""
  local plan_digest=""
  local target_fingerprint=""
  local line_count=0
  [[ -f "${output_path}" && ! -L "${output_path}" ]] || \
    die "The validate phase did not produce a safe result file."
  while IFS= read -r line || [[ -n "${line}" ]]; do
    line_count=$((line_count + 1))
    key="${line%%=*}"
    value="${line#*=}"
    case "${key}" in
      migration-required)
        [[ -z "${migration_required}" && "${value}" =~ ^(true|false)$ ]] || \
          die "The validate migration result is invalid."
        migration_required="${value}"
        ;;
      plan-digest)
        [[ -z "${plan_digest}" && "${value}" =~ ^[0-9a-f]{64}$ ]] || \
          die "The validate plan digest is invalid."
        plan_digest="${value}"
        ;;
      target-fingerprint)
        [[ -z "${target_fingerprint}" && "${value}" =~ ^[0-9a-f]{64}$ ]] || \
          die "The validate target fingerprint is invalid."
        target_fingerprint="${value}"
        ;;
      *) die "The validate phase returned an unsupported result field." ;;
    esac
  done < "${output_path}"
  [[ ${line_count} -eq 3 && -n "${migration_required}" && -n "${plan_digest}" && -n "${target_fingerprint}" ]] || \
    die "The validate phase result is incomplete."
  DEPLOY_MIGRATION_REQUIRED="${migration_required}"
  DEPLOY_PLAN_DIGEST="${plan_digest}"
  DEPLOY_TARGET_FINGERPRINT="${target_fingerprint}"
}

parse_release_output() {
  local output_path="$1"
  local line key value
  local count=0
  local deployment_id=""
  local previous_deployment_id=""
  [[ -f "${output_path}" && ! -L "${output_path}" ]] || \
    die "The release phase did not produce a safe result file."
  while IFS= read -r line || [[ -n "${line}" ]]; do
    count=$((count + 1))
    key="${line%%=*}"
    value="${line#*=}"
    case "${key}" in
      deployment-id)
        [[ -z "${deployment_id}" && "${value}" =~ ^dpl_[A-Za-z0-9]+$ ]] || \
          die "The release deployment ID is invalid."
        deployment_id="${value}"
        ;;
      previous-deployment-id)
        [[ -z "${previous_deployment_id}" && "${value}" =~ ^(none|dpl_[A-Za-z0-9]+)$ ]] || \
          die "The previous Production deployment ID is invalid."
        previous_deployment_id="${value}"
        ;;
      *) die "The release phase returned an unsupported result field." ;;
    esac
  done < "${output_path}"
  [[ ${count} -eq 2 && -n "${deployment_id}" && -n "${previous_deployment_id}" ]] || \
    die "The release phase result is incomplete."
  DEPLOY_RELEASE_ID="${deployment_id}"
  DEPLOY_PREVIOUS_RELEASE_ID="${previous_deployment_id}"
}

confirm_pending_migration() {
  local answer
  [[ -t 0 && -t 1 ]] || die "A pending migration requires one approval in an interactive terminal."
  printf '上記のpending migrationをProduction deploy前に適用しますか? [y/N] '
  IFS= read -r answer
  if [[ ! "${answer}" =~ ^([yY]|[yY][eE][sS])$ ]]; then
    die "Migration was refused. Database migration, Vercel environment updates, and Production deploy were not started."
  fi
}

parse_deploy_arguments() {
  local profile=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --profile)
        [[ -z "${profile}" && $# -ge 2 && -n "$2" ]] || die "--profile must be specified exactly once with a non-empty value."
        profile="$2"
        shift 2
        ;;
      *) die "Unsupported deploy argument: $1" ;;
    esac
  done
  printf '%s\n' "${profile}"
}

main() {
  local requested_profile validate_directory migrate_directory release_directory smoke_directory validate_status
  requested_profile="$(parse_deploy_arguments "$@")"
  DEPLOY_LOG_STYLE="$(resolve_deploy_log_style)"
  require_host_tools
  require_clean_worktree
  resolve_aws_profile "${requested_profile}"
  read_aws_account_id
  log_wrapper_step "Immutable deploy runner imageを準備しています"
  build_deploy_runner_image
  log_wrapper_step "AWS deployment settingsを確認しています"
  run_aws_preflight
  maybe_create_env_file

  prepare_deploy_output_directory
  validate_directory="$(prepare_phase_output_directory validate)"
  set +e
  run_deploy_phase \
    validate \
    "${validate_directory}" \
    "${DEPLOY_INTERNAL_EXPECTED_TARGET_FINGERPRINT:-}"
  validate_status=$?
  set -e
  if [[ ${validate_status} -ne 0 && ${validate_status} -ne 75 ]]; then
    exit "${validate_status}"
  fi
  parse_validate_output "${validate_directory}/result"
  if [[ "${DEPLOY_MIGRATION_REQUIRED}" == "true" ]]; then
    [[ ${validate_status} -eq 75 ]] || die "Pending migration validation did not stop at the approval gate."
    confirm_pending_migration
    migrate_directory="$(prepare_phase_output_directory migrate)"
    run_deploy_phase migrate "${migrate_directory}" "${DEPLOY_TARGET_FINGERPRINT}" "${DEPLOY_PLAN_DIGEST}"
  else
    [[ ${validate_status} -eq 0 ]] || die "Migration-free validation returned an unexpected status."
  fi
  release_directory="$(prepare_phase_output_directory release)"
  run_deploy_phase release "${release_directory}" "${DEPLOY_TARGET_FINGERPRINT}"
  parse_release_output "${release_directory}/result"
  smoke_directory="$(prepare_phase_output_directory smoke)"
  run_deploy_phase smoke "${smoke_directory}" "${DEPLOY_TARGET_FINGERPRINT}" "" "${DEPLOY_RELEASE_ID}" "${DEPLOY_PREVIOUS_RELEASE_ID}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
