#!/usr/bin/env node

import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/postcss";
import postcss from "postcss";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../../..");
const plansTmpRoot = path.join(repositoryRoot, "plans", "tmp");

const requestedDirectory = process.argv[2];
if (!requestedDirectory) {
  throw new Error(
    "usage: node .agents/skills/implementation-planner/scripts/build-prototype-css.mjs plans/tmp/<plan-id>/prototype",
  );
}

const prototypeDirectory = await realpath(path.resolve(process.cwd(), requestedDirectory));
const canonicalPlansTmpRoot = await realpath(plansTmpRoot);
const relativeTarget = path.relative(canonicalPlansTmpRoot, prototypeDirectory);
const targetSegments = relativeTarget.split(path.sep);
if (
  relativeTarget.startsWith("..") ||
  path.isAbsolute(relativeTarget) ||
  targetSegments.length !== 2 ||
  !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(targetSegments[0]) ||
  targetSegments[1] !== "prototype"
) {
  throw new Error("target must be plans/tmp/<plan-id>/prototype in this repository");
}

const inputPath = path.join(prototypeDirectory, "tailwind.css");
const outputPath = path.join(prototypeDirectory, "styles.css");
const input = await readFile(inputPath, "utf8");
const result = await postcss([tailwindcss()]).process(input, {
  from: inputPath,
  to: outputPath,
});

await writeFile(outputPath, result.css, "utf8");
console.log(`compiled Tailwind CSS: ${path.relative(repositoryRoot, outputPath)}`);
