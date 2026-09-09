import { OutreachContractError } from "@/lib/zaad/outreach-contracts";
export const MUNICIPAL_LIVE_REQUIREMENTS = ["ACCOUNT_LICENSE", "FLOW_PUBLISHED_VERSION", "JAPANESE_INPUT", "IDENTITY_BRANCH", "ANSWER_RECEIPT", "ATTEMPT_CORRELATION", "PROVIDER_RETRY_DISABLED", "BEFORE_CALL_RECHECK", "STOP_READBACK", "CALLER_NOTICE", "CRON_HOSTING", "ASSIGNEE_COVERAGE"] as const;
export type MunicipalReadiness = { ready: boolean; missing: string[]; accountId: string | null; flowBindingId: string | null };
export type MunicipalSendInput = { siteKey: string; operationKey: string; correlationId: string; attemptId: string; phone: string; body: string; voiceId: string; flowBindingId: string; questionVersion: string };
export interface MunicipalProvider {
  readiness(flowBindingId: string | null): Promise<MunicipalReadiness>;
  send(input: MunicipalSendInput): Promise<{ state: "ACCEPTED" | "UNKNOWN"; engagementId?: string }>;
  reconcile(input: { operationKey: string; correlationId: string }): Promise<{ state: "ACCEPTED" | "NOT_SENT" | "UNKNOWN"; engagementId?: string }>;
}
/** The account-specific correlation/stop contract has not been verified. */
export function configuredMunicipalProvider(): MunicipalProvider {
  return {
    async readiness(flowBindingId) { return { ready: false, missing: [...MUNICIPAL_LIVE_REQUIREMENTS], accountId: null, flowBindingId }; },
    async send() { throw new OutreachContractError("PROVIDER_NOT_CONFIGURED", 503); },
    async reconcile() { return { state: "UNKNOWN" }; },
  };
}
