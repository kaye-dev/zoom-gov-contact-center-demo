import type { FeedbackTone } from "@/app/components/admin/Feedback";
import type { OutreachCommonDictionary } from "@/app/i18n/outreach-common";
import type { TenantKey } from "@/lib/tenants";

export type FeedbackMessageKey = "messageUi.saved" | "messageEdit.saved" | "messageEdit.unlinked" | "defaultGroups.candidateSaved" | "purposeCampaigns.saved";
export type OutreachFeedbackEvent = {
  id: string;
  tenant: TenantKey;
  view: string;
  tone: FeedbackTone;
  messageKey: FeedbackMessageKey;
  values?: Record<string, string | number>;
  placement: "toast";
};
export type FeedbackRequest = Omit<OutreachFeedbackEvent, "tenant" | "view" | "placement" | "tone"> & { tone?: FeedbackTone };
export function feedbackMessage(copy: OutreachCommonDictionary, event: Pick<OutreachFeedbackEvent, "messageKey" | "values">) {
  const messages: Record<FeedbackMessageKey, string> = {
    "messageUi.saved": copy.messageUi.saved,
    "messageEdit.saved": copy.messageEdit.saved,
    "messageEdit.unlinked": copy.messageEdit.unlinked,
    "defaultGroups.candidateSaved": copy.defaultGroups.candidateSaved,
    "purposeCampaigns.saved": copy.purposeCampaigns.saved,
  };
  return messages[event.messageKey].replace(/\{([^}]+)\}/g, (match, key: string) => String(event.values?.[key] ?? match));
}

/** Partial and unconfirmed outcomes never become success, even with a COMPLETED status. */
export function syncFeedbackTone(result: { status: string; counts: { failed: number; pending: number } }, advancing = false): FeedbackTone {
  if (result.counts.failed > 0) return "warning";
  if (result.counts.pending > 0) return advancing ? "info" : "warning";
  return result.status === "COMPLETED" ? "success" : "warning";
}
export function syncFeedbackMessage(template: string, counts: { synced: number; failed: number; pending: number }) {
  return template.replace(/\{(synced|failed|pending)\}/g, (_, key: "synced" | "failed" | "pending") => String(counts[key]));
}

/** A scoped queue also rejects callbacks held by a panel after its provider unmounts. */
export function createFeedbackQueue(tenant: TenantKey, view: string) {
  let queue: readonly OutreachFeedbackEvent[] = [];
  let active = true;
  const seen = new Set<string>(), listeners = new Set<() => void>();
  const emit = () => listeners.forEach(listener => listener());
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => queue,
    activate() { active = true; },
    deactivate() { active = false; queue = []; seen.clear(); },
    notify(event: OutreachFeedbackEvent) {
      if (!active || event.tenant !== tenant || event.view !== view || seen.has(event.id)) return;
      seen.add(event.id); queue = [...queue, event]; emit();
    },
    dismiss(id: string) { queue = queue.filter(event => event.id !== id); emit(); },
  };
}
