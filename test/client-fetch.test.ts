import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  AWS_PAYLOAD_HASH_HEADER,
  fetchWithAwsPayloadHash,
} from "../lib/client-fetch";

function expectedSha256(value: string | ArrayBuffer): string {
  return createHash("sha256")
    .update(typeof value === "string" ? value : new Uint8Array(value))
    .digest("hex");
}

async function captureRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Request> {
  let captured: Request | undefined;

  const response = await fetchWithAwsPayloadHash(
    input,
    init,
    async (requestInput, requestInit) => {
      captured = new Request(requestInput, requestInit);
      return new Response(null, { status: 204 });
    },
  );

  assert.equal(response.status, 204);
  assert.ok(captured);
  return captured;
}

describe("fetchWithAwsPayloadHash", () => {
  it("hashes the exact UTF-8 JSON bytes sent by POST", async () => {
    const body = JSON.stringify({ message: "未来市" });
    const request = await captureRequest("https://example.com/api/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

    assert.equal(await request.clone().text(), body);
    assert.equal(
      request.headers.get(AWS_PAYLOAD_HASH_HEADER),
      expectedSha256(body),
    );
  });

  it("overwrites a stale hash with the exact PUT body hash", async () => {
    const body = "updated settings";
    const request = await captureRequest("https://example.com/api/settings", {
      method: "put",
      headers: { [AWS_PAYLOAD_HASH_HEADER]: "stale" },
      body,
    });

    assert.equal(
      request.headers.get(AWS_PAYLOAD_HASH_HEADER),
      expectedSha256(body),
    );
  });

  it("hashes an empty POST body", async () => {
    const request = await captureRequest("https://example.com/api/sign-out", {
      method: "POST",
    });

    assert.equal(
      request.headers.get(AWS_PAYLOAD_HASH_HEADER),
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("uses the browser-serialized FormData bytes for both hash and request", async () => {
    const formData = new FormData();
    formData.set("name", "Demo Admin");
    formData.set("locale", "ja");
    const request = await captureRequest("https://example.com/api/upload", {
      method: "POST",
      body: formData,
    });
    const transmittedBody = await request.clone().arrayBuffer();

    assert.match(
      request.headers.get("content-type") ?? "",
      /^multipart\/form-data; boundary=/,
    );
    assert.equal(
      request.headers.get(AWS_PAYLOAD_HASH_HEADER),
      expectedSha256(transmittedBody),
    );
  });

  it("does not add a payload hash to GET", async () => {
    const request = await captureRequest("https://example.com/api/health");

    assert.equal(request.method, "GET");
    assert.equal(request.headers.has(AWS_PAYLOAD_HASH_HEADER), false);
  });
});
