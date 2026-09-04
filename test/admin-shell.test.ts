import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("admin layout supplies the session user to the responsive shared shell", () => {
  const layout = source("../app/admin/layout.tsx");
  const shell = source("../app/admin/AdminShell.tsx");

  assert.match(layout, /currentUserName=\{getSessionUser\(session\)!\.name\}/u);
  assert.match(shell, /currentUserName: string/u);
  assert.match(shell, /id="admin-shell"/u);
  assert.match(
    shell,
    /data-sidebar-state=\{isSidebarExpanded \? "expanded" : "collapsed"\}/u,
  );
  assert.match(shell, /lg:grid-cols-\[18rem_minmax\(0,1fr\)\]/u);
  assert.match(shell, /lg:grid-cols-\[4\.25rem_minmax\(0,1fr\)\]/u);
  assert.match(shell, /lg:transition-\[grid-template-columns\]/u);
  assert.match(
    shell,
    /lg:duration-200 lg:ease-out motion-reduce:transition-none/u,
  );
  assert.match(shell, /id="admin-desktop-sidebar"/u);
  assert.match(shell, /lg:sticky lg:top-0 lg:flex lg:h-screen/u);
  assert.match(shell, /<div className="min-w-0">/u);
  assert.match(
    shell,
    /<main className="w-full px-4 py-8 md:px-6 lg:pb-8 lg:pt-5">/u,
  );
  assert.doesNotMatch(shell, /<main className="[^"]*max-w/u);
  assert.doesNotMatch(shell, /addEventListener\(["']scroll["']/u);
});

test("desktop sidebar toggle and shortcut share one guarded state transition", () => {
  const shell = source("../app/admin/AdminShell.tsx");

  assert.match(
    shell,
    /const \[isSidebarExpanded, setIsSidebarExpanded\] = useState\(true\)/u,
  );
  assert.match(
    shell,
    /const toggleSidebar = useCallback\(\(\) => \{[\s\S]*?setIsSidebarExpanded\(\(current\) => !current\)/u,
  );
  assert.match(shell, /id="admin-sidebar-toggle"/u);
  assert.match(shell, /aria-controls="admin-desktop-sidebar"/u);
  assert.match(shell, /aria-expanded=\{isSidebarExpanded\}/u);
  assert.match(shell, /aria-keyshortcuts="Meta\+B"/u);
  assert.match(shell, /LeftPanelCloseIcon/u);
  assert.match(shell, /LeftPanelOpenIcon/u);
  assert.match(shell, /onClick=\{toggleSidebar\}/u);
  assert.match(shell, /event\.key\.toLowerCase\(\) !== "b"/u);
  assert.match(shell, /!event\.metaKey/u);
  assert.match(shell, /event\.ctrlKey/u);
  assert.match(shell, /event\.altKey/u);
  assert.match(shell, /event\.shiftKey/u);
  assert.match(shell, /event\.repeat/u);
  assert.match(shell, /event\.isComposing/u);
  assert.match(shell, /isDrawerOpen/u);
  assert.match(shell, /matchMedia\("\(min-width: 1024px\)"\)/u);
  assert.match(shell, /event\.preventDefault\(\);\s*toggleSidebar\(\)/u);
  assert.doesNotMatch(shell, /target\?\.closest\("input, textarea/u);
});

test("sidebar identity and navigation icons keep the 34px axis across states", () => {
  const shell = source("../app/admin/AdminShell.tsx");
  const navigation = source("../app/admin/AdminNavigation.tsx");
  const identity = shell.match(/data-admin-identity\s*className="([^"]+)"/u);
  const primary = navigation.match(
    /data-admin-primary-navigation[\s\S]*?className="([^"]+)"/u,
  );
  const account = navigation.match(/data-admin-account\s*className="([^"]+)"/u);

  assert.ok(identity);
  assert.match(identity[1], /h-\[76px\]/u);
  assert.match(identity[1], /shrink-0/u);
  assert.match(identity[1], /gap-3/u);
  assert.match(identity[1], /px-4/u);
  assert.match(identity[1], /py-5/u);
  assert.match(shell, /className="flex h-9 w-9 shrink-0/u);
  assert.ok(primary);
  assert.match(primary[1], /px-3/u);
  assert.match(
    navigation,
    /flex h-12 items-center overflow-hidden rounded-lg px-2\.5/u,
  );
  assert.ok(account);
  assert.match(account[1], /mt-auto/u);
  assert.match(account[1], /shrink-0/u);
  assert.match(account[1], /p-3/u);
  assert.match(navigation, /className="flex h-12 w-full[^"]*px-2/u);
  assert.match(navigation, /className="flex h-7 w-7 shrink-0/u);
  assert.match(shell, /max-h-9/u);
  assert.match(shell, /max-h-0/u);
  assert.match(shell, /-translate-x-2 opacity-0/u);
  assert.match(navigation, /-translate-x-2 opacity-0/u);
  assert.match(navigation, /motion-reduce:transition-none/u);
});

test("navigation chrome omits a visible management label and exposes the account menu", () => {
  const shell = source("../app/admin/AdminShell.tsx");
  const navigation = source("../app/admin/AdminNavigation.tsx");
  const identity = shell.match(/data-admin-identity\s*className="([^"]+)"/u);
  const account = navigation.match(/data-admin-account\s*className="([^"]+)"/u);

  assert.doesNotMatch(shell, />\s*\{t\.admin\.title\}\s*</u);
  assert.match(navigation, /aria-label=\{t\.admin\.title\}/u);
  assert.match(navigation, /data-admin-current-user/u);
  assert.match(navigation, /\{currentUserName\}/u);
  assert.match(navigation, /text-ellipsis whitespace-nowrap/u);
  assert.match(navigation, /data-admin-account-trigger/u);
  assert.match(navigation, /aria-haspopup="menu"/u);
  assert.match(navigation, /aria-expanded=\{isAccountMenuOpen\}/u);
  assert.match(navigation, /aria-controls=\{accountMenuId\}/u);
  assert.match(navigation, /aria-label=\{accountAccessibleLabel\}/u);
  assert.match(navigation, /title=\{!showLabels \? accountAccessibleLabel : undefined\}/u);
  assert.match(navigation, /data-admin-account-menu/u);
  assert.match(navigation, /role="menu"/u);
  assert.equal(navigation.match(/\n\s+role="menuitem"/gu)?.length, 2);
  assert.match(navigation, /href="\/"/u);
  assert.match(navigation, /\{t\.admin\.navigation\.backToSite\}/u);
  assert.match(navigation, /\{t\.auth\.signOut\}/u);
  assert.match(navigation, /bottom-full/u);
  assert.match(navigation, /absolute/u);
  assert.match(navigation, /z-20/u);
  assert.ok(identity);
  assert.doesNotMatch(identity[1], /border-[bt]/u);
  assert.ok(account);
  assert.doesNotMatch(account[1], /border-[bt]/u);
  assert.doesNotMatch(
    navigation.match(
      /data-account-menu-item[\s\S]*?className="([^"]+)"/u,
    )?.[1] ?? "",
    /border-[bt]/u,
  );
});

test("account menu supports pointer, keyboard, outside, route, and shell close paths", () => {
  const shell = source("../app/admin/AdminShell.tsx");
  const navigation = source("../app/admin/AdminNavigation.tsx");

  assert.match(shell, /accountMenuSurface/u);
  assert.match(shell, /accountMenuSurface === "desktop"/u);
  assert.match(shell, /accountMenuSurface === "drawer"/u);
  assert.match(shell, /setAccountMenuSurface\(null\)/u);
  assert.match(shell, /accountMenuSurfaceRef\.current = accountMenuSurface/u);
  assert.match(shell, /if \(accountMenuSurfaceRef\.current !== null\) return/u);
  assert.match(shell, /\}, \[closeDrawer, isDrawerOpen\]\)/u);
  assert.match(navigation, /closeOnOutsidePointer/u);
  assert.match(navigation, /accountContainerRef\.current\?\.contains/u);
  assert.match(navigation, /event\.key !== "Escape"/u);
  assert.match(navigation, /accountTriggerRef\.current\?\.focus\(\)/u);
  assert.match(navigation, /event\.key === "Tab"/u);
  assert.match(navigation, /event\.key === "ArrowDown"/u);
  assert.match(navigation, /event\.key === "ArrowUp"/u);
  assert.match(navigation, /event\.key === "Home"/u);
  assert.match(navigation, /event\.key === "End"/u);
  assert.match(navigation, /openAccountMenu\("first"\)/u);
  assert.match(navigation, /items\[nextIndex\]\?\.focus\(\)/u);
  assert.match(
    navigation,
    /if \(isSigningOut \|\| signOutRequestedRef\.current\) return/u,
  );
  assert.match(navigation, /signOutRequestedRef\.current = true/u);
  assert.match(navigation, /disabled=\{isSigningOut\}/u);
  assert.match(shell, /await authClient\.signOut\(\)/u);
  assert.match(shell, /router\.push\("\/login"\)/u);
  assert.match(shell, /router\.refresh\(\)/u);
});

test("mobile drawer uses the shared navigation with complete focus cleanup", () => {
  const shell = source("../app/admin/AdminShell.tsx");

  assert.match(shell, /id="admin-menu-button"/u);
  assert.match(shell, /aria-controls="admin-mobile-navigation"/u);
  assert.match(shell, /id="admin-mobile-navigation"/u);
  assert.match(shell, /fixed inset-0 z-\[60\] lg:hidden/u);
  assert.match(shell, /id="admin-mobile-dialog"/u);
  assert.match(shell, /role="dialog"/u);
  assert.match(shell, /aria-modal="true"/u);
  assert.match(shell, /h-dvh w-80 max-w-\[85vw\]/u);
  assert.match(shell, /document\.body\.style\.overflow = "hidden"/u);
  assert.match(shell, /pageContent\.inert = true/u);
  assert.match(shell, /pageContent\.setAttribute\("aria-hidden", "true"\)/u);
  assert.match(shell, /drawerCloseButtonRef\.current\?\.focus\(\)/u);
  assert.match(shell, /event\.key === "Escape"/u);
  assert.match(shell, /event\.key !== "Tab"/u);
  assert.match(shell, /first \|\| !drawer\.contains\(active\)/u);
  assert.match(shell, /last \|\| !drawer\.contains\(active\)/u);
  assert.match(
    shell,
    /desktopQuery\.addEventListener\("change", closeAtDesktop\)/u,
  );
  assert.match(shell, /document\.body\.style\.overflow = previousOverflow/u);
  assert.match(shell, /pageContent\.inert = previousInert/u);
  assert.match(shell, /desktopQuery\.matches/u);
  assert.match(shell, /document\.getElementById\("admin-sidebar-toggle"\)/u);
  assert.match(shell, /focusTarget\?\.focus\(\)/u);
  assert.match(shell, /onNavigate=\{closeDrawer\}/u);
});

test("section navigation is a full-width, horizontally scrollable link rail", () => {
  const sectionNavigation = source("../app/admin/AdminSectionNavigation.tsx");

  assert.match(sectionNavigation, /<nav/u);
  assert.match(sectionNavigation, /id="admin-section-navigation"/u);
  assert.match(sectionNavigation, /aria-label=\{label\}/u);
  assert.match(sectionNavigation, /-mx-4/u);
  assert.match(sectionNavigation, /md:-mx-6/u);
  assert.match(sectionNavigation, /border-b border-line/u);
  assert.match(sectionNavigation, /overflow-x-auto/u);
  assert.match(sectionNavigation, /min-w-max/u);
  assert.match(sectionNavigation, /whitespace-nowrap/u);
  assert.match(sectionNavigation, /focus-visible:outline-offset-\[-2px\]/u);
  assert.match(sectionNavigation, /border-accent font-bold text-accent/u);
  assert.match(sectionNavigation, /border-transparent font-semibold text-fg-muted/u);
  assert.match(sectionNavigation, /<Link/u);
  assert.match(
    sectionNavigation,
    /aria-current=\{isCurrent \? "page" : undefined\}/u,
  );
  assert.doesNotMatch(sectionNavigation, /role="tab(?:list)?"/u);
});

test("admin overlays remain above the sticky mobile header", () => {
  const shell = source("../app/admin/AdminShell.tsx");
  const userDirectory = source("../app/admin/users/UsersView.tsx");
  const modal = source("../app/components/admin/ModalDialog.tsx");

  assert.match(shell, /sticky top-0 z-40/u);
  assert.match(shell, /fixed inset-0 z-\[60\]/u);
  assert.match(userDirectory, /fixed z-\[70\]/u);
  assert.match(modal, /fixed inset-0 z-\[80\]/u);
});

test("new sidebar SVGs are local decorative currentColor components", () => {
  for (const file of [
    "DashboardIcon",
    "GroupIcon",
    "SettingsIcon",
    "CalendarMonthIcon",
    "SmartToyIcon",
    "LogoutIcon",
    "LeftPanelCloseIcon",
    "LeftPanelOpenIcon",
  ]) {
    const icon = source(`../app/components/svg/${file}.tsx`);
    assert.match(icon, /viewBox="0 -960 960 960"/u, file);
    assert.match(icon, /fill="currentColor"/u, file);
    assert.match(icon, /aria-hidden="true"/u, file);
    assert.match(icon, /focusable="false"/u, file);
    assert.doesNotMatch(icon, /https?:\/\//u, file);
  }
});
