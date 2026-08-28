import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { dictionaries, locales } from "../app/i18n/dictionaries";
import { ADMIN_RESOURCE_CATALOG } from "../lib/admin-access/catalog";
import { ADMIN_ACCESS_ACTIONS, ADMIN_RESOURCE_KEYS } from "../lib/admin-access/types";
import {
  ADMIN_ROLE_ERROR_CODES,
  parsePermissionMatrix,
} from "../lib/admin-access/validation";
import { parseAdminRoleDirectoryInput } from "../lib/server/admin-access/queries";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("every locale has the complete access-control catalog and action copy", () => {
  for (const locale of locales) {
    const copy = dictionaries[locale].admin.accessControl;
    assert.deepEqual(Object.keys(copy.resourceTitles).sort(), [...ADMIN_RESOURCE_KEYS].sort(), locale);
    assert.deepEqual(Object.keys(copy.resourceDescriptions).sort(), [...ADMIN_RESOURCE_KEYS].sort(), locale);
    assert.deepEqual(Object.keys(copy.actionLabels).sort(), [...ADMIN_ACCESS_ACTIONS].sort(), locale);
    assert.deepEqual(Object.keys(copy.systemRoleNames).sort(), ["FULL_ACCESS", "NO_ACCESS"], locale);
    assert.deepEqual(Object.keys(copy.systemRoleDescriptions).sort(), ["FULL_ACCESS", "NO_ACCESS"], locale);
    for (const value of [
      ...Object.values(copy.resourceTitles),
      ...Object.values(copy.resourceDescriptions),
      ...Object.values(copy.actionLabels),
      ...Object.values(copy.systemRoleNames),
      ...Object.values(copy.systemRoleDescriptions),
      copy.adminPageAccessTitle,
      copy.adminPageAccessDescription,
      copy.adminPageColumn,
      copy.backToUserDetails,
      copy.targetPaths,
      copy.userAccessPageTitle,
      copy.roleNameRequired,
      copy.roleNameTooLong,
      copy.editRoleTitle,
      copy.editRoleDescription,
      copy.systemRoleReadOnly,
      copy.reload,
      copy.userAccessHeading,
      copy.userAccessDescription,
      copy.adminAttributeHelp,
      copy.assignedRolesHelp,
      copy.accessRoleSummaryHelp,
      copy.replaceAccessRoleHelp,
    ]) {
      assert.ok(value.length > 0, locale);
    }
  }
});

test("role directory input normalizes search and enforces one-based bounded pagination", () => {
  assert.deepEqual(
    parseAdminRoleDirectoryInput({
      query: "  Ｆｕｌｌ  ",
      page: "2",
      pageSize: "50",
    }),
    { ok: true, value: { query: "Full", page: 2, pageSize: 50 } },
  );
  assert.equal(parseAdminRoleDirectoryInput({ page: "0" }).ok, false);
  assert.equal(parseAdminRoleDirectoryInput({ pageSize: "51" }).ok, false);
  assert.equal(parseAdminRoleDirectoryInput({ page: "201", pageSize: "50" }).ok, true);
  assert.equal(parseAdminRoleDirectoryInput({ page: "202", pageSize: "50" }).ok, false);
  assert.equal(parseAdminRoleDirectoryInput({ query: "x".repeat(101) }).ok, false);
});

test("permission payload requires every supported cell exactly once", () => {
  const valid = ADMIN_RESOURCE_CATALOG.flatMap((resource) =>
    resource.supportedActions.map((action) => ({
      resourceKey: resource.key,
      action,
      effect: null,
    })),
  );
  assert.equal(parsePermissionMatrix(valid).ok, true);
  assert.deepEqual(parsePermissionMatrix(valid.slice(1)), {
    ok: false,
    code: ADMIN_ROLE_ERROR_CODES.invalidPermissions,
  });
  assert.deepEqual(parsePermissionMatrix([...valid, valid[0]]), {
    ok: false,
    code: ADMIN_ROLE_ERROR_CODES.invalidPermissions,
  });

  const unsupported = structuredClone(valid);
  unsupported[0] = {
    resourceKey: "phone-settings",
    action: "DELETE",
    effect: "ALLOW",
  } as unknown as (typeof valid)[number];
  assert.deepEqual(parsePermissionMatrix(unsupported), {
    ok: false,
    code: ADMIN_ROLE_ERROR_CODES.invalidPermissions,
  });
});

test('role UI creates metadata first and keeps unsupported permission controls disabled', () => {
  const list = source('../app/admin/roles/RolesView.tsx');
  const modal = source('../app/components/admin/ModalDialog.tsx');
  const details = source('../app/admin/roles/[id]/RoleDetailsView.tsx');
  assert.match(list, /<ModalDialog/);
  assert.match(list, /JSON\.stringify\(\{ name, description \}\)/);
  assert.match(list, /router\.push\(`\/admin\/roles\/\$\{encodeURIComponent\(body\.role\.id\)\}`\)/);
  assert.match(details, /disabled=\{!editable \|\| !cell\.supported\}/);
  assert.match(
    details,
    /checked=\{cell\.supported && cell\.effect === "ALLOW"\}/,
  );
  assert.match(
    details,
    /checked=\{cell\.supported && cell\.effect === "DENY"\}/,
  );
  assert.match(details, /resource\.displayPaths\.map/);
  assert.match(details, /title=\{copy\.allow\}/);
  assert.match(details, /title=\{copy\.deny\}/);
  assert.match(details, /<span>\{copy\.allow\}<\/span>/);
  assert.match(details, /<span>\{copy\.deny\}<\/span>/);
  assert.match(details, /min-h-8 min-w-\[4\.5rem\]/);
  assert.match(details, /title=\{copy\.editRoleTitle\}/);
  assert.match(details, /role="tablist"/);
  assert.match(details, /role="tab"/);
  assert.match(details, /adminPageAccessTitle/);
  assert.match(details, /<table/);
  assert.match(list, /name="query"/);
  assert.match(list, /pageSize/);
  assert.match(details, /#members/);
  assert.match(details, /member-candidates/);
  assert.match(details, /expectedAssignmentRevision/);
  assert.match(details, /roleIds: \[roleId\]/);
  assert.match(details, /roleIds: \[\]/);
  assert.doesNotMatch(details, /candidate\.assignedRoleIds\.filter/);
  assert.match(list, /<ConfirmationDialog/);
  assert.match(list, /<DeleteIcon/);
  assert.match(list, /min-w-\[880px\]/);
  assert.match(list, /w-\[24%\]/);
  assert.match(list, /min-h-10 min-w-10/);
  assert.match(list, /flex flex-col-reverse gap-3 pt-2 sm:flex-row/);
  assert.match(list, /h-32 min-h-24 max-h-32/);
  assert.match(modal, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(modal, /aria-busy=\{locked\}/);
  assert.match(list, /ROLE_NAME_REQUIRED/);
  assert.match(list, /ROLE_NAME_TOO_LONG/);
  assert.match(list, /copy\.roleNameRequired/);
  assert.match(list, /copy\.roleNameTooLong/);
  assert.match(list, /create-role-name-error/);
  assert.match(list, /aria-invalid=\{nameError !== null\}/);
  assert.match(
    list,
    /aria-describedby=\{nameError \? 'create-role-name-error' : undefined\}/,
  );
  assert.match(
    list,
    /requestAnimationFrame\(\(\) => nameRef\.current\?\.focus\(\)\)/,
  );
  assert.match(details, /ROLE_NAME_REQUIRED/);
  assert.match(details, /ROLE_NAME_TOO_LONG/);
  assert.match(details, /copy\.roleNameRequired/);
  assert.match(details, /copy\.roleNameTooLong/);
  assert.match(details, /aria-invalid=\{metadataNameError !== null\}/);
  assert.match(
    details,
    /aria-describedby=\{\s*metadataNameError \? 'edit-role-name-error' : undefined\s*\}/,
  );
  assert.match(
    details,
    /requestAnimationFrame\(\(\) => metadataNameRef\.current\?\.focus\(\)\)/,
  );
  assert.match(details, /role-saving-reason/);
  assert.match(details, /disabled=\{locked\}/);
  assert.match(details, /disabled=\{disabled \|\| page <= 1\}/);
  assert.match(list, />—<\/span>/);
  assert.doesNotMatch(details, /<ConfirmationDialog/);
  assert.doesNotMatch(details, /window\.confirm/);
  assert.doesNotMatch(details, /onMemberCountChange\(body\.total\)/);
});

test("role and user screens follow the compact prototype structure and single-role editor", () => {
  const list = source("../app/admin/roles/RolesView.tsx");
  const details = source("../app/admin/roles/[id]/RoleDetailsView.tsx");
  const access = source("../app/admin/users/[id]/access/UserAccessView.tsx");
  const accessPage = source("../app/admin/users/[id]/access/page.tsx");
  const createUser = source("../app/admin/users/new/NewUserForm.tsx");
  const createUserPage = source("../app/admin/users/new/page.tsx");
  const userDetails = source("../app/admin/users/[id]/UserDetailsView.tsx");
  const userDetailsPage = source("../app/admin/users/[id]/page.tsx");

  assert.match(list, /text-2xl/);
  assert.match(details, /min-w-\[980px\]/);
  assert.match(details, /adminAttribute/);
  assert.match(details, /banned/);
  assert.match(access, /userAccessHeading/);
  assert.match(access, /<table/);
  assert.doesNotMatch(access, /<article/);
  assert.match(access, /aria-labelledby="access-heading"/);
  assert.match(access, /copy\.backToUserDetails/);
  assert.match(access, /copy\.targetPaths/);
  assert.doesNotMatch(access, /<div>\s*\{resource\.displayPaths\.map/);
  assert.match(access, /rounded-lg border border-line/);
  assert.match(access, /min-w-\[980px\] divide-y divide-line-subtle/);
  assert.match(access, /w-28 px-3 py-3/);
  assert.match(access, /input\.indeterminate = !decision\.supported/);
  assert.doesNotMatch(access, /AccessDecisionInfo/);
  assert.doesNotMatch(access, /href=\{`\/admin\/roles\//);
  assert.doesNotMatch(access, /mt-1 block text-xs font-semibold/);
  assert.match(access, /userAccessPageTitle/);
  assert.match(accessPage, /export const metadata: Metadata/);
  assert.match(accessPage, /userAccessPageTitle/);
  assert.match(userDetails, /isEditingAccessRoles/);
  assert.match(userDetails, /viewAccess/);
  assert.match(userDetails, /userManagement\.name/);
  assert.match(userDetails, /userManagement\.accessRoles/);
  assert.match(userDetails, /userManagement\.detailsDescription/);
  assert.match(userDetails, /userManagement\.detailsReadOnly/);
  assert.match(userDetails, /accessControl\.adminAttributeHelp/);
  assert.match(userDetails, /accessControl\.replaceAccessRoleHelp/);
  assert.match(userDetails, /accessControl\.accessRoleSummaryHelp/);
  assert.match(userDetails, /detailsPageTitle/);
  assert.match(userDetailsPage, /export const metadata: Metadata/);
  assert.match(userDetails, /hover:text-primary-700 dark:hover:text-primary-300/);
  assert.match(userDetails, /<select/);
  assert.match(userDetails, /w-full max-w-md/);
  assert.doesNotMatch(userDetails, /type="checkbox"/);
  assert.doesNotMatch(userDetails, /aria-multiselectable/);
  assert.match(userDetails, /userManagement\.passwordVisibilityHelp/);
  assert.match(userDetails, /id=\{`user-\$\{field\}-label`\}/);
  assert.equal(
    userDetails.match(/aria-labelledby=\{`user-\$\{field\}-label`\}/g)?.length,
    2,
  );
  assert.match(userDetails, /rounded-full px-2\.5 py-1 text-xs/);
  assert.doesNotMatch(userDetails, /sm:ml-auto/);
  assert.doesNotMatch(userDetails, /<section className="space-y-4 rounded-xl/);

  const nameIndex = createUser.indexOf('name="name"');
  const emailIndex = createUser.indexOf('name="email"');
  const privilegeIndex = createUser.indexOf('name="role"');
  const accessRolesIndex = createUser.indexOf('name="accessRoleId"');
  assert.ok(nameIndex < emailIndex);
  assert.ok(emailIndex < privilegeIndex);
  assert.ok(privilegeIndex < accessRolesIndex);
  assert.match(createUser, /getAdminRoleDisplayName/);
  assert.match(createUser, /name="accessRoleId"/);
  assert.match(createUser, /formData\.get\("accessRoleId"\)/);
  assert.doesNotMatch(createUser, /formData\.getAll/);
  assert.match(createUser, /defaultAccessRoleId/);
  assert.match(createUser, /systemKey === "NO_ACCESS"/);
  assert.doesNotMatch(createUser, /type="checkbox"/);
  assert.doesNotMatch(createUserPage, /OR: \[\{ systemKey: null \}/);
  assert.doesNotMatch(
    createUserPage,
    /systemKey: \{ not: "NO_ACCESS" \}/,
  );
});

test("role detail keeps member PII behind separately authorized directory APIs", () => {
  const queries = source("../lib/server/admin-access/queries.ts");
  const route = source("../app/api/[[...route]]/route.ts");
  const page = source("../app/admin/roles/[id]/page.tsx");
  const detailStart = queries.indexOf("export async function getAdminRoleDetail");
  const memberStart = queries.indexOf("export async function listAdminRoleMembers");
  const detailSource = queries.slice(detailStart, memberStart);

  assert.doesNotMatch(detailSource, /email: true/);
  assert.doesNotMatch(detailSource, /accessRoleAssignments/);
  assert.doesNotMatch(detailSource, /user:\s*\{/);
  assert.match(route, /app\.get\("\/admin\/roles\/:id\/members"/);
  assert.match(route, /app\.get\("\/admin\/roles\/:id\/member-candidates"/);
  assert.match(route, /canAdminAccess\(authorization\.actor, "users", "VIEW"\)/);
  assert.match(route, /canAdminAccess\(authorization\.actor, "role-assignments", "VIEW"\)/);
  assert.match(page, /role\.systemKey !== "NO_ACCESS"/);
});

test("effective access follows the prototype's checkbox-only decision cells", () => {
  const access = source("../app/admin/users/[id]/access/UserAccessView.tsx");
  assert.match(access, /type="checkbox"/);
  assert.match(access, /disabled/);
  assert.doesNotMatch(access, /AccessDecisionInfo/);
  assert.doesNotMatch(access, /InfoIcon/);
  assert.doesNotMatch(access, /role="tooltip"/);
});

test("public Better Auth admin endpoints are blocked and omitted from the client bundle", () => {
  const route = source("../app/api/auth/[...all]/route.ts");
  const client = source("../lib/auth-client.ts");
  assert.match(route, /ADMIN_AUTH_API_PREFIX = "\/api\/auth\/admin"/);
  assert.match(route, /pathname === ADMIN_AUTH_API_PREFIX/);
  assert.match(route, /pathname\.startsWith\(`\$\{ADMIN_AUTH_API_PREFIX\}\/`\)/);
  assert.match(route, /status: 404/);
  assert.doesNotMatch(client, /adminClient/);
});

test("VIEW-only settings preserve current values while disabling every mutation control", () => {
  const phone = source(
    "../app/admin/phone-settings/PhoneSettingsForm.tsx",
  );
  const chat = source("../app/admin/chat-settings/ChatSettingsForm.tsx");
  const languages = source(
    "../app/admin/languages/LanguageSettingsForm.tsx",
  );
  const maintenance = source(
    "../app/admin/maintenance-settings/MaintenanceSettingsForm.tsx",
  );

  for (const form of [phone, chat, languages]) {
    assert.doesNotMatch(form, /\binert=/);
    assert.match(form, /disabled=\{isSubmitting \|\| !canEdit\}/);
  }
  assert.equal(phone.match(/readOnly=\{!canEdit\}/g)?.length, 3);
  assert.equal(chat.match(/readOnly=\{!canEdit\}/g)?.length, 4);
  assert.match(chat, /disabled=\{!canEdit \|\| isSubmitting\}/);
  assert.match(
    languages,
    /disabled=\{!canEdit \|\| isJapanese \|\| isSubmitting\}/,
  );
  assert.match(
    languages,
    /disabled=\{!canEdit \|\| index === 0 \|\| isSubmitting\}/,
  );
  assert.match(
    maintenance,
    /const hasCurrentValue =\s*initialConfig !== null/,
  );
  assert.match(maintenance, /initialConfig\?\.mode \?\? null/);
  assert.match(maintenance, /\{!hasCurrentValue \? \(/);
  assert.doesNotMatch(maintenance, /canEdit \? initialConfig\?\.mode/);
});
