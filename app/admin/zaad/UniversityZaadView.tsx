"use client";
import { Checkbox } from "@/app/components/Checkbox";

import Link from "next/link";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { TableRowActions } from "@/app/components/admin/TableRowActions";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { AdminFieldHelp } from "@/app/components/admin/AdminFieldHelp";
import { Select } from "@/app/components/Select";
import { CASES, recipientsFor } from "@/lib/zaad/university/demo";
import {
  PURPOSE_DEPARTMENT,
  parseConfig,
  classify,
  staffSummary,
  groupSummary,
  type Template,
  type Outcome,
  type Config,
  type Purpose,
} from "@/lib/zaad/university/contracts";
import {
  registrationInputClass as input,
  outreachPrimary as primary,
  outreachSecondary as secondary,
} from "@/app/notifications/register/StudentNotificationRegistration";
import type { results as serverResults } from "@/lib/server/zaad/university/service";
import {
  universityRequest,
  universityMutation,
  UniversityApiError,
} from "./university-client";
import { UniversityStudentRegistry } from "./UniversityStudentRegistry";

type Jsonify<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;
type Run = Jsonify<Awaited<ReturnType<typeof serverResults>>>;
type ResultRow = Run["rows"][number];
type Task = NonNullable<ResultRow["task"]>;
type Candidate = Outcome & { version?: number };
type Stage =
  | "templates"
  | "targets"
  | "content"
  | "review"
  | "results"
  | "case"
  | "complete"
  | "inbound"
  | "registrations"
  | "metrics";
type Permissions = { create: boolean; update: boolean; delete: boolean };
type History = {
  id: string;
  purpose: Purpose;
  mode: string;
  status: string;
  version: number;
};
const defaults = (template: Template) =>
  Object.fromEntries(template.fields.map(([key, , value]) => [key, value]));

export function UniversityZaadView({
  permissions: actualPermissions,
  departments,
  allowedTenants,
  years,
  serverDate,
  reviewState,
  reviewPurpose,
  embedded = false,
}: {
  embedded?: boolean;
  reviewState?: string;
  reviewPurpose?: string;
  permissions: Permissions;
  departments: string[];
  allowedTenants: ("lg" | "univ")[];
  years: number[];
  serverDate: string;
}) {
  const { t } = useI18n(),
    c = t.universityOutreach,
    a = c.admin;
  const router = useRouter();
  const urlParams = useSearchParams();
  const permissions =
    reviewState === "readonly"
      ? { create: false, update: false, delete: false }
      : actualPermissions;
  const available = CASES.filter((item) =>
    departments.includes(PURPOSE_DEPARTMENT[item.id]),
  );
  const [chosen, setChosen] = useState(
    available.find((item) => item.id === reviewPurpose) ??
      available.find((item) => item.id === "scholarship") ??
      available[0] ??
      CASES[1],
  );
  const initialStage: Stage = [
    "targets",
    "content",
    "review",
    "results",
    "case",
    "complete",
    "inbound",
    "registrations",
    "metrics",
  ].includes(reviewState ?? "")
    ? (reviewState as Stage)
    : reviewState === "readonly"
      ? "results"
      : reviewState === "error"
        ? "review"
        : ["registration-add", "registration-review"].includes(
              reviewState ?? "",
            )
          ? "registrations"
          : "templates";
  const previewRun =
    reviewState &&
    ["results", "case", "complete", "readonly"].includes(reviewState)
      ? createReviewRun(chosen)
      : null;
  const [stage, setStage] = useState<Stage>(initialStage),
    [config, setConfig] = useState<Config>(() => defaults(chosen));
  const [candidateCursor, setCandidateCursor] = useState<string | null>(null);
  const [candidateTotal, setCandidateTotal] = useState<number | null>(null);
  const [trigger, setTrigger] = useState(chosen.mode);
  const [candidates, setCandidates] = useState<Candidate[]>(
      reviewState ? recipientsFor(chosen.id) : [],
    ),
    [selected, setSelected] = useState<string[]>(
      reviewState
        ? recipientsFor(chosen.id)
            .filter((r) => r.eligible)
            .map((r) => r.id)
        : [],
    ),
    [confirmed, setConfirmed] = useState<string[]>([]),
    [notified, setNotified] = useState<string[]>([]);
  const [run, setRun] = useState<Run | null>(previewRun),
    [history, setHistory] = useState<History[]>([]),
    [activeRow, setActiveRow] = useState<ResultRow | null>(
      initialStage === "case"
        ? (previewRun?.rows.find((r) => r.answers.consultation) ??
            previewRun?.rows[0] ??
            null)
        : null,
    );
  const [filter, setFilter] = useState("all"),
    [executeConfirmed, setExecuteConfirmed] = useState(false),
    [error, setError] = useState<string | null>(
      reviewState === "error" ? "RESULT_UNKNOWN" : null,
    ),
    [feedback, setFeedback] = useState(false),
    [pending, setPending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<History | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const lock = useRef(false),
    operationKey = useRef<string | null>(null),
    executeKey = useRef<string | null>(null),
    prepared = useRef<{ id: string; version: number } | null>(null),
    title = useRef<HTMLHeadingElement>(null);
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>(
    [],
  );
  useEffect(() => {
    let active = true;
    universityRequest<{ rows: History[] }>("batches")
      .then((page) => {
        if (active) setHistory(page.rows);
      })
      .catch(() => {
        if (active) setError("SERVICE_UNAVAILABLE");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (stage !== "templates") title.current?.focus();
  }, [stage]);
  async function work(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    setFeedback(false);
    try {
      await action();
    } catch (error) {
      setError(
        error instanceof UniversityApiError ? error.code : "INVALID_REQUEST",
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  function go(next: Stage) {
    setStage(next);
    if (embedded) { const params = new URLSearchParams(urlParams.toString()); params.set("stage", next); params.set("case", chosen.id); router.push(`/admin/zaad?${params}`, { scroll: false }); }
    setError(null);
    setFeedback(false);
  }
  async function choose(item: Template) {
    await work(async () => {
      const page = await universityRequest<{
        rows: Candidate[];
        nextCursor: string | null;
        total: number;
      }>(`contacts?purpose=${item.id}&mode=DEMO`);
      setChosen(item);
      setTrigger(item.mode);
      setConfig(defaults(item));
      setCandidates(page.rows);
      setCandidateCursor(page.nextCursor);
      setCandidateTotal(page.total);
      setSelected(
        page.rows
          .filter(
            (r) =>
              r.eligible &&
              r.selectedByStaff &&
              (item.mode === "direct" || r.notified),
          )
          .map((r) => r.id),
      );
      setConfirmed([]);
      setNotified([]);
      setRun(null);
      setActiveRow(null);
      prepared.current = null;
      operationKey.current = null;
      executeKey.current = null;
      setExecuteConfirmed(false);
      go("targets");
    });
  }
  async function loadRun(id: string) {
    await work(async () => {
      const loaded = await universityRequest<Run>(`batches/${id}/results`);
      setRun(loaded);
      setChosen(CASES.find((item) => item.id === loaded.templateId)!);
      setConfig(loaded.config);
      setSelected(loaded.rows.map((row) => row.id));
      setCandidates(loaded.rows);
      prepared.current =
        loaded.status === "PREPARED"
          ? { id: loaded.id, version: loaded.version }
          : null;
      executeKey.current = null;
      setExecuteConfirmed(false);
      go(loaded.status === "PREPARED" ? "review" : "results");
    });
  }
  async function openCase(row: ResultRow) {
    await work(async () => {
      const users = await universityRequest<{ id: string; name: string }[]>(
        `assignees?department=${PURPOSE_DEPARTMENT[chosen.id]}`,
      );
      setAssignees(users);
      setActiveRow(row);
      go("case");
    });
  }
  async function execute() {
    if (
      (!prepared.current && !permissions.create) ||
      !permissions.update ||
      !executeConfirmed
    )
      return;
    await work(async () => {
      const preflight = {
        purpose: chosen.id,
        mode: "DEMO",
        trigger,
        config,
        targetIds: selected,
        confirmedTargetIds: confirmed.filter((id) => selected.includes(id)),
        notifiedTargetIds: notified.filter((id) => selected.includes(id)),
      };
      if (!prepared.current) {
        const check = await universityMutation<{ preflightHash: string }>(
          "batches/preflight",
          preflight,
        );
        operationKey.current ??= crypto.randomUUID();
        prepared.current = await universityMutation<{
          id: string;
          version: number;
        }>("batches", {
          preflight,
          preflightHash: check.preflightHash,
          operationKey: operationKey.current,
        });
      }
      executeKey.current ??= crypto.randomUUID();
      const next = await universityMutation<Run>(
        `batches/${prepared.current.id}/execute`,
        {
          version: prepared.current.version,
          operationKey: executeKey.current,
          confirmed: true,
        },
      );
      setRun(next);
      setHistory((old) => [
        {
          id: next.id,
          purpose: next.templateId as Purpose,
          mode: next.mode,
          status: next.status,
          version: next.version,
        },
        ...old.filter((row) => row.id !== next.id),
      ]);
      go("results");
    });
  }
  const changeConfig = (key: string, value: string) => {
    setConfig((old) => ({ ...old, [key]: value }));
    prepared.current = null;
    operationKey.current = null;
    executeKey.current = null;
    setExecuteConfirmed(false);
  };
  const canSelect = (row: Candidate) =>
    row.eligible &&
    (row.selectedByStaff || confirmed.includes(row.id)) &&
    (trigger === "direct" || row.notified || notified.includes(row.id));
  const stepLabels = [
      a.targetsStep,
      a.contentStep,
      a.executeStep,
      a.resultsStep,
      a.cases,
      a.completeStep,
    ],
    stepKeys = ["targets", "content", "review", "results", "case", "complete"];
  const nav: [Stage, string][] = [
    ["templates", a.templates],
    ["results", a.results],
    ["case", a.cases],
    ["inbound", a.inbound],
    ["registrations", a.registrations],
    ["metrics", a.metrics],
  ];
  const statusLabels: Record<string, string> = {
    OPEN: a.caseOpen,
    IN_PROGRESS: a.caseInProgress,
    RESOLVED: a.resolved,
    CLOSED_UNREACHED: a.closedUnreached,
  };
  const callLabels: Record<string, string> = {
    HUMAN: a.callHuman,
    VOICEMAIL: a.callVoicemail,
    NO_ANSWER: a.callNoAnswer,
    BUSY: a.callBusy,
    FAILED: a.callFailed,
    UNKNOWN: a.callUnknown,
    NOT_CALLED: a.callNotCalled,
    QUEUED: a.callQueued,
  };
  const display = (value: unknown, key?: string) =>
    displayAnswer(value, c, key);
  const filtered =
    run?.rows.filter(
      (row) =>
        filter === "all" ||
        (filter === "resolved" && row.task?.status === "RESOLVED") ||
        (filter === "inprogress" && row.task?.status === "IN_PROGRESS") ||
        (["consultation", "resend", "support"].includes(filter) &&
          row.confirmed &&
          row.recognized &&
          row.answers[filter] === true) ||
        row.result === filter,
    ) ?? [];
  const summary = run?.summary;
  return (
    <div data-zaad-state={stage} data-zaad-case={chosen.id} data-tenant="univ">
      {!embedded && <div
        data-admin-page-header
        className="ml-1 flex flex-col gap-4 md:flex-row md:items-start md:justify-between"
      >
        <h1 className="text-3xl font-bold">{c.brand}</h1>
        <div className="flex w-full min-w-0 items-center gap-3 md:ml-auto md:w-auto">
          <div className="flex shrink-0 items-center gap-1">
            <label htmlFor="tenant" className="text-sm font-semibold">
              {t.admin.industrySettings.label}
            </label>
            <AdminFieldHelp
              id="tenant-help"
              label={t.admin.industrySettings.label}
              description={t.admin.industrySettings.help}
            />
          </div>
          <Select
            id="tenant"
            aria-describedby="tenant-help"
            value="univ"
            disabled={pending}
            containerClassName="min-w-0 flex-1 md:w-64 md:flex-none"
            onChange={(e) => {
              if (allowedTenants.includes(e.target.value as "lg" | "univ"))
                router.push(`/admin/zaad?tenant=${e.target.value}`);
            }}
          >
            {allowedTenants.map((key) => (
              <option key={key} value={key}>
                {t.admin.industrySettings.names[key]}
              </option>
            ))}
          </Select>
        </div>
      </div>}
      <div className="mt-5 rounded-md border border-line bg-surface-raised px-4 py-3 text-sm">
        {a.demo} {!permissions.update && a.readonly}
      </div>
      <nav
        aria-label={a.navigation}
        className="-mx-4 mt-5 flex gap-7 overflow-x-auto border-b border-line px-4 md:-mx-6 md:px-6"
      >
        {nav
          .filter(
            ([key]) =>
              key !== "registrations" ||
              departments.includes("student-affairs"),
          )
          .filter(
            ([key]) => key !== "inbound" || departments.includes("facilities"),
          )
          .map(([key, label]) => (
            <button
              key={key}
              data-stage={key}
              disabled={pending}
              onClick={() => {
                if (key === "case" && run?.rows[0])
                  void openCase(
                    run.rows.find((r) => r.task?.status !== "RESOLVED") ??
                      run.rows[0],
                  );
                else go(key);
              }}
              aria-current={stage === key ? "page" : undefined}
              className={`shrink-0 cursor-pointer border-b-2 pb-3 text-sm font-semibold disabled:cursor-not-allowed aria-disabled:cursor-not-allowed ${stage === key ? "border-primary text-primary dark:text-accent" : "border-transparent text-fg-muted"}`}
            >
              {label}
            </button>
          ))}
      </nav>
      {deleteTarget && (
        <ModalDialog
          title={a.deleteDraft}
          description={a.deleteConfirm}
          locked={pending}
          onRequestClose={() => setDeleteTarget(null)}
        >
          <div className="flex justify-end gap-3">
            <button
              className={secondary}
              disabled={pending}
              onClick={() => setDeleteTarget(null)}
            >
              {c.cancel}
            </button>
            <button
              className={primary}
              disabled={pending}
              onClick={() =>
                void work(async () => {
                  await universityMutation(
                    `batches/${deleteTarget.id}`,
                    { version: deleteTarget.version },
                    "DELETE",
                  );
                  setHistory((old) =>
                    old.filter((item) => item.id !== deleteTarget.id),
                  );
                  setDeleteTarget(null);
                  setFeedback(true);
                })
              }
            >
              {a.deleteDraft}
            </button>
          </div>
        </ModalDialog>
      )}
      <div className="ml-1 mt-6 max-w-6xl space-y-6" aria-busy={pending}>
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error === "PROVIDER_NOT_CONFIGURED"
              ? a.liveDisabled
              : error === "RESULT_UNKNOWN"
                ? a.resultUnknownNotice
                : c.unavailable}
          </p>
        )}
        {feedback && (
          <p role="status" className="text-sm text-accent">
            {c.saved}
          </p>
        )}
        {!["templates", "inbound", "metrics", "registrations"].includes(
          stage,
        ) && (
          <>
            <div>
              <h2 ref={title} tabIndex={-1} className="text-xl font-bold">
                {c.templateText[chosen.name]}
              </h2>
              <p className="mt-1 text-sm text-fg-muted">
                {c.templateText[chosen.department]}
              </p>
            </div>
            <ol
              aria-label={a.flow}
              className="flex flex-wrap gap-x-5 gap-y-2 border-b border-line pb-4 text-sm"
            >
              {stepLabels.map((label, i) => (
                <li
                  key={label}
                  aria-current={stage === stepKeys[i] ? "step" : undefined}
                  className={
                    stage === stepKeys[i]
                      ? "font-bold text-accent"
                      : "text-fg-muted"
                  }
                >
                  {i + 1}. {label}
                </li>
              ))}
            </ol>
          </>
        )}
        {stage === "templates" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold">{a.start}</h2>
              <p className="mt-2 text-sm leading-6 text-fg-muted">{a.lead}</p>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              {available.map((item) => (
                <button
                  key={item.id}
                  data-case={item.id}
                  disabled={pending}
                  onClick={() => void choose(item)}
                  className="group flex min-w-0 cursor-pointer gap-4 rounded-lg border border-line p-5 text-left hover:border-accent hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed aria-disabled:cursor-not-allowed"
                >
                  <span className="text-sm font-bold text-fg-muted">
                    {item.number}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold">
                      {c.templateText[item.name]}
                    </span>
                    <span className="mt-1 block text-xs font-semibold text-accent">
                      {c.templateText[item.department]} ·{" "}
                      {item.mode === "direct" ? a.direct : a.followup}
                    </span>
                    <span className="mt-2 block text-sm leading-6 text-fg-muted">
                      {c.templateText[item.purpose]}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {!available.length && <p role="alert">{a.noGrant}</p>}
          </div>
        )}
        {stage === "targets" && (
          <div className="space-y-5">
            <p className="text-sm leading-6">
              {a.audience}：{c.templateText[chosen.audience]}
              <br />
              <span className="text-fg-muted">
                {a.trigger}：{c.templateText[chosen.trigger]}
              </span>
            </p>
            {chosen.id === "group" && (
              <label className="block text-sm font-semibold">
                {a.trigger}
                <Select
                  containerClassName="mt-2"
                  value={trigger}
                  disabled={pending || !permissions.create}
                  onChange={(e) => {
                    setTrigger(e.target.value);
                    setSelected([]);
                    prepared.current = null;
                    operationKey.current = null;
                  }}
                >
                  <option value="follow-up">{a.followup}</option>
                  <option value="direct">{a.direct}</option>
                </Select>
              </label>
            )}
            {candidateCursor && (
              <button
                disabled={pending}
                className={secondary}
                onClick={() =>
                  void work(async () => {
                    const page = await universityRequest<{
                      rows: Candidate[];
                      nextCursor: string | null;
                      total: number;
                    }>(
                      `contacts?purpose=${chosen.id}&mode=DEMO&cursor=${encodeURIComponent(candidateCursor)}`,
                    );
                    setCandidates((old) => [...old, ...page.rows]);
                    setCandidateCursor(page.nextCursor);
                    setCandidateTotal(page.total);
                  })
                }
              >
                {c.next}
              </button>
            )}
            <Facts
              items={[
                [a.candidates, candidateTotal ?? candidates.length],
                [a.selected, selected.length],
                [a.excluded, candidates.filter((r) => !canSelect(r)).length],
                [a.department, c.templateText[chosen.department]],
              ]}
            />
            <Table
              headers={[
                a.select,
                a.registrations,
                a.priorNotice,
                a.eligibility,
              ]}
              rows={candidates.map((row) => [
                <Checkbox
                  key={row.id}
                  data-recipient={row.id}
                  aria-label={`${a.select}: ${row.name}`}
                  disabled={pending || !permissions.create || !canSelect(row)}
                  checked={selected.includes(row.id)}
                  onChange={(e) => {
                    setSelected((old) =>
                      e.target.checked
                        ? [...new Set([...old, row.id])]
                        : old.filter((id) => id !== row.id),
                    );
                    prepared.current = null;
                    operationKey.current = null;
                  }}
                />,
                <>
                  {row.name}
                  <br />
                  <span className="text-xs text-fg-muted">
                    {row.maskedContact}
                  </span>
                </>,
                trigger === "direct" ? (
                  a.direct
                ) : row.notified || notified.includes(row.id) ? (
                  row.priorNoticeAt || a.confirmNotice
                ) : (
                  <button
                    disabled={pending || !permissions.create || !row.eligible}
                    className="cursor-pointer text-accent underline disabled:cursor-not-allowed"
                    onClick={() =>
                      setNotified((old) => [...new Set([...old, row.id])])
                    }
                  >
                    {a.confirmNotice}
                  </button>
                ),
                !row.eligible ? (
                  row.version ? (
                    a.unverifiedContact
                  ) : (
                    row.exclusionReason
                  )
                ) : row.selectedByStaff || confirmed.includes(row.id) ? (
                  a.confirmedEligibility
                ) : (
                  <button
                    disabled={pending || !permissions.create}
                    className="cursor-pointer text-accent underline disabled:cursor-not-allowed"
                    onClick={() =>
                      setConfirmed((old) => [...new Set([...old, row.id])])
                    }
                  >
                    {a.confirmEligibility}
                  </button>
                ),
              ])}
            />
            <p className="text-sm text-fg-muted">{a.targetsNote}</p>
            <div className="flex flex-wrap gap-3">
              <button
                id="back-templates"
                className={secondary}
                disabled={pending}
                onClick={() => go("templates")}
              >
                {a.chooseAgain}
              </button>
              <button
                id="to-content"
                className={primary}
                disabled={pending || !permissions.create || !selected.length}
                onClick={() => go("content")}
              >
                {a.contentAction}
              </button>
            </div>
          </div>
        )}
        {stage === "content" && (
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                parseConfig(chosen.id, config);
                setExecuteConfirmed(false);
                go("review");
              } catch {
                setError("INVALID_REQUEST");
              }
            }}
          >
            <div className="grid gap-5 md:grid-cols-2">
              {chosen.fields.map(([key, label, , type]) => (
                <label
                  key={key}
                  className="block text-sm font-semibold"
                  htmlFor={`config-${key}`}
                >
                  {c.templateText[label]}
                  <input
                    id={`config-${key}`}
                    required
                    type={type ?? "text"}
                    min={type === "number" ? 1 : undefined}
                    max={type === "number" ? 9999 : undefined}
                    maxLength={2000}
                    disabled={pending || !permissions.create}
                    className={input}
                    value={config[key] ?? ""}
                    onChange={(e) => changeConfig(key, e.target.value)}
                  />
                </label>
              ))}
            </div>
            <div>
              <h3 className="font-bold">{a.questions}</h3>
              <p className="mt-2 text-sm text-fg-muted">{a.identityNote}</p>
              <ol className="mt-4 space-y-4">
                {chosen.questions.map(([key, label, options], i) => (
                  <li key={key} className="border-l-2 border-line pl-4">
                    <p className="text-sm font-semibold">
                      {i + 1}. {c.templateText[label]}
                    </p>
                    <p className="mt-1 text-sm text-fg-muted">
                      {a.answerFields}：{c.templateText[options]}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-lg border border-line bg-surface-raised p-4">
              <h3 className="font-semibold">{a.voicemailTitle}</h3>
              <p id="voicemail-script" className="mt-2 text-sm leading-6">
                {a.voicemail}
              </p>
              <p className="mt-2 text-xs text-fg-muted">{a.voicemailNote}</p>
            </div>
            <p className="text-sm leading-6">
              <strong>{a.completion}：</strong>
              {c.templateText[chosen.completion]}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                id="back-targets"
                className={secondary}
                disabled={pending}
                onClick={() => go("targets")}
              >
                {a.targetsStep}
              </button>
              <button
                id="to-review"
                className={primary}
                disabled={pending || !permissions.create}
              >
                {a.beforeExecute}
              </button>
            </div>
          </form>
        )}
        {stage === "review" && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold">{a.executeTitle}</h3>
            <Facts
              items={[
                [a.selected, selected.length],
                [a.templates, c.templateText[chosen.name]],
                [a.department, c.templateText[chosen.department]],
                [a.executeStep, "DEMO"],
              ]}
            />
            <p className="text-sm leading-6">{a.executeNote}</p>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                id="execute-confirm"
                checked={executeConfirmed}
                disabled={pending || !permissions.update}
                onChange={(e) => setExecuteConfirmed(e.target.checked)}
              />
              {a.executeConfirm}
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                id="back-content"
                className={secondary}
                disabled={pending}
                onClick={() => {
                  prepared.current = null;
                  operationKey.current = null;
                  go("content");
                }}
              >
                {c.cancel}
              </button>
              <button
                id="execute"
                className={primary}
                disabled={
                  pending ||
                  (run?.status !== "PREPARED" && !permissions.create) ||
                  !permissions.update ||
                  !executeConfirmed ||
                  error === "RESULT_UNKNOWN"
                }
                onClick={() => void execute()}
              >
                {pending ? c.saving : a.execute}
              </button>
            </div>
          </div>
        )}
        {(stage === "results" || (stage === "case" && !activeRow)) && (
          <div className="space-y-6">
            {!run || !summary ? (
              <>
                <p className="text-sm">{c.empty}</p>
                <h3 className="font-bold">{a.history}</h3>
                <Table
                  headers={[a.templates, c.status, c.details]}
                  rows={history.map((item) => [
                    c.templateText[
                      CASES.find((t) => t.id === item.purpose)?.name ?? ""
                    ] ?? item.purpose,
                    item.status === "COMPLETED"
                      ? a.completed
                      : item.status === "PREPARED"
                        ? a.prepared
                        : a.callUnknown,
                    <TableRowActions
                      key={item.id}
                      label={c.details}
                      open={menuId === item.id}
                      onOpenChange={(open) => setMenuId(open ? item.id : null)}
                      items={[
                        {
                          id: "details",
                          label: c.details,
                          disabled: pending,
                          onSelect: () => void loadRun(item.id),
                        },
                        ...(item.status === "PREPARED" && permissions.delete
                          ? [
                              {
                                id: "delete",
                                label: a.deleteDraft,
                                tone: "danger" as const,
                                disabled: pending,
                                onSelect: () => setDeleteTarget(item),
                              },
                            ]
                          : []),
                      ]}
                    />,
                  ])}
                />
              </>
            ) : (
              <>
                <button
                  className={secondary}
                  onClick={() => {
                    setRun(null);
                    go("results");
                  }}
                >
                  {a.history}
                </button>
                {run.templateId === "facility" && (
                  <button className={secondary} onClick={() => go("inbound")}>
                    {a.inbound}
                  </button>
                )}
                <Facts
                  items={[
                    [a.selected, summary.targets],
                    [a.connected, summary.connected],
                    [a.acknowledged, summary.acknowledged],
                    [a.unconfirmed, summary.unconfirmed],
                    [a.consultation, summary.consultation],
                    [a.resolved, `${summary.resolved} / ${summary.targets}`],
                  ]}
                />
                <UniqueResults
                  run={run}
                  canUpdate={permissions.update}
                  pending={pending}
                  onWrite={(action) =>
                    work(async () => {
                      await action();
                      setRun(
                        await universityRequest<Run>(
                          `batches/${run.id}/results`,
                        ),
                      );
                      setFeedback(true);
                    })
                  }
                />
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <label
                    htmlFor="result-filter"
                    className="text-sm font-semibold"
                  >
                    {a.filter}
                    <Select
                      id="result-filter"
                      containerClassName="mt-2"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      {[
                        ["all", a.all],
                        ["planned", a.planned],
                        ["consultation", a.consultation],
                        ["resend", a.resend],
                        ["unconfirmed", a.unconfirmed],
                        ["support", a.support],
                        ["inprogress", c.pending],
                        ["resolved", a.resolved],
                      ].map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button
                      disabled={pending}
                      className={secondary}
                      onClick={() =>
                        void work(async () => {
                          const value = await universityRequest<{
                            csv: string;
                          }>(`batches/${run.id}/export`);
                          const url = URL.createObjectURL(
                            new Blob(["\uFEFF", value.csv], {
                              type: "text/csv;charset=utf-8",
                            }),
                          );
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = `outreach-${run.id}.csv`;
                          link.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        })
                      }
                    >
                      {a.export}
                    </button>
                    <button
                      id="to-complete"
                      className={secondary}
                      onClick={() => go("complete")}
                    >
                      {a.completeStep}
                    </button>
                  </div>
                </div>
                <Table
                  headers={[
                    a.registrations,
                    a.callIdentity,
                    a.result,
                    ...chosen.answerColumns.map(
                      ([, label]) => c.templateText[label],
                    ),
                    a.cases,
                    c.details,
                  ]}
                  rows={filtered.map((row) => [
                    row.name,
                    <>
                      {callLabels[row.call]}
                      {row.call === "HUMAN" && !row.recognized
                        ? ` · ${a.recognitionFailed}`
                        : ""}
                      <br />
                      {row.confirmed && row.recognized
                        ? a.personVerified
                        : a.personUnverified}
                    </>,
                    (
                      {
                        consultation: a.consultation,
                        resend: a.resend,
                        support: a.support,
                        planned: a.planned,
                        unconfirmed: a.unconfirmed,
                      } as Record<string, string>
                    )[row.result] ?? a.personVerified,
                    ...chosen.answerColumns.map(([key]) =>
                      display(row.answers[key], key),
                    ),
                    <>
                      {statusLabels[row.task?.status ?? "OPEN"]}
                      <br />
                      {row.task?.assignee || a.unassigned}
                    </>,
                    <button
                      key={row.id}
                      data-detail={row.id}
                      disabled={pending}
                      className="cursor-pointer font-semibold text-accent underline disabled:cursor-not-allowed"
                      onClick={() => void openCase(row)}
                    >
                      {a.detailAction}
                    </button>,
                  ])}
                />
                {!filtered.length && <p role="status">{c.empty}</p>}
                <p className="text-sm text-fg-muted">{a.resultNote}</p>
              </>
            )}
          </div>
        )}
        {stage === "case" && activeRow?.task && (
          <>
            <CaseForm
              row={activeRow}
              template={chosen}
              assignees={assignees}
              disabled={pending || !permissions.update}
              onBack={() => go("results")}
              onSave={(value) =>
                work(async () => {
                  await universityMutation(
                    `cases/${activeRow.task!.id}`,
                    value,
                    "PATCH",
                  );
                  if (run)
                    setRun(
                      await universityRequest<Run>(`batches/${run.id}/results`),
                    );
                  setActiveRow(null);
                  go("results");
                  setFeedback(true);
                })
              }
            />
            <ManualAnswer
              row={activeRow}
              template={chosen}
              disabled={pending || !permissions.update}
              onSave={(payload) =>
                work(async () => {
                  await universityMutation(
                    `targets/${activeRow.id}/answers`,
                    payload,
                  );
                  if (run)
                    setRun(
                      await universityRequest<Run>(`batches/${run.id}/results`),
                    );
                  go("results");
                  setFeedback(true);
                })
              }
              onRecontact={(reason) =>
                work(async () => {
                  await universityMutation(
                    `targets/${activeRow.id}/recontact`,
                    { reason, operationKey: crypto.randomUUID() },
                  );
                  if (run)
                    setRun(
                      await universityRequest<Run>(`batches/${run.id}/results`),
                    );
                  go("results");
                  setFeedback(true);
                })
              }
            />
          </>
        )}
        {stage === "complete" && run && summary && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold">{a.completionTitle}</h3>
            <Facts
              items={[
                [
                  a.personVerified,
                  `${summary.acknowledged} / ${summary.targets}`,
                ],
                [a.resolved, `${summary.resolved} / ${summary.targets}`],
                [a.remaining, summary.targets - summary.resolved],
                [
                  a.verified,
                  chosen.procedureApplicable
                    ? `${summary.verified} / ${summary.targets}`
                    : a.notApplicable,
                ],
              ]}
            />
            <p className="text-sm leading-6">
              {c.templateText[chosen.completion]}
            </p>
            <p role="status" className="font-semibold">
              {summary.targets === summary.resolved
                ? a.completeAll
                : a.completionNote}
            </p>
            <p className="text-sm text-fg-muted">{a.noSuccess}</p>
            <button
              id="back-results"
              className={primary}
              onClick={() => go("results")}
            >
              {a.results}
            </button>
          </div>
        )}
        {stage === "inbound" && <UniversityIntakes permissions={permissions} />}
        {stage === "registrations" && (
          <UniversityStudentRegistry
            reviewState={reviewState}
            canCreate={permissions.create}
            canUpdate={permissions.update}
            years={years}
            serverDate={serverDate}
          />
        )}
        {stage === "metrics" && (
          <section className="space-y-6">
            <h2 className="text-xl font-bold">{a.metrics}</h2>
            <p className="text-sm text-fg-muted">{a.metricNote}</p>
            <Table
              headers={[a.metrics, a.definition, a.performance]}
              rows={[
                [a.callMinutes, a.callMinutesDefinition, a.unmeasured],
                [a.procedureRate, a.procedureDefinition, a.unmeasured],
                [a.consultationRate, a.consultationDefinition, a.unmeasured],
              ]}
            />
          </section>
        )}
      </div>
    </div>
  );
}

export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-line p-4">
          <dt className="text-xs font-semibold text-fg-muted">{label}</dt>
          <dd className="mt-2 text-xl font-bold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div
      role="region"
      aria-label={headers.join(" · ")}
      tabIndex={0}
      className="max-w-full overflow-x-auto rounded-lg border border-line"
    >
      <table className="w-full min-w-[660px] text-left text-sm">
        <thead className="bg-surface-raised">
          <tr>
            {headers.map((header, i) => (
              <th
                key={`${i}-${header}`}
                className="whitespace-nowrap px-4 py-3 font-semibold"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function localDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const part = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
}
function CaseForm({
  row,
  template,
  assignees,
  disabled,
  onBack,
  onSave,
}: {
  row: ResultRow;
  template: Template;
  assignees: { id: string; name: string }[];
  disabled: boolean;
  onBack: () => void;
  onSave: (value: unknown) => Promise<void>;
}) {
  const { t } = useI18n(),
    c = t.universityOutreach,
    a = c.admin,
    task = row.task!;
  const [value, setValue] = useState({
    version: task.version,
    assigneeId: task.assigneeId ?? "",
    status: task.status,
    actionKind: task.action ?? "",
    note: task.note ?? "",
    minutes: task.minutes ?? 0,
    procedureStatus: task.procedureStatus,
    verificationAt: localDateTime(task.verificationAt),
    verificationReference: task.verificationReference ?? "",
    dueAt: localDateTime(task.dueAt),
    handoffRecipient: task.handoffRecipient ?? "",
    handoffAt: localDateTime(task.handoffAt),
  });
  const change = (key: keyof typeof value, next: string | number) =>
    setValue((old) => ({ ...old, [key]: next }));
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold">
          {row.name} · {a.cases}
        </h3>
        <p className="mt-2 text-sm text-fg-muted">
          {c.templateText[template.department]}
        </p>
      </div>
      <Table
        headers={[a.answerFields, a.result]}
        rows={template.answerColumns.map(([key, label]) => [
          c.templateText[label],
          displayAnswer(row.answers[key], c, key),
        ])}
      />
      <form
        id="task-form"
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled)
            void onSave({
              ...value,
              verificationAt: value.verificationAt
                ? new Date(value.verificationAt).toISOString()
                : null,
              verificationReference: value.verificationReference || null,
              handoffAt: value.handoffAt
                ? new Date(value.handoffAt).toISOString()
                : null,
              dueAt: value.dueAt ? new Date(value.dueAt).toISOString() : null,
            });
        }}
      >
        <fieldset disabled={disabled} className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="text-sm font-semibold" htmlFor="assignee">
              {a.assignee}
              <Select
                required
                id="assignee"
                value={value.assigneeId}
                onChange={(e) => change("assigneeId", e.target.value)}
                containerClassName="mt-2"
              >
                <option value="">{c.choose}</option>
                {assignees.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm font-semibold" htmlFor="task-status">
              {c.status}
              <Select
                id="task-status"
                value={value.status}
                onChange={(e) => change("status", e.target.value)}
                containerClassName="mt-2"
              >
                {[
                  ["OPEN", a.caseOpen],
                  ["IN_PROGRESS", a.caseInProgress],
                  ["RESOLVED", a.resolved],
                  ["CLOSED_UNREACHED", a.closedUnreached],
                ].map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm font-semibold" htmlFor="action">
              {a.action}
              <Select
                required
                id="action"
                value={value.actionKind}
                onChange={(e) => change("actionKind", e.target.value)}
                containerClassName="mt-2"
              >
                <option value="">{c.choose}</option>
                {[
                  ["consult", a.consultation],
                  ["resend", a.resend],
                  ["retry", a.recontact],
                  ["handoff", a.handoff],
                  ["support", a.support],
                ].map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm font-semibold" htmlFor="minutes">
              {a.minutes}
              <input
                required
                type="number"
                min={0}
                max={100000}
                step={1}
                id="minutes"
                value={value.minutes}
                onChange={(e) => change("minutes", Number(e.target.value))}
                className={input}
              />
            </label>
          </div>
          {value.actionKind === "handoff" && (
            <div className="grid gap-5 md:grid-cols-2">
              <label className="text-sm font-semibold">
                {a.handoffRecipient}
                <input
                  required
                  maxLength={200}
                  value={value.handoffRecipient}
                  onChange={(e) => change("handoffRecipient", e.target.value)}
                  className={input}
                />
              </label>
              <label className="text-sm font-semibold">
                {a.handoffAt}
                <input
                  required
                  type="datetime-local"
                  value={value.handoffAt}
                  onChange={(e) => change("handoffAt", e.target.value)}
                  className={input}
                />
              </label>
            </div>
          )}
          <label className="block text-sm font-semibold" htmlFor="note">
            {a.caseNote}
            <textarea
              id="note"
              required
              maxLength={2000}
              value={value.note}
              onChange={(e) => change("note", e.target.value)}
              rows={3}
              className={input}
            />
          </label>
          <label className="block text-sm font-semibold">
            {a.due}
            <input
              type="datetime-local"
              value={value.dueAt}
              onChange={(e) => change("dueAt", e.target.value)}
              className={input}
            />
          </label>
          {template.procedureApplicable && (
            <div className="grid gap-5 md:grid-cols-2">
              <label
                className="text-sm font-semibold"
                htmlFor="procedure-status"
              >
                {a.procedure}
                <Select
                  id="procedure-status"
                  value={value.procedureStatus}
                  onChange={(e) => change("procedureStatus", e.target.value)}
                  containerClassName="mt-2"
                >
                  {[
                    ["UNKNOWN", a.unconfirmed],
                    ["PLANNED", a.planned],
                    ["VERIFIED", a.verified],
                  ].map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-sm font-semibold" htmlFor="verification">
                {a.verification}
                <input
                  id="verification"
                  required={value.procedureStatus === "VERIFIED"}
                  value={value.verificationReference}
                  maxLength={2000}
                  onChange={(e) =>
                    change("verificationReference", e.target.value)
                  }
                  className={input}
                />
              </label>
              <label className="text-sm font-semibold">
                {a.verificationDate}
                <input
                  type="datetime-local"
                  required={value.procedureStatus === "VERIFIED"}
                  value={value.verificationAt}
                  onChange={(e) => change("verificationAt", e.target.value)}
                  className={input}
                />
              </label>
            </div>
          )}
        </fieldset>
        <p className="text-sm leading-6 text-fg-muted">
          {c.templateText[template.completion]}
          <br />
          {a.manualNote}
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            id="back-results"
            type="button"
            className={secondary}
            onClick={onBack}
          >
            {a.results}
          </button>
          <button type="submit" className={primary} disabled={disabled}>
            {a.saveCase}
          </button>
        </div>
      </form>
    </div>
  );
}
function UniqueResults({
  run,
  canUpdate,
  pending,
  onWrite,
}: {
  run: Run;
  canUpdate: boolean;
  pending: boolean;
  onWrite: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const { t } = useI18n(),
    c = t.universityOutreach,
    a = c.admin;
  const [reserve, setReserve] = useState(""),
    [note, setNote] = useState("");
  if (run.templateId === "staff" && run.venues)
    return (
      <section className="space-y-3">
        <h3 className="font-bold">{a.reserveTitle}</h3>
        <Table
          headers={[a.venue, a.requiredPeople, a.available, a.shortage]}
          rows={run.venues.map((v) => [
            v.venue === "A会場" ? a.venueA : a.venueB,
            v.required,
            v.available,
            <strong key={v.venue}>{v.shortage}</strong>,
          ])}
        />
        <p className="text-sm text-fg-muted">
          {run.config.arrivalDeadline} · {a.reserveNote}
        </p>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (canUpdate && !pending)
              void onWrite(() =>
                universityMutation(`batches/${run.id}/reserves`, {
                  personRef: reserve.trim(),
                  venue: "B会場",
                  note,
                }),
              );
          }}
        >
          <label className="text-sm font-semibold" htmlFor="reserve-name">
            {a.reservePerson}
            <input
              id="reserve-name"
              required
              maxLength={100}
              disabled={!canUpdate || pending}
              value={reserve}
              onChange={(e) => setReserve(e.target.value)}
              className={input}
            />
          </label>
          <label className="text-sm font-semibold">
            {c.note}
            <input
              required
              maxLength={2000}
              disabled={!canUpdate || pending}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={input}
            />
          </label>
          <button
            id="reserve"
            disabled={!canUpdate || pending}
            className={secondary}
          >
            {a.reserveAction}
          </button>
        </form>
        {run.reserves.length > 0 && (
          <p className="text-sm">
            {run.reserves
              .map(
                (r) =>
                  `${r.personRef}（${r.venue === "A会場" ? a.venueA : a.venueB}）`,
              )
              .join("、")}
          </p>
        )}
      </section>
    );
  if (run.templateId === "group" && run.groups) {
    const g = run.groups;
    return (
      <section className="space-y-3">
        <h3 className="font-bold">{a.groupTitle}</h3>
        <Facts
          items={[
            [a.representatives, `${g.respondents} / ${g.representatives}`],
            [a.population, g.population],
            [a.covered, g.covered],
            [a.unknownPeople, g.unknown],
            [a.assembled, g.assembled],
            [a.delayed, g.delayed],
          ]}
        />
        <p className="text-sm text-fg-muted">{a.groupNote}</p>
        <button
          id="repeat-group"
          className={secondary}
          disabled={pending || !canUpdate}
          onClick={() =>
            void onWrite(() =>
              universityMutation(`batches/${run.id}/replay-demo`, {}),
            )
          }
        >
          {a.repeat}
        </button>
      </section>
    );
  }
  if (run.templateId === "facility") {
    const buildings = new Map<
      string,
      { affected: number; unaffected: number; support: number }
    >();
    for (const row of run.rows) {
      if (row.call !== "HUMAN" || !row.confirmed || !row.recognized) continue;
      const building = String(row.answers.buildingRoom ?? a.unknown).split(
        /\s/,
      )[0];
      const totals = buildings.get(building) ?? {
        affected: 0,
        unaffected: 0,
        support: 0,
      };
      if (row.answers.affected === "影響あり") totals.affected++;
      if (row.answers.affected === "影響なし") totals.unaffected++;
      if (row.answers.support === true) totals.support++;
      buildings.set(building, totals);
    }
    return (
      <section className="space-y-3">
        <h3 className="font-bold">{a.facilitySummary}</h3>
        <Table
          headers={[a.building, a.affected, a.unaffected, a.support]}
          rows={[...buildings].map(([name, total]) => [
            name,
            total.affected,
            total.unaffected,
            total.support,
          ])}
        />
      </section>
    );
  }
  return null;
}

type Intake = {
  id: string;
  place: string;
  issue: string;
  support: string;
  callback: string;
  cases: (Task & {
    actions: {
      note: string;
      actionKind: string;
      minutes: number;
      handoffRecipient: string | null;
      handoffAt: string | null;
    }[];
  })[];
};
function UniversityIntakes({ permissions }: { permissions: Permissions }) {
  const { t } = useI18n(),
    c = t.universityOutreach,
    a = c.admin;
  const [rows, setRows] = useState<Intake[]>([]),
    [value, setValue] = useState({
      place: "",
      issue: "",
      support: "",
      callback: "",
    }),
    [pending, setPending] = useState(false),
    [error, setError] = useState(false),
    [selected, setSelected] = useState<ResultRow | null>(null),
    [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);
  const guard = useRef(false);
  useEffect(() => {
    let active = true;
    universityRequest<{ rows: Intake[] }>("intakes")
      .then((page) => {
        if (active) setRows(page.rows);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);
  async function work(fn: () => Promise<void>) {
    if (guard.current) return;
    guard.current = true;
    setPending(true);
    setError(false);
    try {
      await fn();
    } catch {
      setError(true);
    } finally {
      guard.current = false;
      setPending(false);
    }
  }
  async function open(row: Intake) {
    await work(async () => {
      const users = await universityRequest<{ id: string; name: string }[]>(
        "assignees?department=facilities",
      );
      const task = row.cases[0];
      if (!task) return;
      setAssignees(users);
      setSelected({
        id: row.id,
        name: row.place,
        maskedContact: "",
        call: "NOT_CALLED",
        confirmed: false,
        recognized: false,
        answers: {
          buildingRoom: row.place,
          situation: row.issue,
          support: row.support,
        },
        groupMemberCount: 0,
        eligible: false,
        exclusionReason: "",
        notified: false,
        priorNoticeAt: "",
        selectedByStaff: false,
        contactKey: "",
        result: "unconfirmed",
        task: {
          ...task,
          assignee: task.assigneeId ?? "",
          note: task.actions[0]?.note ?? "",
          action: task.actions[0]?.actionKind ?? "",
          minutes: task.actions[0]?.minutes ?? 0,
          handoffRecipient: task.actions[0]?.handoffRecipient ?? null,
          handoffAt: task.actions[0]?.handoffAt ?? null,
          procedure: task.procedureStatus,
          verification: task.verificationReference ?? "",
        },
      });
    });
  }
  return (
    <section className="space-y-6">
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {c.unavailable}
        </p>
      )}
      {selected ? (
        <CaseForm
          key={selected.id}
          row={selected}
          template={CASES.find((item) => item.id === "facility")!}
          assignees={assignees}
          disabled={pending || !permissions.update}
          onBack={() => setSelected(null)}
          onSave={(payload) =>
            work(async () => {
              await universityMutation(
                `cases/${selected.task!.id}`,
                payload,
                "PATCH",
              );
              setRows(
                (await universityRequest<{ rows: Intake[] }>("intakes")).rows,
              );
              setSelected(null);
            })
          }
        />
      ) : (
        <>
          <div>
            <h2 className="text-xl font-bold">{a.intakeTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-fg-muted">
              {a.intakeLead}
            </p>
          </div>
          <form
            id="intake-form"
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (permissions.create)
                void work(async () => {
                  await universityMutation("intakes", value);
                  setRows(
                    (await universityRequest<{ rows: Intake[] }>("intakes"))
                      .rows,
                  );
                  setValue({ place: "", issue: "", support: "", callback: "" });
                });
            }}
          >
            <fieldset
              disabled={pending || !permissions.create}
              className="grid gap-5 md:grid-cols-2"
            >
              {(
                [
                  ["place", a.place, "building-room"],
                  ["callback", a.callback, "callback"],
                  ["issue", a.issue, "issue"],
                  ["support", a.supportWanted, "support"],
                ] as const
              ).map(([key, label, id]) => (
                <label key={key} htmlFor={id} className="text-sm font-semibold">
                  {label}
                  <input
                    id={id}
                    required
                    maxLength={
                      key === "place" || key === "callback" ? 200 : 2000
                    }
                    value={value[key]}
                    onChange={(e) =>
                      setValue((old) => ({ ...old, [key]: e.target.value }))
                    }
                    className={input}
                  />
                </label>
              ))}
            </fieldset>
            <button
              className={primary}
              disabled={pending || !permissions.create}
            >
              {a.createIntake}
            </button>
          </form>
          <Table
            headers={[a.inbound, a.place, a.issue, a.cases, c.details]}
            rows={rows.map((row) => [
              row.id,
              row.place,
              row.issue,
              row.cases[0]?.status === "RESOLVED" ? a.resolved : a.caseOpen,
              <button
                key={row.id}
                className="cursor-pointer font-semibold text-accent underline disabled:cursor-not-allowed"
                disabled={pending}
                onClick={() => void open(row)}
              >
                {a.detailAction}
              </button>,
            ])}
          />
          <p className="text-sm leading-6 text-fg-muted">{a.manualNote}</p>
          <div className="flex flex-wrap gap-4">
            <Link
              className="text-accent underline"
              href="/admin/phone-settings?tenant=univ"
            >
              {t.admin.phoneSettings}
            </Link>
            <Link
              className="text-accent underline"
              href="/admin/online-consultation-settings?tenant=univ"
            >
              {t.admin.onlineConsultation}
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

function displayAnswer(
  value: unknown,
  copy: import("@/app/i18n/university-outreach").UniversityOutreachDictionary,
  key?: string,
) {
  const a = copy.admin;
  const labels: Record<string, string> = {
    未定: a.arrivalUnknown,
    A会場: a.venueA,
    B会場: a.venueB,
    参加可能: a.participationYes,
    参加不可: a.participationNo,
    確認した: a.conditionConfirmed,
    未確認: a.conditionUnconfirmed,
    影響あり: a.affected,
    影響なし: a.unaffected,
    移動できる: a.canMove,
    難しい: a.cannotMove,
    不明: a.unknown,
    なし: a.none,
    失念: a.forgot,
    "書類・操作": a.documentsProcess,
    案内がわからない: a.unclearNotice,
    書類: a.documents,
    操作: a.process,
    希望しない: a.noCallback,
    再送希望: a.resend,
  };
  return typeof value === "boolean"
    ? key === "venueConfirmed"
      ? value
        ? a.conditionConfirmed
        : a.conditionUnconfirmed
      : value
        ? a.requested
        : a.notRequested
    : value === undefined || value === null || value === ""
      ? "—"
      : (labels[String(value)] ?? String(value));
}
function ManualAnswer({
  row,
  template,
  disabled,
  onSave,
  onRecontact,
}: {
  row: ResultRow;
  template: Template;
  disabled: boolean;
  onSave: (payload: unknown) => Promise<void>;
  onRecontact: (reason: string) => Promise<void>;
}) {
  const { t } = useI18n(),
    c = t.universityOutreach,
    a = c.admin;
  const [open, setOpen] = useState(false),
    [note, setNote] = useState(""),
    [identity, setIdentity] = useState(false),
    [ack, setAck] = useState(false),
    [recognized, setRecognized] = useState(false),
    [call, setCall] = useState("HUMAN");
  const [answers, setAnswers] = useState<
    Record<string, string | boolean | number>
  >({});
  const operation = useRef<string | null>(null);
  const keys = [
    ...new Set([
      ...template.questions.map(([key]) => key),
      ...template.answerColumns.map(([key]) => key),
    ]),
  ];
  const labels = new Map<string, string>(
    [...template.answerColumns, ...template.questions].map(
      ([key, label]) => [key, label] as const,
    ),
  );
  const booleans = new Set([
    "consultation",
    "resend",
    "support",
    "venueConfirmed",
    "callback",
    "declined",
  ]);
  const numbers = new Set(["memberCount", "assembled", "delayed"]);
  const resetOperation = () => {
    operation.current = null;
  };
  return (
    <section className="space-y-4 border-t border-line pt-5">
      <button
        className={secondary}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {a.manualAnswer}
      </button>
      {open && (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (disabled) return;
            operation.current ??= crypto.randomUUID();
            const confirmedAnswers =
              identity && recognized && call === "HUMAN"
                ? {
                    ...answers,
                    ...(template.id === "group"
                      ? { memberCount: row.groupMemberCount }
                      : {}),
                  }
                : {};
            void onSave({
              operationKey: operation.current,
              callState: call,
              identityState:
                identity && call === "HUMAN" ? "VERIFIED" : "UNVERIFIED",
              ackState: ack && call === "HUMAN" ? "CONFIRMED" : "UNCONFIRMED",
              recognitionState:
                recognized && call === "HUMAN" ? "VALID" : "NONE",
              answers: confirmedAnswers,
              note,
            });
          }}
        >
          <fieldset disabled={disabled} className="space-y-4">
            <label className="block text-sm font-semibold">
              {a.callIdentity}
              <Select
                containerClassName="mt-2"
                value={call}
                onChange={(e) => {
                  setCall(e.target.value);
                  resetOperation();
                }}
              >
                {[
                  ["HUMAN", a.callHuman],
                  ["VOICEMAIL", a.callVoicemail],
                  ["NO_ANSWER", a.callNoAnswer],
                  ["BUSY", a.callBusy],
                  ["FAILED", a.callFailed],
                  ["UNKNOWN", a.callUnknown],
                ].map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            {call === "HUMAN" && (
              <>
                <label className="flex cursor-pointer gap-3 text-sm">
                  <Checkbox
                    checked={identity}
                    onChange={(e) => {
                      setIdentity(e.target.checked);
                      resetOperation();
                    }}
                  />
                  {a.personVerified}
                </label>
                <label className="flex cursor-pointer gap-3 text-sm">
                  <Checkbox
                    checked={ack}
                    onChange={(e) => {
                      setAck(e.target.checked);
                      resetOperation();
                    }}
                  />
                  {a.acknowledged}
                </label>
                <label className="flex cursor-pointer gap-3 text-sm">
                  <Checkbox
                    checked={recognized}
                    onChange={(e) => {
                      setRecognized(e.target.checked);
                      resetOperation();
                    }}
                  />
                  {a.recognition}
                </label>
              </>
            )}
            {identity && recognized && call === "HUMAN" && (
              <div className="grid gap-4 md:grid-cols-2">
                {keys
                  .filter((key) => key !== "memberCount")
                  .map((key) => (
                    <label key={key} className="block text-sm font-semibold">
                      {c.templateText[labels.get(key) ?? ""] ?? key}
                      {booleans.has(key) ? (
                        <span className="ml-3">
                          <Checkbox
                            checked={answers[key] === true}
                            onChange={(e) => {
                              setAnswers((old) => ({
                                ...old,
                                [key]: e.target.checked,
                              }));
                              resetOperation();
                            }}
                          />
                        </span>
                      ) : key === "venue" || key === "participation" ? (
                        <Select
                          containerClassName="mt-2"
                          required
                          value={String(answers[key] ?? "")}
                          onChange={(e) => {
                            setAnswers((old) => ({
                              ...old,
                              [key]: e.target.value,
                            }));
                            resetOperation();
                          }}
                        >
                          <option value="">{c.choose}</option>
                          {(key === "venue"
                            ? [
                                ["A会場", a.venueA],
                                ["B会場", a.venueB],
                              ]
                            : [
                                ["参加可能", a.participationYes],
                                ["参加不可", a.participationNo],
                                ["未定", a.arrivalUnknown],
                              ]
                          ).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <input
                          className={input}
                          type={numbers.has(key) ? "number" : "text"}
                          min={0}
                          max={
                            numbers.has(key) ? row.groupMemberCount : undefined
                          }
                          step={numbers.has(key) ? 1 : undefined}
                          required={numbers.has(key)}
                          maxLength={500}
                          value={String(answers[key] ?? "")}
                          onChange={(e) => {
                            setAnswers((old) => ({
                              ...old,
                              [key]: numbers.has(key)
                                ? Number(e.target.value)
                                : e.target.value,
                            }));
                            resetOperation();
                          }}
                        />
                      )}
                    </label>
                  ))}
              </div>
            )}
            <label className="block text-sm font-semibold">
              {c.note}
              <input
                className={input}
                required
                value={note}
                maxLength={2000}
                onChange={(e) => {
                  setNote(e.target.value);
                  resetOperation();
                }}
              />
            </label>
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <button className={primary} disabled={disabled}>
              {c.save}
            </button>
            <button
              type="button"
              className={secondary}
              disabled={disabled || !note.trim() || row.call === "UNKNOWN"}
              onClick={() => void onRecontact(note)}
            >
              {a.recontact}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// Bounded local review rendering. These rows are never accepted as persisted IDs by the APIs.
function createReviewRun(template: Template): Run {
  const config = defaults(template);
  const rows: ResultRow[] = recipientsFor(template.id)
    .filter((r) => r.eligible)
    .map((r) => ({
      ...r,
      result: classify(r),
      task: {
        id: `review-case-${r.id}`,
        siteKey: "univ",
        departmentKey: PURPOSE_DEPARTMENT[template.id],
        targetId: r.id,
        intakeId: null,
        assigneeId: null,
        status: "OPEN",
        procedureStatus: template.procedureApplicable ? "UNKNOWN" : "NA",
        verificationAt: null,
        verificationReference: null,
        dueAt: null,
        version: 1,
        handoffRecipient: null,
        handoffAt: null,
        actions: [],
        assignee: "",
        note: "",
        action: "",
        minutes: 0,
        procedure: template.procedureApplicable ? "UNKNOWN" : "NA",
        verification: "",
      },
    }));
  return {
    id: "review-only",
    templateId: template.id,
    config,
    version: 1,
    mode: "DEMO",
    status: "COMPLETED",
    frozenTargetCount: rows.length,
    rows,
    reserves: [],
    summary: {
      targets: rows.length,
      connected: rows.filter((r) => ["HUMAN", "VOICEMAIL"].includes(r.call))
        .length,
      acknowledged: rows.filter(
        (r) => r.call === "HUMAN" && r.confirmed && r.recognized,
      ).length,
      consultation: rows.filter(
        (r) =>
          r.call === "HUMAN" &&
          r.confirmed &&
          r.recognized &&
          r.answers.consultation,
      ).length,
      unconfirmed: rows.filter((r) => r.result === "unconfirmed").length,
      resolved: 0,
      verified: 0,
    },
    groups: template.id === "group" ? groupSummary(rows) : null,
    venues: template.id === "staff" ? staffSummary(rows, config, []) : null,
  };
}
