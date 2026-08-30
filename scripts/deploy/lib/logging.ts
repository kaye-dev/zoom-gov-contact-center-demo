export type DeploymentLogStyle = "ansi" | "plain";

type DeploymentSuccessSummary = {
  canonicalOrigin: string;
  commitSha: string;
  deploymentId: string;
};

const ANSI = {
  bold: "\u001B[1m",
  cyan: "\u001B[36m",
  dim: "\u001B[2m",
  green: "\u001B[32m",
  red: "\u001B[31m",
  reset: "\u001B[0m",
  yellow: "\u001B[33m",
} as const;

const SUMMARY_DIVIDER =
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

function decorate(
  value: string,
  style: DeploymentLogStyle,
  ...codes: readonly string[]
): string {
  return style === "ansi" ? `${codes.join("")}${value}${ANSI.reset}` : value;
}

export function resolveDeploymentLogStyle(
  value: string | undefined,
): DeploymentLogStyle {
  return value === "ansi" ? "ansi" : "plain";
}

export function renderDeploymentPhase(
  step: number,
  label: string,
  style: DeploymentLogStyle,
): string {
  return decorate(`▶ [${step}/5] ${label}`, style, ANSI.bold, ANSI.cyan);
}

export function renderDeploymentRevalidation(
  label: string,
  style: DeploymentLogStyle,
): string {
  return decorate(`↻ ${label}`, style, ANSI.dim, ANSI.cyan);
}

export function renderDeploymentDetail(
  message: string,
  style: DeploymentLogStyle,
): string {
  return decorate(`  • ${message}`, style, ANSI.dim);
}

export function renderDeploymentSuccess(
  message: string,
  style: DeploymentLogStyle,
): string {
  return decorate(`✓ ${message}`, style, ANSI.bold, ANSI.green);
}

export function renderDeploymentWarning(
  message: string,
  style: DeploymentLogStyle,
): string {
  return decorate(`⚠ ${message}`, style, ANSI.bold, ANSI.yellow);
}

export function renderDeploymentFailure(
  message: string,
  style: DeploymentLogStyle,
): string {
  return decorate(`✗ ${message}`, style, ANSI.bold, ANSI.red);
}

export function renderDeploymentSuccessSummary(
  summary: DeploymentSuccessSummary,
  style: DeploymentLogStyle,
): string {
  return [
    "",
    decorate(SUMMARY_DIVIDER, style, ANSI.bold, ANSI.green),
    decorate("✓ PRODUCTION DEPLOYMENT SUCCEEDED", style, ANSI.bold, ANSI.green),
    "  Productionデプロイに成功しました。",
    `  Canonical URL : ${summary.canonicalOrigin}`,
    `  Deployment ID: ${summary.deploymentId}`,
    `  Git commit    : ${summary.commitSha}`,
    decorate(SUMMARY_DIVIDER, style, ANSI.bold, ANSI.green),
  ].join("\n");
}
