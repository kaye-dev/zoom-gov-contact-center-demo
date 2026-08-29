import { cache } from "react";

import type { PrismaClient } from "@/lib/generated/prisma/client";
import type {
  DeveloperApiSecretField,
  DeveloperApiSettingsSnapshot,
  DeveloperApiSettingsUpdate,
} from "@/lib/developer-api-settings";

import {
  assertDeveloperApiEncryptionAvailable,
  decryptDeveloperApiSecret,
  encryptDeveloperApiSecret,
} from "./developer-api-crypto";
import { withPrisma } from "./prisma";

const SETTING_ID = 1;

export const getDeveloperApiSettings = cache(
  async (): Promise<DeveloperApiSettingsSnapshot> =>
    withPrisma(async (prisma) => {
      const row = await prisma.siteDeveloperApiSetting.findUnique({
        where: { id: SETTING_ID },
        select: {
          accountId: true,
          clientId: true,
          clientSecretEncrypted: true,
          secretTokenEncrypted: true,
        },
      });
      return row ? snapshot(row) : emptySnapshot();
    }),
);

export async function saveDeveloperApiSettings(
  prisma: PrismaClient,
  update: DeveloperApiSettingsUpdate,
): Promise<DeveloperApiSettingsSnapshot | null> {
  assertDeveloperApiEncryptionAvailable();
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.siteDeveloperApiSetting.findUnique({
      where: { id: SETTING_ID },
      select: {
        clientSecretEncrypted: true,
        secretTokenEncrypted: true,
      },
    });
    if (
      update.section === "server-to-server-oauth" &&
      !(update.clientSecret || current?.clientSecretEncrypted)
    ) {
      return null;
    }
    if (
      update.section === "webhook-only-app" &&
      !(update.secretToken || current?.secretTokenEncrypted)
    ) {
      return null;
    }

    const clientSecretEncrypted =
      update.section === "server-to-server-oauth" && update.clientSecret
        ? encryptDeveloperApiSecret(update.clientSecret, "clientSecret")
        : undefined;
    const secretTokenEncrypted =
      update.section === "webhook-only-app" && update.secretToken
        ? encryptDeveloperApiSecret(update.secretToken, "secretToken")
        : undefined;
    const saved = await transaction.siteDeveloperApiSetting.upsert({
      where: { id: SETTING_ID },
      create: {
        id: SETTING_ID,
        accountId:
          update.section === "server-to-server-oauth" ? update.accountId : "",
        clientId:
          update.section === "server-to-server-oauth" ? update.clientId : "",
        clientSecretEncrypted: clientSecretEncrypted ?? null,
        secretTokenEncrypted: secretTokenEncrypted ?? null,
      },
      update: {
        ...(update.section === "server-to-server-oauth"
          ? { accountId: update.accountId, clientId: update.clientId }
          : {}),
        ...(clientSecretEncrypted ? { clientSecretEncrypted } : {}),
        ...(secretTokenEncrypted ? { secretTokenEncrypted } : {}),
      },
      select: {
        accountId: true,
        clientId: true,
        clientSecretEncrypted: true,
        secretTokenEncrypted: true,
      },
    });
    return snapshot(saved);
  });
}

export async function revealDeveloperApiSecret(
  prisma: PrismaClient,
  field: DeveloperApiSecretField,
): Promise<string | null> {
  const row =
    field === "clientSecret"
      ? await prisma.siteDeveloperApiSetting.findUnique({
          where: { id: SETTING_ID },
          select: { clientSecretEncrypted: true },
        })
      : await prisma.siteDeveloperApiSetting.findUnique({
          where: { id: SETTING_ID },
          select: { secretTokenEncrypted: true },
        });
  const encrypted =
    field === "clientSecret"
      ? row && "clientSecretEncrypted" in row
        ? row.clientSecretEncrypted
        : null
      : row && "secretTokenEncrypted" in row
        ? row.secretTokenEncrypted
        : null;
  return encrypted === null
    ? null
    : decryptDeveloperApiSecret(encrypted, field);
}

function emptySnapshot(): DeveloperApiSettingsSnapshot {
  return {
    accountId: "",
    clientId: "",
    clientSecretConfigured: false,
    secretTokenConfigured: false,
  };
}

function snapshot(row: {
  accountId: string;
  clientId: string;
  clientSecretEncrypted: string | null;
  secretTokenEncrypted: string | null;
}): DeveloperApiSettingsSnapshot {
  return {
    accountId: row.accountId,
    clientId: row.clientId,
    clientSecretConfigured: row.clientSecretEncrypted !== null,
    secretTokenConfigured: row.secretTokenEncrypted !== null,
  };
}
