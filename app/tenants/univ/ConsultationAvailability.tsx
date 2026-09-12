"use client";

import { useEffect, useRef, useState } from "react";
import { UniversityIcon } from "./icons/UniversityIcon";
import { consultationIllustrations } from "./icons/ConsultationIllustrations";
import type { UniversityConsultationService } from "@/lib/online-consultation-settings";

import { useI18n } from "@/app/i18n/LanguageProvider";
import { Feedback } from "@/app/components/admin/Feedback";
import { startZoomVideo } from "@/lib/zoom-video-client";
import type { ZoomVideoConfig } from "@/lib/zoom-video-tag";
import type { ConsultationIntake } from "@/lib/consultation-intake";
import { ConsultationIntakeDialog } from "./ConsultationIntakeDialog";

type AvailabilityName = "ready" | "busy" | "unavailable" | "unknown";

type Status = {
  open: boolean;
  services: {
    serviceKey: UniversityConsultationService;
    available?: boolean;
    video?: ZoomVideoConfig | null;
    status?: AvailabilityName;
  }[];
};

type ConsultationAvailabilityProps = {
  labels: Record<UniversityConsultationService, string>;
  descriptions: Record<UniversityConsultationService, string>;
  copy: Record<
    "ready" | "busy" | "unavailable" | "unknown" | "launch",
    string
  > &
    Partial<
      Record<"busyAction" | "unavailableAction" | "unknownAction", string>
    >;
};

export function ConsultationAvailability({
  labels,
  descriptions,
  copy,
}: ConsultationAvailabilityProps) {
  const { t } = useI18n();
  const [launchState, setLaunchState] = useState<"idle" | "starting" | "active" | "ended">("idle");
  const [launchError, setLaunchError] = useState(false);
  const [selected, setSelected] = useState<UniversityConsultationService | null>(null);
  const [intake, setIntake] = useState<ConsultationIntake>({ displayName: "", affiliation: "", topic: "" });
  const locked = useRef(false);
  const launch = async (serviceKey: UniversityConsultationService, values: ConsultationIntake) => {
    if (locked.current) return;
    locked.current = true;
    setLaunchError(false);
    setLaunchState("starting");
    setIntake(values);
    setSelected(null);
    try {
      const response = await fetch("/api/public/consultation-availability", { cache: "no-store" });
      if (!response.ok) throw new Error("UNAVAILABLE");
      const fresh: Status = await response.json();
      setStatus(fresh);
      const service = fresh.services.find(item => item.serviceKey === serviceKey);
      if (!fresh.open || !service?.available || !service.video) throw new Error("UNAVAILABLE");
      await startZoomVideo(service.video, () => {
        // A video end event does not mean the post-engagement survey is done.
        // Keep Zoom's UI and the launch lock until the user explicitly returns.
        setLaunchState("ended");
        setIntake({ displayName: "", affiliation: "", topic: "" });
      }, serviceKey, values);
      setLaunchState(current => current === "starting" ? "active" : current);
    } catch {
      locked.current = false;
      setLaunchState("idle");
      setLaunchError(true);
      setSelected(serviceKey);
    }
  };
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/public/consultation-availability", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (live) setStatus(data);
        })
        .catch(() => {
          if (live) setStatus(null);
        });
    load();
    const timer = window.setInterval(() => {
      if (!document.hidden) load();
    }, 15_000);
    const onVisibilityChange = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <div>
      {launchError && !selected && <Feedback tone="error" className="mt-5">{t.videoConsultation.failed}</Feedback>}
      {selected && <ConsultationIntakeDialog category={labels[selected]} initialValues={intake} launchError={launchError} onClose={() => setSelected(null)} onSubmit={values => void launch(selected, values)} />}
      {launchState !== "idle" && <p role="status" className="mt-5 text-sm">{t.videoConsultation[launchState]}</p>}
      {(launchState === "active" || launchState === "ended") && (
        <div>
        <p className="mt-2 text-sm text-fg-muted">{t.videoConsultation.returnHelp}</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-3 cursor-pointer text-sm font-bold text-primary underline underline-offset-4">
          {t.videoConsultation.reset}
        </button>
        </div>
      )}
    <div className="mt-7 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {(Object.keys(labels) as UniversityConsultationService[]).map(
        (serviceKey) => {
          const service = status?.services.find(
            (item) => item.serviceKey === serviceKey,
          );
          const availability: AvailabilityName =
            service?.status ??
            (status === null
              ? "unknown"
              : status.open && service?.available
                ? "ready"
                : "unavailable");
          const enabled = availability === "ready";
          const Illustration = consultationIllustrations[serviceKey];
          const statusClass =
            availability === "ready"
              ? "text-green-700 dark:text-green-300"
              : availability === "unknown"
                ? "text-amber-700 dark:text-amber-300"
                : "text-fg-muted";
          const dotClass =
            availability === "ready"
              ? "bg-green-600"
              : availability === "unknown"
                ? "bg-amber-500"
                : "bg-fg-muted";
          const buttonLabel = enabled
            ? copy.launch
            : availability === "busy"
              ? (copy.busyAction ?? copy.busy)
              : availability === "unavailable"
                ? (copy.unavailableAction ?? copy.unavailable)
                : (copy.unknownAction ?? copy.unknown);
          return (
            <article
              data-availability-status={availability}
              key={serviceKey}
              className="flex min-h-[29rem] flex-col border border-line bg-surface-raised"
            >
              <div className="flex min-h-52 items-center justify-center border-b border-primary-200 bg-primary-50 px-7 py-6 text-primary-700 dark:border-line dark:bg-surface-hover dark:text-primary-300">
                <Illustration />
              </div>
              <div className="flex flex-1 flex-col px-5 py-5">
                <div
                  className={`flex items-center gap-2 text-sm font-bold ${statusClass}`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 rounded-full ${dotClass}`}
                  />
                  {copy[availability]}
                </div>
                <h3 className="mt-3 text-xl font-bold">{labels[serviceKey]}</h3>
                <p className="mt-2 text-sm leading-6 text-fg-muted">
                  {descriptions[serviceKey]}
                </p>
                <button
                  type="button"
                  disabled={!enabled || launchState !== "idle"}
                  aria-busy={launchState === "starting"}
                  onClick={() => { setLaunchError(false); setSelected(serviceKey); }}
                  className={
                    enabled && launchState === "idle"
                      ? "mt-auto inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 font-bold text-white hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      : "mt-auto inline-flex min-h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-md border border-line bg-surface-selected px-4 py-3 font-bold text-fg-muted"
                  }
                >
                  <UniversityIcon name={enabled ? "video" : "clock"} />
                  {buttonLabel}
                </button>
              </div>
            </article>
          );
        },
      )}
    </div>
    </div>
  );
}
