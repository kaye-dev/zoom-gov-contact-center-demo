typeset -gr DEV_RUNTIME_SCHEMA_VERSION="1"
typeset -gr DEV_RUNTIME_SLOT_COUNT=800
typeset -gr DEV_RUNTIME_WEB_PORT_BASE=3100
typeset -gr DEV_RUNTIME_POSTGRES_PORT_BASE=15432
typeset -gr DEV_RUNTIME_STUDIO_PORT_BASE=25555

dev_runtime_error() {
  print -u2 -r -- "Runtime error: $*"
}

dev_runtime_sha256() {
  print -rn -- "$1" | shasum -a 256 | awk '{ print $1 }'
}

dev_runtime_manifest_value() {
  local manifest_file="$1"
  local key="$2"

  awk -v requested_key="${key}" '
    index($0, "=") > 0 {
      current_key = substr($0, 1, index($0, "=") - 1)
      if (current_key == requested_key) {
        count += 1
        value = substr($0, index($0, "=") + 1)
      }
    }
    END {
      if (count != 1) exit 1
      print value
    }
  ' "${manifest_file}"
}

dev_runtime_require_safe_value() {
  local label="$1"
  local value="$2"

  if [[ -z "${value}" || "${value}" == *$'\n'* || "${value}" == *$'\r'* ]]; then
    dev_runtime_error "${label} is empty or contains a newline."
    return 1
  fi
}

dev_runtime_config_digest() {
  local -a candidates
  local candidate_path
  local inventory=""

  candidates=(
    "${RUNTIME_CHECKOUT_PATH}/package.json"
    "${RUNTIME_CHECKOUT_PATH}/package-lock.json"
    "${RUNTIME_CHECKOUT_PATH}/Dockerfile"
    "${RUNTIME_CHECKOUT_PATH}/compose.yaml"
    "${RUNTIME_CHECKOUT_PATH}/compose.worktree.yaml"
    "${RUNTIME_CHECKOUT_PATH}/prisma.config.ts"
    "${RUNTIME_CHECKOUT_PATH}"/next.config.*(N)
    "${RUNTIME_CHECKOUT_PATH}/.env"
    "${RUNTIME_CHECKOUT_PATH}/.env.local"
  )

  for candidate_path in "${candidates[@]}"; do
    if [[ -f "${candidate_path}" && ! -L "${candidate_path}" ]]; then
      inventory+="${candidate_path#${RUNTIME_CHECKOUT_PATH}/}:$(shasum -a 256 "${candidate_path}" | awk '{ print $1 }')"$'\n'
    fi
  done

  print -r -- "sha256:$(dev_runtime_sha256 "${inventory}")"
}

dev_runtime_resolve_identity() {
  local checkout_path
  local git_directory
  local git_common_directory
  local runtime_digest
  local repository_digest

  checkout_path="${DEV_RUNTIME_CHECKOUT_OVERRIDE:-$(git rev-parse --show-toplevel 2>/dev/null)}" || {
    dev_runtime_error "The current directory is not inside a Git checkout."
    return 1
  }
  git_directory="${DEV_RUNTIME_GIT_DIR_OVERRIDE:-$(git rev-parse --absolute-git-dir 2>/dev/null)}" || return 1
  git_common_directory="${DEV_RUNTIME_GIT_COMMON_DIR_OVERRIDE:-$(git rev-parse --git-common-dir 2>/dev/null)}" || return 1

  RUNTIME_CHECKOUT_PATH="${checkout_path:A}"
  RUNTIME_GIT_DIRECTORY="${git_directory:A}"
  if [[ "${git_common_directory}" == /* ]]; then
    RUNTIME_GIT_COMMON_DIR="${git_common_directory:A}"
  else
    RUNTIME_GIT_COMMON_DIR="${RUNTIME_CHECKOUT_PATH}/${git_common_directory}"
    RUNTIME_GIT_COMMON_DIR="${RUNTIME_GIT_COMMON_DIR:A}"
  fi

  dev_runtime_require_safe_value "checkout path" "${RUNTIME_CHECKOUT_PATH}"
  dev_runtime_require_safe_value "Git common directory" "${RUNTIME_GIT_COMMON_DIR}"

  repository_digest="$(dev_runtime_sha256 "${RUNTIME_GIT_COMMON_DIR}")"
  RUNTIME_REPOSITORY_ID="${repository_digest[1,12]}"
  RUNTIME_MANIFEST_PATH="${RUNTIME_CHECKOUT_PATH}/.codex/runtime.local.env"
  RUNTIME_SESSION_PATH="${RUNTIME_CHECKOUT_PATH}/.codex/runtime-session.local.json"
  RUNTIME_STATE_ROOT="${DEV_RUNTIME_STATE_ROOT:-${TMPDIR:-/tmp}/zoom-gov-contact-center-demo-runtime}/${RUNTIME_REPOSITORY_ID}"
  RUNTIME_LOCK_PATH="${RUNTIME_STATE_ROOT}/allocation.lock"
  RUNTIME_CONFIG_DIGEST="$(dev_runtime_config_digest)"
  RUNTIME_CONFIG_CHANGED=0
  RUNTIME_PREVIOUS_CONFIG_DIGEST=""
  RUNTIME_VOLUME_CONFIG_DIGEST=""
  RUNTIME_VOLUME_OWNER_SESSION_ID=""
  RUNTIME_VOLUME_IDENTITY_PERSISTED=0

  if [[ "${RUNTIME_GIT_DIRECTORY}" == "${RUNTIME_GIT_COMMON_DIR}" ]]; then
    RUNTIME_MODE="local"
    RUNTIME_ID="local"
    COMPOSE_PROJECT_NAME="zoom-gov-contact-center-demo"
    HOST_PORT=3000
    POSTGRES_PORT=5432
    STUDIO_PORT=5555
    WEB_BIND_ADDRESS="127.0.0.1"
    WEB_ORIGIN="http://localhost:3000"
    RUNTIME_SLOT=""
  else
    RUNTIME_MODE="worktree"
    runtime_digest="$(dev_runtime_sha256 "${RUNTIME_CHECKOUT_PATH}")"
    RUNTIME_ID="${runtime_digest[1,12]}"
    COMPOSE_PROJECT_NAME="zoom-gov-demo-wt-${RUNTIME_ID}"
    WEB_BIND_ADDRESS="127.0.0.1"
  fi

  export RUNTIME_MODE RUNTIME_ID RUNTIME_CHECKOUT_PATH RUNTIME_GIT_COMMON_DIR
  export RUNTIME_CONFIG_DIGEST RUNTIME_CONFIG_CHANGED RUNTIME_PREVIOUS_CONFIG_DIGEST
  export RUNTIME_VOLUME_CONFIG_DIGEST RUNTIME_VOLUME_OWNER_SESSION_ID
  export RUNTIME_VOLUME_IDENTITY_PERSISTED
  export COMPOSE_PROJECT_NAME HOST_PORT POSTGRES_PORT STUDIO_PORT WEB_BIND_ADDRESS WEB_ORIGIN
}

dev_runtime_slot_from_ports() {
  local host_port="$1"
  local postgres_port="$2"
  local studio_port="$3"
  local slot=$(( host_port - DEV_RUNTIME_WEB_PORT_BASE ))

  if (( slot < 0 || slot >= DEV_RUNTIME_SLOT_COUNT )); then
    return 1
  fi
  if (( postgres_port != DEV_RUNTIME_POSTGRES_PORT_BASE + slot )); then
    return 1
  fi
  if (( studio_port != DEV_RUNTIME_STUDIO_PORT_BASE + slot )); then
    return 1
  fi
  print -r -- "${slot}"
}

dev_runtime_assign_slot() {
  local slot="$1"

  RUNTIME_SLOT="${slot}"
  HOST_PORT=$(( DEV_RUNTIME_WEB_PORT_BASE + slot ))
  POSTGRES_PORT=$(( DEV_RUNTIME_POSTGRES_PORT_BASE + slot ))
  STUDIO_PORT=$(( DEV_RUNTIME_STUDIO_PORT_BASE + slot ))
  WEB_ORIGIN="http://localhost:${HOST_PORT}"
  export HOST_PORT POSTGRES_PORT STUDIO_PORT WEB_ORIGIN
}

dev_runtime_port_is_listening() {
  local port="$1"

  if ! command -v lsof >/dev/null 2>&1; then
    dev_runtime_error "lsof is required to allocate a worktree port safely."
    return 2
  fi

  lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
}

dev_runtime_acquire_lock() {
  local attempt

  mkdir -p "${RUNTIME_STATE_ROOT}"
  for attempt in {1..200}; do
    if mkdir "${RUNTIME_LOCK_PATH}" 2>/dev/null; then
      print -r -- "$$" >"${RUNTIME_LOCK_PATH}/pid"
      return 0
    fi
    sleep 0.05
  done

  dev_runtime_error "Timed out waiting for runtime allocation lock ${RUNTIME_LOCK_PATH}."
  return 1
}

dev_runtime_release_lock() {
  if [[ -d "${RUNTIME_LOCK_PATH}" ]]; then
    rm -f "${RUNTIME_LOCK_PATH}/pid"
    rmdir "${RUNTIME_LOCK_PATH}" 2>/dev/null || true
  fi
}

dev_runtime_lease_path() {
  print -r -- "${RUNTIME_STATE_ROOT}/slot-$1.lease"
}

dev_runtime_write_lease() {
  local slot="$1"
  local lease_path
  local temporary_path

  lease_path="$(dev_runtime_lease_path "${slot}")"
  temporary_path="$(mktemp "${lease_path}.tmp.XXXXXX")"
  {
    print -r -- "RUNTIME_SCHEMA_VERSION=${DEV_RUNTIME_SCHEMA_VERSION}"
    print -r -- "RUNTIME_ID=${RUNTIME_ID}"
    print -r -- "RUNTIME_CHECKOUT_PATH=${RUNTIME_CHECKOUT_PATH}"
    print -r -- "RUNTIME_SLOT=${slot}"
    print -r -- "UPDATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"${temporary_path}"
  mv "${temporary_path}" "${lease_path}"
}

dev_runtime_lease_is_reserved_by_other() {
  local slot="$1"
  local lease_path
  local lease_runtime_id
  local lease_checkout
  local lease_slot
  local port

  lease_path="$(dev_runtime_lease_path "${slot}")"
  if [[ ! -f "${lease_path}" ]]; then
    return 1
  fi

  lease_runtime_id="$(dev_runtime_manifest_value "${lease_path}" RUNTIME_ID 2>/dev/null)" || {
    dev_runtime_error "Lease ${lease_path} is malformed; refusing to overwrite it."
    return 0
  }
  lease_checkout="$(dev_runtime_manifest_value "${lease_path}" RUNTIME_CHECKOUT_PATH 2>/dev/null)" || return 0
  lease_slot="$(dev_runtime_manifest_value "${lease_path}" RUNTIME_SLOT 2>/dev/null)" || return 0

  if [[ "${lease_runtime_id}" == "${RUNTIME_ID}" && "${lease_checkout:A}" == "${RUNTIME_CHECKOUT_PATH}" && "${lease_slot}" == "${slot}" ]]; then
    return 1
  fi

  if [[ -d "${lease_checkout}" ]]; then
    return 0
  fi

  for port in \
    $(( DEV_RUNTIME_WEB_PORT_BASE + slot )) \
    $(( DEV_RUNTIME_POSTGRES_PORT_BASE + slot )) \
    $(( DEV_RUNTIME_STUDIO_PORT_BASE + slot )); do
    if dev_runtime_port_is_listening "${port}"; then
      return 0
    fi
  done

  rm -f "${lease_path}"
  return 1
}

dev_runtime_candidate_is_available() {
  local slot="$1"
  local port
  local probe_status

  if dev_runtime_lease_is_reserved_by_other "${slot}"; then
    return 1
  fi

  for port in \
    $(( DEV_RUNTIME_WEB_PORT_BASE + slot )) \
    $(( DEV_RUNTIME_POSTGRES_PORT_BASE + slot )) \
    $(( DEV_RUNTIME_STUDIO_PORT_BASE + slot )); do
    dev_runtime_port_is_listening "${port}" && probe_status=0 || probe_status=$?
    if (( probe_status == 0 )); then
      return 1
    fi
    if (( probe_status == 2 )); then
      return 2
    fi
  done

  return 0
}

dev_runtime_allocate_slot() {
  local digest_prefix
  local first_slot
  local offset
  local candidate

  digest_prefix="$(dev_runtime_sha256 "${RUNTIME_CHECKOUT_PATH}")"
  first_slot=$(( 16#${digest_prefix[1,8]} % DEV_RUNTIME_SLOT_COUNT ))

  dev_runtime_acquire_lock || return 1
  {
    for offset in {0..799}; do
      candidate=$(( (first_slot + offset) % DEV_RUNTIME_SLOT_COUNT ))
      if dev_runtime_candidate_is_available "${candidate}"; then
        dev_runtime_assign_slot "${candidate}"
        dev_runtime_write_lease "${candidate}"
        return 0
      fi
    done
  } always {
    dev_runtime_release_lock
  }

  dev_runtime_error "No free worktree runtime slot is available."
  return 1
}

dev_runtime_write_manifest() {
  local manifest_config_digest="${RUNTIME_CONFIG_DIGEST}"
  local temporary_path

  if (( RUNTIME_CONFIG_CHANGED )) && [[ -n "${RUNTIME_PREVIOUS_CONFIG_DIGEST}" ]]; then
    manifest_config_digest="${RUNTIME_PREVIOUS_CONFIG_DIGEST}"
  fi
  mkdir -p "${RUNTIME_CHECKOUT_PATH}/.codex"
  temporary_path="$(mktemp "${RUNTIME_MANIFEST_PATH}.tmp.XXXXXX")"
  {
    print -r -- "RUNTIME_SCHEMA_VERSION=${DEV_RUNTIME_SCHEMA_VERSION}"
    print -r -- "RUNTIME_MODE=${RUNTIME_MODE}"
    print -r -- "RUNTIME_ID=${RUNTIME_ID}"
    print -r -- "RUNTIME_CHECKOUT_PATH=${RUNTIME_CHECKOUT_PATH}"
    print -r -- "RUNTIME_GIT_COMMON_DIR=${RUNTIME_GIT_COMMON_DIR}"
    print -r -- "RUNTIME_CONFIG_DIGEST=${manifest_config_digest}"
    print -r -- "RUNTIME_VOLUME_CONFIG_DIGEST=${RUNTIME_VOLUME_CONFIG_DIGEST}"
    print -r -- "RUNTIME_VOLUME_OWNER_SESSION_ID=${RUNTIME_VOLUME_OWNER_SESSION_ID}"
    print -r -- "COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}"
    print -r -- "HOST_PORT=${HOST_PORT}"
    print -r -- "POSTGRES_PORT=${POSTGRES_PORT}"
    print -r -- "STUDIO_PORT=${STUDIO_PORT}"
    print -r -- "WEB_BIND_ADDRESS=${WEB_BIND_ADDRESS}"
    print -r -- "WEB_ORIGIN=${WEB_ORIGIN}"
  } >"${temporary_path}"
  chmod 600 "${temporary_path}"
  mv "${temporary_path}" "${RUNTIME_MANIFEST_PATH}"
}

dev_runtime_load_manifest() {
  local manifest_schema
  local manifest_mode
  local manifest_id
  local manifest_checkout
  local manifest_common
  local manifest_config_digest
  local manifest_volume_config_digest
  local manifest_volume_owner_session_id
  local manifest_project
  local manifest_host_port
  local manifest_postgres_port
  local manifest_studio_port
  local manifest_bind
  local manifest_origin
  local manifest_slot

  if [[ ! -f "${RUNTIME_MANIFEST_PATH}" || -L "${RUNTIME_MANIFEST_PATH}" ]]; then
    dev_runtime_error "Runtime manifest is missing or is not a regular file: ${RUNTIME_MANIFEST_PATH}. Run './dev-compose.sh prepare'."
    return 1
  fi

  manifest_schema="$(dev_runtime_manifest_value "${RUNTIME_MANIFEST_PATH}" RUNTIME_SCHEMA_VERSION)" || return 1
  manifest_mode="$(dev_runtime_manifest_value "${RUNTIME_MANIFEST_PATH}" RUNTIME_MODE)" || return 1
  manifest_id="$(dev_runtime_manifest_value "${RUNTIME_MANIFEST_PATH}" RUNTIME_ID)" || return 1
  manifest_checkout="$(dev_runtime_manifest_value "${RUNTIME_MANIFEST_PATH}" RUNTIME_CHECKOUT_PATH)" || return 1
  manifest_common="$(dev_runtime_manifest_value "${RUNTIME_MANIFEST_PATH}" RUNTIME_GIT_COMMON_DIR)" || return 1
  manifest_config_digest="$(dev_runtime_manifest_value "${RUNTIME_MANIFEST_PATH}" RUNTIME_CONFIG_DIGEST)" || return 1
  RUNTIME_PREVIOUS_CONFIG_DIGEST="${manifest_config_digest}"
  manifest_volume_config_digest="$(dev_runtime_manifest_value "${RUNTIME_MANIFEST_PATH}" RUNTIME_VOLUME_CONFIG_DIGEST 2>/dev/null)" || manifest_volume_config_digest=""
  manifest_volume_owner_session_id="$(dev_runtime_manifest_value "${RUNTIME_MANIFEST_PATH}" RUNTIME_VOLUME_OWNER_SESSION_ID 2>/dev/null)" || manifest_volume_owner_session_id=""
  if { [[ -n "${manifest_volume_config_digest}" ]] && [[ -z "${manifest_volume_owner_session_id}" ]]; } ||
     { [[ -z "${manifest_volume_config_digest}" ]] && [[ -n "${manifest_volume_owner_session_id}" ]]; }; then
    dev_runtime_error "Runtime manifest has an incomplete persistent-volume identity."
    return 1
  fi
  RUNTIME_VOLUME_CONFIG_DIGEST="${manifest_volume_config_digest}"
  RUNTIME_VOLUME_OWNER_SESSION_ID="${manifest_volume_owner_session_id}"
  [[ -n "${RUNTIME_VOLUME_CONFIG_DIGEST}" ]] && RUNTIME_VOLUME_IDENTITY_PERSISTED=1
  manifest_project="$(dev_runtime_manifest_value "${RUNTIME_MANIFEST_PATH}" COMPOSE_PROJECT_NAME)" || return 1
  manifest_host_port="$(dev_runtime_manifest_value "${RUNTIME_MANIFEST_PATH}" HOST_PORT)" || return 1
  manifest_postgres_port="$(dev_runtime_manifest_value "${RUNTIME_MANIFEST_PATH}" POSTGRES_PORT)" || return 1
  manifest_studio_port="$(dev_runtime_manifest_value "${RUNTIME_MANIFEST_PATH}" STUDIO_PORT)" || return 1
  manifest_bind="$(dev_runtime_manifest_value "${RUNTIME_MANIFEST_PATH}" WEB_BIND_ADDRESS)" || return 1
  manifest_origin="$(dev_runtime_manifest_value "${RUNTIME_MANIFEST_PATH}" WEB_ORIGIN)" || return 1

  if [[ "${manifest_schema}" != "${DEV_RUNTIME_SCHEMA_VERSION}" ||
        "${manifest_mode}" != "${RUNTIME_MODE}" ||
        "${manifest_id}" != "${RUNTIME_ID}" ||
        "${manifest_checkout:A}" != "${RUNTIME_CHECKOUT_PATH}" ||
        "${manifest_common:A}" != "${RUNTIME_GIT_COMMON_DIR}" ||
        "${manifest_project}" != "${COMPOSE_PROJECT_NAME}" ||
        "${manifest_bind}" != "127.0.0.1" ]]; then
    dev_runtime_error "Runtime manifest identity does not match the current checkout: ${RUNTIME_MANIFEST_PATH}."
    return 1
  fi

  if [[ "${manifest_host_port}" != <-> || "${manifest_postgres_port}" != <-> || "${manifest_studio_port}" != <-> ]]; then
    dev_runtime_error "Runtime manifest ports are invalid."
    return 1
  fi

  if [[ "${RUNTIME_MODE}" == "local" ]]; then
    if [[ "${manifest_host_port}" != "3000" || "${manifest_postgres_port}" != "5432" || "${manifest_studio_port}" != "5555" || "${manifest_origin}" != "http://localhost:3000" ]]; then
      dev_runtime_error "Local runtime manifest must use ports 3000, 5432, and 5555."
      return 1
    fi
    HOST_PORT=3000
    POSTGRES_PORT=5432
    STUDIO_PORT=5555
    WEB_ORIGIN="http://localhost:3000"
  else
    manifest_slot="$(dev_runtime_slot_from_ports "${manifest_host_port}" "${manifest_postgres_port}" "${manifest_studio_port}")" || {
      dev_runtime_error "Worktree runtime manifest ports do not belong to one valid slot."
      return 1
    }
    if [[ "${manifest_origin}" != "http://localhost:${manifest_host_port}" ]]; then
      dev_runtime_error "Worktree runtime origin does not match its web port."
      return 1
    fi
    dev_runtime_assign_slot "${manifest_slot}"
  fi

  if [[ "${manifest_config_digest}" != "${RUNTIME_CONFIG_DIGEST}" ]]; then
    RUNTIME_CONFIG_CHANGED=1
  fi

  export HOST_PORT POSTGRES_PORT STUDIO_PORT WEB_ORIGIN
  export RUNTIME_CONFIG_CHANGED RUNTIME_PREVIOUS_CONFIG_DIGEST
  export RUNTIME_VOLUME_CONFIG_DIGEST RUNTIME_VOLUME_OWNER_SESSION_ID
  export RUNTIME_VOLUME_IDENTITY_PERSISTED
}

dev_runtime_commit_config_digest() {
  RUNTIME_PREVIOUS_CONFIG_DIGEST="${RUNTIME_CONFIG_DIGEST}"
  RUNTIME_CONFIG_CHANGED=0
  export RUNTIME_CONFIG_CHANGED RUNTIME_PREVIOUS_CONFIG_DIGEST
  dev_runtime_write_manifest
}

dev_runtime_docker_is_available() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

dev_runtime_volume_label() {
  local volume_name="$1"
  local label="$2"
  local value

  value="$(docker volume inspect --format "{{ index .Labels \"${label}\" }}" "${volume_name}" 2>/dev/null)" || return 1
  [[ "${value}" == "<no value>" ]] && value=""
  print -r -- "${value}"
}

dev_runtime_resolve_volume_identity() {
  local volume_name
  local volume_key
  local project
  local compose_volume
  local runtime_id
  local checkout
  local mode
  local config_digest
  local owner_session_id
  local discovered_config_digest=""
  local discovered_owner_session_id=""
  local found_volume=0

  if [[ "${RUNTIME_MODE}" == "local" ]]; then
    RUNTIME_VOLUME_CONFIG_DIGEST="${RUNTIME_CONFIG_DIGEST}"
    RUNTIME_VOLUME_OWNER_SESSION_ID="local-unmanaged"
    RUNTIME_VOLUME_IDENTITY_PERSISTED=1
    export RUNTIME_VOLUME_CONFIG_DIGEST RUNTIME_VOLUME_OWNER_SESSION_ID
    export RUNTIME_VOLUME_IDENTITY_PERSISTED
    return 0
  fi

  if ! dev_runtime_docker_is_available; then
    if [[ -z "${RUNTIME_VOLUME_CONFIG_DIGEST}" ]]; then
      RUNTIME_VOLUME_CONFIG_DIGEST="${RUNTIME_CONFIG_DIGEST}"
      RUNTIME_VOLUME_OWNER_SESSION_ID="${CODEX_RUNTIME_SESSION_ID}"
    fi
    export RUNTIME_VOLUME_CONFIG_DIGEST RUNTIME_VOLUME_OWNER_SESSION_ID
    return 0
  fi

  for volume_key in node_modules postgres-data; do
    volume_name="${COMPOSE_PROJECT_NAME}_${volume_key}"
    if ! docker volume inspect "${volume_name}" >/dev/null 2>&1; then
      continue
    fi
    found_volume=1
    project="$(dev_runtime_volume_label "${volume_name}" com.docker.compose.project)" || return 1
    compose_volume="$(dev_runtime_volume_label "${volume_name}" com.docker.compose.volume)" || return 1
    runtime_id="$(dev_runtime_volume_label "${volume_name}" dev.zoomgov.runtime.id)" || return 1
    checkout="$(dev_runtime_volume_label "${volume_name}" dev.zoomgov.runtime.checkout)" || return 1
    mode="$(dev_runtime_volume_label "${volume_name}" dev.zoomgov.runtime.mode)" || return 1
    config_digest="$(dev_runtime_volume_label "${volume_name}" dev.zoomgov.runtime.config-digest)" || return 1
    owner_session_id="$(dev_runtime_volume_label "${volume_name}" dev.zoomgov.runtime.session-id)" || return 1

    if [[ "${project}" != "${COMPOSE_PROJECT_NAME}" || "${compose_volume}" != "${volume_key}" ||
          "${runtime_id}" != "${RUNTIME_ID}" || -z "${checkout}" || "${checkout:A}" != "${RUNTIME_CHECKOUT_PATH}" ||
          "${mode}" != "worktree" || -z "${config_digest}" || -z "${owner_session_id}" ]]; then
      dev_runtime_error "Persistent volume ${volume_name} has incompatible ownership labels; refusing Compose mutation."
      return 1
    fi
    if [[ -z "${discovered_config_digest}" ]]; then
      discovered_config_digest="${config_digest}"
      discovered_owner_session_id="${owner_session_id}"
    elif [[ "${discovered_config_digest}" != "${config_digest}" || "${discovered_owner_session_id}" != "${owner_session_id}" ]]; then
      dev_runtime_error "Persistent volumes for ${COMPOSE_PROJECT_NAME} do not share one creation identity."
      return 1
    fi
  done

  if (( found_volume )); then
    if (( RUNTIME_VOLUME_IDENTITY_PERSISTED )) &&
       [[ "${RUNTIME_VOLUME_CONFIG_DIGEST}" != "${discovered_config_digest}" ||
          "${RUNTIME_VOLUME_OWNER_SESSION_ID}" != "${discovered_owner_session_id}" ]]; then
      dev_runtime_error "Persistent-volume identity differs from the runtime manifest; refusing Compose mutation."
      return 1
    fi
    RUNTIME_VOLUME_CONFIG_DIGEST="${discovered_config_digest}"
    RUNTIME_VOLUME_OWNER_SESSION_ID="${discovered_owner_session_id}"
  elif [[ -z "${RUNTIME_VOLUME_CONFIG_DIGEST}" ]] || (( ! RUNTIME_VOLUME_IDENTITY_PERSISTED )); then
    RUNTIME_VOLUME_CONFIG_DIGEST="${RUNTIME_CONFIG_DIGEST}"
    RUNTIME_VOLUME_OWNER_SESSION_ID="${CODEX_RUNTIME_SESSION_ID}"
  fi

  dev_runtime_require_safe_value "persistent-volume config digest" "${RUNTIME_VOLUME_CONFIG_DIGEST}"
  dev_runtime_require_safe_value "persistent-volume owner session" "${RUNTIME_VOLUME_OWNER_SESSION_ID}"
  RUNTIME_VOLUME_IDENTITY_PERSISTED=1
  export RUNTIME_VOLUME_CONFIG_DIGEST RUNTIME_VOLUME_OWNER_SESSION_ID
  export RUNTIME_VOLUME_IDENTITY_PERSISTED
}

dev_runtime_project_container_ids() {
  docker ps -aq --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" 2>/dev/null | sort -u
}

dev_runtime_project_network_ids() {
  docker network ls -q --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" 2>/dev/null | sort -u
}

dev_runtime_session_read() {
  local field="$1"

  node - "${RUNTIME_SESSION_PATH}" "${field}" "${RUNTIME_ID}" "${RUNTIME_CHECKOUT_PATH}" "${COMPOSE_PROJECT_NAME}" <<'NODE'
const fs = require('node:fs');
const [path, field, runtimeId, checkout, project] = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(path, 'utf8'));
if (state.schemaVersion !== 1 || state.runtimeId !== runtimeId || state.checkout !== checkout || state.composeProject !== project) {
  throw new Error('runtime session identity mismatch');
}
if (field === 'sessionId') process.stdout.write(state.sessionId);
else if (field === 'baselineCaptured') process.stdout.write(String(state.baselineCaptured));
else if (field === 'createdContainerIds') process.stdout.write(state.createdContainerIds.join('\n'));
else if (field === 'createdNetworkIds') process.stdout.write(state.createdNetworkIds.join('\n'));
else throw new Error(`unknown runtime session field: ${field}`);
NODE
}

dev_runtime_create_session() {
  local session_id="$1"
  local baseline_captured="$2"
  local container_ids="$3"
  local network_ids="$4"

  node - "${RUNTIME_SESSION_PATH}" "${session_id}" "${RUNTIME_ID}" "${RUNTIME_CHECKOUT_PATH}" "${COMPOSE_PROJECT_NAME}" "${baseline_captured}" "${container_ids}" "${network_ids}" <<'NODE'
const fs = require('node:fs');
const [path, sessionId, runtimeId, checkout, composeProject, baselineCaptured, containerCsv, networkCsv] = process.argv.slice(2);
const split = (value) => value ? value.split(',').filter(Boolean).sort() : [];
const state = {
  schemaVersion: 1,
  sessionId,
  runtimeId,
  checkout,
  composeProject,
  setupAt: new Date().toISOString(),
  baselineCaptured: baselineCaptured === 'true',
  baselineContainerIds: split(containerCsv),
  baselineNetworkIds: split(networkCsv),
  createdContainerIds: [],
  createdNetworkIds: [],
};
const temporary = `${path}.tmp-${process.pid}`;
fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
fs.renameSync(temporary, path);
NODE
}

dev_runtime_update_session_resources() {
  local container_ids="$1"
  local network_ids="$2"
  local capture_baseline="$3"

  node - "${RUNTIME_SESSION_PATH}" "${RUNTIME_ID}" "${RUNTIME_CHECKOUT_PATH}" "${COMPOSE_PROJECT_NAME}" "${container_ids}" "${network_ids}" "${capture_baseline}" <<'NODE'
const fs = require('node:fs');
const [path, runtimeId, checkout, project, containerCsv, networkCsv, captureBaseline] = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(path, 'utf8'));
if (state.schemaVersion !== 1 || state.runtimeId !== runtimeId || state.checkout !== checkout || state.composeProject !== project) {
  throw new Error('runtime session identity mismatch');
}
const split = (value) => value ? value.split(',').filter(Boolean).sort() : [];
const containers = split(containerCsv);
const networks = split(networkCsv);
if (captureBaseline === 'true') {
  if (state.baselineCaptured) process.exit(0);
  state.baselineContainerIds = containers;
  state.baselineNetworkIds = networks;
  state.baselineCaptured = true;
} else {
  if (!state.baselineCaptured) throw new Error('runtime session baseline has not been captured');
  const baselineContainers = new Set(state.baselineContainerIds);
  const baselineNetworks = new Set(state.baselineNetworkIds);
  state.createdContainerIds = containers.filter((id) => !baselineContainers.has(id));
  state.createdNetworkIds = networks.filter((id) => !baselineNetworks.has(id));
}
const temporary = `${path}.tmp-${process.pid}`;
fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
fs.renameSync(temporary, path);
NODE
}

dev_runtime_ensure_session() {
  local session_id
  local baseline_captured=false
  local container_ids=""
  local network_ids=""

  if [[ "${RUNTIME_MODE}" == "local" ]]; then
    CODEX_RUNTIME_SESSION_ID="local-unmanaged"
    export CODEX_RUNTIME_SESSION_ID
    return 0
  fi

  mkdir -p "${RUNTIME_CHECKOUT_PATH}/.codex"
  if [[ -e "${RUNTIME_SESSION_PATH}" ]]; then
    if [[ ! -f "${RUNTIME_SESSION_PATH}" || -L "${RUNTIME_SESSION_PATH}" ]]; then
      dev_runtime_error "Runtime session state is not a regular file: ${RUNTIME_SESSION_PATH}."
      return 1
    fi
    session_id="$(dev_runtime_session_read sessionId)" || {
      dev_runtime_error "Runtime session state is invalid: ${RUNTIME_SESSION_PATH}."
      return 1
    }
    CODEX_RUNTIME_SESSION_ID="${session_id}"
    export CODEX_RUNTIME_SESSION_ID
    return 0
  fi

  if command -v uuidgen >/dev/null 2>&1; then
    session_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  else
    session_id="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
  fi
  if dev_runtime_docker_is_available; then
    baseline_captured=true
    container_ids="$(dev_runtime_project_container_ids | paste -sd, -)"
    network_ids="$(dev_runtime_project_network_ids | paste -sd, -)"
  fi
  dev_runtime_create_session "${session_id}" "${baseline_captured}" "${container_ids}" "${network_ids}"
  CODEX_RUNTIME_SESSION_ID="${session_id}"
  export CODEX_RUNTIME_SESSION_ID
}

dev_runtime_capture_session_baseline() {
  local captured
  local container_ids
  local network_ids

  if [[ "${RUNTIME_MODE}" == "local" ]]; then
    return 0
  fi
  captured="$(dev_runtime_session_read baselineCaptured)" || return 1
  if [[ "${captured}" == "true" ]]; then
    return 0
  fi
  if ! dev_runtime_docker_is_available; then
    dev_runtime_error "Docker is unavailable, so the worktree cleanup baseline cannot be captured."
    return 1
  fi
  container_ids="$(dev_runtime_project_container_ids | paste -sd, -)"
  network_ids="$(dev_runtime_project_network_ids | paste -sd, -)"
  dev_runtime_update_session_resources "${container_ids}" "${network_ids}" true
}

dev_runtime_record_session_resources() {
  local container_ids
  local network_ids

  if [[ "${RUNTIME_MODE}" == "local" ]]; then
    return 0
  fi
  container_ids="$(dev_runtime_project_container_ids | paste -sd, -)"
  network_ids="$(dev_runtime_project_network_ids | paste -sd, -)"
  dev_runtime_update_session_resources "${container_ids}" "${network_ids}" false
}

dev_runtime_close_session() {
  if [[ "${RUNTIME_MODE}" == "worktree" && -f "${RUNTIME_SESSION_PATH}" && ! -L "${RUNTIME_SESSION_PATH}" ]]; then
    rm -f "${RUNTIME_SESSION_PATH}"
  fi
}

dev_runtime_prepare() {
  dev_runtime_resolve_identity || return 1

  if [[ -f "${RUNTIME_MANIFEST_PATH}" ]]; then
    dev_runtime_load_manifest || return 1
  elif [[ "${RUNTIME_MODE}" == "local" ]]; then
    :
  else
    dev_runtime_allocate_slot || return 1
  fi

  dev_runtime_write_manifest

  if [[ "${RUNTIME_MODE}" == "worktree" ]]; then
    dev_runtime_acquire_lock || return 1
    {
      if dev_runtime_lease_is_reserved_by_other "${RUNTIME_SLOT}"; then
        dev_runtime_error "Runtime slot ${RUNTIME_SLOT} is reserved by another checkout."
        return 1
      fi
      dev_runtime_write_lease "${RUNTIME_SLOT}"
    } always {
      dev_runtime_release_lock
    }
  fi

  dev_runtime_ensure_session
  dev_runtime_resolve_volume_identity
  if (( RUNTIME_VOLUME_IDENTITY_PERSISTED )); then
    dev_runtime_write_manifest
  fi
}

dev_runtime_load() {
  local session_id

  dev_runtime_resolve_identity || return 1
  if [[ "${RUNTIME_MODE}" == "local" && ! -f "${RUNTIME_MANIFEST_PATH}" ]]; then
    CODEX_RUNTIME_SESSION_ID="local-unmanaged"
    export CODEX_RUNTIME_SESSION_ID
    return 0
  fi
  dev_runtime_load_manifest || return 1
  if [[ "${RUNTIME_MODE}" == "worktree" && -f "${RUNTIME_SESSION_PATH}" && ! -L "${RUNTIME_SESSION_PATH}" ]]; then
    session_id="$(dev_runtime_session_read sessionId)" || {
      dev_runtime_error "Runtime session state is invalid: ${RUNTIME_SESSION_PATH}."
      return 1
    }
    CODEX_RUNTIME_SESSION_ID="${session_id}"
  elif [[ "${RUNTIME_MODE}" == "worktree" ]]; then
    CODEX_RUNTIME_SESSION_ID="worktree-unmanaged"
  else
    CODEX_RUNTIME_SESSION_ID="local-unmanaged"
  fi
  export CODEX_RUNTIME_SESSION_ID
}

dev_runtime_print_context() {
  local applied_config_digest="${RUNTIME_PREVIOUS_CONFIG_DIGEST:-${RUNTIME_CONFIG_DIGEST}}"

  print -r -- "RUNTIME_MODE=${RUNTIME_MODE}"
  print -r -- "RUNTIME_ID=${RUNTIME_ID}"
  print -r -- "RUNTIME_CHECKOUT_PATH=${RUNTIME_CHECKOUT_PATH}"
  print -r -- "RUNTIME_GIT_COMMON_DIR=${RUNTIME_GIT_COMMON_DIR}"
  print -r -- "RUNTIME_CONFIG_DIGEST=${RUNTIME_CONFIG_DIGEST}"
  print -r -- "RUNTIME_APPLIED_CONFIG_DIGEST=${applied_config_digest}"
  print -r -- "RUNTIME_CONFIG_CHANGED=${RUNTIME_CONFIG_CHANGED}"
  print -r -- "COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}"
  print -r -- "HOST_PORT=${HOST_PORT}"
  print -r -- "POSTGRES_PORT=${POSTGRES_PORT}"
  print -r -- "STUDIO_PORT=${STUDIO_PORT}"
  print -r -- "WEB_BIND_ADDRESS=${WEB_BIND_ADDRESS}"
  print -r -- "WEB_ORIGIN=${WEB_ORIGIN}"
  print -r -- "CODEX_RUNTIME_SESSION_ID=${CODEX_RUNTIME_SESSION_ID:-local-unmanaged}"
}
