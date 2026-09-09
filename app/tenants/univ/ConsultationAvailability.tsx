"use client";

import { useEffect, useState } from "react";
import { UniversityIcon } from "./icons/UniversityIcon";
import { consultationIllustrations } from "./icons/ConsultationIllustrations";
import type { UniversityConsultationService } from "@/lib/online-consultation-settings";

type AvailabilityName = "ready" | "busy" | "unavailable" | "unknown";

type Status = {
  open: boolean;
  services: {
    serviceKey: UniversityConsultationService;
    available?: boolean;
    status?: AvailabilityName;
  }[];
};

type ConsultationAvailabilityProps = {
  labels: Record<UniversityConsultationService, string>;
  descriptions: Record<UniversityConsultationService, string>;
  previewState: string;
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
  previewState,
  copy,
}: ConsultationAvailabilityProps) {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    if (
      process.env.NODE_ENV === "development" &&
      previewState.startsWith("now-")
    )
      return;
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
  }, [previewState]);

  return (
    <div className="mt-7 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {(Object.keys(labels) as UniversityConsultationService[]).map(
        (serviceKey) => {
          const previewStatus: AvailabilityName | null =
            process.env.NODE_ENV === "development"
              ? previewState === "now-stale"
                ? "unknown"
                : previewState === "now-mixed" &&
                    serviceKey === "student-support"
                  ? "busy"
                  : previewState === "now-open" || previewState === "now-mixed"
                    ? "ready"
                    : null
              : null;
          const service = status?.services.find(
            (item) => item.serviceKey === serviceKey,
          );
          const availability: AvailabilityName =
            previewStatus ??
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
                  disabled={!enabled}
                  className={
                    enabled
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
  );
}
