import type { PrismaClient } from "@/lib/generated/prisma/client";
import { fields, operationKey, OutreachContractError, phoneValue, record, stringList, stringValue } from "@/lib/zaad/outreach-contracts";
import { requireZoomBinding, zoomGroupMembers, type GroupClient } from "./zoom-groups";
import { ZaadZoomClient } from "./zoom-client";
import { getCrmImport } from "./crm-imports";
import { databaseError, digest, json } from "./outreach-data";
import type { OutreachScope } from "./outreach-scope";
import { writeZaadAudit } from "./audit";
export async function previewZoomCrmImport(db: PrismaClient, scope: OutreachScope, listId: string, payload: unknown, injected?: GroupClient) {
  const v = record(payload); fields(v, ["operationKey", "contactIds"]);
  const key = operationKey(v.operationKey), selected = v.contactIds === undefined ? null : stringList(v.contactIds, 1000);
  const client = injected ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey), binding = await requireZoomBinding(db, scope, client, "CONTACT_LIST", listId);
  const members = await zoomGroupMembers(db, scope, listId, client);
  if (selected?.some(id => !members.items.some(member => member.id === id))) throw new OutreachContractError("TARGET_CHANGED", 409);
  const rows: { rowKey: string; rowNumber: number; status: string; candidate: Record<string, unknown> }[] = [];
  for (const [index, member] of members.items.entries()) {
    if (selected && !selected.includes(member.id)) continue;
    let phone: string | null = null;
    try { if (member.phones.length === 1) phone = phoneValue(member.phones[0].number); } catch { /* A staff review must choose/verify the main number. */ }
    const match = !member.mapping?.personId && phone ? scope.siteKey === "lg"
      ? await db.municipalContact.findMany({ where: { siteKey: scope.siteKey, OR: [{ phone }, { name: member.displayName }] }, select: { id: true, name: true }, take: 10 })
      : await db.universityContact.findMany({ where: { siteKey: scope.siteKey, OR: [{ phone }, { name: member.displayName }] }, select: { id: true, name: true }, take: 10 }) : [];
    const status = member.mapping?.personId ? "LINKED" : !phone || !member.displayName.trim() ? "INCOMPLETE" : match.length ? "CANDIDATE" : "NEW";
    rows.push({ rowKey: member.id, rowNumber: index + 1, status, candidate: { source: "ZCC", accountId: client.accountId, bindingId: binding.id, bindingVersion: binding.version, listId, zoomContactId: member.id, name: member.displayName, phone, observedDigest: digest({ id: member.id, displayName: member.displayName, phones: member.phones, emails: member.emails }), candidates: match, status } });
  }
  const previewDigest = digest({ accountId: client.accountId, bindingId: binding.id, rows });
  for (let attempt = 0; ; attempt++) {
    try {
      const job = await db.$transaction(async tx => {
        const existing = await tx.crmImportJob.findUnique({ where: { siteKey_actorId_operationKey: { siteKey: scope.siteKey, actorId: scope.actorId, operationKey: key } } });
        if (existing) { if (existing.previewDigest !== previewDigest) throw new OutreachContractError("OPERATION_CONFLICT", 409); return existing; }
        return tx.crmImportJob.create({ data: { siteKey: scope.siteKey, actorId: scope.actorId, source: "ZCC", operationKey: key, previewDigest, expiresAt: new Date(Date.now() + 1800000), rows: { create: rows.map(row => ({ rowKey: row.rowKey, rowNumber: row.rowNumber, status: row.status, candidate: json(row.candidate) })) } } });
      }, { isolationLevel: "Serializable" });
      return getCrmImport(db, scope, job.id);
    } catch (error) {
      // Strict Mode and simultaneous retries may race on the same operation key.
      // Retry only transactional conflicts; the existing-job branch still verifies the digest.
      const retryable = error && typeof error === "object" && "code" in error && ["P2002", "P2034"].includes(String(error.code));
      if (!retryable || attempt >= 2) databaseError(error);
    }
  }
}
export async function applyZoomCrmImport(db: PrismaClient, scope: OutreachScope, listId: string, payload: unknown, injected?: GroupClient) {
  const v = record(payload); fields(v, ["jobId", "previewDigest", "rowKeys"]);
  const jobId = stringValue(v.jobId), expected = stringValue(v.previewDigest), selected = stringList(v.rowKeys, 1000);
  if (!selected.length) throw new OutreachContractError("EMPTY_SELECTION");
  const job = await db.crmImportJob.findFirst({ where: { id: jobId, siteKey: scope.siteKey, actorId: scope.actorId, source: "ZCC" }, include: { rows: true } });
  if (!job) throw new OutreachContractError("NOT_FOUND", 404);
  if (job.previewDigest !== expected || job.expiresAt < new Date()) throw new OutreachContractError("PREVIEW_EXPIRED", 409);
  const client = injected ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey), binding = await requireZoomBinding(db, scope, client, "CONTACT_LIST", listId);
  const current = await client.listContacts(listId);
  if (selected.some(key => !job.rows.some(row => row.rowKey === key && ["NEW", "FAILED", "IMPORTED"].includes(row.status)))) throw new OutreachContractError("INVALID_IMPORT_SELECTION");
  for (const key of selected) {
    const row = job.rows.find(row => row.rowKey === key)!;
    if (row.status === "IMPORTED") continue;
    const candidate = record(row.candidate), observed = current.find(member => member.id === key);
    if (!observed || candidate.listId !== listId || candidate.accountId !== client.accountId || candidate.bindingId !== binding.id || candidate.bindingVersion !== binding.version || candidate.observedDigest !== digest(observed)) throw new OutreachContractError("TARGET_CHANGED", 409);
  }
  for (const key of selected) {
    try {
      await db.$transaction(async tx => {
        const row = await tx.crmImportRow.findUniqueOrThrow({ where: { siteKey_jobId_rowKey: { siteKey: scope.siteKey, jobId, rowKey: key } } });
        if (row.status === "IMPORTED") return;
        const candidate = record(row.candidate), unique = { siteKey: scope.siteKey, bindingId: binding.id, zoomContactId: key };
        const existing = await tx.zoomContactMembership.findUnique({ where: { siteKey_bindingId_zoomContactId: unique } });
        if (existing?.personId) throw new OutreachContractError("MEMBERSHIP_ALREADY_LINKED", 409);
        const name = stringValue(candidate.name), phone = phoneValue(candidate.phone);
        const person = scope.siteKey === "lg" ? await tx.municipalContact.create({ data: { siteKey: scope.siteKey, name, phone, source: "ZCC" } }) : await tx.outreachImportCandidate.create({ data: { siteKey: scope.siteKey, name, phone, source: "ZCC" } });
        const personOrigin = scope.siteKey === "lg" ? "MUNICIPAL_CONTACT" : "IMPORT_CANDIDATE";
        await tx.zoomContactMembership.upsert({ where: { siteKey_bindingId_zoomContactId: unique }, create: { ...unique, personOrigin, personId: person.id, observedDigest: stringValue(candidate.observedDigest), syncState: "PENDING_REVIEW" }, update: { personOrigin, personId: person.id, observedDigest: stringValue(candidate.observedDigest), syncState: "PENDING_REVIEW", version: { increment: 1 } } });
        await tx.crmImportRow.update({ where: { id: row.id }, data: { status: "IMPORTED", personOrigin, personId: person.id, errorCode: null } });
        await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "crm-import", targetId: row.id, action: "CREATE", result: "SUCCESS", changedFieldNames: ["contact", "membership"] });
      }, { isolationLevel: "Serializable" });
    } catch { await db.crmImportRow.updateMany({ where: { siteKey: scope.siteKey, jobId, rowKey: key, status: { in: ["NEW", "FAILED"] } }, data: { status: "FAILED", errorCode: "IMPORT_RETRY_REQUIRED" } }); }
  }
  const remaining = await db.crmImportRow.count({ where: { siteKey: scope.siteKey, jobId, status: { in: ["NEW", "FAILED"] } } });
  await db.crmImportJob.update({ where: { id: jobId }, data: { status: remaining ? "PARTIAL" : "COMPLETED" } });
  return getCrmImport(db, scope, jobId);
}
