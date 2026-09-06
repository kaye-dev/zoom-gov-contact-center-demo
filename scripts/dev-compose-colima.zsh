typeset -gr DEV_COMPOSE_COLIMA_MIN_MEMORY_GIB=6
typeset -gr DEV_COMPOSE_COLIMA_MIN_MEMORY_BYTES=$(( DEV_COMPOSE_COLIMA_MIN_MEMORY_GIB * 1024 * 1024 * 1024 ))
typeset -gr DEV_COMPOSE_COLIMA_MIN_CPUS=4

typeset -g DEV_COMPOSE_COLIMA_CONTEXT_NAME=""
typeset -g DEV_COMPOSE_COLIMA_PROFILE_NAME=""
typeset -g DEV_COMPOSE_COLIMA_DOCKER_ENDPOINT=""
typeset -g DEV_COMPOSE_COLIMA_CONFIGURED_MEMORY_BYTES=0
typeset -g DEV_COMPOSE_COLIMA_CONFIGURED_CPUS=0
typeset -g DEV_COMPOSE_COLIMA_RESOLUTION_ERROR=""
typeset -g DEV_COMPOSE_COLIMA_PROMPT_ANSWER=""

dev_compose_colima_count_literal_occurrences() {
  local value="$1"
  local needle="$2"
  local count=0

  while [[ "${value}" == *"${needle}"* ]]; do
    value="${value#*"${needle}"}"
    (( count += 1 ))
  done
  print -r -- "${count}"
}

dev_compose_colima_extract_json_string() {
  local json="$1"
  local field="$2"
  local field_name="\"${field}\""
  local prefix="\"${field}\":\""
  local remainder
  local value

  [[ "$(dev_compose_colima_count_literal_occurrences "${json}" "${field_name}")" == "1" ]] || return 1
  [[ "$(dev_compose_colima_count_literal_occurrences "${json}" "${prefix}")" == "1" ]] || return 1
  remainder="${json#*"${prefix}"}"
  value="${remainder%%\"*}"
  [[ "${value}" != "${remainder}" && -n "${value}" && "${value}" != *\\* && "${value}" != *$'\n'* ]] || return 1
  print -r -- "${value}"
}

dev_compose_colima_extract_json_positive_integer() {
  local json="$1"
  local field="$2"
  local field_name="\"${field}\""
  local prefix="\"${field}\":"
  local remainder
  local value

  [[ "$(dev_compose_colima_count_literal_occurrences "${json}" "${field_name}")" == "1" ]] || return 1
  [[ "$(dev_compose_colima_count_literal_occurrences "${json}" "${prefix}")" == "1" ]] || return 1
  remainder="${json#*"${prefix}"}"
  value="${remainder%%,*}"
  value="${value%%\}*}"
  [[ "${value}" == <-> && "${value}" -gt 0 ]] || return 1
  print -r -- "${value}"
}

dev_compose_colima_profile_from_context() {
  local context_name="$1"
  local profile_name

  case "${context_name}" in
    colima) profile_name="default" ;;
    colima-*) profile_name="${context_name#colima-}" ;;
    *) return 1 ;;
  esac
  [[ ${#profile_name} -ge 1 && ${#profile_name} -le 128 && "${profile_name}" =~ '^[A-Za-z0-9][A-Za-z0-9._-]*$' ]] || return 1
  print -r -- "${profile_name}"
}

dev_compose_colima_load_status() {
  local profile_name="$1"
  local status_json
  local runtime
  local docker_endpoint
  local memory_bytes
  local cpus

  status_json="$(colima status "${profile_name}" --json 2>/dev/null)" || return 1
  [[ "${status_json}" == \{*\} && "${status_json}" != *$'\n'* ]] || return 1
  runtime="$(dev_compose_colima_extract_json_string "${status_json}" runtime)" || return 1
  docker_endpoint="$(dev_compose_colima_extract_json_string "${status_json}" docker_socket)" || return 1
  memory_bytes="$(dev_compose_colima_extract_json_positive_integer "${status_json}" memory)" || return 1
  cpus="$(dev_compose_colima_extract_json_positive_integer "${status_json}" cpu)" || return 1
  [[ "${runtime}" == "docker" && "${docker_endpoint}" == unix://* ]] || return 1

  DEV_COMPOSE_COLIMA_PROFILE_NAME="${profile_name}"
  DEV_COMPOSE_COLIMA_DOCKER_ENDPOINT="${docker_endpoint}"
  DEV_COMPOSE_COLIMA_CONFIGURED_MEMORY_BYTES="${memory_bytes}"
  DEV_COMPOSE_COLIMA_CONFIGURED_CPUS="${cpus}"
}

dev_compose_colima_resolve_active_owner() {
  local context_name
  local context_endpoint
  local profile_name

  DEV_COMPOSE_COLIMA_CONTEXT_NAME=""
  DEV_COMPOSE_COLIMA_PROFILE_NAME=""
  DEV_COMPOSE_COLIMA_DOCKER_ENDPOINT=""
  DEV_COMPOSE_COLIMA_CONFIGURED_MEMORY_BYTES=0
  DEV_COMPOSE_COLIMA_CONFIGURED_CPUS=0
  DEV_COMPOSE_COLIMA_RESOLUTION_ERROR=""

  if [[ -n "${DOCKER_HOST:-}" || -n "${DOCKER_CONTEXT:-}" ]]; then
    DEV_COMPOSE_COLIMA_RESOLUTION_ERROR="DOCKER_HOST or DOCKER_CONTEXT explicitly overrides Docker endpoint ownership."
    return 1
  fi
  if ! command -v colima >/dev/null 2>&1; then
    DEV_COMPOSE_COLIMA_RESOLUTION_ERROR="Colima CLI is unavailable."
    return 1
  fi
  context_name="$(docker context show 2>/dev/null)" || {
    DEV_COMPOSE_COLIMA_RESOLUTION_ERROR="The active Docker context could not be read."
    return 1
  }
  if [[ -z "${context_name}" || "${context_name}" == *$'\n'* ]]; then
    DEV_COMPOSE_COLIMA_RESOLUTION_ERROR="The active Docker context is invalid."
    return 1
  fi
  profile_name="$(dev_compose_colima_profile_from_context "${context_name}")" || {
    DEV_COMPOSE_COLIMA_RESOLUTION_ERROR="The active Docker context is not an identifiable Colima context."
    return 1
  }
  context_endpoint="$(docker context inspect "${context_name}" --format '{{.Endpoints.docker.Host}}' 2>/dev/null)" || {
    DEV_COMPOSE_COLIMA_RESOLUTION_ERROR="The active Docker context endpoint could not be read."
    return 1
  }
  if [[ "${context_endpoint}" != unix://* || "${context_endpoint}" == *$'\n'* ]]; then
    DEV_COMPOSE_COLIMA_RESOLUTION_ERROR="The active Docker context endpoint is not a valid local Unix socket."
    return 1
  fi
  if ! dev_compose_colima_load_status "${profile_name}"; then
    DEV_COMPOSE_COLIMA_RESOLUTION_ERROR="The Colima profile status is unavailable, malformed, or not a Docker runtime."
    return 1
  fi
  if [[ "${context_endpoint}" != "${DEV_COMPOSE_COLIMA_DOCKER_ENDPOINT}" ]]; then
    DEV_COMPOSE_COLIMA_RESOLUTION_ERROR="The active Docker endpoint does not match the Colima profile socket."
    return 1
  fi
  DEV_COMPOSE_COLIMA_CONTEXT_NAME="${context_name}"
}

dev_compose_colima_read_docker_memory_bytes() {
  local memory_bytes

  memory_bytes="$(docker info --format '{{.MemTotal}}' 2>/dev/null)" || return 1
  [[ "${memory_bytes}" == <-> && "${memory_bytes}" -gt 0 ]] || return 1
  print -r -- "${memory_bytes}"
}

dev_compose_colima_format_gib() {
  awk -v bytes="$1" 'BEGIN { printf "%.2f", bytes / 1073741824 }'
}

dev_compose_colima_target_memory_gib() {
  local memory_bytes="$1"

  if (( memory_bytes < DEV_COMPOSE_COLIMA_MIN_MEMORY_BYTES )); then
    print -r -- "${DEV_COMPOSE_COLIMA_MIN_MEMORY_GIB}"
  elif (( memory_bytes % 1073741824 == 0 )); then
    print -r -- "$(( memory_bytes / 1073741824 ))"
  else
    dev_compose_colima_format_gib "${memory_bytes}"
  fi
}

dev_compose_colima_is_recommended() {
  local docker_memory_bytes="$1"

  (( docker_memory_bytes >= DEV_COMPOSE_COLIMA_MIN_MEMORY_BYTES )) &&
    (( DEV_COMPOSE_COLIMA_CONFIGURED_MEMORY_BYTES >= DEV_COMPOSE_COLIMA_MIN_MEMORY_BYTES )) &&
    (( DEV_COMPOSE_COLIMA_CONFIGURED_CPUS >= DEV_COMPOSE_COLIMA_MIN_CPUS ))
}

dev_compose_colima_report_active_containers() {
  local container_list
  local line
  local count=0

  container_list="$(docker ps --format '{{.ID}} {{.Names}} {{.Image}} {{.Status}}' 2>/dev/null)" || return 1
  while IFS= read -r line || [[ -n "${line}" ]]; do
    [[ -n "${line}" ]] || continue
    print -u2 -r -- "  ${line}"
    (( count += 1 ))
    (( count < 10 )) || break
  done <<< "${container_list}"
}

dev_compose_colima_require_no_active_containers() {
  local container_ids

  container_ids="$(docker ps --quiet 2>/dev/null)" || {
    print -u2 "Could not inspect active Docker containers. Colima was not changed."
    return 1
  }
  if [[ -n "${container_ids}" ]]; then
    print -u2 "Active Docker containers prevent an automatic Colima restart:"
    dev_compose_colima_report_active_containers || true
    print -u2 "Stop or preserve the listed workloads explicitly, then retry ./dev-compose.sh ensure."
    return 1
  fi
}

dev_compose_colima_prompt_confirmation() {
  local prompt="$1"
  local tty_fd

  DEV_COMPOSE_COLIMA_PROMPT_ANSWER=""
  if ! { exec {tty_fd}<>/dev/tty; [[ -n "${tty_fd:-}" ]] } 2>/dev/null; then
    return 1
  fi
  printf "%s" "${prompt}" >&${tty_fd} || {
    exec {tty_fd}>&-
    return 1
  }
  IFS= read -r -u ${tty_fd} DEV_COMPOSE_COLIMA_PROMPT_ANSWER || DEV_COMPOSE_COLIMA_PROMPT_ANSWER=""
  exec {tty_fd}>&-
}

dev_compose_colima_is_affirmative() {
  [[ "$1" =~ '^[yY]([eE][sS])?$' ]]
}

dev_compose_colima_reconfigure() {
  local initial_context="$1"
  local initial_profile="$2"
  local initial_endpoint="$3"
  local target_memory_gib="$4"
  local target_cpus="$5"
  local docker_memory_bytes

  docker_memory_bytes="$(dev_compose_colima_read_docker_memory_bytes)" || {
    print -u2 "Could not read Docker memory after approval. Colima was not changed."
    return 1
  }
  if ! dev_compose_colima_resolve_active_owner ||
      [[ "${DEV_COMPOSE_COLIMA_CONTEXT_NAME}" != "${initial_context}" ||
         "${DEV_COMPOSE_COLIMA_PROFILE_NAME}" != "${initial_profile}" ||
         "${DEV_COMPOSE_COLIMA_DOCKER_ENDPOINT}" != "${initial_endpoint}" ]]; then
    print -u2 "Docker or Colima ownership changed after approval. Colima was not restarted."
    return 1
  fi
  if dev_compose_colima_is_recommended "${docker_memory_bytes}"; then
    print -r -- "Colima resources now satisfy the recommendation; restart was skipped."
    return 0
  fi
  dev_compose_colima_require_no_active_containers || return 1

  print -r -- "Restarting Colima profile '${initial_profile}' with ${target_memory_gib} GiB and ${target_cpus} CPUs..."
  if ! colima stop "${initial_profile}"; then
    print -u2 "Colima stop failed for profile '${initial_profile}'. It was not force-stopped or deleted."
    return 1
  fi
  if ! colima start "${initial_profile}" --memory "${target_memory_gib}" --cpus "${target_cpus}" --save-config; then
    print -u2 "Colima start failed for profile '${initial_profile}'. Recover with 'colima start ${initial_profile} --memory ${target_memory_gib} --cpus ${target_cpus} --save-config'."
    return 1
  fi
  docker info >/dev/null 2>&1 || {
    print -u2 "Docker is unavailable after restarting Colima profile '${initial_profile}'."
    return 1
  }
  if ! dev_compose_colima_resolve_active_owner ||
      [[ "${DEV_COMPOSE_COLIMA_CONTEXT_NAME}" != "${initial_context}" ||
         "${DEV_COMPOSE_COLIMA_PROFILE_NAME}" != "${initial_profile}" ||
         "${DEV_COMPOSE_COLIMA_DOCKER_ENDPOINT}" != "${initial_endpoint}" ]]; then
    print -u2 "Docker endpoint verification failed after restarting Colima profile '${initial_profile}'."
    return 1
  fi
  docker_memory_bytes="$(dev_compose_colima_read_docker_memory_bytes)" || {
    print -u2 "Could not read Docker memory after restarting Colima profile '${initial_profile}'."
    return 1
  }
  if ! dev_compose_colima_is_recommended "${docker_memory_bytes}"; then
    print -u2 "Colima profile '${initial_profile}' remains below the ${DEV_COMPOSE_COLIMA_MIN_MEMORY_GIB} GiB / ${DEV_COMPOSE_COLIMA_MIN_CPUS} CPU recommendation after restart."
    return 1
  fi
  print -r -- "Colima profile '${initial_profile}' restarted and resources were verified."
}

dev_compose_colima_preflight() {
  local docker_memory_bytes
  local initial_context
  local initial_profile
  local initial_endpoint
  local target_memory_gib
  local target_cpus

  docker_memory_bytes="$(dev_compose_colima_read_docker_memory_bytes)" || {
    print -u2 "Colima resource preflight skipped: Docker memory could not be read."
    return 0
  }
  if ! dev_compose_colima_resolve_active_owner; then
    print -u2 "Colima resource preflight skipped: ${DEV_COMPOSE_COLIMA_RESOLUTION_ERROR}"
    return 0
  fi
  if dev_compose_colima_is_recommended "${docker_memory_bytes}"; then
    print -r -- "Colima resources verified: Docker $(dev_compose_colima_format_gib "${docker_memory_bytes}") GiB, configured $(dev_compose_colima_format_gib "${DEV_COMPOSE_COLIMA_CONFIGURED_MEMORY_BYTES}") GiB / ${DEV_COMPOSE_COLIMA_CONFIGURED_CPUS} CPUs."
    return 0
  fi

  dev_compose_colima_require_no_active_containers || return 1
  initial_context="${DEV_COMPOSE_COLIMA_CONTEXT_NAME}"
  initial_profile="${DEV_COMPOSE_COLIMA_PROFILE_NAME}"
  initial_endpoint="${DEV_COMPOSE_COLIMA_DOCKER_ENDPOINT}"
  target_memory_gib="$(dev_compose_colima_target_memory_gib "${DEV_COMPOSE_COLIMA_CONFIGURED_MEMORY_BYTES}")"
  target_cpus=$(( DEV_COMPOSE_COLIMA_CONFIGURED_CPUS > DEV_COMPOSE_COLIMA_MIN_CPUS ? DEV_COMPOSE_COLIMA_CONFIGURED_CPUS : DEV_COMPOSE_COLIMA_MIN_CPUS ))

  print -u2 "Colima profile '${initial_profile}' is below the development recommendation."
  print -u2 "  Docker memory: $(dev_compose_colima_format_gib "${docker_memory_bytes}") GiB; configured: $(dev_compose_colima_format_gib "${DEV_COMPOSE_COLIMA_CONFIGURED_MEMORY_BYTES}") GiB / ${DEV_COMPOSE_COLIMA_CONFIGURED_CPUS} CPUs."
  print -u2 "  Recommended: ${target_memory_gib} GiB / ${target_cpus} CPUs."
  if ! dev_compose_colima_prompt_confirmation "Colima profile '${initial_profile}' を再構成して開発サーバーを起動しますか? [y/N] "; then
    print -u2 "An interactive terminal is required to change or bypass insufficient Colima resources."
    return 1
  fi
  if dev_compose_colima_is_affirmative "${DEV_COMPOSE_COLIMA_PROMPT_ANSWER}"; then
    dev_compose_colima_reconfigure "${initial_context}" "${initial_profile}" "${initial_endpoint}" "${target_memory_gib}" "${target_cpus}"
    return
  fi
  if ! dev_compose_colima_prompt_confirmation "設定を変更せず今回だけ現在の値で起動しますか? OOM が再発する可能性があります。 [y/N] "; then
    print -u2 "An interactive terminal is required to bypass insufficient Colima resources."
    return 1
  fi
  if dev_compose_colima_is_affirmative "${DEV_COMPOSE_COLIMA_PROMPT_ANSWER}"; then
    print -u2 "Continuing once with insufficient Colima resources; OOM may recur."
    return 0
  fi
  print -u2 "Colima resources were not changed and development startup was cancelled."
  return 1
}
