import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import {
  type ReservationApiKeyUsageDto,
  type ReservationApiUsageLimitDto,
} from "@/lib/reservation-api";
import { addCalendarMonths, calendarDateToUtc, getTokyoCalendarDate } from "@/lib/reservations";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

type LockedUsageSetting = {
  monthlyLimit: bigint | null;
  revision: number;
};

export function getReservationApiPeriod(now: Date) {
  const month = getTokyoCalendarDate(now).slice(0, 7);
  const periodStart = `${month}-01`;
  const nextMonth = addCalendarMonths(month, 1);
  return {
    periodStart,
    periodDate: calendarDateToUtc(periodStart),
    resetsAt: new Date(`${nextMonth}-01T00:00:00+09:00`),
  };
}

export async function getReservationApiUsageSnapshot(
  prisma: PrismaLike,
  now = new Date(),
): Promise<ReservationApiUsageLimitDto> {
  const period = getReservationApiPeriod(now);
  const [setting, usage] = await Promise.all([
    prisma.reservationApiUsageSetting.findUniqueOrThrow({ where: { id: 1 } }),
    prisma.reservationApiMonthlyUsage.findUnique({ where: { periodStart: period.periodDate } }),
  ]);
  return toUsageDto(setting, usage?.requestCount ?? BigInt(0), period);
}

export async function updateReservationApiUsageLimit(
  prisma: PrismaClient,
  input: {
    monthlyLimit: bigint | null;
    expectedRevision: number;
    actorId: string;
    now?: Date;
  },
): Promise<ReservationApiUsageLimitDto | null> {
  const updated = await prisma.reservationApiUsageSetting.updateMany({
    where: { id: 1, revision: input.expectedRevision },
    data: {
      monthlyLimit: input.monthlyLimit,
      revision: { increment: 1 },
      updatedByUserId: input.actorId,
    },
  });
  if (updated.count !== 1) return null;
  return getReservationApiUsageSnapshot(prisma, input.now);
}

export async function consumeReservationApiRequest(
  transaction: Prisma.TransactionClient,
  input: { keyId: string; keyMonthlyLimit: bigint | null; now: Date },
): Promise<
  | { status: "ALLOWED"; globalRequestCount: bigint; keyRequestCount: bigint }
  | { status: "GLOBAL_LIMIT_EXCEEDED" | "KEY_LIMIT_EXCEEDED"; retryAfterSeconds: number }
> {
  const period = getReservationApiPeriod(input.now);
  const [setting] = await transaction.$queryRaw<LockedUsageSetting[]>(Prisma.sql`
    SELECT "monthlyLimit", "revision"
    FROM "reservation_api_usage_settings"
    WHERE "id" = 1
    FOR UPDATE
  `);
  if (!setting) throw new Error("Reservation API usage setting is missing.");

  await transaction.$executeRaw(Prisma.sql`
    INSERT INTO "reservation_api_monthly_usage" ("periodStart", "requestCount", "updatedAt")
    VALUES (${period.periodDate}, 0, CURRENT_TIMESTAMP)
    ON CONFLICT ("periodStart") DO NOTHING
  `);
  const [usage] = await transaction.$queryRaw<{ requestCount: bigint }[]>(Prisma.sql`
    SELECT "requestCount"
    FROM "reservation_api_monthly_usage"
    WHERE "periodStart" = ${period.periodDate}
    FOR UPDATE
  `);
  if (!usage) throw new Error("Reservation API usage counter is missing.");

  await transaction.$executeRaw(Prisma.sql`
    INSERT INTO "reservation_api_key_monthly_usage" ("apiKeyId", "periodStart", "requestCount", "updatedAt")
    VALUES (${input.keyId}, ${period.periodDate}, 0, CURRENT_TIMESTAMP)
    ON CONFLICT ("apiKeyId", "periodStart") DO NOTHING
  `);
  const [keyUsage] = await transaction.$queryRaw<{ requestCount: bigint }[]>(Prisma.sql`
    SELECT "requestCount"
    FROM "reservation_api_key_monthly_usage"
    WHERE "apiKeyId" = ${input.keyId} AND "periodStart" = ${period.periodDate}
    FOR UPDATE
  `);
  if (!keyUsage) throw new Error("Reservation API key usage counter is missing.");

  await transaction.reservationApiKey.update({
    where: { id: input.keyId },
    data: { lastUsedAt: input.now },
  });

  if (setting.monthlyLimit !== null && usage.requestCount >= setting.monthlyLimit) {
    return {
      status: "GLOBAL_LIMIT_EXCEEDED",
      retryAfterSeconds: Math.max(1, Math.ceil((period.resetsAt.getTime() - input.now.getTime()) / 1000)),
    };
  }

  if (input.keyMonthlyLimit !== null && keyUsage.requestCount >= input.keyMonthlyLimit) {
    return {
      status: "KEY_LIMIT_EXCEEDED",
      retryAfterSeconds: Math.max(1, Math.ceil((period.resetsAt.getTime() - input.now.getTime()) / 1000)),
    };
  }

  const globalRequestCount = usage.requestCount + BigInt(1);
  const keyRequestCount = keyUsage.requestCount + BigInt(1);
  await transaction.reservationApiMonthlyUsage.update({
    where: { periodStart: period.periodDate },
    data: { requestCount: globalRequestCount },
  });
  await transaction.reservationApiKeyMonthlyUsage.update({
    where: {
      apiKeyId_periodStart: { apiKeyId: input.keyId, periodStart: period.periodDate },
    },
    data: { requestCount: keyRequestCount },
  });
  return { status: "ALLOWED", globalRequestCount, keyRequestCount };
}

export function toReservationApiKeyUsageDto(
  monthlyLimit: bigint | null,
  requestCount: bigint,
  now = new Date(),
): ReservationApiKeyUsageDto {
  const period = getReservationApiPeriod(now);
  const remaining = monthlyLimit === null
    ? null
    : (monthlyLimit > requestCount ? monthlyLimit - requestCount : BigInt(0)).toString();
  return {
    mode: monthlyLimit === null ? "UNLIMITED" : "LIMITED",
    monthlyLimit: monthlyLimit?.toString() ?? null,
    periodStart: period.periodStart,
    requestCount: requestCount.toString(),
    remaining,
    resetsAt: period.resetsAt.toISOString(),
  };
}

function toUsageDto(
  setting: { monthlyLimit: bigint | null; revision: number },
  requestCount: bigint,
  period: ReturnType<typeof getReservationApiPeriod>,
): ReservationApiUsageLimitDto {
  const remaining = setting.monthlyLimit === null
    ? null
    : (setting.monthlyLimit > requestCount ? setting.monthlyLimit - requestCount : BigInt(0)).toString();
  return {
    mode: setting.monthlyLimit === null ? "UNLIMITED" : "LIMITED",
    monthlyLimit: setting.monthlyLimit?.toString() ?? null,
    revision: setting.revision,
    periodStart: period.periodStart,
    requestCount: requestCount.toString(),
    remaining,
    resetsAt: period.resetsAt.toISOString(),
  };
}
