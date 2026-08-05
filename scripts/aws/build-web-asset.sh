#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIRECTORY}/../.." && pwd)"
ASSET_PATH="${APP_ASSET_PATH:-.aws-artifacts/web.zip}"

if [[ "${ASSET_PATH}" != /* ]]; then
  ASSET_PATH="${PROJECT_ROOT}/${ASSET_PATH}"
fi

for command in docker git rsync unzip zip zipinfo; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Required command '${command}' is unavailable." >&2
    exit 1
  fi
done

cd "${PROJECT_ROOT}"

TRACKED_DOC_COUNT=0
while IFS= read -r -d '' tracked_file; do
  if [[ ! -f "${PROJECT_ROOT}/${tracked_file}" ]]; then
    echo "Tracked documentation file is missing: ${tracked_file}" >&2
    exit 1
  fi
  TRACKED_DOC_COUNT=$((TRACKED_DOC_COUNT + 1))
done < <(git ls-files -z -- content/docs)
if (( TRACKED_DOC_COUNT == 0 )); then
  echo "No tracked content/docs files were found." >&2
  exit 1
fi

TRACKED_FAQ_COUNT=0
while IFS= read -r -d '' tracked_file; do
  if [[ ! -f "${PROJECT_ROOT}/${tracked_file}" ]]; then
    echo "Tracked FAQ runtime file is missing: ${tracked_file}" >&2
    exit 1
  fi
  TRACKED_FAQ_COUNT=$((TRACKED_FAQ_COUNT + 1))
done < <(git ls-files -z -- 'knowledge-base/自治体-基礎自治体-未来市')
if (( TRACKED_FAQ_COUNT != 342 )); then
  echo "Expected 342 tracked FAQ runtime files, found ${TRACKED_FAQ_COUNT}." >&2
  exit 1
fi

mkdir -p "${PROJECT_ROOT}/.aws-artifacts"
# Colima shares /Users by default but not macOS's /var/folders TMPDIR. Keep the
# disposable build context under the repository so Docker can mount it.
TEMPORARY_DIRECTORY="$(mktemp -d "${PROJECT_ROOT}/.aws-artifacts/web-build.XXXXXX")"
BUILD_CONTEXT="${TEMPORARY_DIRECTORY}/source"
STAGING_DIRECTORY="${TEMPORARY_DIRECTORY}/staging"
mkdir -p "${BUILD_CONTEXT}" "${STAGING_DIRECTORY}"
cleanup() {
  rm -rf -- "${TEMPORARY_DIRECTORY}"
}
trap cleanup EXIT INT TERM HUP

rsync -a \
  --exclude '/.aws-artifacts/' \
  --exclude '/cdk.out/' \
  --exclude '/.env' \
  --exclude '/.env.*' \
  --exclude '/.git/' \
  --exclude '/.next/' \
  --exclude '/lib/generated/prisma/' \
  --exclude '/node_modules/' \
  --exclude '.DS_Store' \
  --exclude '*.tsbuildinfo' \
  "${PROJECT_ROOT}/" \
  "${BUILD_CONTEXT}/"

docker run --rm \
  --platform linux/arm64 \
  --volume "${BUILD_CONTEXT}:/workspace" \
  --volume /workspace/node_modules \
  --workdir /workspace \
  node:24-bookworm-slim \
  sh -lc 'apt-get update -qq && apt-get install -y -qq --no-install-recommends openssl >/dev/null && npm ci --no-audit --no-fund && AWS_LAMBDA_BUILD=1 NEXT_TELEMETRY_DISABLED=1 npm run build'

STANDALONE_DIRECTORY="${BUILD_CONTEXT}/.next/standalone"
if [[ ! -f "${STANDALONE_DIRECTORY}/server.js" ]]; then
  echo "Next.js standalone server was not generated at .next/standalone/server.js." >&2
  echo "Ensure next.config.ts uses output: 'standalone' for AWS_LAMBDA_BUILD=1." >&2
  exit 1
fi

cp -R "${STANDALONE_DIRECTORY}/." "${STAGING_DIRECTORY}/"
rm -rf -- \
  "${STAGING_DIRECTORY}/.next/static" \
  "${STAGING_DIRECTORY}/public" \
  "${STAGING_DIRECTORY}/content" \
  "${STAGING_DIRECTORY}/knowledge-base"
mkdir -p "${STAGING_DIRECTORY}/.next"
cp -R "${BUILD_CONTEXT}/.next/static" "${STAGING_DIRECTORY}/.next/static"
cp -R "${BUILD_CONTEXT}/public" "${STAGING_DIRECTORY}/public"
cp -R "${BUILD_CONTEXT}/content" "${STAGING_DIRECTORY}/content"
cp -R "${BUILD_CONTEXT}/knowledge-base" "${STAGING_DIRECTORY}/knowledge-base"
cp "${SCRIPT_DIRECTORY}/run.sh" "${STAGING_DIRECTORY}/run.sh"
chmod 755 "${STAGING_DIRECTORY}/run.sh"
find "${STAGING_DIRECTORY}" -type f -name '.DS_Store' -delete

for required_path in \
  "server.js" \
  "run.sh" \
  ".next/static" \
  "public" \
  "content/docs" \
  "knowledge-base/自治体-基礎自治体-未来市"; do
  if [[ ! -e "${STAGING_DIRECTORY}/${required_path}" ]]; then
    echo "Required Lambda asset path is missing: ${required_path}" >&2
    exit 1
  fi
done

UNCOMPRESSED_KIB="$(du -sk "${STAGING_DIRECTORY}" | awk '{print $1}')"
MAX_UNCOMPRESSED_KIB=$((250 * 1024))
if (( UNCOMPRESSED_KIB >= MAX_UNCOMPRESSED_KIB )); then
  echo "Lambda asset is ${UNCOMPRESSED_KIB} KiB; it must be under ${MAX_UNCOMPRESSED_KIB} KiB uncompressed." >&2
  exit 1
fi

mkdir -p "$(dirname -- "${ASSET_PATH}")"
rm -f -- "${ASSET_PATH}"
(
  cd "${STAGING_DIRECTORY}"
  zip -q -X -r "${ASSET_PATH}" .
)

if [[ ! -s "${ASSET_PATH}" ]]; then
  echo "Lambda asset was not created: ${ASSET_PATH}" >&2
  exit 1
fi

if ! zipinfo -l "${ASSET_PATH}" run.sh | awk '$1 ~ /^-rwx/ { found=1 } END { exit !found }'; then
  echo "run.sh is not executable at the Lambda zip root." >&2
  exit 1
fi

if ! unzip -p \
  "${ASSET_PATH}" \
  'knowledge-base/自治体-基礎自治体-未来市/_translations/catalog.json' \
  >/dev/null; then
  echo "FAQ runtime files could not be read from the Lambda zip." >&2
  exit 1
fi

if ! unzip -p "${ASSET_PATH}" content/docs/privacy-policy.mdx >/dev/null; then
  echo "Documentation runtime files could not be read from the Lambda zip." >&2
  exit 1
fi

echo "Lambda web asset: ${ASSET_PATH}"
echo "Uncompressed size: ${UNCOMPRESSED_KIB} KiB"
echo "Tracked documentation files: ${TRACKED_DOC_COUNT}"
echo "Tracked FAQ runtime files: ${TRACKED_FAQ_COUNT}"
