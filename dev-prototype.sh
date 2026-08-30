#!/usr/bin/env zsh

set -euo pipefail

readonly DEV_PROTOTYPE_SCRIPT_DIR="${0:A:h}"

usage() {
  print -r -- "Usage: ./dev-prototype.sh [slug]"
  print -r -- ""
  print -r -- "With no slug, serves the most recently modified prototype."
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

typeset slug="${1:-}"
typeset artifact_path=""

is_valid_slug() {
  local candidate_slug="$1"
  [[ "${candidate_slug}" =~ ^[a-z0-9][a-z0-9-]*$ ]] \
    && [[ "${candidate_slug}" != "tmp" && "${candidate_slug}" != "reviews" ]]
}

has_entry_point() {
  local prototype_directory="$1"
  [[ -d "${prototype_directory}" && ! -L "${prototype_directory}" ]] \
    && [[ -f "${prototype_directory}/index.html" && ! -L "${prototype_directory}/index.html" ]]
}

select_latest_prototype() {
  local prototype_directory
  local candidate_slug
  local candidate_file
  local relative_directory
  local -a prototype_directories
  local -a prototype_files
  local -a file_metadata
  integer candidate_mtime
  integer directory_mtime
  integer latest_mtime=-1
  integer matching_directory_count=0

  prototype_directories=("${DEV_PROTOTYPE_SCRIPT_DIR}"/plan/*/prototype(N/))

  for prototype_directory in "${prototype_directories[@]}"; do
    candidate_slug="${prototype_directory:h:t}"
    if ! is_valid_slug "${candidate_slug}"; then
      continue
    fi

    (( matching_directory_count += 1 ))
    if ! has_entry_point "${prototype_directory}"; then
      continue
    fi

    directory_mtime=-1
    prototype_files=("${prototype_directory}"/**/*(N.))
    for candidate_file in "${prototype_files[@]}"; do
      file_metadata=()
      zstat -A file_metadata +mtime -- "${candidate_file}"
      candidate_mtime="${file_metadata[1]}"
      if (( candidate_mtime > directory_mtime )); then
        directory_mtime="${candidate_mtime}"
      fi
    done

    if (( directory_mtime > latest_mtime )); then
      latest_mtime="${directory_mtime}"
      relative_directory="${prototype_directory#${DEV_PROTOTYPE_SCRIPT_DIR}/}"
      artifact_path="${relative_directory%/}"
    fi
  done

  if [[ -n "${artifact_path}" ]]; then
    return 0
  fi
  if (( matching_directory_count > 0 )); then
    return 2
  fi
  return 1
}

if [[ -n "${slug}" ]]; then
  if ! is_valid_slug "${slug}"; then
    print -u2 "Slug must contain only lowercase letters, digits, and hyphens, and must not be reserved."
    exit 1
  fi

  typeset canonical_directory="${DEV_PROTOTYPE_SCRIPT_DIR}/plan/${slug}/prototype"
  if [[ -e "${canonical_directory}" || -L "${canonical_directory}" ]]; then
    if ! has_entry_point "${canonical_directory}"; then
      print -u2 "Canonical prototype entry point must be a regular file: plan/${slug}/prototype/index.html"
      exit 1
    fi
    artifact_path="plan/${slug}/prototype"
  else
    print -u2 "Prototype entry point is unavailable: plan/${slug}/prototype/index.html"
    exit 1
  fi
else
  zmodload zsh/stat
  if select_latest_prototype; then
    :
  else
    integer canonical_result=$?
    if (( canonical_result == 2 )); then
      print -u2 "Canonical prototype directories exist, but none has a regular index.html entry point."
      exit 1
    fi
  fi

  if [[ -z "${artifact_path}" ]]; then
    print -u2 "No prototype was found under plan/<slug>/prototype."
    print -u2 "Create one first, or pass its slug explicitly."
    exit 1
  fi
fi

print -r -- "Prototype: ${artifact_path}"
exec node "${DEV_PROTOTYPE_SCRIPT_DIR}/scripts/serve-plan-artifact.mjs" "${artifact_path}"
