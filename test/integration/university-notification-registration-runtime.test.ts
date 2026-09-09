import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import * as nodeModule from "node:module";
import { Client } from "pg";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";
import {
  admissionYears,
  CONSENT_VERSION,
} from "../../lib/zaad/university/contracts";
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
  "PUBLIC-REGISTRATION-ISOLATION: real API, database, consent, departmental scope and demo lifecycle",
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
        // Department-isolation fixtures use an ordinary role, never FULL_ACCESS.
        await db.query(`INSERT INTO admin_access_roles (id,name,"nameKey") VALUES ('outreach-limited','Outreach limited','outreach limited')`);
        for (const action of ["VIEW", "CREATE", "UPDATE", "DELETE"])
          await db.query(`INSERT INTO admin_access_role_permissions ("roleId","resourceKey",action,effect) VALUES ('outreach-limited','zaad',$1::"AdminAccessAction",'ALLOW')`, [action]);
        await db.query("BEGIN");
        await db.query(`UPDATE admin_access_role_assignments SET "roleId"='outreach-limited' WHERE "userId" IN ('outreach-all','outreach-students','outreach-facilities','outreach-legacy')`);
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
          host = "univ.localhost:3000",
          extra: Record<string, string> = {},
        ) {
          const cookie = user
            ? `better-auth.session_token=${encodeURIComponent(user + "." + createHmac("sha256", secret).update(user).digest("base64"))}`
            : "";
          const adminRequest = path.startsWith("/admin/");
          const requestHost = adminRequest ? "localhost:3000" : host;
          const requestUrl = new URL(`http://${requestHost}/api${path}`);
          if (adminRequest && !requestUrl.searchParams.has("tenant")) requestUrl.searchParams.set("tenant", "univ");
          const response = await route[method](
            new Request(requestUrl, {
              method,
              headers: {
                host: requestHost,
                cookie,
                origin: `http://${requestHost}`,
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
        const registration = {
          name: "大学 花子（テスト）",
          facultyCode: "1",
          admissionYear: admissionYears()[0],
          serial: "0001",
          phone: "090-0000-0000",
          topicIds: ["scholarship", "class-change"],
          consent: true,
          consentVersion: CONSENT_VERSION,
          requestKey: "outreach-public-request-0001",
        };
        let registrationId = "",
          contactId = "",
          registrationVersion = 1;
        await t.test(
          "anonymous acceptance is private, idempotent, same-origin and tenant-bound",
          async () => {
            const accepted = await request(
              "POST",
              "/university-notification-registrations",
              registration,
              "",
            );
            assert.equal(accepted.status, 202, await accepted.clone().text());
            assert.deepEqual(await accepted.json(), { status: "accepted" });
            const forwardedPortRetry = await request(
              "POST",
              "/university-notification-registrations",
              registration,
              "",
              "univ.localhost:3000",
              { host: "univ.localhost:3002", origin: "http://univ.localhost:3002" },
            );
            assert.equal(forwardedPortRetry.status, 202);
            const wrongExternalOrigin = await request(
              "POST",
              "/university-notification-registrations",
              registration,
              "",
              "univ.localhost:3000",
              { host: "univ.localhost:3002", origin: "http://univ.localhost:3000" },
            );
            assert.equal(wrongExternalOrigin.status, 403);
            assert.match(
              accepted.headers.get("cache-control") ?? "",
              /no-store/,
            );
            assert.equal(
              (
                await request(
                  "POST",
                  "/university-notification-registrations",
                  registration,
                  "",
                )
              ).status,
              202,
            );
            assert.equal(
              (
                await db.query(
                  `SELECT count(*)::int AS n FROM university_student_registrations`,
                )
              ).rows[0].n,
              1,
            );
            assert.equal(
              (
                await request(
                  "POST",
                  "/university-notification-registrations",
                  { ...registration, phone: "090-1111-1111" },
                  "",
                )
              ).status,
              409,
            );
            assert.equal(
              (
                await request(
                  "POST",
                  "/university-notification-registrations",
                  registration,
                  "",
                  "localhost:3000",
                )
              ).status,
              404,
            );
            assert.equal(
              (
                await request(
                  "GET",
                  "/university-notification-registrations",
                  undefined,
                  "",
                )
              ).status,
              404,
            );
            assert.equal(
              (await request("GET", `${prefix}/registrations`, undefined, ""))
                .status,
              401,
            );
            assert.equal(
              (
                await request(
                  "POST",
                  "/university-notification-registrations",
                  { ...registration, source: "UNIVERSITY_STAFF" },
                  "",
                )
              ).status,
              422,
            );
            assert.equal(
              (
                await request(
                  "POST",
                  "/university-notification-registrations",
                  registration,
                  "",
                  "univ.localhost:3000",
                  { origin: "https://evil.example" },
                )
              ).status,
              403,
            );
          },
        );
        await t.test(
          "explicit grants, basic RBAC, lists and detail enforce departments and tenant",
          async () => {
            assert.equal(
              (
                await request(
                  "GET",
                  `${prefix}/registrations`,
                  undefined,
                  "outreach-facilities",
                )
              ).status,
              404,
            );
            assert.equal(
              (
                await request(
                  "GET",
                  `${prefix}/templates`,
                  undefined,
                  "outreach-legacy",
                )
              ).status,
              403,
            );
            assert.equal(
              (
                await request(
                  "GET",
                  "/admin/zaad/residents?tenant=lg",
                  undefined,
                  "outreach-students",
                )
              ).status,
              403,
            );
            assert.equal(
              (await request("GET", `${prefix}/templates?tenant=lg`)).status,
              404,
            );
            assert.equal(
              (
                await request(
                  "GET",
                  `${prefix}/templates?tenant=univ&tenant=lg`,
                )
              ).status,
              400,
            );
            const list = await data<{
              rows: {
                id: string;
                phone?: string;
                reviewedPhone?: string;
                phoneLast4: string;
                status: string;
              }[];
            }>(
              await request(
                "GET",
                `${prefix}/registrations`,
                undefined,
                "outreach-students",
              ),
            );
            assert.equal(list.rows.length, 1);
            assert.equal(list.rows[0].phone, undefined);
            assert.equal(list.rows[0].reviewedPhone, undefined);
            assert.equal(list.rows[0].phoneLast4, "0000");
            assert.equal(list.rows[0].status, "PENDING_REVIEW");
            registrationId = list.rows[0].id;
            assert.equal(
              (
                await request(
                  "GET",
                  `${prefix}/registrations/${registrationId}`,
                  undefined,
                  "outreach-facilities",
                )
              ).status,
              404,
            );
            assert.equal(
              (
                await request(
                  "PATCH",
                  `${prefix}/registrations/${registrationId}`,
                  {},
                  "outreach-view",
                )
              ).status,
              403,
            );
            const candidates = await data<{ rows: { id: string }[] }>(
              await request(
                "GET",
                `${prefix}/contacts?purpose=scholarship&mode=LIVE`,
              ),
            );
            assert.equal(candidates.rows.length, 0);
          },
        );
        const review = {
          version: registrationVersion,
          status: "ACTIVE",
          identityConfirmed: true,
          phoneConfirmed: true,
          note: "本人と学内台帳・既存連絡で確認 / 2026-09-08",
          topicIds: registration.topicIds,
        };
        await t.test(
          "verification activates only chosen topics and explicit eligibility; original declaration stays immutable",
          async () => {
            assert.equal(
              (
                await request(
                  "PATCH",
                  `${prefix}/registrations/${registrationId}`,
                  { ...review, phoneConfirmed: false },
                )
              ).status,
              422,
            );
            const active = await data<{
              status: string;
              contactId: string;
              version: number;
              contact: { version: number };
            }>(
              await request(
                "PATCH",
                `${prefix}/registrations/${registrationId}`,
                review,
              ),
            );
            assert.equal(active.status, "ACTIVE");
            contactId = active.contactId;
            registrationVersion = active.version;
            const students = await data<{
              rows: {
                id: string;
                eligible: boolean;
                notified: boolean;
                selectedByStaff: boolean;
              }[];
            }>(
              await request(
                "GET",
                `${prefix}/contacts?purpose=scholarship&mode=LIVE`,
              ),
            );
            assert.equal(students.rows.length, 1);
            assert.equal(students.rows[0].eligible, true);
            assert.equal(students.rows[0].notified, false);
            assert.equal(students.rows[0].selectedByStaff, false);
            const facilities = await data<{ rows: unknown[] }>(
              await request(
                "GET",
                `${prefix}/contacts?purpose=facility&mode=LIVE`,
                undefined,
                "outreach-facilities",
              ),
            );
            assert.equal(facilities.rows.length, 0);
            assert.equal(
              (
                await request(
                  "POST",
                  "/university-notification-registrations",
                  {
                    ...registration,
                    name: "別の申告",
                    phone: "090-1111-1111",
                    requestKey: "outreach-public-request-0002",
                  },
                  "",
                )
              ).status,
              202,
            );
            const old = (
              await db.query(
                `SELECT name, phone FROM university_contacts WHERE id=$1`,
                [contactId],
              )
            ).rows[0];
            assert.equal(old.name, registration.name);
            assert.equal(old.phone, "+819000000000");
            const duplicate = (
              await db.query(
                `SELECT id FROM university_student_registrations WHERE "requestKey"='outreach-public-request-0002'`,
              )
            ).rows[0].id;
            assert.equal(
              (
                await request(
                  "PATCH",
                  `${prefix}/registrations/${duplicate}`,
                  review,
                )
              ).status,
              409,
            );
            assert.equal(
              (
                await request(
                  "GET",
                  `${prefix}/registrations/${registrationId}`,
                  undefined,
                  "outreach-view",
                )
              ).status,
              200,
            );
          },
        );
        const template = CASES.find((t) => t.id === "scholarship")!;
        const preflightInput = {
          purpose: "scholarship",
          mode: "DEMO",
          trigger: "follow-up",
          config: Object.fromEntries(
            template.fields.map(([key, , value]) => [key, value]),
          ),
          targetIds: [] as string[],
          confirmedTargetIds: [] as string[],
          notifiedTargetIds: [] as string[],
        };
        await t.test(
          "withdrawal after prepare invalidates execute without an external call",
          async () => {
            const before = {
              ...preflightInput,
              targetIds: [contactId],
              confirmedTargetIds: [contactId],
              notifiedTargetIds: [contactId],
            };
            const check = await data<{ preflightHash: string }>(
              await request("POST", `${prefix}/batches/preflight`, before),
            );
            const prepared = await data<{ id: string; version: number }>(
              await request("POST", `${prefix}/batches`, {
                preflight: before,
                preflightHash: check.preflightHash,
                operationKey: "registered-batch-0001",
              }),
            );
            await data(
              await request(
                "PATCH",
                `${prefix}/registrations/${registrationId}`,
                {
                  ...review,
                  version: registrationVersion,
                  status: "WITHDRAWN",
                  topicIds: [],
                },
              ),
            );
            const execute = await request(
              "POST",
              `${prefix}/batches/${prepared.id}/execute`,
              {
                version: prepared.version,
                operationKey: "registered-execute-0001",
                confirmed: true,
              },
            );
            assert.equal(execute.status, 409, await execute.clone().text());
            assert.equal(
              (
                await db.query(
                  `SELECT count(*)::int n FROM university_call_attempts`,
                )
              ).rows[0].n,
              0,
            );
            const next = await data<{
              rows: { id: string; eligible: boolean }[];
            }>(
              await request(
                "GET",
                `${prefix}/contacts?purpose=scholarship&mode=LIVE`,
              ),
            );
            assert.ok(next.rows.every((r) => !r.eligible));
            const current = await data<{ version: number }>(
              await request("GET", `${prefix}/registrations/${registrationId}`),
            );
            registrationVersion = current.version;
          },
        );
        let batchId = "",
          firstTarget = "",
          firstCase = "";
        await t.test(
          "DEMO persists exact scholarship denominator, idempotent execution and independent staff completion",
          async () => {
            const targets = await data<{
              rows: {
                id: string;
                eligible: boolean;
                selectedByStaff: boolean;
              }[];
            }>(
              await request(
                "GET",
                `${prefix}/contacts?purpose=scholarship&mode=DEMO`,
              ),
            );
            const input = {
              ...preflightInput,
              targetIds: targets.rows
                .filter((r) => r.eligible && r.selectedByStaff)
                .map((r) => r.id),
            };
            assert.equal(input.targetIds.length, 8);
            const check = await data<{ preflightHash: string }>(
              await request("POST", `${prefix}/batches/preflight`, input),
            );
            const payload = {
              preflight: input,
              preflightHash: check.preflightHash,
              operationKey: "scholarship-batch-0001",
            };
            const prepared = await data<{ id: string; version: number }>(
              await request("POST", `${prefix}/batches`, payload),
            );
            batchId = prepared.id;
            assert.equal(
              (
                await data<{ id: string }>(
                  await request("POST", `${prefix}/batches`, payload),
                )
              ).id,
              batchId,
            );
            const execution = {
              version: prepared.version,
              operationKey: "scholarship-execute-0001",
              confirmed: true,
            };
            const result = await data<{
              rows: {
                id: string;
                answers: { consultation?: boolean };
                task: { id: string; version: number };
              }[];
              summary: Record<string, number>;
            }>(
              await request(
                "POST",
                `${prefix}/batches/${batchId}/execute`,
                execution,
              ),
            );
            assert.equal(result.summary.targets, 8);
            assert.equal(result.summary.connected, 6);
            assert.equal(result.summary.acknowledged, 4);
            assert.equal(result.summary.unconfirmed, 4);
            assert.equal(result.summary.verified, 0);
            await data(
              await request(
                "POST",
                `${prefix}/batches/${batchId}/execute`,
                execution,
              ),
            );
            assert.equal(
              (
                await db.query(
                  `SELECT count(*)::int n FROM university_call_attempts`,
                )
              ).rows[0].n,
              8,
            );
            const row = result.rows.find((r) => r.answers.consultation)!;
            firstTarget = row.id;
            firstCase = row.task.id;
            const saved = {
              version: row.task.version,
              assigneeId: "outreach-students",
              status: "RESOLVED",
              actionKind: "consult",
              note: "相談を実施 / テスト",
              minutes: 10,
              procedureStatus: "UNKNOWN",
            };
            assert.equal(
              (
                await request("PATCH", `${prefix}/cases/${firstCase}`, {
                  ...saved,
                  assigneeId: "outreach-facilities",
                })
              ).status,
              422,
            );
            assert.equal(
              (
                await request("PATCH", `${prefix}/cases/${firstCase}`, {
                  ...saved,
                  note: "",
                })
              ).status,
              422,
            );
            assert.equal(
              (
                await request("PATCH", `${prefix}/cases/${firstCase}`, {
                  ...saved,
                  actionKind: "handoff",
                })
              ).status,
              422,
            );
            await data(
              await request("PATCH", `${prefix}/cases/${firstCase}`, saved),
            );
            const after = await data<{ summary: Record<string, number> }>(
              await request("GET", `${prefix}/batches/${batchId}/results`),
            );
            assert.equal(after.summary.resolved, 1);
            assert.equal(after.summary.targets - after.summary.resolved, 7);
            assert.equal(after.summary.verified, 0);
            assert.equal(
              (
                await request("PATCH", `${prefix}/cases/${firstCase}`, {
                  ...saved,
                  version: 2,
                  procedureStatus: "VERIFIED",
                })
              ).status,
              422,
            );
            await data(
              await request("PATCH", `${prefix}/cases/${firstCase}`, {
                ...saved,
                version: 2,
                procedureStatus: "VERIFIED",
                verificationAt: "2026-09-08T00:00:00Z",
                verificationReference: "学内手続きシステム（テスト）",
              }),
            );
            assert.equal(
              (
                await data<{ summary: { verified: number } }>(
                  await request("GET", `${prefix}/batches/${batchId}/results`),
                )
              ).summary.verified,
              1,
            );
            assert.equal(
              (
                await request("DELETE", `${prefix}/batches/${batchId}`, {
                  version: 2,
                })
              ).status,
              409,
            );
          },
        );
        await t.test(
          "cross-department IDs, CSV, update, delete and idempotency do not cross tenant boundaries",
          async () => {
            for (const path of [
              `batches/${batchId}/results`,
              `batches/${batchId}/export`,
            ])
              assert.equal(
                (
                  await request(
                    "GET",
                    `${prefix}/${path}`,
                    undefined,
                    "outreach-facilities",
                  )
                ).status,
                404,
              );
            assert.equal(
              (
                await request(
                  "PATCH",
                  `${prefix}/cases/${firstCase}`,
                  {
                    version: 1,
                    assigneeId: "outreach-facilities",
                    status: "RESOLVED",
                    actionKind: "support",
                    note: "x",
                    minutes: 1,
                    procedureStatus: "NA",
                  },
                  "outreach-facilities",
                )
              ).status,
              404,
            );
            assert.equal(
              (
                await request(
                  "DELETE",
                  `${prefix}/batches/${batchId}`,
                  { version: 2 },
                  "outreach-facilities",
                )
              ).status,
              404,
            );
            const csv = await data<{ csv: string }>(
              await request("GET", `${prefix}/batches/${batchId}/export`),
            );
            assert.match(csv.csv, /identityAcknowledged/);
            assert.doesNotMatch(csv.csv, /090-0000-0000|別の申告/);
            await db.query(
              `INSERT INTO university_outreach_batches (id,"siteKey","departmentKey",purpose,mode,trigger,config,"operationKey","requestDigest","createdBy") VALUES ('other-tenant-batch','lg','student-affairs','scholarship','DEMO','follow-up','{}','scholarship-batch-0001','other','outreach-all')`,
            );
            assert.equal(
              (
                await request(
                  "GET",
                  `${prefix}/batches/other-tenant-batch/results`,
                )
              ).status,
              404,
            );
            assert.equal(
              (
                await db.query(
                  `SELECT count(*)::int n FROM university_outreach_batches WHERE "operationKey"='scholarship-batch-0001'`,
                )
              ).rows[0].n,
              2,
            );
            await assert.rejects(
              db.query(
                `INSERT INTO university_outreach_targets (id,"siteKey","batchId","sourceKey",name,"maskedContact",eligible,"exclusionReason",snapshot) VALUES ('cross-fk','lg',$1,'cross','x','x',true,'','{}')`,
                [batchId],
              ),
            );
          },
        );
        await t.test(
          "manual answers are typed, deduplicated and do not set procedure status",
          async () => {
            const manual = {
              operationKey: "manual-answer-0001",
              callState: "HUMAN",
              identityState: "VERIFIED",
              ackState: "CONFIRMED",
              recognitionState: "VALID",
              answers: { consultation: true, resend: true },
              note: "本人へ確認（テスト）",
            };
            await data(
              await request(
                "POST",
                `${prefix}/targets/${firstTarget}/answers`,
                manual,
              ),
            );
            await data(
              await request(
                "POST",
                `${prefix}/targets/${firstTarget}/answers`,
                manual,
              ),
            );
            assert.equal(
              (
                await request(
                  "POST",
                  `${prefix}/targets/${firstTarget}/answers`,
                  { ...manual, note: "different note" },
                )
              ).status,
              409,
            );
            assert.equal(
              (
                await db.query(
                  `SELECT count(*)::int n FROM university_responses WHERE "providerEventId"='manual-answer-0001'`,
                )
              ).rows[0].n,
              1,
            );
            assert.equal(
              (
                await request(
                  "POST",
                  `${prefix}/targets/${firstTarget}/answers`,
                  { ...manual, answers: { consultation: "yes" } },
                )
              ).status,
              422,
            );
            assert.equal(
              (
                await request(
                  "POST",
                  `${prefix}/targets/${firstTarget}/answers`,
                  {
                    ...manual,
                    operationKey: "manual-answer-0002",
                    identityState: "UNVERIFIED",
                  },
                )
              ).status,
              422,
            );
          },
        );
        await t.test(
          "other six templates persist; staff reserve, group replay, intake and LIVE fail closed",
          async () => {
            for (const template of CASES.filter(
              (t) => t.id !== "scholarship",
            )) {
              const page = await data<{
                rows: { id: string; eligible: boolean }[];
              }>(
                await request(
                  "GET",
                  `${prefix}/contacts?purpose=${template.id}&mode=DEMO`,
                ),
              );
              const input = {
                purpose: template.id,
                mode: "DEMO",
                trigger: template.mode,
                config: Object.fromEntries(
                  template.fields.map(([key, , value]) => [key, value]),
                ),
                targetIds: page.rows.filter((r) => r.eligible).map((r) => r.id),
              };
              const check = await data<{ preflightHash: string }>(
                await request("POST", `${prefix}/batches/preflight`, input),
              );
              const prepared = await data<{ id: string; version: number }>(
                await request("POST", `${prefix}/batches`, {
                  preflight: input,
                  preflightHash: check.preflightHash,
                  operationKey: `batch-${template.id}-0001`,
                }),
              );
              const result = await data<{
                summary: { targets: number };
                venues: { shortage: number }[] | null;
                groups: { population: number; assembled: number } | null;
              }>(
                await request(
                  "POST",
                  `${prefix}/batches/${prepared.id}/execute`,
                  {
                    version: prepared.version,
                    operationKey: `execute-${template.id}-0001`,
                    confirmed: true,
                  },
                ),
              );
              if (template.id === "staff") {
                assert.deepEqual(
                  result.venues?.map((v) => v.shortage),
                  [1, 1],
                );
                const reserve = {
                  personRef: "confirmed-reserve-1",
                  venue: "B会場",
                  note: "確保を確認（テスト）",
                };
                await data(
                  await request(
                    "POST",
                    `${prefix}/batches/${prepared.id}/reserves`,
                    reserve,
                  ),
                );
                await data(
                  await request(
                    "POST",
                    `${prefix}/batches/${prepared.id}/reserves`,
                    reserve,
                  ),
                );
                const after = await data<typeof result>(
                  await request(
                    "GET",
                    `${prefix}/batches/${prepared.id}/results`,
                  ),
                );
                assert.deepEqual(
                  after.venues?.map((v) => v.shortage),
                  [1, 0],
                );
                assert.equal(after.summary.targets, 6);
              }
              if (template.id === "group") {
                assert.equal(result.groups?.population, 48);
                assert.equal(result.groups?.assembled, 37);
                const after = await data<typeof result>(
                  await request(
                    "POST",
                    `${prefix}/batches/${prepared.id}/replay-demo`,
                    {},
                  ),
                );
                assert.deepEqual(after.groups, result.groups);
              }
            }
            const before = (
              await db.query(
                `SELECT count(*)::int n FROM university_outreach_targets`,
              )
            ).rows[0].n;
            const intake = await data<{
              direction: string;
              cases: { id: string }[];
            }>(
              await request("POST", `${prefix}/intakes`, {
                place: "北寮 305",
                issue: "断水",
                support: "復旧案内",
                callback: "テスト参照",
              }),
            );
            assert.equal(intake.direction, "INBOUND");
            assert.equal(intake.cases.length, 1);
            assert.equal(
              (
                await db.query(
                  `SELECT count(*)::int n FROM university_outreach_targets`,
                )
              ).rows[0].n,
              before,
            );
            assert.equal(
              (await request("POST", "/zaad/provider-events", {})).status,
              503,
            );
            const metrics = await data<{
              callMinutes: { status: string; numerator: null };
            }>(await request("GET", `${prefix}/metrics`));
            assert.equal(metrics.callMinutes.status, "unmeasured");
            assert.equal(metrics.callMinutes.numerator, null);
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
