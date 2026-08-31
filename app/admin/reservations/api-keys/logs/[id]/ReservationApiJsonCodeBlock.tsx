"use client";

import { useState } from "react";

import { ContentCopyIcon } from "@/app/components/svg/ContentCopyIcon";
import type { ReservationApiRequestLogDetail } from "@/lib/server/reservation-api-request-logs";

export type ReservationApiJsonValue =
  ReservationApiRequestLogDetail["responseBody"];

export type ReservationApiJsonToken = {
  kind:
    | "whitespace"
    | "key"
    | "string"
    | "number"
    | "boolean"
    | "null"
    | "punctuation";
  text: string;
};

const JSON_TOKEN_PATTERN = /"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:]/gu;

const TOKEN_CLASS_NAMES: Record<
  Exclude<ReservationApiJsonToken["kind"], "whitespace">,
  string
> = {
  key: "text-blue-700 dark:text-blue-300",
  string: "text-green-700 dark:text-green-300",
  number: "text-amber-700 dark:text-amber-300",
  boolean: "text-blue-700 dark:text-blue-300",
  null: "text-red-700 dark:text-red-300",
  punctuation: "text-fg-muted",
};

export function ReservationApiJsonCodeBlock({
  id,
  value,
  copyLabel,
  copiedMessage,
  copyFailedMessage,
}: {
  id: string;
  value: ReservationApiJsonValue;
  copyLabel: string;
  copiedMessage: string;
  copyFailedMessage: string;
}) {
  const tokens = tokenizeReservationApiJson(value);
  const serialized = tokens.map(({ text }) => text).join("");
  const representedKinds = new Set<ReservationApiJsonToken["kind"]>();
  const [feedback, setFeedback] = useState<"success" | "failure" | null>(null);
  const feedbackId = `${id.replace(/-json$/u, "")}-copy-feedback`;

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(serialized);
      setFeedback("success");
    } catch {
      setFeedback("failure");
    }
  };

  return (
    <>
      <div id={`${id}-panel`} className="relative mt-2 max-w-full rounded-lg border border-line bg-surface-accent-subtle font-mono text-sm leading-6">
        <button
          id={`copy-${id}`}
          type="button"
          aria-label={copyLabel}
          title={copyLabel}
          onClick={copyJson}
          className="absolute right-2 top-2 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border border-line bg-surface-raised text-fg-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:text-accent"
        >
          <ContentCopyIcon className="h-5 w-5" />
        </button>
        <pre className="max-w-full overflow-x-auto p-4 pr-16">
          <code id={id} className="text-fg-muted">
            {tokens.map((token, index) => {
              if (token.kind === "whitespace") return token.text;
              const isFirstOfKind = !representedKinds.has(token.kind);
              representedKinds.add(token.kind);
              return (
                <span
                  key={`${index}-${token.kind}`}
                  id={isFirstOfKind ? `${id}-${token.kind}` : undefined}
                  className={TOKEN_CLASS_NAMES[token.kind]}
                >
                  {token.text}
                </span>
              );
            })}
          </code>
        </pre>
      </div>
      {feedback ? (
        <p
          id={feedbackId}
          role={feedback === "success" ? "status" : "alert"}
          aria-live={feedback === "success" ? "polite" : undefined}
          className={`mt-2 text-sm font-semibold ${feedback === "success" ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}
        >
          {feedback === "success" ? copiedMessage : copyFailedMessage}
        </p>
      ) : null}
    </>
  );
}

export function tokenizeReservationApiJson(
  value: ReservationApiJsonValue,
): ReservationApiJsonToken[] {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) {
    throw new TypeError("Reservation API log JSON must be serializable.");
  }

  const tokens: ReservationApiJsonToken[] = [];
  let cursor = 0;
  for (const match of serialized.matchAll(JSON_TOKEN_PATTERN)) {
    const index = match.index;
    if (index > cursor) {
      tokens.push({ kind: "whitespace", text: serialized.slice(cursor, index) });
    }
    const text = match[0];
    tokens.push({
      kind: classifyJsonToken(text, serialized.slice(index + text.length)),
      text,
    });
    cursor = index + text.length;
  }
  if (cursor < serialized.length) {
    tokens.push({ kind: "whitespace", text: serialized.slice(cursor) });
  }
  return tokens;
}

function classifyJsonToken(
  token: string,
  remainder: string,
): Exclude<ReservationApiJsonToken["kind"], "whitespace"> {
  if (/^[{}\[\],:]$/u.test(token)) return "punctuation";
  if (token === "true" || token === "false") return "boolean";
  if (token === "null") return "null";
  if (token.startsWith('"')) return /^\s*:/u.test(remainder) ? "key" : "string";
  return "number";
}
