import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";

import awsRdsSslProfile from "aws-ssl-profiles";
import { hashPassword } from "better-auth/crypto";
import { Pool, type PoolClient } from "pg";

const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;
const PRISMA_TIMEOUT_MS = 12 * 60 * 1_000;

const actions = [
  "migration-status",
  "migration-deploy",
  "seed-admin",
] as const;

export type OperationAction = (typeof actions)[number];

export interface OperationEvent {
  readonly action: OperationAction;
  readonly email?: string;
  readonly name?: string;
  readonly password?: string;
}

export interface OperationResult {
  readonly action: OperationAction | "unknown";
  readonly message?: string;
  readonly ok: boolean;
  readonly pendingMigrations?: string[];
  readonly status?: "up-to-date" | "pending";
}

interface CommandResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

interface MigrationStatus {
  readonly pendingMigrations: string[];
  readonly status: "up-to-date" | "pending";
}

export async function handler(rawEvent: unknown): Promise<OperationResult> {
  let action: OperationAction | "unknown" = "unknown";

  try {
    const event = parseOperationEvent(rawEvent);
    action = event.action;

    if (event.action === "migration-status") {
      const status = await inspectMigrationStatus();
      return {
        action,
        ok: true,
        pendingMigrations: status.pendingMigrations,
        status: status.status,
      };
    }

    if (event.action === "migration-deploy") {
      const before = await inspectMigrationStatus();
      if (before.status === "up-to-date") {
        return {
          action,
          message: "Database schema is already up to date.",
          ok: true,
          pendingMigrations: [],
          status: "up-to-date",
        };
      }

      const deployed = await runPrisma(["migrate", "deploy"]);
      if (deployed.exitCode !== 0) {
        throw prismaFailure("Prisma migrate deploy failed", deployed);
      }

      const after = await inspectMigrationStatus();
      if (after.status !== "up-to-date") {
        throw new Error(
          `Migration deploy completed but ${after.pendingMigrations.length} migration(s) remain pending.`,
        );
      }

      return {
        action,
        message: `Applied ${before.pendingMigrations.length} migration(s).`,
        ok: true,
        pendingMigrations: [],
        status: "up-to-date",
      };
    }

    const seedInput = parseSeedInput(event);
    const seedResult = await seedAdmin(seedInput);
    return {
      action,
      message: seedResult,
      ok: true,
    };
  } catch (error) {
    return {
      action,
      message: safeErrorMessage(error),
      ok: false,
    };
  }
}

export function parseOperationEvent(rawEvent: unknown): OperationEvent {
  if (!rawEvent || typeof rawEvent !== "object" || Array.isArray(rawEvent)) {
    throw new Error("Operation payload must be a JSON object.");
  }

  const event = rawEvent as Record<string, unknown>;
  if (
    typeof event.action !== "string" ||
    !actions.includes(event.action as OperationAction)
  ) {
    throw new Error(`action must be one of: ${actions.join(", ")}.`);
  }

  return {
    action: event.action as OperationAction,
    email: typeof event.email === "string" ? event.email : undefined,
    name: typeof event.name === "string" ? event.name : undefined,
    password: typeof event.password === "string" ? event.password : undefined,
  };
}

export function classifyMigrationStatus(result: CommandResult): MigrationStatus {
  const output = `${result.stdout}\n${result.stderr}`;

  if (result.exitCode === 0) {
    return {
      pendingMigrations: [],
      status: "up-to-date",
    };
  }

  const unsafeStatePatterns = [
    /drift/i,
    /diverg/i,
    /failed migration/i,
    /migration.*failed/i,
    /migrations? from the database are not found locally/i,
    /database schema is not empty/i,
    /migration history.*conflict/i,
  ];
  if (unsafeStatePatterns.some((pattern) => pattern.test(output))) {
    throw prismaFailure("Unsafe migration state detected", result);
  }

  if (!/(not yet been applied|pending migrations?)/i.test(output)) {
    throw prismaFailure("Unable to classify Prisma migration status", result);
  }

  const pendingMigrations = Array.from(
    new Set(
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^\d{14}_[A-Za-z0-9_-]+$/.test(line)),
    ),
  );

  if (pendingMigrations.length === 0) {
    throw prismaFailure(
      "Prisma reported pending migrations but no migration identifiers could be verified",
      result,
    );
  }

  return {
    pendingMigrations,
    status: "pending",
  };
}

async function inspectMigrationStatus(): Promise<MigrationStatus> {
  return classifyMigrationStatus(await runPrisma(["migrate", "status"]));
}

async function runPrisma(args: string[]): Promise<CommandResult> {
  const databaseUrl = requiredDatabaseUrl();
  const taskRoot = process.env.LAMBDA_TASK_ROOT ?? process.cwd();
  const prismaCli = path.join(taskRoot, "node_modules/prisma/build/index.js");
  const configPath = path.join(taskRoot, "prisma.config.ts");

  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [prismaCli, ...args, "--config", configPath],
      {
        cwd: taskRoot,
        env: {
          ...process.env,
          CHECKPOINT_DISABLE: "1",
          DATABASE_URL: databaseUrl,
          NO_COLOR: "1",
          PRISMA_HIDE_UPDATE_MESSAGE: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Prisma command timed out."));
    }, PRISMA_TIMEOUT_MS);

    const append = (current: string, chunk: Buffer): string => {
      outputBytes += chunk.byteLength;
      if (outputBytes > MAX_COMMAND_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        reject(new Error("Prisma command produced too much output."));
        return current;
      }
      return current + chunk.toString("utf8");
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({
        exitCode: exitCode ?? 1,
        stderr,
        stdout,
      });
    });
  });
}

function parseSeedInput(event: OperationEvent): {
  email: string;
  name: string;
  password: string;
} {
  const email = event.email?.trim().toLowerCase();
  const name = event.name?.trim();
  const password = event.password;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid email is required for seed-admin.");
  }
  if (!name) {
    throw new Error("A non-empty name is required for seed-admin.");
  }
  if (!password || password.length < 12 || password.length > 128) {
    throw new Error("Seed admin password must be between 12 and 128 characters.");
  }

  return { email, name, password };
}

async function seedAdmin(input: {
  email: string;
  name: string;
  password: string;
}): Promise<string> {
  const pool = new Pool({
    allowExitOnIdle: true,
    application_name: "zoom-gov-demo-operations",
    connectionString: requiredDatabaseUrl(),
    connectionTimeoutMillis: 45_000,
    idleTimeoutMillis: 1_000,
    max: 1,
    ssl: resolveSslConfig(),
  });
  let client: PoolClient | undefined;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const existing = await client.query<{ id: string }>(
      'SELECT "id" FROM "user" WHERE "email" = $1 LIMIT 1',
      [input.email],
    );
    const now = new Date();

    const passwordHash = await hashPassword(input.password);

    if (existing.rowCount) {
      const userId = existing.rows[0].id;
      await client.query(
        `UPDATE "user"
         SET "name" = $2,
             "role" = 'admin',
             "banned" = false,
             "banReason" = NULL,
             "banExpires" = NULL,
             "mustChangePassword" = false,
             "passwordChangedAt" = $3,
             "updatedAt" = $3
         WHERE "email" = $1`,
        [input.email, input.name, now],
      );
      const credentialAccounts = await client.query(
        `UPDATE "account"
         SET "password" = $2,
             "updatedAt" = $3
         WHERE "userId" = $1
           AND "providerId" = 'credential'`,
        [userId, passwordHash, now],
      );
      if (credentialAccounts.rowCount === 0) {
        await client.query(
          `INSERT INTO "account"
           ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
           VALUES ($1, $2, 'credential', $2, $3, $4, $4)`,
          [randomId(), userId, passwordHash, now],
        );
      }
      await client.query("COMMIT");
      return `Seed admin password and role were updated: ${input.email}`;
    }

    const userId = randomId();
    const accountId = randomId();
    await client.query(
      `INSERT INTO "user"
       ("id", "name", "email", "emailVerified", "createdAt", "updatedAt",
        "role", "banned", "mustChangePassword", "passwordChangedAt")
       VALUES ($1, $2, $3, false, $4, $4, 'admin', false, false, $4)`,
      [userId, input.name, input.email, now],
    );
    await client.query(
      `INSERT INTO "account"
       ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
       VALUES ($1, $2, 'credential', $2, $3, $4, $4)`,
      [accountId, userId, passwordHash, now],
    );
    await client.query("COMMIT");
    return `Seed admin created: ${input.email}`;
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

function randomId(): string {
  return randomBytes(24).toString("base64url");
}

function requiredDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return databaseUrl;
}

function resolveSslConfig() {
  const configured = process.env.DB_SSL;
  if (configured === "false") {
    return false;
  }
  if (configured !== undefined && configured !== "true") {
    throw new Error("DB_SSL must be true or false.");
  }
  return {
    ...awsRdsSslProfile,
    rejectUnauthorized: true,
  };
}

function prismaFailure(prefix: string, result: CommandResult): Error {
  const detail = (result.stderr || result.stdout).trim();
  return new Error(`${prefix} (exit ${result.exitCode}): ${detail}`);
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return message;
  }
  return message.split(databaseUrl).join("[REDACTED_DATABASE_URL]");
}
