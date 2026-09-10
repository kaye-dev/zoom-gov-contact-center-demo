import { lstat, realpath, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function validatePrototypeSlug(slug) {
  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]*$/u.test(slug) || ["tmp", "reviews"].includes(slug)) {
    throw new Error("Slug must contain only lowercase letters, digits, and hyphens, and must not be reserved.");
  }
  return slug;
}

export async function regularFile(file, { optional = false } = {}) {
  let info;
  try { info = await lstat(file); }
  catch (error) { if (optional && error.code === "ENOENT") return null; throw error; }
  if (!info.isFile() || info.isSymbolicLink() || await realpath(file) !== file) {
    throw new Error(`Expected a regular file without symlinks: ${file}`);
  }
  return info;
}

export async function resolvePrototypeEntry(root, slug, surface = "prototype") {
  validatePrototypeSlug(slug);
  if (!["prototype", "review"].includes(surface)) throw new Error("Unknown artifact surface");
  const directory = path.join(root, "plans", slug, surface);
  if (await realpath(directory) !== directory || !(await lstat(directory)).isDirectory()) {
    throw new Error(`Artifact directory must be real and must not be a symlink: ${directory}`);
  }
  const html = await regularFile(path.join(directory, "index.html"), { optional: true });
  const tsx = surface === "prototype" && await regularFile(path.join(directory, "entry.tsx"), { optional: true });
  if (html && tsx) throw new Error(`Ambiguous prototype: both index.html and entry.tsx exist in ${directory}`);
  if (!html && !tsx) throw new Error(`Prototype entry point is unavailable: ${directory}/${surface === "review" ? "index.html" : "entry.tsx or index.html"}`);
  return { directory, kind: tsx ? "next" : "html", entry: path.join(directory, tsx ? "entry.tsx" : "index.html") };
}

export async function authoredFiles(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.name.startsWith(".") || item.name === "node_modules") continue;
    const file = path.join(directory, item.name);
    if (item.isSymbolicLink()) throw new Error(`Prototype contents must not contain symlinks: ${file}`);
    if (item.isDirectory()) result.push(...await authoredFiles(file));
    else if (item.isFile()) result.push(file);
  }
  return result;
}

export async function selectLatestPrototype(root) {
  const candidates = await readdir(path.join(root, "plans"), { withFileTypes: true }).catch(error => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  let latest;
  for (const candidate of candidates) {
    if (!candidate.isDirectory() || !/^[a-z0-9][a-z0-9-]*$/u.test(candidate.name) || ["tmp", "reviews"].includes(candidate.name)) continue;
    let entry;
    try { entry = await resolvePrototypeEntry(root, candidate.name); }
    catch (error) {
      if (error.code === "ENOENT" || error.message.startsWith("Prototype entry point is unavailable")) continue;
      throw error;
    }
    const times = await Promise.all((await authoredFiles(entry.directory)).map(async file => (await lstat(file)).mtimeMs));
    const mtime = Math.max(...times);
    if (!latest || mtime > latest.mtime) latest = { slug: candidate.name, mtime };
  }
  if (!latest) throw new Error("No prototype was found under plans/<slug>/prototype with a regular entry.tsx or index.html entry point.");
  return latest.slug;
}

async function main() {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const [command, requested, ...extra] = process.argv.slice(2);
    if (command !== "serve" || extra.length) throw new Error("Usage: prototype-entry.mjs serve [slug]");
    const slug = requested ? validatePrototypeSlug(requested) : await selectLatestPrototype(root);
    await resolvePrototypeEntry(root, slug);
    const artifact = `plans/${slug}/prototype`;
    console.log(`Prototype: ${artifact}`);
    process.argv = [process.execPath, path.join(root, "scripts/serve-plan-artifact.mjs"), artifact];
    await import("./serve-plan-artifact.mjs");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) void main();
