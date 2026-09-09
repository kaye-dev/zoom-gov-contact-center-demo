/** Loopback-only transport for the isolated outreach test provider. */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, renameSync, realpathSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { ZoomOutreachProvider, type ZoomOutreachSnapshot } from "../test/helpers/zoom-outreach-provider";

const rawPort = process.argv[2];
if (!rawPort || !/^\d+$/.test(rawPort) || Number(rawPort) < 1024 || Number(rawPort) > 65535)
  throw new Error("Usage: node --import tsx scripts/serve-outreach-test-provider.ts <port>");
if (process.env.NODE_ENV === "production") throw new Error("Test provider is unavailable in production");
const statePath = process.argv[3] ? realpathSync(resolve(process.argv[3])) : null;
if (statePath && dirname(statePath) !== realpathSync(resolve(".codex"))) throw new Error("Fixture state must be an existing file in this checkout's .codex directory");
const state = statePath ? JSON.parse(readFileSync(statePath, "utf8")) as { version: number; accounts: ZoomOutreachSnapshot[] } : null;
if (state && (state.version !== 1 || state.accounts.length !== 2 || new Set(state.accounts.map(row => row.accountId)).size !== 2 || state.accounts.some(row => !["fixture-lg", "fixture-univ"].includes(row.accountId)))) throw new Error("Invalid fixture accounts");
const providers = ["lg", "univ"].map(tenant => new ZoomOutreachProvider(`fixture-${tenant}`, state?.accounts.find(row => row.accountId === `fixture-${tenant}`)));
function persist() {
  if (!statePath) return;
  const temporary = `${statePath}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify({ version: 1, accounts: providers.map(provider => provider.snapshot()) }, null, 2) + "\n", { mode: 0o600 });
  renameSync(temporary, statePath);
}
const server = createServer(async (incoming, outgoing) => {
  try {
    const local = new URL(incoming.url ?? "/", "http://127.0.0.1");
    if (incoming.method === "GET" && local.pathname === "/__owner") {
      outgoing.setHeader("content-type", "application/json");
      outgoing.end(JSON.stringify({ owner: "outreach-test-provider", pid: process.pid, cwd: process.cwd(), accounts: providers.map(p => p.accountId) }));
      return;
    }
    const authorization = incoming.headers.authorization;
    const provider = providers.find(p => local.pathname === "/oauth/token"
      ? local.searchParams.get("account_id") === p.accountId
      : authorization === `Bearer fixture-${p.accountId}`);
    if (!provider) { outgoing.writeHead(401); outgoing.end(); return; }
    const chunks: Buffer[] = []; let length = 0;
    for await (const value of incoming) {
      const chunk = Buffer.from(value); length += chunk.byteLength;
      if (length > 1024 * 1024) { outgoing.writeHead(413); outgoing.end(); return; }
      chunks.push(chunk);
    }
    const response = await provider.fetch(`${provider.origin}${local.pathname}${local.search}`, {
      method: incoming.method,
      headers: { ...(authorization ? { authorization } : {}), "content-type": incoming.headers["content-type"] ?? "application/json" },
      ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
    });
    persist();
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    // Unsupported requests fail closed and stay visible in the owned runtime log.
    console.error(error instanceof Error ? error.message : "Provider fixture failed");
    outgoing.writeHead(501); outgoing.end(JSON.stringify({ code: "UNSUPPORTED_TEST_PROVIDER_REQUEST" }));
  }
});
server.listen(Number(rawPort), "127.0.0.1", () => {
  console.log(JSON.stringify({ owner: "outreach-test-provider", pid: process.pid, cwd: process.cwd(), port: Number(rawPort) }));
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => server.close());
