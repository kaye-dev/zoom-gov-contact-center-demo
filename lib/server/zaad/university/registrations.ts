import { addRegistrationMemberships } from "../default-groups";
import { syncRegisteredSource } from "../registration-group-sync";
import { getRegistrationReception } from "../registration-reception";
import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import {
  parseRegistration,
  OutreachError,
  object,
  exact,
  integer,
  text,
  enumValue,
  TOPICS,
  studentNumber,
  type RegistrationInput,
} from "@/lib/zaad/university/contracts";
import { opaqueTargetRef, writeZaadAudit } from "../audit";
import { requireDepartment, type Scope, type Database } from "./permissions";
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export const payloadDigest = (payload: unknown) =>
  opaqueTargetRef(
    "university-request",
    createHash("sha256")
      .update(JSON.stringify(canonical(payload)))
      .digest("hex"),
  );
export function rethrowDatabase(error: unknown): never {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined;
  if (code === "P2002" || code === "P2034")
    throw new OutreachError("VERSION_CONFLICT", 409);
  throw error;
}
export async function registerStudent(
  db: PrismaClient,
  siteKey: string,
  payload: unknown,
  actorId?: string,
  attestation?: string,
) {
  if (siteKey !== "univ") throw new OutreachError("NOT_FOUND", 404);
  if (process.env.UNIVERSITY_REGISTRATION_ENABLED === "false")
    throw new OutreachError("REGISTRATION_UNAVAILABLE", 503);
  const input = parseRegistration(payload),
    requestDigest = payloadDigest(input);
  try {
    const accepted = await db.$transaction(
      async (tx) => {
        const previous = await tx.universityStudentRegistration.findFirst({
          where: { siteKey, requestKey: input.requestKey },
        });
        if (previous) {
          if (previous.requestDigest !== requestDigest)
            throw new OutreachError("REQUEST_RETRY_REQUIRED", 409);
          return previous;
        }
        if (!actorId && !(await getRegistrationReception(tx, siteKey)).enabled) throw new OutreachError("REGISTRATION_UNAVAILABLE", 503);
        // Database-backed rate limit, serialized with the acceptance transaction.
        const count = await tx.universityStudentRegistration.count({
          where: { siteKey, receivedAt: { gte: new Date(Date.now() - 60000) } },
        });
        if (count >= 60) throw new OutreachError("RATE_LIMITED", 429);
        const row = await tx.universityStudentRegistration.create({
          data: {
            siteKey,
            requestKey: input.requestKey,
            requestDigest,
            name: input.name,
            facultyCode: input.facultyCode,
            admissionYear: input.admissionYear,
            serial: input.serial,
            phone: input.phone,
            topicIds: input.topicIds,
            source: actorId ? "UNIVERSITY_STAFF" : "STUDENT_PUBLIC",
            consentVersion: input.consentVersion,
            consentedAt: new Date(),
            note: actorId ? text(attestation) : "",
          },
        });
        await addRegistrationMemberships(tx, "univ", "UNIVERSITY_REGISTRATION", row.id, input.topicIds);
        await writeZaadAudit(tx, "univ", {
          actorUserId: actorId ?? null,
          resourceKind: "university-registration",
          targetId: row.id,
          action: "CREATE",
          result: "SUCCESS",
          changedFieldNames: ["registration", "consent"],
        });
        return row;
      },
      { isolationLevel: "Serializable" },
    );
    await syncRegisteredSource(db, "univ", "UNIVERSITY_REGISTRATION", accepted.id);
    return accepted;
  } catch (error) {
    rethrowDatabase(error);
  }
}
export async function listRegistrations(
  db: Database,
  scope: Scope,
  query: { cursor?: string; limit?: string; status?: string; source?: string },
) {
  requireDepartment(scope, "student-affairs");
  const limit =
    query.limit === undefined ? 50 : integer(Number(query.limit), 1, 100);
  const where: Prisma.UniversityStudentRegistrationWhereInput = {
    siteKey: scope.siteKey,
    ...(query.cursor ? { id: { lt: text(query.cursor, 100) } } : {}),
    ...(query.status
      ? {
          status: enumValue(query.status, [
            "PENDING_REVIEW",
            "ACTIVE",
            "WITHDRAWN",
          ]),
        }
      : {}),
    ...(query.source
      ? {
          source: enumValue(query.source, [
            "STUDENT_PUBLIC",
            "UNIVERSITY_STAFF",
          ]),
        }
      : {}),
  };
  const rows = await db.universityStudentRegistration.findMany({
    where,
    orderBy: { id: "desc" },
    take: limit + 1,
  });
  const counts = await db.universityStudentRegistration.groupBy({
    by: ["status"],
    where: { siteKey: scope.siteKey },
    _count: { _all: true },
  });
  return {
    counts: {
      total: counts.reduce((sum, row) => sum + row._count._all, 0),
      pending:
        counts.find((r) => r.status === "PENDING_REVIEW")?._count._all ?? 0,
      active: counts.find((r) => r.status === "ACTIVE")?._count._all ?? 0,
    },
    rows: rows.slice(0, limit).map((row) => ({
      ...row,
      name: row.reviewedName ?? row.name,
      topicIds: row.reviewedAt ? row.reviewedTopicIds : row.topicIds,
      reviewedPhone: undefined,
      phone: undefined,
      requestDigest: undefined,
      requestKey: undefined,
      phoneLast4: (row.reviewedPhone ?? row.phone).slice(-4),
      displayStudentNumber: studentNumber(
        row.facultyCode,
        row.admissionYear,
        row.serial,
      ),
    })),
    nextCursor: rows.length > limit ? rows[limit - 1].id : null,
  };
}
export async function getRegistration(db: Database, scope: Scope, id: string) {
  requireDepartment(scope, "student-affairs");
  const row = await db.universityStudentRegistration.findFirst({
    where: { siteKey: scope.siteKey, id },
    include: {
      contact: {
        select: {
          id: true,
          version: true,
          name: true,
          phone: true,
          preferences: {
            where: { siteKey: scope.siteKey, enabled: true },
            select: { topicId: true },
          },
        },
      },
    },
  });
  if (!row) throw new OutreachError("NOT_FOUND", 404);
  return {
    ...row,
    name: row.reviewedName ?? row.name,
    phone: row.reviewedPhone ?? row.phone,
    topicIds: row.reviewedAt ? row.reviewedTopicIds : row.topicIds,
    requestDigest: undefined,
    requestKey: undefined,
    displayStudentNumber: studentNumber(
      row.facultyCode,
      row.admissionYear,
      row.serial,
    ),
  };
}
export async function reviewStudent(
  db: PrismaClient,
  scope: Scope,
  id: string,
  payload: unknown,
) {
  requireDepartment(scope, "student-affairs");
  const v = object(payload);
  exact(v, [
    "version",
    "status",
    "identityConfirmed",
    "phoneConfirmed",
    "note",
    "topicIds",
    "name",
    "phone",
    "contactVersion",
    "contactId",
  ]);
  const version = integer(v.version, 1),
    status = enumValue(v.status, ["ACTIVE", "WITHDRAWN", "PENDING_REVIEW"]),
    note = text(v.note, 2000, true);
  if (!Array.isArray(v.topicIds) || v.topicIds.length > 5)
    throw new OutreachError("INVALID_REQUEST");
  const topicIds = [...new Set(v.topicIds.map((x) => enumValue(x, TOPICS)))];
  if (
    status === "ACTIVE" &&
    (v.identityConfirmed !== true ||
      v.phoneConfirmed !== true ||
      !topicIds.length)
  )
    throw new OutreachError("CONFIRMATION_REQUIRED");
  try {
    return await db.$transaction(
      async (tx) => {
        const row = await tx.universityStudentRegistration.findFirst({
          where: { siteKey: scope.siteKey, id },
        });
        if (!row) throw new OutreachError("NOT_FOUND", 404);
        if (row.version !== version)
          throw new OutreachError("VERSION_CONFLICT", 409);
        const reviewed = parseRegistration(
          {
            name: v.name ?? row.reviewedName ?? row.name,
            phone: v.phone ?? row.reviewedPhone ?? row.phone,
            facultyCode: row.facultyCode,
            admissionYear: row.admissionYear,
            serial: row.serial,
            topicIds: topicIds.length ? topicIds : row.topicIds,
            consent: true,
            consentVersion: row.consentVersion,
            requestKey: "correction-request",
          },
          new Date(`${row.admissionYear}-09-01T00:00:00Z`),
        );
        // The accepted declaration stays immutable; corrections belong to the verified contact.
        let contactId = row.contactId;
        if (status === "ACTIVE") {
          const conflicting = await tx.universityStudentRegistration.findFirst({
            where: {
              siteKey: scope.siteKey,
              facultyCode: row.facultyCode,
              admissionYear: row.admissionYear,
              serial: row.serial,
              status: "ACTIVE",
              id: { not: row.id },
            },
          });
          if (conflicting)
            throw new OutreachError("ACTIVE_REGISTRATION_CONFLICT", 409);
          const identity = {
            siteKey: scope.siteKey,
            facultyCode: row.facultyCode,
            admissionYear: row.admissionYear,
            serial: row.serial,
          };
          const existing = await tx.universityContact.findFirst({
            where: identity,
          });
          const data = {
            name: reviewed.name,
            phone: reviewed.phone,
            displayStudentNumber: studentNumber(
              row.facultyCode,
              row.admissionYear,
              row.serial,
            ),
            registrationSource: row.source,
            identityVerified: true,
            phoneVerified: true,
            phoneEligible: true,
          };

          if (existing) {
            if (existing.id !== row.contactId && v.contactId !== existing.id)
              throw new OutreachError("CONTACT_CONFIRMATION_REQUIRED", 409);
            if (integer(v.contactVersion, 1) !== existing.version)
              throw new OutreachError("VERSION_CONFLICT", 409);
            const changed = await tx.universityContact.updateMany({
              where: {
                ...identity,
                id: existing.id,
                version: existing.version,
              },
              data: { ...data, version: { increment: 1 } },
            });
            if (changed.count !== 1)
              throw new OutreachError("VERSION_CONFLICT", 409);
            contactId = existing.id;
          } else {
            contactId = (
              await tx.universityContact.create({
                data: {
                  ...identity,
                  ...data,
                  departmentKey: "student-affairs",
                },
              })
            ).id;
          }
          for (const topicId of TOPICS) {
            await tx.universityNotificationPreference.upsert({
              where: {
                siteKey_contactId_topicId: {
                  siteKey: scope.siteKey,
                  contactId,
                  topicId,
                },
              },
              create: {
                siteKey: scope.siteKey,
                contactId,
                topicId,
                enabled: topicIds.includes(topicId),
                sourceRequestId: row.id,
                confirmedBy: scope.actorId,
                confirmedAt: new Date(),
              },
              update: {
                enabled: topicIds.includes(topicId),
                sourceRequestId: row.id,
                confirmedBy: scope.actorId,
                confirmedAt: new Date(),
                withdrawnAt: topicIds.includes(topicId) ? null : new Date(),
              },
            });
          }
        } else if (contactId) {
          await tx.universityNotificationPreference.updateMany({
            where: { siteKey: scope.siteKey, contactId },
            data: { enabled: false, withdrawnAt: new Date() },
          });
          await tx.universityContact.updateMany({
            where: { siteKey: scope.siteKey, id: contactId },
            data: {
              phoneEligible: false,
              ...(status === "PENDING_REVIEW"
                ? {
                    name: reviewed.name,
                    phone: reviewed.phone,
                    phoneVerified: false,
                  }
                : {}),
              version: { increment: 1 },
            },
          });
        }
        const changed = await tx.universityStudentRegistration.updateMany({
          where: { siteKey: scope.siteKey, id, version },
          data: {
            status,
            contactId,
            reviewedName: reviewed.name,
            reviewedPhone: reviewed.phone,
            reviewedTopicIds: topicIds,
            identityConfirmed: v.identityConfirmed === true,
            phoneConfirmed: v.phoneConfirmed === true,
            reviewerId: scope.actorId,
            reviewedAt: new Date(),
            note,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1)
          throw new OutreachError("VERSION_CONFLICT", 409);
        await writeZaadAudit(tx, "univ", {
          actorUserId: scope.actorId,
          resourceKind: "university-registration",
          targetId: id,
          action: status,
          result: "SUCCESS",
          changedFieldNames: ["status", "verification", "preferences"],
        });
        return getRegistration(tx, scope, id);
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    rethrowDatabase(error);
  }
}
export type StudentRegistration = RegistrationInput;
