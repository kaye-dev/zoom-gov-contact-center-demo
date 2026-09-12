"use client";
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { FeedbackToast } from "@/app/components/admin/FeedbackToast";
import type { TenantKey } from "@/lib/tenants";
import { createFeedbackQueue, feedbackMessage, type FeedbackRequest } from "./outreach-feedback";

const FeedbackContext = createContext<((event: FeedbackRequest) => void) | null>(null);
export function OutreachFeedbackProvider({ tenant, view, children }: { tenant: TenantKey; view: string; children: ReactNode }) {
  const [store] = useState(() => createFeedbackQueue(tenant, view));
  const queue = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot), { t } = useI18n();
  useEffect(() => { store.activate(); return () => store.deactivate(); }, [store]);
  const notify = useCallback((event: FeedbackRequest) => store.notify({ ...event, tenant, view, tone: event.tone ?? "success", placement: "toast" }), [store, tenant, view]);
  const event = queue[0];
  return <FeedbackContext.Provider value={notify}>{children}{event && <FeedbackToast key={event.id} id={event.id} tone={event.tone} closeLabel={t.outreachCommon.feedback.dismiss} onClose={() => store.dismiss(event.id)}>{feedbackMessage(t.outreachCommon, event)}</FeedbackToast>}</FeedbackContext.Provider>;
}
export function useOutreachFeedback() {
  const notify = useContext(FeedbackContext);
  if (!notify) throw new Error("OutreachFeedbackProvider is required");
  return notify;
}
