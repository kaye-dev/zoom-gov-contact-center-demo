import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsRequestSequence } from "../lib/admin-settings-request";
import { OnlineConsultationIcon } from "../app/components/svg/OnlineConsultationIcon";
import { chromeDictionaries, locales } from "../app/i18n/dictionaries";
import { OnlineConsultationSettingsForm } from "../app/admin/online-consultation-settings/OnlineConsultationSettingsForm";
import { renderAdmin } from "./admin-ui-render";
import { consultationServices } from "../lib/online-consultation-catalog";
test("SWITCH: old asynchronous responses cannot overwrite a later selection", async () => {
  const seq = new SettingsRequestSequence();
  const first = seq.next();
  const second = seq.next();
  const result = await Promise.resolve([second, first]);
  const accepted = result.filter((id) => seq.current(id));
  assert.deepEqual(accepted, [second]);
  seq.next();
  assert.equal(seq.current(second), false);
});
test("ICON: online consultation has video geometry and existing SVG conventions", () => {
  const html = renderToStaticMarkup(createElement(OnlineConsultationIcon));
  for (const value of [
    'viewBox="0 0 24 24"',
    'stroke-width="2"',
    'stroke="currentColor"',
    'fill="none"',
    'aria-hidden="true"',
    'focusable="false"',
    "<rect",
  ])
    assert.ok(html.includes(value));
});
test("I18N: all five locales contain tenant names and all consultation services", () => {
  const keys = Object.keys(chromeDictionaries.ja.admin.industrySettings).sort();
  for (const locale of locales) {
    const c = chromeDictionaries[locale].admin.industrySettings;
    assert.deepEqual(Object.keys(c).sort(), keys);
    for (const key of ["lg", "univ"] as const) assert.ok(c.names[key]);
    for (const key of [
      "general",
      "admissions",
      "student-support",
      "careers",
    ] as const)
      assert.ok(c.services[key]);
  }
});
for (const tenant of ["lg", "univ"] as const)
  for (const canEdit of [true, false])
    test(`consultation renders scoped tabs and permissions ${tenant}/${canEdit}`, () => {
      const html = renderAdmin(
        createElement(OnlineConsultationSettingsForm, {
          initialTenant: tenant,
          canEdit,
          initialSettings: consultationServices(tenant).map((serviceKey) => ({
            serviceKey,
            enabled: false,
            webClientTag: null,
            queueId: null,
            memo: "",
          })),
        }),
        "/admin/online-consultation-settings",
      );
      assert.equal(
        (html.match(/role="tab"/g) || []).length,
        consultationServices(tenant).length,
      );
      assert.ok(
        html.includes(
          chromeDictionaries.ja.admin.industrySettings.names[tenant],
        ),
      );
      assert.equal(
        /<button[^>]*type="submit"[^>]*disabled=""/.test(html),
        !canEdit,
      );
    });
