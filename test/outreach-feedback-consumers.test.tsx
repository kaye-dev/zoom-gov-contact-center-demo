import assert from "node:assert/strict";
import test from "node:test";
import React, { act, createElement as h } from "react";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { withFeedbackDom, loadComponent } from "./helpers/outreach-feedback-dom";
import type { OutreachPanelProps } from "../app/admin/zaad/OutreachView";
const props: OutreachPanelProps = { tenant: "lg", permissions: { create: true, update: true, delete: true }, fullAccess: true, setDirty: () => {} };
const row = { id: "text-1", sourceKind: "TEXT", name: "Test", body: "Body", voiceId: "Takumi", languageCode: "ja-JP", updatedAt: "2026-09-12T00:00:00Z", generationState: "NOT_GENERATED" };

test("T03 message readback retains counts inline; save uses a single toast; dismiss restores table adjacency", async () => withFeedbackDom(async (document, render) => {
  let query = new URLSearchParams("tenant=lg&view=messages&state=message-sync"), confirmed: (ids: string[]) => Promise<void> = async () => {}, rejectReadback = true;
  const Messages = loadComponent<React.ComponentType<OutreachPanelProps>>("OutreachMessages", {
    "next/navigation": { useRouter: () => ({ replace: (url: string) => { query = new URL(url, "http://localhost").searchParams; }, push: () => {} }), useSearchParams: () => query },
    "./outreach-client": { outreachRequest: async () => ({ items: rejectReadback ? [] : [row], total: 1 }), OutreachApiError: class extends Error {} },
    "./OutreachMessageSync": { OutreachMessageSync: (value: { confirmed: typeof confirmed }) => { confirmed = value.confirmed; return h("div", null, "Sync"); } },
    "./OutreachMessageEditor": { OutreachMessageEditor: (value: { saved: () => void }) => h("button", { onClick: value.saved }, "Save fixture") },
    "./OutreachView": { OutreachFailure: () => h("div", { role: "alert" }, "Failure"), OutreachLoading: () => null },
    "./OutreachListActions": { OutreachListActions: ({ children }: { children: React.ReactNode }) => h("div", null, children), outreachTabAction: "" },
  });
  await render(h(Messages, props));
  await act(async () => { await assert.rejects(confirmed([row.id]), /READBACK/u); });
  assert.equal(document.querySelector('[data-feedback-tone="success"]'), null);
  rejectReadback = false;
  await act(async () => confirmed([row.id])); await render(h(Messages, props));
  assert.equal(document.querySelectorAll('[data-inline-feedback]').length, 1);
  assert.ok(document.querySelector('[data-inline-feedback]')!.textContent!.includes("1"));
  assert.equal(document.querySelector('.feedback-toast'), null);
  await act(async () => document.querySelector<HTMLButtonElement>('[data-inline-feedback] button')!.click());
  assert.equal(document.querySelector('[data-inline-feedback]'), null);
  query.set("state", "message-create"); await render(h(Messages, props));
  await act(async () => document.querySelector<HTMLButtonElement>('#root button')!.click()); await render(h(Messages, props));
  assert.equal(document.querySelectorAll('.feedback-toast').length, 1);
  assert.equal(document.querySelector('[data-inline-feedback]'), null);
}));

test("T03 CSV COMPLETED with failed or pending rows remains warning and retains row errors", async () => withFeedbackDom(async (document, render) => {
  for (const status of ["FAILED", "NEW", "IMPORTED"]) {
    const Csv = loadComponent<React.ComponentType<OutreachPanelProps & { close: () => void; saved: () => void }>>("OutreachCsvImport", {
      "next/navigation": { useRouter: () => ({ replace: () => {} }), useSearchParams: () => new URLSearchParams("importJob=job") },
      "./outreach-client": { outreachRequest: async () => ({ id: "job", status: "COMPLETED", previewDigest: "digest", expiresAt: new Date(Date.now() + 3600000).toISOString(), rows: [{ rowKey: "1", rowNumber: 1, name: "Keep", phone: "09000000000", topicIds: [], status }] }) },
      "./DetailPageBreadcrumb": { DetailPageBreadcrumb: () => null },
      "./OutreachView": { OutreachLoading: () => null, OutreachFailure: () => null },
    });
    await render(h(Csv, { ...props, key: status, close: () => {}, saved: () => {} }));
    const notices = Array.from(document.querySelectorAll('[data-feedback-tone]'));
    assert.ok(notices.length);
    assert.equal(notices[0].getAttribute("data-feedback-tone"), status === "IMPORTED" ? "success" : "warning");
    assert.ok(document.querySelector('tbody')!.textContent!.includes("Keep"));
  }
}));

test("T05 imported audio failure stays inside the confirmation dialog without background duplication", async () => withFeedbackDom(async (document, render) => {
  class ApiFailure extends Error {
    constructor(readonly status: number, readonly code: string) { super(code); }
  }
  for (const [status, code, tone] of [[409, "CONTENT_CHANGED", "error"], [503, "AUDIO_UPDATE_RESULT_UNKNOWN", "warning"]] as const) {
    let saved = 0;
    const Editor = loadComponent<React.ComponentType<OutreachPanelProps & { message: import("../lib/zaad/message-import-contracts").ImportedAudioMessage; saved: () => void }>>("OutreachImportedAudioEditor", {
      "./outreach-client": { OutreachApiError: ApiFailure, loadImportedAudio: async () => {}, outreachMutation: async () => { throw new ApiFailure(status, code); } },
      "./OutreachAudioPlayer": { OutreachAudioPlayer: () => null },
      "./DetailPageBreadcrumb": { DetailPageBreadcrumb: () => null },
      "@/app/components/admin/ModalDialog": { ModalDialog: ({ children }: { children: React.ReactNode }) => h("div", { role: "dialog", "aria-modal": "true" }, children) },
    });
    await render(h(Editor, { ...props, key: code, saved: () => { saved++; }, message: { id: "audio-1", sourceKind: "IMPORTED_AUDIO", name: "Keep audio name", body: "Keep body", bodyState: "PROVIDER_RETURNED", bodyFetchedAt: null, voiceId: "Takumi", languageCode: "ja-JP", observedDigest: "digest", expectedDigest: "digest", generationState: "IMPORTED_AUDIO", zoomAssetId: "asset-1", assetItemId: "item-1", updatedAt: "2026-09-12T00:00:00Z" } }));
    await act(async () => document.querySelector('form')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await act(async () => document.querySelector<HTMLButtonElement>('[role="dialog"] button:last-child')!.click());
    const notice = document.querySelector(`[role="dialog"] [data-feedback-tone="${tone}"]`);
    assert.ok(notice?.textContent);
    assert.equal(document.querySelectorAll('[data-feedback-tone]').length, 1);
    assert.equal(document.querySelector<HTMLInputElement>('form input')!.value, "Keep audio name");
    assert.equal(document.querySelector('.feedback-toast'), null);
    assert.equal(saved, 0);
    await act(async () => document.querySelector<HTMLButtonElement>('[role="dialog"] button')!.click());
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.querySelectorAll(`form [data-feedback-tone="${tone}"]`).length, 1);
  }
}));

// This inventory checks coverage of the adopted consumers; their fetch/write
// contracts remain covered by the focused domain action tests, not this audit.
const consumers = ["OutreachView", "OutreachMessages", "OutreachMessageEditor", "OutreachImportedAudioEditor", "OutreachMessageSync", "OutreachAudioPlayer", "OutreachGroups", "OutreachDefaultGroup", "OutreachDefaultGroupBinding", "OutreachGroupSync", "OutreachGroupEditor", "OutreachGroupMember", "OutreachZoomImport", "OutreachContacts", "OutreachContactEditor", "OutreachLegacyContactEditor", "OutreachCsvImport", "OutreachCampaigns", "OutreachCampaignSync", "OutreachPurposeBindings", "OutreachCampaignDetail", "OutreachDispatches", "OutreachDispatchEditor", "MunicipalWorkflowPanel", "MunicipalTargetForm", "MunicipalCases"];
for (const name of consumers) test(`T07 ${name}: operation feedback uses the shared component and ordinary statuses stay ordinary`, () => {
  const source = readFileSync(`app/admin/zaad/${name}.tsx`, "utf8");
  const file = ts.createSourceFile(`${name}.tsx`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let feedback = 0;
  function inspect(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(file);
      if (["Feedback", "Component"].includes(tag)) feedback++;
      const role = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(file) === "role") as ts.JsxAttribute | undefined;
      assert.ok(!(role?.initializer && ts.isStringLiteral(role.initializer) && role.initializer.text === "alert" && tag !== "Feedback"), `${name} has an unclassified native alert`);
    }
    ts.forEachChild(node, inspect);
  }
  inspect(file); assert.ok(feedback, `${name} has no feedback consumer`);
  assert.doesNotMatch(source, /import[^;]+plans\//u);
});
test("T07 old screens stay unreachable from the current route", () => {
  const page = readFileSync("app/admin/zaad/page.tsx", "utf8");
  assert.doesNotMatch(page, /from ["'].\/(?:ZaadView|UniversityZaadView|UniversityStudentRegistry)["']/u);
});
