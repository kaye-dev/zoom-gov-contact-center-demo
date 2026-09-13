import { createHash } from "node:crypto";
import { Client } from "pg";

type TableSnapshot = { table: string; columns: string[]; tenantScoped: boolean; digest: string };
export type TenantDataSnapshot = TableSnapshot[];
const SINGLETONS = new Set(["reservation_api_usage_settings", "site_chat_settings", "site_developer_api_settings", "site_phone_settings", "zaad_registration_settings"]);

/** Hash only retained legacy columns; no customer data leaves the process. */
export async function captureTenantData(directUrl: string, baseline?: TenantDataSnapshot): Promise<TenantDataSnapshot> {
  const client = new Client({ connectionString: directUrl, connectionTimeoutMillis: 45000 });
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const inventory = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
       ORDER BY table_name, ordinal_position`,
    );
    const columns = new Map<string, string[]>();
    for (const row of inventory.rows) {
      const list = columns.get(row.table_name) ?? [];
      list.push(row.column_name);
      columns.set(row.table_name, list);
    }
    const specs = baseline ?? [...columns].map(([table, names]) => ({
      table,
      columns: names.filter((name) => !(name === "id" && SINGLETONS.has(table)) && !(name === "revision" && table === "zaad_outbound_messages")),
      tenantScoped: !names.includes("siteKey"),
      digest: "",
    }));
    const snapshots: TenantDataSnapshot = [];
    for (const spec of specs) {
      const current = columns.get(spec.table);
      if (!current || spec.columns.some((name) => !current.includes(name))) throw new Error("Legacy migration data columns are missing.");
      const fields = spec.columns.map((name) => `t.${quote(name)}`).join(", ");
      const filter = baseline && spec.tenantScoped && current.includes("siteKey") ? ` WHERE t."siteKey" = 'lg'` : "";
      const rows = await client.query<{ value: string }>(
        `SELECT row_to_json(projected)::text AS value FROM (SELECT ${fields} FROM public.${quote(spec.table)} t${filter}) projected ORDER BY row_to_json(projected)::text COLLATE "C"`,
      );
      const digest = createHash("sha256").update(JSON.stringify(rows.rows.map((row) => row.value))).digest("hex");
      snapshots.push({ ...spec, digest });
    }
    await client.query("ROLLBACK");
    return snapshots;
  } catch {
    throw new Error("Tenant migration data verification failed; database details were suppressed.");
  } finally {
    await client.end().catch(() => undefined);
  }
}

export function assertTenantDataPreserved(expected: TenantDataSnapshot, actual: TenantDataSnapshot): void {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error("Legacy data changed during tenant migration verification.");
}

function quote(value: string): string { return '"' + value.replaceAll('"', '""') + '"'; }
