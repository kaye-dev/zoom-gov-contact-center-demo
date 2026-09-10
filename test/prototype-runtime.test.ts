import assert from "node:assert/strict";
import { mkdir, readFile, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import tailwindcss from "@tailwindcss/postcss";
import postcss from "postcss";
import { preparePrototype, prototypeEnvironment, validatePrototypeConfig } from "../scripts/prototype-runtime.mjs";
import { resolvePrototypeEntry, selectLatestPrototype } from "../scripts/prototype-entry.mjs";
import { createPrototypeRepository } from "./helpers/prototype-runtime-fixture";

test("entry selection supports TSX and legacy HTML and rejects ambiguous/symlink entries", async context => {
  const { root, directory } = await createPrototypeRepository(context);
  assert.equal((await resolvePrototypeEntry(root, "example")).kind, "next");
  await writeFile(path.join(directory, "index.html"), "<html></html>");
  await assert.rejects(resolvePrototypeEntry(root, "example"), /Ambiguous/);
  await rm(path.join(directory, "entry.tsx"));
  assert.equal((await resolvePrototypeEntry(root, "example")).kind, "html");
  await rm(path.join(directory, "index.html"));
  await symlink(path.join(root, "package.json"), path.join(directory, "entry.tsx"));
  await assert.rejects(resolvePrototypeEntry(root, "example"), /symlink/);
  for (const slug of ["../bad", "tmp", "reviews"]) await assert.rejects(resolvePrototypeEntry(root, slug), /Slug/);
});

test("latest selection ignores shared snapshots and cache timestamps", async context => {
  const { root, directory } = await createPrototypeRepository(context);
  const other = path.join(root, "plans/newer/prototype");
  await mkdir(other, { recursive: true });
  await writeFile(path.join(other, "index.html"), "newer");
  await utimes(path.join(directory, "entry.tsx"), 100, 100);
  await utimes(path.join(other, "index.html"), 200, 200);
  await mkdir(path.join(directory, ".shared"));
  await writeFile(path.join(directory, ".shared/latest.tsx"), "newest cache");
  assert.equal(await selectLatestPrototype(root), "newer");
});

test("shared TSX/CSS remain fixed and unchanged host files retain their mtimes", async context => {
  const { root, directory } = await createPrototypeRepository(context);
  const first = await preparePrototype(root, "example");
  const sharedFile = path.join(first.shared, "app/Shared.tsx");
  const saved = await readFile(sharedFile, "utf8");
  const sharedCss = path.join(first.shared, "app/styles/ui-foundation.css");
  const savedCss = await readFile(sharedCss, "utf8");
  const configTime = (await stat(path.join(first.runtime, "next.config.mjs"))).mtimeMs;
  await writeFile(path.join(root, "app/Shared.tsx"), "changed source");
  await writeFile(path.join(root, "app/styles/ui-foundation.css"), "/* changed foundation */");
  await preparePrototype(root, "example");
  assert.equal(await readFile(sharedFile, "utf8"), saved);
  assert.equal(await readFile(sharedCss, "utf8"), savedCss);
  assert.equal((await stat(path.join(first.runtime, "next.config.mjs"))).mtimeMs, configTime);
  const css = await readFile(path.join(first.runtime, "app/globals.css"), "utf8");
  assert.ok(css.includes(path.join(directory, "*.{ts,tsx}")));
  assert.ok(css.includes(path.join(first.shared, "app")));
  assert.ok(!css.includes("plans/other"));
  await preparePrototype(root, "example", { refresh: true });
  assert.equal(await readFile(sharedFile, "utf8"), "changed source");
  assert.equal(await readFile(sharedCss, "utf8"), "/* changed foundation */");
});

test("host CSS generates selected TSX and shared classes without another plan", async context => {
  const { root } = await createPrototypeRepository(context);
  const other = path.join(root, "plans/other/prototype");
  await mkdir(other, { recursive: true });
  await writeFile(path.join(other, "entry.tsx"), '<div className="h-91" />');
  const prepared = await preparePrototype(root, "example");
  const cssFile = path.join(prepared.runtime, "app/globals.css");
  const result = await postcss([tailwindcss()]).process(await readFile(cssFile, "utf8"), { from: cssFile });
  assert.match(result.css, /\.h-39\s*\{/u);
  assert.match(result.css, /\.w-37\s*\{/u);
  assert.doesNotMatch(result.css, /\.h-91\s*\{/u);
});

test("dependency drift and assets outside the adopted snapshot fail without refreshing it", async context => {
  const { root, directory } = await createPrototypeRepository(context);
  const prepared = await preparePrototype(root, "example");
  const lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
  lock.packages["node_modules/next"].version = "999.0.0";
  await writeFile(path.join(root, "package-lock.json"), JSON.stringify(lock));
  await assert.rejects(preparePrototype(root, "example"), /PROTOTYPE_DEPENDENCIES_CHANGED/);
  assert.notEqual(JSON.parse(await readFile(path.join(prepared.shared, "package-lock.json"), "utf8")).packages["node_modules/next"].version, "999.0.0");
  await writeFile(path.join(directory, "prototype.config.json"), JSON.stringify({ assets: ["../secret.js"] }));
  await assert.rejects(preparePrototype(root, "example"), /Invalid public asset/);
});

test("server/API/generated sources, credentials and unselected assets stay outside the host", async context => {
  const { root } = await createPrototypeRepository(context);
  for (const name of ["app/api/secret", "lib/server", "lib/generated"]) await mkdir(path.join(root, name), { recursive: true });
  for (const name of ["app/api/secret/route.ts", "lib/server/private.ts", "lib/generated/private.ts", "lib/auth-client.ts", "lib/admin-fetch.ts"]) await writeFile(path.join(root, name), "SECRET_MARKER");
  await writeFile(path.join(root, "public/private.json"), "SECRET_MARKER");
  const prepared = await preparePrototype(root, "example");
  for (const name of ["app/api", "lib/server", "lib/generated", "lib/auth-client.ts", "lib/admin-fetch.ts", "public/private.json"]) {
    await assert.rejects(stat(path.join(prepared.shared, name)), { code: "ENOENT" });
  }
  const env = prototypeEnvironment({ NODE_ENV: "development", PATH: "/bin", HOME: "/home/test", DATABASE_URL: "SECRET_MARKER", NEXT_PUBLIC_SECRET: "SECRET_MARKER", AWS_SECRET_ACCESS_KEY: "SECRET_MARKER", NODE_OPTIONS: "--require=evil" });
  assert.equal(env.PATH, "/bin");
  assert.ok(!JSON.stringify(env).includes("SECRET_MARKER"));
  assert.equal(Object.hasOwn(env, "NODE_OPTIONS"), false);
  for (const input of [{ route: "//evil" }, { route: "/api/save" }, { route: "/a?b" }, { theme: "unknown" }, { locale: "xx" }]) assert.throws(() => validatePrototypeConfig(input));
});
