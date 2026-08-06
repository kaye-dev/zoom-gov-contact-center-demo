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

up_invocation_starts_service() {
  local target_service="$1"
  shift

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
      "${target_service}")
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

up_invocation_requires_migration_check() {
  up_invocation_starts_service web "$@" || up_invocation_starts_service studio "$@"
}

is_usable_lan_ipv4() {
  local address="$1"
  local -a octets
  local octet

  if [[ "${address}" != <->.<->.<->.<-> ]]; then
    return 1
  fi

  octets=("${(@s:.:)address}")

  for octet in "${octets[@]}"; do
    if (( octet < 0 || octet > 255 )); then
      return 1
    fi
  done

  if ((
    octets[1] == 0 ||
    octets[1] == 127 ||
    (octets[1] == 169 && octets[2] == 254) ||
    octets[1] >= 224
  )); then
    return 1
  fi

  return 0
}

detect_lan_ipv4() {
  local default_interface
  local route_output
  local address

  if ! command -v route >/dev/null 2>&1 || ! command -v ipconfig >/dev/null 2>&1; then
    return 1
  fi

  if ! route_output="$(route -n get default 2>/dev/null)"; then
    return 1
  fi

  default_interface="$(print -r -- "${route_output}" | awk '$1 == "interface:" { print $2; exit }')"

  if [[ -z "${default_interface}" ]]; then
    return 1
  fi

  if ! address="$(ipconfig getifaddr "${default_interface}" 2>/dev/null)"; then
    return 1
  fi

  if ! is_usable_lan_ipv4 "${address}"; then
    return 1
  fi

  print -r -- "${address}"
}

configure_web_access() {
  local host_port="${HOST_PORT:-3000}"
  local local_origin="http://localhost:${host_port}"
  local lan_ip=""
  local lan_origin=""
  local answer
  local tty_fd

  if ! up_invocation_starts_service web "$@"; then
    return 0
  fi

  if lan_ip="$(detect_lan_ipv4)"; then
    lan_origin="http://${lan_ip}:${host_port}"
  fi

  # A redirection-only zsh `exec` preserves the previous status, so verify the FD.
  if ! { exec {tty_fd}<>/dev/tty; [[ -n "${tty_fd:-}" ]] } 2>/dev/null; then
    print -u2 "No interactive terminal detected. Using this Mac only: ${local_origin}"
    answer="1"
  else
    while true; do
      if ! {
        print -r -- "Web access:"
        print -r -- "  1) This Mac only: ${local_origin} (default)"

        if [[ -n "${lan_origin}" ]]; then
          print -r -- "  2) Same network: ${lan_origin}"
        else
          print -r -- "  2) Same network: unavailable (LAN IPv4 not detected)"
        fi

        printf "Select [1/2]: "
      } >&${tty_fd}; then
        exec {tty_fd}>&-
        print -u2 "Could not display the web access selection. Aborting before compose startup."
        return 1
      fi

      if ! IFS= read -r -u ${tty_fd} answer; then
        exec {tty_fd}>&-
        print -u2 "Could not read the web access selection. Aborting before compose startup."
        return 1
      fi

      case "${answer}" in
        "" | 1)
          answer="1"
          break
          ;;
        2)
          if [[ -z "${lan_origin}" ]]; then
            exec {tty_fd}>&-
            print -u2 "No usable LAN IPv4 address was detected. Connect this Mac to a local network and retry."
            return 1
          fi
          break
          ;;
        *)
          print -u2 "Enter 1 or 2."
          ;;
      esac
    done

    exec {tty_fd}>&-
  fi

  if [[ "${answer}" == "2" ]]; then
    export WEB_BIND_ADDRESS="0.0.0.0"
    export WEB_ORIGIN="${lan_origin}"
    export NEXT_ALLOWED_DEV_ORIGIN="${lan_ip}"
  else
    export WEB_BIND_ADDRESS="127.0.0.1"
    export WEB_ORIGIN="${local_origin}"
    export NEXT_ALLOWED_DEV_ORIGIN=""
  fi

  print -r -- "Web URL: ${WEB_ORIGIN}"
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
  local tty_fd

  if ! { exec {tty_fd}<>/dev/tty; [[ -n "${tty_fd:-}" ]] } 2>/dev/null; then
    print -u2 "Pending Prisma migrations were detected, but this shell is non-interactive."
    print -u2 "Run 'docker compose run --rm --no-deps --build web sh -lc \"npm ci && npm run db:deploy\"' and retry."
    return 1
  fi

  if ! printf "Pending Prisma migrations detected. Run 'npm run db:deploy' now? [y/N] " >&${tty_fd}; then
    exec {tty_fd}>&-
    print -u2 "Could not display the migration confirmation. Aborting before compose startup."
    return 1
  fi

  if ! IFS= read -r -u ${tty_fd} answer; then
    exec {tty_fd}>&-
    print -u2 "Could not read migration confirmation. Aborting before compose startup."
    return 1
  fi

  exec {tty_fd}>&-

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

configure_web_access "$@"
ensure_prisma_migrations_current "$@"

exec docker compose "$@"
