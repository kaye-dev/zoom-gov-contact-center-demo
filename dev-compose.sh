#!/usr/bin/env zsh

set -euo pipefail

readonly DEV_COMPOSE_SCRIPT_DIR="${0:A:h}"
source "${DEV_COMPOSE_SCRIPT_DIR}/scripts/dev-compose-network.zsh"
source "${DEV_COMPOSE_SCRIPT_DIR}/scripts/dev-compose-runtime.zsh"

typeset -g ACTIVE_RUNTIME_KIND="none"
typeset -g ACTIVE_RUNTIME_IDENTIFIER=""
typeset -g ACTIVE_RUNTIME_HEALTH="not-running"
typeset -g ACTIVE_RUNTIME_STARTED_AT="none"
typeset -g ACTIVE_RUNTIME_COMMAND="none"
typeset -g ACTIVE_RUNTIME_CWD="none"
typeset -g ACTIVE_RUNTIME_MOUNT="none"
typeset -g ACTIVE_RUNTIME_DATABASE_VOLUME="none"
typeset -g ACTIVE_RUNTIME_NETWORK="none"
typeset -g RUNTIME_OWNERSHIP="available"
typeset -g RUNTIME_OWNERSHIP_DETAIL="No web runtime is listening on the assigned port."
typeset -g RUNTIME_RESTART_REQUIRED=0
typeset -g MIGRATION_DEPLOYED=0

check_colima() {
  command -v colima >/dev/null 2>&1 && colima status >/dev/null 2>&1
}

ensure_docker_daemon() {
  if ! command -v docker >/dev/null 2>&1; then
    print -u2 "Docker is not installed or is unavailable on PATH."
    return 1
  fi

  if docker info >/dev/null 2>&1; then
    return 0
  fi

  if ! command -v colima >/dev/null 2>&1; then
    print -u2 "Docker is unavailable and Colima is not installed. Start Docker Desktop or install Colima."
    return 1
  fi

  print -u2 "Docker is unavailable. Starting Colima before compose startup..."
  colima start || {
    print -u2 "Colima failed to start. Aborting before compose startup."
    return 1
  }
  check_colima && docker info >/dev/null 2>&1 || {
    print -u2 "Docker is still unavailable after 'colima start'."
    return 1
  }
}

runtime_compose() {
  local checkout_env_file="${RUNTIME_CHECKOUT_PATH}/.env"
  local worktree_compose_file="${RUNTIME_CHECKOUT_PATH}/compose.worktree.yaml"
  local -a runtime_env_args=()
  local -a runtime_file_args=()

  dev_runtime_resolve_volume_identity
  if (( RUNTIME_VOLUME_IDENTITY_PERSISTED )); then
    dev_runtime_write_manifest
  fi
  if [[ "${RUNTIME_MODE}" == "worktree" ]]; then
    if [[ ! -f "${worktree_compose_file}" || -L "${worktree_compose_file}" ]]; then
      print -u2 "Worktree Compose override must be a regular, non-symlink file: ${worktree_compose_file}."
      return 1
    fi
    runtime_file_args=(-f "${RUNTIME_CHECKOUT_PATH}/compose.yaml" -f "${worktree_compose_file}")
  fi

  if [[ -e "${checkout_env_file}" ]]; then
    if [[ ! -f "${checkout_env_file}" || -L "${checkout_env_file}" ]]; then
      print -u2 "Checkout .env must be a regular, non-symlink file: ${checkout_env_file}."
      return 1
    fi
    runtime_env_args+=(--env-file "${checkout_env_file}")
  fi
  runtime_env_args+=(--env-file "${RUNTIME_MANIFEST_PATH}")

  command docker compose \
    --project-directory "${RUNTIME_CHECKOUT_PATH}" \
    "${runtime_file_args[@]}" \
    "${runtime_env_args[@]}" \
    -p "${COMPOSE_PROJECT_NAME}" \
    "$@"
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

  command_index="$(compose_subcommand_index "$@")" || return 1
  [[ "${args[$command_index]}" == "up" ]] || return 1
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
    if [[ "${arg}" == "${target_service}" ]]; then
      return 0
    fi
    saw_service=1
    (( i += 1 ))
  done

  (( saw_service == 0 ))
}

up_invocation_requires_migration_check() {
  up_invocation_starts_service web "$@" || up_invocation_starts_service studio "$@"
}

reject_runtime_scope_overrides() {
  local arg

  for arg in "$@"; do
    case "${arg}" in
      -p | --project-name | --project-name=* | --project-directory | --project-directory=* | --env-file | --env-file=* | -f | --file | --file=*)
        print -u2 -r -- "${arg} cannot override the checkout-scoped Compose context. Use ./dev-compose.sh without project, file, or env overrides."
        return 1
        ;;
    esac
  done
}

configure_web_access() {
  local local_origin="http://localhost:${HOST_PORT}"
  local lan_ip=""
  local lan_origin=""
  local tunnel_origin="https://demo.keien.dev"
  local tunnel_hostname="demo.keien.dev"
  local answer
  local tty_fd

  if [[ "${RUNTIME_MODE}" == "worktree" ]]; then
    export WEB_BIND_ADDRESS="127.0.0.1"
    export WEB_ORIGIN="${local_origin}"
    export NEXT_ALLOWED_DEV_ORIGIN=""
    print -r -- "Worktree web access is loopback-only: ${WEB_ORIGIN}"
    return 0
  fi

  if lan_ip="$(detect_lan_ipv4)"; then
    lan_origin="http://${lan_ip}:${HOST_PORT}"
  fi

  if ! { exec {tty_fd}<>/dev/tty; [[ -n "${tty_fd:-}" ]] } 2>/dev/null; then
    print -u2 "No interactive terminal detected. Using this Mac only: ${local_origin}"
    answer="1"
  else
    while true; do
      {
        print -r -- "Web access:"
        print -r -- "  1) This Mac only: ${local_origin} (default)"
        if [[ -n "${lan_origin}" ]]; then
          print -r -- "  2) Same network: ${lan_origin}"
        else
          print -r -- "  2) Same network: unavailable (LAN IPv4 not detected)"
        fi
        print -r -- "  3) Cloudflare Tunnel: ${tunnel_origin}"
        printf "Select [1/2/3]: "
      } >&${tty_fd} || {
        exec {tty_fd}>&-
        print -u2 "Could not display the web access selection."
        return 1
      }
      IFS= read -r -u ${tty_fd} answer || {
        exec {tty_fd}>&-
        print -u2 "Could not read the web access selection."
        return 1
      }
      case "${answer}" in
        "" | 1)
          answer="1"
          break
          ;;
        2)
          if [[ -z "${lan_origin}" ]]; then
            print -u2 "No usable LAN IPv4 address was detected."
            continue
          fi
          break
          ;;
        3)
          if [[ "${HOST_PORT}" != "3000" ]]; then
            print -u2 "Cloudflare Tunnel requires the Local runtime on HOST_PORT=3000."
            continue
          fi
          break
          ;;
        *)
          print -u2 "Enter 1, 2, or 3."
          ;;
      esac
    done
    exec {tty_fd}>&-
  fi

  if [[ "${answer}" == "2" ]]; then
    export WEB_BIND_ADDRESS="0.0.0.0"
    export WEB_ORIGIN="${lan_origin}"
    export NEXT_ALLOWED_DEV_ORIGIN="${lan_ip}"
  elif [[ "${answer}" == "3" ]]; then
    export WEB_BIND_ADDRESS="127.0.0.1"
    export WEB_ORIGIN="${tunnel_origin}"
    export NEXT_ALLOWED_DEV_ORIGIN="${tunnel_hostname}"
  else
    export WEB_BIND_ADDRESS="127.0.0.1"
    export WEB_ORIGIN="${local_origin}"
    export NEXT_ALLOWED_DEV_ORIGIN=""
  fi
  print -r -- "Web URL: ${WEB_ORIGIN}"
}

runtime_container_label() {
  local container_id="$1"
  local label="$2"
  local value

  value="$(docker inspect --format "{{ index .Config.Labels \"${label}\" }}" "${container_id}" 2>/dev/null)" || return 1
  [[ "${value}" == "<no value>" ]] && value=""
  print -r -- "${value}"
}

runtime_container_mount_source() {
  docker inspect --format '{{ range .Mounts }}{{ if eq .Destination "/app" }}{{ .Source }}{{ end }}{{ end }}' "$1" 2>/dev/null
}

runtime_container_mount_name() {
  local container_id="$1"
  local destination="$2"

  docker inspect --format "{{ range .Mounts }}{{ if eq .Destination \"${destination}\" }}{{ .Name }}{{ end }}{{ end }}" "${container_id}" 2>/dev/null
}

runtime_validate_volume_identity() {
  local volume_name="$1"
  local volume_key="$2"
  local expected_name="${COMPOSE_PROJECT_NAME}_${volume_key}"
  local project
  local compose_volume
  local runtime_id
  local checkout
  local mode
  local config_digest
  local owner_session_id

  if [[ "${volume_name}" != "${expected_name}" ]]; then
    RUNTIME_OWNERSHIP="mismatch"
    RUNTIME_OWNERSHIP_DETAIL="Volume ${volume_name:-<none>} does not match ${expected_name}."
    return 1
  fi
  project="$(docker volume inspect --format '{{ index .Labels "com.docker.compose.project" }}' "${volume_name}" 2>/dev/null)" || return 1
  compose_volume="$(docker volume inspect --format '{{ index .Labels "com.docker.compose.volume" }}' "${volume_name}" 2>/dev/null)" || return 1
  runtime_id="$(docker volume inspect --format '{{ index .Labels "dev.zoomgov.runtime.id" }}' "${volume_name}" 2>/dev/null)" || return 1
  checkout="$(docker volume inspect --format '{{ index .Labels "dev.zoomgov.runtime.checkout" }}' "${volume_name}" 2>/dev/null)" || return 1
  mode="$(docker volume inspect --format '{{ index .Labels "dev.zoomgov.runtime.mode" }}' "${volume_name}" 2>/dev/null)" || return 1
  config_digest="$(docker volume inspect --format '{{ index .Labels "dev.zoomgov.runtime.config-digest" }}' "${volume_name}" 2>/dev/null)" || return 1
  owner_session_id="$(docker volume inspect --format '{{ index .Labels "dev.zoomgov.runtime.session-id" }}' "${volume_name}" 2>/dev/null)" || return 1
  [[ "${runtime_id}" == "<no value>" ]] && runtime_id=""
  [[ "${checkout}" == "<no value>" ]] && checkout=""
  [[ "${mode}" == "<no value>" ]] && mode=""
  [[ "${config_digest}" == "<no value>" ]] && config_digest=""
  [[ "${owner_session_id}" == "<no value>" ]] && owner_session_id=""

  if [[ "${project}" != "${COMPOSE_PROJECT_NAME}" || "${compose_volume}" != "${volume_key}" ]]; then
    RUNTIME_OWNERSHIP="mismatch"
    RUNTIME_OWNERSHIP_DETAIL="Volume ${volume_name} has unexpected Compose ownership labels."
    return 1
  fi
  if [[ "${RUNTIME_MODE}" == "worktree" ]]; then
    if [[ "${runtime_id}" != "${RUNTIME_ID}" || "${checkout:A}" != "${RUNTIME_CHECKOUT_PATH}" || "${mode}" != "worktree" ||
          "${config_digest}" != "${RUNTIME_VOLUME_CONFIG_DIGEST}" || "${owner_session_id}" != "${RUNTIME_VOLUME_OWNER_SESSION_ID}" ]]; then
      RUNTIME_OWNERSHIP="mismatch"
      RUNTIME_OWNERSHIP_DETAIL="Volume ${volume_name} is missing the exact worktree runtime labels."
      return 1
    fi
  elif [[ -n "${runtime_id}" || -n "${checkout}" || -n "${mode}" ]]; then
    if [[ "${runtime_id}" != "${RUNTIME_ID}" || "${checkout:A}" != "${RUNTIME_CHECKOUT_PATH}" || "${mode}" != "local" ]]; then
      RUNTIME_OWNERSHIP="mismatch"
      RUNTIME_OWNERSHIP_DETAIL="Volume ${volume_name} has Local runtime labels for another checkout."
      return 1
    fi
  fi
}

runtime_validate_network_identity() {
  local network_name="$1"
  local expected_name="${COMPOSE_PROJECT_NAME}_default"
  local project
  local compose_network
  local runtime_id
  local checkout
  local mode

  if [[ "${network_name}" != "${expected_name}" ]]; then
    RUNTIME_OWNERSHIP="mismatch"
    RUNTIME_OWNERSHIP_DETAIL="Network ${network_name:-<none>} does not match ${expected_name}."
    return 1
  fi
  project="$(docker network inspect --format '{{ index .Labels "com.docker.compose.project" }}' "${network_name}" 2>/dev/null)" || return 1
  compose_network="$(docker network inspect --format '{{ index .Labels "com.docker.compose.network" }}' "${network_name}" 2>/dev/null)" || return 1
  runtime_id="$(docker network inspect --format '{{ index .Labels "dev.zoomgov.runtime.id" }}' "${network_name}" 2>/dev/null)" || return 1
  checkout="$(docker network inspect --format '{{ index .Labels "dev.zoomgov.runtime.checkout" }}' "${network_name}" 2>/dev/null)" || return 1
  mode="$(docker network inspect --format '{{ index .Labels "dev.zoomgov.runtime.mode" }}' "${network_name}" 2>/dev/null)" || return 1
  [[ "${runtime_id}" == "<no value>" ]] && runtime_id=""
  [[ "${checkout}" == "<no value>" ]] && checkout=""
  [[ "${mode}" == "<no value>" ]] && mode=""

  if [[ "${project}" != "${COMPOSE_PROJECT_NAME}" || "${compose_network}" != "default" ]]; then
    RUNTIME_OWNERSHIP="mismatch"
    RUNTIME_OWNERSHIP_DETAIL="Network ${network_name} has unexpected Compose ownership labels."
    return 1
  fi
  if [[ "${RUNTIME_MODE}" == "worktree" ]]; then
    if [[ "${runtime_id}" != "${RUNTIME_ID}" || "${checkout:A}" != "${RUNTIME_CHECKOUT_PATH}" || "${mode}" != "worktree" ]]; then
      RUNTIME_OWNERSHIP="mismatch"
      RUNTIME_OWNERSHIP_DETAIL="Network ${network_name} is missing the exact worktree runtime labels."
      return 1
    fi
  elif [[ -n "${runtime_id}" || -n "${checkout}" || -n "${mode}" ]]; then
    if [[ "${runtime_id}" != "${RUNTIME_ID}" || "${checkout:A}" != "${RUNTIME_CHECKOUT_PATH}" || "${mode}" != "local" ]]; then
      RUNTIME_OWNERSHIP="mismatch"
      RUNTIME_OWNERSHIP_DETAIL="Network ${network_name} has Local runtime labels for another checkout."
      return 1
    fi
  fi
}

runtime_validate_container_resources() {
  local container_id="$1"
  local expected_service="$2"
  local network_output
  local -a network_names
  local volume_name

  network_output="$(docker inspect --format '{{ range $name, $_ := .NetworkSettings.Networks }}{{ println $name }}{{ end }}' "${container_id}" 2>/dev/null)" || return 1
  network_names=("${(@f)network_output}")
  if (( ${#network_names[@]} != 1 )); then
    RUNTIME_OWNERSHIP="mismatch"
    RUNTIME_OWNERSHIP_DETAIL="Container ${container_id} must use exactly one checkout-scoped network; found ${network_output:-<none>}."
    return 1
  fi
  runtime_validate_network_identity "${network_names[1]}" || return 1

  case "${expected_service}" in
    web)
      volume_name="$(runtime_container_mount_name "${container_id}" /app/node_modules)" || return 1
      runtime_validate_volume_identity "${volume_name}" node_modules || return 1
      ;;
    db)
      volume_name="$(runtime_container_mount_name "${container_id}" /var/lib/postgresql/data)" || return 1
      runtime_validate_volume_identity "${volume_name}" postgres-data || return 1
      ;;
  esac
}

runtime_validate_container_identity() {
  local container_id="$1"
  local expected_service="$2"
  local require_app_mount="${3:-0}"
  local project
  local service
  local working_directory
  local mount_source=""
  local custom_runtime_id
  local custom_checkout
  local custom_mode
  local custom_digest

  project="$(runtime_container_label "${container_id}" com.docker.compose.project)" || return 1
  service="$(runtime_container_label "${container_id}" com.docker.compose.service)" || return 1
  working_directory="$(runtime_container_label "${container_id}" com.docker.compose.project.working_dir)" || return 1
  custom_runtime_id="$(runtime_container_label "${container_id}" dev.zoomgov.runtime.id)" || return 1
  custom_checkout="$(runtime_container_label "${container_id}" dev.zoomgov.runtime.checkout)" || return 1
  custom_mode="$(runtime_container_label "${container_id}" dev.zoomgov.runtime.mode)" || return 1
  custom_digest="$(runtime_container_label "${container_id}" dev.zoomgov.runtime.config-digest)" || return 1

  if [[ "${project}" != "${COMPOSE_PROJECT_NAME}" || "${service}" != "${expected_service}" || "${working_directory:A}" != "${RUNTIME_CHECKOUT_PATH}" ]]; then
    RUNTIME_OWNERSHIP="mismatch"
    RUNTIME_OWNERSHIP_DETAIL="Container ${container_id} belongs to project=${project}, service=${service}, working_dir=${working_directory}; expected project=${COMPOSE_PROJECT_NAME}, service=${expected_service}, checkout=${RUNTIME_CHECKOUT_PATH}."
    return 1
  fi

  if (( require_app_mount )); then
    mount_source="$(runtime_container_mount_source "${container_id}")" || return 1
    if [[ -z "${mount_source}" || "${mount_source:A}" != "${RUNTIME_CHECKOUT_PATH}" ]]; then
      RUNTIME_OWNERSHIP="mismatch"
      RUNTIME_OWNERSHIP_DETAIL="Container ${container_id} mounts ${mount_source:-<none>} at /app; expected ${RUNTIME_CHECKOUT_PATH}."
      return 1
    fi
  fi

  if [[ "${RUNTIME_MODE}" == "worktree" ]]; then
    if [[ "${custom_runtime_id}" != "${RUNTIME_ID}" || "${custom_checkout:A}" != "${RUNTIME_CHECKOUT_PATH}" || "${custom_mode}" != "worktree" ]]; then
      RUNTIME_OWNERSHIP="mismatch"
      RUNTIME_OWNERSHIP_DETAIL="Container ${container_id} is missing the exact worktree runtime labels."
      return 1
    fi
  elif [[ -n "${custom_runtime_id}" || -n "${custom_checkout}" || -n "${custom_mode}" ]]; then
    if [[ "${custom_runtime_id}" != "${RUNTIME_ID}" || "${custom_checkout:A}" != "${RUNTIME_CHECKOUT_PATH}" || "${custom_mode}" != "local" ]]; then
      RUNTIME_OWNERSHIP="mismatch"
      RUNTIME_OWNERSHIP_DETAIL="Container ${container_id} has Local runtime labels for another checkout."
      return 1
    fi
  fi

  runtime_validate_container_resources "${container_id}" "${expected_service}" || return 1

  if [[ "${expected_service}" == "web" ]]; then
    if (( RUNTIME_CONFIG_CHANGED )) || [[ -n "${custom_digest}" && "${custom_digest}" != "${RUNTIME_CONFIG_DIGEST}" ]]; then
      RUNTIME_RESTART_REQUIRED=1
    fi
  fi
  return 0
}

runtime_project_container_ids() {
  docker ps -aq --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" 2>/dev/null | sort -u
}

runtime_validate_project_containers() {
  local container_output
  local container_id
  local service
  local require_mount

  container_output="$(runtime_project_container_ids)"
  for container_id in ${(f)container_output}; do
    [[ -n "${container_id}" ]] || continue
    service="$(runtime_container_label "${container_id}" com.docker.compose.service)" || return 1
    require_mount=0
    [[ "${service}" == "web" ]] && require_mount=1
    runtime_validate_container_identity "${container_id}" "${service}" "${require_mount}" || {
      print -u2 -r -- "${RUNTIME_OWNERSHIP_DETAIL}"
      return 1
    }
  done
}

runtime_published_web_container_ids() {
  docker ps --format '{{.ID}} {{.Ports}}' 2>/dev/null | awk -v needle=":${HOST_PORT}->3000/tcp" 'index($0, needle) { print $1 }'
}

runtime_health_is_ready() {
  curl --fail --silent --show-error --max-time 5 "http://localhost:${HOST_PORT}/api/health" >/dev/null 2>&1
}

runtime_detect_web() {
  local container_output=""
  local -a container_ids
  local database_container_id=""
  local listener_output=""
  local -a listener_pids
  local listener_pid
  local command
  local cwd

  ACTIVE_RUNTIME_KIND="none"
  ACTIVE_RUNTIME_IDENTIFIER=""
  ACTIVE_RUNTIME_HEALTH="not-running"
  ACTIVE_RUNTIME_STARTED_AT="none"
  ACTIVE_RUNTIME_COMMAND="none"
  ACTIVE_RUNTIME_CWD="none"
  ACTIVE_RUNTIME_MOUNT="none"
  ACTIVE_RUNTIME_DATABASE_VOLUME="none"
  ACTIVE_RUNTIME_NETWORK="none"
  RUNTIME_OWNERSHIP="available"
  RUNTIME_OWNERSHIP_DETAIL="No web runtime is listening on port ${HOST_PORT}."
  RUNTIME_RESTART_REQUIRED=0

  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    container_output="$(runtime_published_web_container_ids)"
  fi
  if [[ -n "${container_output}" ]]; then
    container_ids=("${(@f)container_output}")
    if (( ${#container_ids[@]} != 1 )); then
      RUNTIME_OWNERSHIP="mismatch"
      RUNTIME_OWNERSHIP_DETAIL="Multiple containers publish host port ${HOST_PORT}: ${container_output}."
      return 1
    fi
    runtime_validate_container_identity "${container_ids[1]}" web 1 || return 1
    database_container_id="$(runtime_compose ps -aq db)"
    if [[ -z "${database_container_id}" || "${database_container_id}" == *$'\n'* ]]; then
      RUNTIME_OWNERSHIP="mismatch"
      RUNTIME_OWNERSHIP_DETAIL="Compose web ${container_ids[1]} does not have exactly one checkout-scoped database container."
      return 1
    fi
    runtime_validate_container_identity "${database_container_id}" db 0 || return 1
    ACTIVE_RUNTIME_KIND="compose"
    ACTIVE_RUNTIME_IDENTIFIER="${container_ids[1]}"
    ACTIVE_RUNTIME_STARTED_AT="$(docker inspect --format '{{ .State.StartedAt }}' "${container_ids[1]}" 2>/dev/null)"
    ACTIVE_RUNTIME_COMMAND="$(docker inspect --format '{{ .Path }} {{ join .Args " " }}' "${container_ids[1]}" 2>/dev/null)"
    ACTIVE_RUNTIME_CWD="${RUNTIME_CHECKOUT_PATH}"
    ACTIVE_RUNTIME_MOUNT="$(runtime_container_mount_source "${container_ids[1]}")"
    ACTIVE_RUNTIME_DATABASE_VOLUME="$(runtime_container_mount_name "${database_container_id}" /var/lib/postgresql/data)"
    ACTIVE_RUNTIME_NETWORK="${COMPOSE_PROJECT_NAME}_default"
    RUNTIME_OWNERSHIP="verified"
    RUNTIME_OWNERSHIP_DETAIL="Compose web and database match the current checkout, project, mount, volume, network, and runtime labels."
    if runtime_health_is_ready; then
      ACTIVE_RUNTIME_HEALTH="healthy"
      return 0
    fi
    ACTIVE_RUNTIME_HEALTH="unhealthy"
    RUNTIME_OWNERSHIP_DETAIL+=" GET /api/health is not ready."
    return 1
  fi

  if command -v lsof >/dev/null 2>&1; then
    listener_output="$(lsof -nP -t -iTCP:"${HOST_PORT}" -sTCP:LISTEN 2>/dev/null | sort -u)"
  fi
  if [[ -z "${listener_output}" ]]; then
    return 0
  fi

  listener_pids=("${(@f)listener_output}")
  if [[ "${RUNTIME_MODE}" != "local" || ${#listener_pids[@]} -ne 1 ]]; then
    RUNTIME_OWNERSHIP="mismatch"
    RUNTIME_OWNERSHIP_DETAIL="Port ${HOST_PORT} is owned by an unmanaged listener (${listener_output}); worktrees require a verified Compose web container."
    return 1
  fi

  listener_pid="${listener_pids[1]}"
  command="$(ps -p "${listener_pid}" -o command= 2>/dev/null)" || command=""
  cwd="$(lsof -a -p "${listener_pid}" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  if [[ "${command}" != *"next-server"* &&
        "${command}" != *"/next/dist/bin/next"*" dev"* &&
        "${command}" != *"node_modules/.bin/next"*" dev"* ]]; then
    RUNTIME_OWNERSHIP="mismatch"
    RUNTIME_OWNERSHIP_DETAIL="PID ${listener_pid} listens on ${HOST_PORT} but is not an expected Next.js process: ${command}."
    return 1
  fi
  if [[ -z "${cwd}" || "${cwd:A}" != "${RUNTIME_CHECKOUT_PATH}" ]]; then
    RUNTIME_OWNERSHIP="mismatch"
    RUNTIME_OWNERSHIP_DETAIL="PID ${listener_pid} listens on ${HOST_PORT} from cwd=${cwd:-<unknown>}; expected ${RUNTIME_CHECKOUT_PATH}."
    return 1
  fi

  ACTIVE_RUNTIME_KIND="native-unmanaged"
  ACTIVE_RUNTIME_IDENTIFIER="${listener_pid}"
  ACTIVE_RUNTIME_STARTED_AT="$(ps -p "${listener_pid}" -o lstart= 2>/dev/null | sed 's/^[[:space:]]*//')"
  ACTIVE_RUNTIME_COMMAND="${command}"
  ACTIVE_RUNTIME_CWD="${cwd}"
  ACTIVE_RUNTIME_MOUNT="${cwd}"
  ACTIVE_RUNTIME_DATABASE_VOLUME="unmanaged"
  ACTIVE_RUNTIME_NETWORK="unmanaged"
  if (( RUNTIME_CONFIG_CHANGED )); then
    RUNTIME_RESTART_REQUIRED=1
  fi
  RUNTIME_OWNERSHIP="verified"
  RUNTIME_OWNERSHIP_DETAIL="Native Next.js PID ${listener_pid} matches the Local checkout and remains outside wrapper lifecycle ownership."
  if runtime_health_is_ready; then
    ACTIVE_RUNTIME_HEALTH="healthy"
    return 0
  fi
  ACTIVE_RUNTIME_HEALTH="unhealthy"
  RUNTIME_OWNERSHIP_DETAIL+=" GET /api/health is not ready."
  return 1
}

runtime_print_status() {
  local url_only="${1:-0}"
  local detection_status=0

  runtime_detect_web || detection_status=$?
  if (( url_only )); then
    if (( detection_status != 0 )) || [[ "${ACTIVE_RUNTIME_HEALTH}" != "healthy" ]]; then
      print -u2 -r -- "${RUNTIME_OWNERSHIP_DETAIL}"
      return 1
    fi
    if (( RUNTIME_RESTART_REQUIRED )); then
      print -u2 "The verified runtime requires an explicit refresh before Browser validation."
      return 1
    fi
    print -r -- "http://localhost:${HOST_PORT}"
    return 0
  fi

  dev_runtime_print_context
  print -r -- "ACTIVE_RUNTIME_KIND=${ACTIVE_RUNTIME_KIND}"
  print -r -- "ACTIVE_RUNTIME_IDENTIFIER=${ACTIVE_RUNTIME_IDENTIFIER:-none}"
  print -r -- "ACTIVE_RUNTIME_HEALTH=${ACTIVE_RUNTIME_HEALTH}"
  print -r -- "ACTIVE_RUNTIME_STARTED_AT=${ACTIVE_RUNTIME_STARTED_AT}"
  print -r -- "ACTIVE_RUNTIME_COMMAND=${ACTIVE_RUNTIME_COMMAND}"
  print -r -- "ACTIVE_RUNTIME_CWD=${ACTIVE_RUNTIME_CWD}"
  print -r -- "ACTIVE_RUNTIME_MOUNT=${ACTIVE_RUNTIME_MOUNT}"
  print -r -- "ACTIVE_RUNTIME_DATABASE_VOLUME=${ACTIVE_RUNTIME_DATABASE_VOLUME}"
  print -r -- "ACTIVE_RUNTIME_NETWORK=${ACTIVE_RUNTIME_NETWORK}"
  print -r -- "RUNTIME_OWNERSHIP=${RUNTIME_OWNERSHIP}"
  print -r -- "RUNTIME_RESTART_REQUIRED=${RUNTIME_RESTART_REQUIRED}"
  print -r -- "PRODUCTION_URL=http://localhost:${HOST_PORT}"
  print -r -- "RUNTIME_OWNERSHIP_DETAIL=${RUNTIME_OWNERSHIP_DETAIL}"
  return "${detection_status}"
}

wait_for_runtime_health() {
  local attempt

  for attempt in {1..60}; do
    if runtime_health_is_ready; then
      return 0
    fi
    sleep 1
  done
  print -u2 "The web runtime did not become healthy at http://localhost:${HOST_PORT}/api/health."
  return 1
}

ensure_runtime_db_ready() {
  local start_if_needed="${1:-1}"
  local attempt

  if (( start_if_needed )); then
    runtime_compose up -d db >/dev/null
    dev_runtime_record_session_resources
  fi
  for attempt in {1..30}; do
    if runtime_compose exec -T db pg_isready -U postgres -d zoom_demo >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  print -u2 "Runtime PostgreSQL did not become ready for project ${COMPOSE_PROJECT_NAME}."
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
    print -u2 "Run './dev-compose.sh up web' in an interactive terminal and approve db:deploy."
    return 1
  fi
  printf "Pending Prisma migrations detected for %s. Run 'npm run db:deploy' now? [y/N] " "${COMPOSE_PROJECT_NAME}" >&${tty_fd} || {
    exec {tty_fd}>&-
    return 1
  }
  IFS= read -r -u ${tty_fd} answer || {
    exec {tty_fd}>&-
    return 1
  }
  exec {tty_fd}>&-
  case "${answer:l}" in
    y | yes)
      return 0
      ;;
    *)
      print -u2 "Prisma migration deploy skipped. Aborting before web startup."
      return 1
      ;;
  esac
}

run_web_container_command() {
  runtime_compose run --rm --no-deps --build web sh -lc "$1"
}

ensure_prisma_migrations_current() {
  local start_db_if_needed="${1:-1}"
  local status_output
  local deploy_output

  MIGRATION_DEPLOYED=0
  ensure_runtime_db_ready "${start_db_if_needed}"
  if status_output="$(run_web_container_command "npm ci && npm exec prisma migrate status" 2>&1)"; then
    return 0
  fi
  if ! is_pending_migration_output "${status_output}"; then
    print -u2 -r -- "${status_output}"
    print -u2 "Prisma migration status failed; connection errors and drift are not treated as pending migrations."
    return 1
  fi

  print -u2 -r -- "${status_output}"
  confirm_pending_migration_deploy
  if ! deploy_output="$(run_web_container_command "npm ci && npm run db:deploy" 2>&1)"; then
    print -u2 -r -- "${deploy_output}"
    print -u2 "Prisma migration deploy failed."
    return 1
  fi
  MIGRATION_DEPLOYED=1
}

runtime_refuse_automatic_refresh() {
  (( RUNTIME_RESTART_REQUIRED )) || return 1

  if [[ "${ACTIVE_RUNTIME_KIND}" == "native-unmanaged" ]]; then
    print -u2 "Runtime configuration changed outside HMR. The verified native Next.js PID was preserved; restart that native runtime explicitly after reviewing the change."
  else
    print -u2 "Runtime configuration changed outside HMR. No automatic restart was performed. Use './dev-compose.sh restart web' after reviewing the change."
  fi
  return 0
}

runtime_prepare_command() {
  dev_runtime_prepare
  dev_runtime_print_context
}

runtime_status_command() {
  local url_only=0

  if [[ $# -gt 1 || ( $# -eq 1 && "$1" != "--url" ) ]]; then
    print -u2 "Usage: ./dev-compose.sh status [--url]"
    return 2
  fi
  [[ "${1:-}" == "--url" ]] && url_only=1
  dev_runtime_load
  runtime_print_status "${url_only}"
}

runtime_ensure_command() {
  local detection_status=0

  [[ $# -eq 0 ]] || {
    print -u2 "Usage: ./dev-compose.sh ensure"
    return 2
  }
  dev_runtime_prepare
  runtime_detect_web || detection_status=$?
  if (( detection_status != 0 )); then
    print -u2 -r -- "${RUNTIME_OWNERSHIP_DETAIL}"
    return 1
  fi
  if runtime_refuse_automatic_refresh; then
    return 1
  fi

  if [[ "${ACTIVE_RUNTIME_KIND}" == "native-unmanaged" ]]; then
    print -r -- "Reusing healthy native Next.js PID ${ACTIVE_RUNTIME_IDENTIFIER}; no Docker daemon, Compose service, or database was changed."
    print -r -- "Migration ownership is unmanaged for this native runtime; run an explicit checkout-scoped migration workflow when schema changes require it."
    runtime_print_status 0
    return 0
  fi

  ensure_docker_daemon
  dev_runtime_capture_session_baseline
  runtime_validate_project_containers
  detection_status=0
  runtime_detect_web || detection_status=$?
  if (( detection_status != 0 )); then
    print -u2 -r -- "${RUNTIME_OWNERSHIP_DETAIL}"
    return 1
  fi
  if runtime_refuse_automatic_refresh; then
    return 1
  fi

  if [[ "${ACTIVE_RUNTIME_KIND}" == "native-unmanaged" ]]; then
    print -r -- "Reusing healthy native Next.js PID ${ACTIVE_RUNTIME_IDENTIFIER}; no Compose service or database was changed."
    print -r -- "Migration ownership is unmanaged for this native runtime; run an explicit checkout-scoped migration workflow when schema changes require it."
    runtime_print_status 0
    return 0
  fi

  if [[ "${ACTIVE_RUNTIME_KIND}" == "none" ]]; then
    configure_web_access
  fi

  if [[ "${ACTIVE_RUNTIME_KIND}" == "compose" ]]; then
    ensure_prisma_migrations_current 0
  else
    ensure_prisma_migrations_current 1
  fi

  if [[ "${ACTIVE_RUNTIME_KIND}" == "compose" ]]; then
    if (( MIGRATION_DEPLOYED )); then
      runtime_validate_container_identity "${ACTIVE_RUNTIME_IDENTIFIER}" web 1
      runtime_compose restart web
      wait_for_runtime_health
      print -r -- "Applied pending migrations and restarted only the verified web service."
    else
      print -r -- "Reusing healthy Compose web container ${ACTIVE_RUNTIME_IDENTIFIER}; no restart was performed."
    fi
    runtime_print_status 0
    return 0
  fi

  local up_status=0
  runtime_compose up -d --build web || up_status=$?
  dev_runtime_record_session_resources
  (( up_status == 0 )) || return "${up_status}"
  wait_for_runtime_health
  dev_runtime_commit_config_digest
  runtime_print_status 0
}

runtime_safe_up() {
  local up_status=0
  local detection_status=0

  dev_runtime_prepare
  ensure_docker_daemon
  dev_runtime_capture_session_baseline
  runtime_validate_project_containers
  if up_invocation_starts_service web "$@"; then
    runtime_detect_web || detection_status=$?
    if (( detection_status != 0 )); then
      print -u2 -r -- "${RUNTIME_OWNERSHIP_DETAIL}"
      return 1
    fi
    configure_web_access
  fi
  if up_invocation_requires_migration_check "$@"; then
    ensure_prisma_migrations_current
  fi
  runtime_compose "$@" || up_status=$?
  dev_runtime_record_session_resources
  return "${up_status}"
}

runtime_restart_web() {
  local before_container_id
  local before_mount
  local after_container_id
  local after_mount

  [[ $# -eq 1 && "$1" == "web" ]] || {
    print -u2 "Only './dev-compose.sh restart web' is supported."
    return 2
  }
  dev_runtime_prepare
  ensure_docker_daemon
  dev_runtime_capture_session_baseline
  runtime_detect_web || {
    print -u2 -r -- "${RUNTIME_OWNERSHIP_DETAIL}"
    return 1
  }
  [[ "${ACTIVE_RUNTIME_KIND}" == "compose" ]] || {
    print -u2 "The active runtime is ${ACTIVE_RUNTIME_KIND}; the wrapper does not own its restart lifecycle."
    return 1
  }
  before_container_id="${ACTIVE_RUNTIME_IDENTIFIER}"
  before_mount="$(runtime_container_mount_source "${before_container_id}")"
  runtime_validate_container_identity "${before_container_id}" web 1
  runtime_compose up -d --build --no-deps --force-recreate web
  dev_runtime_record_session_resources
  wait_for_runtime_health
  dev_runtime_commit_config_digest
  runtime_detect_web
  [[ "${ACTIVE_RUNTIME_KIND}" == "compose" ]] || {
    print -u2 "The recreated web runtime could not be verified as a Compose container."
    return 1
  }
  after_container_id="${ACTIVE_RUNTIME_IDENTIFIER}"
  after_mount="$(runtime_container_mount_source "${after_container_id}")"
  runtime_validate_container_identity "${after_container_id}" web 1
  dev_runtime_record_session_resources
  print -r -- "Explicitly recreated verified web service in ${COMPOSE_PROJECT_NAME}."
  print -r -- "WEB_CONTAINER_BEFORE=${before_container_id}"
  print -r -- "WEB_CONTAINER_AFTER=${after_container_id}"
  print -r -- "WEB_MOUNT_BEFORE=${before_mount}"
  print -r -- "WEB_MOUNT_AFTER=${after_mount}"
  print -r -- "WEB_PORT=${HOST_PORT}"
  print -r -- "WEB_URL=http://localhost:${HOST_PORT}"
}

runtime_stop_services() {
  local service
  local container_id

  (( $# > 0 )) || {
    print -u2 "Usage: ./dev-compose.sh stop <web|studio|db> [...]"
    return 2
  }
  dev_runtime_prepare
  ensure_docker_daemon
  dev_runtime_capture_session_baseline
  runtime_validate_project_containers
  for service in "$@"; do
    case "${service}" in
      web | studio | db)
        ;;
      *)
        print -u2 "Unsupported service for scoped stop: ${service}."
        return 2
        ;;
    esac
    container_id="$(runtime_compose ps -aq "${service}")"
    if [[ -n "${container_id}" ]]; then
      runtime_validate_container_identity "${container_id}" "${service}" "$([[ "${service}" == "web" ]] && print 1 || print 0)"
    fi
  done
  runtime_compose stop "$@"
  dev_runtime_record_session_resources
}

runtime_cleanup_label_matches() {
  local container_id="$1"
  local runtime_id
  local checkout
  local session_id

  runtime_id="$(runtime_container_label "${container_id}" dev.zoomgov.runtime.id)" || return 1
  checkout="$(runtime_container_label "${container_id}" dev.zoomgov.runtime.checkout)" || return 1
  session_id="$(runtime_container_label "${container_id}" dev.zoomgov.runtime.session-id)" || return 1
  [[ "${runtime_id}" == "${RUNTIME_ID}" && "${checkout:A}" == "${RUNTIME_CHECKOUT_PATH}" && "${session_id}" == "${CODEX_RUNTIME_SESSION_ID}" ]]
}

runtime_cleanup_network_label_matches() {
  local network_id="$1"
  local runtime_id
  local checkout
  local session_id

  runtime_id="$(docker network inspect --format '{{ index .Labels "dev.zoomgov.runtime.id" }}' "${network_id}" 2>/dev/null)" || return 1
  checkout="$(docker network inspect --format '{{ index .Labels "dev.zoomgov.runtime.checkout" }}' "${network_id}" 2>/dev/null)" || return 1
  session_id="$(docker network inspect --format '{{ index .Labels "dev.zoomgov.runtime.session-id" }}' "${network_id}" 2>/dev/null)" || return 1
  [[ "${runtime_id}" == "${RUNTIME_ID}" && "${checkout:A}" == "${RUNTIME_CHECKOUT_PATH}" && "${session_id}" == "${CODEX_RUNTIME_SESSION_ID}" ]]
}

runtime_confirmation_cleanup_policy() {
  local policy_output
  local policy_status=0
  local confirmation_stop_session_id="${CODEX_CONFIRMATION_STOP_SESSION_ID:-}"

  policy_output="$(CODEX_CONFIRMATION_STOP_SESSION_ID="${confirmation_stop_session_id}" node "${DEV_COMPOSE_SCRIPT_DIR}/scripts/confirmation-session.mjs" \
    runtime-cleanup-policy \
    "${CODEX_RUNTIME_SESSION_ID}" \
    "${RUNTIME_ID}" \
    "${COMPOSE_PROJECT_NAME}")" || policy_status=$?
  case "${policy_status}" in
    0)
      return 0
      ;;
    10)
      print -r -- "Cleanup skipped: the exact worktree runtime is held by an active confirmation session."
      [[ -n "${policy_output}" ]] && print -r -- "${policy_output}"
      return 10
      ;;
    *)
      print -u2 "Cleanup refused because confirmation-session ownership could not be verified."
      return 1
      ;;
  esac
}

runtime_cleanup() {
  local captured
  local container_output
  local network_output
  local container_id
  local network_id
  local running
  local failed=0

  [[ $# -eq 0 ]] || {
    print -u2 "Usage: ./dev-compose.sh cleanup"
    return 2
  }
  dev_runtime_load
  if [[ "${RUNTIME_MODE}" == "local" ]]; then
    print -r -- "Local cleanup is a no-op; pre-existing native and Compose runtimes are preserved."
    return 0
  fi
  local confirmation_policy_status=0
  runtime_confirmation_cleanup_policy || confirmation_policy_status=$?
  if (( confirmation_policy_status == 10 )); then
    return 0
  fi
  (( confirmation_policy_status == 0 )) || return "${confirmation_policy_status}"
  if [[ ! -f "${RUNTIME_SESSION_PATH}" || "${CODEX_RUNTIME_SESSION_ID}" == "worktree-unmanaged" ]]; then
    print -r -- "No worktree runtime session exists; nothing was removed."
    return 0
  fi
  ensure_docker_daemon
  captured="$(dev_runtime_session_read baselineCaptured)" || return 1
  if [[ "${captured}" != "true" ]]; then
    print -u2 "The worktree runtime baseline was never captured; cleanup is refusing to guess ownership."
    return 1
  fi

  container_output="$(dev_runtime_session_read createdContainerIds)" || return 1
  for container_id in ${(f)container_output}; do
    [[ -n "${container_id}" ]] || continue
    if ! docker inspect "${container_id}" >/dev/null 2>&1; then
      continue
    fi
    if ! runtime_cleanup_label_matches "${container_id}"; then
      print -u2 "Preserving container ${container_id}: session ownership labels do not match."
      failed=1
      continue
    fi
    running="$(docker inspect --format '{{ .State.Running }}' "${container_id}")"
    if [[ "${running}" == "true" ]]; then
      docker stop "${container_id}" >/dev/null || failed=1
    fi
    docker rm "${container_id}" >/dev/null || failed=1
  done

  network_output="$(dev_runtime_session_read createdNetworkIds)" || return 1
  for network_id in ${(f)network_output}; do
    [[ -n "${network_id}" ]] || continue
    if ! docker network inspect "${network_id}" >/dev/null 2>&1; then
      continue
    fi
    if ! runtime_cleanup_network_label_matches "${network_id}"; then
      print -u2 "Preserving network ${network_id}: session ownership labels do not match."
      failed=1
      continue
    fi
    docker network rm "${network_id}" >/dev/null || failed=1
  done

  if (( failed )); then
    print -u2 "Cleanup preserved one or more resources because exact ownership or removal could not be proven."
    return 1
  fi
  dev_runtime_close_session
  print -r -- "Removed only session-owned worktree containers and networks; named volumes were preserved."
}

runtime_passthrough() {
  local command_index
  local subcommand
  local command_status=0

  command_index="$(compose_subcommand_index "$@")" || {
    print -u2 "A Docker Compose subcommand is required."
    return 2
  }
  subcommand="${@[${command_index}]}"
  case "${subcommand}" in
    down | rm | kill)
      print -u2 "'${subcommand}' is blocked because it can remove project-wide resources. Use scoped stop or cleanup."
      return 2
      ;;
    up)
      runtime_safe_up "$@"
      return
      ;;
    restart)
      shift $(( command_index ))
      runtime_restart_web "$@"
      return
      ;;
    stop)
      shift $(( command_index ))
      runtime_stop_services "$@"
      return
      ;;
  esac

  dev_runtime_prepare
  if [[ "${subcommand}" != "config" && "${subcommand}" != "version" ]]; then
    ensure_docker_daemon
    dev_runtime_capture_session_baseline
    runtime_validate_project_containers
  fi
  runtime_compose "$@" || command_status=$?
  if [[ "${subcommand}" == "run" || "${subcommand}" == "create" ]]; then
    dev_runtime_record_session_resources
  fi
  return "${command_status}"
}

main() {
  local command_name

  reject_runtime_scope_overrides "$@"
  if [[ $# -eq 0 ]]; then
    set -- ensure
  fi
  command_name="$1"
  shift
  case "${command_name}" in
    prepare)
      [[ $# -eq 0 ]] || {
        print -u2 "Usage: ./dev-compose.sh prepare"
        return 2
      }
      runtime_prepare_command
      ;;
    status)
      runtime_status_command "$@"
      ;;
    ensure)
      runtime_ensure_command "$@"
      ;;
    restart)
      runtime_restart_web "$@"
      ;;
    stop)
      runtime_stop_services "$@"
      ;;
    cleanup)
      runtime_cleanup "$@"
      ;;
    *)
      runtime_passthrough "${command_name}" "$@"
      ;;
  esac
}

main "$@"
