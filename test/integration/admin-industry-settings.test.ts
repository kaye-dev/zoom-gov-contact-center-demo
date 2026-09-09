import * as nodeModule from "node:module";
// The runtime is Node 24; the repository currently uses Node 20 declarations.
const { registerHooks } = nodeModule as unknown as {
  registerHooks(options: {
    resolve(
      specifier: string,
      context: unknown,
      next: (specifier: string, context: unknown) => unknown,
    ): unknown;
  }): { deregister(): void };
};
import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { Client } from "pg";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";
import { consultationServices } from "../../lib/online-consultation-catalog";
const secret = "industry-integration-secret-000000000000000000";
const tag = '<script src="https://zoom.us/sdk.js"></script>';
test(
  "PHONE/CHAT/CONSULTATION-ISOLATION and AUTH/PUBLIC use the selected industry only",
  { timeout: 180000 },
  async () => {
    await withIsolatedPostgresDatabase(async (databaseUrl) => {
      const vars = [
        "NODE_ENV",
        "DATABASE_URL",
        "DATABASE_URL_UNPOOLED",
        "BETTER_AUTH_SECRET",
        "BETTER_AUTH_URL",
      ] as const;
      const previous = Object.fromEntries(vars.map((k) => [k, process.env[k]]));
      Object.assign(process.env, {
        NODE_ENV: "development",
        DATABASE_URL: databaseUrl,
        DATABASE_URL_UNPOOLED: databaseUrl,
        BETTER_AUTH_SECRET: secret,
        BETTER_AUTH_URL: "http://localhost:3000",
      });
      const db = new Client({ connectionString: databaseUrl });
      await db.connect();
      try {
        for (const id of ["industry-full", "industry-none", "industry-view"]) {
          await db.query(
            `INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt",role,banned,"mustChangePassword") VALUES ($1,$1,$2,false,now(),now(),'admin',false,false)`,
            [id, `${id}@example.test`],
          );
          await db.query(
            `INSERT INTO session (id,"expiresAt",token,"createdAt","updatedAt","userId") VALUES ($1,now()+interval '1 hour',$1,now(),now(),$1)`,
            [id],
          );
        }
        await db.query(
          `INSERT INTO admin_access_roles (id,name,"nameKey") VALUES ('industry-view','Industry view','industry view')`,
        );
        for (const resource of ["phone-settings", "chat-settings"])
          await db.query(
            `INSERT INTO admin_access_role_permissions ("roleId","resourceKey",action,effect) VALUES ('industry-view',$1,'VIEW','ALLOW')`,
            [resource],
          );
        await db.query("BEGIN");
        await db.query(
          `DELETE FROM admin_access_role_assignments WHERE "userId"='industry-view'`,
        );
        await db.query(
          `INSERT INTO admin_access_role_assignments ("userId","roleId") VALUES ('industry-view','industry-view')`,
        );
        await db.query(
          `DELETE FROM admin_access_role_assignments WHERE "userId"='industry-none'`,
        );
        await db.query(
          `INSERT INTO admin_access_role_assignments ("userId","roleId") VALUES ('industry-none','system-no-access')`,
        );
        await db.query("COMMIT");
        // Next aliases server-only to an empty marker in a server build. The Node
        // integration harness executes only server code and applies that same alias.
        const hooks = registerHooks({
          resolve(specifier, context, next) {
            return next(
              specifier === "server-only"
                ? "next/dist/compiled/server-only/empty.js"
                : specifier,
              context,
            );
          },
        });
        const [route, publicRoute] = await Promise.all([
          import("../../app/api/[[...route]]/route"),
          import("../../app/api/public/consultation-availability/route"),
        ]).finally(() => hooks.deregister());
        async function request(
          method: "GET" | "PUT",
          path: string,
          body?: unknown,
          user = "industry-full",
        ) {
          const cookie = user
            ? `better-auth.session_token=${encodeURIComponent(user + "." + createHmac("sha256", secret).update(user).digest("base64"))}`
            : "";
          return route[method](
            new Request("http://localhost:3000/api" + path, {
              method,
              headers: {
                host: "localhost:3000",
                cookie,
                "Content-Type": "application/json",
              },
              ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            }),
          );
        }
        for (const resource of [
          "phone-settings",
          "chat-settings",
          "online-consultation-settings",
        ]) {
          assert.equal(
            (
              await request(
                "GET",
                `/admin/${resource}?tenant=univ`,
                undefined,
                "",
              )
            ).status,
            401,
          );
          assert.equal(
            (
              await request(
                "PUT",
                `/admin/${resource}?tenant=univ`,
                {},
                "industry-none",
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await request(
                "GET",
                `/admin/${resource}?tenant=lg`,
                undefined,
                "industry-view",
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await request(
                "PUT",
                `/admin/${resource}?tenant=lg`,
                {},
                "industry-view",
              )
            ).status,
            403,
          );
          for (const query of [
            "tenant=",
            "tenant=gov",
            "tenant=lg&tenant=univ",
          ])
            assert.equal(
              (await request("PUT", `/admin/${resource}?${query}`, {})).status,
              400,
            );
        }
        for (const tenant of ["lg", "univ"] as const) {
          const phone = {
            representativePhone: {
              display: tenant === "lg" ? "03-0000-0001" : "03-0000-0002",
              e164: tenant === "lg" ? "+81300000001" : "+81300000002",
            },
            aiPhoneNumbers: {
              ja: tenant === "lg" ? "+81300000011" : "+81300000012",
              en: null,
              "zh-Hans": null,
              "zh-Hant": null,
              ko: null,
            },
          };
          const chat = {
            activeMode: "DISABLED",
            campaignWebTag: null,
            campaignMemo: tenant,
            contactCenterEntryIdWebTag: null,
            contactCenterEntryIdMemo: tenant,
          };
          const services = consultationServices(tenant).map((serviceKey) => ({
            serviceKey,
            webClientTag: tag,
            memo: tenant + " memo",
          }));
          for (const [resource, payload] of [
            ["phone-settings", phone],
            ["chat-settings", chat],
            ["online-consultation-settings", { services }],
          ] as const) {
            const response = await request(
              "PUT",
              `/admin/${resource}?tenant=${tenant}`,
              payload,
            );
            assert.equal(response.status, 200, await response.clone().text());
            assert.equal((await response.json()).tenantKey, tenant);
            const get = await request(
              "GET",
              `/admin/${resource}?tenant=${tenant}`,
            );
            assert.equal(get.status, 200, await get.clone().text());
            assert.equal(get.headers.get("cache-control"), "no-store");
            const loaded = await get.json();
            assert.equal(loaded.tenantKey, tenant);
            if (resource !== "online-consultation-settings")
              assert.deepEqual(loaded.settings, payload);
          }
        }
        assert.deepEqual(
          (
            await db.query(
              `SELECT "siteKey","campaignMemo" FROM site_chat_settings ORDER BY "siteKey"`,
            )
          ).rows,
          [
            { siteKey: "lg", campaignMemo: "lg" },
            { siteKey: "univ", campaignMemo: "univ" },
          ],
        );
        const rows = (
          await db.query(
            `SELECT "siteKey","serviceKey",memo,"queueId" FROM site_online_consultation_settings ORDER BY "siteKey","serviceKey"`,
          )
        ).rows;
        assert.equal(rows.filter((r) => r.siteKey === "lg").length, 1);
        assert.equal(rows.filter((r) => r.siteKey === "univ").length, 3);
        assert.ok(
          rows.every(
            (r) => r.memo === r.siteKey + " memo" && r.queueId === null,
          ),
        );
        for (const tenant of ["lg", "univ"] as const) {
          const phone = await (
            await request("GET", `/admin/phone-settings?tenant=${tenant}`)
          ).json();
          assert.equal(
            phone.settings.representativePhone.e164,
            tenant === "lg" ? "+81300000001" : "+81300000002",
          );
          assert.equal(
            phone.settings.aiPhoneNumbers.ja,
            tenant === "lg" ? "+81300000011" : "+81300000012",
          );
        }
        const lgPublic = await publicRoute.GET(
          new NextRequest(
            "http://lg.localhost:3000/api/public/consultation-availability?tenant=univ",
            { headers: { host: "lg.localhost:3000" } },
          ),
        );
        assert.equal(lgPublic.status, 404);
        const univPublic = await publicRoute.GET(
          new NextRequest(
            "http://univ.localhost:3000/api/public/consultation-availability?tenant=lg",
            { headers: { host: "univ.localhost:3000" } },
          ),
        );
        assert.equal(univPublic.status, 200);
        const publicData = await univPublic.json();
        assert.deepEqual(
          publicData.services.map((s: { serviceKey: string }) => s.serviceKey),
          consultationServices("univ"),
        );
        assert.ok(publicData.services.every((s: object) => !("memo" in s)));
        const legacy = await request(
          "PUT",
          "/admin/online-consultation-settings?tenant=lg",
          { services: [{ serviceKey: "general", webClientTag: tag }] },
        );
        assert.equal(legacy.status, 200);
        assert.equal((await legacy.json()).settings[0].memo, "lg memo");
        const missingTenant = await request("GET", "/admin/phone-settings");
        assert.equal(missingTenant.status, 400);
        assert.equal((await missingTenant.json()).code, "TENANT_REQUIRED");
        assert.equal((await request("GET", "/admin/phone-settings?tenant=lg")).status, 200);
        await db.query(
          `UPDATE "user" SET "mustChangePassword"=true WHERE id='industry-full'`,
        );
        assert.equal(
          (await request("PUT", "/admin/chat-settings?tenant=lg", {})).status,
          403,
        );
      } finally {
        await db.end();
        for (const k of vars) {
          if (previous[k] === undefined) delete process.env[k];
          else Reflect.set(process.env, k, previous[k]);
        }
      }
    });
  },
);
