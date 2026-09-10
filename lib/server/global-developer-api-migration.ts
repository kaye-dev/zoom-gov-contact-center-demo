import type { PrismaClient } from "@/lib/generated/prisma/client";
import { decryptDeveloperApiSecret } from "./developer-api-crypto";

type LegacySettings = { siteKey: string; accountId: string; clientId: string; clientSecretEncrypted: string | null; secretTokenEncrypted: string | null };
export function selectGlobalDeveloperApiSettings(rows: LegacySettings[], sourceSite?: string) {
  if (sourceSite && !["lg", "univ"].includes(sourceSite)) throw new Error("INVALID_SOURCE_SITE");
  if (sourceSite) {
    const selected = rows.find(row => row.siteKey === sourceSite);
    if (!selected) throw new Error("SOURCE_SITE_NOT_FOUND");
    return { row: selected, conflicts: [] as string[] };
  }
  if (!rows.length) return { row: null, conflicts: [] as string[] };
  const plain = rows.map(row => ({ accountId: row.accountId, clientId: row.clientId, clientSecret: row.clientSecretEncrypted === null ? null : decryptDeveloperApiSecret(row.clientSecretEncrypted, "clientSecret"), secretToken: row.secretTokenEncrypted === null ? null : decryptDeveloperApiSecret(row.secretTokenEncrypted, "secretToken") }));
  const conflicts = (Object.keys(plain[0]) as Array<keyof typeof plain[number]>).filter(key => plain.some(row => row[key] !== plain[0][key]));
  return { row: conflicts.length ? null : rows[0], conflicts };
}
export async function migrateGlobalDeveloperApiSettings(db: PrismaClient, options: { apply?: boolean; sourceSite?: string } = {}) {
  return db.$transaction(async tx => {
    if (await tx.globalDeveloperApiSetting.findUnique({ where: { id: "global" } })) return { status: "ALREADY_CONFIGURED" };
    const rows = await tx.siteDeveloperApiSetting.findMany({ orderBy: { siteKey: "asc" } });
    const selected = selectGlobalDeveloperApiSettings(rows, options.sourceSite);
    if (selected.conflicts.length) return { status: "CONFLICT", fields: selected.conflicts };
    if (!selected.row) return { status: "UNCONFIGURED" };
    if (!options.apply) return { status: "READY", sourceSite: selected.row.siteKey };
    const { siteKey, ...settings } = selected.row;
    await tx.globalDeveloperApiSetting.create({ data: { id: "global", ...settings } });
    return { status: "MIGRATED", sourceSite: siteKey };
  }, { isolationLevel: "Serializable" });
}
