import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { contactSource, fields, OutreachContractError, phoneValue, record, referenceKey, stringList, stringValue, whole, choice, dateValue, type ContactDto, type PersonOrigin, type PersonReference } from "@/lib/zaad/outreach-contracts";
import { MUNICIPAL_CONSENT_VERSION, MUNICIPAL_DISTRICTS, MUNICIPAL_TOPICS, parseAvailability } from "@/lib/zaad/municipal/contracts";
import { CONSENT_VERSION, TOPICS, studentNumber } from "@/lib/zaad/university/contracts";
import { type Database, type Scope } from "./university/permissions";
import { getRegistration, registerStudent, reviewStudent } from "./university/registrations";
import { outreachWhere, requireOutreachDepartment, type OutreachScope } from "./outreach-scope";
import { registerMunicipalContact } from "./municipal/registrations";
import { databaseError, json } from "./outreach-data";
import { writeZaadAudit } from "./audit";

const reference = (scope: OutreachScope, origin: PersonOrigin, id: string): PersonReference => ({ siteKey: scope.siteKey, kind: scope.siteKey === "lg" ? "resident" : "student", origin, id });
function afterCursor(origin: PersonOrigin, cursor?: string) {
  if (!cursor) return {};
  const split = cursor.indexOf(":");
  if (split < 1) throw new OutreachContractError("INVALID_CURSOR");
  const cursorOrigin = cursor.slice(0, split), id = cursor.slice(split + 1);
  return origin < cursorOrigin ? { id: "__no_match__" } : origin === cursorOrigin ? { id: { gt: id } } : {};
}
const contains = (query: string) => ({ contains: query, mode: "insensitive" as const });
export async function listContacts(db: Database, scope: OutreachScope, query: { search?: string; cursor?: string; limit?: number } = {}) {
  const search = query.search?.trim().slice(0, 100) ?? "", limit = query.limit === undefined ? 25 : whole(query.limit, 1, 100);
  const items: ContactDto[] = []; let total = 0;
  if (scope.siteKey === "lg") {
    const where: Prisma.MunicipalContactWhereInput = { ...outreachWhere(scope), deletedAt: null, ...(search ? { OR: [{ name: contains(search) }, { phone: contains(search) }] } : {}) };
    const rows = await db.municipalContact.findMany({ where: { ...where, ...afterCursor("MUNICIPAL_CONTACT", query.cursor) }, include: { preferences: true }, orderBy: { id: "asc" }, take: limit + 1 });
    total += await db.municipalContact.count({ where });
    items.push(...rows.map(row => ({ reference: reference(scope, "MUNICIPAL_CONTACT", row.id), name: row.name, phone: row.phone, studentNumber: null, departmentKey: row.departmentKey, source: contactSource(row.source), status: row.status, topics: row.preferences.filter(p => p.enabled).map(p => p.topic), requestedTopics: row.preferences.filter(p => p.requested).map(p => p.topic), identityVerified: row.identityVerified, phoneVerified: row.phoneVerified, version: row.version, district: row.district })));
    if (scope.departments.includes("resident-support")) {
      const legacyWhere: Prisma.DisasterRadioSubscriptionWhereInput = { siteKey: scope.siteKey, ...(search ? { OR: [{ name: contains(search) }, { normalizedPhone: contains(search) }] } : {}) };
      total += await db.disasterRadioSubscription.count({ where: legacyWhere });
      const legacy = await db.disasterRadioSubscription.findMany({ where: { ...legacyWhere, ...afterCursor("DISASTER_RADIO", query.cursor) }, orderBy: { id: "asc" }, take: limit + 1 });
      items.push(...legacy.map(row => ({ reference: reference(scope, "DISASTER_RADIO", row.id), name: row.name, phone: row.normalizedPhone, studentNumber: null, departmentKey: "resident-support", source: contactSource(row.source), status: row.consentStatus, topics: ["disaster-radio"], requestedTopics: ["disaster-radio"], identityVerified: false, phoneVerified: false, version: row.revision, consentVersion: row.consentVersion })));
    }
  } else {
    const where: Prisma.UniversityContactWhereInput = { ...outreachWhere(scope), deletedAt: null, ...(search ? { OR: [{ name: contains(search) }, { phone: contains(search) }, { displayStudentNumber: contains(search) }] } : {}) };
    total += await db.universityContact.count({ where });
    const rows = await db.universityContact.findMany({ where: { ...where, ...afterCursor("UNIVERSITY_CONTACT", query.cursor) }, include: { preferences: true }, orderBy: { id: "asc" }, take: limit + 1 });
    items.push(...rows.map(row => ({ reference: reference(scope, "UNIVERSITY_CONTACT", row.id), name: row.name, phone: row.phone, studentNumber: row.displayStudentNumber, departmentKey: row.departmentKey, source: contactSource(row.registrationSource), status: row.deletedAt ? "WITHDRAWN" : row.phoneEligible && row.identityVerified && row.phoneVerified ? "ACTIVE" : row.registrationStatus, topics: row.preferences.filter(p => p.enabled).map(p => p.topicId), requestedTopics: row.preferences.filter(p => p.enabled).map(p => p.topicId), identityVerified: row.identityVerified, phoneVerified: row.phoneVerified, version: row.version })));
    if (scope.departments.includes("student-affairs")) {
      const whereRegistration: Prisma.UniversityStudentRegistrationWhereInput = { siteKey: scope.siteKey, contactId: null, ...(search ? { OR: [{ name: contains(search) }, { phone: contains(search) }, ...(search.match(/^\d{7}$/u) ? [{ facultyCode: search[0], admissionYear: 2000 + Number(search.slice(1, 3)), serial: search.slice(3) }] : [])] } : {}) };
      total += await db.universityStudentRegistration.count({ where: whereRegistration });
      const registrations = await db.universityStudentRegistration.findMany({ where: { ...whereRegistration, ...afterCursor("UNIVERSITY_REGISTRATION", query.cursor) }, orderBy: { id: "asc" }, take: limit + 1 });
      items.push(...registrations.map(row => ({ reference: reference(scope, "UNIVERSITY_REGISTRATION", row.id), name: row.reviewedName ?? row.name, phone: row.reviewedPhone ?? row.phone, studentNumber: studentNumber(row.facultyCode, row.admissionYear, row.serial), departmentKey: "student-affairs", source: contactSource(row.source), status: row.status, topics: [], requestedTopics: row.reviewedAt ? row.reviewedTopicIds : row.topicIds, identityVerified: row.identityConfirmed, phoneVerified: row.phoneConfirmed, version: row.version, consentVersion: row.consentVersion })));
    }
  }
  if (scope.siteKey === "univ") {
    const where = { ...outreachWhere(scope), linkedContactId: null, deletedAt: null, ...(search ? { OR: [{ name: contains(search) }, { phone: contains(search) }] } : {}) };
    total += await db.outreachImportCandidate.count({ where });
    const candidates = await db.outreachImportCandidate.findMany({ where: { ...where, ...afterCursor("IMPORT_CANDIDATE", query.cursor) }, orderBy: { id: "asc" }, take: limit + 1 });
    items.push(...candidates.map(row => ({ reference: reference(scope, "IMPORT_CANDIDATE", row.id), name: row.name, phone: row.phone, studentNumber: row.studentNumber, departmentKey: row.departmentKey, source: contactSource(row.source), status: row.status, topics: [], requestedTopics: [], identityVerified: false, phoneVerified: false, version: row.version })));
  }
  items.sort((a, b) => referenceKey(a.reference).localeCompare(referenceKey(b.reference)));
  return { tenantKey: scope.siteKey, items: items.slice(0, limit), total, nextCursor: items.length > limit ? referenceKey(items[limit - 1].reference) : null, observedAt: new Date().toISOString() };
}
export async function getContact(db: Database, scope: OutreachScope, origin: PersonOrigin, id: string): Promise<ContactDto & Record<string, unknown>> {
  if (origin === "IMPORT_CANDIDATE" && scope.siteKey === "univ") {
    const row = await db.outreachImportCandidate.findFirst({ where: { ...outreachWhere(scope), id } });
    if (!row) throw new OutreachContractError("NOT_FOUND", 404);
    return { reference: reference(scope, origin, id), name: row.name, phone: row.phone, studentNumber: row.studentNumber, departmentKey: row.departmentKey, source: contactSource(row.source), status: row.status, topics: [], requestedTopics: [], identityVerified: false, phoneVerified: false, version: row.version, linkedContactId: row.linkedContactId };
  }
  if (origin === "MUNICIPAL_CONTACT" && scope.siteKey === "lg") {
    const row = await db.municipalContact.findFirst({ where: { ...outreachWhere(scope), id }, include: { preferences: true, availability: { orderBy: { revision: "desc" }, take: 1 } } });
    if (!row) throw new OutreachContractError("NOT_FOUND", 404);
    return { reference: reference(scope, origin, id), name: row.name, phone: row.phone, studentNumber: null, departmentKey: row.departmentKey, source: contactSource(row.source), status: row.status, version: row.version, identityVerified: row.identityVerified, phoneVerified: row.phoneVerified, topics: row.preferences.filter(p => p.enabled).map(p => p.topic), requestedTopics: row.preferences.filter(p => p.requested).map(p => p.topic), preferences: row.preferences, availability: row.availability[0] ?? null, district: row.district, confirmationMethod: row.confirmationMethod, confirmedAt: row.confirmedAt, attestation: row.attestation };
  }
  if (origin === "UNIVERSITY_REGISTRATION" && scope.siteKey === "univ") {
    const row = await getRegistration(db, scope as Scope, id);
    return { reference: reference(scope, origin, id), name: row.name, phone: row.phone, studentNumber: row.displayStudentNumber, departmentKey: "student-affairs", source: contactSource(row.source), status: row.status, version: row.version, identityVerified: row.identityConfirmed, phoneVerified: row.phoneConfirmed, topics: row.status === "ACTIVE" ? row.topicIds : [], requestedTopics: row.topicIds, registration: row };
  }
  if (origin === "UNIVERSITY_CONTACT" && scope.siteKey === "univ") {
    const row = await db.universityContact.findFirst({ where: { ...outreachWhere(scope), id }, include: { preferences: true } });
    if (!row) throw new OutreachContractError("NOT_FOUND", 404);
    return { reference: reference(scope, origin, id), name: row.name, phone: row.phone, studentNumber: row.displayStudentNumber, departmentKey: row.departmentKey, source: contactSource(row.registrationSource), status: row.deletedAt ? "WITHDRAWN" : row.phoneEligible && row.identityVerified && row.phoneVerified ? "ACTIVE" : row.registrationStatus, version: row.version, identityVerified: row.identityVerified, phoneVerified: row.phoneVerified, topics: row.preferences.filter(p => p.enabled).map(p => p.topicId), requestedTopics: row.preferences.filter(p => p.enabled).map(p => p.topicId), preferences: row.preferences };
  }
  if (origin === "DISASTER_RADIO" && scope.siteKey === "lg") {
    requireOutreachDepartment(scope, "resident-support");
    const row = await db.disasterRadioSubscription.findFirst({ where: { siteKey: scope.siteKey, id } });
    if (!row) throw new OutreachContractError("NOT_FOUND", 404);
    return { reference: reference(scope, origin, id), name: row.name, phone: row.normalizedPhone, studentNumber: null, departmentKey: "resident-support", source: contactSource(row.source), status: row.consentStatus, version: row.revision, identityVerified: false, phoneVerified: false, topics: ["disaster-radio"], requestedTopics: ["disaster-radio"], legacy: true, legacyRecord: { email: row.normalizedEmail, consentStatus: row.consentStatus, revision: row.revision, syncStatus: row.syncStatus }, consentVersion: row.consentVersion };
  }
  throw new OutreachContractError("NOT_FOUND", 404);
}
export async function createContact(db: PrismaClient, scope: OutreachScope, payload: unknown) {
  requireOutreachDepartment(scope, scope.siteKey === "lg" ? "resident-support" : "student-affairs");
  if (scope.siteKey === "lg") {
    const row = await registerMunicipalContact(db, scope.siteKey, payload, scope.actorId);
    return getContact(db, scope, "MUNICIPAL_CONTACT", row.contactId);
  }
  const value = record(payload); fields(value, ["registration", "attestation"]);
  const row = await registerStudent(db, scope.siteKey, value.registration, scope.actorId, stringValue(value.attestation, 2000, true));
  return getContact(db, scope, "UNIVERSITY_REGISTRATION", row.id);
}
export async function updateContact(db: PrismaClient, scope: OutreachScope, origin: PersonOrigin, id: string, payload: unknown) {
  await getContact(db, scope, origin, id);
  if (origin === "UNIVERSITY_REGISTRATION") {
    await reviewStudent(db, scope as Scope, id, payload);
    return getContact(db, scope, origin, id);
  }
  if (origin === "DISASTER_RADIO") throw new OutreachContractError("LEGACY_CONTACT_REQUIRES_ORIGINAL_FORM", 409);
  if (origin === "IMPORT_CANDIDATE") return completeImportCandidate(db, scope, id, payload);
  const v = record(payload); fields(v, ["version", "name", "phone", "status", "topics", "identityVerified", "phoneVerified", "attestation", "confirmationMethod", "confirmedAt", "district", "availability", "departmentKey", "studentNumber", "consentEvidence"]);
  const version = whole(v.version), name = stringValue(v.name), phone = phoneValue(v.phone), status = choice(v.status, ["PENDING_REVIEW", "ACTIVE", "WITHDRAWN"]);
  const topics = stringList(v.topics, 5).map(topic => choice(topic, scope.siteKey === "lg" ? MUNICIPAL_TOPICS as readonly string[] : TOPICS));
  const attestation = stringValue(v.attestation, 2000, true), confirmationMethod = stringValue(v.confirmationMethod, 200), confirmedAt = new Date(dateValue(v.confirmedAt));
  if (confirmedAt > new Date()) throw new OutreachContractError("INVALID_CONFIRMATION_DATE");
  if (status === "ACTIVE" && (v.identityVerified !== true || v.phoneVerified !== true || !topics.length)) throw new OutreachContractError("CONFIRMATION_REQUIRED", 422);
  try {
    await db.$transaction(async tx => {
      const current = await getContact(tx, scope, origin, id);
      if (current.version !== version) throw new OutreachContractError("VERSION_CONFLICT", 409);
      const departmentKey = v.departmentKey === undefined ? current.departmentKey : stringValue(v.departmentKey);
      requireOutreachDepartment(scope, departmentKey);
      const phoneChanged = current.phone !== phone, nextStatus = phoneChanged ? "PENDING_REVIEW" : status;
      let newEvidenceId: string | null = null;
      if (v.consentEvidence != null) {
        const evidence = record(v.consentEvidence); fields(evidence, ["consentVersion", "consentedAt", "topics"]);
        const evidenceTopics = stringList(evidence.topics, 5);
        if (!evidenceTopics.length || evidenceTopics.some(topic => !topics.includes(topic)) || evidence.consentVersion !== (scope.siteKey === "lg" ? MUNICIPAL_CONSENT_VERSION : CONSENT_VERSION)) throw new OutreachContractError("INVALID_CONSENT_EVIDENCE", 422);
        const consentedAt = new Date(dateValue(evidence.consentedAt));
        if (consentedAt > confirmedAt) throw new OutreachContractError("INVALID_CONSENT_EVIDENCE", 422);
        const evidenceRow = await tx.outreachConsentEvidence.create({ data: { siteKey: scope.siteKey, personOrigin: origin, personId: id, contactVersion: version, topics: evidenceTopics, consentVersion: String(evidence.consentVersion), consentedAt, method: confirmationMethod, attestation, actorId: scope.actorId } });
        newEvidenceId = evidenceRow.id;
        for (const topic of evidenceTopics) {
          if (scope.siteKey === "lg") await tx.municipalNotificationPreference.upsert({ where: { siteKey_contactId_topic: { siteKey: scope.siteKey, contactId: id, topic } }, create: { siteKey: scope.siteKey, contactId: id, topic, requested: true, enabled: false, consentVersion: MUNICIPAL_CONSENT_VERSION, consentedAt }, update: { requested: true, consentVersion: MUNICIPAL_CONSENT_VERSION, consentedAt, version: { increment: 1 } } });
          else await tx.universityNotificationPreference.upsert({ where: { siteKey_contactId_topicId: { siteKey: scope.siteKey, contactId: id, topicId: topic } }, create: { siteKey: scope.siteKey, contactId: id, topicId: topic, enabled: false, sourceRequestId: evidenceRow.id, confirmedBy: scope.actorId, confirmedAt }, update: { sourceRequestId: evidenceRow.id, confirmedBy: scope.actorId, confirmedAt } });
        }
      }
      if (scope.siteKey === "lg") {
        const existing = await tx.municipalNotificationPreference.findMany({ where: { siteKey: scope.siteKey, contactId: id } });
        if (nextStatus === "ACTIVE" && topics.some(topic => !existing.some(p => p.topic === topic && p.requested && p.consentVersion && p.consentedAt))) throw new OutreachContractError("CONSENT_EVIDENCE_REQUIRED", 422);
        const changed = await tx.municipalContact.updateMany({ where: { ...outreachWhere(scope), id, version }, data: { name, phone, departmentKey, status: nextStatus, district: choice(v.district, MUNICIPAL_DISTRICTS), identityVerified: !phoneChanged && v.identityVerified === true, phoneVerified: !phoneChanged && v.phoneVerified === true, confirmedBy: scope.actorId, confirmedAt, confirmationMethod, attestation, version: { increment: 1 } } });
        if (changed.count !== 1) throw new OutreachContractError("VERSION_CONFLICT", 409);
        for (const p of existing) await tx.municipalNotificationPreference.update({ where: { id: p.id }, data: { enabled: nextStatus === "ACTIVE" && topics.includes(p.topic), confirmedBy: scope.actorId, confirmedAt, withdrawnAt: topics.includes(p.topic) ? null : new Date(), version: { increment: 1 } } });
        if (v.availability != null) {
          const confirmed = parseAvailability(v.availability), previous = await tx.municipalAvailability.findFirst({ where: { siteKey: scope.siteKey, contactId: id }, orderBy: { revision: "desc" } });
          await tx.municipalAvailability.create({ data: { siteKey: scope.siteKey, contactId: id, revision: (previous?.revision ?? 0) + 1, requested: previous?.requested ?? json(confirmed), confirmed: json(confirmed), confirmedBy: scope.actorId, confirmedAt } });
        }
        if (phoneChanged || departmentKey !== current.departmentKey || nextStatus !== "ACTIVE" || current.topics.some(topic => !topics.includes(topic))) {
          const snapshots = await tx.municipalTargetSnapshot.findMany({ where: { siteKey: scope.siteKey, contactId: id }, select: { id: true } });
          await tx.municipalScheduleJob.updateMany({ where: { siteKey: scope.siteKey, targetSnapshotId: { in: snapshots.map(s => s.id) }, state: "PENDING" }, data: { state: "CANCELLED" } });
        }
      } else {
        const number = v.studentNumber === undefined ? current.studentNumber : stringValue(v.studentNumber, 7);
        if (number && !/^[1-7][0-9]{6}$/.test(number)) throw new OutreachContractError("INVALID_STUDENT_NUMBER", 422);
        if (nextStatus === "ACTIVE" && !number) throw new OutreachContractError("STUDENT_NUMBER_REQUIRED", 422);
        const changed = await tx.universityContact.updateMany({ where: { ...outreachWhere(scope), id, version }, data: { name, phone, departmentKey, registrationStatus: nextStatus, identityVerified: !phoneChanged && v.identityVerified === true, phoneVerified: !phoneChanged && v.phoneVerified === true, phoneEligible: nextStatus === "ACTIVE", ...(number ? { facultyCode: number[0], admissionYear: 2000 + Number(number.slice(1, 3)), serial: number.slice(3), displayStudentNumber: number } : {}), version: { increment: 1 } } });
        if (changed.count !== 1) throw new OutreachContractError("VERSION_CONFLICT", 409);
        const existing = await tx.universityNotificationPreference.findMany({ where: { siteKey: scope.siteKey, contactId: id } });
        if (nextStatus === "ACTIVE" && topics.some(topic => !existing.some(p => p.topicId === topic))) throw new OutreachContractError("CONSENT_EVIDENCE_REQUIRED", 422);
        for (const p of existing) await tx.universityNotificationPreference.update({ where: { id: p.id }, data: { enabled: nextStatus === "ACTIVE" && topics.includes(p.topicId), confirmedBy: scope.actorId, confirmedAt, withdrawnAt: topics.includes(p.topicId) ? null : new Date() } });
      }
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "outreach-contact", targetId: `${origin}:${id}`, action: "UPDATE", result: "SUCCESS", changedFieldNames: ["name", "phone", "status", "preferences", "confirmation", ...(newEvidenceId ? ["consentEvidence"] : [])] });
    }, { isolationLevel: "Serializable" });
    return getContact(db, scope, origin, id);
  } catch (error) { databaseError(error); }
}

export async function deleteContact(db: PrismaClient, scope: OutreachScope, origin: PersonOrigin, id: string, payload: unknown) {
  const value = record(payload); fields(value, ["version", "reason"]);
  const version = whole(value.version), reason = stringValue(value.reason, 1000, true);
  await getContact(db, scope, origin, id);
  if (origin === "DISASTER_RADIO") throw new OutreachContractError("LEGACY_CONTACT_REQUIRES_ORIGINAL_FORM", 409);
  try {
    await db.$transaction(async tx => {
      const current = await getContact(tx, scope, origin, id);
      if (current.version !== version) throw new OutreachContractError("VERSION_CONFLICT", 409);
      const running = await tx.zaadOneTimeDispatch.count({ where: { siteKey: scope.siteKey, appState: { in: ["PREPARING", "READY", "EXECUTION_REQUESTED", "RUNNING", "UNKNOWN"] }, snapshot: { path: ["targets"], array_contains: [{ reference: { siteKey: scope.siteKey, origin, id } }] } } });
      if (running) throw new OutreachContractError("CONTACT_IN_USE", 409);
      if (scope.siteKey === "lg") {
        const snapshots = await tx.municipalTargetSnapshot.findMany({ where: { siteKey: scope.siteKey, contactId: id }, select: { id: true } });
        const ids = snapshots.map(row => row.id);
        if (await tx.municipalScheduleJob.count({ where: { siteKey: scope.siteKey, targetSnapshotId: { in: ids }, state: { in: ["CLAIMED", "UNKNOWN"] } } })) throw new OutreachContractError("CONTACT_IN_USE", 409);
        const changed = await tx.municipalContact.updateMany({ where: { ...outreachWhere(scope), id, version }, data: { status: "WITHDRAWN", deletedAt: new Date(), version: { increment: 1 } } });
        if (changed.count !== 1) throw new OutreachContractError("VERSION_CONFLICT", 409);
        await tx.municipalNotificationPreference.updateMany({ where: { siteKey: scope.siteKey, contactId: id }, data: { enabled: false, withdrawnAt: new Date(), version: { increment: 1 } } });
        await tx.municipalScheduleJob.updateMany({ where: { siteKey: scope.siteKey, targetSnapshotId: { in: ids }, state: "PENDING" }, data: { state: "CANCELLED" } });
      } else if (origin === "IMPORT_CANDIDATE") {
        const changed = await tx.outreachImportCandidate.updateMany({ where: { ...outreachWhere(scope), id, version, linkedContactId: null }, data: { status: "WITHDRAWN", deletedAt: new Date(), version: { increment: 1 } } });
        if (changed.count !== 1) throw new OutreachContractError("VERSION_CONFLICT", 409);
      } else if (origin === "UNIVERSITY_REGISTRATION") {
        const current = await tx.universityStudentRegistration.findFirstOrThrow({ where: { siteKey: scope.siteKey, id, version } });
        if (current.contactId) throw new OutreachContractError("DELETE_LINKED_CONTACT_FIRST", 409);
        await tx.universityStudentRegistration.update({ where: { id, version }, data: { status: "WITHDRAWN", version: { increment: 1 }, note: reason } });
      } else {
        const changed = await tx.universityContact.updateMany({ where: { ...outreachWhere(scope), id, version }, data: { registrationStatus: "WITHDRAWN", phoneEligible: false, deletedAt: new Date(), version: { increment: 1 } } });
        if (changed.count !== 1) throw new OutreachContractError("VERSION_CONFLICT", 409);
        await tx.universityNotificationPreference.updateMany({ where: { siteKey: scope.siteKey, contactId: id }, data: { enabled: false, withdrawnAt: new Date() } });
      }
      await tx.zoomContactMembership.updateMany({ where: { siteKey: scope.siteKey, personOrigin: origin, personId: id }, data: { syncState: "CRM_WITHDRAWN", version: { increment: 1 } } });
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "outreach-contact", targetId: `${origin}:${id}`, action: "DELETE", result: "SUCCESS", changedFieldNames: ["status", "deletedAt", "preferences"] });
    }, { isolationLevel: "Serializable" });
    return { tenantKey: scope.siteKey, deleted: true };
  } catch (error) { databaseError(error); }
}

async function completeImportCandidate(db: PrismaClient, scope: OutreachScope, id: string, payload: unknown) {
  if (scope.siteKey !== "univ") throw new OutreachContractError("NOT_FOUND", 404);
  const v = record(payload); fields(v, ["version", "name", "phone", "status", "topics", "identityVerified", "phoneVerified", "attestation", "confirmationMethod", "confirmedAt", "departmentKey", "studentNumber", "consentEvidence"]);
  const version = whole(v.version), name = stringValue(v.name), phone = phoneValue(v.phone), number = stringValue(v.studentNumber, 7), departmentKey = stringValue(v.departmentKey);
  if (!/^[1-7][0-9]{6}$/.test(number)) throw new OutreachContractError("INVALID_STUDENT_NUMBER", 422);
  requireOutreachDepartment(scope, departmentKey);
  const status = choice(v.status, ["ACTIVE", "PENDING_REVIEW", "WITHDRAWN"]);
  const topics = stringList(v.topics, 5).map(topic => choice(topic, TOPICS));
  const attestation = stringValue(v.attestation, 2000, true), method = stringValue(v.confirmationMethod, 200), confirmedAt = new Date(dateValue(v.confirmedAt));
  if (confirmedAt > new Date()) throw new OutreachContractError("INVALID_CONFIRMATION_DATE");
  const evidence = record(v.consentEvidence); fields(evidence, ["topics", "consentVersion", "consentedAt"]);
  const consentedAt = new Date(dateValue(evidence.consentedAt)), evidenceTopics = stringList(evidence.topics, 5);
  if (evidence.consentVersion !== CONSENT_VERSION || consentedAt > confirmedAt || !topics.length || evidenceTopics.length !== topics.length || topics.some(topic => !evidenceTopics.includes(topic))) throw new OutreachContractError("CONSENT_EVIDENCE_REQUIRED", 422);
  if (status === "ACTIVE" && (v.identityVerified !== true || v.phoneVerified !== true)) throw new OutreachContractError("CONFIRMATION_REQUIRED", 422);
  try {
    const contactId = await db.$transaction(async tx => {
      const candidate = await tx.outreachImportCandidate.findFirst({ where: { ...outreachWhere(scope), id, version, linkedContactId: null, deletedAt: null } });
      if (!candidate) throw new OutreachContractError("VERSION_CONFLICT", 409);
      const active = status === "ACTIVE" && candidate.phone === phone;
      const evidenceRow = await tx.outreachConsentEvidence.create({ data: { siteKey: scope.siteKey, personOrigin: "IMPORT_CANDIDATE", personId: id, contactVersion: version, topics, consentVersion: CONSENT_VERSION, consentedAt, method, attestation, actorId: scope.actorId } });
      const contact = await tx.universityContact.create({ data: { siteKey: scope.siteKey, departmentKey, name, phone, facultyCode: number[0], admissionYear: 2000 + Number(number.slice(1, 3)), serial: number.slice(3), displayStudentNumber: number, registrationSource: candidate.source, registrationStatus: active ? "ACTIVE" : status === "WITHDRAWN" ? "WITHDRAWN" : "PENDING_REVIEW", identityVerified: active, phoneVerified: active, phoneEligible: active, preferences: { create: topics.map(topicId => ({ topicId, enabled: active, sourceRequestId: evidenceRow.id, confirmedBy: scope.actorId, confirmedAt })) } } });
      await tx.outreachImportCandidate.update({ where: { id, version }, data: { linkedContactId: contact.id, studentNumber: number, status: "LINKED", version: { increment: 1 } } });
      await tx.zoomContactMembership.updateMany({ where: { siteKey: scope.siteKey, personOrigin: "IMPORT_CANDIDATE", personId: id }, data: { personOrigin: "UNIVERSITY_CONTACT", personId: contact.id, syncState: "DIFFERENCE", lastSyncedVersion: contact.version, version: { increment: 1 } } });
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "outreach-contact", targetId: id, action: "UPDATE", result: "SUCCESS", changedFieldNames: ["candidate", "contact", "consentEvidence"] });
      return contact.id;
    }, { isolationLevel: "Serializable" });
    return getContact(db, scope, "UNIVERSITY_CONTACT", contactId);
  } catch (error) { databaseError(error); }
}
