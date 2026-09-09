import assert from "node:assert/strict";
import test from "node:test";
import { requireSameOrigin } from "../lib/server/zaad/outreach-api";
import { OutreachContractError } from "../lib/zaad/outreach-contracts";

const request = (headers: Record<string, string>) => new Request("http://localhost:3000/api/admin/zaad/contacts?tenant=univ", { method: "POST", headers });
const invalid = (headers: Record<string, string>) => assert.throws(() => requireSameOrigin(request(headers)), (error: unknown) => error instanceof OutreachContractError && error.code === "INVALID_ORIGIN" && error.status === 403);

test("same-origin writes use the external Host port behind the development container", () => {
  requireSameOrigin(request({ origin: "http://localhost:3002", host: "localhost:3002", "sec-fetch-site": "same-origin" }));
  requireSameOrigin(request({ origin: "http://localhost:3000" }));
  requireSameOrigin(request({ origin: "http://univ.localhost:3002", host: "univ.localhost:3002" }));
});
test("a matching internal URL cannot override a different external target origin", () => {
  invalid({ origin: "http://localhost:3000", host: "localhost:3002" });
  invalid({ origin: "http://lg.localhost:3002", host: "univ.localhost:3002" });
  invalid({ origin: "https://localhost:3002", host: "localhost:3002" });
});
test("missing, opaque, malformed and explicitly cross-site origins remain rejected", () => {
  invalid({ host: "localhost:3002" });
  invalid({ origin: "null", host: "localhost:3002" });
  invalid({ origin: "http://localhost:3002", host: "localhost:3002", "sec-fetch-site": "cross-site" });
  for (const host of ["evil.test@localhost:3002", "localhost:3002/path", "localhost:3002,evil.test", "localhost:99999", "localhost:3002?x=1"])
    invalid({ origin: "http://localhost:3002", host });
});
test("forwarded host and protocol headers cannot expand accepted origins", () => {
  invalid({ origin: "https://evil.test", host: "localhost:3002", "x-forwarded-host": "evil.test", "x-forwarded-proto": "https" });
  invalid({ origin: "http://localhost:3002", "x-forwarded-host": "localhost:3002" });
});
