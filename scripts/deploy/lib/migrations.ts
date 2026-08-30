import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { DatabaseInspection } from "./database";
import {
  assertCommandSucceeded,
  combinedOutput,
  type CommandRunner,
} from "./process";

const MIGRATION_MANIFEST_PATH = join(
  "scripts",
  "deploy",
  "migrations.manifest.json",
);

export type MigrationClassification =
  | "expand-compatible"
  | "bootstrap-only"
  | "destructive-reviewed";

export type ReviewedMigration = {
  name: string;
  sha256: string;
  classification: MigrationClassification;
};

export type MigrationManifest = {
  schemaVersion: 1;
  migrations: ReviewedMigration[];
};

const REVIEWED_SCHEMA_INVISIBLE_MIGRATION_HASHES = new Map([
  [
    "20260828120000_separate_admin_access_cas_revisions",
    "1c6be2aaf76e7f185eb8605b16263484aa9de9ec827374f7d58a205349236e27",
  ],
]);

export type LocalMigration = {
  name: string;
  sql: string;
  hash: string;
  classification: MigrationClassification | "unreviewed";
  affectedTables: string[];
  destructiveStatements: string[];
};

export type MigrationPlan = {
  state: "up-to-date" | "pending";
  pending: LocalMigration[];
  appliedNames: string[];
  predictedDiff: string;
  predictedDiffHash: string;
  planHash: string;
  freshDatabase: boolean;
  databaseTables: string[];
  databaseObjects: string[];
  tablesWithData: string[];
  statusSummary: string;
  totalMigrationCount: number;
};

export type MigrationSnapshotOptions = {
  projectRoot: string;
  directUrl: string;
  runner: CommandRunner;
  inspect: (directUrl: string) => Promise<DatabaseInspection>;
};

export async function createMigrationPlan(
  options: MigrationSnapshotOptions,
): Promise<MigrationPlan> {
  const plan = await createMigrationSnapshot(options);
  assertAutomaticMigrationEligibility(plan);
  return plan;
}

/**
 * Inspects migration history, Prisma status, and schema drift without granting
 * permission to apply the result. Production deploy callers must use
 * createMigrationPlan; the one-time reviewed path separately binds this
 * snapshot to an exact migration batch before it can execute anything.
 */
export async function createMigrationSnapshot(
  options: MigrationSnapshotOptions,
): Promise<MigrationPlan> {
  const migrations = readReviewedMigrationChain(options.projectRoot);

  let database: DatabaseInspection;
  try {
    database = await options.inspect(options.directUrl);
  } catch (error) {
    throw new Error(
      `Could not inspect the Neon database: ${error instanceof Error ? error.message : "unknown connection error"}`,
    );
  }
  if (
    database.adminAccessRoleCardinalityViolations !== null &&
    database.adminAccessRoleCardinalityViolations > 0
  ) {
    throw new Error(
      `Administrative access-role cardinality preflight found ${database.adminAccessRoleCardinalityViolations} user(s) without exactly one role. Resolve the assignments before running Prisma migrations.`,
    );
  }

  validateMigrationHistory(migrations, database);
  const appliedNames = database.migrations
    .filter((migration) => migration.finished && !migration.rolledBack)
    .map((migration) => migration.name);
  const pending = migrations.slice(appliedNames.length);
  const freshDatabase =
    appliedNames.length === 0 &&
    pending.length === migrations.length &&
    database.userObjects.length === 0;
  if (freshDatabase) {
    throw new Error(
      "The Neon database is empty and has no applied migration history. Automatic bootstrap is outside this deployment interface; create and review a separate bootstrap path before deploying.",
    );
  }
  const migrationEnvironment = createMigrationEnvironment(options.directUrl);
  const status = options.runner.run(
    "npm",
    ["exec", "--", "prisma", "migrate", "status"],
    { env: migrationEnvironment },
  );
  const statusOutput = combinedOutput(status);
  const statusState = classifyPrismaStatus(status.status, statusOutput);
  const diff = options.runner.run(
    "npm",
    [
      "exec",
      "--",
      "prisma",
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
      "--script",
      "--exit-code",
    ],
    { env: migrationEnvironment },
  );
  if (diff.status !== 0 && diff.status !== 2) {
    assertCommandSucceeded(diff, "Prisma schema diff");
  }
  const predictedDiff = normalizePrismaDiff(diff.stdout);

  if (pending.length === 0) {
    if (statusState !== "up-to-date") {
      throw new Error(
        "Prisma status disagrees with the verified migration history; refusing to continue.",
      );
    }
    if (diff.status !== 0 || predictedDiff) {
      throw new Error(
        "Schema drift exists even though no migration is pending. Create and review a forward migration before deploying.",
      );
    }
  } else {
    if (statusState !== "pending") {
      throw new Error(
        "Prisma did not confirm the expected pending migrations; refusing to continue.",
      );
    }
    const reviewedSchemaInvisibleOnly =
      pending.length > 0 &&
      pending.every(isReviewedSchemaInvisibleMigration);
    if (
      (diff.status !== 2 || !predictedDiff) &&
      !(
        reviewedSchemaInvisibleOnly &&
        diff.status === 0 &&
        predictedDiff === ""
      )
    ) {
      throw new Error(
        "Pending migrations did not produce a schema diff; refusing to infer a safe migration state.",
      );
    }
  }

  const predictedDiffHash = sha256(predictedDiff);
  const planHash = sha256(
    JSON.stringify({
      appliedNames,
      pending: pending.map(({ name, hash, classification }) => ({
        name,
        hash,
        classification,
      })),
      predictedDiffHash,
      migrationAttempts: database.migrations.map(
        ({ name, checksum, finished, rolledBack }) => ({
          name,
          checksum,
          finished,
          rolledBack,
        }),
      ),
      databaseTables: database.userTables,
      databaseObjects: database.userObjects,
      tablesWithData: database.tablesWithData,
    }),
  );

  return {
    state: pending.length === 0 ? "up-to-date" : "pending",
    pending,
    appliedNames,
    predictedDiff,
    predictedDiffHash,
    planHash,
    freshDatabase,
    databaseTables: database.userTables,
    databaseObjects: database.userObjects,
    tablesWithData: database.tablesWithData,
    statusSummary: statusOutput,
    totalMigrationCount: migrations.length,
  };
}

function assertAutomaticMigrationEligibility(plan: MigrationPlan): void {
  const incompatible = plan.pending.filter(
    (migration) => migration.classification !== "expand-compatible",
  );
  if (incompatible.length > 0) {
    throw new Error(
      [
        "Only reviewed expand-compatible migrations may be applied to an existing database.",
        `Blocked migrations: ${incompatible.map((migration) => `${migration.name} (${migration.classification})`).join(", ")}`,
        "Prepare a separate reviewed forward migration; deploy.sh will not apply this automatically.",
      ].join("\n"),
    );
  }
  const destructive = plan.pending.flatMap((migration) =>
    isReviewedSchemaInvisibleMigration(migration)
      ? []
      : migration.destructiveStatements.map(
          (statement) => `${migration.name}: ${statement}`,
        ),
  );
  if (destructive.length > 0) {
    throw new Error(
      [
        "Destructive DDL is not eligible for automatic Production deployment.",
        `Tables with data: ${plan.tablesWithData.join(", ")}`,
        "Prepare a separate reviewed migration plan; deploy.sh will not apply this automatically.",
      ].join("\n"),
    );
  }
}

function isReviewedSchemaInvisibleMigration(
  migration: LocalMigration,
): boolean {
  return (
    REVIEWED_SCHEMA_INVISIBLE_MIGRATION_HASHES.get(migration.name) ===
    migration.hash
  );
}

export function readLocalMigrations(directory: string): LocalMigration[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const sql = readFileSync(join(directory, name, "migration.sql"), "utf8");
      return {
        name,
        sql,
        hash: sha256(sql),
        classification: "unreviewed",
        affectedTables: findAffectedTables(sql),
        destructiveStatements: findDestructiveStatements(sql),
      };
    });
}

export function readMigrationManifest(path: string): MigrationManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    throw new Error("The reviewed migration manifest is missing or invalid JSON.");
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1) {
    throw new Error("The reviewed migration manifest schema version is unsupported.");
  }
  if (!Array.isArray(parsed.migrations) || parsed.migrations.length === 0) {
    throw new Error("The reviewed migration manifest must contain migrations.");
  }

  const migrations: ReviewedMigration[] = [];
  const names = new Set<string>();
  for (const entry of parsed.migrations) {
    if (
      !isRecord(entry) ||
      typeof entry.name !== "string" ||
      !/^\d{14}_[a-z0-9_]+$/.test(entry.name) ||
      typeof entry.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(entry.sha256) ||
      !isMigrationClassification(entry.classification)
    ) {
      throw new Error("The reviewed migration manifest contains an invalid entry.");
    }
    if (names.has(entry.name)) {
      throw new Error(
        `The reviewed migration manifest contains duplicate '${entry.name}'.`,
      );
    }
    names.add(entry.name);
    migrations.push({
      name: entry.name,
      sha256: entry.sha256,
      classification: entry.classification,
    });
  }
  return { schemaVersion: 1, migrations };
}

export function readReviewedMigrationChain(
  projectRoot: string,
): LocalMigration[] {
  const manifest = readMigrationManifest(
    join(projectRoot, MIGRATION_MANIFEST_PATH),
  );
  const local = readLocalMigrations(
    join(projectRoot, "prisma", "migrations"),
  );
  if (local.length !== manifest.migrations.length) {
    throw new Error(
      "The local Prisma migration chain does not exactly match the reviewed manifest.",
    );
  }
  return local.map((migration, index) => {
    const reviewed = manifest.migrations[index];
    if (
      reviewed === undefined ||
      reviewed.name !== migration.name ||
      reviewed.sha256 !== migration.hash
    ) {
      throw new Error(
        `Migration '${migration.name}' does not match the reviewed manifest order and SHA-256.`,
      );
    }
    if (
      reviewed.classification === "expand-compatible" &&
      migration.destructiveStatements.length > 0
    ) {
      throw new Error(
        `Migration '${migration.name}' is classified expand-compatible but contains destructive DDL.`,
      );
    }
    if (reviewed.classification === "expand-compatible") {
      const unsafeStatements = findUnsafeExpandCompatibleStatements(
        migration.sql,
      );
      if (unsafeStatements.length > 0) {
        throw new Error(
          [
            `Migration '${migration.name}' is classified expand-compatible but contains SQL outside the reviewed statement allowlist.`,
            ...unsafeStatements.map((statement) => `  ${statement}`),
          ].join("\n"),
        );
      }
    }
    return { ...migration, classification: reviewed.classification };
  });
}

export function validateMigrationHistory(
  local: readonly LocalMigration[],
  database: DatabaseInspection,
): void {
  const failed = database.migrations.filter(
    (migration) => !migration.finished && !migration.rolledBack,
  );
  if (failed.length > 0) {
    throw new Error(
      `Failed or incomplete migration history detected: ${failed.map((item) => item.name).join(", ")}`,
    );
  }

  let appliedCount = 0;
  const appliedNames = new Set<string>();
  for (const attempt of database.migrations) {
    if (attempt.finished && attempt.rolledBack) {
      throw new Error(
        `Contradictory migration history state detected for '${attempt.name}'.`,
      );
    }
    if (attempt.finished && appliedNames.has(attempt.name)) {
      throw new Error("Duplicate applied migration names were found in Neon.");
    }

    const expected = local[appliedCount];
    if (!expected || expected.name !== attempt.name) {
      throw new Error(
        "Migration history has diverged from the ordered local migration chain.",
      );
    }
    if (expected.hash !== attempt.checksum) {
      throw new Error(
        `Migration checksum mismatch for '${expected.name}'. The applied SQL must not be rewritten.`,
      );
    }

    if (attempt.rolledBack) {
      continue;
    }
    appliedNames.add(attempt.name);
    appliedCount += 1;
  }
}

export function classifyPrismaStatus(
  exitCode: number,
  output: string,
): "up-to-date" | "pending" {
  if (/database schema is up to date/i.test(output) && exitCode === 0) {
    return "up-to-date";
  }
  if (
    /following migration(?:s)? have not yet been applied|pending migration/i.test(
      output,
    ) &&
    (exitCode === 0 || exitCode === 1)
  ) {
    return "pending";
  }
  throw new Error(
    "Prisma migration status was neither verified up-to-date nor confirmed pending. Connection errors, failed history, and drift are never auto-repaired.",
  );
}

export function normalizePrismaDiff(output: string): string {
  const trimmed = output.trim();
  if (trimmed === "-- This is an empty migration.") {
    return "";
  }
  return trimmed;
}

export function renderMigrationPlan(plan: MigrationPlan): string {
  if (plan.state === "up-to-date") {
    return [
      "Migration state: up to date",
      `Applied migrations: ${plan.appliedNames.length}`,
      ...plan.appliedNames.map(
        (name, index) => `  ${index + 1}. ${name}`,
      ),
      "Prisma migrate status:",
      plan.statusSummary.trim() || "(none)",
      "Schema diff:",
      plan.predictedDiff || "(none)",
      `Schema diff SHA-256: ${plan.predictedDiffHash}`,
    ].join("\n");
  }

  const lines = [
    "Migration state: pending",
    `Fresh empty database: ${plan.freshDatabase ? "yes" : "no"}`,
    `Plan SHA-256: ${plan.planHash}`,
    `Predicted schema diff SHA-256: ${plan.predictedDiffHash}`,
    `Existing tables: ${plan.databaseTables.join(", ") || "none"}`,
    `Existing public schema objects: ${plan.databaseObjects.join(", ") || "none"}`,
    `Tables containing data: ${plan.tablesWithData.join(", ") || "none"}`,
    "Pending migrations in execution order:",
  ];
  for (const [index, migration] of plan.pending.entries()) {
    lines.push(
      `${index + 1}. ${migration.name}`,
      `   SQL SHA-256: ${migration.hash}`,
      `   Classification: ${migration.classification}`,
      `   Affected tables: ${migration.affectedTables.join(", ") || "not detected"}`,
      `   Destructive DDL: ${migration.destructiveStatements.join(" | ") || "none detected"}`,
      "----- migration.sql -----",
      migration.sql.trimEnd(),
      "----- end migration.sql -----",
    );
  }
  lines.push(
    "----- predicted schema diff -----",
    plan.predictedDiff,
    "----- end predicted schema diff -----",
  );
  return lines.join("\n");
}

export function applyMigrationPlan(
  runner: CommandRunner,
  directUrl: string,
): void {
  const result = runner.run(
    "npm",
    ["exec", "--", "prisma", "migrate", "deploy"],
    {
      env: createMigrationEnvironment(directUrl),
    },
  );
  assertCommandSucceeded(result, "Prisma migrate deploy");
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

function findAffectedTables(sql: string): string[] {
  const names = new Set<string>();
  const expression =
    /\b(?:CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|LOCK\s+TABLE|TRUNCATE(?:\s+TABLE)?(?!\s+ON\b)|INSERT\s+INTO|UPDATE(?!\s+(?:OF|OR)\b)|DELETE\s+FROM)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:"public"\.)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/gi;
  for (const match of sql.matchAll(expression)) {
    const name = match[1] ?? match[2];
    if (name) {
      names.add(name);
    }
  }
  return [...names].sort();
}

export function findDestructiveStatements(sql: string): string[] {
  return sql
    .replace(/--[^\r\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim())
    .filter((statement) =>
      /\bDROP\b|^TRUNCATE(?:\s+TABLE)?\b|\bDELETE\s+FROM\b|\bALTER\s+TABLE\b.*(?:\bRENAME\b|\bALTER\b.*\bTYPE\b)/i.test(
        statement,
      ),
    )
    .map((statement) => `${statement.slice(0, 220)};`);
}

const SQL_IDENTIFIER = `(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const SQL_QUALIFIED_IDENTIFIER = `(?:${SQL_IDENTIFIER}\\.)?${SQL_IDENTIFIER}`;

/**
 * Expanding a live schema is deliberately restricted to a small, auditable SQL
 * subset. Anything not recognized here is unsafe even when the manifest labels
 * it expand-compatible; the manifest is review evidence, not an escape hatch.
 */
export function findUnsafeExpandCompatibleStatements(sql: string): string[] {
  const statements = splitSqlStatements(sql);
  const createdTables = new Set<string>();

  for (const statement of statements) {
    const createTable = new RegExp(
      `^CREATE\\s+TABLE\\s+(${SQL_QUALIFIED_IDENTIFIER})\\s*\\([\\s\\S]*\\)$`,
      "iu",
    ).exec(statement.normalized);
    if (createTable?.[1]) {
      createdTables.add(canonicalSqlObjectName(createTable[1]));
    }
  }

  return statements
    .filter(
      (statement) =>
        !isAllowedExpandCompatibleStatement(
          statement.normalized,
          createdTables,
        ),
    )
    .map((statement) => `${statement.normalized.slice(0, 220)};`);
}

type SqlStatement = {
  normalized: string;
};

function splitSqlStatements(sql: string): SqlStatement[] {
  const statements: SqlStatement[] = [];
  let current = "";
  let index = 0;
  let quote: "single" | "double" | undefined;
  let dollarTag: string | undefined;
  let blockCommentDepth = 0;
  let lineComment = false;

  const finish = () => {
    const normalized = current.replace(/\s+/gu, " ").trim();
    if (normalized) {
      statements.push({ normalized });
    }
    current = "";
  };

  while (index < sql.length) {
    const character = sql[index] ?? "";
    const next = sql[index + 1] ?? "";

    if (lineComment) {
      if (character === "\n" || character === "\r") {
        lineComment = false;
        current += " ";
      }
      index += 1;
      continue;
    }
    if (blockCommentDepth > 0) {
      if (character === "/" && next === "*") {
        blockCommentDepth += 1;
        index += 2;
      } else if (character === "*" && next === "/") {
        blockCommentDepth -= 1;
        index += 2;
        if (blockCommentDepth === 0) {
          current += " ";
        }
      } else {
        index += 1;
      }
      continue;
    }
    if (dollarTag !== undefined) {
      if (sql.startsWith(dollarTag, index)) {
        current += dollarTag;
        index += dollarTag.length;
        dollarTag = undefined;
      } else {
        current += character;
        index += 1;
      }
      continue;
    }
    if (quote !== undefined) {
      current += character;
      const delimiter = quote === "single" ? "'" : '"';
      if (character === delimiter) {
        if (next === delimiter) {
          current += next;
          index += 2;
          continue;
        }
        quote = undefined;
      }
      index += 1;
      continue;
    }
    if (character === "-" && next === "-") {
      lineComment = true;
      index += 2;
      continue;
    }
    if (character === "/" && next === "*") {
      blockCommentDepth = 1;
      index += 2;
      continue;
    }
    if (character === "'") {
      quote = "single";
      current += character;
      index += 1;
      continue;
    }
    if (character === '"') {
      quote = "double";
      current += character;
      index += 1;
      continue;
    }
    if (character === "$") {
      const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/u.exec(
        sql.slice(index),
      )?.[0];
      if (tag !== undefined) {
        dollarTag = tag;
        current += tag;
        index += tag.length;
        continue;
      }
    }
    if (character === ";") {
      finish();
      index += 1;
      continue;
    }
    current += character;
    index += 1;
  }

  if (
    quote !== undefined ||
    dollarTag !== undefined ||
    blockCommentDepth > 0
  ) {
    return [{ normalized: "INVALID OR UNTERMINATED SQL" }];
  }
  finish();
  return statements;
}

function isAllowedExpandCompatibleStatement(
  statement: string,
  createdTables: ReadonlySet<string>,
): boolean {
  if (/^(?:BEGIN|COMMIT)$/iu.test(statement)) {
    return true;
  }

  const enumLiteral = `'(?:[^']|'')*'`;
  if (
    new RegExp(
      `^CREATE\\s+TYPE\\s+${SQL_QUALIFIED_IDENTIFIER}\\s+AS\\s+ENUM\\s*\\(\\s*${enumLiteral}(?:\\s*,\\s*${enumLiteral})*\\s*\\)$`,
      "iu",
    ).test(statement)
  ) {
    return true;
  }

  if (
    new RegExp(
      `^CREATE\\s+TABLE\\s+${SQL_QUALIFIED_IDENTIFIER}\\s*\\([\\s\\S]*\\)$`,
      "iu",
    ).test(statement)
  ) {
    return true;
  }

  const createIndex = new RegExp(
    `^CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+${SQL_IDENTIFIER}\\s+ON\\s+(${SQL_QUALIFIED_IDENTIFIER})(?:\\s+USING\\s+[A-Za-z_][A-Za-z0-9_$]*)?\\s*\\([\\s\\S]+\\)(?:\\s+WHERE\\s+[\\s\\S]+)?$`,
    "iu",
  ).exec(statement);
  if (
    createIndex?.[1] &&
    createdTables.has(canonicalSqlObjectName(createIndex[1]))
  ) {
    return true;
  }

  const insert = new RegExp(
    `^INSERT\\s+INTO\\s+(${SQL_QUALIFIED_IDENTIFIER})(?:\\s*\\([^)]*\\))?\\s+(?:VALUES\\b|SELECT\\b|DEFAULT\\s+VALUES\\b)[\\s\\S]*$`,
    "iu",
  ).exec(statement);
  if (
    insert?.[1] &&
    createdTables.has(canonicalSqlObjectName(insert[1]))
  ) {
    return true;
  }

  const alterTable = new RegExp(
    `^ALTER\\s+TABLE\\s+(?:ONLY\\s+)?(${SQL_QUALIFIED_IDENTIFIER})\\s+([\\s\\S]+)$`,
    "iu",
  ).exec(statement);
  if (alterTable?.[1] && alterTable[2]) {
    const table = canonicalSqlObjectName(alterTable[1]);
    if (createdTables.has(table)) {
      return new RegExp(
        `^ADD\\s+CONSTRAINT\\s+${SQL_IDENTIFIER}\\s+[\\s\\S]+$`,
        "iu",
      ).test(alterTable[2]);
    }
    return isNullableAddColumn(alterTable[2]);
  }

  return new RegExp(
    `^ALTER\\s+TYPE\\s+${SQL_QUALIFIED_IDENTIFIER}\\s+ADD\\s+VALUE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${enumLiteral}(?:\\s+(?:BEFORE|AFTER)\\s+${enumLiteral})?$`,
    "iu",
  ).test(statement);
}

function isNullableAddColumn(action: string): boolean {
  const match = new RegExp(
    `^ADD\\s+COLUMN(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${SQL_IDENTIFIER}\\s+([\\s\\S]+)$`,
    "iu",
  ).exec(action);
  const definition = match?.[1];
  if (!definition || hasTopLevelComma(definition)) {
    return false;
  }
  return !/\b(?:NOT\s+NULL|PRIMARY\s+KEY|UNIQUE|REFERENCES|CHECK|GENERATED|IDENTITY|CONSTRAINT|DEFAULT|DROP|ALTER|RENAME|SET)\b/iu.test(
    definition,
  );
}

function hasTopLevelComma(value: string): boolean {
  let parentheses = 0;
  let quote: "single" | "double" | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (quote !== undefined) {
      const delimiter = quote === "single" ? "'" : '"';
      if (character === delimiter) {
        if (next === delimiter) {
          index += 1;
        } else {
          quote = undefined;
        }
      }
      continue;
    }
    if (character === "'") {
      quote = "single";
    } else if (character === '"') {
      quote = "double";
    } else if (character === "(") {
      parentheses += 1;
    } else if (character === ")") {
      parentheses -= 1;
      if (parentheses < 0) {
        return true;
      }
    } else if (character === "," && parentheses === 0) {
      return true;
    }
  }
  return quote !== undefined || parentheses !== 0;
}

function canonicalSqlObjectName(value: string): string {
  const parts = value.split(".").map((part) => {
    if (part.startsWith('"') && part.endsWith('"')) {
      return part.slice(1, -1).replaceAll('""', '"');
    }
    return part.toLowerCase();
  });
  return parts.length === 1 ? `public.${parts[0]}` : parts.join(".");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function createMigrationEnvironment(directUrl: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: directUrl,
    DATABASE_URL_UNPOOLED: directUrl,
  };
  for (const name of [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_SECURITY_TOKEN",
    "AWS_WEB_IDENTITY_TOKEN_FILE",
    "AWS_ROLE_ARN",
    "AWS_ROLE_SESSION_NAME",
    "AWS_PROFILE",
    "AWS_DEFAULT_PROFILE",
    "AWS_SHARED_CREDENTIALS_FILE",
    "AWS_CONFIG_FILE",
    "AWS_CONTAINER_AUTHORIZATION_TOKEN",
    "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE",
    "AWS_CONTAINER_CREDENTIALS_FULL_URI",
    "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
    "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
    "ACTIONS_ID_TOKEN_REQUEST_URL",
    "ACTIONS_RUNTIME_TOKEN",
    "GITHUB_TOKEN",
    "VERCEL_TOKEN",
    "NEON_API_KEY",
    "BETTER_AUTH_SECRET",
  ]) {
    delete environment[name];
  }
  return environment;
}

function isMigrationClassification(
  value: unknown,
): value is MigrationClassification {
  return (
    value === "expand-compatible" ||
    value === "bootstrap-only" ||
    value === "destructive-reviewed"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
