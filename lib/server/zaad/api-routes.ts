import { outreachTenants } from "./university/permissions";
import { registerUniversityApiRoutes } from "./university/api-routes";
import { Hono, type Context } from "hono";

import type { AppAuth } from "@/lib/auth";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { authorizeAdminApi } from "@/lib/server/admin-access/api-guard";
import type { AdminAccessAction } from "@/lib/admin-access/types";
import { parsePositiveInteger, ZAAD_ERROR_CODES } from "@/lib/zaad/contracts";
import { ZAAD_CSV_MAX_BYTES } from "@/lib/zaad/csv-import";

import {
  getZaadOneTimeDispatch,
  listZaadOneTimeDispatches,
  preflightZaadOneTime,
  prepareZaadOneTime,
  ZaadOneTimeError,
} from "./one-time";
import {
  createZaadResident,
  deleteZaadResident,
  importZaadResidents,
  listZaadResidents,
  registerPublicDisasterRadioResident,
  retryZaadResidentSync,
  updateZaadResident,
  ZaadResidentError,
} from "./residents";
import {
  createZaadContactList,
  createZaadMessage,
  deleteZaadContactList,
  deleteZaadMessage,
  getZaadCampaign,
  getZaadConnection,
  getZaadContactList,
  getZaadMessage,
  getZaadRegistrationSetting,
  listZaadCampaigns,
  listZaadContactLists,
  listZaadMessages,
  retryZaadMessage,
  updateZaadCampaignStatus,
  updateZaadContactList,
  updateZaadMessage,
  updateZaadRegistrationSetting,
  ZaadResourceError,
} from "./resources";

import type { TenantKey } from "@/lib/tenants";

export type ZaadApiEnvironment = {
  Variables: {
    auth: AppAuth;
    prisma: PrismaClient;
    /** Hostから解決した業種テナント。すべてのDBアクセスをこのキーで絞る。 */
    tenantKey: TenantKey;
  };
};

type ZaadContext = Context<ZaadApiEnvironment>;

export function registerZaadApiRoutes(app: Hono<ZaadApiEnvironment>) {
  registerUniversityApiRoutes(app);
  app.post("/disaster-radio-subscriptions", async (c) => {
    try {
      const payload = await readJson(c);
      await registerPublicDisasterRadioResident(c.get("prisma"), c.get("tenantKey"), payload);
      return c.json({ status: "accepted" as const });
    } catch (error) {
      return respondZaadError(c, error);
    }
  });

  app.use("/admin/zaad/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "private, no-store");
    c.header("Pragma", "no-cache");
  });

  app.get("/admin/zaad/connection", (c) => withZaadAuth(c, "VIEW", async ({ prisma, tenantKey }) => c.json(await getZaadConnection(prisma, tenantKey))));

  app.get("/admin/zaad/residents", (c) => withZaadAuth(c, "VIEW", async ({ prisma, tenantKey }) => {
    return c.json(await listZaadResidents(prisma, tenantKey, { query: c.req.query("query"), cursor: c.req.query("cursor") }));
  }));
  app.post("/admin/zaad/residents", (c) => withZaadAuth(c, "CREATE", async ({ prisma, tenantKey, actorUserId }) => {
    return c.json({ resident: await createZaadResident(prisma, tenantKey, actorUserId, await readJson(c)) }, 201);
  }));
  app.post("/admin/zaad/residents/imports", (c) => withZaadAuth(c, "CREATE", async ({ prisma, tenantKey, actorUserId }) => {
    const bytes = await readCsvUpload(c);
    return c.json(await importZaadResidents(prisma, tenantKey, actorUserId, bytes), 201);
  }));
  app.patch("/admin/zaad/residents/:id", (c) => withZaadAuth(c, "UPDATE", async ({ prisma, tenantKey, actorUserId }) => {
    return c.json({ resident: await updateZaadResident(prisma, tenantKey, actorUserId, c.req.param("id"), await readJson(c)) });
  }));
  app.post("/admin/zaad/residents/:id/retry", (c) => withZaadAuth(c, "UPDATE", async ({ prisma, tenantKey, actorUserId }) => {
    const revision = isExactRevision(await readJson(c));
    if (!revision) throw new ZaadResidentError(ZAAD_ERROR_CODES.invalidRequest, 400);
    return c.json({ resident: await retryZaadResidentSync(prisma, tenantKey, actorUserId, c.req.param("id"), revision) });
  }));
  app.delete("/admin/zaad/residents/:id", (c) => withZaadAuth(c, "DELETE", async ({ prisma, tenantKey, actorUserId }) => {
    const payload = await readJson(c);
    const revision = isExactRevision(payload);
    if (!revision) throw new ZaadResidentError(ZAAD_ERROR_CODES.invalidRequest, 400);
    return c.json(await deleteZaadResident(prisma, tenantKey, actorUserId, c.req.param("id"), revision));
  }));

  app.get("/admin/zaad/messages", (c) => withZaadAuth(c, "VIEW", async ({ prisma, tenantKey }) => c.json(await listZaadMessages(prisma, tenantKey))));
  app.get("/admin/zaad/messages/:id", (c) => withZaadAuth(c, "VIEW", async ({ prisma, tenantKey }) => {
    return c.json({ message: await getZaadMessage(prisma, tenantKey, c.req.param("id")) });
  }));
  app.post("/admin/zaad/messages", (c) => withZaadAuth(c, "CREATE", async ({ prisma, tenantKey, actorUserId }) => {
    return c.json({ message: await createZaadMessage(prisma, tenantKey, actorUserId, await readJson(c)) }, 201);
  }));
  app.patch("/admin/zaad/messages/:id", (c) => withZaadAuth(c, "UPDATE", async ({ prisma, tenantKey, actorUserId }) => {
    return c.json({ message: await updateZaadMessage(prisma, tenantKey, actorUserId, c.req.param("id"), await readJson(c)) });
  }));
  app.post("/admin/zaad/messages/:id/sync", (c) => withZaadAuth(c, "UPDATE", async ({ prisma, tenantKey, actorUserId }) => {
    const revision = isExactRevision(await readJson(c));
    if (!revision) throw new ZaadResourceError(ZAAD_ERROR_CODES.invalidRequest, 400);
    return c.json({ message: await retryZaadMessage(prisma, tenantKey, actorUserId, c.req.param("id"), revision) });
  }));
  app.delete("/admin/zaad/messages/:id", (c) => withZaadAuth(c, "DELETE", async ({ prisma, tenantKey, actorUserId }) => {
    const revision = isExactRevision(await readJson(c));
    if (!revision) throw new ZaadResourceError(ZAAD_ERROR_CODES.invalidRequest, 400);
    return c.json(await deleteZaadMessage(prisma, tenantKey, actorUserId, c.req.param("id"), revision));
  }));

  app.get("/admin/zaad/contact-lists", (c) => withZaadAuth(c, "VIEW", async ({ prisma, tenantKey }) => {
    return c.json(await listZaadContactLists(prisma, tenantKey, c.req.query("nextPageToken")));
  }));
  app.get("/admin/zaad/contact-lists/:id", (c) => withZaadAuth(c, "VIEW", async ({ prisma, tenantKey }) => {
    return c.json({ contactList: await getZaadContactList(prisma, tenantKey, c.req.param("id")) });
  }));
  app.post("/admin/zaad/contact-lists", (c) => withZaadAuth(c, "CREATE", async ({ prisma, tenantKey, actorUserId }) => {
    return c.json({ contactList: await createZaadContactList(prisma, tenantKey, actorUserId, await readJson(c)) }, 201);
  }));
  app.patch("/admin/zaad/contact-lists/:id", (c) => withZaadAuth(c, "UPDATE", async ({ prisma, tenantKey, actorUserId }) => {
    return c.json({ contactList: await updateZaadContactList(prisma, tenantKey, actorUserId, c.req.param("id"), await readJson(c)) });
  }));
  app.delete("/admin/zaad/contact-lists/:id", (c) => withZaadAuth(c, "DELETE", async ({ prisma, tenantKey, actorUserId }) => {
    return c.json(await deleteZaadContactList(prisma, tenantKey, actorUserId, c.req.param("id")));
  }));

  app.get("/admin/zaad/registration-settings", (c) => withZaadAuth(c, "VIEW", async ({ prisma, tenantKey }) => {
    return c.json({ setting: await getZaadRegistrationSetting(prisma, tenantKey) });
  }));
  app.put("/admin/zaad/registration-settings", (c) => withZaadAuth(c, "UPDATE", async ({ prisma, tenantKey, actorUserId }) => {
    return c.json({ setting: await updateZaadRegistrationSetting(prisma, tenantKey, actorUserId, await readJson(c)) });
  }));

  app.get("/admin/zaad/campaigns", (c) => withZaadAuth(c, "VIEW", async ({ prisma, tenantKey }) => {
    return c.json(await listZaadCampaigns(prisma, tenantKey, c.req.query("nextPageToken")));
  }));
  app.get("/admin/zaad/campaigns/:id", (c) => withZaadAuth(c, "VIEW", async ({ prisma, tenantKey }) => {
    return c.json({ campaign: await getZaadCampaign(prisma, tenantKey, c.req.param("id")) });
  }));
  app.patch("/admin/zaad/campaigns/:id/status", (c) => withZaadAuth(c, "UPDATE", async ({ prisma, tenantKey, actorUserId }) => {
    return c.json({ campaign: await updateZaadCampaignStatus(prisma, tenantKey, actorUserId, c.req.param("id"), await readJson(c)) });
  }));

  app.get("/admin/zaad/one-time-dispatches", (c) => withZaadAuth(c, "VIEW", async ({ prisma, tenantKey }) => {
    return c.json(await listZaadOneTimeDispatches(prisma, tenantKey));
  }));
  app.get("/admin/zaad/one-time-dispatches/:id", (c) => withZaadAuth(c, "VIEW", async ({ prisma, tenantKey }) => {
    return c.json({ dispatch: await getZaadOneTimeDispatch(prisma, tenantKey, c.req.param("id")) });
  }));
  app.post("/admin/zaad/one-time-dispatches/preflight", (c) => withZaadAuth(c, "CREATE", async ({ prisma, tenantKey }) => {
    return c.json(await preflightZaadOneTime(prisma, tenantKey, await readJson(c)));
  }));
  app.post("/admin/zaad/one-time-dispatches", (c) => withZaadAuth(c, "CREATE", async ({ prisma, tenantKey, actorUserId }) => {
    return c.json({ dispatch: await prepareZaadOneTime(prisma, tenantKey, actorUserId, await readJson(c)) }, 201);
  }));
}

async function withZaadAuth(
  c: ZaadContext,
  action: AdminAccessAction,
  run: (context: {
    prisma: PrismaClient;
    tenantKey: TenantKey;
    actorUserId: string;
  }) => Promise<Response>,
) {
  try {
    const prisma = c.get("prisma");
    const authorization = await authorizeAdminApi(c.get("auth"), prisma, c.req.raw.headers, "zaad", action);
    if (!authorization.ok) return c.json({ error: authorization.error }, authorization.status);
    const tenantValues = c.req.queries("tenant") ?? [];
    if (tenantValues.length > 1 || (tenantValues.length && tenantValues[0] !== "lg")) return c.json({ error: ZAAD_ERROR_CODES.invalidRequest }, 400);
    const tenantKey = tenantValues.length ? "lg" : c.get("tenantKey");
    if (tenantKey !== "lg" || !(await outreachTenants(prisma, authorization.actor)).includes("lg")) return c.json({ error: "NOT_FOUND" }, 404);
    return await run({
      prisma,
      tenantKey,
      actorUserId: authorization.actor.id,
    });
  } catch (error) {
    return respondZaadError(c, error);
  }
}

async function readJson(c: ZaadContext) {
  if (c.req.header("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new ZaadResourceError(ZAAD_ERROR_CODES.invalidRequest, 400);
  }
  try {
    return await c.req.json();
  } catch {
    throw new ZaadResourceError(ZAAD_ERROR_CODES.invalidRequest, 400);
  }
}

async function readCsvUpload(c: ZaadContext) {
  const contentType = c.req.header("content-type")?.toLowerCase() ?? "";
  const contentLength = Number(c.req.header("content-length"));
  if (
    !contentType.startsWith("multipart/form-data;") ||
    !Number.isSafeInteger(contentLength) ||
    contentLength <= 0 ||
    contentLength > ZAAD_CSV_MAX_BYTES + 65_536
  ) {
    throw new ZaadResidentError(ZAAD_ERROR_CODES.invalidCsv, 400);
  }
  let formData: FormData;
  try {
    formData = await c.req.raw.formData();
  } catch {
    throw new ZaadResidentError(ZAAD_ERROR_CODES.invalidCsv, 400);
  }
  const entries = [...formData.entries()];
  if (entries.length !== 1 || entries[0]?.[0] !== "file" || !(entries[0][1] instanceof File)) {
    throw new ZaadResidentError(ZAAD_ERROR_CODES.invalidCsv, 400);
  }
  const file = entries[0][1];
  if (
    !file.name.toLowerCase().endsWith(".csv") ||
    file.size === 0 ||
    file.size > ZAAD_CSV_MAX_BYTES ||
    (file.type !== "" && file.type !== "text/csv" && file.type !== "application/csv" && file.type !== "application/vnd.ms-excel")
  ) {
    throw new ZaadResidentError(ZAAD_ERROR_CODES.invalidCsv, 400);
  }
  return new Uint8Array(await file.arrayBuffer());
}

function isExactRevision(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || !("revision" in value)) return null;
  return parsePositiveInteger(value.revision);
}

function respondZaadError(c: ZaadContext, error: unknown) {
  if (error instanceof ZaadResidentError || error instanceof ZaadResourceError || error instanceof ZaadOneTimeError) {
    return c.json(
      {
        error: error.code,
        ...(error instanceof ZaadResidentError && error.details ? { details: error.details } : {}),
        ...(error instanceof ZaadOneTimeError && error.dispatch ? { dispatch: error.dispatch } : {}),
      },
      error.status as 400 | 401 | 403 | 404 | 409 | 500 | 502 | 503,
    );
  }
  return c.json({ error: ZAAD_ERROR_CODES.zoomUnavailable }, 500);
}
