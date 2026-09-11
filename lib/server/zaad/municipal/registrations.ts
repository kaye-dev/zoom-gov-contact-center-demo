import { addRegistrationMemberships } from "../default-groups";
import { syncRegisteredSource } from "../registration-group-sync";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { MUNICIPAL_TOPICS, parseMunicipalRegistration } from "@/lib/zaad/municipal/contracts";
import { OutreachContractError } from "@/lib/zaad/outreach-contracts";
import { writeZaadAudit } from "../audit";
import { databaseError, digest, json } from "../outreach-data";

export async function registerMunicipalContact(db: PrismaClient, siteKey: string, payload: unknown, actorId?: string) {
  if (siteKey !== "lg") throw new OutreachContractError("NOT_FOUND", 404);
  if (process.env.MUNICIPAL_REGISTRATION_ENABLED === "false") throw new OutreachContractError("REGISTRATION_UNAVAILABLE", 503);
  const input = parseMunicipalRegistration(payload), requestDigest = digest(input), now = new Date();
  try {
    const accepted = await db.$transaction(async tx => {
      const previous = await tx.municipalNotificationRegistration.findUnique({ where: { siteKey_operationKey: { siteKey, operationKey: input.operationKey } } });
      if (previous) {
        if (previous.requestDigest !== requestDigest) throw new OutreachContractError("OPERATION_CONFLICT", 409);
        return previous;
      }
      const count = await tx.municipalNotificationRegistration.count({ where: { siteKey, receivedAt: { gte: new Date(now.getTime() - 60000) } } });
      if (count >= 60) throw new OutreachContractError("RATE_LIMITED", 429);
      const contact = await tx.municipalContact.create({ data: { siteKey, name: input.name, phone: input.phone, district: input.district, source: actorId ? "MANUAL" : "HP" } });
      const registration = await tx.municipalNotificationRegistration.create({ data: { siteKey, contactId: contact.id, operationKey: input.operationKey, requestDigest, name: input.name, phone: input.phone, district: input.district, topics: input.topics, ...(input.availability ? { availability: json(input.availability) } : {}), consentVersion: input.consentVersion, consentedAt: now, source: actorId ? "MANUAL" : "HP" } });
      await tx.municipalNotificationPreference.createMany({ data: MUNICIPAL_TOPICS.map(topic => ({ siteKey, contactId: contact.id, topic, requested: input.topics.includes(topic), enabled: false, consentVersion: input.topics.includes(topic) ? input.consentVersion : null, consentedAt: input.topics.includes(topic) ? now : null })) });
      if (input.availability) await tx.municipalAvailability.create({ data: { siteKey, contactId: contact.id, revision: 1, requested: json(input.availability) } });
      await addRegistrationMemberships(tx, "lg", "MUNICIPAL_CONTACT", contact.id, input.topics);
      await writeZaadAudit(tx, siteKey, { actorUserId: actorId ?? null, resourceKind: "municipal-registration", targetId: registration.id, action: "CREATE", result: "SUCCESS", changedFieldNames: ["registration", "preferences"] });
      return registration;
    }, { isolationLevel: "Serializable" });
    await syncRegisteredSource(db, "lg", "MUNICIPAL_CONTACT", accepted.contactId);
    return accepted;
  } catch (error) { databaseError(error); }
}
