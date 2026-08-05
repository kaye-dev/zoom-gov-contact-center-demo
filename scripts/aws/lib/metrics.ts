import { awsGlobalArguments, type AwsRuntimeConfig } from "./config";
import { parseJson, runCommand } from "./process";

type CapacityMetricResponse = {
  Datapoints?: unknown;
};

export function hasZeroCapacityDatapoint(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const datapoints = (value as CapacityMetricResponse).Datapoints;
  if (!Array.isArray(datapoints)) {
    return false;
  }

  return datapoints.some(
    (datapoint) =>
      typeof datapoint === "object" &&
      datapoint !== null &&
      !Array.isArray(datapoint) &&
      (datapoint as Record<string, unknown>).Minimum === 0,
  );
}

export function readServerlessCapacity(
  config: AwsRuntimeConfig,
  instanceIdentifier: string,
  startTime: Date,
  endTime: Date,
): unknown {
  const result = runCommand("aws", [
    "cloudwatch",
    "get-metric-statistics",
    "--namespace",
    "AWS/RDS",
    "--metric-name",
    "ServerlessDatabaseCapacity",
    "--dimensions",
    `Name=DBInstanceIdentifier,Value=${instanceIdentifier}`,
    "--start-time",
    startTime.toISOString(),
    "--end-time",
    endTime.toISOString(),
    "--period",
    "60",
    "--statistics",
    "Minimum",
    ...awsGlobalArguments(config),
    "--output",
    "json",
  ]);

  if (result.status !== 0) {
    throw new Error(
      `Could not read Aurora capacity metrics.\n${result.stderr.trim()}`,
    );
  }

  return parseJson(result.stdout, "CloudWatch capacity response");
}
