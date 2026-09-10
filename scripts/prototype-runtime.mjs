import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authoredFiles, regularFile, resolvePrototypeEntry } from "./prototype-entry.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const locales = new Set(["ja", "en", "zh-Hans", "zh-Hant", "ko"]);
const assetExtensions = new Set([".js", ".css", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".woff", ".woff2"]);
const sourceExtensions = new Set([".ts", ".tsx", ".css", ".json"]);
const excludedSources = /^(?:app\/api(?:\/|$)|lib\/(?:server|generated)(?:\/|$)|lib\/(?:auth-client|admin-fetch)\.ts$)/u;
const toolEnvironmentKeys = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "TERM", "NO_COLOR", "FORCE_COLOR", "PLAN_ARTIFACT_SESSION_TOKEN"];
const testEnvironmentKeys = ["DEVELOPMENT_PORT_STATE_ROOT", "DEV_RUNTIME_GIT_DIR_OVERRIDE", "DEV_RUNTIME_GIT_COMMON_DIR_OVERRIDE", "DEVELOPMENT_PORT_TEST_INSPECTION"];

/** @param {NodeJS.ProcessEnv} environment @returns {NodeJS.ProcessEnv} */
export function prototypeEnvironment(environment = process.env, mode = "development") {
  const keys = environment.NODE_ENV === "test" ? [...toolEnvironmentKeys, ...testEnvironmentKeys] : toolEnvironmentKeys;
  return {
    ...Object.fromEntries(keys.filter(key => environment[key] !== undefined).map(key => [key, environment[key]])),
    NODE_ENV: environment.NODE_ENV === "test" ? "test" : mode,
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

export function isolatePrototypeEnvironment() {
  const environment = prototypeEnvironment();
  for (const key of Object.keys(process.env)) if (!Object.hasOwn(environment, key)) delete process.env[key];
  Object.assign(process.env, environment);
}

export function validatePrototypeConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("prototype.config.json must be an object");
  for (const key of Object.keys(input)) if (!["route", "tenant", "locale", "theme", "assets"].includes(key)) throw new Error(`Unknown prototype config field: ${key}`);
  const config = { route: "/", tenant: "lg", locale: "ja", theme: "light", assets: [], ...input };
  if (typeof config.route !== "string" || !/^\/(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/u.test(config.route) || /^\/(?:api|_next)(?:\/|$)/u.test(config.route)) throw new Error("prototype route must be a local page path without query, hash, or reserved prefix");
  if (!["lg", "univ"].includes(config.tenant) || !locales.has(config.locale) || !["light", "dark"].includes(config.theme)) throw new Error("Invalid prototype tenant, locale, or theme");
  if (!Array.isArray(config.assets)) throw new Error("prototype assets must be relative public file paths");
  for (const asset of config.assets) {
    if (typeof asset !== "string" || asset.startsWith("/") || !/^[a-zA-Z0-9_.\/-]+$/u.test(asset) || asset.split("/").some(part => !part || part.startsWith(".")) || !assetExtensions.has(path.extname(asset))) throw new Error(`Invalid public asset path: ${asset}`);
  }
  config.assets = [...new Set(["theme-init.js", ...config.assets])];
  return config;
}

export async function readPrototypeConfig(directory) {
  const file = path.join(directory, "prototype.config.json");
  return validatePrototypeConfig(await regularFile(file, { optional: true }) ? JSON.parse(await readFile(file, "utf8")) : {});
}

async function realDirectory(directory) {
  await mkdir(directory, { recursive: true });
  if (await realpath(directory) !== directory || !(await lstat(directory)).isDirectory()) throw new Error(`Directory must not traverse symlinks: ${directory}`);
}

async function writeChanged(file, content) {
  if (await regularFile(file, { optional: true }) && await readFile(file, "utf8") === content) return;
  await realDirectory(path.dirname(file));
  await writeFile(file, content);
}

async function copySources(root, destination, relative) {
  if (excludedSources.test(relative)) return;
  const source = path.join(root, relative);
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new Error(`Shared source must not contain symlinks: ${source}`);
  if (info.isDirectory()) {
    for (const item of await readdir(source)) if (!item.startsWith(".")) await copySources(root, destination, `${relative}/${item}`);
  } else if (info.isFile() && sourceExtensions.has(path.extname(source))) {
    await realDirectory(path.dirname(path.join(destination, relative)));
    await copyFile(source, path.join(destination, relative));
  }
}

export async function snapshotSharedSources(root, directory, config, { refresh = false } = {}) {
  const shared = path.join(directory, ".shared");
  const current = await lstat(shared).catch(error => { if (error.code !== "ENOENT") throw error; return null; });
  if (current && (!current.isDirectory() || await realpath(shared) !== shared)) throw new Error(`Invalid shared source directory: ${shared}`);
  if (current && !refresh) return shared;
  const temporary = path.join(directory, `.shared-tmp-${randomUUID()}`);
  await realDirectory(temporary);
  try {
    for (const source of ["app", "lib"]) await copySources(root, temporary, source);
    for (const asset of config.assets) {
      const source = path.join(root, "public", asset);
      await regularFile(source);
      const target = path.join(temporary, "public", asset);
      await realDirectory(path.dirname(target));
      await copyFile(source, target);
    }
    for (const name of ["package.json", "package-lock.json"]) {
      await regularFile(path.join(root, name));
      await copyFile(path.join(root, name), path.join(temporary, name));
    }
    if (current) {
      const backup = path.join(directory, `.shared-old-${randomUUID()}`);
      await rename(shared, backup);
      try { await rename(temporary, shared); }
      catch (error) { await rename(backup, shared); throw error; }
      await rm(backup, { recursive: true });
    } else {
      try { await rename(temporary, shared); }
      catch (error) { if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error; }
    }
    return shared;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

export async function checkSharedDependencies(root, shared) {
  const [current, saved] = await Promise.all([root, shared].map(async dir => JSON.parse(await readFile(path.join(dir, "package-lock.json"), "utf8"))));
  const names = ["next", "react", "react-dom", "tailwindcss", "@tailwindcss/postcss", "typescript"];
  const changed = names.filter(name => current.packages?.[`node_modules/${name}`]?.version !== saved.packages?.[`node_modules/${name}`]?.version);
  if (changed.length) throw new Error(`PROTOTYPE_DEPENDENCIES_CHANGED: ${changed.join(", ")}. Adopted shared source was preserved; resolve the dependency difference before reusing visual verification.`);
}

function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }

export async function preparePrototype(root, slug, { refresh = false } = {}) {
  root = await realpath(root);
  const entry = await resolvePrototypeEntry(root, slug);
  if (entry.kind !== "next") throw new Error("The Next.js host requires entry.tsx; use the HTML CSS builder for index.html");
  const config = await readPrototypeConfig(entry.directory);
  const shared = await snapshotSharedSources(root, entry.directory, config, { refresh });
  await checkSharedDependencies(root, shared);
  const runtime = path.join(root, ".local/prototype-runtime", slug);
  await realDirectory(runtime);
  const template = path.join(root, "tools/prototype-runtime");
  const templates = await authoredFiles(template);
  for (const source of templates) {
    const relative = path.relative(template, source);
    if (["tsconfig.json", "app/globals.css"].includes(relative)) continue;
    await writeChanged(path.join(runtime, relative), await readFile(source, "utf8"));
  }
  const paths = { repository: root, shared, entry: entry.entry };
  await writeChanged(path.join(runtime, "runtime-paths.json"), json(paths));
  await writeChanged(path.join(runtime, "preview-config.json"), json(config));
  // This package only establishes an app boundary. Dependencies resolve from the checkout.
  await writeChanged(path.join(runtime, "package.json"), json({ private: true, name: `prototype-${slug}`, type: "module" }));
  const tsconfig = JSON.parse(await readFile(path.join(template, "tsconfig.json"), "utf8"));
  tsconfig.compilerOptions.paths = { "@/*": [`./${path.relative(runtime, shared)}/*`], "@prototype/entry": [`./${path.relative(runtime, entry.entry)}`] };
  await writeChanged(path.join(runtime, "tsconfig.json"), json(tsconfig));
  await writeChanged(path.join(runtime, "next-env.d.ts"), '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n');
  const foundation = path.join(shared, "app/styles/ui-foundation.css");
  await regularFile(foundation);
  const sources = [path.join(entry.directory, "*.{ts,tsx}"), path.join(entry.directory, "components"), path.join(shared, "app"), path.join(shared, "lib"), path.join(runtime, "app"), path.join(runtime, "PrototypeProviders.tsx")];
  await writeChanged(path.join(runtime, "app/globals.css"), `@import ${JSON.stringify(foundation)};\n${sources.map(source => `@source ${JSON.stringify(source)};`).join("\n")}\n`);
  for (const asset of config.assets) {
    const source = path.join(shared, "public", asset);
    await regularFile(source);
    const destination = path.join(runtime, "public", asset);
    await realDirectory(path.dirname(destination));
    const content = await readFile(source);
    if (!await regularFile(destination, { optional: true }) || !content.equals(await readFile(destination))) await writeFile(destination, content);
  }
  // Author-owned assets are served through the adapter's path checks, not a public-root mount.
  return { ...entry, config, shared, runtime, root };
}

export function runCommand(command, args, { cwd, env = prototypeEnvironment(), ...options } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} failed (${signal ?? code})`)));
  });
}

export async function checkPrototype(root, slug) {
  const prepared = await preparePrototype(root, slug);
  const { runtime, directory } = prepared;
  const tsc = path.join(root, "node_modules/typescript/bin/tsc");
  await runCommand(process.execPath, [tsc, "--project", path.join(runtime, "tsconfig.json")], { cwd: root });
  const lintConfig = path.join(runtime, "eslint.config.mjs");
  await writeChanged(lintConfig, `import next from 'eslint-config-next/core-web-vitals';\nimport ts from 'eslint-config-next/typescript';\nexport default [...next.filter(x => !x.ignores), ...ts.filter(x => !x.ignores), {files:['**/*.{ts,tsx,mjs}'], rules:{'@next/next/no-html-link-for-pages':'off'}}];\n`);
  const files = [...await authoredFiles(directory), ...await authoredFiles(runtime)].filter(file => /\.(?:ts|tsx|mjs)$/u.test(file) && !file.endsWith("next-env.d.ts") && !file.endsWith("eslint.config.mjs"));
  await runCommand(process.execPath, [path.join(root, "node_modules/eslint/bin/eslint.js"), "--no-ignore", "--config", lintConfig, ...files], { cwd: root });
  return prepared;
}

export function nextPrototypeCsp(port) {
  return ["default-src 'self'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", `connect-src 'self' ws://127.0.0.1:${port}`, "font-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'none'"].join("; ");
}

export async function createNextPrototype(prepared, { port }) {
  isolatePrototypeEnvironment();
  const { default: next } = await import("next");
  // Next installs its own upgrade listener on httpServer after the first request.
  // An unbound receiver keeps that listener behind the artifact server's guards.
  const upgrades = createServer();
  const app = next({ dev: true, dir: prepared.runtime, hostname: "127.0.0.1", port, turbopack: true, httpServer: upgrades });
  await app.prepare();
  return { handle: app.getRequestHandler(), upgrade: (...args) => upgrades.emit("upgrade", ...args), close: () => app.close() };
}

async function main() {
  const [command, slug, ...extra] = process.argv.slice(2);
  try {
    if (extra.length || !["check", "refresh-shared"].includes(command) || !slug) throw new Error("Usage: prototype-runtime.mjs <check|refresh-shared> <slug>");
    if (command === "check") await checkPrototype(defaultRoot, slug);
    else {
      const { createPortAllocator, resolvePortIdentity, processStart } = await import("./development-port-allocation.mjs");
      const lease = await createPortAllocator().status(await resolvePortIdentity(defaultRoot));
      if (lease?.artifact?.slug === slug && await processStart(lease.artifact.pid)) throw new Error(`Stop the owned ${slug} prototype before refreshing its adopted shared sources.`);
      await preparePrototype(defaultRoot, slug, { refresh: true });
    }
    console.log(`Prototype ${command} passed: ${slug}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) void main();
