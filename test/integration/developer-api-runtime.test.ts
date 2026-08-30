import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import type { PrismaClient } from "../../lib/generated/prisma/client";
import { saveDeveloperApiSettings } from "../../lib/server/developer-api-settings";

test("Developer API sections save independently and preserve the other ciphertext", async () => {
  const previous = process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY;
  process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  let row: {
    accountId: string;
    clientId: string;
    clientSecretEncrypted: string | null;
    secretTokenEncrypted: string | null;
  } | null = null;
  const model = {
    async findUnique() {
      return row;
    },
    async upsert(args: { create: typeof row; update: Partial<NonNullable<typeof row>> }) {
      row = row ? { ...row, ...args.update } : args.create;
      return row;
    },
  };
  const prisma = {
    siteDeveloperApiSetting: model,
    async $transaction(operation: (transaction: unknown) => unknown) {
      return operation({ siteDeveloperApiSetting: model });
    },
  } as unknown as PrismaClient;

  try {
    assert.equal(await saveDeveloperApiSettings(prisma, {
      section: "server-to-server-oauth",
      accountId: "a",
      clientId: "c",
    }), null);
    const first = await saveDeveloperApiSettings(prisma, {
      section: "server-to-server-oauth",
      accountId: "a",
      clientId: "c",
      clientSecret: "client-secret-plain",
    });
    assert.deepEqual(first, {
      accountId: "a",
      clientId: "c",
      clientSecretConfigured: true,
      secretTokenConfigured: false,
    });
    const clientCiphertext = row!.clientSecretEncrypted;
    assert.equal(clientCiphertext?.includes("client-secret-plain"), false);

    const webhook = await saveDeveloperApiSettings(prisma, {
      section: "webhook-only-app",
      secretToken: "secret-token-plain",
    });
    assert.equal(webhook?.secretTokenConfigured, true);
    const tokenCiphertext = row!.secretTokenEncrypted;
    assert.equal(tokenCiphertext?.includes("secret-token-plain"), false);

    await saveDeveloperApiSettings(prisma, {
      section: "server-to-server-oauth",
      accountId: "a2",
      clientId: "c2",
    });
    assert.equal(row!.clientSecretEncrypted, clientCiphertext);
    assert.equal(row!.secretTokenEncrypted, tokenCiphertext);

    row = null;
    const webhookFirst = await saveDeveloperApiSettings(prisma, {
      section: "webhook-only-app",
      secretToken: "webhook-first",
    });
    assert.deepEqual(webhookFirst, {
      accountId: "",
      clientId: "",
      clientSecretConfigured: false,
      secretTokenConfigured: true,
    });
  } finally {
    if (previous === undefined) delete process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY;
    else process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY = previous;
  }
});
