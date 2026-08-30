import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("admin shell keeps the shared header sticky without fixed-position compensation", () => {
  const shell = source("../app/admin/AdminShell.tsx");
  const header = shell.match(/<header className="([^"]+)"/u);

  assert.ok(header, "AdminShell must render a classed header");
  assert.match(header[1], /(?:^|\s)sticky(?:\s|$)/u);
  assert.match(header[1], /(?:^|\s)top-0(?:\s|$)/u);
  assert.match(header[1], /(?:^|\s)z-50(?:\s|$)/u);
  assert.doesNotMatch(header[1], /(?:^|\s)fixed(?:\s|$)/u);
  assert.doesNotMatch(shell, /addEventListener\(["']scroll["']/u);
  assert.match(shell, /<main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6">/u);
});

test("admin overlays remain above the sticky header stacking context", () => {
  const userDirectory = source("../app/admin/users/UsersView.tsx");
  const modal = source("../app/components/admin/ModalDialog.tsx");

  assert.match(userDirectory, /fixed z-\[70\]/u);
  assert.match(modal, /fixed inset-0 z-\[80\]/u);
});

test("reservation system is a direct responsive navigation item", () => {
  const shell = source("../app/admin/AdminShell.tsx");
  const layout = source("../app/admin/layout.tsx");
  const settingsMenu = shell.indexOf('key: "settings"');
  const reservationLink = shell.indexOf('href="/admin/reservations"');
  const signOut = shell.indexOf("onClick={signOut}");

  assert.match(shell, /flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto/u);
  assert.ok(settingsMenu < reservationLink);
  assert.ok(reservationLink < signOut);
  assert.match(shell, /pathname\.startsWith\("\/admin\/reservations"\) \? "page"/u);
  assert.match(layout, /visibleItems\.push\("reservations"\)/u);
});
