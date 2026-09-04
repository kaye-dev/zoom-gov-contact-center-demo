#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { requireAuthorizationProfile, validateParitySpec } from "./parity-runner-core.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../../..");
const supportedExtensions = new Set([
  ".html",
  ".css",
  ".js",
  ".json",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
]);
const slugPattern = /^[a-z0-9][a-z0-9-]*$/u;
const reservedSlugs = new Set(["tmp", "reviews"]);
const requiredContractKeys = [
  "productionBaseline",
  "comparisonConditions",
  "baselineStateInventory",
  "themeContract",
  "responsiveContract",
  "visualInvariants",
  "intentionalDifferences",
  "stateAndInteraction",
  "comparisonTargets",
  "parityMatrix",
];
const evidenceOnlyContractKeys = [
  "prototypeRevision",
  "machineParity",
  "uiApproval",
  "implementationParity",
];
const requiredMatrixRowKeys = [
  "id",
  "targetId",
  "entry",
  "route",
  "surface",
  "state",
  "viewport",
  "theme",
  "breakpoint",
  "expectedInvariantIds",
  "intentionalDifferenceIds",
];

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function encodeLength(length) {
  const encoded = Buffer.alloc(8);
  encoded.writeBigUInt64BE(BigInt(length));
  return encoded;
}

function sameSnapshot(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function snapshotChanged(relativeEntry) {
  throw new Error(`prototype changed while calculating revision: ${relativeEntry}`);
}

function sourceSnapshotChanged(relativeEntry) {
  throw new Error(`production baseline source changed while calculating revision: ${relativeEntry}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must contain exactly: ${expected.join(", ")}`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireUniqueStrings(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${label} must be ${allowEmpty ? "an" : "a non-empty"} array`);
  }
  const items = value.map((item, index) => requireNonEmptyString(item, `${label}[${index}]`));
  if (new Set(items).size !== items.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
  return items;
}

function requireIdDescriptionList(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${label} must be ${allowEmpty ? "an" : "a non-empty"} array`);
  }
  const ids = value.map((item, index) => {
    if (!isPlainObject(item)) throw new Error(`${label}[${index}] must be an object`);
    requireExactKeys(item, ["id", "description"], `${label}[${index}]`);
    requireNonEmptyString(item.description, `${label}[${index}].description`);
    return requireNonEmptyString(item.id, `${label}[${index}].id`);
  });
  if (new Set(ids).size !== ids.length) throw new Error(`${label} IDs must be unique`);
  return ids;
}

function requireCanonicalArtifactEntry(entry, label, availableFiles) {
  requireNonEmptyString(entry, label);
  const entrySegments = entry.split("/");
  if (
    entry.includes("\\") ||
    path.posix.isAbsolute(entry) ||
    path.posix.normalize(entry) !== entry ||
    entrySegments.some((segment) => segment === "." || segment === "..") ||
    path.posix.extname(entry) !== ".html"
  ) {
    throw new Error(`${label} must be a canonical relative HTML path: ${entry}`);
  }
  if (!availableFiles.has(entry)) {
    throw new Error(`${label} does not exist in the prototype: ${entry}`);
  }
}

function requireOriginRelativeRoute(route, label) {
  requireNonEmptyString(route, label);
  if (
    !route.startsWith("/") ||
    route.startsWith("//") ||
    route.includes("\\") ||
    route.includes("?") ||
    route.includes("#") ||
    new URL(route, "http://contract.invalid").pathname !== route ||
    /[\u0000-\u0020]/u.test(route)
  ) {
    throw new Error(`${label} must be a canonical origin-relative route: ${route}`);
  }
}

function requireBaselineUrl(url, route) {
  requireNonEmptyString(url, "productionBaseline.url");
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`productionBaseline.url must be an absolute HTTP(S) URL: ${url}`);
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== "" ||
    parsed.pathname !== route
  ) {
    throw new Error(
      `productionBaseline.url must be an absolute HTTP(S) URL without credentials or fragment and must match route ${route}`,
    );
  }
}

function requireCanonicalRepositorySource(source, label) {
  requireNonEmptyString(source, label);
  const segments = source.split("/");
  if (
    source.includes("\\") ||
    path.posix.isAbsolute(source) ||
    path.posix.normalize(source) !== source ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(`${label} must be a canonical repository-relative path: ${source}`);
  }
}

async function captureRepositorySourceSnapshot(source, repositoryRealPath, label) {
  requireCanonicalRepositorySource(source, label);
  const absoluteSource = path.resolve(repositoryRealPath, source);
  let beforeOpen;
  try {
    beforeOpen = await lstat(absoluteSource, { bigint: true });
  } catch {
    throw new Error(`${label} does not exist: ${source}`);
  }
  if (beforeOpen.isSymbolicLink() || !beforeOpen.isFile()) {
    throw new Error(`${label} must be a regular file: ${source}`);
  }
  if (typeof fsConstants.O_NOFOLLOW !== "number") {
    throw new Error("this platform cannot safely reject symlinks while reading production baseline sources");
  }

  let handle;
  try {
    handle = await open(absoluteSource, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ELOOP") {
      throw new Error(`${label} must not traverse symlinks: ${source}`);
    }
    return sourceSnapshotChanged(source);
  }

  try {
    const opened = await handle.stat({ bigint: true });
    let afterOpen;
    let resolvedSource;
    try {
      [afterOpen, resolvedSource] = await Promise.all([
        lstat(absoluteSource, { bigint: true }),
        realpath(absoluteSource),
      ]);
    } catch {
      return sourceSnapshotChanged(source);
    }
    if (
      afterOpen.isSymbolicLink() ||
      !opened.isFile() ||
      !afterOpen.isFile() ||
      !sameSnapshot(beforeOpen, opened) ||
      !sameSnapshot(opened, afterOpen)
    ) {
      return sourceSnapshotChanged(source);
    }
    if (resolvedSource !== absoluteSource) {
      throw new Error(`${label} must not traverse symlinks: ${source}`);
    }
    return { absoluteSource, relativeSource: source, metadata: opened };
  } finally {
    await handle.close();
  }
}

async function captureRepositorySourceSnapshots(
  sources,
  repositoryRealPath,
  label = "productionBaseline.sources",
) {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
  const snapshots = [];
  const seen = new Set();
  for (const [index, source] of sources.entries()) {
    const sourceLabel = `${label}[${index}]`;
    requireCanonicalRepositorySource(source, sourceLabel);
    if (seen.has(source)) throw new Error(`${label} must not contain duplicates`);
    seen.add(source);
    snapshots.push(await captureRepositorySourceSnapshot(source, repositoryRealPath, sourceLabel));
  }
  return snapshots;
}

async function assertRepositorySourceSnapshotsUnchanged(snapshots, repositoryRealPath) {
  for (const previous of snapshots) {
    let current;
    try {
      current = await captureRepositorySourceSnapshot(
        previous.relativeSource,
        repositoryRealPath,
        "productionBaseline.sources",
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "this platform cannot safely reject symlinks while reading production baseline sources"
      ) {
        throw error;
      }
      return sourceSnapshotChanged(previous.relativeSource);
    }
    if (
      previous.absoluteSource !== current.absoluteSource ||
      !sameSnapshot(previous.metadata, current.metadata)
    ) {
      return sourceSnapshotChanged(previous.relativeSource);
    }
  }
}

async function capturePrototypeHierarchySnapshots(repositoryRealPath, relativeTarget) {
  const snapshots = [];
  const segments = relativeTarget.split("/");

  for (let depth = 0; depth <= segments.length; depth += 1) {
    const relativeEntry = segments.slice(0, depth).join("/") || ".";
    const absoluteEntry = path.resolve(repositoryRealPath, ...segments.slice(0, depth));
    let beforeResolve;
    let resolvedEntry;
    let afterResolve;
    try {
      beforeResolve = await lstat(absoluteEntry, { bigint: true });
      resolvedEntry = await realpath(absoluteEntry);
      afterResolve = await lstat(absoluteEntry, { bigint: true });
    } catch {
      return snapshotChanged(relativeEntry);
    }
    if (beforeResolve.isSymbolicLink() || afterResolve.isSymbolicLink()) {
      throw new Error(`prototype hierarchy must not contain symlinks: ${relativeEntry}`);
    }
    if (
      !beforeResolve.isDirectory() ||
      !afterResolve.isDirectory() ||
      !sameSnapshot(beforeResolve, afterResolve)
    ) {
      return snapshotChanged(relativeEntry);
    }
    if (resolvedEntry !== absoluteEntry) {
      throw new Error(`prototype hierarchy must not contain symlinks: ${relativeEntry}`);
    }
    snapshots.push({
      absoluteEntry,
      relativeEntry,
      realPath: resolvedEntry,
      metadata: afterResolve,
    });
  }

  return snapshots;
}

async function assertPrototypeHierarchySnapshotsUnchanged(snapshots) {
  for (const previous of snapshots) {
    let beforeResolve;
    let resolvedEntry;
    let afterResolve;
    try {
      beforeResolve = await lstat(previous.absoluteEntry, { bigint: true });
      resolvedEntry = await realpath(previous.absoluteEntry);
      afterResolve = await lstat(previous.absoluteEntry, { bigint: true });
    } catch {
      return snapshotChanged(previous.relativeEntry);
    }
    if (beforeResolve.isSymbolicLink() || afterResolve.isSymbolicLink()) {
      throw new Error(`prototype hierarchy must not contain symlinks: ${previous.relativeEntry}`);
    }
    if (
      !beforeResolve.isDirectory() ||
      !afterResolve.isDirectory() ||
      !sameSnapshot(beforeResolve, afterResolve) ||
      !sameSnapshot(previous.metadata, afterResolve)
    ) {
      return snapshotChanged(previous.relativeEntry);
    }
    if (resolvedEntry !== previous.realPath || resolvedEntry !== previous.absoluteEntry) {
      throw new Error(`prototype hierarchy must not contain symlinks: ${previous.relativeEntry}`);
    }
  }
}

async function assertPrototypeRootSnapshotUnchanged(rootSnapshot) {
  await assertPrototypeHierarchySnapshotsUnchanged(rootSnapshot.hierarchySnapshots);
}

async function assertFinalArtifactSnapshotUnchanged(files, rootSnapshot) {
  await assertPrototypeRootSnapshotUnchanged(rootSnapshot);
  const finalFiles = await collectRegularFiles(rootSnapshot.realPath);
  await assertPrototypeRootSnapshotUnchanged(rootSnapshot);
  assertSameCollectedSnapshot(files, finalFiles);
}

async function assertFinalInputsUnchanged(
  files,
  rootSnapshot,
  sourceSnapshots,
  repositoryRealPath,
  revalidateRoot = assertPrototypeRootSnapshotUnchanged,
  revalidateSources = assertRepositorySourceSnapshotsUnchanged,
) {
  await revalidateRoot(rootSnapshot);
  await revalidateSources(sourceSnapshots, repositoryRealPath);
  await assertFinalArtifactSnapshotUnchanged(files, rootSnapshot);
}

async function validateContract(contract, availableFiles, repositoryRealPath) {
  if (!isPlainObject(contract)) throw new Error("ui-contract.json must contain a JSON object");
  if (contract.version !== 1) throw new Error("ui-contract.json version must be 1");
  for (const key of evidenceOnlyContractKeys) {
    if (Object.hasOwn(contract, key)) {
      throw new Error(`ui-contract.json must not contain revision or evidence field: ${key}`);
    }
  }
  requireExactKeys(contract, ["version", ...requiredContractKeys], "ui-contract.json");

  if (!isPlainObject(contract.productionBaseline)) {
    throw new Error("ui-contract.json productionBaseline must be an object");
  }
  const baselineKeys = Object.keys(contract.productionBaseline);
  if (
    baselineKeys.some(
      (key) => !["sources", "runtimeOwner", "checkout", "commit", "url", "route"].includes(key),
    ) ||
    !["sources", "runtimeOwner", "checkout", "commit", "route"].every((key) => baselineKeys.includes(key))
  ) {
    throw new Error(
      "productionBaseline must contain sources, runtimeOwner, checkout, commit, route, and optional url, with no other keys",
    );
  }
  const sourceSnapshots = await captureRepositorySourceSnapshots(
    contract.productionBaseline.sources,
    repositoryRealPath,
  );
  for (const key of ["runtimeOwner", "checkout"]) {
    requireNonEmptyString(contract.productionBaseline[key], `productionBaseline.${key}`);
  }
  if (!/^[0-9a-f]{40}$/u.test(contract.productionBaseline.commit)) {
    throw new Error("productionBaseline.commit must be a full lowercase 40-character Git commit SHA");
  }
  requireOriginRelativeRoute(contract.productionBaseline.route, "productionBaseline.route");
  if (Object.hasOwn(contract.productionBaseline, "url")) {
    requireBaselineUrl(contract.productionBaseline.url, contract.productionBaseline.route);
  }

  const conditions = contract.comparisonConditions;
  if (!isPlainObject(conditions)) {
    throw new Error("ui-contract.json comparisonConditions must be an object");
  }
  requireExactKeys(
    conditions,
    ["viewports", "dpr", "scroll", "locale", "themes", "fixture", "authorization", "query"],
    "comparisonConditions",
  );
  const viewports = requireUniqueStrings(conditions.viewports, "comparisonConditions.viewports");
  let hasDesktopViewport = false;
  for (const viewport of viewports) {
    const match = /^(\d+)x(\d+)$/u.exec(viewport);
    if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0) {
      throw new Error(`comparisonConditions viewport must use <width>x<height>: ${viewport}`);
    }
    if (Number(match[1]) >= 1024) hasDesktopViewport = true;
  }
  if (!viewports.includes("390x844") || !hasDesktopViewport) {
    throw new Error("comparisonConditions.viewports must include 390x844 and a desktop width of at least 1024px");
  }
  const comparisonThemes = requireUniqueStrings(conditions.themes, "comparisonConditions.themes");
  if (!comparisonThemes.includes("light") || !comparisonThemes.includes("dark")) {
    throw new Error("comparisonConditions.themes must include light and dark");
  }
  if (typeof conditions.dpr !== "number" || !Number.isFinite(conditions.dpr) || conditions.dpr <= 0) {
    throw new Error("comparisonConditions.dpr must be a positive finite number");
  }
  if (!isPlainObject(conditions.scroll)) {
    throw new Error("comparisonConditions.scroll must be an object");
  }
  requireExactKeys(conditions.scroll, ["x", "y"], "comparisonConditions.scroll");
  for (const axis of ["x", "y"]) {
    const offset = conditions.scroll[axis];
    if (typeof offset !== "number" || !Number.isFinite(offset) || offset < 0) {
      throw new Error(`comparisonConditions.scroll.${axis} must be a non-negative finite number`);
    }
  }
  requireNonEmptyString(conditions.locale, "comparisonConditions.locale");
  requireNonEmptyString(conditions.fixture, "comparisonConditions.fixture");
  requireAuthorizationProfile(conditions.authorization, "comparisonConditions.authorization");
  requireNonEmptyString(conditions.query, "comparisonConditions.query");

  const states = requireUniqueStrings(contract.baselineStateInventory, "baselineStateInventory");
  const themes = requireUniqueStrings(contract.themeContract, "themeContract");
  if (JSON.stringify([...themes].sort()) !== JSON.stringify([...comparisonThemes].sort())) {
    throw new Error("themeContract must contain exactly the comparisonConditions themes");
  }
  const interactions = requireUniqueStrings(contract.stateAndInteraction, "stateAndInteraction");
  if (!interactions.includes("keyboard") || !interactions.includes("focus")) {
    throw new Error("stateAndInteraction must include keyboard and focus");
  }
  const invariantIds = requireIdDescriptionList(contract.visualInvariants, "visualInvariants");
  const differenceIds = requireIdDescriptionList(contract.intentionalDifferences, "intentionalDifferences", {
    allowEmpty: true,
  });

  if (!Array.isArray(contract.responsiveContract) || contract.responsiveContract.length === 0) {
    throw new Error("responsiveContract must be a non-empty array");
  }
  const breakpointViewport = new Map();
  for (const [index, item] of contract.responsiveContract.entries()) {
    if (!isPlainObject(item)) throw new Error(`responsiveContract[${index}] must be an object`);
    requireExactKeys(item, ["id", "viewport"], `responsiveContract[${index}]`);
    const id = requireNonEmptyString(item.id, `responsiveContract[${index}].id`);
    const viewport = requireNonEmptyString(item.viewport, `responsiveContract[${index}].viewport`);
    if (breakpointViewport.has(id)) throw new Error("responsiveContract IDs must be unique");
    if (!viewports.includes(viewport)) {
      throw new Error(`responsiveContract viewport is not declared in comparisonConditions: ${viewport}`);
    }
    breakpointViewport.set(id, viewport);
  }
  if (
    JSON.stringify([...new Set(breakpointViewport.values())].sort()) !==
    JSON.stringify([...viewports].sort())
  ) {
    throw new Error("responsiveContract must map every comparisonConditions viewport");
  }

  if (!Array.isArray(contract.comparisonTargets) || contract.comparisonTargets.length === 0) {
    throw new Error("comparisonTargets must be a non-empty array");
  }
  const comparisonTargets = new Map();
  const targetTuples = new Set();
  for (const [index, target] of contract.comparisonTargets.entries()) {
    if (!isPlainObject(target)) throw new Error(`comparisonTargets[${index}] must be an object`);
    requireExactKeys(target, ["id", "entry", "route", "surface"], `comparisonTargets[${index}]`);
    const id = requireNonEmptyString(target.id, `comparisonTargets[${index}].id`);
    requireCanonicalArtifactEntry(
      target.entry,
      `comparisonTargets[${index}].entry`,
      availableFiles,
    );
    requireOriginRelativeRoute(target.route, `comparisonTargets[${index}].route`);
    requireNonEmptyString(target.surface, `comparisonTargets[${index}].surface`);
    if (comparisonTargets.has(id)) throw new Error("comparisonTargets IDs must be unique");
    const targetTuple = JSON.stringify([target.entry, target.route, target.surface]);
    if (targetTuples.has(targetTuple)) throw new Error("comparisonTargets tuples must be unique");
    comparisonTargets.set(id, target);
    targetTuples.add(targetTuple);
  }
  if (![...comparisonTargets.values()].some((target) => target.entry === "index.html")) {
    throw new Error("comparisonTargets must include index.html");
  }
  if (![...comparisonTargets.values()].some(
    (target) => target.route === contract.productionBaseline.route,
  )) {
    throw new Error("productionBaseline.route must match at least one comparison target route");
  }

  if (!Array.isArray(contract.parityMatrix) || contract.parityMatrix.length === 0) {
    throw new Error("parityMatrix must be a non-empty array");
  }
  const rowIds = new Set();
  const tuples = new Set();
  const referencedInvariantIds = new Set();
  const referencedDifferenceIds = new Set();
  for (const [index, row] of contract.parityMatrix.entries()) {
    if (!isPlainObject(row)) throw new Error(`parityMatrix[${index}] must be an object`);
    requireExactKeys(row, requiredMatrixRowKeys, `parityMatrix[${index}]`);
    for (const key of ["id", "targetId", "entry", "route", "surface", "state", "viewport", "theme", "breakpoint"]) {
      requireNonEmptyString(row[key], `parityMatrix[${index}].${key}`);
    }
    requireCanonicalArtifactEntry(row.entry, `parityMatrix[${index}].entry`, availableFiles);
    requireOriginRelativeRoute(row.route, `parityMatrix[${index}].route`);
    const target = comparisonTargets.get(row.targetId);
    if (!target) throw new Error(`parityMatrix target is not declared: ${row.targetId}`);
    if (
      target.entry !== row.entry ||
      target.route !== row.route ||
      target.surface !== row.surface
    ) {
      throw new Error(`parityMatrix row does not match comparison target: ${row.id}`);
    }
    if (rowIds.has(row.id)) throw new Error("parityMatrix row IDs must be unique");
    rowIds.add(row.id);
    if (!states.includes(row.state)) throw new Error(`parityMatrix state is not declared: ${row.state}`);
    if (!themes.includes(row.theme)) throw new Error(`parityMatrix theme is not declared: ${row.theme}`);
    if (!breakpointViewport.has(row.breakpoint)) {
      throw new Error(`parityMatrix breakpoint is not declared: ${row.breakpoint}`);
    }
    if (breakpointViewport.get(row.breakpoint) !== row.viewport) {
      throw new Error(`parityMatrix viewport does not match breakpoint: ${row.id}`);
    }
    const expectedIds = requireUniqueStrings(row.expectedInvariantIds, `parityMatrix[${index}].expectedInvariantIds`);
    const deltaIds = requireUniqueStrings(
      row.intentionalDifferenceIds,
      `parityMatrix[${index}].intentionalDifferenceIds`,
      { allowEmpty: true },
    );
    for (const id of expectedIds) {
      if (!invariantIds.includes(id)) throw new Error(`parityMatrix references unknown invariant ID: ${id}`);
      referencedInvariantIds.add(id);
    }
    for (const id of deltaIds) {
      if (!differenceIds.includes(id)) throw new Error(`parityMatrix references unknown difference ID: ${id}`);
      referencedDifferenceIds.add(id);
    }
    const tuple = JSON.stringify([row.targetId, row.state, row.breakpoint, row.theme]);
    if (tuples.has(tuple)) throw new Error(`parityMatrix duplicates a comparison tuple: ${row.id}`);
    tuples.add(tuple);
  }
  for (const targetId of comparisonTargets.keys()) {
    for (const state of states) {
      for (const breakpoint of breakpointViewport.keys()) {
        for (const theme of themes) {
          const tuple = JSON.stringify([targetId, state, breakpoint, theme]);
          if (!tuples.has(tuple)) {
            throw new Error(`parityMatrix is missing target/state/breakpoint/theme coverage: ${tuple}`);
          }
        }
      }
    }
  }
  for (const id of invariantIds) {
    if (!referencedInvariantIds.has(id)) throw new Error(`visual invariant is not used by parityMatrix: ${id}`);
  }
  for (const id of differenceIds) {
    if (!referencedDifferenceIds.has(id)) throw new Error(`intentional difference is not used by parityMatrix: ${id}`);
  }
  return { sourceSnapshots };
}

function resolvePrototypeDirectory(requestedDirectory, repositoryRootPath) {
  if (requestedDirectory.includes("\\")) {
    throw new Error("target path must use forward slashes");
  }

  const segments = requestedDirectory.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("target path must not contain dot segments");
  }
  if (path.normalize(requestedDirectory) !== requestedDirectory) {
    throw new Error("target path must use the exact canonical hierarchy");
  }

  const relativeTarget = path.isAbsolute(requestedDirectory)
    ? toPosix(path.relative(repositoryRootPath, requestedDirectory))
    : requestedDirectory;
  const match = /^plans\/([^/]+)\/prototype$/u.exec(relativeTarget);
  if (!match) {
    throw new Error("target must be exactly plans/<slug>/prototype in this repository");
  }

  const slug = match[1];
  if (!slugPattern.test(slug) || reservedSlugs.has(slug)) {
    throw new Error("prototype slug must be lowercase kebab-case and must not be tmp or reviews");
  }

  const absoluteTarget = path.resolve(repositoryRootPath, relativeTarget);
  if (path.isAbsolute(requestedDirectory) && requestedDirectory !== absoluteTarget) {
    throw new Error("target must be inside this repository at plans/<slug>/prototype");
  }
  return { absoluteTarget, relativeTarget };
}

async function collectRegularFiles(prototypeDirectory) {
  const files = [];
  const pendingDirectories = [prototypeDirectory];

  while (pendingDirectories.length > 0) {
    const currentDirectory = pendingDirectories.pop();
    for (const entry of await readdir(currentDirectory, { withFileTypes: true })) {
      const absoluteEntry = path.join(currentDirectory, entry.name);
      const relativeEntry = toPosix(path.relative(prototypeDirectory, absoluteEntry));
      const metadata = await lstat(absoluteEntry, { bigint: true });

      if (metadata.isSymbolicLink()) {
        throw new Error(`prototype contents must not contain symlinks: ${relativeEntry}`);
      }
      if (metadata.isDirectory()) {
        pendingDirectories.push(absoluteEntry);
        continue;
      }
      if (!metadata.isFile()) {
        throw new Error(`prototype contents must be regular files or directories: ${relativeEntry}`);
      }
      if (!supportedExtensions.has(path.posix.extname(relativeEntry))) {
        throw new Error(`unsupported prototype file extension: ${relativeEntry}`);
      }

      const pathBytes = Buffer.from(relativeEntry, "utf8");
      files.push({ absoluteEntry, relativeEntry, pathBytes, metadata });
    }
  }

  files.sort((left, right) => Buffer.compare(left.pathBytes, right.pathBytes));
  return files;
}

async function readStableRegularFile(file, prototypeRealPath) {
  let beforeOpen;
  try {
    beforeOpen = await lstat(file.absoluteEntry, { bigint: true });
  } catch {
    return snapshotChanged(file.relativeEntry);
  }
  if (beforeOpen.isSymbolicLink()) {
    throw new Error(`prototype contents must not contain symlinks: ${file.relativeEntry}`);
  }
  if (!beforeOpen.isFile() || !sameSnapshot(file.metadata, beforeOpen)) {
    return snapshotChanged(file.relativeEntry);
  }
  if (typeof fsConstants.O_NOFOLLOW !== "number") {
    throw new Error("this platform cannot safely reject symlinks while reading prototype files");
  }

  let handle;
  try {
    handle = await open(file.absoluteEntry, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ELOOP") {
      throw new Error(`prototype contents must not contain symlinks: ${file.relativeEntry}`);
    }
    return snapshotChanged(file.relativeEntry);
  }

  try {
    const openedBeforeRead = await handle.stat({ bigint: true });
    if (!openedBeforeRead.isFile() || !sameSnapshot(beforeOpen, openedBeforeRead)) {
      return snapshotChanged(file.relativeEntry);
    }

    const expectedRealPath = path.resolve(prototypeRealPath, file.relativeEntry);
    let resolvedBeforeRead;
    try {
      resolvedBeforeRead = await realpath(file.absoluteEntry);
    } catch {
      return snapshotChanged(file.relativeEntry);
    }
    if (resolvedBeforeRead !== expectedRealPath) {
      throw new Error(`prototype hierarchy must not contain symlinks: ${file.relativeEntry}`);
    }

    const contents = await handle.readFile();
    const openedAfterRead = await handle.stat({ bigint: true });
    let afterRead;
    let resolvedAfterRead;
    try {
      [afterRead, resolvedAfterRead] = await Promise.all([
        lstat(file.absoluteEntry, { bigint: true }),
        realpath(file.absoluteEntry),
      ]);
    } catch {
      return snapshotChanged(file.relativeEntry);
    }
    if (
      afterRead.isSymbolicLink() ||
      !afterRead.isFile() ||
      !sameSnapshot(openedBeforeRead, openedAfterRead) ||
      !sameSnapshot(openedAfterRead, afterRead)
    ) {
      return snapshotChanged(file.relativeEntry);
    }
    if (resolvedAfterRead !== expectedRealPath) {
      throw new Error(`prototype hierarchy must not contain symlinks: ${file.relativeEntry}`);
    }
    return contents;
  } finally {
    await handle.close();
  }
}

function assertSameCollectedSnapshot(before, after) {
  if (before.length !== after.length) snapshotChanged("file list");
  for (let index = 0; index < before.length; index += 1) {
    const previous = before[index];
    const current = after[index];
    if (
      previous.relativeEntry !== current.relativeEntry ||
      !sameSnapshot(previous.metadata, current.metadata)
    ) {
      snapshotChanged(previous.relativeEntry);
    }
  }
}

async function hashCollectedFiles(files, prototypeRealPath) {
  const hash = createHash("sha256");
  for (const file of files) {
    const contents = await readStableRegularFile(file, prototypeRealPath);
    hash.update(encodeLength(file.pathBytes.length));
    hash.update(file.pathBytes);
    hash.update(encodeLength(contents.length));
    hash.update(contents);
  }
  return `sha256:${hash.digest("hex")}`;
}

async function resolveRepositoryRoot(requestedRoot) {
  if (!path.isAbsolute(requestedRoot) || path.resolve(requestedRoot) !== requestedRoot) {
    throw new Error("repository root must be an absolute canonical path");
  }
  let metadata;
  let resolved;
  try {
    [metadata, resolved] = await Promise.all([
      lstat(requestedRoot, { bigint: true }),
      realpath(requestedRoot),
    ]);
  } catch {
    throw new Error("repository root must be an existing directory");
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || resolved !== requestedRoot) {
    throw new Error("repository root must be a real directory without symlinks");
  }
  return resolved;
}

async function prototypeRevisionInRepository(requestedDirectory, requestedRoot) {
  const repositoryRealPath = await resolveRepositoryRoot(requestedRoot);
  const { absoluteTarget, relativeTarget } = resolvePrototypeDirectory(
    requestedDirectory,
    repositoryRealPath,
  );

  let rootMetadata;
  try {
    rootMetadata = await lstat(absoluteTarget, { bigint: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`prototype directory does not exist: ${relativeTarget}`);
    }
    throw error;
  }

  if (rootMetadata.isSymbolicLink()) {
    throw new Error("prototype directory must not be a symlink");
  }
  if (!rootMetadata.isDirectory()) {
    throw new Error("prototype target must be a directory");
  }

  const prototypeRealPath = await realpath(absoluteTarget);
  const expectedRealPath = path.resolve(repositoryRealPath, relativeTarget);
  if (prototypeRealPath !== expectedRealPath) {
    throw new Error("prototype hierarchy must not contain symlinks");
  }

  const hierarchySnapshots = await capturePrototypeHierarchySnapshots(
    repositoryRealPath,
    relativeTarget,
  );
  const finalRootSnapshot = hierarchySnapshots.at(-1);
  if (!finalRootSnapshot || finalRootSnapshot.realPath !== prototypeRealPath) {
    return snapshotChanged(relativeTarget);
  }

  const files = await collectRegularFiles(absoluteTarget);
  if (!files.some((file) => file.relativeEntry === "index.html")) {
    throw new Error("prototype directory must contain a regular index.html file");
  }

  const contractFile = files.find((file) => file.relativeEntry === "ui-contract.json");
  if (!contractFile) {
    throw new Error("prototype directory must contain a regular ui-contract.json file");
  }

  const contractContents = await readStableRegularFile(contractFile, prototypeRealPath);
  let contract;
  try {
    contract = JSON.parse(contractContents.toString("utf8"));
  } catch {
    throw new Error("ui-contract.json must contain valid JSON");
  }
  const { sourceSnapshots } = await validateContract(
    contract,
    new Set(files.map((file) => file.relativeEntry)),
    repositoryRealPath,
  );

  const profileFile = files.find((file) => file.relativeEntry === "parity-spec.json");
  if (profileFile) {
    const profileContents = await readStableRegularFile(profileFile, prototypeRealPath);
    let profile;
    try {
      profile = JSON.parse(profileContents.toString("utf8"));
    } catch {
      throw new Error("parity-spec.json must contain valid JSON");
    }
    validateParitySpec(profile, contract);
  }

  const revision = await hashCollectedFiles(files, prototypeRealPath);
  // Revalidate the root identity and every production source before the final
  // artifact snapshot. The finalization call is deliberately the last await
  // before returning so mutations during either earlier check are observed.
  await assertFinalInputsUnchanged(
    files,
    {
      absoluteTarget,
      relativeTarget,
      metadata: finalRootSnapshot.metadata,
      realPath: prototypeRealPath,
      hierarchySnapshots,
    },
    sourceSnapshots,
    repositoryRealPath,
  );
  return revision;
}

async function prototypeRevision(requestedDirectory) {
  return prototypeRevisionInRepository(requestedDirectory, repositoryRoot);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    throw new Error(
      "usage: node .agents/skills/plan/scripts/prototype-revision.mjs plans/<slug>/prototype",
    );
  }
  console.log(await prototypeRevision(args[0]));
}

async function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return (await realpath(process.argv[1])) === (await realpath(fileURLToPath(import.meta.url)));
  } catch {
    return false;
  }
}

if (await isMainModule()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export {
  assertFinalInputsUnchanged,
  assertRepositorySourceSnapshotsUnchanged,
  capturePrototypeHierarchySnapshots,
  captureRepositorySourceSnapshots,
  collectRegularFiles,
  hashCollectedFiles,
  prototypeRevision,
  prototypeRevisionInRepository,
};
