import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import {
  RESERVATION_API_PERMISSIONS,
  parseReservationCallerPhone,
  type ReservationCallerAniDigest,
  type ReservationCallerPhone,
  type ReservationApiKeyUsageDto,
  type ReservationApiPermission,
} from "@/lib/reservation-api";

import {
  consumeReservationApiRequest,
  getReservationApiPeriod,
  toReservationApiKeyUsageDto,
} from "./reservation-api-usage";

export type ReservationApiKeyMetadata = {
  id: string;
  name: string;
  keyPreview: string;
  permissions: ReservationApiPermission[];
  revision: number;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  usage: ReservationApiKeyUsageDto;
};

type KeyWithPermissions = Prisma.ReservationApiKeyGetPayload<{
  include: { permissions: true };
}>;

export function generateReservationApiKey(): { rawKey: string; publicId: string } {
  const publicId = randomBytes(12).toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  return { rawKey: `zgcc_rsv_${publicId}.${secret}`, publicId };
}

export function digestReservationApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

export function verifyReservationApiKey(rawKey: string, expectedDigest: string): boolean {
  const actual = Buffer.from(digestReservationApiKey(rawKey), "hex");
  const expected = Buffer.from(expectedDigest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function digestReservationCallerAni(
  rawKey: string,
  callerPhone: ReservationCallerPhone,
): ReservationCallerAniDigest {
  if (!parseReservationApiKey(rawKey) || parseReservationCallerPhone(callerPhone) !== callerPhone) {
    throw new Error("A canonical reservation API key and caller phone are required.");
  }
  return createHmac("sha256", rawKey)
    .update("zoom-gov-contact-center-demo:reservation-caller-ani:v1\0", "utf8")
    .update(callerPhone, "utf8")
    .digest("hex") as ReservationCallerAniDigest;
}

export function parseReservationApiKey(rawKey: string): { publicId: string } | null {
  const match = /^zgcc_rsv_([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})$/u.exec(rawKey);
  return match ? { publicId: match[1]! } : null;
}

export function previewReservationApiKey(publicId: string): string {
  return `zgcc_rsv_${publicId.slice(0, 4)}••••${publicId.slice(-4)}`;
}

export async function listReservationApiKeys(prisma: PrismaClient, now = new Date()) {
  const period = getReservationApiPeriod(now);
  const [keys, usages] = await Promise.all([
    prisma.reservationApiKey.findMany({
      include: { permissions: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    prisma.reservationApiKeyMonthlyUsage.findMany({
      where: { periodStart: period.periodDate },
      select: { apiKeyId: true, requestCount: true },
    }),
  ]);
  const usageByKeyId = new Map(usages.map((usage) => [usage.apiKeyId, usage.requestCount]));
  return keys.map((key) => toReservationApiKeyMetadata(
    key,
    usageByKeyId.get(key.id) ?? BigInt(0),
    now,
  ));
}

export async function issueReservationApiKey(
  prisma: PrismaClient,
  input: {
    name: string;
    permissions: ReservationApiPermission[];
    monthlyLimit: bigint | null;
    actorId: string;
    now?: Date;
  },
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const generated = generateReservationApiKey();
    try {
      const apiKey = await prisma.reservationApiKey.create({
        data: {
          publicId: generated.publicId,
          name: input.name,
          secretHash: digestReservationApiKey(generated.rawKey),
          monthlyLimit: input.monthlyLimit,
          createdByUserId: input.actorId,
          permissions: {
            createMany: { data: input.permissions.map((permission) => ({ permission })) },
          },
        },
        include: { permissions: true },
      });
      return {
        apiKey: toReservationApiKeyMetadata(apiKey, BigInt(0), input.now),
        rawKey: generated.rawKey,
      };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002" || attempt === 2) {
        throw error;
      }
    }
  }
  throw new Error("Failed to generate a unique reservation API key.");
}

export async function updateReservationApiKeyUsageLimit(
  prisma: PrismaClient,
  input: {
    id: string;
    monthlyLimit: bigint | null;
    expectedRevision: number;
    now?: Date;
  },
): Promise<
  | { status: "UPDATED"; apiKey: ReservationApiKeyMetadata }
  | { status: "NOT_FOUND" }
  | { status: "CONFLICT" }
> {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (transaction) => {
    const exists = await transaction.reservationApiKey.findUnique({
      where: { id: input.id },
      select: { id: true },
    });
    if (!exists) return { status: "NOT_FOUND" as const };

    const updated = await transaction.reservationApiKey.updateMany({
      where: { id: input.id, revision: input.expectedRevision, revokedAt: null },
      data: { monthlyLimit: input.monthlyLimit, revision: { increment: 1 } },
    });
    if (updated.count !== 1) return { status: "CONFLICT" as const };

    const period = getReservationApiPeriod(now);
    const [apiKey, usage] = await Promise.all([
      transaction.reservationApiKey.findUniqueOrThrow({
        where: { id: input.id },
        include: { permissions: true },
      }),
      transaction.reservationApiKeyMonthlyUsage.findUnique({
        where: {
          apiKeyId_periodStart: { apiKeyId: input.id, periodStart: period.periodDate },
        },
        select: { requestCount: true },
      }),
    ]);
    return {
      status: "UPDATED" as const,
      apiKey: toReservationApiKeyMetadata(apiKey, usage?.requestCount ?? BigInt(0), now),
    };
  });
}

export async function revokeReservationApiKey(
  prisma: PrismaClient,
  input: { id: string; expectedRevision: number; actorId: string; now?: Date },
): Promise<"REVOKED" | "NOT_FOUND" | "CONFLICT"> {
  const exists = await prisma.reservationApiKey.findUnique({
    where: { id: input.id },
    select: { id: true },
  });
  if (!exists) return "NOT_FOUND";
  const updated = await prisma.reservationApiKey.updateMany({
    where: { id: input.id, revision: input.expectedRevision, revokedAt: null },
    data: {
      revokedAt: input.now ?? new Date(),
      revokedByUserId: input.actorId,
      revision: { increment: 1 },
    },
  });
  return updated.count === 1 ? "REVOKED" : "CONFLICT";
}

export async function authenticateReservationApiRequest(
  prisma: PrismaClient,
  input: {
    authorization: string | null;
    callerPhone?: ReservationCallerPhone | null;
    now?: Date;
  },
): Promise<
  | { status: "UNAUTHORIZED" }
  | {
      status: "GLOBAL_LIMIT_EXCEEDED" | "KEY_LIMIT_EXCEEDED";
      retryAfterSeconds: number;
      keyId: string;
      keyName: string;
      keyPreview: string;
      permissions: Set<ReservationApiPermission>;
      callerAniDigest: ReservationCallerAniDigest | null;
    }
  | {
      status: "AUTHENTICATED";
      keyId: string;
      keyName: string;
      keyPreview: string;
      permissions: Set<ReservationApiPermission>;
      callerAniDigest: ReservationCallerAniDigest | null;
    }
  | {
      status: "INTERNAL_ERROR";
      keyId: string;
      keyName: string;
      keyPreview: string;
      permissions: Set<ReservationApiPermission>;
      callerAniDigest: ReservationCallerAniDigest | null;
    }
> {
  const rawKey = parseBearerHeader(input.authorization);
  if (!rawKey) return { status: "UNAUTHORIZED" };
  const parsed = parseReservationApiKey(rawKey);
  if (!parsed) return { status: "UNAUTHORIZED" };
  const now = input.now ?? new Date();

  type AuthenticatedContext = {
    keyId: string;
    keyName: string;
    keyPreview: string;
    permissions: Set<ReservationApiPermission>;
    callerAniDigest: ReservationCallerAniDigest | null;
  };
  const authenticatedContext: { value: AuthenticatedContext | null } = {
    value: null,
  };
  try {
    return await prisma.$transaction(async (transaction) => {
      const [locked] = await transaction.$queryRaw<Array<{
        id: string;
        name: string;
        publicId: string;
        secretHash: string;
        monthlyLimit: bigint | null;
        revokedAt: Date | null;
      }>>(Prisma.sql`
        SELECT "id", "name", "publicId", "secretHash", "monthlyLimit", "revokedAt"
        FROM "reservation_api_keys"
        WHERE "publicId" = ${parsed.publicId}
        FOR UPDATE
      `);
      if (!locked || locked.revokedAt !== null || !verifyReservationApiKey(rawKey, locked.secretHash)) {
        return { status: "UNAUTHORIZED" as const };
      }
      const keyContext: AuthenticatedContext = {
        keyId: locked.id,
        keyName: locked.name,
        keyPreview: previewReservationApiKey(locked.publicId),
        permissions: new Set<ReservationApiPermission>(),
        callerAniDigest: input.callerPhone
          ? digestReservationCallerAni(rawKey, input.callerPhone)
          : null,
      };
      authenticatedContext.value = keyContext;
      const permissions = await transaction.reservationApiKeyPermission.findMany({
        where: { apiKeyId: locked.id },
        select: { permission: true },
      });
      keyContext.permissions = new Set(
        permissions.map(({ permission }) => permission as ReservationApiPermission),
      );
      const quota = await consumeReservationApiRequest(transaction, {
        keyId: locked.id,
        keyMonthlyLimit: locked.monthlyLimit,
        now,
      });
      if (quota.status !== "ALLOWED") {
        return {
          status: quota.status,
          retryAfterSeconds: quota.retryAfterSeconds,
          ...keyContext,
        };
      }
      return {
        status: "AUTHENTICATED" as const,
        ...keyContext,
      };
    });
  } catch (error) {
    const keyContext = authenticatedContext.value;
    if (!keyContext) throw error;
    console.error("Failed to evaluate authenticated reservation API access.");
    return { status: "INTERNAL_ERROR", ...keyContext };
  }
}

function parseBearerHeader(value: string | null): string | null {
  if (!value || value.includes(",")) return null;
  const match = /^Bearer ([^\s]+)$/u.exec(value);
  return match?.[1] ?? null;
}

function toReservationApiKeyMetadata(
  key: KeyWithPermissions,
  requestCount: bigint,
  now = new Date(),
): ReservationApiKeyMetadata {
  const permissions = new Set(key.permissions.map(({ permission }) => permission));
  return {
    id: key.id,
    name: key.name,
    keyPreview: previewReservationApiKey(key.publicId),
    permissions: RESERVATION_API_PERMISSIONS.filter((permission) => permissions.has(permission)),
    revision: key.revision,
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    usage: toReservationApiKeyUsageDto(key.monthlyLimit, requestCount, now),
  };
}
