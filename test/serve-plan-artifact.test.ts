import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { request } from "node:http";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("loopback serverは指定review directoryのallowlistだけをCSP/no-store付きで配信する", async (context) => {
  const slug = `server-test-${randomUUID()}`;
  const artifact = path.join(root, "plans/reviews", slug);
  await mkdir(artifact, { recursive: true });
  context.after(async () => rm(artifact, { recursive: true, force: true }));
  await writeFile(path.join(artifact, "index.html"), '<!doctype html><link rel="stylesheet" href="styles.css"><title>review</title><script src="app.js" defer></script>');
  await writeFile(path.join(artifact, "styles.css"), "body { color: black; }");
  await writeFile(path.join(artifact, "app.js"), "document.title = 'review';");
  await writeFile(path.join(artifact, "review-data-schema.js"), "export const schema = true;");
  await writeFile(path.join(artifact, "review-data.json"), "{}");
  await writeFile(path.join(artifact, "extra.json"), "{}");
  await rm(path.join(artifact, "leak.json"), { force: true });
  await symlink(path.join(root, "package.json"), path.join(artifact, "leak.json"));
  const child = spawn(process.execPath, ["scripts/serve-plan-artifact.mjs", `plans/reviews/${slug}`], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  context.after(() => child.kill("SIGTERM"));

  const url = await new Promise<string>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("server start timeout")), 5_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
      const match = output.match(/URL=(http:\/\/127\.0\.0\.1:\d+\/)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 || reject(new Error(`server exited ${code}`)));
  });

  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<title>review<\/title>/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'self'/);
  assert.equal((await fetch(new URL("styles.css", url))).status, 200);
  assert.equal((await fetch(new URL("app.js", url))).status, 200);
  assert.equal((await fetch(new URL("review-data-schema.js", url))).status, 200);
  assert.equal((await fetch(new URL("review-data.json", url))).status, 200);
  assert.equal((await fetch(new URL("extra.json", url))).status, 404);
  assert.equal((await fetch(new URL("leak.json", url))).status, 404);

  const wrongHostStatus = await new Promise<number>((resolve, reject) => {
    const target = new URL(url);
    const req = request({ hostname: target.hostname, port: target.port, path: "/", headers: { Host: "attacker.example" } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.once("error", reject);
    req.end();
  });
  assert.equal(wrongHostStatus, 404);

  const encodedTraversalStatus = await new Promise<number>((resolve, reject) => {
    const target = new URL(url);
    const req = request({ hostname: target.hostname, port: target.port, path: "/%2e%2e%2f%2e%2e%2fpackage.json", method: "GET" }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.once("error", reject);
    req.end();
  });
  assert.equal(encodedTraversalStatus, 404);
});
