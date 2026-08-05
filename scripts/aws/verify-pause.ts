import { getStackOutput } from "./lib/aws";
import { resolveAwsRuntimeConfig } from "./lib/config";
import {
  hasZeroCapacityDatapoint,
  readServerlessCapacity,
} from "./lib/metrics";

const AUTO_PAUSE_SECONDS = 300;
const INITIAL_WAIT_MILLISECONDS = 6 * 60 * 1_000;
const POLL_INTERVAL_MILLISECONDS = 60 * 1_000;
const MAX_ATTEMPTS = 5;
const METRIC_LOOKBACK_MILLISECONDS = 3 * 60 * 1_000;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main(): Promise<void> {
  const config = resolveAwsRuntimeConfig();
  const instanceIdentifier = getStackOutput(
    config,
    config.dataStackName,
    "DatabaseInstanceIdentifier",
  );

  console.log(
    `Waiting 6 minutes for the ${AUTO_PAUSE_SECONDS}-second Aurora inactivity window and CloudWatch metric delivery...`,
  );
  await delay(INITIAL_WAIT_MILLISECONDS);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const endTime = new Date();
    const startTime = new Date(
      endTime.getTime() - METRIC_LOOKBACK_MILLISECONDS,
    );
    const response = readServerlessCapacity(
      config,
      instanceIdentifier,
      startTime,
      endTime,
    );

    if (hasZeroCapacityDatapoint(response)) {
      console.log(
        `Aurora auto-pause verified: ${instanceIdentifier} reported 0 ACU.`,
      );
      return;
    }

    if (attempt < MAX_ATTEMPTS) {
      console.log(
        `0 ACU is not visible yet (${attempt}/${MAX_ATTEMPTS}); retrying in 60 seconds.`,
      );
      await delay(POLL_INTERVAL_MILLISECONDS);
    }
  }

  throw new Error(
    `Aurora instance '${instanceIdentifier}' did not report 0 ACU within 10 minutes after smoke testing. Check open user connections and RDS events.`,
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Aurora pause verification failed.",
  );
  process.exitCode = 1;
});
