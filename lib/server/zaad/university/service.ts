import { canAdminAccess } from "@/lib/admin-access/authorization";
import { getAdminAccessActor } from "@/lib/server/admin-access/queries";
import { universityScope } from "./permissions";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { normalizeJapanPhone } from "@/lib/disaster-radio-subscriptions/validation";
import { CASES, recipientsFor } from "@/lib/zaad/university/demo";
import {
  PURPOSES,
  OutreachError,
  object,
  exact,
  text,
  integer,
  enumValue,
  ids,
  requestKey,
  parseConfig,
  parseAnswers,
  classify,
  staffSummary,
  groupSummary,
  type Outcome,
  type Purpose,
  type Config,
  type Answers,
} from "@/lib/zaad/university/contracts";
import {
  scopedWhere,
  type Scope,
  type Database,
} from "./permissions";
import { payloadDigest, rethrowDatabase } from "./registrations";
import { writeZaadAudit } from "../audit";
const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));
export const template = (scope: Scope, purpose: Purpose) => {

  return CASES.find((t) => t.id === purpose)!;
};
export async function assignees(db: Database, scope: Scope) {
  const users = await db.user.findMany({ where: { OR: [{ banned: false }, { banned: null }] }, select: { id: true, name: true }, orderBy: { id: "asc" } });
  const items = [];
  for (const user of users) {
    const actor = await getAdminAccessActor(db, user.id);
    if (!actor || !canAdminAccess(actor, "zaad", "UPDATE")) continue;
    try { await universityScope(db, scope.siteKey, actor); items.push(user); }
    catch (error) { if (!(error instanceof OutreachError)) throw error; }
  }
  return items;
}
export async function contacts(
  db: Database,
  scope: Scope,
  purpose: Purpose,
  mode: "DEMO" | "LIVE",
  cursor?: string,
  selectedIds?: string[],
  limit = 100,
) {
  const t = template(scope, purpose);
  integer(limit, 1, 100);
  const fixture = mode === "DEMO" ? recipientsFor(t.id) : [];
  const pageCursor = cursor ? text(cursor, 110) : "";
  if (pageCursor && !/^demo:\d+$|^real:[a-zA-Z0-9_-]*$/.test(pageCursor))
    throw new OutreachError("INVALID_REQUEST");
  const offset = !pageCursor
    ? 0
    : pageCursor.startsWith("demo:")
      ? integer(Number(pageCursor.slice(5)), 0, fixture.length)
      : fixture.length;
  const demoRows = selectedIds
    ? fixture
    : fixture.slice(offset, offset + limit);
  const realSlots = selectedIds ? 100 : limit - demoRows.length;
  const storedCursor = pageCursor.startsWith("real:")
    ? pageCursor.slice(5)
    : "";
  const contactWhere: Prisma.UniversityContactWhereInput = {
    siteKey: scope.siteKey,
    ...(selectedIds ? { id: { in: selectedIds } } : {}),

  };
  const stored = await db.universityContact.findMany({
    where: {
      ...contactWhere,
      ...(storedCursor ? { id: { gt: storedCursor } } : {}),
    },
    orderBy: { id: "asc" },
    take: realSlots + 1,
    include: {
      preferences: {
        where: { siteKey: scope.siteKey, topicId: purpose, enabled: true },
      },
    },
  });
  const rows = stored.slice(0, realSlots).map((c) => ({
    id: c.id,
    name: c.name,
    maskedContact: `${c.displayStudentNumber ?? ""} / • ${c.phone.slice(-4)}`,
    contactKey: c.id,
    eligible:
      !c.deletedAt && !["WITHDRAWN", "DELETED"].includes(c.registrationStatus) &&
      c.identityVerified &&
      c.phoneVerified &&
      c.phoneEligible &&
      (c.registrationSource === "UNIVERSITY_MANUAL" ||
        c.preferences.length > 0),
    exclusionReason:
      c.identityVerified && c.phoneVerified && c.phoneEligible
        ? ""
        : "UNVERIFIED_CONTACT",
    selectedByStaff: !!c.selectionReason,
    notified: c.priorNoticeAt !== null,
    priorNoticeAt: c.priorNoticeAt?.toISOString() ?? "",
    groupMemberCount: 1,
    call: "NOT_CALLED" as const,
    confirmed: false,
    recognized: false,
    answers: {},
    version: c.version,
    registrationSource: c.registrationSource,
  }));
  if (purpose === "group") {
    const groupWhere = {
      ...scopedWhere(scope),
      ...(selectedIds ? { id: { in: selectedIds } } : {}),
    };
    const groups = await db.universityContactGroup.findMany({
      where: {
        ...groupWhere,
        ...(storedCursor ? { id: { gt: storedCursor } } : {}),
      },
      orderBy: { id: "asc" },
      include: {
        representative: {
          include: {
            preferences: {
              where: {
                siteKey: scope.siteKey,
                topicId: "group",
                enabled: true,
              },
            },
          },
        },
        memberships: { where: { siteKey: scope.siteKey } },
      },
      take: realSlots + 1,
    });
    const groupRows = groups.slice(0, realSlots).map((g) => {
      const c = g.representative;
      const eligible =
        !c.deletedAt && !["WITHDRAWN", "DELETED"].includes(c.registrationStatus) &&
        c.identityVerified &&
        c.phoneVerified &&
        c.phoneEligible &&
        (c.registrationSource === "UNIVERSITY_MANUAL" ||
          c.preferences.length > 0) &&
        g.memberCount > 0 &&
        g.memberCount === g.memberships.length &&
        g.memberships.some((m) => m.contactId === c.id);
      return {
        id: g.id,
        groupId: g.id,
        groupVersion: g.version,
        name: g.name,
        maskedContact: `${c.name} / • ${c.phone.slice(-4)}`,
        contactKey: c.id,
        version: c.version,
        eligible,
        exclusionReason: eligible ? "" : "INVALID_GROUP_MEMBERSHIP",
        selectedByStaff: !!c.selectionReason,
        notified: c.priorNoticeAt !== null,
        priorNoticeAt: c.priorNoticeAt?.toISOString() ?? "",
        groupMemberCount: g.memberCount,
        call: "NOT_CALLED" as const,
        confirmed: false,
        recognized: false,
        answers: {},
      };
    });
    return {
      rows: [...demoRows, ...groupRows],
      total:
        fixture.length +
        (await db.universityContactGroup.count({ where: groupWhere })),
      nextCursor:
        offset + demoRows.length < fixture.length
          ? `demo:${offset + demoRows.length}`
          : groups.length > realSlots
            ? `real:${groupRows.at(-1)?.id ?? storedCursor}`
            : null,
    };
  }
  return {
    rows: [...demoRows, ...rows],
    total:
      fixture.length +
      (await db.universityContact.count({ where: contactWhere })),
    nextCursor:
      offset + demoRows.length < fixture.length
        ? `demo:${offset + demoRows.length}`
        : stored.length > realSlots
          ? `real:${rows.at(-1)?.id ?? storedCursor}`
          : null,
  };
}
export async function createContact(
  db: PrismaClient,
  scope: Scope,
  payload: unknown,
) {
  const v = object(payload);
  exact(v, [
    "departmentKey",
    "name",
    "phone",
    "selectionReason",
    "priorNoticeAt",
    "identityVerified",
    "phoneVerified",
    "phoneEligible",
  ]);

  const phone = normalizeJapanPhone(text(v.phone, 30));
  if (!phone) throw new OutreachError("INVALID_REQUEST");
  const priorNoticeAt = v.priorNoticeAt
    ? new Date(text(v.priorNoticeAt, 40))
    : null;
  if (priorNoticeAt && Number.isNaN(priorNoticeAt.getTime()))
    throw new OutreachError("INVALID_REQUEST");
  return db.$transaction(async (tx) => {
    const row = await tx.universityContact.create({
      data: {
        siteKey: scope.siteKey,
        name: text(v.name, 100),
        phone,
        registrationSource: "UNIVERSITY_MANUAL",
        selectionReason: text(v.selectionReason),
        priorNoticeAt,
        identityVerified: v.identityVerified === true,
        phoneVerified: v.phoneVerified === true,
        phoneEligible: v.phoneEligible === true,
      },
    });
    await writeZaadAudit(tx, "univ", {
      actorUserId: scope.actorId,
      resourceKind: "university-outreach",
      targetId: row.id,
      action: "CONTACT_CREATE",
      result: "SUCCESS",
      changedFieldNames: ["contact", "eligibility"],
    });
    return {
      id: row.id,
      name: row.name,
      maskedContact: `• ${phone.slice(-4)}`,
      version: row.version,
    };
  });
}
type Selected = Outcome & {
  version?: number;
  registrationSource?: string;
  groupId?: string;
  groupVersion?: number;
};
export async function preflight(db: Database, scope: Scope, payload: unknown) {
  const v = object(payload);
  exact(v, [
    "purpose",
    "mode",
    "trigger",
    "config",
    "targetIds",
    "confirmedTargetIds",
    "notifiedTargetIds",
  ]);
  const purpose = enumValue(v.purpose, PURPOSES),
    mode = enumValue(v.mode, ["DEMO", "LIVE"]),
    t = template(scope, purpose);
  const trigger = enumValue(v.trigger, ["follow-up", "direct"]);
  if (trigger !== t.mode && !(purpose === "group" && trigger === "direct"))
    throw new OutreachError("INVALID_TRIGGER");
  const config = parseConfig(purpose, v.config),
    targetIds = ids(v.targetIds),
    confirmed = ids(v.confirmedTargetIds ?? []),
    notified = ids(v.notifiedTargetIds ?? []);
  if (
    !targetIds.length ||
    confirmed.some((id) => !targetIds.includes(id)) ||
    notified.some((id) => !targetIds.includes(id))
  )
    throw new OutreachError("INVALID_REQUEST");
  const candidates = (
    await contacts(db, scope, purpose, mode, undefined, targetIds)
  ).rows as Selected[];
  const chosen = targetIds.map((id) => candidates.find((r) => r.id === id));
  if (chosen.some((r) => !r)) throw new OutreachError("NOT_FOUND", 404);
  const rows = (chosen as Selected[]).map((r) => ({
    ...r,
    selectedByStaff: r.selectedByStaff || confirmed.includes(r.id),
    notified: r.notified || notified.includes(r.id),
    priorNoticeAt:
      r.priorNoticeAt ||
      (notified.includes(r.id) ? new Date().toISOString().slice(0, 10) : ""),
  }));
  const excluded = rows.filter(
    (r) =>
      !r.eligible ||
      !r.selectedByStaff ||
      (trigger === "follow-up" && !r.notified),
  );
  const eligible = rows.filter((r) => !excluded.includes(r));
  const canonical = {
    purpose,
    mode,
    trigger,
    config,
    targetIds: [...targetIds].sort(),
    confirmedTargetIds: [...confirmed].sort(),
    notifiedTargetIds: [...notified].sort(),
  };
  // The digest binds identity, eligibility and consent revision, never only the selected IDs.
  const preflightHash = payloadDigest({
    scopeContract: "tenant-v1",
    canonical,
    rows: rows.map((r) => ({
      id: r.id,
      version: r.version ?? 1,
      groupVersion: r.groupVersion ?? null,
      eligible: r.eligible,
      selected: r.selectedByStaff,
      notified: r.notified,
    })),
  });
  return {
    ...canonical,
    preflightHash,
    eligible,
    excluded,
    candidateExclusions: candidates.filter(
      (r) => !r.eligible && !targetIds.includes(r.id),
    ),
    questions: t.questions,
    questionVersion: 1,
  };
}
export async function createBatch(
  db: PrismaClient,
  scope: Scope,
  payload: unknown,
) {
  const v = object(payload);
  exact(v, ["preflight", "preflightHash", "operationKey"]);
  const operationKey = requestKey(v.operationKey);
  try {
    return await db.$transaction(
      async (tx) => {
        const requestDigest = payloadDigest(v),
          old = await tx.universityOutreachBatch.findFirst({
            where: { ...scopedWhere(scope), operationKey },
          });
        if (old) {
          if (old.requestDigest !== requestDigest)
            throw new OutreachError("VERSION_CONFLICT", 409);
          return old;
        }
        const checked = await preflight(tx, scope, v.preflight);
        if (
          checked.preflightHash !== v.preflightHash ||
          !checked.eligible.length ||
          checked.excluded.length
        )
          throw new OutreachError("SNAPSHOT_STALE", 409);
        if (checked.mode === "LIVE")
          throw new OutreachError("PROVIDER_NOT_CONFIGURED", 503);
        const row = await tx.universityOutreachBatch.create({
          data: {
            siteKey: scope.siteKey,
            purpose: checked.purpose,
            mode: checked.mode,
            trigger: checked.trigger,
            config: json(checked.config),
            operationKey,
            requestDigest,
            createdBy: scope.actorId,
            targets: {
              create: [...checked.eligible, ...checked.candidateExclusions].map(
                (r) => ({
                  sourceKey: r.id,
                  contactId: r.version ? r.contactKey : null,
                  groupId: r.groupId ?? null,
                  contactVersion: r.version ?? null,
                  name: r.name,
                  maskedContact: r.maskedContact,
                  eligible: r.eligible,
                  exclusionReason: r.exclusionReason,
                  priorNoticeAt: r.priorNoticeAt
                    ? new Date(r.priorNoticeAt)
                    : null,
                  groupMemberCount: r.groupMemberCount,
                  snapshot: json({ ...r, scopeContract: "tenant-v1" }),
                }),
              ),
            },
          },
        });
        await writeZaadAudit(tx, "univ", {
          actorUserId: scope.actorId,
          resourceKind: "university-outreach",
          targetId: row.id,
          action: "PREPARE",
          result: "SUCCESS",
          changedFieldNames: ["snapshot"],
        });
        return row;
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    rethrowDatabase(error);
  }
}
async function batch(db: Database, scope: Scope, id: string) {
  const value = await db.universityOutreachBatch.findFirst({
    where: { ...scopedWhere(scope), id },
    include: {
      reserves: { where: { siteKey: scope.siteKey } },
      targets: {
        where: { siteKey: scope.siteKey },
        orderBy: { id: "asc" },
        include: {
          attempts: {
            where: { siteKey: scope.siteKey },
            orderBy: { attemptNo: "desc" },
            include: {
              responses: {
                where: { siteKey: scope.siteKey },
                orderBy: { eventVersion: "desc" },
                take: 1,
              },
            },
          },
          cases: {
            where: { siteKey: scope.siteKey },
            include: {
              actions: {
                where: { siteKey: scope.siteKey },
                orderBy: { occurredAt: "desc" },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
  if (!value) throw new OutreachError("NOT_FOUND", 404);
  return value;
}
export async function results(db: Database, scope: Scope, id: string) {
  const b = await batch(db, scope, id),
    t = template(scope, enumValue(b.purpose, PURPOSES));
  const rows = b.targets
    .filter((r) => r.eligible)
    .map((r) => {
      const attempt = r.attempts[0],
        task = r.cases[0],
        action = task?.actions[0];
      const outcome: Outcome = {
        ...(r.snapshot as unknown as Outcome),
        id: r.id,
        call: (attempt?.callState ?? "NOT_CALLED") as Outcome["call"],
        confirmed:
          attempt?.identityState === "VERIFIED" &&
          attempt?.ackState === "CONFIRMED",
        recognized: attempt?.recognitionState === "VALID",
        answers: (attempt?.responses[0]?.answers ?? {}) as Answers,
      };
      return {
        ...outcome,
        result: classify(outcome),
        task: task
          ? {
              ...task,
              assignee: task.assigneeId ?? "",
              note: action?.note ?? "",
              action: action?.actionKind ?? "",
              minutes: action?.minutes ?? 0,
              handoffRecipient: action?.handoffRecipient ?? null,
              handoffAt: action?.handoffAt ?? null,
              procedure: task.procedureStatus,
              verification: task.verificationReference ?? "",
            }
          : null,
      };
    });
  const summary = {
    targets: rows.length,
    connected: rows.filter((r) => ["HUMAN", "VOICEMAIL"].includes(r.call))
      .length,
    acknowledged: rows.filter(
      (r) => r.confirmed && r.recognized && r.call === "HUMAN",
    ).length,
    consultation: rows.filter(
      (r) => r.confirmed && r.recognized && r.answers.consultation === true,
    ).length,
    unconfirmed: rows.filter((r) => r.result === "unconfirmed").length,
    resolved: rows.filter((r) => r.task?.status === "RESOLVED").length,
    verified: rows.filter((r) => r.task?.procedure === "VERIFIED").length,
  };
  return {
    id: b.id,
    templateId: b.purpose,
    config: b.config as Config,
    version: b.version,
    mode: b.mode,
    status: b.status,
    frozenTargetCount: rows.length,
    rows,
    summary,
    reserves: b.reserves,
    groups: t.id === "group" ? groupSummary(rows) : null,
    venues:
      t.id === "staff"
        ? staffSummary(
            rows,
            b.config as Config,
            b.reserves.map((r) => ({ venue: r.venue, id: r.personRef })),
          )
        : null,
  };
}
export async function executeBatch(
  db: PrismaClient,
  scope: Scope,
  id: string,
  payload: unknown,
) {
  const v = object(payload);
  exact(v, ["version", "operationKey", "confirmed"]);
  const version = integer(v.version, 1),
    operationKey = requestKey(v.operationKey);
  if (v.confirmed !== true) throw new OutreachError("CONFIRMATION_REQUIRED");
  try {
    return await db.$transaction(
      async (tx) => {
        const b = await batch(tx, scope, id);
        if (b.status === "UNKNOWN")
          throw new OutreachError("RESULT_UNKNOWN", 409);
        if (b.executeKey === operationKey && b.status === "COMPLETED")
          return results(tx, scope, id);
        if (b.version !== version || b.status !== "PREPARED")
          throw new OutreachError("VERSION_CONFLICT", 409);
        if (b.targets.some(target => object(target.snapshot).scopeContract !== "tenant-v1")) throw new OutreachError("SNAPSHOT_STALE", 409);
        if (b.mode !== "DEMO")
          throw new OutreachError("PROVIDER_NOT_CONFIGURED", 503);
        const purpose = enumValue(b.purpose, PURPOSES),
          t = template(scope, purpose);
        for (const target of b.targets) {
          if (!target.eligible) continue;
          if (target.contactId) {
            const c = await tx.universityContact.findFirst({
              where: {
                siteKey: scope.siteKey,
                id: target.contactId,
                version: target.contactVersion!,
                identityVerified: true,
                phoneVerified: true,
                phoneEligible: true,
                deletedAt: null,
                registrationStatus: { notIn: ["WITHDRAWN", "DELETED"] },
              },
              include: {
                preferences: {
                  where: {
                    siteKey: scope.siteKey,
                    topicId: purpose,
                    enabled: true,
                  },
                },
              },
            });
            if (
              !c ||
              (c.registrationSource !== "UNIVERSITY_MANUAL" &&
                !c.preferences.length)
            )
              throw new OutreachError("SNAPSHOT_STALE", 409);
          }
          if (target.groupId) {
            const snapshot = target.snapshot as unknown as Selected;
            const g = await tx.universityContactGroup.findFirst({
              where: {
                ...scopedWhere(scope),
                id: target.groupId,
                version: snapshot.groupVersion,
                representativeContactId: target.contactId!,
              },
              include: { memberships: { where: { siteKey: scope.siteKey } } },
            });
            if (
              !g ||
              g.memberCount !== target.groupMemberCount ||
              g.memberships.length !== g.memberCount ||
              !g.memberships.some((m) => m.contactId === target.contactId)
            )
              throw new OutreachError("SNAPSHOT_STALE", 409);
          }
          const r = target.snapshot as unknown as Outcome;
          // Real registrations receive no fabricated positive answer in DEMO.
          const call = target.contactId ? "NO_ANSWER" : r.call;
          const confirmed = !target.contactId && r.confirmed,
            recognized = !target.contactId && r.recognized;
          const attempt = await tx.universityCallAttempt.create({
            data: {
              siteKey: scope.siteKey,
              targetId: target.id,
              attemptNo: 1,
              operationKey: `${operationKey}-${target.id}`,
              callState: call,
              identityState: confirmed ? "VERIFIED" : "UNVERIFIED",
              ackState: confirmed ? "CONFIRMED" : "UNCONFIRMED",
              recognitionState: recognized ? "VALID" : "NONE",
            },
          });
          await tx.universityResponse.create({
            data: {
              siteKey: scope.siteKey,
              attemptId: attempt.id,
              providerAccountKey: "DEMO",
              providerEventId: `demo-${attempt.id}`,
              eventVersion: 1,
              answers: json(target.contactId ? {} : r.answers),
              occurredAt: new Date(),
            },
          });
          await tx.universitySupportCase.create({
            data: {
              siteKey: scope.siteKey,
              targetId: target.id,
              procedureStatus: t.procedureApplicable ? "UNKNOWN" : "NA",
            },
          });
        }
        const update = await tx.universityOutreachBatch.updateMany({
          where: { ...scopedWhere(scope), id, version },
          data: {
            status: "COMPLETED",
            executeKey: operationKey,
            version: { increment: 1 },
          },
        });
        if (update.count !== 1)
          throw new OutreachError("VERSION_CONFLICT", 409);
        await writeZaadAudit(tx, "univ", {
          actorUserId: scope.actorId,
          resourceKind: "university-outreach",
          targetId: id,
          action: "DEMO_EXECUTE",
          result: "SUCCESS",
          changedFieldNames: ["results"],
        });
        return results(tx, scope, id);
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    rethrowDatabase(error);
  }
}
export async function updateCase(
  db: PrismaClient,
  scope: Scope,
  id: string,
  payload: unknown,
) {
  const v = object(payload);
  exact(v, [
    "version",
    "assigneeId",
    "status",
    "actionKind",
    "note",
    "minutes",
    "procedureStatus",
    "verificationAt",
    "verificationReference",
    "dueAt",
    "handoffRecipient",
    "handoffAt",
  ]);
  const handoffRecipient = v.handoffRecipient
    ? text(v.handoffRecipient, 200)
    : null;
  const handoffAt = v.handoffAt ? new Date(text(v.handoffAt, 40)) : null;
  if (
    v.actionKind === "handoff" &&
    (!handoffRecipient || !handoffAt || Number.isNaN(handoffAt.getTime()))
  )
    throw new OutreachError("VERIFICATION_REQUIRED");
  const version = integer(v.version, 1),
    status = enumValue(v.status, [
      "OPEN",
      "IN_PROGRESS",
      "RESOLVED",
      "CLOSED_UNREACHED",
    ]),
    note = text(v.note, 2000, true),
    minutes = integer(v.minutes, 0, 100000),
    assigneeId = text(v.assigneeId, 100),
    actionKind = text(v.actionKind, 100);
  const procedureStatus = enumValue(v.procedureStatus, [
    "UNKNOWN",
    "PLANNED",
    "VERIFIED",
    "NA",
  ]);
  const verificationAt = v.verificationAt
    ? new Date(text(v.verificationAt, 40))
    : null;
  const verificationReference = v.verificationReference
    ? text(v.verificationReference)
    : null;
  const dueAt = v.dueAt ? new Date(text(v.dueAt, 40)) : null;
  if (
    (verificationAt && Number.isNaN(verificationAt.getTime())) ||
    (dueAt && Number.isNaN(dueAt.getTime())) ||
    (procedureStatus === "VERIFIED" &&
      (!verificationAt || !verificationReference))
  )
    throw new OutreachError("VERIFICATION_REQUIRED");
  try {
    return await db.$transaction(
      async (tx) => {
        const row = await tx.universitySupportCase.findFirst({
          where: { ...scopedWhere(scope), id },
        });
        if (!row) throw new OutreachError("NOT_FOUND", 404);
        if (
          !(await assignees(tx, scope)).some(
            (a) => a.id === assigneeId,
          )
        )
          throw new OutreachError("INVALID_ASSIGNEE");
        if (row.procedureStatus === "NA" && procedureStatus !== "NA")
          throw new OutreachError("INVALID_REQUEST");
        const changed = await tx.universitySupportCase.updateMany({
          where: { ...scopedWhere(scope), id, version },
          data: {
            assigneeId,
            status,
            procedureStatus,
            verificationAt,
            verificationReference,
            dueAt,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1)
          throw new OutreachError("VERSION_CONFLICT", 409);
        await tx.universityCaseAction.create({
          data: {
            siteKey: scope.siteKey,
            caseId: id,
            actorId: scope.actorId,
            actionKind,
            handoffRecipient:
              actionKind === "handoff" ? handoffRecipient : null,
            handoffAt: actionKind === "handoff" ? handoffAt : null,
            note,
            minutes,
          },
        });
        await writeZaadAudit(tx, "univ", {
          actorUserId: scope.actorId,
          resourceKind: "university-case",
          targetId: id,
          action: status,
          result: "SUCCESS",
          changedFieldNames: ["assignment", "status", "procedure", "action"],
        });
        return tx.universitySupportCase.findFirst({
          where: { ...scopedWhere(scope), id },
          include: {
            actions: {
              where: { siteKey: scope.siteKey },
              orderBy: { occurredAt: "desc" },
            },
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    rethrowDatabase(error);
  }
}
export async function createIntake(
  db: PrismaClient,
  scope: Scope,
  payload: unknown,
) {

  const v = object(payload);
  exact(v, ["place", "issue", "support", "callback"]);
  return db.$transaction(async (tx) => {
    const row = await tx.universityIntake.create({
      data: {
        siteKey: scope.siteKey,
        place: text(v.place, 200),
        issue: text(v.issue),
        support: text(v.support),
        callback: text(v.callback, 200),
        cases: {
          create: { procedureStatus: "NA" },
        },
      },
      include: { cases: true },
    });
    await writeZaadAudit(tx, "univ", {
      actorUserId: scope.actorId,
      resourceKind: "university-intake",
      targetId: row.id,
      action: "MANUAL_INTAKE",
      result: "SUCCESS",
      changedFieldNames: ["intake"],
    });
    return row;
  });
}
export async function recontact(
  db: PrismaClient,
  scope: Scope,
  targetId: string,
  payload: unknown,
) {
  const v = object(payload);
  exact(v, ["reason", "operationKey"]);
  text(v.reason);
  const operationKey = requestKey(v.operationKey);
  try {
    return await db.$transaction(
      async (tx) => {
        const target = await tx.universityOutreachTarget.findFirst({
          where: {
            siteKey: scope.siteKey,
            id: targetId,
            batch: scopedWhere(scope),
          },
          include: {
            batch: true,
            attempts: {
              where: { siteKey: scope.siteKey },
              orderBy: { attemptNo: "desc" },
            },
          },
        });
        if (!target) throw new OutreachError("NOT_FOUND", 404);
        const prior = target.attempts.find(
          (a) => a.operationKey === operationKey,
        );
        if (prior) {
          if (prior.requestDigest !== payloadDigest(v))
            throw new OutreachError("VERSION_CONFLICT", 409);
          return prior;
        }
        if (target.batch.mode !== "DEMO")
          throw new OutreachError("PROVIDER_NOT_CONFIGURED", 503);
        if (!target.eligible) throw new OutreachError("SNAPSHOT_STALE", 409);
        if (target.contactId) {
          const contact = await tx.universityContact.findFirst({
            where: {
              siteKey: scope.siteKey,
              id: target.contactId,
              identityVerified: true,
              phoneVerified: true,
              phoneEligible: true,
            },
            include: {
              preferences: {
                where: {
                  siteKey: scope.siteKey,
                  topicId: target.batch.purpose,
                  enabled: true,
                },
              },
            },
          });
          if (
            !contact ||
            (contact.registrationSource !== "UNIVERSITY_MANUAL" &&
              !contact.preferences.length)
          )
            throw new OutreachError("SNAPSHOT_STALE", 409);
        }
        if (target.groupId) {
          const snapshot = target.snapshot as unknown as Selected;
          const g = await tx.universityContactGroup.findFirst({
            where: {
              ...scopedWhere(scope),
              id: target.groupId,
              version: snapshot.groupVersion,
              representativeContactId: target.contactId!,
            },
            include: { memberships: { where: { siteKey: scope.siteKey } } },
          });
          if (
            !g ||
            g.memberCount !== target.groupMemberCount ||
            g.memberships.length !== g.memberCount ||
            !g.memberships.some((m) => m.contactId === target.contactId)
          )
            throw new OutreachError("SNAPSHOT_STALE", 409);
        }
        if (
          target.attempts.some((a) =>
            ["UNKNOWN", "QUEUED"].includes(a.callState),
          )
        )
          throw new OutreachError("RESULT_UNKNOWN", 409);
        const result = await tx.universityCallAttempt.create({
          data: {
            siteKey: scope.siteKey,
            targetId,
            attemptNo: (target.attempts[0]?.attemptNo ?? 0) + 1,
            operationKey,
            requestDigest: payloadDigest(v),
            callState: "NO_ANSWER",
            identityState: "UNVERIFIED",
            ackState: "UNCONFIRMED",
            recognitionState: "NONE",
          },
        });
        await writeZaadAudit(tx, "univ", {
          actorUserId: scope.actorId,
          resourceKind: "university-outreach",
          targetId,
          action: "DEMO_RECONTACT",
          result: "SUCCESS",
          changedFieldNames: ["attempt"],
        });
        return result;
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    rethrowDatabase(error);
  }
}

export async function recordAnswer(
  db: PrismaClient,
  scope: Scope,
  targetId: string,
  payload: unknown,
) {
  const v = object(payload);
  exact(v, [
    "operationKey",
    "callState",
    "identityState",
    "ackState",
    "recognitionState",
    "answers",
    "note",
  ]);
  const operationKey = requestKey(v.operationKey),
    note = text(v.note, 2000, true);
  const callState = enumValue(v.callState, [
    "HUMAN",
    "VOICEMAIL",
    "NO_ANSWER",
    "BUSY",
    "FAILED",
    "UNKNOWN",
  ]);
  const identityState = enumValue(v.identityState, ["UNVERIFIED", "VERIFIED"]),
    ackState = enumValue(v.ackState, ["UNCONFIRMED", "CONFIRMED"]),
    recognitionState = enumValue(v.recognitionState, [
      "NONE",
      "VALID",
      "FAILED",
    ]);
  if (
    callState !== "HUMAN" &&
    (identityState === "VERIFIED" ||
      ackState === "CONFIRMED" ||
      recognitionState === "VALID")
  )
    throw new OutreachError("INVALID_REQUEST");
  try {
    return await db.$transaction(
      async (tx) => {
        const target = await tx.universityOutreachTarget.findFirst({
          where: {
            siteKey: scope.siteKey,
            id: targetId,
            batch: scopedWhere(scope),
          },
          include: {
            batch: true,
            attempts: {
              where: { siteKey: scope.siteKey },
              orderBy: { attemptNo: "desc" },
            },
            cases: { where: { siteKey: scope.siteKey } },
          },
        });
        if (!target || !target.cases[0])
          throw new OutreachError("NOT_FOUND", 404);
        const answerInput = object(v.answers);
        const answers = Object.keys(answerInput).length
          ? parseAnswers(
              enumValue(target.batch.purpose, PURPOSES),
              answerInput,
              target.groupMemberCount,
            )
          : {};
        if (
          (identityState !== "VERIFIED" || recognitionState !== "VALID") &&
          Object.keys(answers).length
        )
          throw new OutreachError("CONFIRMATION_REQUIRED");
        const previous = target.attempts.find(
          (a) => a.operationKey === operationKey,
        );
        if (previous) {
          const response = await tx.universityResponse.findFirst({
            where: {
              siteKey: scope.siteKey,
              attemptId: previous.id,
              providerAccountKey: "MANUAL",
            },
          });
          if (
            previous.requestDigest !== payloadDigest(v) ||
            previous.callState !== callState ||
            previous.identityState !== identityState ||
            previous.ackState !== ackState ||
            previous.recognitionState !== recognitionState ||
            payloadDigest(response?.answers) !== payloadDigest(answers)
          )
            throw new OutreachError("VERSION_CONFLICT", 409);
          return previous;
        }
        const attempt = await tx.universityCallAttempt.create({
          data: {
            siteKey: scope.siteKey,
            targetId,
            attemptNo: (target.attempts[0]?.attemptNo ?? 0) + 1,
            operationKey,
            requestDigest: payloadDigest(v),
            callState,
            identityState,
            ackState,
            recognitionState,
          },
        });
        await tx.universityResponse.create({
          data: {
            siteKey: scope.siteKey,
            attemptId: attempt.id,
            providerAccountKey: "MANUAL",
            providerEventId: operationKey,
            eventVersion: 1,
            answers: json(answers),
            occurredAt: new Date(),
          },
        });
        await tx.universityCaseAction.create({
          data: {
            siteKey: scope.siteKey,
            caseId: target.cases[0].id,
            actorId: scope.actorId,
            actionKind: "MANUAL_ANSWER",
            note,
            minutes: 0,
          },
        });
        await writeZaadAudit(tx, "univ", {
          actorUserId: scope.actorId,
          resourceKind: "university-outreach",
          targetId,
          action: "MANUAL_ANSWER",
          result: "SUCCESS",
          changedFieldNames: ["attempt", "answer"],
        });
        return attempt;
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    rethrowDatabase(error);
  }
}

export async function deleteDraft(
  db: PrismaClient,
  scope: Scope,
  id: string,
  payload: unknown,
) {
  const v = object(payload);
  exact(v, ["version"]);
  const version = integer(v.version, 1);
  try {
    return await db.$transaction(
      async (tx) => {
        const b = await batch(tx, scope, id);
        if (
          b.version !== version ||
          b.status !== "PREPARED" ||
          b.targets.some((t) => t.attempts.length)
        )
          throw new OutreachError("VERSION_CONFLICT", 409);
        await tx.universityOutreachTarget.deleteMany({
          where: {
            siteKey: scope.siteKey,
            batchId: id,
            batch: scopedWhere(scope),
          },
        });
        const deleted = await tx.universityOutreachBatch.deleteMany({
          where: { ...scopedWhere(scope), id, version, status: "PREPARED" },
        });
        if (deleted.count !== 1)
          throw new OutreachError("VERSION_CONFLICT", 409);
        await writeZaadAudit(tx, "univ", {
          actorUserId: scope.actorId,
          resourceKind: "university-outreach",
          targetId: id,
          action: "DELETE_DRAFT",
          result: "SUCCESS",
          changedFieldNames: ["draft"],
        });
        return { deleted: true };
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    rethrowDatabase(error);
  }
}

export async function recordReserve(
  db: PrismaClient,
  scope: Scope,
  id: string,
  payload: unknown,
) {
  const v = object(payload);
  exact(v, ["personRef", "venue", "note"]);
  const personRef = text(v.personRef, 100),
    venue = enumValue(v.venue, ["A会場", "B会場"]),
    note = text(v.note, 2000, true);
  try {
    return await db.$transaction(
      async (tx) => {
        const b = await batch(tx, scope, id);
        if (b.purpose !== "staff" || b.status !== "COMPLETED")
          throw new OutreachError("INVALID_REQUEST");
        if (
          b.targets.some(
            (t) => t.sourceKey === personRef || t.contactId === personRef,
          )
        )
          throw new OutreachError("DUPLICATE_PERSON", 409);
        const old = b.reserves.find((r) => r.personRef === personRef);
        if (old) {
          if (old.venue !== venue || old.note !== note)
            throw new OutreachError("VERSION_CONFLICT", 409);
          return old;
        }
        const row = await tx.universityVenueReserve.create({
          data: {
            siteKey: scope.siteKey,
            batchId: id,
            personRef,
            venue,
            note,
            recordedBy: scope.actorId,
          },
        });
        await writeZaadAudit(tx, "univ", {
          actorUserId: scope.actorId,
          resourceKind: "university-outreach",
          targetId: id,
          action: "RESERVE_CONFIRMED",
          result: "SUCCESS",
          changedFieldNames: ["reserve"],
        });
        return row;
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    rethrowDatabase(error);
  }
}

export async function replayDemo(db: PrismaClient, scope: Scope, id: string) {
  return db.$transaction(async (tx) => {
    const b = await batch(tx, scope, id);
    if (b.mode !== "DEMO" || b.purpose !== "group" || b.status !== "COMPLETED")
      throw new OutreachError("INVALID_REQUEST");
    const response = b.targets
      .flatMap((t) => t.attempts.flatMap((a) => a.responses))
      .find((r) => r.providerAccountKey === "DEMO");
    if (!response) throw new OutreachError("NOT_FOUND", 404);
    await tx.universityResponse.createMany({
      data: [
        {
          siteKey: scope.siteKey,
          attemptId: response.attemptId,
          providerAccountKey: response.providerAccountKey,
          providerEventId: response.providerEventId,
          eventVersion: response.eventVersion,
          answers: json(response.answers),
          occurredAt: response.occurredAt,
        },
      ],
      skipDuplicates: true,
    });
    return results(tx, scope, id);
  });
}

export async function exportResults(db: Database, scope: Scope, id: string) {
  const value = await results(db, scope, id);
  const cell = (value: unknown) =>
    `"${String(value ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""')}"`;
  return {
    csv:
      [
        [
          "id",
          "name",
          "contact",
          "call",
          "identityAcknowledged",
          "recognitionValid",
          "caseStatus",
          "procedureStatus",
        ],
        ...value.rows.map((r) => [
          r.id,
          r.name,
          r.maskedContact,
          r.call,
          r.confirmed,
          r.recognized,
          r.task?.status,
          r.task?.procedureStatus,
        ]),
      ]
        .map((row) => row.map(cell).join(","))
        .join("\r\n") + "\r\n",
  };
}
