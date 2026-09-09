import type { Hono, Context } from "hono";
import type { ZaadApiEnvironment } from "../api-routes";
import { authorizeAdminApi } from "@/lib/server/admin-access/api-guard";
import type { AdminAccessAction } from "@/lib/admin-access/types";
import { CASES } from "@/lib/zaad/university/demo";
import {
  OutreachError,
  admissionYears,
  FACULTY_CODES,
  TOPICS,
  CONSENT_VERSION,
  PURPOSES,
  PURPOSE_DEPARTMENT,
  enumValue,
  object,
  exact,
  text,
  integer,
} from "@/lib/zaad/university/contracts";
import {
  universityScope,
  scopedWhere,
  requireDepartment,
  type Scope,
} from "./permissions";
import {
  registerStudent,
  listRegistrations,
  getRegistration,
  reviewStudent,
} from "./registrations";
import * as service from "./service";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { requireSameOrigin } from "../outreach-api";

type C = Context<ZaadApiEnvironment>;
function errorResponse(c: C, error: unknown) {
  if (error instanceof OutreachError)
    return c.json(
      {
        error: {
          code: error.code,
          message: error.code,
          ...(error.fields ? { fields: error.fields } : {}),
        },
      },
      error.status,
    );
  // Do not log student details, provider payloads, database messages or credentials.
  return c.json(
    { error: { code: "SERVICE_UNAVAILABLE", message: "SERVICE_UNAVAILABLE" } },
    503,
  );
}
async function body(c: C) {
  try {
    requireSameOrigin(c.req.raw);
  } catch {
    throw new OutreachError("INVALID_ORIGIN", 403);
  }
  if (
    !c.req.header("content-type")?.toLowerCase().startsWith("application/json")
  )
    throw new OutreachError("INVALID_REQUEST");
  const stream = c.req.raw.body?.getReader();
  if (!stream) throw new OutreachError("INVALID_REQUEST");
  let size = 0,
    data = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await stream.read();
      if (done) break;
      size += value.length;
      if (size > 16384) {
        await stream.cancel();
        throw new OutreachError("INVALID_REQUEST");
      }
      data += decoder.decode(value, { stream: true });
    }
    data += decoder.decode();
    return JSON.parse(data) as unknown;
  } catch (error) {
    if (error instanceof OutreachError) throw error;
    throw new OutreachError("INVALID_REQUEST");
  } finally {
    stream.releaseLock();
  }
}
async function admin(
  c: C,
  action: AdminAccessAction,
  fn: (db: PrismaClient, scope: Scope) => Promise<unknown>,
) {
  try {
    const db = c.get("prisma"),
      auth = await authorizeAdminApi(
        c.get("auth"),
        db,
        c.req.raw.headers,
        "zaad",
        action,
      );
    if (!auth.ok)
      return c.json(
        { error: { code: auth.error, message: auth.error } },
        auth.status,
      );
    const queryTenants = c.req.queries("tenant") ?? [];
    if (queryTenants.length > 1) throw new OutreachError("INVALID_REQUEST");
    const siteKey = queryTenants.length
      ? enumValue(queryTenants[0], ["lg", "univ"])
      : c.get("tenantKey");
    const scope = await universityScope(db, siteKey, auth.actor);
    const data = await fn(db, scope);
    return c.json({ data });
  } catch (error) {
    return errorResponse(c, error);
  }
}
export function registerUniversityApiRoutes(app: Hono<ZaadApiEnvironment>) {
  for (const path of [
    "/university-notification-options",
    "/university-notification-registrations",
  ])
    app.use(path, async (c, next) => {
      c.header("Cache-Control", "no-store");
      await next();
    });
  app.get("/university-notification-options", (c) => {
    if (c.get("tenantKey") !== "univ") return c.notFound();
    if (process.env.UNIVERSITY_REGISTRATION_ENABLED === "false")
      return c.json({ error: { code: "REGISTRATION_UNAVAILABLE" } }, 503);
    return c.json({
      data: {
        facultyCodes: FACULTY_CODES,
        admissionYears: admissionYears(),
        topicIds: TOPICS,
        consentVersion: CONSENT_VERSION,
      },
    });
  });
  app.post("/university-notification-registrations", async (c) => {
    try {
      await registerStudent(c.get("prisma"), c.get("tenantKey"), await body(c));
      return c.json({ status: "accepted" }, 202);
    } catch (error) {
      return errorResponse(c, error);
    }
  });
  const prefix = "/admin/zaad/university";
  app.use(`${prefix}/*`, async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await next();
  });
  app.get(`${prefix}/templates`, (c) =>
    admin(c, "VIEW", async (_db, scope) => ({
      templates: CASES.filter((t) =>
        scope.departments.includes(PURPOSE_DEPARTMENT[t.id]),
      ),
      departments: scope.departments,
      registrationReview: scope.departments.includes("student-affairs"),
    })),
  );
  app.get(`${prefix}/contacts`, (c) =>
    admin(c, "VIEW", (db, scope) =>
      service.contacts(
        db,
        scope,
        enumValue(c.req.query("purpose"), PURPOSES),
        enumValue(c.req.query("mode") ?? "DEMO", ["DEMO", "LIVE"]),
        c.req.query("cursor"),
        undefined,
        integer(Number(c.req.query("limit") ?? 100), 1, 100),
      ),
    ),
  );
  app.post(`${prefix}/contacts`, (c) =>
    admin(c, "CREATE", async (db, scope) =>
      service.createContact(db, scope, await body(c)),
    ),
  );
  app.get(`${prefix}/groups`, (c) =>
    admin(c, "VIEW", async (db, scope) => {
      const limit = integer(Number(c.req.query("limit") ?? 50), 1, 100),
        cursor = c.req.query("cursor");
      const rows = await db.universityContactGroup.findMany({
        where: {
          ...scopedWhere(scope),
          ...(cursor ? { id: { lt: text(cursor, 100) } } : {}),
        },
        orderBy: { id: "desc" },
        take: limit + 1,
      });
      return {
        rows: rows.slice(0, limit),
        total: await db.universityContactGroup.count({
          where: scopedWhere(scope),
        }),
        nextCursor: rows.length > limit ? rows[limit - 1].id : null,
      };
    }),
  );
  app.get(`${prefix}/assignees`, (c) =>
    admin(c, "VIEW", async (db, scope) =>
      service.assignees(db, scope, text(c.req.query("department"), 100)),
    ),
  );
  app.post(`${prefix}/batches/preflight`, (c) =>
    admin(c, "CREATE", async (db, scope) =>
      service.preflight(db, scope, await body(c)),
    ),
  );
  app.post(`${prefix}/batches`, (c) =>
    admin(c, "CREATE", async (db, scope) =>
      service.createBatch(db, scope, await body(c)),
    ),
  );
  app.get(`${prefix}/batches`, (c) =>
    admin(c, "VIEW", async (db, scope) => {
      const limit = integer(Number(c.req.query("limit") ?? 50), 1, 100),
        cursor = c.req.query("cursor");
      const rows = await db.universityOutreachBatch.findMany({
        where: {
          ...scopedWhere(scope),
          ...(cursor ? { id: { lt: text(cursor, 100) } } : {}),
        },
        orderBy: { id: "desc" },
        take: limit + 1,
        select: {
          id: true,
          purpose: true,
          mode: true,
          status: true,
          createdAt: true,
          version: true,
        },
      });
      return {
        total: await db.universityOutreachBatch.count({
          where: scopedWhere(scope),
        }),
        rows: rows.slice(0, limit),
        nextCursor: rows.length > limit ? rows[limit - 1].id : null,
      };
    }),
  );
  app.get(`${prefix}/batches/:id/export`, (c) =>
    admin(c, "VIEW", (db, scope) =>
      service.exportResults(db, scope, c.req.param("id")),
    ),
  );
  app.get(`${prefix}/batches/:id/results`, (c) =>
    admin(c, "VIEW", (db, scope) =>
      service.results(db, scope, c.req.param("id")),
    ),
  );
  app.post(`${prefix}/batches/:id/execute`, (c) =>
    admin(c, "UPDATE", async (db, scope) =>
      service.executeBatch(db, scope, c.req.param("id"), await body(c)),
    ),
  );
  app.post(`${prefix}/batches/:id/replay-demo`, (c) =>
    admin(c, "UPDATE", async (db, scope) => {
      const v = object(await body(c));
      exact(v, []);
      return service.replayDemo(db, scope, c.req.param("id"));
    }),
  );
  app.post(`${prefix}/batches/:id/reserves`, (c) =>
    admin(c, "UPDATE", async (db, scope) =>
      service.recordReserve(db, scope, c.req.param("id"), await body(c)),
    ),
  );
  app.post(`${prefix}/targets/:id/answers`, (c) =>
    admin(c, "UPDATE", async (db, scope) =>
      service.recordAnswer(db, scope, c.req.param("id"), await body(c)),
    ),
  );
  app.delete(`${prefix}/batches/:id`, (c) =>
    admin(c, "DELETE", async (db, scope) =>
      service.deleteDraft(db, scope, c.req.param("id"), await body(c)),
    ),
  );
  app.post(`${prefix}/targets/:id/recontact`, (c) =>
    admin(c, "UPDATE", async (db, scope) =>
      service.recontact(db, scope, c.req.param("id"), await body(c)),
    ),
  );
  app.get(`${prefix}/cases`, (c) =>
    admin(c, "VIEW", async (db, scope) => {
      const limit = integer(Number(c.req.query("limit") ?? 50), 1, 100),
        cursor = c.req.query("cursor");
      const rows = await db.universitySupportCase.findMany({
        where: {
          ...scopedWhere(scope),
          ...(cursor ? { id: { lt: text(cursor, 100) } } : {}),
        },
        take: limit + 1,
        orderBy: { id: "desc" },
        include: {
          actions: {
            where: { siteKey: scope.siteKey },
            orderBy: { occurredAt: "desc" },
            take: 1,
          },
        },
      });
      return {
        rows: rows.slice(0, limit),
        total: await db.universitySupportCase.count({
          where: scopedWhere(scope),
        }),
        nextCursor: rows.length > limit ? rows[limit - 1].id : null,
      };
    }),
  );
  app.patch(`${prefix}/cases/:id`, (c) =>
    admin(c, "UPDATE", async (db, scope) =>
      service.updateCase(db, scope, c.req.param("id"), await body(c)),
    ),
  );
  app.post(`${prefix}/intakes`, (c) =>
    admin(c, "CREATE", async (db, scope) =>
      service.createIntake(db, scope, await body(c)),
    ),
  );
  app.get(`${prefix}/intakes`, (c) =>
    admin(c, "VIEW", async (db, scope) => {
      requireDepartment(scope, "facilities");
      const limit = integer(Number(c.req.query("limit") ?? 50), 1, 100),
        cursor = c.req.query("cursor");
      const where = { ...scopedWhere(scope), departmentKey: "facilities" };
      const rows = await db.universityIntake.findMany({
        where: {
          ...where,
          ...(cursor ? { id: { lt: text(cursor, 100) } } : {}),
        },
        take: limit + 1,
        orderBy: { id: "desc" },
        include: {
          cases: {
            where: { siteKey: scope.siteKey },
            include: {
              actions: {
                where: { siteKey: scope.siteKey },
                orderBy: { occurredAt: "desc" },
              },
            },
          },
        },
      });
      return {
        rows: rows.slice(0, limit),
        total: await db.universityIntake.count({ where }),
        nextCursor: rows.length > limit ? rows[limit - 1].id : null,
      };
    }),
  );
  app.get(`${prefix}/metrics`, (c) =>
    admin(c, "VIEW", async () => ({
      mode: "DEMO",
      callMinutes: { status: "unmeasured", numerator: null, denominator: null },
      procedureRate: {
        status: "unmeasured",
        numerator: null,
        denominator: null,
      },
      consultationRate: {
        status: "unmeasured",
        numerator: null,
        denominator: null,
      },
    })),
  );
  app.get(`${prefix}/registrations`, (c) =>
    admin(c, "VIEW", (db, scope) =>
      listRegistrations(db, scope, c.req.query()),
    ),
  );
  app.get(`${prefix}/registrations/:id`, (c) =>
    admin(c, "VIEW", (db, scope) =>
      getRegistration(db, scope, c.req.param("id")),
    ),
  );
  app.post(`${prefix}/registrations`, (c) =>
    admin(c, "CREATE", async (db, scope) => {
      requireDepartment(scope, "student-affairs");
      const v = object(await body(c));
      exact(v, ["registration", "attestation"]);
      return registerStudent(
        db,
        scope.siteKey,
        v.registration,
        scope.actorId,
        text(v.attestation),
      );
    }),
  );
  app.patch(`${prefix}/registrations/:id`, (c) =>
    admin(c, "UPDATE", async (db, scope) =>
      reviewStudent(db, scope, c.req.param("id"), await body(c)),
    ),
  );
  // No provider is configured by this change. Unknown events cannot become successful answers.
  app.post("/zaad/provider-events", (c) =>
    c.json({ error: { code: "PROVIDER_NOT_CONFIGURED" } }, 503),
  );
}
