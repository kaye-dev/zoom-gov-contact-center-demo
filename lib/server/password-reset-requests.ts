import type { PrismaClient } from "@/lib/generated/prisma/client";

const DUPLICATE_WINDOW_MS = 15 * 60 * 1_000;
const GLOBAL_WINDOW_MS = 5 * 60 * 1_000;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export const PASSWORD_RESET_GLOBAL_WINDOW_LIMIT = 20;
export const PASSWORD_RESET_TOTAL_LIMIT = 1_000;

export type PasswordResetRequestResult =
  | "created"
  | "deduplicated"
  | "rate-limited";

/**
 * Bounds the write and storage cost of the unauthenticated reset-request form.
 * The public API deliberately returns the same success response for every
 * result so callers cannot use throttling to enumerate registered users.
 */
export async function createBoundedPasswordResetRequest(
  prisma: PrismaClient,
  email: string,
  now = new Date(),
): Promise<PasswordResetRequestResult> {
  const duplicateSince = new Date(now.getTime() - DUPLICATE_WINDOW_MS);
  const globalWindowStart = new Date(now.getTime() - GLOBAL_WINDOW_MS);
  const retentionCutoff = new Date(now.getTime() - RETENTION_MS);

  await prisma.passwordResetRequest.deleteMany({
    where: { requestedAt: { lt: retentionCutoff } },
  });

  const [recentDuplicate, recentGlobalCount, totalCount] = await Promise.all([
    prisma.passwordResetRequest.findFirst({
      where: {
        email,
        requestedAt: { gte: duplicateSince },
      },
      select: { id: true },
    }),
    prisma.passwordResetRequest.count({
      where: { requestedAt: { gte: globalWindowStart } },
    }),
    prisma.passwordResetRequest.count(),
  ]);

  if (recentDuplicate) {
    return "deduplicated";
  }

  if (
    recentGlobalCount >= PASSWORD_RESET_GLOBAL_WINDOW_LIMIT ||
    totalCount >= PASSWORD_RESET_TOTAL_LIMIT
  ) {
    return "rate-limited";
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  await prisma.passwordResetRequest.create({
    data: {
      email,
      userId: user?.id,
    },
  });

  return "created";
}
