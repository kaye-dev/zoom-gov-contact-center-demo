import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { dictionaries, locales } from "../app/i18n/dictionaries";
import {
  ReservationApiJsonCodeBlock,
  tokenizeReservationApiJson,
} from "../app/admin/reservations/api-keys/logs/[id]/ReservationApiJsonCodeBlock";

import {
  digestReservationApiKey,
  generateReservationApiKey,
  parseReservationApiKey,
  previewReservationApiKey,
  verifyReservationApiKey,
} from "../lib/server/reservation-api-keys";

test("raw reservation API keys use cryptographic format and one-way digest", () => {
  const first = generateReservationApiKey();
  const second = generateReservationApiKey();
  assert.match(first.rawKey, /^zgcc_rsv_[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}$/u);
  assert.notEqual(first.rawKey, second.rawKey);
  assert.deepEqual(parseReservationApiKey(first.rawKey), { publicId: first.publicId });
  const digest = digestReservationApiKey(first.rawKey);
  assert.match(digest, /^[a-f0-9]{64}$/u);
  assert.equal(verifyReservationApiKey(first.rawKey, digest), true);
  assert.equal(verifyReservationApiKey(second.rawKey, digest), false);
  assert.equal(digest.includes(first.rawKey), false);
});

test("key previews reveal only bounded public identifier fragments", () => {
  const preview = previewReservationApiKey("1234567890abcdef");
  assert.equal(preview, "zgcc_rsv_1234••••cdef");
  assert.equal(preview.includes("567890ab"), false);
});

test("API key management keeps a VIEW-enabled link to request logs", () => {
  const source = sourceFile(
    "../app/admin/reservations/api-keys/ReservationApiKeysView.tsx",
  );
  assert.match(source, /id="api-log-list-link"/u);
  assert.match(source, /href="\/admin\/reservations\/api-keys\/logs"/u);
  assert.match(source, /\{copy\.logs\.entry\}/u);
  assert.doesNotMatch(
    source,
    /id="api-log-list-link"[^>]*(?:disabled|aria-disabled)/u,
  );
});

test("API request log list has required columns and native row links", () => {
  const source = sourceFile(
    "../app/admin/reservations/api-keys/logs/ReservationApiRequestLogsView.tsx",
  );
  for (const selector of [
    "reservation-api-log-list-content",
    "api-log-filter-form",
    "api-log-list-card",
    "api-log-result-count",
    "api-log-list-wrap",
    "api-log-list-grid",
    "api-log-row-primary",
    "api-log-empty",
    "api-log-pagination",
  ]) {
    assert.match(source, new RegExp(selector, "u"), selector);
  }
  for (const property of [
    "requestedAt",
    "apiKey",
    "method",
    "api",
    "result",
    "duration",
    "requestId",
  ]) {
    assert.match(source, new RegExp(`copy\\.list\\.${property}`, "u"), property);
  }
  assert.match(source, /<Link id=\{index === 0 \? "api-log-row-primary"/u);
  assert.match(source, /encodeURIComponent\(log\.id\)/u);
  assert.doesNotMatch(source, /role="link"|tabIndex=\{?0\}?/u);
});

test("API request log rows preserve full-width hover and focus after horizontal scroll", () => {
  const source = sourceFile(
    "../app/admin/reservations/api-keys/logs/ReservationApiRequestLogsView.tsx",
  );
  assert.match(source, /id="api-log-list-wrap"[^>]*className="max-w-full overflow-x-auto"/u);
  assert.match(source, /id="api-log-list-grid"[^>]*className="min-w-\[1720px\] text-sm"/u);
  assert.match(source, /grid w-full grid-cols-\[192px_304px_112px_432px_120px_120px_300px\] gap-4/u);
  assert.match(source, /hover:bg-surface-hover focus:bg-surface-hover/u);
  assert.match(source, /focus-visible:outline-offset-\[-2px\]/u);
  assert.match(source, /<code className="min-w-0 truncate text-xs text-fg-muted">\{log\.id\}<\/code>/u);
});

test("API request log detail exposes request, response, and properties selectors", () => {
  const source = sourceFile(
    "../app/admin/reservations/api-keys/logs/[id]/ReservationApiRequestLogDetailView.tsx",
  );
  for (const selector of [
    "reservation-api-log-detail-content",
    "back-to-api-logs",
    "api-log-detail-id",
    "api-log-request",
    "api-log-request-json",
    "api-log-response",
    "api-log-response-json",
    "api-log-properties",
  ]) {
    assert.match(source, new RegExp(selector, "u"), selector);
  }
  assert.match(source, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(18rem,22rem\)\]/u);
  assert.match(source, /lg:sticky lg:top-24/u);
});

test("reservation API JSON rendering is syntax-colored, safe, and round-trips", () => {
  const value = {
    string: "escaped \\\" quote \\\\ slash\n</code><script>alert(1)</script>",
    integer: -12,
    decimal: 1.25e3,
    yes: true,
    no: false,
    nothing: null,
    nested: ["value", 3],
  };
  const tokens = tokenizeReservationApiJson(value);
  const serialized = tokens.map(({ text }) => text).join("");
  assert.equal(serialized, JSON.stringify(value, null, 2));
  assert.deepEqual(JSON.parse(serialized), value);
  assert.deepEqual(
    new Set(tokens.map(({ kind }) => kind)),
    new Set(["whitespace", "key", "string", "number", "boolean", "null", "punctuation"]),
  );

  const markup = renderToStaticMarkup(createElement(ReservationApiJsonCodeBlock, {
    id: "safe-json",
    value,
    copyLabel: "Copy JSON",
    copiedMessage: "Copied.",
    copyFailedMessage: "Copy failed.",
  }));
  assert.match(markup, /id="safe-json-panel"/u);
  assert.match(markup, /bg-surface-accent-subtle/u);
  for (const id of ["key", "string", "number", "boolean", "null", "punctuation"]) {
    assert.match(markup, new RegExp(`id="safe-json-${id}"`, "u"), id);
  }
  assert.match(markup, /text-blue-700/u);
  assert.match(markup, /text-green-700/u);
  assert.match(markup, /text-amber-700/u);
  assert.match(markup, /text-red-700/u);
  assert.doesNotMatch(markup, /<script>|<\/code><script>/u);
  assert.match(markup, /&lt;\/code&gt;&lt;script&gt;/u);

  const source = sourceFile(
    "../app/admin/reservations/api-keys/logs/[id]/ReservationApiJsonCodeBlock.tsx",
  );
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/u);
});

test("API key table keeps identifiers and all permissions on one line", () => {
  const source = sourceFile(
    "../app/admin/reservations/api-keys/ReservationApiKeysView.tsx",
  );
  assert.match(source, /id="api-key-table"[^>]*table-fixed min-w-\[1450px\]/u);
  assert.match(source, /<col className="w-\[260px\]" \/><col className="w-\[390px\]"/u);
  assert.match(source, /id=\{index === 0 \? "active-key-name"[^>]*className="truncate whitespace-nowrap font-semibold"/u);
  assert.match(source, /id=\{index === 0 \? "active-key-preview"[^>]*className="mt-1 block whitespace-nowrap/u);
  assert.match(source, /id=\{index === 0 \? "active-key-permissions"[^>]*className="flex flex-nowrap gap-1\.5 whitespace-nowrap"/u);
  assert.match(source, /shrink-0 whitespace-nowrap rounded-full/u);
  assert.match(source, /RESERVATION_API_PERMISSIONS/u);
  assert.match(source, /"DELETE"/u);
});

test("API key table uses concise quota copy", () => {
  const source = sourceFile(
    "../app/admin/reservations/api-keys/ReservationApiKeysView.tsx",
  );
  assert.equal(dictionaries.ja.admin.reservationManagement.apiKeys.keys.monthlyLimit, "月間上限");
  assert.match(source, /id=\{index === 0 \? "active-key-usage"[^>]*><span className="font-semibold">/u);
  const usageCell = source.match(/<td id=\{index === 0 \? "active-key-usage"[\s\S]*?<\/td>/u)?.[0] ?? "";
  assert.doesNotMatch(usageCell, /copy\.keys\.remaining|usage\.remaining/u);
  for (const locale of locales) {
    assert.ok(dictionaries[locale].admin.reservationManagement.apiKeys.keys.monthlyLimit, locale);
  }
});

test("public API table renders readable endpoint paths and natural READ copy", () => {
  const source = sourceFile(
    "../app/admin/reservations/api-keys/ReservationApiKeysView.tsx",
  );
  assert.match(source, /id="public-api-table"[^>]*table-fixed min-w-\[960px\]/u);
  assert.match(source, /<col className="w-\[140px\]" \/><col className="w-\[140px\]" \/><col className="w-\[420px\]" \/><col className="w-\[260px\]"/u);
  assert.match(source, /<span id=\{index === 0 \? "public-api-endpoint-primary"[^>]*className="whitespace-nowrap font-mono text-sm font-semibold text-fg">\{row\.endpoint\}<\/span>/u);
  assert.doesNotMatch(source, /<code[^>]*>\{row\.endpoint\}<\/code>/u);
  assert.equal(dictionaries.ja.admin.reservationManagement.apiKeys.api.descriptions.READ, "指定した予約の取得");
});

test("API log list separates method and readable API paths", () => {
  const source = sourceFile(
    "../app/admin/reservations/api-keys/logs/ReservationApiRequestLogsView.tsx",
  );
  assert.match(source, /copy\.list\.method/u);
  assert.match(source, /copy\.list\.api/u);
  assert.match(source, /id=\{index === 0 \? "api-log-row-primary-method"/u);
  assert.match(source, /id=\{index === 0 \? "api-log-row-primary-endpoint"/u);
  assert.match(source, /title=\{log\.path\}/u);
  assert.match(source, /className="min-w-0 truncate whitespace-nowrap font-mono text-sm font-semibold text-fg"/u);
  assert.doesNotMatch(source, /<code[^>]*>\{log\.path\}<\/code>/u);
});

test("reservation API tables preserve fixed columns inside local horizontal scroll", () => {
  const keySource = sourceFile(
    "../app/admin/reservations/api-keys/ReservationApiKeysView.tsx",
  );
  const logSource = sourceFile(
    "../app/admin/reservations/api-keys/logs/ReservationApiRequestLogsView.tsx",
  );
  assert.match(keySource, /id="public-api-table"[^>]*min-w-\[960px\]/u);
  assert.match(keySource, /id="api-key-table"[^>]*min-w-\[1450px\]/u);
  assert.match(logSource, /id="api-log-list-grid"[^>]*min-w-\[1720px\]/u);
  assert.match(keySource, /id="api-key-table-wrap" className="max-w-full overflow-x-auto"/u);
  assert.match(logSource, /id="api-log-list-wrap"[^>]*className="max-w-full overflow-x-auto"/u);
  assert.doesNotMatch(keySource, /(?:sm|md|lg):min-w-\[(?:960|1450)px\]/u);
  assert.doesNotMatch(logSource, /(?:sm|md|lg):min-w-\[1720px\]/u);
});

test("API key status badges never wrap", () => {
  const source = sourceFile(
    "../app/admin/reservations/api-keys/ReservationApiKeysView.tsx",
  );
  assert.match(source, /<td className="whitespace-nowrap px-5 py-4 text-center align-top"><span[^>]*className=\{`inline-flex whitespace-nowrap/u);
});

test("API key rows use the shared overflow-safe actions menu", () => {
  const source = sourceFile(
    "../app/admin/reservations/api-keys/ReservationApiKeysView.tsx",
  );
  assert.match(source, /function ApiKeyActionsMenu/u);
  assert.match(source, /<MoreHorizIcon className="h-6 w-6" \/>/u);
  assert.match(source, /createPortal\(menu, document\.body\)/u);
  assert.match(source, /role="menu"/u);
  assert.match(source, /role="menuitem"/u);
  assert.match(source, /querySelector<HTMLElement>\("\[role='menuitem'\]"\)\?\.focus\(\)/u);
  assert.match(source, /event\.key !== "Escape"/u);
  assert.match(source, /window\.addEventListener\("scroll", close, true\)/u);
  assert.match(source, /disabled=\{!canEdit\}/u);
  assert.match(source, /className="border-t border-line-subtle"/u);
});

test("API log JSON code blocks reuse ContentCopyIcon and copy exact serialized JSON", () => {
  const source = sourceFile(
    "../app/admin/reservations/api-keys/logs/[id]/ReservationApiJsonCodeBlock.tsx",
  );
  assert.match(source, /ContentCopyIcon/u);
  assert.match(source, /navigator\.clipboard\.writeText\(serialized\)/u);
  assert.match(source, /role=\{feedback === "success" \? "status" : "alert"\}/u);
  assert.match(source, /aria-label=\{copyLabel\}/u);
  assert.match(source, /title=\{copyLabel\}/u);
});

test("API log JSON copy buttons keep a distinct raised surface on hover", () => {
  const source = sourceFile(
    "../app/admin/reservations/api-keys/logs/[id]/ReservationApiJsonCodeBlock.tsx",
  );
  assert.match(source, /bg-surface-raised text-fg-muted transition-colors hover:text-accent/u);
  assert.match(source, /focus-visible:text-accent/u);
  assert.doesNotMatch(source, /hover:bg-surface-hover/u);
  const design = sourceFile("../DESIGN.md");
  assert.match(design, /button面は通常・hover・focusで `bg-surface-raised` を維持/u);
  assert.match(design, /アイコン色だけを `text-accent`/u);
});

test("all locales contain the complete reservation API request log copy", () => {
  const shape = (value: unknown): unknown => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return typeof value;
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, shape(item)]),
    );
  };
  const expectedShape = shape(dictionaries.ja.admin.reservationManagement.apiKeys.logs);
  for (const locale of locales) {
    const copy = dictionaries[locale].admin.reservationManagement.apiKeys.logs;
    assert.deepEqual(shape(copy), expectedShape, locale);
    assert.ok(copy.entry && copy.list.requestedAt && copy.list.apiKey, locale);
    assert.ok(copy.detail.request && copy.detail.response && copy.detail.properties, locale);
  }
});

function sourceFile(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
