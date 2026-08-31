import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type JsonRecord = Record<string, unknown>;

const specPath = new URL(
  "../docs/development/reservation-api.openapi.json",
  import.meta.url,
);

test("reservation OpenAPI 3.1 contract matches the eight runtime operations", () => {
  const source = readFileSync(specPath, "utf8");
  const spec = JSON.parse(source) as JsonRecord;
  assert.equal(spec.openapi, "3.1.0");
  assert.deepEqual(spec.security, [{ bearerAuth: [] }]);
  assert.deepEqual(
    valueAtPointer(spec, "#/components/securitySchemes/bearerAuth"),
    {
      type: "http",
      scheme: "bearer",
      description: "予約APIキー管理画面で発行したAPIキーをBearer tokenとして送信します。",
    },
  );

  const expected = [
    ["GET", "/api/public/v1/reservation-services", "LIST"],
    ["GET", "/api/public/v1/reservation-services/{serviceKey}/availability", "LIST"],
    ["GET", "/api/public/v1/reservations", "LIST"],
    ["POST", "/api/public/v1/reservations", "CREATE"],
    ["GET", "/api/public/v1/reservations/{id}", "READ"],
    ["PUT", "/api/public/v1/reservations/{id}", "UPDATE"],
    ["PATCH", "/api/public/v1/reservations/{id}", "UPDATE"],
    ["DELETE", "/api/public/v1/reservations/{id}", "DELETE"],
  ] as const;
  const paths = spec.paths as JsonRecord;
  const operations = expected.map(([method, path, permission]) => {
    const operation = (paths[path] as JsonRecord | undefined)?.[method.toLowerCase()];
    assert.ok(operation && typeof operation === "object", `${method} ${path}`);
    assert.equal((operation as JsonRecord)["x-reservation-permission"], permission);
    return operation as JsonRecord;
  });
  assert.equal(operationCount(paths), 8);
  assert.equal(new Set(operations.map(({ operationId }) => operationId)).size, 8);

  for (const operation of operations) {
    const responses = operation.responses as JsonRecord;
    assert.ok(responses && Object.keys(responses).length > 0);
    for (const response of Object.values(responses)) {
      const resolved = resolveReference(spec, response) as JsonRecord;
      assert.ok((resolved.headers as JsonRecord | undefined)?.["X-Request-ID"]);
    }
  }

  const post = (paths["/api/public/v1/reservations"] as JsonRecord).post as JsonRecord;
  assert.deepEqual(parameterNames(spec, post), ["Idempotency-Key"]);
  assert.deepEqual(Object.keys(requestContent(post)), ["application/json"]);
  assert.deepEqual(Object.keys(post.responses as JsonRecord).sort(), [
    "201", "400", "401", "403", "409", "415", "429", "500",
  ]);
  const created = resolveReference(
    spec,
    (post.responses as JsonRecord)["201"],
  ) as JsonRecord;
  assert.deepEqual(Object.keys(created.headers as JsonRecord).sort(), [
    "ETag", "Location", "X-Request-ID",
  ]);

  const itemPath = paths["/api/public/v1/reservations/{id}"] as JsonRecord;
  for (const method of ["put", "patch", "delete"] as const) {
    const operation = itemPath[method] as JsonRecord;
    assert.ok(parameterNames(spec, operation).includes("If-Match"), method);
  }
  for (const method of ["put", "patch"] as const) {
    assert.deepEqual(Object.keys(requestContent(itemPath[method] as JsonRecord)), [
      "application/json",
    ]);
  }
  assert.deepEqual(Object.keys((itemPath.put as JsonRecord).responses as JsonRecord).sort(), [
    "200", "400", "401", "403", "404", "409", "412", "415", "428", "429", "500",
  ]);

  const errorCodes = ((valueAtPointer(
    spec,
    "#/components/schemas/PublicError/properties/error/enum",
  ) as unknown[]) ?? []).map(String);
  for (const code of [
    "RESERVATION_API_INVALID_REQUEST",
    "RESERVATION_API_UNAUTHORIZED",
    "RESERVATION_API_FORBIDDEN",
    "RESERVATION_API_NOT_FOUND",
    "RESERVATION_SLOT_FULL",
    "RESERVATION_IDEMPOTENCY_KEY_REQUIRED",
    "RESERVATION_IDEMPOTENCY_KEY_REUSED",
    "RESERVATION_EXTERNAL_REFERENCE_CONFLICT",
    "RESERVATION_PRECONDITION_REQUIRED",
    "RESERVATION_PRECONDITION_FAILED",
    "RESERVATION_API_UNSUPPORTED_MEDIA_TYPE",
    "RESERVATION_API_MONTHLY_LIMIT_EXCEEDED",
    "RESERVATION_API_KEY_MONTHLY_LIMIT_EXCEEDED",
    "RESERVATION_API_OPERATION_FAILED",
    "RESERVATION_API_INTERNAL_ERROR",
  ]) assert.ok(errorCodes.includes(code), code);

  assert.equal(source.includes("zgcc_rsv_"), false);
  assert.equal(source.includes("Authorization: Bearer"), false);
  assert.doesNotMatch(source, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu);
  assertAllLocalReferencesResolve(spec);
});

function operationCount(paths: JsonRecord): number {
  const methods = new Set(["get", "post", "put", "patch", "delete"]);
  return Object.values(paths).reduce<number>((count, path) => count + Object.keys(
    path as JsonRecord,
  ).filter((key) => methods.has(key)).length, 0);
}

function parameterNames(spec: JsonRecord, operation: JsonRecord): string[] {
  return ((operation.parameters as unknown[] | undefined) ?? []).map((parameter) => {
    const resolved = resolveReference(spec, parameter) as JsonRecord;
    return String(resolved.name);
  });
}

function requestContent(operation: JsonRecord): JsonRecord {
  return ((operation.requestBody as JsonRecord).content ?? {}) as JsonRecord;
}

function resolveReference(spec: JsonRecord, value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const ref = (value as JsonRecord).$ref;
  return typeof ref === "string" ? valueAtPointer(spec, ref) : value;
}

function valueAtPointer(spec: JsonRecord, pointer: string): unknown {
  assert.match(pointer, /^#\//u);
  return pointer.slice(2).split("/").reduce<unknown>((current, segment) => {
    assert.ok(current && typeof current === "object" && !Array.isArray(current), pointer);
    const key = segment.replaceAll("~1", "/").replaceAll("~0", "~");
    assert.ok(key in (current as JsonRecord), pointer);
    return (current as JsonRecord)[key];
  }, spec);
}

function assertAllLocalReferencesResolve(spec: JsonRecord) {
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (key === "$ref") {
        assert.equal(typeof item, "string");
        valueAtPointer(spec, String(item));
      } else {
        visit(item);
      }
    }
  };
  visit(spec);
}
