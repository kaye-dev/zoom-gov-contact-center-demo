"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import {
  MAINTENANCE_SETTINGS_CONFLICT_CODE,
  MAINTENANCE_UPDATE_ERROR_CODES,
  isValidMaintenanceRevision,
  resolveMaintenanceEffectiveState,
  utcIsoToJstDateTimeLocal,
  validMaintenanceReadResult,
  type MaintenanceConfig,
  type MaintenanceEffectiveState,
  type MaintenanceEnvironment,
  type MaintenanceMode,
  type MaintenanceUpdateInput,
} from "@/lib/maintenance-config";
import {
  isSettingsErrorCode,
  type SettingsErrorCode,
} from "@/lib/site-settings";

import { useI18n } from "../../i18n/LanguageProvider";

type MaintenanceSettingsFormProps = {
  environment: MaintenanceEnvironment;
  initialConfig: MaintenanceConfig | null;
  initialEffective: MaintenanceEffectiveState | null;
  initialRevision: number | null;
};

type Feedback =
  | { kind: "success" }
  | {
      kind: "error";
      code?: SettingsErrorCode;
      message?: string;
      scheduleError?: ScheduleValidationError;
    };

type ScheduleValidationError = "required" | "order" | "endFuture";

type MaintenanceSettingsResponse = {
  config?: MaintenanceConfig;
  environment?: MaintenanceEnvironment;
  key?: string;
  effective?: MaintenanceEffectiveState;
  revision?: number;
  error?: unknown;
};

const MODE_OPTIONS: MaintenanceMode[] = [
  "DISABLED",
  "ENABLED",
  "SCHEDULED",
];
export const MAX_EFFECTIVE_STATE_TIMER_DELAY_MS = 2_147_483_647;

export function MaintenanceSettingsForm({
  environment,
  initialConfig,
  initialEffective,
  initialRevision,
}: MaintenanceSettingsFormProps) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const canEdit =
    initialConfig !== null && isValidMaintenanceRevision(initialRevision);
  const [mode, setMode] = useState<MaintenanceMode | null>(
    canEdit ? initialConfig?.mode ?? null : null,
  );
  const [scheduledStartAtJst, setScheduledStartAtJst] = useState(
    toJstDateTimeLocal(initialConfig?.scheduledStartAt ?? null),
  );
  const [scheduledEndAtJst, setScheduledEndAtJst] = useState(
    toJstDateTimeLocal(initialConfig?.scheduledEndAt ?? null),
  );
  const [savedScheduledStartAtJst, setSavedScheduledStartAtJst] = useState(
    toJstDateTimeLocal(initialConfig?.scheduledStartAt ?? null),
  );
  const [savedScheduledEndAtJst, setSavedScheduledEndAtJst] = useState(
    toJstDateTimeLocal(initialConfig?.scheduledEndAt ?? null),
  );
  const [savedConfig, setSavedConfig] = useState(initialConfig);
  const [updatedAt, setUpdatedAt] = useState(initialConfig?.updatedAt ?? null);
  const [effective, setEffective] = useState(initialEffective);
  const [revision, setRevision] = useState(initialRevision);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const copy = t.admin.maintenanceManagement;
  const feedbackMessage = feedback
    ? feedback.kind === "success"
      ? `${t.admin.settings.saved} ${copy.propagationNote}`
      : feedback.message ??
        (feedback.code
          ? t.admin.settings.errors[feedback.code]
          : t.admin.settings.saveError)
    : null;
  const effectiveLabel = effective
    ? effective.active
      ? copy.effectiveActive
      : copy.effectiveInactive
    : copy.effectiveUnknown;
  const updatedAtLabel = formatJstDateTime(updatedAt, locale);
  const scheduleFieldErrors = getScheduleFieldErrors({
    error:
      feedback?.kind === "error" ? feedback.scheduleError : undefined,
    scheduledStartAtJst,
    scheduledEndAtJst,
  });

  useEffect(() => {
    if (savedConfig === null) return;

    let timerId: number | null = null;
    let cancelled = false;
    const refreshEffectiveState = () => {
      if (cancelled) return;

      const plan = createMaintenanceEffectiveRefreshPlan(
        savedConfig,
        new Date(),
      );
      setEffective(plan.effective);
      timerId =
        plan.refreshDelayMs === null
          ? null
          : window.setTimeout(refreshEffectiveState, plan.refreshDelayMs);
    };

    timerId = window.setTimeout(refreshEffectiveState, 0);

    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [savedConfig]);

  const updateMode = (nextMode: MaintenanceMode) => {
    setMode(nextMode);
    if (nextMode !== "SCHEDULED") {
      setScheduledStartAtJst(savedScheduledStartAtJst);
      setScheduledEndAtJst(savedScheduledEndAtJst);
    }
    setFeedback(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    if (!canEdit || mode === null || !isValidMaintenanceRevision(revision)) {
      return;
    }

    if (
      mode === "SCHEDULED" &&
      (!scheduledStartAtJst || !scheduledEndAtJst)
    ) {
      setFeedback({
        kind: "error",
        message: copy.scheduleRequired,
        scheduleError: "required",
      });
      return;
    }

    if (
      mode === "SCHEDULED" &&
      scheduledStartAtJst &&
      scheduledEndAtJst &&
      scheduledEndAtJst <= scheduledStartAtJst
    ) {
      setFeedback({
        kind: "error",
        message: copy.scheduleOrderError,
        scheduleError: "order",
      });
      return;
    }

    if (
      mode === "SCHEDULED" &&
      scheduledEndAtJst <=
        toJstDateTimeLocal(new Date().toISOString())
    ) {
      setFeedback({
        kind: "error",
        message: copy.scheduleEndFutureError,
        scheduleError: "endFuture",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/maintenance-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          createMaintenanceUpdateRequest({
            mode,
            scheduledStartAtJst,
            scheduledEndAtJst,
            savedScheduledStartAtJst,
            savedScheduledEndAtJst,
            expectedRevision: revision,
          }),
        ),
      });
      const body = (await response.json().catch(() => null)) as
        | MaintenanceSettingsResponse
        | null;

      if (isMaintenanceSettingsConflict(response.status, body?.error)) {
        setFeedback({ kind: "error", message: copy.conflictError });
        return;
      }

      if (
        !response.ok ||
        !body?.config ||
        !body.effective ||
        !isValidMaintenanceRevision(body.revision)
      ) {
        const maintenanceErrorMessage =
          body?.error === MAINTENANCE_UPDATE_ERROR_CODES.scheduleRequired
            ? copy.scheduleRequired
            : body?.error ===
                MAINTENANCE_UPDATE_ERROR_CODES.scheduleMustEndInFuture
              ? copy.scheduleEndFutureError
              : body?.error ===
                  MAINTENANCE_UPDATE_ERROR_CODES.invalidSchedule
                ? copy.scheduleOrderError
                : undefined;
        const scheduleError =
          body?.error === MAINTENANCE_UPDATE_ERROR_CODES.scheduleRequired
            ? "required"
            : body?.error ===
                MAINTENANCE_UPDATE_ERROR_CODES.scheduleMustEndInFuture
              ? "endFuture"
              : body?.error ===
                  MAINTENANCE_UPDATE_ERROR_CODES.invalidSchedule
                ? "order"
                : undefined;
        setFeedback({
          kind: "error",
          code: isSettingsErrorCode(body?.error) ? body.error : undefined,
          message: maintenanceErrorMessage,
          scheduleError,
        });
        return;
      }

      setMode(body.config.mode);
      const savedStartAtJst = toJstDateTimeLocal(
        body.config.scheduledStartAt,
      );
      const savedEndAtJst = toJstDateTimeLocal(
        body.config.scheduledEndAt,
      );
      setScheduledStartAtJst(savedStartAtJst);
      setScheduledEndAtJst(savedEndAtJst);
      setSavedScheduledStartAtJst(savedStartAtJst);
      setSavedScheduledEndAtJst(savedEndAtJst);
      setSavedConfig(body.config);
      setUpdatedAt(body.config.updatedAt);
      setEffective(body.effective);
      setRevision(body.revision);
      setFeedback({ kind: "success" });
      router.refresh();
    } catch {
      setFeedback({ kind: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl space-y-2">
          <h1 className="text-2xl font-bold">{copy.title}</h1>
          <p className="text-sm leading-6 text-fg-muted">
            {copy.description}
          </p>
        </div>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-sm font-bold ${environmentBadgeClass(environment)}`}
        >
          {copy.environmentLabel}: {copy.environments[environment]}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-raised p-4 shadow-sm">
        <h2 className="font-bold">{copy.effectiveStateTitle}</h2>
        <p
          role="status"
          aria-live="polite"
          className={`rounded-full px-3 py-1 text-sm font-bold ${effectiveStateClass(effective?.active ?? null)}`}
        >
          {effectiveLabel}
        </p>
      </div>

      {!canEdit ? (
        <div
          role="alert"
          className="space-y-1 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
        >
          <h2 className="font-bold">{copy.currentValueUnavailableTitle}</h2>
          <p className="text-sm leading-6">
            {copy.currentValueUnavailableDescription}
          </p>
        </div>
      ) : null}

      <form onSubmit={submit} noValidate className="space-y-6">
        <fieldset
          disabled={!canEdit || isSubmitting}
          aria-describedby="maintenance-mode-description"
          className="space-y-4 rounded-lg border border-line bg-surface-raised p-5 shadow-sm disabled:opacity-70 md:p-6"
        >
          <legend className="px-2 text-lg font-bold">{copy.modeTitle}</legend>
          <p
            id="maintenance-mode-description"
            className="text-sm leading-6 text-fg-muted"
          >
            {copy.modeDescription}
          </p>
          <div className="grid gap-3 lg:grid-cols-3">
            {MODE_OPTIONS.map((option) => {
              const inputId = `maintenance-mode-${option.toLowerCase()}`;
              const descriptionId = `${inputId}-description`;
              const optionCopy =
                option === "DISABLED"
                  ? copy.modes.disabled
                  : option === "ENABLED"
                    ? copy.modes.enabled
                    : copy.modes.scheduled;
              const isSelected = mode === option;

              return (
                <label
                  key={option}
                  htmlFor={inputId}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors has-[:disabled]:cursor-not-allowed focus-within:ring-2 focus-within:ring-accent/40 ${
                    isSelected
                      ? "border-primary bg-primary-50 dark:bg-primary-950/40"
                      : "border-line bg-surface hover:bg-surface-hover"
                  }`}
                >
                  <input
                    id={inputId}
                    name="maintenanceMode"
                    type="radio"
                    value={option}
                    checked={isSelected}
                    onChange={() => updateMode(option)}
                    aria-describedby={`${descriptionId} maintenance-mode-description`}
                    className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
                  />
                  <span className="min-w-0 space-y-1">
                    <span className="block font-bold">{optionCopy.label}</span>
                    <span
                      id={descriptionId}
                      className="block text-sm leading-5 text-fg-muted"
                    >
                      {optionCopy.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset
          disabled={!canEdit || isSubmitting || mode !== "SCHEDULED"}
          aria-describedby="maintenance-schedule-description maintenance-time-zone-note"
          className="space-y-5 rounded-lg border border-line bg-surface-raised p-5 shadow-sm disabled:opacity-70 md:p-6"
        >
          <legend className="px-2 text-lg font-bold">
            {copy.scheduleTitle}
          </legend>
          <p
            id="maintenance-schedule-description"
            className="text-sm leading-6 text-fg-muted"
          >
            {copy.scheduleDescription}
          </p>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="maintenance-scheduled-start"
                className="block text-sm font-semibold"
              >
                {copy.scheduledStartLabel}
              </label>
              <input
                id="maintenance-scheduled-start"
                name="scheduledStartAtJst"
                type="datetime-local"
                step="any"
                value={scheduledStartAtJst}
                onChange={(event) => {
                  setScheduledStartAtJst(event.target.value);
                  setFeedback(null);
                }}
                required={mode === "SCHEDULED"}
                aria-invalid={scheduleFieldErrors.start}
                aria-describedby={`maintenance-time-zone-note${
                  scheduleFieldErrors.start
                    ? " maintenance-settings-feedback"
                    : ""
                }`}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="maintenance-scheduled-end"
                className="block text-sm font-semibold"
              >
                {copy.scheduledEndLabel}
              </label>
              <input
                id="maintenance-scheduled-end"
                name="scheduledEndAtJst"
                type="datetime-local"
                step="any"
                value={scheduledEndAtJst}
                onChange={(event) => {
                  setScheduledEndAtJst(event.target.value);
                  setFeedback(null);
                }}
                required={mode === "SCHEDULED"}
                aria-invalid={scheduleFieldErrors.end}
                aria-describedby={`maintenance-time-zone-note${
                  scheduleFieldErrors.end
                    ? " maintenance-settings-feedback"
                    : ""
                }`}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed"
              />
            </div>
          </div>
          <p
            id="maintenance-time-zone-note"
            className="text-xs leading-5 text-fg-muted"
          >
            {copy.timeZoneNote}
          </p>
        </fieldset>

        {mode !== null && mode !== "DISABLED" ? (
          <aside className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
            <h2 className="font-bold">{copy.warningTitle}</h2>
            <p className="text-sm leading-6">{copy.warningDescription}</p>
          </aside>
        ) : null}

        {feedback ? (
          <p
            id="maintenance-settings-feedback"
            role={feedback.kind === "error" ? "alert" : "status"}
            aria-live={feedback.kind === "error" ? "assertive" : "polite"}
            className={`rounded-md px-4 py-3 text-sm ${
              feedback.kind === "error"
                ? "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-200"
                : "bg-green-50 text-green-800 dark:bg-green-950/50 dark:text-green-200"
            }`}
          >
            {feedbackMessage}
          </p>
        ) : null}

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1 text-xs leading-5 text-fg-muted">
            <p>{copy.propagationNote}</p>
            {updatedAtLabel ? (
              <p>
                {copy.updatedAtLabel}: {updatedAtLabel}
              </p>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={!canEdit || isSubmitting}
            className="cursor-pointer rounded-md bg-primary px-5 py-2.5 font-semibold text-white transition-colors hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? t.admin.settings.saving : t.admin.settings.save}
          </button>
        </div>
      </form>
    </section>
  );
}

function toJstDateTimeLocal(value: string | null): string {
  if (!value) return "";
  return utcIsoToJstDateTimeLocal(value) ?? "";
}

export function createMaintenanceUpdateRequest({
  mode,
  scheduledStartAtJst,
  scheduledEndAtJst,
  savedScheduledStartAtJst,
  savedScheduledEndAtJst,
  expectedRevision,
}: {
  mode: MaintenanceMode;
  scheduledStartAtJst: string;
  scheduledEndAtJst: string;
  savedScheduledStartAtJst: string;
  savedScheduledEndAtJst: string;
  expectedRevision: number;
}): MaintenanceUpdateInput {
  return {
    mode,
    scheduledStartAtJst:
      (mode === "SCHEDULED"
        ? scheduledStartAtJst
        : savedScheduledStartAtJst) || null,
    scheduledEndAtJst:
      (mode === "SCHEDULED"
        ? scheduledEndAtJst
        : savedScheduledEndAtJst) || null,
    expectedRevision,
  };
}

export function isMaintenanceSettingsConflict(
  status: number,
  error: unknown,
): boolean {
  return (
    status === 409 && error === MAINTENANCE_SETTINGS_CONFLICT_CODE
  );
}

export function createMaintenanceEffectiveRefreshPlan(
  config: MaintenanceConfig,
  now: Date,
): {
  effective: MaintenanceEffectiveState;
  refreshDelayMs: number | null;
} {
  const effective = resolveMaintenanceEffectiveState(
    validMaintenanceReadResult(config),
    now,
  );
  const nowMs = now.getTime();

  if (config.mode !== "SCHEDULED" || !Number.isFinite(nowMs)) {
    return { effective, refreshDelayMs: null };
  }

  const startMs = Date.parse(config.scheduledStartAt!);
  const endMs = Date.parse(config.scheduledEndAt!);
  const nextBoundaryMs =
    nowMs < startMs ? startMs : nowMs < endMs ? endMs : null;
  if (nextBoundaryMs === null) {
    return { effective, refreshDelayMs: null };
  }

  return {
    effective,
    refreshDelayMs: Math.min(
      Math.max(nextBoundaryMs - nowMs, 1),
      MAX_EFFECTIVE_STATE_TIMER_DELAY_MS,
    ),
  };
}

export function getScheduleFieldErrors({
  error,
  scheduledStartAtJst,
  scheduledEndAtJst,
}: {
  error: ScheduleValidationError | undefined;
  scheduledStartAtJst: string;
  scheduledEndAtJst: string;
}): { start: boolean; end: boolean } {
  if (error === "required") {
    return {
      start: scheduledStartAtJst.length === 0,
      end: scheduledEndAtJst.length === 0,
    };
  }

  return {
    start: false,
    end: error === "order" || error === "endFuture",
  };
}

function formatJstDateTime(value: string | null, locale: string): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(date);
}

function environmentBadgeClass(environment: MaintenanceEnvironment): string {
  if (environment === "production") {
    return "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200";
  }

  if (environment === "preview") {
    return "border-primary-300 bg-primary-50 text-primary-1100 dark:border-primary-800 dark:bg-primary-950/50 dark:text-primary-100";
  }

  return "border-line bg-surface-hover text-fg";
}

function effectiveStateClass(active: boolean | null): string {
  if (active === true) {
    return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100";
  }

  if (active === false) {
    return "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100";
  }

  return "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100";
}
