#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIRECTORY}/../.." && pwd)"
AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-northeast-1}}"
AWS_DATA_STACK_NAME="${AWS_DATA_STACK_NAME:-ZoomGovDemoDataStack}"
AWS_WEB_STACK_NAME="${AWS_WEB_STACK_NAME:-ZoomGovDemoWebStack}"

export AWS_REGION AWS_DATA_STACK_NAME AWS_WEB_STACK_NAME

if [[ -z "${BUDGET_EMAIL:-}" ]]; then
  echo "BUDGET_EMAIL is required for AWS Budget notifications." >&2
  exit 1
fi

for command in aws npm node; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Required command '${command}' is unavailable." >&2
    exit 1
  fi
done

run_typescript() {
  npm exec -- tsx "$@"
}

run_cdk() {
  npm run cdk -- "$@"
}

cd "${PROJECT_ROOT}"

run_typescript "${SCRIPT_DIRECTORY}/aws-context.ts" identity
run_typescript "${SCRIPT_DIRECTORY}/confirm.ts" deployment

DATA_STACK_DEPLOYED=false
warn_about_incomplete_deployment() {
  local status=$?

  if (( status != 0 )) && [[ "${DATA_STACK_DEPLOYED}" == "true" ]]; then
    echo "Deployment stopped after DataStack creation. Aurora and secrets may still incur charges." >&2
    echo "Resolve the error and retry, or run 'npm run aws:destroy' to remove the demo resources." >&2
  fi
}
trap warn_about_incomplete_deployment EXIT

npm test
npm run aws:test-scripts
npm run test:infra
npm run lint
npm run typecheck
npm run typecheck:infra
npm run audit:runtime
"${SCRIPT_DIRECTORY}/build-web-asset.sh"

run_cdk synth
run_cdk diff "${AWS_DATA_STACK_NAME}" "${AWS_WEB_STACK_NAME}"
run_typescript "${SCRIPT_DIRECTORY}/confirm.ts" changes
run_cdk deploy "${AWS_DATA_STACK_NAME}" --require-approval never
DATA_STACK_DEPLOYED=true

set +e
run_typescript "${SCRIPT_DIRECTORY}/operations.ts" migration-status
MIGRATION_STATUS=$?
set -e

case "${MIGRATION_STATUS}" in
  0)
    ;;
  10)
    run_typescript "${SCRIPT_DIRECTORY}/confirm.ts" migration
    run_typescript "${SCRIPT_DIRECTORY}/operations.ts" migration-deploy
    run_typescript "${SCRIPT_DIRECTORY}/operations.ts" migration-status
    ;;
  *)
    echo "Migration status failed. Web stack deployment was not started." >&2
    exit "${MIGRATION_STATUS}"
    ;;
esac

run_cdk deploy "${AWS_WEB_STACK_NAME}" --require-approval never
run_typescript "${SCRIPT_DIRECTORY}/warmup.ts"
run_typescript "${SCRIPT_DIRECTORY}/smoke.ts"
run_typescript "${SCRIPT_DIRECTORY}/verify-pause.ts"
DATA_STACK_DEPLOYED=false

APPLICATION_URL="$(
  run_typescript \
    "${SCRIPT_DIRECTORY}/aws-context.ts" \
    stack-output \
    "${AWS_WEB_STACK_NAME}" \
    ApplicationUrl
)"
echo "AWS deployment completed: ${APPLICATION_URL}"
