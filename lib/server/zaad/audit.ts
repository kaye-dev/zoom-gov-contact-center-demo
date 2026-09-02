import { createHmac } from "node:crypto";

import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";

export type ZaadAuditInput = {
  actorUserId: string | null;
  resourceKind: "resident" | "message" | "contact-list" | "registration-setting" | "campaign" | "one-time-dispatch";
  targetId: string;
  action: string;
  result: "SUCCESS" | "REJECTED" | "FAILED" | "RESULT_UNKNOWN";
  changedFieldNames?: string[];
  fromConsentStatus?: string | null;
  toConsentStatus?: string | null;
  fromCampaignStatus?: string | null;
  toCampaignStatus?: string | null;
  stableErrorCode?: string | null;
};

type AuditClient = PrismaClient | Prisma.TransactionClient;

export async function writeZaadAudit(prisma: AuditClient, input: ZaadAuditInput) {
  await prisma.zaadAdminAudit.create({
    data: {
      actorUserId: input.actorUserId,
      resourceKind: input.resourceKind,
      targetRef: opaqueTargetRef(input.resourceKind, input.targetId),
      action: input.action,
      result: input.result,
      changedFieldNames: [...new Set(input.changedFieldNames ?? [])].sort(),
      fromConsentStatus: input.fromConsentStatus ?? null,
      toConsentStatus: input.toConsentStatus ?? null,
      fromCampaignStatus: input.fromCampaignStatus ?? null,
      toCampaignStatus: input.toCampaignStatus ?? null,
      stableErrorCode: input.stableErrorCode ?? null,
    },
  });
}

export function opaqueTargetRef(resourceKind: string, targetId: string) {
  const key = auditKey();
  return createHmac("sha256", key)
    .update(`zaad-audit:v1:${resourceKind}:`)
    .update(targetId)
    .digest("base64url");
}

function auditKey() {
  const configured = process.env.ZAAD_AUDIT_HMAC_KEY?.trim();
  if (configured) return configured;
  const authSecret = process.env.BETTER_AUTH_SECRET?.trim();
  if (authSecret) {
    return createHmac("sha256", authSecret)
      .update("zaad-audit-key:v1")
      .digest();
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("ZAAD audit HMAC key is unavailable.");
  }
  return "zaad-development-audit-key-do-not-use-in-production";
}
