import { createHash } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";
import { canonicalJson, OutreachContractError } from "@/lib/zaad/outreach-contracts";
export const digest = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
export const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export function databaseError(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && ["P2002", "P2034"].includes(String(error.code))) throw new OutreachContractError("VERSION_CONFLICT", 409);
  throw error;
}
