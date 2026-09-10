#!/usr/bin/env node

import { execFile } from "node:child_process";
import { lstat, realpath, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { releaseWorktreeRuntime } from "./release-worktree-runtime.mjs";

const execFileAsync = promisify(execFile);
const runtimeManifest = ".codex/runtime.local.env";
const confirmationState = ".codex/confirmation-session.local.json";
const confirmationFields = new Set([
  "schemaVersion",
  "sessionId",
  "checkout",
  "gitCommonDirectory",
  "slug",
  "createdAt",
  "artifactServers",
  "appRuntime",
]);

function fail(message) {
  throw new Error(message);
}

function parseKeyValues(text) {
  const values = {};
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

function parseWorktreeList(text) {
  return text
    .trim()
    .split("\n\n")
    .filter(Boolean)
    .map((record) => {
      const values = Object.fromEntries(
        record.split("\n").map((line) => {
          const separator = line.indexOf(" ");
          return separator === -1 ? [line, "true"] : [line.slice(0, separator), line.slice(separator + 1)];
        }),
      );
      return {
        path: values.worktree,
        head: values.HEAD ?? "unknown",
        branch: values.branch?.replace(/^refs\/heads\//u, "") ?? (values.detached ? "detached" : "unknown"),
        prunable: values.prunable === "true",
      };
    });
}

function portFromUrl(value) {
  try {
    const url = new URL(value);
    return Number(url.port);
  } catch {
    return null;
  }
}

function parseLsof(text) {
  const listeners = [];
  let current = null;
  for (const line of text.split("\n")) {
    if (!line) continue;
    const kind = line[0];
    const value = line.slice(1);
    if (kind === "p") {
      current = { pid: Number(value), command: "unknown", addresses: [] };
      listeners.push(current);
    } else if (current && kind === "c") {
      current.command = value;
    } else if (current && kind === "n") {
      current.addresses.push(value);
    }
  }
  return listeners;
}

function listenerForPort(listeners, port) {
  if (!Number.isInteger(port) || port <= 0) return null;
  return listeners.find((listener) => listener.addresses.some((address) => address.endsWith(`:${port}`))) ?? null;
}

async function safeFileState(file) {
  try {
    const metadata = await lstat(file);
    if (!metadata.isFile() || metadata.isSymbolicLink() || (await realpath(file)) !== file) return "unsafe";
    return "regular";
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return "absent";
    throw error;
  }
}

async function readRuntime(checkout) {
  const file = path.join(checkout, runtimeManifest);
  const fileState = await safeFileState(file);
  if (fileState === "absent") return { state: "absent" };
  if (fileState !== "regular") return { state: "invalid", reason: "runtime manifest is not a safe regular file" };
  const values = parseKeyValues(await readFile(file, "utf8"));
  const hostPort = Number(values.HOST_PORT);
  const studioPort = Number(values.STUDIO_PORT);
  if (
    values.RUNTIME_CHECKOUT_PATH !== checkout ||
    !Number.isInteger(hostPort) ||
    !Number.isInteger(studioPort) ||
    !values.RUNTIME_ID ||
    !values.COMPOSE_PROJECT_NAME
  ) {
    return { state: "invalid", reason: "runtime manifest identity or port is invalid" };
  }
  return {
    state: "valid",
    mode: values.RUNTIME_MODE,
    runtimeId: values.RUNTIME_ID,
    composeProject: values.COMPOSE_PROJECT_NAME,
    hostPort,
    studioPort,
  };
}

async function readConfirmation(checkout) {
  const file = path.join(checkout, confirmationState);
  const fileState = await safeFileState(file);
  if (fileState === "absent") return { state: "absent" };
  if (fileState !== "regular") return { state: "invalid", reason: "confirmation session is not a safe regular file" };
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    if (
      !value ||
      typeof value !== "object" ||
      Object.keys(value).some((key) => !confirmationFields.has(key)) ||
      value.schemaVersion !== 1 ||
      value.checkout !== checkout ||
      typeof value.slug !== "string" ||
      !value.artifactServers ||
      typeof value.artifactServers !== "object" ||
      Array.isArray(value.artifactServers)
    ) {
      return { state: "invalid", reason: "confirmation session identity is invalid" };
    }
    const artifacts = [];
    for (const surface of ["prototype", "review"]) {
      const artifact = value.artifactServers[surface];
      if (artifact === undefined) continue;
      if (!artifact || typeof artifact !== "object" || Array.isArray(artifact) || artifact.surface !== surface) {
        return { state: "invalid", reason: `confirmation ${surface} artifact is invalid` };
      }
      const port = portFromUrl(artifact.url);
      if (!Number.isInteger(artifact.pid) || artifact.pid <= 0 || !port) {
        return { state: "invalid", reason: `confirmation ${surface} artifact has an invalid PID or URL` };
      }
      artifacts.push({ surface, port, pid: artifact.pid });
    }
    return { state: "valid", slug: value.slug, artifacts, appRuntime: value.appRuntime };
  } catch {
    return { state: "invalid", reason: "confirmation session is malformed" };
  }
}

async function command(commandName, args, options = {}) {
  return execFileAsync(commandName, args, { encoding: "utf8", ...options });
}

async function dockerContainers() {
  const format = "{{.ID}}\t{{.Label \"dev.zoomgov.runtime.checkout\"}}\t{{.Label \"com.docker.compose.service\"}}\t{{.State}}";
  const result = await command("docker", ["ps", "-a", "--format", format]).catch(() => ({ stdout: "" }));
  return result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, checkout, service, state] = line.split("\t");
      return { id, checkout, service, state };
    })
    .filter((container) => container.id && container.checkout && container.service);
}

async function inspectCheckout(worktree, listeners, containers = []) {
  const checkout = worktree.path;
  let canonicalCheckout;
  try {
    canonicalCheckout = await realpath(checkout);
  } catch {
    return { ...worktree, checkout, state: "unavailable", resources: [], reason: "checkout is unavailable" };
  }
  if (canonicalCheckout !== checkout || worktree.prunable) {
    return { ...worktree, checkout, state: "unavailable", resources: [], reason: "checkout is not a canonical active directory" };
  }
  const [runtime, confirmation] = await Promise.all([readRuntime(checkout), readConfirmation(checkout)]);
  const resources = [];
  if (runtime.state === "valid") {
    for (const [surface, port] of [["app", runtime.hostPort], ["studio", runtime.studioPort]]) {
      const listener = listenerForPort(listeners, port);
      const container = containers.find((candidate) => candidate.checkout === checkout && candidate.service === (surface === "app" ? "web" : "studio"));
      resources.push({
        surface,
        port,
        listener,
        containerId: container?.id ?? null,
        containerState: container?.state ?? null,
        owner: runtime.mode === "worktree" ? "worktree runtime" : "Local runtime",
      });
    }
  }
  if (confirmation.state === "valid") {
    for (const artifact of confirmation.artifacts) {
      const listener = listenerForPort(listeners, artifact.port);
      resources.push({
        surface: artifact.surface,
        port: artifact.port,
        listener,
        owner: `confirmation:${confirmation.slug}`,
        expectedPid: artifact.pid,
      });
    }
  }
  const invalid = [runtime, confirmation].find((value) => value.state === "invalid");
  return {
    ...worktree,
    checkout,
    state: invalid ? "needs-attention" : "ready",
    reason: invalid?.reason,
    runtime,
    confirmation,
    resources,
    runningServices: containers.filter((container) => container.checkout === checkout && container.state === "running").map((container) => container.service),
  };
}

function formatResource(resource) {
  const listener = resource.listener;
  const processIdentity = listener ? `PID ${listener.pid} (${listener.command})` : "not listening";
  const containerIdentity = resource.containerId ? `; container ${resource.containerId} (${resource.containerState ?? "unknown"})` : "";
  const mismatch = resource.expectedPid && listener && resource.expectedPid !== listener.pid ? "; PID mismatch" : "";
  return `    ${resource.surface.padEnd(9)} port ${String(resource.port).padEnd(5)} ${processIdentity}${containerIdentity}; ${resource.owner}${mismatch}`;
}

function formatIndex(index, count) {
  return String(index + 1).padStart(Math.max(2, String(count).length), "0");
}

function hasRunningResource(item) {
  return item.resources.some((resource) => resource.listener || resource.containerState === "running") || (item.runningServices?.length ?? 0) > 0;
}

function hasActiveRuntime(item) {
  return item.state === "ready" && hasRunningResource(item);
}

function sortInventory(inventory) {
  return [...inventory].sort((left, right) => Number(hasRunningResource(right)) - Number(hasRunningResource(left)));
}

function portSummary(item, colored = false) {
  const ports = ["app", "studio", "prototype", "review"].flatMap((surface) =>
    item.resources.filter((resource) => resource.surface === surface)
      .map((resource) => {
        const label = `${surface}:${resource.port} (${resource.listener ? "listening" : resource.containerState === "running" ? "running, not listening" : "stopped"})`;
        const color = resource.listener ? ansi.green : resource.containerState === "running" ? ansi.yellow : ansi.gray;
        return colored ? `${color}${label}${ansi.reset}` : label;
      }),
  );
  const services = (item.runningServices ?? []).filter((service) => !["web", "studio"].includes(service));
  if (services.length) ports.push(`${services.join(",")}:running`);
  return ports.join(" ") || "no managed ports";
}

function rowSummary(item) {
  return `${item.state === "ready" ? "" : `${item.state} — `}${portSummary(item)}`;
}

function printInventory(inventory) {
  console.log("Parallel worktree runtime inventory");
  for (const [index, checkout] of inventory.entries()) {
    console.log(`[${formatIndex(index, inventory.length)}] ${checkout.checkout} (${checkout.branch}) — ${rowSummary(checkout)}`);
    if (checkout.reason) console.log(`    ${checkout.reason}`);
    for (const resource of checkout.resources) console.log(formatResource(resource));
  }
}

const ansi = {
  reset: "\u001B[0m", bold: "\u001B[1m", dim: "\u001B[2m", cyan: "\u001B[36m",
  gray: "\u001B[90m", green: "\u001B[32m", yellow: "\u001B[33m", red: "\u001B[31m", inverse: "\u001B[7m",
  clear: "\u001B[2J\u001B[H", alternateOn: "\u001B[?1049h", alternateOff: "\u001B[?1049l", hideCursor: "\u001B[?25l", showCursor: "\u001B[?25h",
};

function statusColor(item) {
  if (item.state !== "ready") return item.state === "needs-attention" ? ansi.yellow : ansi.red;
  return hasActiveRuntime(item) ? ansi.green : ansi.gray;
}

function pickerScreen(inventory, cursor, selected, message = "") {
  const rows = inventory.map((item, index) => {
    const checked = !hasActiveRuntime(item) ? "   " : selected.has(index) ? `${ansi.green}[x]${ansi.reset}` : "[ ]";
    const line = `› ${checked} ${ansi.dim}[${formatIndex(index, inventory.length)}]${ansi.reset} ${item.checkout} — ${item.state === "ready" && item.resources.length ? portSummary(item, true) : `${statusColor(item)}${rowSummary(item)}${ansi.reset}`}`;
    return index === cursor ? `${ansi.inverse}${line}${ansi.reset}` : `  ${line.slice(2)}`;
  });
  const item = inventory[cursor];
  const details = item.resources.length
    ? item.resources.map((resource) => {
      const listener = resource.listener ? `${ansi.green}PID ${resource.listener.pid}${ansi.reset}` : `${ansi.dim}not listening${ansi.reset}`;
      return `  ${resource.surface.padEnd(9)} ${ansi.cyan}:${resource.port}${ansi.reset}  ${listener}${resource.containerId ? `  ${ansi.dim}container ${resource.containerId} (${resource.containerState ?? "unknown"})${ansi.reset}` : ""}`;
    }).join("\n")
    : `  ${ansi.dim}${item.reason ?? "No managed ports recorded."}${ansi.reset}`;
  return [
    `${ansi.bold}${ansi.cyan}Worktree runtime manager${ansi.reset}`,
    `${ansi.dim}↑/↓: move  Enter/Space: select  s: continue  q: cancel${ansi.reset}`,
    message ? `${ansi.yellow}${message}${ansi.reset}` : "",
    "",
    ...rows,
    "",
    `${ansi.bold}Focused checkout${ansi.reset}`,
    details,
  ].filter(Boolean).join("\n");
}

function keyboardChoice(inventory) {
  if (typeof process.stdin.setRawMode !== "function") return Promise.resolve(null);
  return new Promise((resolve) => {
    let cursor = 0;
    const selected = new Set();
    let message = "";
    const render = () => process.stdout.write(`${ansi.clear}${pickerScreen(inventory, cursor, selected, message)}`);
    const finish = (value) => {
      process.stdin.off("data", keypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write(`${ansi.showCursor}${ansi.alternateOff}`);
      resolve(value);
    };
    const keypress = (value) => {
      if (value === "\u0003" || value === "q" || value === "\u001B") return finish(null);
      if (value === "\u001B[A") cursor = (cursor + inventory.length - 1) % inventory.length;
      else if (value === "\u001B[B") cursor = (cursor + 1) % inventory.length;
      else if (value === "\r" || value === "\n" || value === " ") {
        if (hasActiveRuntime(inventory[cursor])) {
          if (selected.has(cursor)) selected.delete(cursor); else selected.add(cursor);
        }
      } else if (value === "s") {
        if (selected.size) return finish([...selected].sort((left, right) => left - right));
        message = "Select one or more checkouts before continuing.";
      }
      render();
    };
    process.stdout.write(`${ansi.alternateOn}${ansi.hideCursor}`);
    process.stdin.setEncoding("utf8");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", keypress);
    render();
  });
}

function confirmStop(selected) {
  if (typeof process.stdin.setRawMode !== "function") return Promise.resolve(false);
  return new Promise((resolve) => {
    const render = () => process.stdout.write(`${ansi.alternateOn}${ansi.hideCursor}${ansi.clear}${ansi.bold}${ansi.red}Stop selected development runtimes?${ansi.reset}\n\n${selected.map((item) => `• ${item.checkout}`).join("\n")}\n\n${ansi.dim}Enter: stop selected runtimes  Esc/q: cancel${ansi.reset}`);
    const finish = (value) => {
      process.stdin.off("data", keypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write(`${ansi.showCursor}${ansi.alternateOff}`);
      resolve(value);
    };
    const keypress = (value) => value === "\r" || value === "\n" ? finish(true) : finish(false);
    process.stdin.setEncoding("utf8");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", keypress);
    render();
  });
}

function parseSelection(answer, size) {
  const trimmed = answer.trim().toLowerCase();
  if (trimmed === "q" || trimmed === "quit" || trimmed === "") return [];
  if (trimmed === "all") return Array.from({ length: size }, (_, index) => index);
  const indexes = new Set();
  for (const token of trimmed.split(/[\s,]+/u)) {
    if (!/^\d+$/u.test(token)) fail("Enter worktree numbers separated by spaces or commas, 'all', or 'q'.");
    const index = Number(token) - 1;
    if (index < 0 || index >= size) fail("A selected worktree number is outside the inventory.");
    indexes.add(index);
  }
  return [...indexes].sort((left, right) => left - right);
}

async function processStillExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopNativeListener(checkout, resource) {
  let listener;
  try {
    const current = await command("lsof", ["-nP", `-iTCP:${resource.port}`, "-sTCP:LISTEN", "-Fpcn"]);
    listener = listenerForPort(parseLsof(current.stdout), resource.port);
  } catch (error) {
    if (error.code === 1) return "not-listening";
    return "preserved: current listener could not be verified";
  }
  if (!listener) return "not-listening";
  if (listener.pid !== resource.listener?.pid) return "preserved: listener changed since selection";
  let cwd;
  let commandLine;
  try {
    const [cwdResult, commandResult] = await Promise.all([
      command("lsof", ["-a", "-p", String(listener.pid), "-d", "cwd", "-Fn"]),
      command("ps", ["-p", String(listener.pid), "-o", "command="]),
    ]);
    cwd = cwdResult.stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1);
    commandLine = commandResult.stdout.trim();
  } catch {
    return "preserved: native process identity could not be verified";
  }
  if (cwd !== checkout || !/(?:next(?:-server)?|next dev|npm\s+(?:run\s+)?dev)/iu.test(commandLine)) {
    return "preserved: listener is not a verified native Next.js process for this checkout";
  }
  process.kill(listener.pid, "SIGTERM");
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (!(await processStillExists(listener.pid))) return "stopped";
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return "failed: native process did not stop after SIGTERM";
}

async function composeContainerIds(checkout) {
  const { stdout } = await command("docker", ["ps", "-aq", "--filter", `label=com.docker.compose.project=${checkout.runtime.composeProject}`]);
  return stdout.trim().split("\n").filter(Boolean);
}

function stopFailure(error) {
  const diagnostic = typeof error?.stderr === "string" ? error.stderr.trim() : "";
  if (diagnostic.includes("artifact PID was reused")) {
    return "preserved: artifact PID was reused; confirmation metadata remains for inspection";
  }
  return `failed: ${diagnostic || (error instanceof Error ? error.message : String(error))}`;
}

async function stopCheckout(checkout, { inspectContainers = composeContainerIds, release = releaseWorktreeRuntime } = {}) {
  const results = [];
  if (checkout.state !== "ready") return [{ action: "preserved", detail: checkout.reason ?? "checkout state is not safe" }];
  if (checkout.confirmation?.state === "valid") {
    try {
      await command(path.join(checkout.checkout, "dev-confirmation.sh"), ["stop", checkout.confirmation.slug], { cwd: checkout.checkout });
      results.push({ action: "confirmation", detail: "stopped" });
    } catch (error) {
      results.push({ action: "confirmation", detail: stopFailure(error) });
      return results;
    }
  }
  if (checkout.runtime?.state === "valid") {
    try {
      const containers = await inspectContainers(checkout);
      if (containers.length) {
        await command(path.join(checkout.checkout, "dev-compose.sh"), ["stop", "web", "studio", "db"], { cwd: checkout.checkout });
        results.push({ action: "Compose services", detail: "stopped" });
      } else {
        results.push({ action: "Compose services", detail: "skipped: no project containers" });
      }
    } catch (error) {
      results.push({ action: "Compose services", detail: stopFailure(error) });
      return results;
    }
    if (checkout.runtime.mode === "worktree") {
      try {
        await command(path.join(checkout.checkout, "dev-compose.sh"), ["cleanup"], { cwd: checkout.checkout });
        results.push({ action: "worktree cleanup", detail: "completed" });
      } catch (error) {
        results.push({ action: "worktree cleanup", detail: stopFailure(error) });
        return results;
      }
    }
    const app = checkout.resources.find((resource) => resource.surface === "app");
    if (app) {
      const detail = await stopNativeListener(checkout.checkout, app);
      results.push({ action: "native app", detail });
      if (!["stopped", "not-listening"].includes(detail)) return results;
    }
  }
  try {
    await release(checkout.checkout);
    results.push({ action: "port allocation", detail: "released; named volumes preserved" });
  } catch (error) {
    results.push({ action: "port allocation", detail: stopFailure(error) });
  }
  return results;
}

async function inventoryFromRepository(cwd = process.cwd()) {
  const { stdout } = await command("git", ["worktree", "list", "--porcelain"], { cwd });
  const [{ stdout: lsofOutput = "" }, containers] = await Promise.all([
    command("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"]).catch(() => ({ stdout: "" })),
    dockerContainers(),
  ]);
  return sortInventory(await Promise.all(parseWorktreeList(stdout).map((worktree) => inspectCheckout(worktree, parseLsof(lsofOutput), containers))));
}

async function main() {
  if (process.argv.length !== 2) fail("Usage: ./dev-compose.sh wt");
  const inventory = await inventoryFromRepository();
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    printInventory(inventory);
    return;
  }
  const selected = await keyboardChoice(inventory);
  if (!selected) return;
  const targets = selected.map((index) => inventory[index]);
  if (!(await confirmStop(targets))) return;
  for (const target of targets) {
    console.log(`Stopping ${target.checkout}`);
    for (const result of await stopCheckout(target)) console.log(`  ${result.action}: ${result.detail}`);
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { sortInventory, hasActiveRuntime, formatIndex, portSummary, pickerScreen, printInventory, inspectCheckout, parseLsof, parseSelection, parseWorktreeList, readConfirmation, readRuntime, stopCheckout, stopNativeListener };
