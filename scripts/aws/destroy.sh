#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIRECTORY}/../.." && pwd)"
AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-northeast-1}}"
AWS_DATA_STACK_NAME="${AWS_DATA_STACK_NAME:-ZoomGovDemoDataStack}"
AWS_WEB_STACK_NAME="${AWS_WEB_STACK_NAME:-ZoomGovDemoWebStack}"
BUDGET_EMAIL="${BUDGET_EMAIL:-destroy-only@example.invalid}"

export AWS_REGION AWS_DATA_STACK_NAME AWS_WEB_STACK_NAME BUDGET_EMAIL

run_typescript() {
  npm exec -- tsx "$@"
}

run_cdk() {
  npm run cdk -- "$@"
}

cd "${PROJECT_ROOT}"
run_typescript "${SCRIPT_DIRECTORY}/aws-context.ts" identity

if [[ ! -r /dev/tty || ! -w /dev/tty ]]; then
  echo "AWS destroy requires an interactive terminal." >&2
  exit 1
fi

printf "Type 'destroy' to delete ${AWS_WEB_STACK_NAME} and ${AWS_DATA_STACK_NAME}: " > /dev/tty
IFS= read -r CONFIRMATION < /dev/tty
if [[ "${CONFIRMATION}" != "destroy" ]]; then
  echo "AWS destroy cancelled. No stack deletion was started." >&2
  exit 1
fi

AUDIT_MANIFEST="$(mktemp "${TMPDIR:-/tmp}/zoom-gov-destroy-audit.XXXXXX")"
rm -f -- "${AUDIT_MANIFEST}"
cleanup() {
  rm -f -- "${AUDIT_MANIFEST}"
}
trap cleanup EXIT INT TERM HUP

run_typescript "${SCRIPT_DIRECTORY}/destroy-audit.ts" capture "${AUDIT_MANIFEST}"

run_cdk destroy "${AWS_WEB_STACK_NAME}" --force
run_cdk destroy "${AWS_DATA_STACK_NAME}" --force

run_typescript "${SCRIPT_DIRECTORY}/destroy-audit.ts" verify "${AUDIT_MANIFEST}"

echo "Both application stacks were deleted and their exact billable DataStack targets were audited."
