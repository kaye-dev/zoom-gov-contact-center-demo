import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { type IncomingHttpHeaders, request } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

const sourceRoot = path.resolve(import.meta.dirname, "..");
const sourceServerScript = path.join(sourceRoot, "scripts/serve-plan-artifact.mjs");
const expectedSecurityHeaders = {
  "cache-control": "no-store",
  "content-security-policy": [
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
  ].join("; "),
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "x-robots-tag": "noindex, nofollow",
} as const;

const reviewFiles = new Map<string, { body: string; contentType: string }>([
  ["index.html", { body: "<!doctype html><title>review</title>", contentType: "text/html; charset=utf-8" }],
  ["styles.css", { body: "body { color: black; }", contentType: "text/css; charset=utf-8" }],
  ["app.js", { body: "document.title = 'review';", contentType: "text/javascript; charset=utf-8" }],
  ["review-data-schema.js", { body: "export const schema = true;", contentType: "text/javascript; charset=utf-8" }],
  ["review-data.json", { body: '{"findings":[]}', contentType: "application/json; charset=utf-8" }],
]);

type HeaderSource = Headers | IncomingHttpHeaders;
type TestRepository = { root: string; serverScript: string };

function headerValue(headers: HeaderSource, name: string): string | null {
  if (headers instanceof Headers) return headers.get(name);
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value.join(", ");
  return value ?? null;
}

function assertSecurityHeaders(headers: HeaderSource) {
  for (const [name, expected] of Object.entries(expectedSecurityHeaders)) {
    assert.equal(headerValue(headers, name), expected, `${name} header`);
  }
}

function uniqueSlug(label: string) {
  return `${label}-${randomUUID()}`;
}

async function createTestRepository(context: TestContext): Promise<TestRepository> {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "serve-plan-artifact-test-"));
  const scripts = path.join(repositoryRoot, "scripts");
  const serverScript = path.join(scripts, "serve-plan-artifact.mjs");
  await mkdir(scripts);
  await copyFile(sourceServerScript, serverScript);
  context.after(async () => rm(repositoryRoot, { recursive: true, force: true }));
  return { root: repositoryRoot, serverScript };
}

async function createArtifactDirectory(repository: TestRepository, relativeArtifact: string) {
  const artifact = path.join(repository.root, ...relativeArtifact.split("/"));
  await mkdir(artifact, { recursive: true });
  return artifact;
}

async function createPrototypeFixture(repository: TestRepository, relativeArtifact: string) {
  const artifact = await createArtifactDirectory(repository, relativeArtifact);
  const nested = path.join(artifact, "assets", "nested");
  await mkdir(nested, { recursive: true });

  const files = new Map<string, Buffer | string>([
    ["index.html", "<!doctype html><title>prototype root</title>"],
    ["states.html", "<!doctype html><title>prototype states</title>"],
    ["assets/nested/app.js", "document.title = 'prototype';"],
    ["assets/nested/styles.css", "body { color: rebeccapurple; }"],
    ["assets/nested/data.json", '{"state":"ready"}'],
    ["assets/nested/icon.svg", '<svg xmlns="http://www.w3.org/2000/svg"/>'],
    ["assets/nested/pixel.png", Buffer.from([0x89, 0x50, 0x4e, 0x47])],
    ["assets/nested/photo.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xd9])],
    ["assets/nested/photo.jpeg", Buffer.from([0xff, 0xd8, 0x01, 0xd9])],
    ["assets/nested/pixel.webp", Buffer.from("RIFFfixtureWEBP")],
    ["unsupported.txt", "not served"],
  ]);

  await Promise.all([...files].map(([relative, body]) => writeFile(path.join(artifact, ...relative.split("/")), body)));
  return { artifact, files };
}

async function createReviewFixture(repository: TestRepository, relativeArtifact: string) {
  const artifact = await createArtifactDirectory(repository, relativeArtifact);
  await Promise.all([...reviewFiles].map(([relative, file]) => writeFile(path.join(artifact, relative), file.body)));
  await writeFile(path.join(artifact, "extra.json"), "{}");
  return artifact;
}

async function stopServer(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await exited;
}

async function startServer(context: TestContext, repository: TestRepository, relativeArtifact: string) {
  const child = spawn(process.execPath, [repository.serverScript, relativeArtifact], {
    cwd: repository.root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  context.after(async () => stopServer(child));

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  return new Promise<{ child: ReturnType<typeof spawn>; url: string }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server start timeout\nstdout: ${stdout}\nstderr: ${stderr}`)), 5_000);
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      const match = stdout.match(/URL=(http:\/\/127\.0\.0\.1:\d+\/)/);
      if (match) {
        clearTimeout(timer);
        resolve({ child, url: match[1] });
      }
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`server exited before startup: code=${code} signal=${signal}\nstderr: ${stderr}`));
    });
  });
}

async function fetchArtifact(url: string, pathname: string, init?: RequestInit) {
  const response = await fetch(new URL(pathname, url), init);
  assertSecurityHeaders(response.headers);
  return response;
}

async function rawRequest(
  url: string,
  options: {
    path: string;
    method?: string;
    headers?: Record<string, string>;
    setHost?: boolean;
  },
) {
  const target = new URL(url);
  return new Promise<{ body: string; headers: IncomingHttpHeaders; status: number }>((resolve, reject) => {
    const req = request(
      {
        hostname: target.hostname,
        port: target.port,
        path: options.path,
        method: options.method ?? "GET",
        headers: options.headers,
        setHost: options.setHost,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.once("end", () => {
          assertSecurityHeaders(response.headers);
          resolve({
            body: Buffer.concat(chunks).toString("utf8"),
            headers: response.headers,
            status: response.statusCode ?? 0,
          });
        });
      },
    );
    req.once("error", reject);
    req.end();
  });
}

async function runCli(repository: TestRepository, args: string[]) {
  const child = spawn(process.execPath, [repository.serverScript, ...args], {
    cwd: repository.root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  return new Promise<{ code: number | null; stderr: string; stdout: string }>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`CLI did not exit\nstdout: ${stdout}\nstderr: ${stderr}`));
    }, 5_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr, stdout });
    });
  });
}

async function assertPrototypeSurface(url: string, files: Map<string, Buffer | string>) {
  const expectedAssets = new Map<string, string>([
    ["assets/nested/app.js", "text/javascript; charset=utf-8"],
    ["assets/nested/styles.css", "text/css; charset=utf-8"],
    ["assets/nested/data.json", "application/json; charset=utf-8"],
    ["assets/nested/icon.svg", "image/svg+xml"],
    ["assets/nested/pixel.png", "image/png"],
    ["assets/nested/photo.jpg", "image/jpeg"],
    ["assets/nested/photo.jpeg", "image/jpeg"],
    ["assets/nested/pixel.webp", "image/webp"],
  ]);

  const rootResponse = await fetchArtifact(url, "/");
  assert.equal(rootResponse.status, 200);
  assert.equal(rootResponse.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(await rootResponse.text(), files.get("index.html"));

  const secondHtml = await fetchArtifact(url, "/states.html?theme=dark&viewport=mobile");
  assert.equal(secondHtml.status, 200);
  assert.equal(secondHtml.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(await secondHtml.text(), files.get("states.html"));

  for (const [relative, contentType] of expectedAssets) {
    const response = await fetchArtifact(url, `/${relative}`);
    assert.equal(response.status, 200, relative);
    assert.equal(response.headers.get("content-type"), contentType, relative);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(files.get(relative)!), relative);
  }

  const head = await fetchArtifact(url, "/assets/nested/app.js?request=head", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.equal(await head.text(), "");
}

test("canonicalとlegacy prototypeは複数HTML・nested asset・query・HEADを配信する", async (context) => {
  const repository = await createTestRepository(context);
  const slug = uniqueSlug("prototype-server-test");
  const surfaces = [`plans/${slug}/prototype`, `plans/tmp/${slug}/prototype`];

  for (const relativeArtifact of surfaces) {
    await context.test(relativeArtifact, async (surfaceContext) => {
      const { files } = await createPrototypeFixture(repository, relativeArtifact);
      const { url } = await startServer(surfaceContext, repository, relativeArtifact);
      await assertPrototypeSurface(url, files);
    });
  }
});

test("canonicalと2種類のlegacy reviewは固定5ファイルだけを配信する", async (context) => {
  const repository = await createTestRepository(context);
  const slug = uniqueSlug("review-server-test");
  const surfaces = [
    `plans/${slug}/review`,
    `plans/reviews/${slug}`,
    `plans/tmp/${slug}/implementation-review`,
  ];

  for (const relativeArtifact of surfaces) {
    await context.test(relativeArtifact, async (surfaceContext) => {
      await createReviewFixture(repository, relativeArtifact);
      const { url } = await startServer(surfaceContext, repository, relativeArtifact);

      const rootResponse = await fetchArtifact(url, "/");
      assert.equal(rootResponse.status, 200);
      assert.equal(await rootResponse.text(), reviewFiles.get("index.html")!.body);

      for (const [relative, file] of reviewFiles) {
        const response = await fetchArtifact(url, `/${relative}`);
        assert.equal(response.status, 200, relative);
        assert.equal(response.headers.get("content-type"), file.contentType, relative);
        assert.equal(await response.text(), file.body, relative);
      }

      const extra = await fetchArtifact(url, "/extra.json");
      assert.equal(extra.status, 404);
      assert.equal(await extra.text(), "Not Found");
    });
  }
});

test("HTTP境界はHost・method・encoded path・symlink・未対応対象を拒否する", async (context) => {
  const repository = await createTestRepository(context);
  const slug = uniqueSlug("security-server-test");
  const relativeArtifact = `plans/${slug}/prototype`;
  const { artifact } = await createPrototypeFixture(repository, relativeArtifact);
  await writeFile(path.join(path.dirname(artifact), "outside.json"), '{"secret":true}');
  await symlink(path.join(path.dirname(artifact), "outside.json"), path.join(artifact, "external-link.json"));
  await symlink("assets/nested/data.json", path.join(artifact, "internal-link.json"));
  await symlink(path.join(artifact, "assets", "nested"), path.join(artifact, "linked-assets"), "dir");

  const { url } = await startServer(context, repository, relativeArtifact);
  const target = new URL(url);

  const wrongHost = await rawRequest(url, { path: "/", headers: { Host: "attacker.example" } });
  assert.equal(wrongHost.status, 404);
  assert.equal(wrongHost.body, "Not Found");

  const missingHost = await rawRequest(url, { path: "/", setHost: false });
  assert.equal(missingHost.status, 404);
  assert.equal(missingHost.body, "Not Found");

  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const response = await rawRequest(url, {
      path: "/",
      method,
      headers: { Host: `127.0.0.1:${target.port}` },
    });
    assert.equal(response.status, 405, method);
    assert.equal(response.body, "Method Not Allowed", method);
    assert.equal(headerValue(response.headers, "allow"), "GET, HEAD", method);
  }

  const rejectedPaths = [
    "/%2e%2e%2foutside.json",
    "/assets%2Fnested%2Fapp.js",
    "/assets%5Cnested%5Capp.js",
    "/%00index.html",
    "/%E0%A4%A",
    "/external-link.json",
    "/internal-link.json",
    "/linked-assets/app.js",
    "/unsupported.txt",
    "/assets/nested/",
    "/missing.json",
  ];
  for (const rejectedPath of rejectedPaths) {
    const response = await rawRequest(url, { path: rejectedPath });
    assert.equal(response.status, 404, rejectedPath);
    assert.equal(response.body, "Not Found", rejectedPath);
  }
});

test("SIGINTは処理中のHTTP接続が残っていてもserverを終了する", async (context) => {
  const repository = await createTestRepository(context);
  const slug = uniqueSlug("shutdown-server-test");
  const relativeArtifact = `plans/${slug}/prototype`;
  await createPrototypeFixture(repository, relativeArtifact);

  const { child, url } = await startServer(context, repository, relativeArtifact);
  const target = new URL(url);
  const socket = connect(Number(target.port), target.hostname);
  socket.on("error", () => {});
  context.after(() => socket.destroy());
  await once(socket, "connect");
  await new Promise<void>((resolve, reject) => {
    socket.write(`GET / HTTP/1.1\r\nHost: ${target.host}\r\n`, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const exitResult = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not exit after SIGINT")), 2_000);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
  child.kill("SIGINT");

  assert.deepEqual(await exitResult, { code: 0, signal: null });
});

test("artifact root/index symlinkと不正なCLI引数を起動前に拒否する", async (context) => {
  const repository = await createTestRepository(context);
  const slug = uniqueSlug("cli-server-test");
  const validArtifact = `plans/${slug}/prototype`;
  await createPrototypeFixture(repository, validArtifact);

  const symlinkSlug = uniqueSlug("root-symlink-server-test");
  const symlinkPlanRoot = path.join(repository.root, "plans", symlinkSlug);
  const realPrototype = path.join(symlinkPlanRoot, "real-prototype");
  const linkedPrototype = path.join(symlinkPlanRoot, "prototype");
  await mkdir(realPrototype, { recursive: true });
  await writeFile(path.join(realPrototype, "index.html"), "<!doctype html><title>linked root</title>");
  await symlink(realPrototype, linkedPrototype, "dir");

  const internalIndexSlug = uniqueSlug("internal-index-symlink-server-test");
  const internalIndexArtifact = path.join(repository.root, "plans", internalIndexSlug, "prototype");
  await mkdir(internalIndexArtifact, { recursive: true });
  await writeFile(path.join(internalIndexArtifact, "real-index.html"), "<!doctype html><title>internal index</title>");
  await symlink("real-index.html", path.join(internalIndexArtifact, "index.html"));

  const externalIndexSlug = uniqueSlug("external-index-symlink-server-test");
  const externalIndexArtifact = path.join(repository.root, "plans", externalIndexSlug, "prototype");
  const externalIndexTarget = path.join(repository.root, "outside-index.html");
  await mkdir(externalIndexArtifact, { recursive: true });
  await writeFile(externalIndexTarget, "<!doctype html><title>external index</title>");
  await symlink(externalIndexTarget, path.join(externalIndexArtifact, "index.html"));

  const cases = [
    { args: [], label: "missing argument" },
    { args: [validArtifact, "unexpected"], label: "extra argument" },
    { args: [`plans/${slug}/../${slug}/prototype`], label: "ambiguous dot segment" },
    { args: [`plans/${symlinkSlug}/prototype`], label: "root symlink" },
    { args: [`plans/${internalIndexSlug}/prototype`], label: "internal index symlink" },
    { args: [`plans/${externalIndexSlug}/prototype`], label: "external index symlink" },
    { args: ["plans/tmp/prototype"], label: "reserved tmp prototype collision" },
    { args: ["plans/tmp/review"], label: "reserved tmp review collision" },
    { args: ["plans/reviews"], label: "incomplete reviews legacy path" },
  ];

  for (const cliCase of cases) {
    const result = await runCli(repository, cliCase.args);
    assert.equal(result.code, 1, `${cliCase.label}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    assert.equal(result.stdout, "", cliCase.label);
    assert.notEqual(result.stderr, "", cliCase.label);
  }
});
