import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import * as nodeModule from "node:module";
import { Client } from "pg";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";
import { CASES } from "../../lib/zaad/university/demo";
const { registerHooks } = nodeModule as unknown as {
  registerHooks(options: {
    resolve(
      specifier: string,
      context: unknown,
      next: (specifier: string, context: unknown) => unknown,
    ): unknown;
  }): { deregister(): void };
};
const secret = "university-outreach-integration-0000000000000000";
test(
  "OUTREACH-API-RUNTIME: snapshot selection, draft deletion, receipt and scoped pagination",
  { timeout: 180000 },
  async (t) => {
    await withIsolatedPostgresDatabase(async (databaseUrl) => {
      const names = [
        "NODE_ENV",
        "DATABASE_URL",
        "DATABASE_URL_UNPOOLED",
        "BETTER_AUTH_SECRET",
        "BETTER_AUTH_URL",
      ] as const;
      const previous = Object.fromEntries(
        names.map((k) => [k, process.env[k]]),
      );
      Object.assign(process.env, {
        NODE_ENV: "development",
        DATABASE_URL: databaseUrl,
        DATABASE_URL_UNPOOLED: databaseUrl,
        BETTER_AUTH_SECRET: secret,
        BETTER_AUTH_URL: "http://localhost:3000",
      });
      const db = new Client({ connectionString: databaseUrl });
      await db.connect();
      const originalFetch = globalThis.fetch;
      const external: string[] = [];
      globalThis.fetch = (async (input) => {
        external.push(String(input));
        throw new Error("External transport is prohibited in this test");
      }) as typeof fetch;
      try {
        for (const id of [
          "outreach-full",
          "outreach-none",
          "outreach-all",
          "outreach-students",
          "outreach-facilities",
          "outreach-legacy",
          "outreach-view",
        ]) {
          await db.query(
            `INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt",role,banned,"mustChangePassword") VALUES ($1,$1,$2,false,now(),now(),'admin',false,false)`,
            [id, `${id}@example.test`],
          );
          await db.query(
            `INSERT INTO session (id,"expiresAt",token,"createdAt","updatedAt","userId") VALUES ($1,now()+interval '1 hour',$1,now(),now(),$1)`,
            [id],
          );
        }
        for (const [id, department] of [
          ["outreach-all", "ALL"],
          ["outreach-students", "student-affairs"],
          ["outreach-facilities", "facilities"],
          ["outreach-view", "ALL"],
        ])
          await db.query(
            `INSERT INTO university_zaad_grants (id,"siteKey","userId","departmentKey") VALUES ($1,'univ',$1,$2)`,
            [id, department],
          );
        await db.query(
          `INSERT INTO university_zaad_grants (id,"siteKey","userId","departmentKey") VALUES ('outreach-all-lg','lg','outreach-all','ALL')`,
        );
        await db.query(
          `INSERT INTO admin_access_roles (id,name,"nameKey") VALUES ('outreach-view','Outreach view','outreach view')`,
        );
        await db.query(
          `INSERT INTO admin_access_role_permissions ("roleId","resourceKey",action,effect) VALUES ('outreach-view','zaad','VIEW','ALLOW')`,
        );
        await db.query("BEGIN");
        await db.query(
          `DELETE FROM admin_access_role_assignments WHERE "userId"='outreach-view'`,
        );
        await db.query(
          `INSERT INTO admin_access_role_assignments ("userId","roleId") VALUES ('outreach-view','outreach-view')`,
        );
        await db.query("COMMIT");
        await db.query(`INSERT INTO admin_access_roles (id,name,"nameKey") VALUES ('outreach-limited','Outreach limited','outreach limited')`);
        for (const action of ["VIEW", "CREATE", "UPDATE", "DELETE"])
          await db.query(`INSERT INTO admin_access_role_permissions ("roleId","resourceKey",action,effect) VALUES ('outreach-limited','zaad',$1::"AdminAccessAction",'ALLOW')`, [action]);
        await db.query("BEGIN");
        await db.query(`UPDATE admin_access_role_assignments SET "roleId"='outreach-limited' WHERE "userId" IN ('outreach-all','outreach-students','outreach-facilities','outreach-legacy')`);
        await db.query(`UPDATE admin_access_role_assignments SET "roleId"='system-no-access' WHERE "userId"='outreach-none'`);
        await db.query("COMMIT");
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
        const route = await import("../../app/api/[[...route]]/route").finally(
          () => hooks.deregister(),
        );
        async function request(
          method: "GET" | "POST" | "PATCH" | "DELETE",
          path: string,
          body?: unknown,
          user = "outreach-all",
          host = "localhost:3000",
          extra: Record<string, string> = {},
          omitTenant = false,
        ) {
          const cookie = user
            ? `better-auth.session_token=${encodeURIComponent(user + "." + createHmac("sha256", secret).update(user).digest("base64"))}`
            : "";
          const url = new URL(`http://${host}/api${path}`);
          if (url.pathname.startsWith("/api/admin/") && !url.searchParams.has("tenant") && !omitTenant) url.searchParams.set("tenant", "univ");
          const response = await route[method](
            new Request(url, {
              method,
              headers: {
                host,
                cookie,
                origin: `http://${host}`,
                "Content-Type": "application/json",
                ...extra,
              },
              ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            }),
          );
          return response;
        }
        async function data<T>(response: Response, expected = 200): Promise<T> {
          assert.equal(
            response.status,
            expected,
            await response.clone().text(),
          );
          const payload = (await response.json()) as { data: T };
          return payload.data;
        }
        const prefix = "/admin/zaad/university";
        await t.test("FULL-ACCESS-API: grant-free role reaches all departments; limited and no-access remain isolated", async () => {
          const full = await data<{ departments: string[]; templates: unknown[] }>(await request("GET", `${prefix}/templates`, undefined, "outreach-full"));
          assert.equal(full.templates.length, 7);
          assert.ok(full.departments.includes("facilities"));
          assert.ok(full.departments.includes("student-affairs"));
          for (const routePath of ["contacts?purpose=scholarship&mode=DEMO", "registrations", "groups", "batches", "intakes"]) {
            assert.equal((await request("GET", `${prefix}/${routePath}`, undefined, "outreach-full")).status, 200, routePath);
          }
          const limited = await data<{ departments: string[] }>(await request("GET", `${prefix}/templates`, undefined, "outreach-students"));
          assert.deepEqual(limited.departments, ["student-affairs"]);
          assert.equal((await request("GET", `${prefix}/templates`, undefined, "outreach-none")).status, 403);
          assert.equal((await request("GET", `${prefix}/templates`, undefined, "outreach-legacy")).status, 403);
          assert.equal((await request("GET", `${prefix}/templates?tenant=lg`, undefined, "outreach-full")).status, 404);
          const missingTenant = await request("GET", `${prefix}/templates`, undefined, "outreach-full", "localhost:3000", {}, true);
          assert.equal(missingTenant.status, 400);
          assert.equal((await missingTenant.json()).code, "TENANT_REQUIRED");
          assert.deepEqual(external, []);
        });
        await t.test(
          "preflight resolves selected contacts beyond the first page and persists exclusions",
          async () => {
            await db.query(
              `INSERT INTO university_contacts (id,"siteKey","departmentKey",name,phone,"identityVerified","phoneVerified","phoneEligible","selectionReason","priorNoticeAt","registrationSource","updatedAt") SELECT 'contact-' || lpad(n::text,4,'0'),'univ','student-affairs','Synthetic contact', '+819000000000',true,true,true,'Confirmed eligibility',now(),'UNIVERSITY_MANUAL',now() FROM generate_series(1,101) n`,
            );
            const page1 = await data<{
              rows: { id: string }[];
              total: number;
              nextCursor: string;
            }>(
              await request(
                "GET",
                `${prefix}/contacts?purpose=scholarship&mode=DEMO&limit=3`,
              ),
            );
            const page2 = await data<typeof page1>(
              await request(
                "GET",
                `${prefix}/contacts?purpose=scholarship&mode=DEMO&limit=3&cursor=${encodeURIComponent(page1.nextCursor)}`,
              ),
            );
            assert.equal(page1.rows.length, 3);
            assert.equal(page2.rows.length, 3);
            assert.equal(page1.total, 111);
            assert.equal(page2.total, 111);
            assert.equal(
              new Set([...page1.rows, ...page2.rows].map((row) => row.id)).size,
              6,
            );
            const realPage = await data<typeof page1>(
              await request(
                "GET",
                `${prefix}/contacts?purpose=scholarship&mode=DEMO&limit=100&cursor=real:`,
              ),
            );
            assert.equal(realPage.rows.length, 100);
            const lastPage = await data<typeof page1>(
              await request(
                "GET",
                `${prefix}/contacts?purpose=scholarship&mode=DEMO&limit=100&cursor=${encodeURIComponent(realPage.nextCursor)}`,
              ),
            );
            assert.equal(lastPage.rows[0].id, "contact-0101");
            assert.equal(lastPage.nextCursor, null);
            const template = CASES.find((item) => item.id === "scholarship")!;
            const preflight = {
              purpose: "scholarship",
              mode: "DEMO",
              trigger: "follow-up",
              config: Object.fromEntries(
                template.fields.map(([key, , value]) => [key, value]),
              ),
              targetIds: ["contact-0101"],
              confirmedTargetIds: [],
              notifiedTargetIds: [],
            };
            const checked = await data<{
              preflightHash: string;
              eligible: { id: string }[];
            }>(await request("POST", `${prefix}/batches/preflight`, preflight));
            assert.deepEqual(
              checked.eligible.map((r) => r.id),
              ["contact-0101"],
            );
            const prepared = await data<{ id: string; version: number }>(
              await request("POST", `${prefix}/batches`, {
                preflight,
                preflightHash: checked.preflightHash,
                operationKey: "beyond-first-page-0001",
              }),
            );
            const snapshot = (
              await db.query(
                `SELECT eligible, "exclusionReason" FROM university_outreach_targets WHERE "batchId"=$1`,
                [prepared.id],
              )
            ).rows;
            assert.equal(snapshot.filter((r) => r.eligible).length, 1);
            assert.equal(
              snapshot.filter((r) => !r.eligible && r.exclusionReason).length,
              2,
            );
            assert.equal(
              (
                await request("DELETE", `${prefix}/batches/${prepared.id}`, {
                  version: prepared.version + 1,
                })
              ).status,
              409,
            );
            await data(
              await request("DELETE", `${prefix}/batches/${prepared.id}`, {
                version: prepared.version,
              }),
            );
            assert.equal(
              (await request("GET", `${prefix}/batches/${prepared.id}/results`))
                .status,
              404,
            );
          },
        );
        await t.test(
          "facility receipt is required and durable; cursor totals stay inside the tenant",
          async () => {
            const intake = await data<{
              id: string;
              cases: { id: string; version: number }[];
            }>(
              await request("POST", `${prefix}/intakes`, {
                place: "Synthetic building A",
                issue: "Water outage",
                support: "Repair",
                callback: "Local test reference",
              }),
            );
            await data(
              await request("POST", `${prefix}/intakes`, {
                place: "Synthetic building B",
                issue: "Water outage",
                support: "Repair",
                callback: "Local test reference",
              }),
            );
            await db.query(
              `INSERT INTO university_intakes (id,"siteKey","departmentKey",place,issue,support,callback) VALUES ('foreign-intake','lg','facilities','Foreign','Foreign','Foreign','Foreign')`,
            );
            const update = {
              version: intake.cases[0].version,
              assigneeId: "outreach-facilities",
              status: "IN_PROGRESS",
              actionKind: "handoff",
              note: "Receipt confirmed by phone",
              minutes: 5,
              procedureStatus: "NA",
            };
            assert.equal(
              (
                await request(
                  "PATCH",
                  `${prefix}/cases/${intake.cases[0].id}`,
                  update,
                )
              ).status,
              422,
            );
            await data(
              await request("PATCH", `${prefix}/cases/${intake.cases[0].id}`, {
                ...update,
                handoffRecipient: "Synthetic facilities team",
                handoffAt: "2026-09-08T01:00:00Z",
              }),
            );
            const actions = (
              await db.query(
                `SELECT "handoffRecipient", "handoffAt" FROM university_case_actions WHERE "caseId"=$1`,
                [intake.cases[0].id],
              )
            ).rows;
            assert.equal(actions.length, 1);
            assert.equal(
              actions[0].handoffRecipient,
              "Synthetic facilities team",
            );
            assert.equal(
              actions[0].handoffAt.toISOString(),
              "2026-09-08T01:00:00.000Z",
            );
            const first = await data<{
              rows: { id: string }[];
              total: number;
              nextCursor: string;
            }>(await request("GET", `${prefix}/intakes?limit=1`));
            const second = await data<typeof first>(
              await request(
                "GET",
                `${prefix}/intakes?limit=1&cursor=${first.nextCursor}`,
              ),
            );
            assert.equal(first.total, 2);
            assert.equal(second.total, 2);
            assert.equal(first.rows.length, 1);
            assert.equal(second.rows.length, 1);
            assert.notEqual(first.rows[0].id, second.rows[0].id);
            assert.equal(second.nextCursor, null);
            assert.equal(
              (await request("GET", `${prefix}/intakes?limit=101`)).status,
              422,
            );
            assert.equal(
              (
                await request(
                  "GET",
                  `${prefix}/intakes`,
                  undefined,
                  "outreach-students",
                )
              ).status,
              404,
            );
            assert.deepEqual(external, []);
          },
        );
      } finally {
        globalThis.fetch = originalFetch;
        await db.end();
        for (const key of names) {
          if (previous[key] === undefined) delete process.env[key];
          else Object.assign(process.env, { [key]: previous[key] });
        }
      }
    });
  },
);
