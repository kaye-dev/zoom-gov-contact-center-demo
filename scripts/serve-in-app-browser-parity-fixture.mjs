#!/usr/bin/env node

import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../test/fixtures/in-app-browser-parity",
);
const checkout = await realpath(path.resolve(root, "../../.."));

function parsePort(value, label) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`${label} must be an integer port from 1024 to 65535`);
  }
  return port;
}

function parseArguments(argv) {
  const options = { productionPort: undefined, prototypePort: undefined };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`${key} requires a value`);
    if (key === "--production-port") options.productionPort = parsePort(value, key);
    else if (key === "--prototype-port") options.prototypePort = parsePort(value, key);
    else throw new Error(`unknown option: ${key}`);
  }
  if (!(options.productionPort >= 3100 && options.productionPort <= 3899)) {
    throw new Error("--production-port must use the worktree allocator range 3100-3899");
  }
  if (!options.prototypePort || options.productionPort === options.prototypePort) {
    throw new Error("--prototype-port must be a distinct explicit port");
  }
  return options;
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function responseFor(pathname) {
  if (pathname === "/__owner") {
    return {
      status: 200,
      type: mimeTypes[".json"],
      body: Buffer.from(JSON.stringify({
        owner: "in-app-browser-parity-fixture",
        pid: process.pid,
        cwd: await realpath(process.cwd()),
        checkout,
      })),
    };
  }
  const fileName = pathname === "/fixture" || pathname === "/prototype.html" || pathname === "/"
    ? "index.html"
    : pathname.slice(1);
  if (!["index.html", "fixture.css", "fixture.js", "manifest.json"].includes(fileName)) {
    return { status: 404, type: "text/plain; charset=utf-8", body: Buffer.from("Not found") };
  }
  const target = path.join(root, fileName);
  return {
    status: 200,
    type: mimeTypes[path.extname(target)] ?? "application/octet-stream",
    body: await readFile(target),
  };
}

function fixtureServer() {
  return createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://fixture.invalid").pathname;
      const result = await responseFor(pathname);
      response.writeHead(result.status, {
        "Content-Type": result.type,
        "Cache-Control": "no-store",
        "Content-Length": result.body.byteLength,
      });
      response.end(result.body);
    } catch {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Fixture error");
    }
  });
}

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

const options = parseArguments(process.argv.slice(2));
const production = fixtureServer();
const prototype = fixtureServer();
await listen(production, options.productionPort);
try {
  await listen(prototype, options.prototypePort);
} catch (error) {
  await new Promise((resolve) => production.close(resolve));
  throw error;
}

const metadata = {
  owner: "in-app-browser-parity-fixture",
  pid: process.pid,
  cwd: await realpath(process.cwd()),
  checkout,
  productionUrl: `http://localhost:${options.productionPort}/`,
  prototypeUrl: `http://127.0.0.1:${options.prototypePort}/`,
};
process.stdout.write(`${JSON.stringify(metadata)}\n`);

async function shutdown() {
  await Promise.all([
    new Promise((resolve) => production.close(resolve)),
    new Promise((resolve) => prototype.close(resolve)),
  ]);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    shutdown()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
}
