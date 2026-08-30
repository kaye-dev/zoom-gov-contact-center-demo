import assert from "node:assert/strict";
import { test } from "node:test";

import {
  renderDeploymentFailure,
  renderDeploymentPhase,
  renderDeploymentSuccessSummary,
  resolveDeploymentLogStyle,
} from "../lib/logging";
import { summarizeDeploymentProcessWarning } from "../main";

const deployment = {
  canonicalOrigin: "https://demo.example.com",
  commitSha: "c5860e2b715d2ea238b871a7dd616eac2cd01255",
  deploymentId: "dpl_1234567890",
};

test("plain success summary is unambiguous without ANSI escapes", () => {
  const summary = renderDeploymentSuccessSummary(deployment, "plain");

  assert.match(summary, /✓ PRODUCTION DEPLOYMENT SUCCEEDED/u);
  assert.match(summary, /Productionデプロイに成功しました。/u);
  assert.match(summary, /Canonical URL : https:\/\/demo\.example\.com/u);
  assert.match(summary, /Deployment ID: dpl_1234567890/u);
  assert.match(
    summary,
    /Git commit    : c5860e2b715d2ea238b871a7dd616eac2cd01255/u,
  );
  assert.doesNotMatch(summary, /\u001B\[/u);
});

test("ANSI log style colors phases, failures, and the success summary", () => {
  assert.equal(resolveDeploymentLogStyle("ansi"), "ansi");
  assert.equal(resolveDeploymentLogStyle("plain"), "plain");
  assert.equal(resolveDeploymentLogStyle(undefined), "plain");

  assert.match(
    renderDeploymentPhase(4, "Productionへ直接デプロイ", "ansi"),
    /^\u001B\[1m\u001B\[36m▶ \[4\/5\]/u,
  );
  assert.match(
    renderDeploymentFailure("DEPLOYMENT FAILED", "ansi"),
    /^\u001B\[1m\u001B\[31m✗ DEPLOYMENT FAILED\u001B\[0m$/u,
  );
  assert.match(
    renderDeploymentSuccessSummary(deployment, "ansi"),
    /\u001B\[1m\u001B\[32m✓ PRODUCTION DEPLOYMENT SUCCEEDED\u001B\[0m/u,
  );
});

test("known database TLS warning is summarized once during validation", () => {
  const warning = [
    "SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'.",
    "In the next major version, these modes will adopt standard libpq semantics.",
  ].join("\n");

  const validateSummary = summarizeDeploymentProcessWarning(
    "Warning",
    warning,
    "validate",
  );
  assert.equal(
    validateSummary,
    "Database TLS: sslmode=requireは現在verify-full相当です。pgの次回major更新前に接続設定を見直してください。",
  );
  assert.doesNotMatch(validateSummary ?? "", /\n/u);
  assert.equal(
    summarizeDeploymentProcessWarning("Warning", warning, "release"),
    undefined,
  );
});

test("unexpected Node warnings remain visible", () => {
  assert.equal(
    summarizeDeploymentProcessWarning(
      "ExperimentalWarning",
      "unexpected runtime warning",
      "smoke",
    ),
    "ExperimentalWarning: unexpected runtime warning",
  );
});
