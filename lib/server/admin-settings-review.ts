import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { headers } from "next/headers";
import { normalizeRequestHostname } from "../hostname";
import { resolveSettingsReview } from "../admin-settings-review";

// A short-lived, local-only opt-in avoids changing the running server's env.
// Merely adding ?state=... to an ordinary request never enables fixtures.
export async function getSettingsReview(state: unknown) {
  const requestHeaders = await headers();
  const hostname = normalizeRequestHostname(requestHeaders.get("host")) ?? "";
  if (
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(hostname)
  )
    return undefined;
  let optedIn = false;
  try {
    const optIn = JSON.parse(
      await readFile(
        join(process.cwd(), ".codex/parity-runs/admin-settings-review.json"),
        "utf8",
      ),
    );
    optedIn =
      optIn.version === 1 &&
      typeof optIn.runId === "string" &&
      optIn.runId.startsWith("industry-") &&
      Number.isFinite(optIn.expiresAt) &&
      optIn.expiresAt > Date.now() &&
      optIn.expiresAt <= Date.now() + 8 * 60 * 60 * 1000;
  } catch {
    /* No explicit opt-in: serve the real settings. */
  }
  return resolveSettingsReview(state, hostname, process.env.NODE_ENV, optedIn);
}
