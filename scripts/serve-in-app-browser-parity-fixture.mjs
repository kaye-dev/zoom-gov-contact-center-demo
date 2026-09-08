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
  if (!(options.productionPort >= 3001 && options.productionPort <= 3010)) {
    throw new Error("--production-port must use the worktree allocator range 3001-3010");
  }
  if (!(options.prototypePort >= 4001 && options.prototypePort <= 4010) || options.prototypePort !== options.productionPort + 1000) {
    throw new Error("--prototype-port must use the paired artifact port (production + 1000)");
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
  if (!["index.html", "fixture.css", "fixture.js", "manifest.json", "fidelity.html", "fidelity.js", "fidelity-copy.txt"].includes(fileName)) {
    return { status: 404, type: "text/plain; charset=utf-8", body: Buffer.from("Not found") };
  }
  const target = path.join(root, fileName);
  return {
    status: 200,
    type: mimeTypes[path.extname(target)] ?? "application/octet-stream",
    body: await readFile(target),
  };
}

function fixtureServer(referenceCopy) {
  // Managed test data is isolated per surface and disappears when this process stops.
  const settings = new Map([["lg", "initial-lg"], ["univ", "initial-univ"]]);
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://fixture.invalid");
      const pathname = url.pathname;
      let result;
      if (pathname === "/api/fidelity-settings") {
        const site = url.searchParams.get("site");
        if (!settings.has(site)) throw new Error("invalid fixture site");
        if (request.method === "POST") {
          if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) throw new Error("cross-origin fixture write");
          let body = "";
          for await (const chunk of request) {
            body += chunk;
            if (Buffer.byteLength(body) > 1024) throw new Error("fixture request too large");
          }
          const value = JSON.parse(body).value;
          if (typeof value !== "string" || value.length > 64) throw new Error("invalid fixture value");
          settings.set(site, value);
        } else if (request.method !== "GET") throw new Error("invalid fixture method");
        result = { status: 200, type: mimeTypes[".json"], body: Buffer.from(JSON.stringify({ site, value: settings.get(site) })) };
      } else if (pathname === "/fidelity-copy.txt" && referenceCopy !== undefined) {
        result = { status: 200, type: "text/plain; charset=utf-8", body: referenceCopy };
      } else result = await responseFor(pathname);
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
// Freeze the approved reference before testing a production-only copy change.
const prototype = fixtureServer(await readFile(path.join(root, "fidelity-copy.txt")));
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
