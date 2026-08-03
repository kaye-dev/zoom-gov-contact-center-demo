#!/usr/bin/env zsh

set -euo pipefail

check_colima() {
  colima status >/dev/null 2>&1
}

ensure_colima() {
  if ! command -v colima >/dev/null 2>&1; then
    print -u2 "Colima is not installed or is unavailable on PATH. Install Colima and retry."
    return 1
  fi

  if check_colima; then
    return 0
  fi

  print -u2 "Colima is not running. Starting Colima before compose startup..."

  if ! colima start; then
    print -u2 "Colima failed to start. Aborting before compose startup."
    return 1
  fi

  if ! check_colima; then
    print -u2 "Colima is still not running after 'colima start'. Aborting before compose startup."
    return 1
  fi
}

compose_subcommand_index() {
  local -a args=("$@")
  local arg
  local expects_option_value=0
  local i=1

  while (( i <= ${#args[@]} )); do
    arg="${args[$i]}"

    if (( expects_option_value )); then
      expects_option_value=0
      (( i += 1 ))
      continue
    fi

    case "${arg}" in
      --ansi | --env-file | -f | --file | --parallel | --profile | --progress | --project-directory | -p | --project-name)
        expects_option_value=1
        ;;
      --ansi=* | --env-file=* | --file=* | --parallel=* | --profile=* | --progress=* | --project-directory=* | --project-name=*)
        ;;
      --compatibility | --dry-run)
        ;;
      -*)
        ;;
      *)
        print -r -- "${i}"
        return 0
        ;;
    esac

    (( i += 1 ))
  done

  return 1
}

up_invocation_requires_migration_check() {
  local -a args=("$@")
  local arg
  local command_index
  local expects_option_value=0
  local options_done=0
  local saw_service=0
  local i

  if ! command_index="$(compose_subcommand_index "$@")"; then
    return 1
  fi

  if [[ "${args[$command_index]}" != "up" ]]; then
    return 1
  fi

  i=$(( command_index + 1 ))

  while (( i <= ${#args[@]} )); do
    arg="${args[$i]}"

    if (( expects_option_value )); then
      expects_option_value=0
      (( i += 1 ))
      continue
    fi

    if (( ! options_done )); then
      case "${arg}" in
        --)
          options_done=1
          (( i += 1 ))
          continue
          ;;
        --attach | --exit-code-from | --no-attach | --pull | --scale | -t | --timeout | --wait-timeout)
          expects_option_value=1
          (( i += 1 ))
          continue
          ;;
        --attach=* | --exit-code-from=* | --no-attach=* | --pull=* | --scale=* | --timeout=* | --wait-timeout=*)
          (( i += 1 ))
          continue
          ;;
        -*)
          (( i += 1 ))
          continue
          ;;
      esac
    fi

    case "${arg}" in
      web | studio)
        return 0
        ;;
      *)
        saw_service=1
        ;;
    esac

    (( i += 1 ))
  done

  (( saw_service == 0 ))
}

ensure_local_db_ready() {
  local attempt

  docker compose up -d db >/dev/null

  for attempt in {1..30}; do
    if docker compose exec -T db pg_isready -U postgres -d zoom_demo >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  print -u2 "Local Postgres did not become ready. Aborting before compose startup."
  return 1
}

is_pending_migration_output() {
  local output="${1:l}"

  [[ "${output}" == *"not yet been applied"* || "${output}" == *"pending migration"* ]]
}

confirm_pending_migration_deploy() {
  local answer

  if [[ ! -r /dev/tty || ! -w /dev/tty ]]; then
    print -u2 "Pending Prisma migrations were detected, but this shell is non-interactive."
    print -u2 "Run 'docker compose run --rm --no-deps --build web sh -lc \"npm ci && npm run db:deploy\"' and retry."
    return 1
  fi

  printf "Pending Prisma migrations detected. Run 'npm run db:deploy' now? [y/N] " > /dev/tty

  if ! IFS= read -r answer < /dev/tty; then
    print -u2 "Could not read migration confirmation. Aborting before compose startup."
    return 1
  fi

  case "${answer:l}" in
    y | yes)
      return 0
      ;;
    *)
      print -u2 "Prisma migration deploy skipped. Aborting before compose startup."
      return 1
      ;;
  esac
}

run_web_container_command() {
  docker compose run --rm --no-deps --build web sh -lc "$1"
}

ensure_prisma_migrations_current() {
  local status_output
  local deploy_output

  if ! up_invocation_requires_migration_check "$@"; then
    return 0
  fi

  ensure_local_db_ready

  if status_output="$(run_web_container_command "npm ci && npm exec prisma migrate status" 2>&1)"; then
    return 0
  fi

  if ! is_pending_migration_output "${status_output}"; then
    print -u2 -- "${status_output}"
    print -u2 "Prisma migration status check failed. Resolve the error above and retry."
    return 1
  fi

  print -u2 -- "${status_output}"
  confirm_pending_migration_deploy

  if ! deploy_output="$(run_web_container_command "npm ci && npm run db:deploy" 2>&1)"; then
    print -u2 -- "${deploy_output}"
    print -u2 "Prisma migration deploy failed. Resolve the error above and retry."
    return 1
  fi
}

ensure_colima

if [[ $# -eq 0 ]]; then
  set -- up --build
fi

ensure_prisma_migrations_current "$@"

exec docker compose "$@"
