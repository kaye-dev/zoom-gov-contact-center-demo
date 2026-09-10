import type { Hono } from "hono";
import type { ZaadApiEnvironment } from "../api-routes";
import { withOutreach, outreachError, outreachJson, boundedBody } from "../outreach-api";
import { registerMunicipalContact } from "./registrations";
import { getMunicipalCase, listMunicipalAssignees, listWorkflows, saveWorkflow, getWorkflow, setWorkflowTarget, workflowTargets, previewWorkflowRun, queueWorkflowRun, getMunicipalRun, listMunicipalCases, updateMunicipalCase } from "./service";
import { acceptProviderEvent, acceptAnswerReceipt, issueAttemptCapability, processMunicipalInbox, secretMatches } from "./receipts";
import { expireCrmPreviews } from "../crm-imports";
import { municipalTick, settleMunicipalDeadlines } from "./scheduler";
import { OutreachContractError } from "@/lib/zaad/outreach-contracts";
import { MUNICIPAL_DISTRICTS, MUNICIPAL_TOPICS, MUNICIPAL_CONSENT_VERSION } from "@/lib/zaad/municipal/contracts";
import { getContact, updateContact } from "../contacts";

export function registerMunicipalRoutes(app: Hono<ZaadApiEnvironment>) {
  app.get("/municipal-notification-options", async c => {
    c.header("Cache-Control", "no-store");
    if (c.get("tenantKey") !== "lg") return c.notFound();
    return c.json({ districts: MUNICIPAL_DISTRICTS, topics: MUNICIPAL_TOPICS, consentVersion: MUNICIPAL_CONSENT_VERSION });
  });
  app.post("/municipal-notification-registrations", async c => {
    c.header("Cache-Control", "no-store");
    try {
      await registerMunicipalContact(c.get("prisma"), c.get("tenantKey"), await outreachJson(c));
      return c.json({ status: "accepted" }, 202);
    } catch (error) { return outreachError(c, error); }
  });
  app.get("/admin/zaad/municipal/contacts/:id", c => withOutreach(c, "VIEW", (db, scope) => getContact(db, scope, "MUNICIPAL_CONTACT", c.req.param("id"))));
  app.patch("/admin/zaad/municipal/contacts/:id", c => withOutreach(c, "UPDATE", async (db, scope) => updateContact(db, scope, "MUNICIPAL_CONTACT", c.req.param("id"), await outreachJson(c))));
  app.get("/admin/zaad/municipal/assignees", c => withOutreach(c, "VIEW", (db, scope) => listMunicipalAssignees(db, scope)));
  app.get("/admin/zaad/municipal/workflows", c => withOutreach(c, "VIEW", (db, scope) => listWorkflows(db, scope)));
  app.post("/admin/zaad/municipal/workflows", c => withOutreach(c, "CREATE", async (db, scope) => saveWorkflow(db, scope, await outreachJson(c))));
  app.get("/admin/zaad/municipal/workflows/:id", c => withOutreach(c, "VIEW", async (db, scope) => ({ tenantKey: scope.siteKey, workflow: await getWorkflow(db, scope, c.req.param("id")) })));
  app.patch("/admin/zaad/municipal/workflows/:id", c => withOutreach(c, "UPDATE", async (db, scope) => saveWorkflow(db, scope, await outreachJson(c), c.req.param("id"))));
  app.get("/admin/zaad/municipal/workflows/:id/targets", c => withOutreach(c, "VIEW", (db, scope) => workflowTargets(db, scope, c.req.param("id"))));
  app.post("/admin/zaad/municipal/workflows/:id/targets", c => withOutreach(c, "UPDATE", async (db, scope) => setWorkflowTarget(db, scope, c.req.param("id"), await outreachJson(c))));
  app.post("/admin/zaad/municipal/workflows/:id/preview", c => withOutreach(c, "CREATE", async (db, scope) => previewWorkflowRun(db, scope, c.req.param("id"), await outreachJson(c))));
  app.post("/admin/zaad/municipal/workflows/:id/runs", c => withOutreach(c, "CREATE", async (db, scope) => queueWorkflowRun(db, scope, c.req.param("id"), await outreachJson(c))));
  app.get("/admin/zaad/municipal/runs/:id", c => withOutreach(c, "VIEW", (db, scope) => getMunicipalRun(db, scope, c.req.param("id"))));
  app.get("/admin/zaad/municipal/cases", c => withOutreach(c, "VIEW", (db, scope) => listMunicipalCases(db, scope, { status: c.req.query("status"), purpose: c.req.query("purpose"), assigneeId: c.req.query("assigneeId"), overdue: c.req.query("overdue") === "1", unconfirmed: c.req.query("unconfirmed") === "1", cursor: c.req.query("cursor") })));
  app.get("/admin/zaad/municipal/cases/:id", c => withOutreach(c, "VIEW", (db, scope) => getMunicipalCase(db, scope, c.req.param("id"))));
  app.patch("/admin/zaad/municipal/cases/:id", c => withOutreach(c, "UPDATE", async (db, scope) => updateMunicipalCase(db, scope, c.req.param("id"), await outreachJson(c))));
  app.post("/zaad/municipal/provider-events", async c => {
    c.header("Cache-Control", "no-store");
    try { return c.json(await acceptProviderEvent(c.get("prisma"), await boundedBody(c.req.raw), c.req.raw.headers)); }
    catch (error) { return outreachError(c, error); }
  });
  app.post("/zaad/municipal/answer-receipts", async c => {
    c.header("Cache-Control", "no-store");
    try { return c.json(await acceptAnswerReceipt(c.get("prisma"), JSON.parse(await boundedBody(c.req.raw)), c.req.header("authorization") ?? null)); }
    catch (error) { return outreachError(c, error); }
  });
  app.post("/zaad/municipal/attempt-capabilities", async c => {
    c.header("Cache-Control", "no-store");
    try { return c.json(await issueAttemptCapability(c.get("prisma"), JSON.parse(await boundedBody(c.req.raw)), c.req.header("authorization") ?? null)); }
    catch (error) { return outreachError(c, error); }
  });
  app.get("/internal/zaad/municipal/tick", async c => {
    c.header("Cache-Control", "no-store");
    try {
      const secret = process.env.CRON_SECRET;
      if (!secretMatches(c.req.header("authorization") ?? null, secret ? `Bearer ${secret}` : undefined)) throw new OutreachContractError("UNAUTHORIZED", 401);
      const inbox = await processMunicipalInbox(c.get("prisma"));
      return c.json({ ...inbox, ...await municipalTick(c.get("prisma")), ...await settleMunicipalDeadlines(c.get("prisma")), ...await expireCrmPreviews(c.get("prisma")) });
    } catch (error) { return outreachError(c, error); }
  });
}
