// A loopback-only server for the repository-owned Browser acceptance fixture.
import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { createPortAllocator, resolvePortIdentity } from "../../../scripts/development-port-allocation.mjs";

const root = await realpath(import.meta.dirname);
const checkout = await realpath(path.resolve(root, "../../.."));
const identity = await resolvePortIdentity(checkout);
const lease = await createPortAllocator().status(identity);
if (!lease || lease.mode !== "worktree") throw new Error("An owned worktree port reservation is required");
const files = new Map([
  ["/", ["index.html", "text/html"]], ["/fixture", ["index.html", "text/html"]],
  ["/prototype.html", ["index.html", "text/html"]], ["/index.html", ["index.html", "text/html"]],
  ["/fixture.css", ["fixture.css", "text/css"]], ["/fixture.js", ["fixture.js", "text/javascript"]],
  ["/fidelity.html", ["fidelity.html", "text/html"]], ["/fidelity.js", ["fidelity.js", "text/javascript"]],
  ["/fidelity-copy.txt", ["fidelity-copy.txt", "text/plain"]],
]);
const server = createServer(async (request, response) => {
  const file = files.get(new URL(request.url, "http://fixture.invalid").pathname);
  if (!file || !["GET", "HEAD"].includes(request.method)) { response.writeHead(404).end(); return; }
  try {
    const bytes = await readFile(path.join(root, file[0]));
    response.writeHead(200, { "Content-Type": `${file[1]}; charset=utf-8`, "Cache-Control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : bytes);
  } catch { response.writeHead(500).end(); }
});
server.listen(lease.appPort, "127.0.0.1", () => console.log(JSON.stringify({
  owner: lease.owner, checkout, fixture: root, port: lease.appPort, pid: process.pid,
  url: `http://127.0.0.1:${lease.appPort}/fixture`,
})));
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
