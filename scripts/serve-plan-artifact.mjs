#!/usr/bin/env node

import { createServer } from "node:http";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
]);

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join("; ");

function fail(message) {
  console.error(message);
  process.exit(1);
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requested = process.argv[2];
if (!requested || process.argv.length !== 3) {
  fail("usage: node scripts/serve-plan-artifact.mjs plans/<slug>/<prototype|review>");
}
if (
  requested.includes("\\")
  || requested.split(/[\\/]/u).some((segment) => segment === "." || segment === "..")
) {
  fail("artifact path must not contain dot segments or backslashes");
}

const sourceRoot = path.resolve(repositoryRoot, requested);
const relativeRoot = path.relative(repositoryRoot, sourceRoot).split(path.sep).join("/");
const slugPattern = /^[a-z0-9][a-z0-9-]*$/;
const segments = relativeRoot.split("/");
let artifactType;

if (
  segments.length === 3
  && segments[0] === "plans"
  && slugPattern.test(segments[1])
  && segments[1] !== "tmp"
  && segments[1] !== "reviews"
  && (segments[2] === "prototype" || segments[2] === "review")
 ) {
  artifactType = segments[2];
} else {
  fail("artifact path must be plans/<slug>/<prototype|review>");
}
const reviewAllowlist = new Set(["index.html", "styles.css", "app.js", "review-data-schema.js", "review-data.json"]);

let canonicalRoot;
try {
  canonicalRoot = await realpath(sourceRoot);
  if (canonicalRoot !== sourceRoot || !(await stat(canonicalRoot)).isDirectory()) fail("artifact directory must be a real directory, not a symlink");
  const indexPath = path.join(canonicalRoot, "index.html");
  const indexMetadata = await lstat(indexPath);
  if (indexMetadata.isSymbolicLink() || !indexMetadata.isFile() || (await realpath(indexPath)) !== indexPath) {
    fail("artifact index.html must be a regular file, not a symlink");
  }
} catch (error) {
  fail(`artifact directory is unavailable: ${error instanceof Error ? error.message : String(error)}`);
}

function headers(contentType) {
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy": CSP,
    "Content-Type": contentType,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

const server = createServer({ requireHostHeader: false }, async (request, response) => {
  try {
    const address = server.address();
    if (!address || typeof address === "string" || request.headers.host !== `127.0.0.1:${address.port}`) throw new Error("invalid host");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { ...headers("text/plain; charset=utf-8"), Allow: "GET, HEAD" });
      response.end("Method Not Allowed");
      return;
    }

    const requestTarget = request.url ?? "/";
    const rawPathname = requestTarget.split("?", 1)[0];
    if (/%(?:00|2e|2f|5c)/iu.test(rawPathname)) throw new Error("encoded path separators and traversal are unavailable");
    const decodedRawPathname = decodeURIComponent(rawPathname);
    if (decodedRawPathname.includes("\\") || decodedRawPathname.split("/").some((segment) => segment === "..")) {
      throw new Error("invalid path");
    }

    const url = new URL(requestTarget, "http://127.0.0.1");
    const decoded = decodeURIComponent(url.pathname);
    if (decoded.includes("\0")) throw new Error("invalid path");
    const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
    if (artifactType === "review" && !reviewAllowlist.has(relative)) throw new Error("file is not part of the review surface");
    const candidate = path.resolve(canonicalRoot, relative);
    const lexicalInside = path.relative(canonicalRoot, candidate);
    if (!lexicalInside || lexicalInside.startsWith("..") || path.isAbsolute(lexicalInside)) {
      throw new Error("path escapes artifact root");
    }
    const candidateMetadata = await lstat(candidate);
    if (candidateMetadata.isSymbolicLink()) throw new Error("symbolic links are unavailable");
    const canonicalFile = await realpath(candidate);
    if (canonicalFile !== candidate) throw new Error("symbolic links are unavailable");
    const inside = path.relative(canonicalRoot, canonicalFile);
    if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) throw new Error("path escapes artifact root");

    const extension = path.extname(canonicalFile).toLowerCase();
    const contentType = MIME.get(extension);
    if (!contentType || !(await stat(canonicalFile)).isFile()) throw new Error("unsupported file");

    const body = request.method === "HEAD" ? undefined : await readFile(canonicalFile);
    response.writeHead(200, headers(contentType));
    response.end(body);
  } catch {
    response.writeHead(404, headers("text/plain; charset=utf-8"));
    response.end("Not Found");
  }
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") fail("failed to resolve loopback port");
  console.log(`URL=http://127.0.0.1:${address.port}/`);
  console.log(`PID=${process.pid}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (signal === "SIGINT" && process.stdout.isTTY) process.stdout.write("\n");
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
