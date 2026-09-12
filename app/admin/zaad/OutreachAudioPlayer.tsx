"use client";
import { Feedback } from "@/app/components/admin/Feedback";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { outreachSecondary as secondary } from "@/app/notifications/register/StudentNotificationRegistration";
export function OutreachAudioPlayer({ load }: { load: (signal: AbortSignal) => Promise<string> }) {
 const { t } = useI18n(), c = t.outreachCommon.audioPlayback;
 const audio = useRef<HTMLAudioElement>(null);
 const [src, setSrc] = useState<string>(), [busy, setBusy] = useState(true), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
 useEffect(() => {
  const controller = new AbortController(), element = audio.current;
  let objectUrl: string | undefined;
  void (async () => {
   try {
    const next = await load(controller.signal);
    if (controller.signal.aborted) { if (next.startsWith("blob:")) URL.revokeObjectURL(next); return; }
    objectUrl = next; setSrc(next); setBusy(false);
   } catch { if (!controller.signal.aborted) { setFailed(true); setBusy(false); } }
  })();
  return () => { controller.abort(); element?.pause(); if (objectUrl?.startsWith("blob:")) URL.revokeObjectURL(objectUrl); };
 }, [load, attempt]);
 function retry() { if (busy) return; setSrc(undefined); setFailed(false); setBusy(true); setAttempt(value => value + 1); }
 return <div className="space-y-3" aria-busy={busy}>
  <audio ref={audio} className="w-full" controls preload="metadata" src={src} aria-label={c.label} aria-disabled={busy || failed} onError={() => { setFailed(true); setBusy(false); }} />
  {busy && <p role="status" className="text-sm text-fg-muted">{c.loading}</p>}
  {failed && <><Feedback tone="error">{c.failed}</Feedback><button type="button" className={secondary} disabled={busy} onClick={retry}>{c.retry}</button></>}
 </div>;
}
