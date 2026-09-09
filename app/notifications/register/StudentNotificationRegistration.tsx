"use client";
import { Select } from "@/app/components/Select";
import { Checkbox } from "@/app/components/Checkbox";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/app/i18n/LanguageProvider";
import {
  CONSENT_VERSION,
  FACULTY_CODES,
  TOPICS,
  OutreachError,
  parseRegistration,
  studentNumber,
  type Topic,
  type RegistrationInput,
} from "@/lib/zaad/university/contracts";

export const registrationInputClass =
  "mt-2 w-full min-w-0 rounded-md border border-line bg-surface px-3 py-2.5 text-fg outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";
export const outreachPrimary =
  "min-h-11 cursor-pointer rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed";
export const outreachSecondary =
  "min-h-11 cursor-pointer rounded-md border border-line bg-surface px-5 py-2.5 text-sm font-semibold hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed";
export type RegistrationFieldsValue = {
  name: string;
  facultyCode: string;
  admissionYear: string;
  serial: string;
  phone: string;
  topicIds: Topic[];
  consent: boolean;
};
export const emptyRegistration = (): RegistrationFieldsValue => ({
  name: "",
  facultyCode: "",
  admissionYear: "",
  serial: "",
  phone: "",
  topicIds: [],
  consent: false,
});
export function registrationPayload(
  value: RegistrationFieldsValue,
  key: string,
) {
  return {
    ...value,
    admissionYear: Number(value.admissionYear),
    requestKey: key,
    consentVersion: CONSENT_VERSION,
  };
}

export function RegistrationFields({
  value,
  onChange,
  years,
  errors = {},
  staff = false,
  disabled = false,
}: {
  value: RegistrationFieldsValue;
  onChange: (next: RegistrationFieldsValue) => void;
  years: number[];
  errors?: Record<string, string>;
  staff?: boolean;
  disabled?: boolean;
}) {
  const { t } = useI18n(),
    c = t.universityOutreach;
  const messages: Record<string, string> = {
    name: c.nameError,
    facultyCode: c.facultyError,
    admissionYear: c.yearError,
    serial: c.serialError,
    phone: c.phoneError,
    topicIds: c.topicsError,
    consent: c.consentError,
  };
  const change = <K extends keyof RegistrationFieldsValue>(
    key: K,
    next: RegistrationFieldsValue[K],
  ) => onChange({ ...value, [key]: next });
  const error = (key: string) =>
    errors[key] ? (
      <p
        id={`${key}-error`}
        className="mt-2 text-sm text-red-700 dark:text-red-300"
      >
        {messages[key]}
      </p>
    ) : null;
  const attrs = (key: string) => ({
    "aria-invalid": !!errors[key],
    "aria-describedby": errors[key] ? `${key}-error` : undefined,
  });
  const normalized = value.serial.trim().normalize("NFKC");
  return (
    <fieldset disabled={disabled} className="space-y-6">
      <div>
        <label htmlFor="student-name" className="text-sm font-bold">
          {c.name} <span className="text-xs text-fg-muted">{c.required}</span>
        </label>
        <input
          id="student-name"
          name="name"
          autoComplete="name"
          maxLength={100}
          required
          value={value.name}
          onChange={(e) => change("name", e.target.value)}
          className={registrationInputClass}
          {...attrs("name")}
        />
        {error("name")}
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-bold">
          {c.studentNumber}{" "}
          <span className="text-xs text-fg-muted">{c.required}</span>
        </legend>
        <p className="text-sm leading-6 text-fg-muted">{c.studentHelp}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="student-faculty" className="text-sm font-semibold">
              {c.faculty}
            </label>
            <Select
              id="student-faculty"
              name="faculty"
              required
              value={value.facultyCode}
              onChange={(e) => change("facultyCode", e.target.value)}
              containerClassName="mt-2"
              {...attrs("facultyCode")}
            >
              <option value="">{c.choose}</option>
              {FACULTY_CODES.map((code, i) => (
                <option key={code} value={code}>
                  {c.faculties[i]}（{code}）
                </option>
              ))}
            </Select>
            {error("facultyCode")}
          </div>
          <div>
            <label htmlFor="student-year" className="text-sm font-semibold">
              {c.year}
            </label>
            <Select
              id="student-year"
              name="year"
              required
              value={value.admissionYear}
              onChange={(e) => change("admissionYear", e.target.value)}
              containerClassName="mt-2"
              {...attrs("admissionYear")}
            >
              <option value="">{c.choose}</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                  {c.yearSuffix}
                </option>
              ))}
            </Select>
            {error("admissionYear")}
          </div>
          <div>
            <label htmlFor="student-serial" className="text-sm font-semibold">
              {c.serial}
            </label>
            <input
              id="student-serial"
              name="serial"
              type="text"
              inputMode="numeric"
              pattern="[0-9０-９]{4}"
              minLength={4}
              maxLength={4}
              required
              value={value.serial}
              onChange={(e) => change("serial", e.target.value)}
              className={`${registrationInputClass} tabular-nums`}
              placeholder="0001"
              {...attrs("serial")}
            />
            {error("serial")}
          </div>
        </div>
        <p className="text-sm">
          {c.numberPreview}
          <output
            id="student-number-preview"
            className="font-bold tabular-nums"
            aria-live="polite"
          >
            {value.facultyCode &&
            value.admissionYear &&
            /^\d{4}$/.test(normalized)
              ? studentNumber(
                  value.facultyCode,
                  Number(value.admissionYear),
                  normalized,
                )
              : c.numberIncomplete}
          </output>
        </p>
        <p className="text-xs text-fg-muted">{c.numberNote}</p>
      </fieldset>
      <div>
        <label htmlFor="student-phone" className="text-sm font-bold">
          {c.phone} <span className="text-xs text-fg-muted">{c.required}</span>
        </label>
        <input
          id="student-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={30}
          value={value.phone}
          onChange={(e) => change("phone", e.target.value)}
          required
          className={registrationInputClass}
          placeholder="090-0000-0000"
          {...attrs("phone")}
        />
        <p className="mt-2 text-sm text-fg-muted">
          {staff ? c.staffPhoneHelp : c.phoneHelp}
        </p>
        {error("phone")}
      </div>
      <fieldset
        aria-invalid={!!errors.topicIds}
        aria-describedby={`topics-help${errors.topicIds ? " topicIds-error" : ""}`}
      >
        <legend className="font-bold">
          {c.topics}{" "}
          <span className="text-xs text-fg-muted">{c.topicsRequired}</span>
        </legend>
        <p id="topics-help" className="mt-2 text-sm leading-6 text-fg-muted">
          {c.topicsHelp}
        </p>
        <div className="mt-4 divide-y divide-line border-y border-line">
          {TOPICS.map((topic, i) => (
            <label
              key={topic}
              className="flex cursor-pointer items-start gap-3 py-4"
            >
              <Checkbox
                name="topics"
                value={topic}
                checked={value.topicIds.includes(topic)}
                onChange={(e) =>
                  change(
                    "topicIds",
                    e.target.checked
                      ? [...value.topicIds, topic]
                      : value.topicIds.filter((id) => id !== topic),
                  )
                }
              />
              <span>
                <span className="block text-sm font-semibold">
                  {c.topicLabels[i]}
                </span>
                <span className="mt-1 block text-sm leading-6 text-fg-muted">
                  {c.topicDescriptions[i]}
                </span>
              </span>
            </label>
          ))}
        </div>
        {error("topicIds")}
      </fieldset>
      <div className="space-y-3">
        <p className="text-sm leading-7 text-fg-muted">{c.privacy}</p>
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox
            id="student-consent"
            name="consent"
            required
            checked={value.consent}
            onChange={(e) => change("consent", e.target.checked)}
            {...attrs("consent")}
          />
          <span className="text-sm leading-6">
            {staff ? c.staffConsent : c.consent}
          </span>
        </label>
        {error("consent")}
      </div>
    </fieldset>
  );
}
export function RegistrationConfirmation({
  value,
}: {
  value: RegistrationInput;
}) {
  const { t } = useI18n(),
    c = t.universityOutreach;
  return (
    <dl className="divide-y divide-line border-y border-line text-sm">
      {[
        [c.name, value.name],
        [
          c.studentNumber,
          studentNumber(value.facultyCode, value.admissionYear, value.serial),
        ],
        [c.phone, value.phone],
        [
          c.topics,
          TOPICS.flatMap((topic, i) =>
            value.topicIds.includes(topic) ? [c.topicLabels[i]] : [],
          ).join("、"),
        ],
      ].map(([label, detail]) => (
        <div key={label} className="grid gap-2 py-4 sm:grid-cols-[10rem_1fr]">
          <dt className="font-semibold">{label}</dt>
          <dd className="min-w-0 break-words">{detail}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StudentNotificationRegistration({
  admissionYears: initialYears,
  serverDate,
  reviewState,
}: {
  admissionYears: number[];
  serverDate: string;
  reviewState?: string;
}) {
  const { t } = useI18n(),
    c = t.universityOutreach;
  const fixture = [
    "reg-confirm",
    "reg-submitting",
    "reg-success",
    "reg-error",
  ].includes(reviewState ?? "")
    ? {
        name: "大学 花子（デモ）",
        facultyCode: "1",
        admissionYear: String(initialYears[0]),
        serial: "0001",
        phone: "090-0000-0000",
        topicIds: ["scholarship", "class-change"] as Topic[],
        consent: true,
      }
    : emptyRegistration();
  const [value, setValue] = useState(fixture),
    [years, setYears] = useState(initialYears),
    [validationDate, setValidationDate] = useState(serverDate);
  const [step, setStep] = useState<
    "input" | "confirm" | "submitting" | "success"
  >(
    reviewState === "reg-confirm"
      ? "confirm"
      : reviewState === "reg-submitting"
        ? "submitting"
        : reviewState === "reg-success"
          ? "success"
          : "input",
  );
  const [errors, setErrors] = useState<Record<string, string>>(
      reviewState === "reg-validation"
        ? {
            name: "name",
            facultyCode: "faculty",
            admissionYear: "year",
            serial: "serial",
            phone: "phone",
            topicIds: "topics",
            consent: "consent",
          }
        : {},
    ),
    [failure, setFailure] = useState<"server" | "year" | null>(
      reviewState === "reg-error" ? "server" : null,
    );
  const [parsed, setParsed] = useState<RegistrationInput | null>(() =>
    fixture.consent
      ? parseRegistration(
          registrationPayload(fixture, "registration-review-fixture"),
          new Date(serverDate),
        )
      : null,
  );
  const key = useRef<string | null>(null),
    sending = useRef(false),
    focusTarget = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (focusTarget.current) {
      focusTarget.current.focus();
      focusTarget.current = null;
    }
  }, [step, errors, failure]);
  const messages: Record<string, string> = {
    name: c.nameError,
    facultyCode: c.facultyError,
    admissionYear: c.yearError,
    serial: c.serialError,
    phone: c.phoneError,
    topicIds: c.topicsError,
    consent: c.consentError,
  };
  async function submit() {
    if (!parsed || sending.current) return;
    sending.current = true;
    setStep("submitting");
    setFailure(null);
    try {
      const response = await fetch(
        "/api/university-notification-registrations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        },
      );
      if (response.status !== 202) {
        const error = (await response.json().catch(() => null)) as {
          error?: { fields?: Record<string, string> };
        } | null;
        if (error?.error?.fields?.admissionYear) {
          const options = (await fetch("/api/university-notification-options", {
            cache: "no-store",
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)) as {
            data?: { admissionYears: number[] };
          } | null;
          if (options?.data) {
            setYears(options.data.admissionYears);
            setValidationDate(
              `${options.data.admissionYears[0]}-09-01T00:00:00Z`,
            );
          }
          setFailure("year");
          setErrors(error.error.fields);
        } else setFailure("server");
        setStep("input");
      } else setStep("success");
    } catch {
      setFailure("server");
      setStep("input");
    } finally {
      sending.current = false;
    }
  }
  return (
    <div
      className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-12"
      data-public-state={
        step === "input"
          ? "reg-form"
          : step === "confirm"
            ? "reg-confirm"
            : step === "submitting"
              ? "reg-submitting"
              : "reg-success"
      }
    >
      <nav aria-label={c.breadcrumb} className="text-sm text-fg-muted">
        <Link href="/" className="hover:text-accent hover:underline">
          {c.home}
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{c.registrationTitle}</span>
      </nav>
      <div className="mt-8 max-w-3xl">
        <p className="text-sm font-bold text-accent">{c.brand}</p>
        <h1 className="mt-2 text-3xl font-bold md:text-4xl">
          {c.registrationTitle}
        </h1>
        <p className="mt-4 leading-8 text-fg-muted">{c.registrationLead}</p>
        <p className="mt-4 rounded-md border border-line bg-surface-raised p-3 text-sm">
          {c.demoRegistration}
        </p>
        <ol
          aria-label={c.steps}
          className="my-8 flex flex-wrap gap-6 border-b border-line pb-4 text-sm"
        >
          {[c.inputStep, c.confirmStep, c.successStep].map((label, i) => (
            <li
              key={label}
              aria-current={
                (step === "input" ? 0 : step === "success" ? 2 : 1) === i
                  ? "step"
                  : undefined
              }
              className={
                (step === "input" ? 0 : step === "success" ? 2 : 1) === i
                  ? "font-bold text-accent"
                  : "text-fg-muted"
              }
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>
        {step === "input" && (
          <form
            id="student-registration-form"
            noValidate
            className="space-y-7"
            onSubmit={(e) => {
              e.preventDefault();
              setFailure(null);
              if (!key.current) key.current = crypto.randomUUID();
              try {
                const next = parseRegistration(
                  registrationPayload(value, key.current),
                  new Date(validationDate),
                );
                setParsed(next);
                setErrors({});
                setStep("confirm");
              } catch (error) {
                setErrors(
                  error instanceof OutreachError ? (error.fields ?? {}) : {},
                );
              }
            }}
          >
            {failure && (
              <div
                id="registration-server-error"
                role="alert"
                tabIndex={-1}
                ref={(node) => {
                  focusTarget.current = node;
                }}
                className="border-l-4 border-red-600 p-4 text-sm text-red-700 dark:text-red-300"
              >
                {failure === "year" ? c.yearChanged : c.serverError}
              </div>
            )}
            {Object.keys(errors).length > 0 && (
              <div
                id="registration-errors"
                role="alert"
                tabIndex={-1}
                ref={(node) => {
                  focusTarget.current = node;
                }}
                className="border-l-4 border-red-600 p-4 text-sm text-red-700 dark:text-red-300"
              >
                <p className="font-bold">{c.inputError}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {Object.keys(errors).map((field) => (
                    <li key={field}>{messages[field]}</li>
                  ))}
                </ul>
              </div>
            )}
            <RegistrationFields
              value={value}
              onChange={(next) => {
                setValue(next);
                key.current = null;
              }}
              years={years}
              errors={errors}
            />
            <button
              id="registration-confirm"
              type="submit"
              className={outreachPrimary}
            >
              {c.reviewRegistration}
            </button>
          </form>
        )}
        {(step === "confirm" || step === "submitting") && parsed && (
          <section className="space-y-6">
            <h2
              tabIndex={-1}
              ref={(node) => {
                if (step === "confirm") focusTarget.current = node;
              }}
              className="text-xl font-bold"
            >
              {c.confirmTitle}
            </h2>
            <RegistrationConfirmation value={parsed} />
            <p className="text-sm leading-7 text-fg-muted">{c.confirmNote}</p>
            <div className="flex flex-wrap gap-3">
              <button
                id="registration-back"
                disabled={step === "submitting"}
                className={outreachSecondary}
                onClick={() => {
                  setStep("input");
                  requestAnimationFrame(() =>
                    document.getElementById("student-name")?.focus(),
                  );
                }}
              >
                {c.editInput}
              </button>
              <button
                id="registration-submit"
                disabled={step === "submitting"}
                className={outreachPrimary}
                onClick={() => void submit()}
              >
                {step === "submitting" ? c.submitting : c.submitRegistration}
              </button>
            </div>
            <p role="status" aria-live="polite">
              {step === "submitting" ? c.pleaseWait : ""}
            </p>
          </section>
        )}
        {step === "success" && (
          <section
            id="registration-success"
            className="space-y-5"
            aria-labelledby="registration-success-title"
          >
            <h2
              id="registration-success-title"
              tabIndex={-1}
              ref={(node) => {
                focusTarget.current = node;
              }}
              className="text-xl font-bold"
            >
              {c.successTitle}
            </h2>
            <p className="leading-7">{c.successLead}</p>
            <p className="text-sm leading-7 text-fg-muted">{c.successNote}</p>
            <Link
              href="/"
              className={`${outreachSecondary} inline-flex items-center`}
            >
              {c.backHome}
            </Link>
          </section>
        )}
        <section className="mt-10 border-t border-line pt-6 text-sm leading-7 text-fg-muted">
          <h2 className="font-bold text-fg">{c.helpTitle}</h2>
          <p>{c.helpLead}</p>
          <Link
            href="/consultation"
            className="mt-2 inline-flex items-center gap-2 text-accent underline"
          >
            {c.supportLink}
          </Link>
        </section>
      </div>
    </div>
  );
}
