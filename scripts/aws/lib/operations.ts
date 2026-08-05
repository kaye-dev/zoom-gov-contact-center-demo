import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getStackOutput } from "./aws";
import {
  awsGlobalArguments,
  type AwsRuntimeConfig,
} from "./config";
import { parseJson, redactSecrets, runCommand } from "./process";

export type OperationAction =
  | "migration-status"
  | "migration-deploy"
  | "seed-admin";

export type OperationsEvent =
  | { action: "migration-status" }
  | { action: "migration-deploy" }
  | {
      action: "seed-admin";
      email: string;
      name: string;
      password: string;
    };

export type OperationsResult = {
  ok: boolean;
  action: OperationAction;
  status?: "up-to-date" | "pending";
  pendingMigrations?: string[];
  message?: string;
};

type LambdaInvokeMetadata = {
  StatusCode?: unknown;
  FunctionError?: unknown;
};

function isAction(value: unknown): value is OperationAction {
  return (
    value === "migration-status" ||
    value === "migration-deploy" ||
    value === "seed-admin"
  );
}

export function parseOperationsResult(value: unknown): OperationsResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Operations Lambda returned an unexpected response shape.");
  }

  const record = value as Record<string, unknown>;
  if (typeof record.ok !== "boolean" || !isAction(record.action)) {
    throw new Error("Operations Lambda returned an invalid result contract.");
  }

  if (
    record.status !== undefined &&
    record.status !== "up-to-date" &&
    record.status !== "pending"
  ) {
    throw new Error("Operations Lambda returned an unknown migration status.");
  }

  if (
    record.pendingMigrations !== undefined &&
    (!Array.isArray(record.pendingMigrations) ||
      !record.pendingMigrations.every((item) => typeof item === "string"))
  ) {
    throw new Error("Operations Lambda returned an invalid migration list.");
  }

  if (record.message !== undefined && typeof record.message !== "string") {
    throw new Error("Operations Lambda returned an invalid message.");
  }

  return {
    ok: record.ok,
    action: record.action,
    status: record.status,
    pendingMigrations: record.pendingMigrations as string[] | undefined,
    message: record.message,
  };
}

function parseInvokeMetadata(value: string): LambdaInvokeMetadata {
  const parsed = parseJson(value, "Lambda invoke metadata");
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Lambda invoke metadata had an unexpected shape.");
  }

  return parsed as LambdaInvokeMetadata;
}

function operationSecrets(event: OperationsEvent): string[] {
  return event.action === "seed-admin" ? [event.password] : [];
}

export function invokeOperationsLambda(
  config: AwsRuntimeConfig,
  event: OperationsEvent,
): OperationsResult {
  const functionName = getStackOutput(
    config,
    config.dataStackName,
    "OperationsFunctionName",
  );
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "zoom-gov-aws-"));
  chmodSync(temporaryDirectory, 0o700);
  const payloadPath = join(temporaryDirectory, "payload.json");
  const responsePath = join(temporaryDirectory, "response.json");
  const secrets = operationSecrets(event);

  try {
    writeFileSync(payloadPath, JSON.stringify(event), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });

    const result = runCommand("aws", [
      "lambda",
      "invoke",
      "--function-name",
      functionName,
      "--invocation-type",
      "RequestResponse",
      "--log-type",
      "None",
      "--cli-binary-format",
      "raw-in-base64-out",
      "--cli-read-timeout",
      "900",
      "--payload",
      `fileb://${payloadPath}`,
      ...awsGlobalArguments(config),
      "--output",
      "json",
      responsePath,
    ]);

    if (result.status !== 0) {
      const detail = redactSecrets(result.stderr.trim(), secrets);
      throw new Error(
        `Could not invoke operations Lambda.${detail ? `\n${detail}` : ""}`,
      );
    }

    const metadata = parseInvokeMetadata(result.stdout);
    if (metadata.StatusCode !== 200) {
      throw new Error(
        `Operations Lambda returned HTTP status '${String(metadata.StatusCode)}'.`,
      );
    }

    const payloadText = readFileSync(responsePath, "utf8");
    if (typeof metadata.FunctionError === "string") {
      const errorPayload = parseJson(payloadText, "Operations Lambda error");
      const candidateMessage =
        typeof errorPayload === "object" &&
        errorPayload !== null &&
        !Array.isArray(errorPayload) &&
        typeof (errorPayload as Record<string, unknown>).errorMessage === "string"
          ? (errorPayload as Record<string, unknown>).errorMessage
          : "The function returned an unhandled error.";
      const message = String(candidateMessage);
      throw new Error(redactSecrets(message, secrets));
    }

    const operationResult = parseOperationsResult(
      parseJson(payloadText, "Operations Lambda response"),
    );

    if (operationResult.action !== event.action) {
      throw new Error(
        `Operations Lambda action mismatch: expected '${event.action}', got '${operationResult.action}'.`,
      );
    }

    if (!operationResult.ok) {
      throw new Error(
        redactSecrets(
          operationResult.message || "Operations Lambda reported a failure.",
          secrets,
        ),
      );
    }

    return operationResult;
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

export function validateMigrationStatus(
  result: OperationsResult,
): "up-to-date" | "pending" {
  if (result.action !== "migration-status") {
    throw new Error("Expected a migration-status operation result.");
  }

  if (result.status !== "up-to-date" && result.status !== "pending") {
    throw new Error(
      "Migration status was neither 'up-to-date' nor a confirmed 'pending' result.",
    );
  }

  if (
    result.status === "pending" &&
    (!result.pendingMigrations || result.pendingMigrations.length === 0)
  ) {
    throw new Error(
      "Migration status was pending but contained no verified migration identifiers.",
    );
  }

  return result.status;
}
