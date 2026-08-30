import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import {
  RESERVATION_API_PERMISSIONS,
  type ReservationApiPermission,
} from "@/lib/reservation-api";

import { consumeReservationApiRequest } from "./reservation-api-usage";

export type ReservationApiKeyMetadata = {
  id: string;
  name: string;
  keyPreview: string;
  permissions: ReservationApiPermission[];
  revision: number;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
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

export function parseReservationApiKey(rawKey: string): { publicId: string } | null {
  const match = /^zgcc_rsv_([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})$/u.exec(rawKey);
  return match ? { publicId: match[1]! } : null;
}

export function previewReservationApiKey(publicId: string): string {
  return `zgcc_rsv_${publicId.slice(0, 4)}••••${publicId.slice(-4)}`;
}

export async function listReservationApiKeys(prisma: PrismaClient) {
  const keys = await prisma.reservationApiKey.findMany({
    include: { permissions: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return keys.map(toReservationApiKeyMetadata);
}

export async function issueReservationApiKey(
  prisma: PrismaClient,
  input: { name: string; permissions: ReservationApiPermission[]; actorId: string },
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const generated = generateReservationApiKey();
    try {
      const apiKey = await prisma.reservationApiKey.create({
        data: {
          publicId: generated.publicId,
          name: input.name,
          secretHash: digestReservationApiKey(generated.rawKey),
          createdByUserId: input.actorId,
          permissions: {
            createMany: { data: input.permissions.map((permission) => ({ permission })) },
          },
        },
        include: { permissions: true },
      });
      return { apiKey: toReservationApiKeyMetadata(apiKey), rawKey: generated.rawKey };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002" || attempt === 2) {
        throw error;
      }
    }
  }
  throw new Error("Failed to generate a unique reservation API key.");
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
  input: { authorization: string | null; now?: Date },
): Promise<
  | { status: "UNAUTHORIZED" }
  | { status: "LIMIT_EXCEEDED"; retryAfterSeconds: number }
  | { status: "AUTHENTICATED"; keyId: string; permissions: Set<ReservationApiPermission> }
> {
  const rawKey = parseBearerHeader(input.authorization);
  if (!rawKey) return { status: "UNAUTHORIZED" };
  const parsed = parseReservationApiKey(rawKey);
  if (!parsed) return { status: "UNAUTHORIZED" };
  const now = input.now ?? new Date();

  return prisma.$transaction(async (transaction) => {
    const [locked] = await transaction.$queryRaw<Array<{
      id: string;
      secretHash: string;
      revokedAt: Date | null;
    }>>(Prisma.sql`
      SELECT "id", "secretHash", "revokedAt"
      FROM "reservation_api_keys"
      WHERE "publicId" = ${parsed.publicId}
      FOR UPDATE
    `);
    if (!locked || locked.revokedAt !== null || !verifyReservationApiKey(rawKey, locked.secretHash)) {
      return { status: "UNAUTHORIZED" as const };
    }
    const permissions = await transaction.reservationApiKeyPermission.findMany({
      where: { apiKeyId: locked.id },
      select: { permission: true },
    });
    const quota = await consumeReservationApiRequest(transaction, { keyId: locked.id, now });
    if (!quota.allowed) {
      return {
        status: "LIMIT_EXCEEDED" as const,
        retryAfterSeconds: quota.retryAfterSeconds,
      };
    }
    return {
      status: "AUTHENTICATED" as const,
      keyId: locked.id,
      permissions: new Set(permissions.map(({ permission }) => permission as ReservationApiPermission)),
    };
  });
}

function parseBearerHeader(value: string | null): string | null {
  if (!value || value.includes(",")) return null;
  const match = /^Bearer ([^\s]+)$/u.exec(value);
  return match?.[1] ?? null;
}

function toReservationApiKeyMetadata(key: KeyWithPermissions): ReservationApiKeyMetadata {
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
  };
}
