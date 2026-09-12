import type { SiteAccessStore } from "../../lib/server/site-access-store";
import { SITE_ACCESS_SCOPES } from "../../lib/site-access";
import { hashAccessCode } from "../../lib/server/site-access-crypto";

export async function accessFixture(enabled: readonly string[] = ["global"]) {
  const hash = await hashAccessCode("Example2026");
  const rows = SITE_ACCESS_SCOPES.map(scope => ({scope, environment:"DEVELOPMENT", enabled:enabled.includes(scope), codeHash:hash, sessionDays:1, revision:1, updatedAt:new Date("2026-09-12T00:00:00Z")}));
  const sessions: Record<string, unknown>[] = [];
  let attempts = 0;
  const store: SiteAccessStore = { async query(sql, values = []) {
    let result: Record<string, unknown>[] = [];
    if (sql.startsWith('SELECT * FROM site_access_settings')) result = rows.filter(row => row.environment === values[0]);
    else if (sql.startsWith('INSERT INTO site_access_sessions')) sessions.push(Object.fromEntries(["tokenHash","scope","environment","hostname","revision","issuedAt","expiresAt"].map((key,index) => [key,values[index]])));
    else if (sql.startsWith('SELECT scope, revision')) result = sessions.filter(row => row.tokenHash === values[0] && row.hostname === values[1] && row.environment === values[2] && Number(row.issuedAt) <= Number(values[3]) && Number(row.expiresAt) > Number(values[3]));
    else if (sql.startsWith('INSERT INTO site_access_attempts')) result = [{count:++attempts}];
    else if (!sql.startsWith('DELETE FROM')) throw new Error('Unexpected fixture query');
    return {rows:result as never[],rowCount:result.length};
  }};
  return {store,rows,sessions};
}
