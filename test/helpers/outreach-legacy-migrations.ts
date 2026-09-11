import { readFile, readdir } from "node:fs/promises";
import type { Client } from "pg";
export async function replayLegacy(client: Client) {
  for (const name of (await readdir("prisma/migrations")).sort()) {
    if (name > "20260911010000_outreach_imported_audio_messages") break;
    if (/^\d/.test(name)) await client.query(await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"));
  }
}
export async function applyMigration(client: Client, name: string) {
  await client.query(await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"));
}
