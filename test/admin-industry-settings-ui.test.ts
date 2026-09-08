import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  helpReducer,
  initialHelpState,
  isHelpOpen,
} from "../app/components/admin/AdminPageTitleHelp";
for (const [resource, file] of [
  ["PHONE", "phone-settings/PhoneSettingsForm"],
  ["CHAT", "chat-settings/ChatSettingsForm"],
  [
    "CONSULTATION",
    "online-consultation-settings/OnlineConsultationSettingsForm",
  ],
])
  test(`HEADER-${resource}: industry selection remains in the responsive title row`, () => {
    const source = readFileSync(`app/admin/${file}.tsx`, "utf8");
    const header = source.slice(
      source.indexOf("data-admin-page-header"),
      source.indexOf("</header>", source.indexOf("data-admin-page-header")),
    );
    assert.match(header, /md:flex-row/);
    assert.match(header, /AdminSettingsTenantSelect/);
  });
test("HEADER-INLINE/HELP/A11Y: label, help and select retain one inline control", () => {
  const select = readFileSync(
    "app/components/admin/AdminSettingsTenantSelect.tsx",
    "utf8",
  );
  assert.match(select, /flex w-full min-w-0 items-center gap-3/);
  assert.match(select, /htmlFor="tenant"/);
  assert.match(select, /aria-describedby="tenant-help"/);
  assert.match(select, /AdminFieldHelp/);
  assert.doesNotMatch(select, /<p[^>]*>\{c\.copy\.help\}/);
  let state = helpReducer(initialHelpState, "focus");
  assert.equal(isHelpOpen(state), true);
  state = helpReducer(state, "dismiss");
  assert.equal(isHelpOpen(state), false);
  state = helpReducer(state, "toggle");
  assert.equal(isHelpOpen(state), true);
  state = helpReducer(state, "toggle");
  assert.equal(isHelpOpen(state), false);
});
