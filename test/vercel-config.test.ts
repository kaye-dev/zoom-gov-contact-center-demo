import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Vercel deploys Next.js functions in Singapore", () => {
  const config = JSON.parse(
    readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
  ) as Record<string, unknown>;

  assert.equal(config.framework, "nextjs");
  assert.deepEqual(config.regions, ["sin1"]);
});
