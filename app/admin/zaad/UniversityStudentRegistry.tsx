"use client";
import { Select } from "@/app/components/Select";
import { Checkbox } from "@/app/components/Checkbox";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/app/i18n/LanguageProvider";
import {
  OutreachError,
  parseRegistration,
  TOPICS,
  type Topic,
} from "@/lib/zaad/university/contracts";
import {
  RegistrationFields,
  emptyRegistration,
  registrationPayload,
  registrationInputClass as input,
  outreachPrimary as primary,
  outreachSecondary as secondary,
} from "@/app/notifications/register/StudentNotificationRegistration";
import {
  universityRequest,
  universityMutation,
  UniversityApiError,
} from "./university-client";

type Row = {
  id: string;
  name: string;
  displayStudentNumber: string;
  phoneLast4: string;
  topicIds: Topic[];
  source: string;
  status: "PENDING_REVIEW" | "ACTIVE" | "WITHDRAWN";
  version: number;
};
type Detail = Row & {
  phone: string;
  note: string;
  identityConfirmed: boolean;
  phoneConfirmed: boolean;
  contactId: string | null;
  contact: {
    id: string;
    version: number;
    name: string;
    phone: string;
    preferences: { topicId: Topic }[];
  } | null;
};
export function UniversityStudentRegistry({
  canCreate,
  canUpdate,
  years,
  serverDate,
  reviewState,
}: {
  reviewState?: string;
  canCreate: boolean;
  canUpdate: boolean;
  years: number[];
  serverDate: string;
}) {
  const { t } = useI18n(),
    c = t.universityOutreach,
    a = c.admin;
  const [counts, setCounts] = useState({ total: 0, pending: 0, active: 0 });
  const [rows, setRows] = useState<Row[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [saved, setSaved] = useState(false);
  const [mode, setMode] = useState<"list" | "add" | "review">(
      reviewState === "registration-add"
        ? "add"
        : reviewState === "registration-review"
          ? "review"
          : "list",
    ),
    [detail, setDetail] = useState<Detail | null>(
      reviewState === "registration-review"
        ? {
            id: "review-only",
            name: "登録学生デモ",
            displayStudentNumber: `1${String(years[0]).slice(-2)}0001`,
            phoneLast4: "0000",
            phone: "+819000000000",
            topicIds: ["scholarship", "class-change"],
            source: "STUDENT_PUBLIC",
            status: "PENDING_REVIEW",
            version: 1,
            note: "",
            identityConfirmed: false,
            phoneConfirmed: false,
            contactId: null,
            contact: null,
          }
        : null,
    ),
    [value, setValue] = useState(emptyRegistration),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [attestation, setAttestation] = useState("");
  const [pending, setPending] = useState(false),
    guard = useRef(false),
    operation = useRef<string | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const statusLabels = {
    PENDING_REVIEW: c.pending,
    ACTIVE: c.active,
    WITHDRAWN: c.withdrawn,
  };
  const [statusFilter, setStatusFilter] = useState("");
  async function load(next?: string) {
    setLoading(true);
    setError(false);
    try {
      const page = await universityRequest<{
        counts: typeof counts;
        rows: Row[];
        nextCursor: string | null;
      }>(
        `registrations?${new URLSearchParams({ ...(next ? { cursor: next } : {}), ...(statusFilter ? { status: statusFilter } : {}) })}`,
      );
      setRows((old) => (next ? [...old, ...page.rows] : page.rows));
      setCursor(page.nextCursor);
      setCounts(page.counts);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    universityRequest<{
      counts: typeof counts;
      rows: Row[];
      nextCursor: string | null;
    }>(
      `registrations?${new URLSearchParams(statusFilter ? { status: statusFilter } : {})}`,
    )
      .then((page) => {
        if (active) {
          setRows(page.rows);
          setCursor(page.nextCursor);
          setCounts(page.counts);
        }
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [statusFilter]);
  useEffect(() => {
    if (mode !== "list") heading.current?.focus();
  }, [mode]);
  async function open(id: string) {
    setLoading(true);
    setError(false);
    setSaved(false);
    try {
      const row = await universityRequest<Detail>(`registrations/${id}`);
      setDetail(row);
      setMode("review");
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  async function submit(work: () => Promise<unknown>) {
    if (guard.current) return;
    guard.current = true;
    setPending(true);
    setError(false);
    setSaved(false);
    try {
      await work();
      setSaved(true);
      setMode("list");
      setDetail(null);
      await load();
    } catch (error) {
      setError(true);
      if (error instanceof UniversityApiError && error.fields)
        setErrors(error.fields);
    } finally {
      guard.current = false;
      setPending(false);
    }
  }
  return (
    <section className="space-y-6" data-registration-view={mode}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 ref={heading} tabIndex={-1} className="text-xl font-bold">
          {mode === "add"
            ? c.registerByStaff
            : mode === "review"
              ? c.confirmTitle
              : c.registryTitle}
        </h2>
        {mode === "list" && (
          <button
            disabled={!canCreate || loading}
            onClick={() => {
              setValue(emptyRegistration());
              setErrors({});
              setAttestation("");
              operation.current = null;
              setMode("add");
              setError(false);
              setSaved(false);
            }}
            className={primary}
          >
            {c.registerByStaff}
          </button>
        )}
      </div>
      {mode === "list" && (
        <p className="text-sm leading-6 text-fg-muted">{c.registryLead}</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {c.unavailable}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-accent">
          {c.saved}
        </p>
      )}
      {mode === "list" && (
        <>
          <div className="flex flex-wrap gap-6 border-y border-line py-4 text-sm">
            <p>
              {c.registryTitle}: <strong>{counts.total}</strong>
            </p>
            <p>
              {statusLabels.PENDING_REVIEW}: <strong>{counts.pending}</strong>
            </p>
            <p>
              {statusLabels.ACTIVE}: <strong>{counts.active}</strong>
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-sm font-semibold">
              {c.status}
              <Select
                value={statusFilter}
                onChange={(e) => {
                  setLoading(true);
                  setError(false);
                  setStatusFilter(e.target.value);
                }}
                containerClassName="mt-2"
              >
                <option value="">{a.all}</option>
                {Object.entries(statusLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <button
              onClick={() => void load()}
              disabled={loading}
              className={secondary}
            >
              {c.retry}
            </button>
          </div>
          {loading && <p role="status">{c.loading}</p>}
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[740px] text-left text-sm">
              <thead className="bg-surface-raised">
                <tr>
                  {[
                    c.name,
                    c.phone,
                    c.topics,
                    c.source,
                    c.status,
                    c.details,
                  ].map((label) => (
                    <th key={label} className="px-4 py-3 font-semibold">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3">
                      {row.name}
                      <span className="block text-xs text-fg-muted">
                        {row.displayStudentNumber}
                      </span>
                    </td>
                    <td className="px-4 py-3">•••• {row.phoneLast4}</td>
                    <td className="px-4 py-3">
                      {TOPICS.flatMap((topic, i) =>
                        row.topicIds.includes(topic) ? [c.topicLabels[i]] : [],
                      ).join("、")}
                    </td>
                    <td className="px-4 py-3">
                      {row.source === "STUDENT_PUBLIC"
                        ? c.publicSource
                        : c.staffSource}
                    </td>
                    <td className="px-4 py-3">{statusLabels[row.status]}</td>
                    <td className="px-4 py-3">
                      <button
                        disabled={loading}
                        onClick={() => void open(row.id)}
                        className="cursor-pointer font-semibold text-accent underline disabled:cursor-not-allowed"
                      >
                        {c.details}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !rows.length && <p role="status">{c.empty}</p>}
          {cursor && (
            <button
              disabled={loading}
              onClick={() => void load(cursor)}
              className={secondary}
            >
              {c.next}
            </button>
          )}
        </>
      )}
      {mode === "add" && (
        <form
          id="registry-add-form"
          noValidate
          className="max-w-3xl space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canCreate || pending) return;
            try {
              if (!operation.current) operation.current = crypto.randomUUID();
              const registration = parseRegistration(
                registrationPayload(value, operation.current),
                new Date(serverDate),
              );
              if (!attestation.trim()) {
                setError(true);
                return;
              }
              void submit(() =>
                universityMutation("registrations", {
                  registration,
                  attestation,
                }),
              );
            } catch (error) {
              setErrors(
                error instanceof OutreachError ? (error.fields ?? {}) : {},
              );
              requestAnimationFrame(() =>
                document
                  .querySelector<HTMLElement>('[aria-invalid="true"]')
                  ?.focus(),
              );
            }
          }}
        >
          <RegistrationFields
            value={value}
            onChange={(next) => {
              setValue(next);
              operation.current = null;
            }}
            years={years}
            errors={errors}
            staff
            disabled={pending}
          />
          <label className="block text-sm font-semibold">
            {c.attestation}
            <input
              value={attestation}
              maxLength={2000}
              onChange={(e) => setAttestation(e.target.value)}
              disabled={pending}
              required
              className={input}
            />
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={pending}
              className={secondary}
              onClick={() => setMode("list")}
            >
              {c.cancel}
            </button>
            <button disabled={pending || !canCreate} className={primary}>
              {pending ? c.saving : c.submitRegistration}
            </button>
          </div>
        </form>
      )}
      {mode === "review" && detail && (
        <form
          id="registry-review-form"
          className="max-w-3xl space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canUpdate || pending) return;
            void submit(() =>
              universityMutation(
                `registrations/${detail.id}`,
                {
                  version: detail.version,
                  status:
                    (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                      "value",
                    ) ?? detail.status,
                  identityConfirmed: detail.identityConfirmed,
                  phoneConfirmed: detail.phoneConfirmed,
                  note: detail.note,
                  topicIds: detail.topicIds,
                  name: detail.contact?.name ?? detail.name,
                  phone: detail.contact?.phone ?? detail.phone,
                  ...(detail.contact
                    ? {
                        contactId: detail.contact.id,
                        contactVersion: detail.contact.version,
                      }
                    : {}),
                },
                "PATCH",
              ),
            );
          }}
        >
          <p className="text-sm text-fg-muted">
            {detail.source === "STUDENT_PUBLIC"
              ? c.publicSource
              : c.staffSource}{" "}
            · {detail.displayStudentNumber}
          </p>
          <dl className="divide-y divide-line border-y border-line text-sm">
            {[
              [c.name, detail.contact?.name ?? detail.name],
              [c.studentNumber, detail.displayStudentNumber],
              [c.phone, detail.contact?.phone ?? detail.phone],
              [
                c.topics,
                TOPICS.flatMap((topic, i) =>
                  detail.topicIds.includes(topic) ? [c.topicLabels[i]] : [],
                ).join("、"),
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="grid gap-2 py-4 sm:grid-cols-[10rem_1fr]"
              >
                <dt className="font-semibold">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <fieldset disabled={!canUpdate || pending} className="space-y-5">
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-accent">
                {c.editInput}
              </summary>
              <div className="grid gap-5 md:grid-cols-2">
                <label className="text-sm font-semibold">
                  {c.name}
                  <input
                    required
                    maxLength={100}
                    value={detail.contact?.name ?? detail.name}
                    onChange={(e) =>
                      setDetail({
                        ...detail,
                        ...(detail.contact
                          ? {
                              contact: {
                                ...detail.contact,
                                name: e.target.value,
                              },
                            }
                          : { name: e.target.value }),
                      })
                    }
                    className={input}
                  />
                </label>
                <label className="text-sm font-semibold">
                  {c.phone}
                  <input
                    required
                    type="tel"
                    maxLength={30}
                    value={detail.contact?.phone ?? detail.phone}
                    onChange={(e) =>
                      setDetail({
                        ...detail,
                        phoneConfirmed: false,
                        status: "PENDING_REVIEW",
                        ...(detail.contact
                          ? {
                              contact: {
                                ...detail.contact,
                                phone: e.target.value,
                              },
                            }
                          : { phone: e.target.value }),
                      })
                    }
                    className={input}
                  />
                </label>
              </div>
            </details>
            <fieldset>
              <legend className="text-sm font-bold">{c.topics}</legend>
              <div className="mt-3 space-y-3">
                {TOPICS.map((topic, i) => (
                  <label
                    key={topic}
                    className="flex cursor-pointer items-start gap-3 text-sm"
                  >
                    <Checkbox
                      checked={detail.topicIds.includes(topic)}
                      onChange={(e) =>
                        setDetail({
                          ...detail,
                          topicIds: e.target.checked
                            ? [...detail.topicIds, topic]
                            : detail.topicIds.filter((id) => id !== topic),
                        })
                      }
                    />
                    {c.topicLabels[i]}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <Checkbox
                id="registry-identity"
                checked={detail.identityConfirmed}
                onChange={(e) =>
                  setDetail({ ...detail, identityConfirmed: e.target.checked })
                }
              />
              {c.identityConfirmed}
            </label>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <Checkbox
                id="registry-phone"
                checked={detail.phoneConfirmed}
                onChange={(e) =>
                  setDetail({ ...detail, phoneConfirmed: e.target.checked })
                }
              />
              {c.phoneConfirmed}
            </label>
            <label className="block text-sm font-semibold">
              {c.note}
              <textarea
                required
                maxLength={2000}
                id="registry-note"
                value={detail.note}
                onChange={(e) => setDetail({ ...detail, note: e.target.value })}
                className={input}
                rows={3}
              />
            </label>
          </fieldset>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => setMode("list")}
              className={secondary}
            >
              {c.cancel}
            </button>
            <button
              id="registry-activate"
              type="submit"
              value="ACTIVE"
              disabled={!canUpdate || pending}
              className={primary}
            >
              {pending ? c.saving : c.activateRegistration}
            </button>
            <button
              id="registry-withdraw"
              type="submit"
              value="WITHDRAWN"
              disabled={!canUpdate || pending}
              className={secondary}
            >
              {c.withdrawRegistration}
            </button>
            <button
              type="submit"
              value="PENDING_REVIEW"
              disabled={!canUpdate || pending}
              className={secondary}
            >
              {c.save}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
