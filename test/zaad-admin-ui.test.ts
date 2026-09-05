import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement, type ComponentType, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ZaadView } from "../app/admin/zaad/ZaadView";
import { LanguageProvider } from "../app/i18n/LanguageProvider";

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

function renderResidents(reviewState?: string, canViewDeveloperApi = true) {
  const Provider = LanguageProvider as ComponentType<PropsWithChildren<{ availableLocales: readonly ["ja"] }>>;
  return renderToStaticMarkup(createElement(Provider, { availableLocales: ["ja"] },
    createElement(ZaadView, {
      initialView: "residents", reviewState, canViewDeveloperApi,
      permissions: { create: false, update: false, delete: false },
    }),
  ));
}

test("ZAAD-HELP-01 / ZAAD-HEADER-04/05: title help and responsive API action column", () => {
  const html = renderResidents("ready", false);
  assert.match(html, /role="tooltip" class="sr-only"/);
  assert.match(html, /aria-label="ZAADについて"/);
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
  assert.match(section, /disabled=\{pending \|\| !permissions.update\}/);
  assert.match(section, /disabled=\{pending \|\| !permissions.delete\}/);
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

test("ZAAD section history restores the URL view on back and forward navigation", () => {
  assert.match(pageSource, /single\(query\.view\)/u);
  assert.match(
    pageSource,
    /isZaadView\(requestedView\) \? requestedView : "residents"/u,
  );
  assert.match(
    viewSource,
    /const zaadPathname = window\.location\.pathname/u,
  );
  assert.match(
    viewSource,
    /window\.addEventListener\("popstate", restoreViewFromHistory\)/u,
  );
  assert.match(
    viewSource,
    /window\.removeEventListener\("popstate", restoreViewFromHistory\)/u,
  );
  assert.match(
    viewSource,
    /setView\(zaadViewFromUrl\(url\)\)/u,
  );
  assert.match(
    viewSource,
    /return SECTION_ORDER\.find\(\(view\) => view === requestedView\) \?\? "residents"/u,
  );
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
  assert.match(
    pageSource,
    /canViewDeveloperApi=\{canAdminAccess\(actor, "developer-api", "VIEW"\)\}/u,
  );
  assert.match(viewSource, /canViewDeveloperApi \? \(/u);
  assert.match(
    viewSource,
    /role="link"\s+aria-disabled="true"\s+aria-describedby="zaad-developer-api-permission-reason"/u,
  );
  assert.match(
    viewSource,
    /id="zaad-developer-api-permission-reason"\s+className="sr-only"/u,
  );
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
    /const previouslyFocused = document\.activeElement/u,
  );
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
