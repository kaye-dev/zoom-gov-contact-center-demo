"use client";

import { useEffect, useState } from "react";
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

function Illustration({
  serviceKey,
}: {
  serviceKey: UniversityConsultationService;
}) {
  const drawing = {
    admissions: (
      <>
        <path d="M45 128h150M62 128V69l58-31 58 31v59M82 82h76M89 128V91h25v37M126 91h25v37" />
        <path d="M160 38h34v44h-34zM168 50h18M168 60h18M168 70h11" />
        <circle cx="120" cy="58" r="6" />
      </>
    ),
    "student-support": (
      <>
        <path d="M38 63c24-5 49 1 72 18v54c-23-17-48-23-72-18V63ZM202 63c-24-5-49 1-72 18v54c23-17 48-23 72-18V63Z" />
        <path d="M110 81c7 4 13 10 20 18M72 53l13-20 13 20M79 42h12M158 49a16 16 0 1 1 32 0c0 12-16 25-16 25s-16-13-16-25Z" />
        <circle cx="174" cy="49" r="5" />
      </>
    ),
    careers: (
      <>
        <rect x="48" y="65" width="144" height="72" rx="8" />
        <path d="M92 65V50c0-7 5-12 12-12h32c7 0 12 5 12 12v15M48 91c31 18 113 18 144 0M108 95h24v16h-24z" />
        <path d="M79 39 67 27M161 39l12-12M120 28V13" />
      </>
    ),
  }[serviceKey];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 240 160"
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-36 w-full"
    >
      {drawing}
    </svg>
  );
}

function ButtonIcon({ name }: { name: "video" | "phone" | "clock" }) {
  const drawing =
    name === "video" ? (
      <>
        <rect x="3.5" y="6" width="12" height="12" rx="2" />
        <path d="m15.5 10 5-3v10l-5-3" />
      </>
    ) : name === "phone" ? (
      <path d="M7 3.5h3l1.3 4-2 1.6a15 15 0 0 0 5.6 5.6l1.6-2 4 1.3v3c0 2-1.5 3.5-3.5 3.5A13.5 13.5 0 0 1 3.5 7C3.5 5 5 3.5 7 3.5Z" />
    ) : (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3 2" />
      </>
    );
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      {drawing}
    </svg>
  );
}

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
                <Illustration serviceKey={serviceKey} />
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
                  <ButtonIcon
                    name={
                      enabled
                        ? "video"
                        : availability === "busy"
                          ? "phone"
                          : "clock"
                    }
                  />
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
