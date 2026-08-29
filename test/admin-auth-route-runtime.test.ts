import assert from "node:assert/strict";
import { test } from "node:test";

const ADMIN_ENDPOINTS = [
  { method: "POST", path: "/set-role" },
  { method: "GET", path: "/get-user?userId=blocked-user" },
  { method: "POST", path: "/create-user" },
  { method: "POST", path: "/update-user" },
  { method: "GET", path: "/list-users" },
  { method: "POST", path: "/list-user-sessions" },
  { method: "POST", path: "/unban-user" },
  { method: "POST", path: "/ban-user" },
  { method: "POST", path: "/impersonate-user" },
  { method: "POST", path: "/stop-impersonating" },
  { method: "POST", path: "/revoke-user-session" },
  { method: "POST", path: "/revoke-user-sessions" },
  { method: "POST", path: "/remove-user" },
  { method: "POST", path: "/set-user-password" },
  { method: "POST", path: "/has-permission" },
] as const;

test("every Better Auth admin endpoint returns 404 before database initialization", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousUnpooledUrl = process.env.DATABASE_URL_UNPOOLED;

  Reflect.set(process.env, "NODE_ENV", "production");
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_URL_UNPOOLED;

  try {
    const route = await import("../app/api/auth/[...all]/route");
    const actors = [
      { name: "anonymous", cookie: undefined },
      {
        name: "general user",
        cookie: "better-auth.session_token=untrusted-general-cookie",
      },
      {
        name: "FULL_ACCESS user",
        cookie: "better-auth.session_token=untrusted-full-cookie",
      },
    ] as const;

    for (const actor of actors) {
      for (const endpoint of ADMIN_ENDPOINTS) {
        const headers = new Headers();
        if (actor.cookie) headers.set("cookie", actor.cookie);
        if (endpoint.method === "POST") {
          headers.set("content-type", "application/json");
        }
        const request = new Request(
          `http://localhost:3000/api/auth/admin${endpoint.path}`,
          {
            method: endpoint.method,
            headers,
            body: endpoint.method === "POST" ? "{}" : undefined,
          },
        );
        const response = await route[endpoint.method](request);

        assert.equal(
          response.status,
          404,
          `${actor.name} unexpectedly reached ${endpoint.method} ${endpoint.path}`,
        );
        assert.deepEqual(await response.json(), { error: "Not found." });
      }
    }
  } finally {
    restoreEnvironmentVariable("NODE_ENV", previousNodeEnv);
    restoreEnvironmentVariable("DATABASE_URL", previousDatabaseUrl);
    restoreEnvironmentVariable("DATABASE_URL_UNPOOLED", previousUnpooledUrl);
  }
});

function restoreEnvironmentVariable(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
