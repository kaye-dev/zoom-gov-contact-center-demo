#!/usr/bin/env node

import { lstat, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/postcss";
import postcss from "postcss";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../../..");
const requestedDirectory = process.argv[2];

if (!requestedDirectory || process.argv.length !== 3) {
  throw new Error(
    "usage: node .agents/skills/plan/scripts/build-prototype-css.mjs plans/<slug>/prototype",
  );
}

const slug = "[a-z0-9][a-z0-9-]*";
const canonicalPattern = new RegExp(`^plans/${slug}/prototype$`);
const rawSegments = requestedDirectory.split(/[\\/]/u);
if (
  requestedDirectory.includes("\\")
  || rawSegments.some((segment) => segment === "." || segment === "..")
) {
  throw new Error("target path must not contain dot segments or backslashes");
}

const lexicalTarget = (
  path.isAbsolute(requestedDirectory)
    ? path.relative(repositoryRoot, requestedDirectory)
    : requestedDirectory
).split(path.sep).join("/");
if (!canonicalPattern.test(lexicalTarget)) {
  throw new Error(
    "target must be plans/<slug>/prototype in this repository",
  );
}

const requestedAbsolute = path.resolve(repositoryRoot, requestedDirectory);
const prototypeDirectory = await realpath(requestedAbsolute);
if (prototypeDirectory !== requestedAbsolute) {
  throw new Error("prototype directory must be a real directory, not a symlink");
}
if (!(await lstat(prototypeDirectory)).isDirectory()) {
  throw new Error("prototype directory must be a directory");
}

const relativeTarget = path
  .relative(repositoryRoot, prototypeDirectory)
  .split(path.sep)
  .join("/");
if (!canonicalPattern.test(relativeTarget)) {
  throw new Error(
    "target must be plans/<slug>/prototype in this repository",
  );
}

const inputPath = path.join(prototypeDirectory, "tailwind.css");
const outputPath = path.join(prototypeDirectory, "styles.css");
const inputMetadata = await lstat(inputPath);
if (inputMetadata.isSymbolicLink() || !inputMetadata.isFile()) {
  throw new Error("tailwind.css must be a regular file, not a symlink");
}

try {
  const outputMetadata = await lstat(outputPath);
  if (outputMetadata.isSymbolicLink() || !outputMetadata.isFile()) {
    throw new Error("styles.css must be a regular file, not a symlink");
  }
} catch (error) {
  if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
    throw error;
  }
}

const pendingDirectories = [prototypeDirectory];
while (pendingDirectories.length > 0) {
  const currentDirectory = pendingDirectories.pop();
  for (const entry of await readdir(currentDirectory, { withFileTypes: true })) {
    const entryPath = path.join(currentDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`prototype contents must not contain symlinks: ${entry.name}`);
    }
    if (entry.isDirectory()) pendingDirectories.push(entryPath);
  }
}

const input = await readFile(inputPath, "utf8");
const expectedInput = '@import "../../../app/styles/ui-foundation.css";\n@source ".";\n';
if (input !== expectedInput) {
  throw new Error(
    "tailwind.css must exactly match the documented import and @source contract; custom directives are unavailable",
  );
}

const result = await postcss([tailwindcss({ base: repositoryRoot })]).process(expectedInput, {
  from: inputPath,
  to: outputPath,
});

const temporaryPath = `${outputPath}.${process.pid}.tmp`;
try {
  await writeFile(temporaryPath, result.css, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  await rename(temporaryPath, outputPath);
} finally {
  await rm(temporaryPath, { force: true });
}
console.log(`compiled Tailwind CSS: ${path.relative(repositoryRoot, outputPath)}`);
