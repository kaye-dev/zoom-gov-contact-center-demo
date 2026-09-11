import type { TenantKey } from "@/lib/tenants";
import { choice, fields, operationKey, OutreachContractError, personReference, record, stringList, stringValue, whole, type PersonReference } from "./outreach-contracts";
import { OUTREACH_VOICES } from "./message-contracts";
import { MUNICIPAL_TOPICS } from "./municipal/contracts";
import { TOPICS } from "./university/contracts";
export function parseDispatchDraft(payload: unknown, tenant: TenantKey) {
  const v = record(payload); fields(v, ["operationKey", "name", "departmentKey", "connectionMode", "messageRevisionId", "body", "voiceId", "languageCode", "flowBindingId", "targetMode", "groupIds", "people", "topic", "parentDispatchId"]);
  const targetMode = choice(v.targetMode, ["GROUPS", "PEOPLE"]);
  const people: PersonReference[] = [];
  if (targetMode === "PEOPLE") {
    if (!Array.isArray(v.people) || v.people.length > 1000) throw new OutreachContractError("INVALID_TARGETS");
    for (const person of v.people) people.push(personReference(person, tenant));
  }
  const groups = targetMode === "GROUPS" ? stringList(v.groupIds, 100) : [];
  if (!people.length && !groups.length) throw new OutreachContractError("EMPTY_SELECTION");
  const connectionMode = choice(v.connectionMode, ["MEDIA", "FLOW"]);
  return { operationKey: operationKey(v.operationKey), name: stringValue(v.name), connectionMode, body: stringValue(v.body, 2000, true), voiceId: choice(v.voiceId, OUTREACH_VOICES), languageCode: choice(v.languageCode, ["ja-JP"]), messageRevisionId: connectionMode === "MEDIA" && v.messageRevisionId != null ? stringValue(v.messageRevisionId) : null, flowBindingId: connectionMode === "FLOW" ? stringValue(v.flowBindingId) : null, targetMode, groupIds: groups, people, topic: choice(v.topic, tenant === "lg" ? ["disaster-radio", ...MUNICIPAL_TOPICS] : TOPICS), parentDispatchId: v.parentDispatchId == null ? null : stringValue(v.parentDispatchId) };
}
export function parseDispatchConfirmation(payload: unknown) {
  const v = record(payload); fields(v, ["id", "version", "snapshotDigest", "operationKey"]);
  return { id: stringValue(v.id), version: whole(v.version), snapshotDigest: stringValue(v.snapshotDigest), operationKey: operationKey(v.operationKey) };
}
