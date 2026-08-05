import { resolveAwsRuntimeConfig } from "./lib/config";
import {
  applicationUrl,
  assertHealthyResponse,
  endpointUrl,
  fetchWithTimeout,
} from "./lib/http";

type WarmupOptions = {
  attempts: number;
  delayMilliseconds: number;
  timeoutMilliseconds: number;
};

function parsePositiveInteger(value: string | undefined, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${option} must be a positive integer.`);
  }

  return parsed;
}

export function parseWarmupOptions(
  arguments_: readonly string[],
): WarmupOptions {
  const options: WarmupOptions = {
    attempts: 3,
    delayMilliseconds: 5_000,
    timeoutMilliseconds: 60_000,
  };

  for (let index = 0; index < arguments_.length; index += 2) {
    const option = arguments_[index];
    const value = arguments_[index + 1];

    if (!value) {
      throw new Error(`${option} requires a value.`);
    }

    if (option === "--attempts") {
      options.attempts = parsePositiveInteger(value, option);
    } else if (option === "--delay-ms") {
      options.delayMilliseconds = parsePositiveInteger(value, option);
    } else if (option === "--timeout-ms") {
      options.timeoutMilliseconds = parsePositiveInteger(value, option);
    } else {
      throw new Error(`Unknown warmup option '${option}'.`);
    }
  }

  return options;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main(): Promise<void> {
  const options = parseWarmupOptions(process.argv.slice(2));
  const baseUrl = applicationUrl(resolveAwsRuntimeConfig());
  const healthUrl = endpointUrl(baseUrl, "/api/health");
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      console.log(
        `Warmup attempt ${attempt}/${options.attempts}: ${healthUrl.toString()}`,
      );
      const response = await fetchWithTimeout(
        healthUrl,
        options.timeoutMilliseconds,
      );
      await assertHealthyResponse(response);
      console.log(`Application is ready: ${baseUrl.toString()}`);
      return;
    } catch (error) {
      lastError = error;
      console.error(
        error instanceof Error ? error.message : "Warmup request failed.",
      );
      if (attempt < options.attempts) {
        await wait(options.delayMilliseconds);
      }
    }
  }

  throw new Error(
    `Application did not become ready after ${options.attempts} attempts: ${
      lastError instanceof Error ? lastError.message : "unknown error"
    }`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Warmup failed.");
  process.exitCode = 1;
});
