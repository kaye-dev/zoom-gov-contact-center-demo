import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { parseCrmCsv, type CrmCsvRow } from "@/lib/zaad/crm-csv";
import { fields, operationKey, OutreachContractError, record, stringList, stringValue } from "@/lib/zaad/outreach-contracts";
import { requireOutreachDepartment, type OutreachScope } from "./outreach-scope";
import { databaseError, digest, json } from "./outreach-data";
import { writeZaadAudit } from "./audit";

async function findCsvMatch(db: Pick<Prisma.TransactionClient, "municipalContact" | "universityContact" | "universityStudentRegistration">, scope: OutreachScope, row: CrmCsvRow) {
  if (scope.siteKey === "lg") return db.municipalContact.findFirst({ where: { siteKey: scope.siteKey, departmentKey: { in: scope.departments }, name: row.name, phone: row.phone }, select: { id: true } });
  const contact = await db.universityContact.findFirst({ where: { siteKey: scope.siteKey, departmentKey: { in: scope.departments }, displayStudentNumber: row.studentNumber }, select: { id: true } });
  if (contact || !scope.departments.includes("student-affairs") || !row.studentNumber) return contact;
  return db.universityStudentRegistration.findFirst({ where: { siteKey: scope.siteKey, contactId: null, facultyCode: row.studentNumber[0], admissionYear: 2000 + Number(row.studentNumber.slice(1, 3)), serial: row.studentNumber.slice(3) }, select: { id: true } });
}

export async function previewCrmImport(db: PrismaClient, scope: OutreachScope, input: { bytes: Uint8Array; operationKey: string; departmentKey: string }) {
  const key = operationKey(input.operationKey), departmentKey = stringValue(input.departmentKey);
  requireOutreachDepartment(scope, departmentKey);
  const rows = parseCrmCsv(input.bytes, scope.siteKey);
  for (const row of rows) {
    if (row.status !== "NEW") continue;
    const match = await findCsvMatch(db, scope, row);
    if (match) row.status = "MATCH";
  }
  const previewDigest = digest({ siteKey: scope.siteKey, actorId: scope.actorId, departmentKey, rows });
  try {
    return await db.$transaction(async tx => {
      const previous = await tx.crmImportJob.findUnique({ where: { siteKey_actorId_operationKey: { siteKey: scope.siteKey, actorId: scope.actorId, operationKey: key } }, include: { rows: { orderBy: { rowNumber: "asc" } } } });
      if (previous) {
        if (previous.previewDigest !== previewDigest) throw new OutreachContractError("OPERATION_CONFLICT", 409);
        return importDto(previous);
      }
      const job = await tx.crmImportJob.create({ data: { siteKey: scope.siteKey, actorId: scope.actorId, departmentKey, operationKey: key, source: "CSV", previewDigest, expiresAt: new Date(Date.now() + 30 * 60000), rows: { create: rows.map(row => ({ rowKey: row.rowKey, rowNumber: row.rowNumber, candidate: json(row), status: row.status, errorCode: row.errorCode })) } }, include: { rows: { orderBy: { rowNumber: "asc" } } } });
      return importDto(job);
    }, { isolationLevel: "Serializable" });
  } catch (error) { databaseError(error); }
}
export async function getCrmImport(db: PrismaClient, scope: OutreachScope, id: string) {
  const job = await db.crmImportJob.findFirst({ where: { id, siteKey: scope.siteKey, actorId: scope.actorId, departmentKey: { in: scope.departments } }, include: { rows: { orderBy: { rowNumber: "asc" } } } });
  if (!job) throw new OutreachContractError("NOT_FOUND", 404);
  return importDto(job);
}
export async function applyCrmImport(db: PrismaClient, scope: OutreachScope, payload: unknown) {
  const v = record(payload); fields(v, ["jobId", "previewDigest", "rowKeys"]);
  const jobId = stringValue(v.jobId), previewDigest = stringValue(v.previewDigest), selected = stringList(v.rowKeys, 1000);
  if (!selected.length) throw new OutreachContractError("EMPTY_SELECTION");
  const job = await db.crmImportJob.findFirst({ where: { id: jobId, siteKey: scope.siteKey, actorId: scope.actorId, departmentKey: { in: scope.departments } }, include: { rows: true } });
  if (!job) throw new OutreachContractError("NOT_FOUND", 404);
  if (job.previewDigest !== previewDigest || job.expiresAt <= new Date()) throw new OutreachContractError("PREVIEW_EXPIRED", 409);
  if (selected.some(key => !job.rows.some(row => row.rowKey === key && ["NEW", "FAILED", "IMPORTED"].includes(row.status)))) throw new OutreachContractError("INVALID_IMPORT_SELECTION");
  for (const key of selected) {
    try {
      await db.$transaction(async tx => {
        const row = await tx.crmImportRow.findUniqueOrThrow({ where: { siteKey_jobId_rowKey: { siteKey: scope.siteKey, jobId, rowKey: key } } });
        if (row.status === "IMPORTED") return;
        const claim = await tx.crmImportRow.updateMany({ where: { id: row.id, siteKey: scope.siteKey, status: { in: ["NEW", "FAILED"] } }, data: { status: "IMPORTING" } });
        if (claim.count !== 1) throw new OutreachContractError("IMPORT_ROW_CONFLICT", 409);
        const candidate = row.candidate as unknown as CrmCsvRow;
        if (!candidate.name || !candidate.phone) throw new OutreachContractError("INVALID_IMPORT_ROW");
        const existing = await findCsvMatch(tx, scope, candidate);
        if (existing) {
          await tx.crmImportRow.update({ where: { id: row.id }, data: { status: "MATCH", errorCode: "EXISTING_CONTACT_REQUIRES_REVIEW" } });
          return;
        }
        const created = scope.siteKey === "lg"
          ? await tx.municipalContact.create({ data: { siteKey: scope.siteKey, departmentKey: job.departmentKey, name: candidate.name, phone: candidate.phone, source: "CSV", status: "PENDING_REVIEW" } })
          : await tx.universityContact.create({ data: { siteKey: scope.siteKey, departmentKey: job.departmentKey, name: candidate.name, phone: candidate.phone, displayStudentNumber: candidate.studentNumber, facultyCode: candidate.studentNumber![0], admissionYear: 2000 + Number(candidate.studentNumber!.slice(1, 3)), serial: candidate.studentNumber!.slice(3), registrationSource: "CSV_IMPORT", registrationStatus: "PENDING_REVIEW" } });
        await tx.crmImportRow.update({ where: { id: row.id }, data: { status: "IMPORTED", errorCode: null, personOrigin: scope.siteKey === "lg" ? "MUNICIPAL_CONTACT" : "UNIVERSITY_CONTACT", personId: created.id } });
        await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "crm-import", targetId: row.id, action: "CREATE", result: "SUCCESS", changedFieldNames: ["contact", "source"] });
      }, { isolationLevel: "Serializable" });
    } catch {
      // Preserve successful rows and raw values only in the bounded preview store.
      await db.crmImportRow.updateMany({ where: { siteKey: scope.siteKey, jobId, rowKey: key, status: { in: ["NEW", "FAILED"] } }, data: { status: "FAILED", errorCode: "IMPORT_RETRY_REQUIRED" } });
    }
  }
  const incomplete = await db.crmImportRow.count({ where: { siteKey: scope.siteKey, jobId, status: { in: ["NEW", "FAILED", "IMPORTING"] } } });
  await db.crmImportJob.updateMany({ where: { id: jobId, siteKey: scope.siteKey, actorId: scope.actorId }, data: { status: incomplete ? "PARTIAL" : "COMPLETED" } });
  return getCrmImport(db, scope, jobId);
}
type JobWithRows = Prisma.CrmImportJobGetPayload<{ include: { rows: true } }>;
function importDto(job: JobWithRows) {
  return { tenantKey: job.siteKey, departmentKey: job.departmentKey, id: job.id, previewDigest: job.previewDigest, status: job.status, expiresAt: job.expiresAt.toISOString(), rows: job.rows.map(row => ({ ...(row.candidate as object), rowKey: row.rowKey, rowNumber: row.rowNumber, status: row.status, errorCode: row.errorCode, ...(row.personId ? { reference: { siteKey: job.siteKey, kind: job.siteKey === "lg" ? "resident" : "student", origin: row.personOrigin, id: row.personId } } : {}) })) };
}

export async function expireCrmPreviews(db: PrismaClient, now = new Date()) {
  const jobs = await db.crmImportJob.findMany({ where: { expiresAt: { lte: now }, status: { not: "EXPIRED" } }, select: { id: true, siteKey: true }, take: 50, orderBy: { expiresAt: "asc" } });
  for (const job of jobs) await db.$transaction(async tx => {
    await tx.crmImportRow.updateMany({ where: { siteKey: job.siteKey, jobId: job.id }, data: { candidate: json({ redacted: true }) } });
    await tx.crmImportJob.update({ where: { id: job.id }, data: { status: "EXPIRED" } });
  });
  return { expiredPreviews: jobs.length };
}
