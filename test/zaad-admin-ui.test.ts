import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement, useState } from "react";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import { renderAdmin } from "./admin-ui-render";
import { buildResidentRowActions } from "../app/admin/zaad/ZaadView";
import { activateRowAction } from "../app/components/admin/table-row-actions";

import {
  getZaadCsvFieldLabel,
  getZaadCsvReasonLabel,
  getZaadErrorMessage,
  sanitizeZaadCsvErrorDetails,
} from "../app/i18n/zaad-error-messages";
import { zaadDictionaries } from "../app/i18n/zaad-dictionaries";
import { ZAAD_ERROR_CODES } from "../lib/zaad/contracts";

const viewSource = readFileSync(
  new URL("../app/admin/zaad/ZaadView.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../app/admin/zaad/page.tsx", import.meta.url),
  "utf8",
);
const modalSource = readFileSync(
  new URL("../app/components/admin/ModalDialog.tsx", import.meta.url),
  "utf8",
);

test("ROW-ZAAD: retry eligibility, disabled count, row identity and revision are retained", () => {
  const resident = {
    id: "resident", name: "Resident", email: "sample@example.invalid", phone: "+81312345678", consentStatus: "CONSENTED", source: "ADMIN",
    revision: 7, contactList: null, syncStatus: "FAILED", syncErrorCode: "FAILED", createdAt: "2026-09-01", updatedAt: "2026-09-01",
  };
  const calls: unknown[] = [];
  const callbacks = {
    onEdit: (id: string, trigger: HTMLButtonElement) => { calls.push(["edit", id, trigger]); },
    onDelete: (id: string, trigger: HTMLButtonElement) => { calls.push(["delete", id, trigger]); },
    onRetry: (row: Parameters<typeof buildResidentRowActions>[0]["resident"]) => { calls.push(row); },
  };
  const trigger = {} as HTMLButtonElement;
  for (const pending of [false, true]) for (const allowed of [false, true]) {
    const actions = buildResidentRowActions({ resident, pending, permissions: { create: allowed, update: allowed, delete: allowed }, copy: zaadDictionaries.ja, ...callbacks });
    assert.deepEqual(actions.map(item => item.id), ["retry", "edit", "delete"]);
    assert.ok(actions.every(item => item.disabled === (pending || !allowed)));
    for (const action of actions) activateRowAction(action.disabled, () => action.onSelect?.(trigger));
    if (pending || !allowed) assert.ok(actions.every(item => item.disabledReason));
  }
  assert.deepEqual(calls, [resident, ["edit", resident.id, trigger], ["delete", resident.id, trigger]]);
  for (const row of [{ ...resident, syncStatus: "SYNCED" }, { ...resident, syncErrorCode: "ZAAD_ZOOM_RESULT_UNKNOWN" }]) {
    const actions = buildResidentRowActions({ resident: row, pending: false, permissions: { create: true, update: true, delete: true }, copy: zaadDictionaries.ja, ...callbacks });
    assert.deepEqual(actions.map(item => item.id), ["edit", "delete"]);
  }
});

function renderResidents(state?: string, canViewDeveloperApi = true) {
  const filename = path.resolve("app/admin/zaad/ZaadView.tsx");
  const localRequire = createRequire(filename);
  const code = ts.transpileModule(viewSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const target = { exports: {} as { ZaadView: typeof import("../app/admin/zaad/ZaadView").ZaadView } };
  let residentLoadedState = false;
  const resident = { id: "test-resident", name: "Test Resident", email: "test@example.invalid", phone: "+81312345678", consentStatus: "CONSENTED", source: "ADMIN", revision: 1, contactList: null, syncStatus: "SYNCED", syncErrorCode: null, createdAt: "2026-09-01", updatedAt: "2026-09-01" };
  new Function("require", "module", "exports", code)((name: string) => {
    if (name === "react") return { ...localRequire("react"), useState: (initial: unknown) => {
      let value = initial === "pending" ? state ?? "pending" : initial;
      if (residentLoadedState) {
        residentLoadedState = false;
        value = state !== undefined && !["pending", "failure"].includes(state);
      } else if (initial && typeof initial === "object" && "residents" in initial) {
        residentLoadedState = true;
        const residents = state === "ready" ? [resident] : [];
        value = { residents, metrics: { total: residents.length, consented: residents.length, synced: residents.length, needsAttention: 0 }, nextCursor: null };
      }
      return useState(value);
    } };
    return localRequire(name.startsWith("@/") ? path.resolve(name.slice(2)) : name);
  }, target, target.exports);
  return renderAdmin(createElement(target.exports.ZaadView, {
    initialView: "residents", canViewDeveloperApi,
    permissions: { create: false, update: false, delete: false },
  }), "/admin/zaad");
}

test("CSV import opens before any result exists and shows no fabricated success", () => {
  const localRequire = createRequire(path.resolve("app/admin/zaad/ZaadView.tsx"));
  const code = ts.transpileModule(`${viewSource}\nexports.ZaadDialog = ZaadDialog;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const target = { exports: {} as Record<string, import("react").ComponentType<Record<string, unknown>>> };
  new Function("require", "module", "exports", code)((name: string) => {
    if (name === "@/app/components/admin/ModalDialog") return { ModalDialog: ({ children }: { children: import("react").ReactNode }) => children };
    return localRequire(name.startsWith("@/") ? path.resolve(name.slice(2)) : name);
  }, target, target.exports);
  const html = renderAdmin(createElement(target.exports.ZaadDialog, {
    dialog: "csv-import", state: "ready", copy: zaadDictionaries.ja, locale: "ja",
    selectedResident: null, selectedMessage: null, selectedContactList: null, selectedCampaign: null,
    permissions: { create: true, update: true, delete: true }, oneTimeReview: null,
    errorCode: null, errorDetails: [], close: () => {}, setState: () => {}, onMutation: () => {}, onError: () => {},
  }), "/admin/zaad");
  assert.match(html, /type="file"/);
  assert.doesNotMatch(html, /98|synthetic|fixture/);
});

test("ZAAD-HELP-01 / ZAAD-HEADER-04/05: title help and responsive API action column", () => {
  const html = renderResidents("ready", false);
  assert.match(html, /role="tooltip" class="sr-only"/);
  assert.match(html, /aria-label="オートリーチについて"/);
  assert.match(html, /lg:grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(html, /flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:flex-nowrap/);
  assert.match(html, /aria-describedby="zaad-developer-api-permission-reason"/);
  const header = viewSource.slice(viewSource.indexOf("<header"), viewSource.indexOf("</header>"));
  assert.equal((header.match(/shrink-0 whitespace-nowrap/g) ?? []).length, 2);
  assert.match(header, /<ZaadTitleHelp title=\{copy.title\} description=\{copy.description\}/);
  assert.doesNotMatch(header, /<p[^>]*>\s*\{copy.description\}/);
});

test("SEARCH-07 / COUNT-08: initial data is unknown; confirmed zero is inline; search remains editable", () => {
  for (const state of [undefined, "pending", "failure"]) {
    const html = renderResidents(state);
    const heading = html.match(/<h3 id="zaad-results-heading"[^>]*>([\s\S]*?)<\/h3>/)?.[1];
    assert.ok(heading); assert.doesNotMatch(heading, /<span/);
    assert.doesNotMatch(html, /type="search"[^>]*disabled/);
    if (state === undefined) assert.doesNotMatch(html, /住民サンプル|resident_fixture/);
  }
  const empty = renderResidents("empty");
  assert.match(empty, /id="zaad-results-heading"[^>]*>防災行政無線の登録住民<span class="text-sm font-medium text-fg-muted whitespace-nowrap">（0人）<\/span>/);
  const section = viewSource.slice(viewSource.indexOf("function ResidentsSection"), viewSource.indexOf("function MessagesSection"));
  assert.match(section, /<SearchInput/);
  assert.doesNotMatch(section, /copy.common.search|copy.common.clear|<form|type="submit"/);
  assert.match(section, /onCompositionStart/); assert.match(section, /onCompositionEnd/);
  assert.match(section, /aria-busy=\{pending\}/); assert.match(section, /aria-live="polite"/);
  assert.match(viewSource, /state === "failure" && view !== "residents"/);
  assert.ok(section.indexOf('state === "failure" ?') < section.indexOf('state === "empty" ||'));
});

test("ACCESS-13: disabled resident mutations and pagination keep server contracts and API access reasons", () => {
  const html = renderResidents("ready", false);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /disabled=""[^>]*>CSV/);
  const section = viewSource.slice(viewSource.indexOf("function ResidentsSection"), viewSource.indexOf("function MessagesSection"));
  assert.match(section, /disabled=\{pending \|\| !permissions.create\}/);
  assert.match(section, /disabled: pending \|\| !permissions.update/);
  assert.match(section, /disabled: pending \|\| !permissions.delete/);
  assert.match(viewSource, /params.set\("query", query\)/); assert.match(viewSource, /params.set\("cursor", cursor\)/);
  assert.match(viewSource, /controller.dispose\(\)/);
});

test("ZAAD section navigation uses the approved order and Japanese terminology", () => {
  const orderSource = viewSource.match(
    /const SECTION_ORDER: ZaadViewKey\[\] = \[([^\]]+)\]/u,
  )?.[1];
  assert.ok(orderSource);
  assert.deepEqual(
    [...orderSource.matchAll(/"([^"]+)"/gu)].map((match) => match[1]),
    [
      "residents",
      "contact-lists",
      "settings",
      "messages",
      "campaigns",
      "one-time",
    ],
  );
  assert.deepEqual(Object.values(zaadDictionaries.ja.sections), [
    "住民",
    "連絡リスト",
    "登録設定",
    "発信メッセージ",
    "定型キャンペーン",
    "単発キャンペーン",
  ]);
});

test("pointer section changes do not create the blue programmatic focus outline", () => {
  const changeView = viewSource.slice(
    viewSource.indexOf("const changeView"),
    viewSource.indexOf("const refresh"),
  );
  const navigation = viewSource.slice(
    viewSource.indexOf("<nav\n        aria-label={copy.title}"),
    viewSource.indexOf("{feedback ?"),
  );

  assert.match(navigation, /event\.preventDefault\(\);\s*changeView\(key\)/u);
  assert.match(navigation, /aria-current=\{active \? "page" : undefined\}/u);
  assert.match(navigation, /focus-visible:outline/u);
  assert.doesNotMatch(navigation, /\bfocus:outline/u);
  assert.match(changeView, /window\.history\.pushState\(null, "", url\)/u);
  assert.doesNotMatch(changeView, /window\.history\.replaceState/u);
  assert.doesNotMatch(changeView, /\.focus\s*\(/u);
  assert.doesNotMatch(changeView, /document\./u);
});

test("ZAAD section history reads the query and protects dirty back/forward navigation", () => {
  const source = readFileSync("app/admin/zaad/OutreachView.tsx", "utf8");
  assert.match(pageSource, /<OutreachView/u);
  assert.match(source, /useSearchParams\(\)/u);
  assert.match(source, /query\.get\("view"\)/u);
  assert.match(source, /window\.addEventListener\("popstate", pop, true\)/u);
  assert.match(source, /window\.removeEventListener\("popstate", pop, true\)/u);
  assert.match(source, /if \(!dirty && !saving\) return/u);
  assert.match(source, /setPending\(destination\)/u);
  assert.match(source, /resolveOutreachView\(tenant, query\.get\("view"\), query\.get\("workflow"\)\)/u);
});

test("ZAAD exposes all six query-backed sections and permission-disabled actions", () => {
  for (const view of [
    "residents",
    "contact-lists",
    "settings",
    "messages",
    "campaigns",
    "one-time",
  ]) {
    assert.match(viewSource, new RegExp(`data-zaad-view-link=\\{key\\}`, "u"));
    assert.match(viewSource, new RegExp(`view === "${view}"`, "u"));
  }
  assert.match(viewSource, /disabled=\{!permissions\.create\}/u);
  assert.match(viewSource, /disabled=\{!permissions\.update\}/u);
  assert.match(viewSource, /disabled=\{!permissions\.delete\}/u);
  assert.match(
    viewSource,
    /aria-describedby=\{disabled \? describedBy : undefined\}/u,
  );
  assert.match(viewSource, /disabled:cursor-not-allowed/u);
});

test("ZAAD section labels are complete in every supported locale", () => {
  const expectedKeys = [
    "campaigns",
    "contactLists",
    "messages",
    "oneTime",
    "residents",
    "settings",
  ];
  for (const [locale, dictionary] of Object.entries(zaadDictionaries)) {
    assert.deepEqual(
      Object.keys(dictionary.sections).sort(),
      expectedKeys,
      locale,
    );
    assert.ok(
      Object.values(dictionary.sections).every(
        (label) => label.trim().length > 0,
      ),
      locale,
    );
  }
});

test("stable ZAAD errors map to actionable localized guidance", () => {
  const expected = new Map<
    string,
    keyof (typeof zaadDictionaries.ja)["errors"]
  >([
    [ZAAD_ERROR_CODES.zoomContractUnconfirmed, "zoomContract"],
    [ZAAD_ERROR_CODES.zoomNotConfigured, "zoomMissing"],
    [ZAAD_ERROR_CODES.zoomScopeRequired, "zoomScope"],
    [ZAAD_ERROR_CODES.zoomCredentialsInvalid, "zoomCredentials"],
    [ZAAD_ERROR_CODES.zoomRateLimited, "rateLimited"],
    [ZAAD_ERROR_CODES.zoomUnavailable, "transient"],
    [ZAAD_ERROR_CODES.zoomInvalidResponse, "transient"],
    [ZAAD_ERROR_CODES.residentConflict, "conflict"],
    [ZAAD_ERROR_CODES.messageConflict, "conflict"],
    [ZAAD_ERROR_CODES.messageBodyRequiresShortening, "messageBodyRequiresShortening"],
    [ZAAD_ERROR_CODES.contactListConflict, "conflict"],
    [ZAAD_ERROR_CODES.registrationSettingConflict, "conflict"],
    [ZAAD_ERROR_CODES.campaignStatusConflict, "conflict"],
    [ZAAD_ERROR_CODES.oneTimeSnapshotStale, "conflict"],
    [ZAAD_ERROR_CODES.oneTimeSnapshotExpired, "conflict"],
    [ZAAD_ERROR_CODES.campaignStatusUnknown, "resultUnknown"],
    [ZAAD_ERROR_CODES.oneTimeResultUnknown, "resultUnknown"],
    [ZAAD_ERROR_CODES.zoomResultUnknown, "resultUnknown"],
    [ZAAD_ERROR_CODES.residentNotFound, "notFound"],
    [ZAAD_ERROR_CODES.messageNotFound, "notFound"],
    [ZAAD_ERROR_CODES.contactListNotFound, "notFound"],
    [ZAAD_ERROR_CODES.zoomNotFound, "notFound"],
    [ZAAD_ERROR_CODES.invalidRequest, "invalid"],
    [ZAAD_ERROR_CODES.invalidCsv, "invalid"],
    [ZAAD_ERROR_CODES.campaignNotAgentless, "invalid"],
    [ZAAD_ERROR_CODES.oneTimeRecipientsInvalid, "invalid"],
    [ZAAD_ERROR_CODES.zoomContactRejected, "invalid"],
    [ZAAD_ERROR_CODES.zoomInUse, "resourceInUse"],
    [ZAAD_ERROR_CODES.messageInUse, "resourceInUse"],
    ["ADMIN_ACCESS_DENIED", "permission"],
    ["AUTHENTICATION_REQUIRED", "authenticationRequired"],
    ["PASSWORD_CHANGE_REQUIRED", "passwordChangeRequired"],
  ]);

  for (const [locale, dictionary] of Object.entries(zaadDictionaries)) {
    for (const [code, key] of expected) {
      assert.equal(
        getZaadErrorMessage(code, dictionary),
        dictionary.errors[key],
        `${locale}: ${code}`,
      );
      assert.doesNotMatch(
        getZaadErrorMessage(code, dictionary),
        /ZAAD_[A-Z_]+/u,
        `${locale}: ${code}`,
      );
    }
    assert.equal(
      getZaadErrorMessage("ZAAD_UNRECOGNIZED", dictionary),
      dictionary.errors.generic,
      locale,
    );
    assert.ok(dictionary.apiSettingsPermission.trim().length > 0, locale);
  }
});

test("unknown TTS sync requires manual reconciliation and cannot be retried", () => {
  const messagesSection = viewSource.slice(
    viewSource.indexOf("function MessagesSection"),
    viewSource.indexOf("function ContactListsSection"),
  );

  assert.match(
    messagesSection,
    /selected\?\.syncStatus === "SYNC_FAILED"\s*&&\s*selected\.syncErrorCode === ZAAD_ERROR_CODES\.zoomResultUnknown/u,
  );
  assert.match(
    messagesSection,
    /id="zaad-message-result-unknown"\s+code=\{ZAAD_ERROR_CODES\.zoomResultUnknown\}/u,
  );
  assert.match(
    messagesSection,
    /selected\.syncStatus === "SYNC_FAILED" &&\s*!requiresManualReconciliation \? \(/u,
  );
  assert.ok(
    Object.entries(zaadDictionaries).every(([, dictionary]) =>
      dictionary.errors.resultUnknown.trim().length > 0),
  );
});

test("sections and dialogs share the safe ZAAD error mapper", () => {
  const errorBanner = viewSource.slice(
    viewSource.indexOf("function ErrorBanner"),
    viewSource.indexOf("function ActionButton"),
  );
  const dialog = viewSource.slice(
    viewSource.indexOf("function ZaadDialog"),
    viewSource.indexOf("function ResidentDialogForm"),
  );

  assert.match(errorBanner, /getZaadErrorMessage\(code, copy\)/u);
  assert.doesNotMatch(errorBanner, /\{code\}/u);
  assert.match(dialog, /getZaadErrorMessage\(errorCode, copy\)/u);
  assert.doesNotMatch(dialog, /copy\.errors\.generic/u);
});

test("Developer API settings navigation honors server-derived VIEW access", () => {
  assert.match(pageSource, /canConfigure=\{canAdminAccess\(actor, "developer-api", "VIEW"\)\}/u);
  const source = readFileSync("app/admin/zaad/OutreachView.tsx", "utf8");
  assert.match(source, /canConfigure \? <Link/u);
  assert.match(source, /const returnTo = `\/admin\/zaad\?\$\{new URLSearchParams\(\{ tenant, view: selected \}\)\}`/u);
  assert.match(source, /const setupHref = `\/admin\/developer-api\?\$\{new URLSearchParams\(\{ returnTo \}\)\}`/u);
  assert.match(source, /!canConfigure && copy\.setupPermission/u);
});

test("one-time confirmation renders the complete immutable preflight contract", () => {
  const confirmation = viewSource.slice(
    viewSource.indexOf("function OneTimeConfirmForm"),
    viewSource.indexOf("type CommonDialogBaseProps"),
  );
  const requiredIds = [
    "zaad-one-time-confirm-message",
    "zaad-one-time-confirm-voice",
    "zaad-one-time-confirm-lists",
    "zaad-one-time-confirm-residents",
    "zaad-one-time-confirm-duplicates",
    "zaad-one-time-confirm-unique",
    "zaad-one-time-confirm-operation-profile",
    "zaad-one-time-confirm-preflight-status",
    "zaad-one-time-confirm-acknowledgement",
  ];
  for (const id of requiredIds)
    assert.match(confirmation, new RegExp(`id="${id}"`, "u"), id);
  for (const property of [
    "selectedListCount",
    "selectedResidentCount",
    "duplicateCount",
    "recipientCount",
    "callerIdMasked",
    "queueName",
    "maxConcurrentCalls",
    "businessHours",
    "retryPolicy",
    "dncPolicy",
    "alwaysRunning",
    "expiresAt",
  ]) {
    assert.match(confirmation, new RegExp(`\\.${property}\\b`, "u"), property);
  }
  assert.match(confirmation, /copy\.oneTime\.immutable/u);
  assert.match(confirmation, /copy\.oneTime\.prepareDoesNotSend/u);
  assert.match(confirmation, /acknowledged: true/u);
});

test("CSV errors retain only safe structured details and localize the display", () => {
  const safeRows = Array.from({ length: 25 }, (_, index) => ({
    row: index + 1,
    field: index % 2 ? "email" : "phone",
    code: "INVALID_FORMAT",
  }));
  const sanitized = sanitizeZaadCsvErrorDetails([
    ...safeRows,
    { row: 26, field: "<script>", code: "PRIVATE_DETAIL" },
    { row: "27", field: "email", code: "INVALID_FORMAT" },
    { row: 28, field: "email", code: "contains unsafe text" },
  ]);
  assert.equal(sanitized.length, 20);
  assert.deepEqual(sanitized[0], {
    row: 1,
    field: "phone",
    code: "INVALID_FORMAT",
  });
  assert.deepEqual(sanitized[19], {
    row: 20,
    field: "email",
    code: "INVALID_FORMAT",
  });
  assert.deepEqual(
    sanitizeZaadCsvErrorDetails([
      { row: 1, field: "<script>", code: "PRIVATE_DETAIL" },
      { row: "2", field: "email", code: "INVALID_FORMAT" },
      { row: 3, field: "email", code: "contains unsafe text" },
    ]),
    [],
  );

  for (const [locale, dictionary] of Object.entries(zaadDictionaries)) {
    assert.equal(
      getZaadCsvFieldLabel("email", dictionary),
      dictionary.residents.email,
      locale,
    );
    assert.equal(
      getZaadCsvFieldLabel("unknown", dictionary),
      dictionary.residents.csvFieldRow,
      locale,
    );
    assert.equal(
      getZaadCsvReasonLabel("INVALID_FORMAT", dictionary),
      dictionary.residents.csvReasonInvalidFormat,
      locale,
    );
    assert.equal(
      getZaadCsvReasonLabel("PRIVATE_DETAIL", dictionary),
      dictionary.residents.csvReasonInvalidValue,
      locale,
    );
  }

  assert.match(
    viewSource,
    /code === ZAAD_ERROR_CODES\.invalidCsv\s*\? sanitizeZaadCsvErrorDetails\(body\.details\)\s*: \[\]/u,
  );
  assert.match(viewSource, /details\.slice\(0, 20\)\.map/u);
  for (const metric of ["totalRows", "createdCount", "duplicateCount"]) {
    assert.match(viewSource, new RegExp(`name="${metric}"`, "u"), metric);
  }
});

test("new ZAAD labels are complete and localized in all five dictionaries", () => {
  const residentKeys = [
    "sourceWeb",
    "sourceAdmin",
    "sourceCsv",
    "csvResultTotal",
    "csvResultCreated",
    "csvResultDuplicates",
    "csvErrorHeading",
    "csvErrorRow",
    "csvErrorField",
    "csvErrorReason",
    "formInvalid",
    "csvFileRequired",
  ] as const;
  const oneTimeKeys = [
    "selection",
    "duplicatesRemoved",
    "uniqueRecipients",
    "selectedLists",
    "selectedResidents",
    "messageContent",
    "maskedCaller",
    "queue",
    "maxConcurrency",
    "businessHours",
    "retryPolicy",
    "dncPolicy",
    "alwaysRunning",
    "enabled",
    "disabled",
    "expiresAt",
    "prepareDoesNotSend",
    "recipientRules",
    "selectionReason",
  ] as const;
  assert.equal(Object.keys(zaadDictionaries).length, 5);
  for (const [locale, dictionary] of Object.entries(zaadDictionaries)) {
    for (const key of residentKeys)
      assert.ok(
        dictionary.residents[key].trim(),
        `${locale}: residents.${key}`,
      );
    for (const key of oneTimeKeys)
      assert.ok(dictionary.oneTime[key].trim(), `${locale}: oneTime.${key}`);
    assert.ok(
      dictionary.messages.formInvalid.trim(),
      `${locale}: messages.formInvalid`,
    );
    assert.ok(
      dictionary.contactLists.formInvalid.trim(),
      `${locale}: contactLists.formInvalid`,
    );
    assert.ok(
      dictionary.errors.authenticationRequired.trim(),
      `${locale}: authenticationRequired`,
    );
    assert.ok(
      dictionary.errors.passwordChangeRequired.trim(),
      `${locale}: passwordChangeRequired`,
    );
  }
  assert.notEqual(
    zaadDictionaries.ja.oneTime.duplicatesRemoved,
    zaadDictionaries.en.oneTime.duplicatesRemoved,
  );
  assert.notEqual(
    zaadDictionaries.ko.residents.sourceAdmin,
    zaadDictionaries.en.residents.sourceAdmin,
  );
  assert.match(
    viewSource,
    /source === "PUBLIC_FORM"\s*\? copy\.residents\.sourceWeb/u,
  );
  assert.match(
    viewSource,
    /source === "ADMIN_CSV"\s*\? copy\.residents\.sourceCsv/u,
  );
});

test("every ZAAD mutation path uses a synchronous ref guard before awaiting", () => {
  const guardedComponents = [
    "function SettingsSection",
    "function OneTimeSection",
    "function ResidentDialogForm",
    "function DeleteResidentForm",
    "function CsvImportForm",
    "function MessageDialogForm",
    "function DeleteMessageForm",
    "function ContactListDialogForm",
    "function DeleteContactListForm",
    "function CampaignStatusForm",
    "function OneTimeConfirmForm",
  ];
  for (const start of guardedComponents) {
    const offset = viewSource.indexOf(start);
    const nextFunction = viewSource.indexOf(
      "\nfunction ",
      offset + start.length,
    );
    const component = viewSource.slice(
      offset,
      nextFunction < 0 ? undefined : nextFunction,
    );
    assert.match(component, /useSubmissionGuard\(\)/u, start);
    assert.match(component, /submissionGuard\.begin\(\)/u, start);
    const begin = component.indexOf("submissionGuard.begin()");
    const firstAwait = component.indexOf("await ");
    assert.ok(
      firstAwait < 0 || begin < firstAwait,
      `${start}: guard must run before await`,
    );
  }
  const retryPaths = viewSource.slice(
    viewSource.indexOf("onRetry={async (resident)"),
    viewSource.indexOf("onCsv={()"),
  );
  const messageRetry = viewSource.slice(
    viewSource.indexOf("onRetry={async (message)"),
    viewSource.indexOf("}} /> : null}"),
  );
  for (const [name, source] of [
    ["resident retry", retryPaths],
    ["message retry", messageRetry],
  ] as const) {
    assert.match(source, /mutationGuard\.begin\(\)/u, name);
    assert.ok(
      source.indexOf("mutationGuard.begin()") < source.indexOf("await "),
      name,
    );
  }
  assert.match(viewSource, /const inFlight = useRef\(false\)/u);
  assert.match(viewSource, /if \(inFlight\.current\) return false/u);
});

test("async outcomes focus rendered status targets without changing modal focus containment", () => {
  assert.match(
    viewSource,
    /id="zaad-page-feedback"\s+tabIndex=\{-1\}\s+role="status"/u,
  );
  assert.match(viewSource, /id=\{id\}\s+tabIndex=\{-1\}\s+role="alert"/u);
  assert.match(
    viewSource,
    /if \(state === "success"\)\s+focusStatus\(`zaad-\$\{dialog\}-success`\)/u,
  );
  assert.match(viewSource, /state === "empty" \|\| state === "failure"/u);
  assert.match(
    viewSource,
    /if \(validation\) focusStatus\("zaad-one-time-validation"\)/u,
  );
  assert.match(
    viewSource,
    /if \(error\) focusStatus\("zaad-settings-error"\)/u,
  );
  assert.match(viewSource, /focus\(\{ preventScroll: true \}\)/u);

  assert.match(
    modalSource,
    /const registration = modalStackFor\(document\)\.register\(portalRoot\)/u,
  );
  const stackSource = readFileSync(new URL("../app/components/admin/modal-stack.ts", import.meta.url), "utf8");
  assert.match(stackSource, /returnFocus: document\.activeElement/u);
  assert.match(modalSource, /const previouslyFocused = registration\.release\(\)/u);
  assert.match(modalSource, /focusTarget\?\.focus\(\)/u);
  assert.match(modalSource, /onKeyDown=\{trapFocus\}/u);
  assert.match(modalSource, /previouslyFocused\?\.focus\(\)/u);
});

test("one-time explanatory and selection copy is localized without Japanese-only branches", () => {
  const oneTimeSection = viewSource.slice(
    viewSource.indexOf("function OneTimeSection"),
    viewSource.indexOf("function ZaadDialog"),
  );
  assert.doesNotMatch(oneTimeSection, /isJapanese/u);
  assert.doesNotMatch(oneTimeSection, /キャンペーン内容を確認/u);
  assert.doesNotMatch(oneTimeSection, /各リストの全連絡先/u);
  assert.doesNotMatch(oneTimeSection, /読み上げ本文と1件以上/u);
  assert.match(oneTimeSection, /copy\.oneTime\.recipientRules/u);
  assert.match(oneTimeSection, /copy\.oneTime\.selectionReason/u);
  assert.match(oneTimeSection, /copy\.oneTime\.review/u);
  for (const [locale, dictionary] of Object.entries(zaadDictionaries)) {
    assert.ok(
      dictionary.oneTime.recipientRules.trim(),
      `${locale}: recipientRules`,
    );
    assert.ok(
      dictionary.oneTime.selectionReason.trim(),
      `${locale}: selectionReason`,
    );
  }
});

test("dialog submit descriptions identify permissions only when permission is the blocker", () => {
  const actions = viewSource.slice(
    viewSource.indexOf("function DialogActions"),
    viewSource.indexOf("function TextField"),
  );
  assert.match(actions, /describedBy\?: string/u);
  assert.match(actions, /aria-describedby=\{describedBy\}/u);
  assert.doesNotMatch(actions, /zaad-permission-update-reason/u);

  const csvForm = viewSource.slice(
    viewSource.indexOf("function CsvImportForm"),
    viewSource.indexOf("function MessageDialogForm"),
  );
  assert.match(csvForm, /disabled=\{!canSubmit \|\| !file\}/u);
  assert.match(csvForm, /!canSubmit && !disabled/u);
  assert.match(csvForm, /"zaad-permission-create-reason"/u);
  const csvDescription = csvForm.slice(csvForm.indexOf("describedBy="));
  assert.doesNotMatch(csvDescription, /!file/u);

  const confirmation = viewSource.slice(
    viewSource.indexOf("function OneTimeConfirmForm"),
    viewSource.indexOf("type CommonDialogBaseProps"),
  );
  assert.match(confirmation, /disabled=\{!canSubmit \|\| !acknowledged\}/u);
  assert.match(confirmation, /!canSubmit && !disabled/u);
  assert.match(confirmation, /"zaad-permission-create-reason"/u);
  const confirmationDescription = confirmation.slice(
    confirmation.indexOf("describedBy="),
  );
  assert.doesNotMatch(confirmationDescription, /!acknowledged/u);

  for (const reason of ["create", "update", "delete"]) {
    assert.match(
      viewSource,
      new RegExp(`zaad-permission-${reason}-reason`, "u"),
    );
  }
});

test("client validation alerts use dialog-specific localized messages", () => {
  const dialog = viewSource.slice(
    viewSource.indexOf("function ZaadDialog"),
    viewSource.indexOf("function ResidentDialogForm"),
  );
  const mapper = viewSource.slice(
    viewSource.indexOf("function dialogValidationMessage"),
    viewSource.indexOf("function dialogAlertId"),
  );
  assert.match(dialog, /validationMessage: string/u);
  assert.match(dialog, /state === "empty"\s*\? validationMessage/u);
  assert.doesNotMatch(dialog, /state === "empty"\s*\? copy\.oneTime\.invalid/u);
  assert.match(mapper, /copy\.residents\.formInvalid/u);
  assert.match(mapper, /copy\.residents\.csvFileRequired/u);
  assert.match(mapper, /copy\.messages\.formInvalid/u);
  assert.match(mapper, /copy\.contactLists\.formInvalid/u);
  assert.match(mapper, /copy\.oneTime\.invalid/u);
  assert.match(viewSource, /validationMessage=\{/u);
});

test("default group binding uses a shared labelled select and refresh without list navigation", () => {
  const binding = readFileSync(new URL("../app/admin/zaad/OutreachDefaultGroupBinding.tsx", import.meta.url), "utf8");
  const groups = readFileSync(new URL("../app/admin/zaad/OutreachGroups.tsx", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../app/admin/zaad/OutreachDefaultGroup.tsx", import.meta.url), "utf8");
  assert.match(binding, /<Select required/);
  assert.match(binding, /aria-labelledby=\{descriptionId\}/);
  assert.match(binding, /<RefreshIcon \/>/);
  assert.match(binding, /aria-label=\{d.candidateRefresh\} title=\{d.candidateRefresh\} disabled=\{loading \|\| busy\}/);
  assert.match(binding, /loadDefaultGroupCandidates/);
  assert.match(binding, /\/candidates/);
  assert.match(binding, /disabled=\{!canSave\}/);
  assert.match(binding, /selectable && !loading && !loadFailed && !busy/);
  assert.doesNotMatch(binding, /<input|configureHelp|nextCursor|nextPage|<label/);
  assert.match(binding, /controller.abort\(\)/);
  assert.match(binding, /group.rebindCount/);
  assert.match(binding, /setDiscard\(true\)/);
  assert.match(groups, /if \(row\?\.kind === "DEFAULT"\) \{ setSuccess\(""\); setBindingTarget\(\{ tenant, group: row \}\); return; \}/);
  assert.match(groups, /row.kind === "DEFAULT" \? "default-group-detail" : "group-detail"/);
  assert.match(groups, /state === "default-group-bind" \? data\?\.items.find/);
  assert.doesNotMatch(groups, /d\.defaultGroups\.listHelp|d\.groupIndustry|t\.admin\.industrySettings\.names\[tenant\]/);
  assert.match(groups, /d.defaultGroups.manageContacts/);
  assert.match(groups, /d\.sync/); assert.match(groups, /z.common.create/);
  assert.match(groups, /<DefaultGroupBinding/); assert.match(detail, /<DefaultGroupBinding/);
});


test("contact group counts and detail chrome keep localized labels and saved-ID state", async () => {
  const { outreachCommonDictionaries } = await import("../app/i18n/outreach-common");
  const labels = ["連絡先数", "Contact count", "联系人数量", "聯絡人數量", "연락처 수"];
  for (const [index, locale] of (["ja", "en", "zh-Hans", "zh-Hant", "ko"] as const).entries()) {
    const copy = outreachCommonDictionaries[locale];
    assert.equal(copy.groupMembers, labels[index]);
    assert.ok(copy.defaultGroups.update);
    assert.notEqual(copy.defaultGroups.update, copy.defaultGroups.configure);
  }
  const source = (name: string) => readFileSync(new URL(`../app/admin/zaad/${name}.tsx`, import.meta.url), "utf8");
  const groups = source("OutreachGroups"), detail = source("OutreachDefaultGroup"), view = source("OutreachView");
  assert.ok(groups.includes('row.contactCount ?? "—"'));
  assert.ok(groups.includes('row.contactListId ? d.defaultGroups.update : d.defaultGroups.configure'));
  assert.ok(detail.includes('data.group.contactListId ? t.outreachCommon.defaultGroups.updateShort : d.configure'));
  for (const text of [groups, detail]) {
    assert.ok(text.includes('gap-x-4 gap-y-2'));
    assert.ok(text.includes('break-all text-sm text-fg-muted'));
  }
  assert.ok(groups.includes('{d.defaultGroups.listId}：{detail.group.id}'));
  assert.ok(detail.includes('border-l-2 border-accent pl-3 text-sm text-red-700 dark:text-red-300'));
  assert.ok(view.includes('isOutreachDetailPage(selected,'));
  assert.ok(view.includes('{!showingGroupDetail && <AdminTenantRouteSelect'));
});

test("default detail keeps search and sync semantics with a portal help and centered icon actions", async () => {
  const { outreachCommonDictionaries } = await import("../app/i18n/outreach-common");
  for (const copy of Object.values(outreachCommonDictionaries)) assert.ok(copy.defaultGroups.syncStatusHelp);
  const detail = readFileSync(new URL("../app/admin/zaad/OutreachDefaultGroup.tsx", import.meta.url), "utf8");
  assert.equal((detail.match(/<SearchInput /g) ?? []).length, 1);
  assert.ok(detail.includes('md:w-auto md:flex-row md:flex-wrap md:items-center'));
  assert.ok(detail.includes('containerClassName="w-full min-w-0 md:w-64 xl:w-80"'));
  assert.ok(detail.includes('params.set("cursor", "0")'));
  assert.ok(detail.includes('if (composing || text === search) return'));
  assert.ok(detail.includes('label={d.syncStatusHelp} description={d.boundary} portal'));
  assert.ok(!detail.includes('<p className="text-sm text-fg-muted">{d.boundary}</p>'));
  assert.ok(detail.includes('aria-label={t.outreachCommon.sync} title={t.outreachCommon.sync}'));
  assert.ok(detail.includes('disabled={busy || !configured || row.syncStatus === "SYNCING"}'));
  assert.ok(detail.includes('onClick={() => void sync(row.id)}><RefreshIcon />'));
  assert.ok(detail.includes('canSync && needsLink ? <TableRowActions'));
  assert.ok(detail.includes('text-center"><div className="flex justify-center"'));
  assert.ok(detail.includes('ref={noticeRef} tabIndex={-1} role="status"'));
});

test("CSV-AUTO-01: preview is capped at five rows, but submission and errors cover the entire CSV", async () => {
  const { crmImportSummary } = await import("../lib/zaad/crm-import-view");
  const preview = { id: "job", previewDigest: "digest", status: "PREVIEW", expiresAt: new Date(Date.now() + 60000).toISOString(), rows: Array.from({ length: 7 }, (_, i) => ({ rowNumber: i + 2, rowKey: `row-${i}`, name: `Person ${i}`, status: "NEW", topicIds: ["elder-watch"] })) };
  let summary = crmImportSummary(preview, Date.now());
  assert.equal(summary.shown.length, 5); assert.equal(summary.targets.length, 7); assert.equal(summary.canSubmit, true);
  preview.rows[5].status = "INVALID"; summary = crmImportSummary(preview, Date.now());
  assert.equal(summary.canSubmit, false); assert.equal(summary.errors[0].rowNumber, 7);
  preview.rows.forEach(row => { row.status = "IMPORTED"; }); preview.rows[5].status = "FAILED";
  summary = crmImportSummary(preview, Date.now());
  assert.equal(summary.canSubmit, true); assert.deepEqual(summary.targets, ["row-5"]); assert.equal(summary.imported, 6);
  assert.equal(crmImportSummary(preview, Date.now()+120000).canSubmit, false);
  assert.equal(crmImportSummary({...preview, rows: preview.rows.slice(0,1)}, Date.now()).shown.length, 1);
});

test("CONTACT-SUBPAGE-01: CSV child routes retain tenant breadcrumbs while retired settings return to contacts", async () => {
  const { isOutreachDetailPage, outreachParentHref } = await import("../lib/admin-routing");
  for (const tenant of ["lg", "univ"] as const) for (const state of ["csv-upload", "csv-preview", "csv-error", "registration-settings"]) {
    const query = new URLSearchParams({tenant, view: "contact-lists", section: "contacts", state, importJob: "old", cursor: "old"});
    assert.equal(isOutreachDetailPage("contact-lists", query), true);
    assert.equal(isOutreachDetailPage("messages", query), false);
    assert.equal(outreachParentHref(tenant, query, "contacts"), `/admin/zaad?tenant=${tenant}&view=contact-lists&section=contacts`);
  }
});
