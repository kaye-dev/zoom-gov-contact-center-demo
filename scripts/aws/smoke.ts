import { resolveAwsRuntimeConfig } from "./lib/config";
import {
  applicationUrl,
  assertDirectFunctionUrlDenied,
  assertHealthyResponse,
  assertOacPostProbeResponse,
  endpointUrl,
  fetchWithTimeout,
  OAC_POST_PROBE_BODY,
  privateFunctionUrl,
} from "./lib/http";

async function assertPage(baseUrl: URL, path: string): Promise<void> {
  const url = endpointUrl(baseUrl, path);
  const response = await fetchWithTimeout(url, 60_000);

  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) {
    throw new Error(`${path} did not return HTML.`);
  }

  console.log(`Smoke passed: ${path} (${response.status})`);
}

async function main(): Promise<void> {
  const config = resolveAwsRuntimeConfig();
  const baseUrl = applicationUrl(config);
  const healthResponse = await fetchWithTimeout(
    endpointUrl(baseUrl, "/api/health"),
    60_000,
  );
  await assertHealthyResponse(healthResponse);
  console.log("Smoke passed: /api/health");

  const postResponse = await fetchWithTimeout(
    endpointUrl(baseUrl, "/api/oac-payload-probe"),
    60_000,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: OAC_POST_PROBE_BODY,
    },
  );
  await assertOacPostProbeResponse(postResponse);
  console.log("Smoke passed: CloudFront OAC-signed POST payload");

  await assertPage(baseUrl, "/");
  await assertPage(baseUrl, "/login");

  const directResponse = await fetchWithTimeout(
    endpointUrl(privateFunctionUrl(config), "/api/health"),
    30_000,
  );
  assertDirectFunctionUrlDenied(directResponse);
  console.log("Smoke passed: direct Lambda Function URL denied with 403");
  console.log(`Application smoke test passed: ${baseUrl.toString()}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Smoke test failed.");
  process.exitCode = 1;
});
