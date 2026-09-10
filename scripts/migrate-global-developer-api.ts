import "dotenv/config";
import { createDatabaseContext } from "../lib/server/prisma";
import { migrateGlobalDeveloperApiSettings } from "../lib/server/global-developer-api-migration";

const args = process.argv.slice(2);
const options: { apply?: boolean; sourceSite?: string } = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--apply") options.apply = true;
  else if (args[i] === "--source-site" && ["lg", "univ"].includes(args[i + 1])) options.sourceSite = args[++i];
  else throw new Error("Usage: tsx scripts/migrate-global-developer-api.ts [--apply] [--source-site lg|univ]");
}
async function main() {
const context = createDatabaseContext(process.env);
try {
  const result = await migrateGlobalDeveloperApiSettings(context.prisma, options);
  console.log(JSON.stringify(result));
  if (result.status === "CONFLICT") process.exitCode = 1;
} catch {
  console.error("Global Developer API migration failed; no credentials were printed.");
  process.exitCode = 1;
} finally { await context.close(); }

}
void main();
