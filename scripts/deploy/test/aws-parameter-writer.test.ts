import assert from "node:assert/strict";
import { test } from "node:test";

import { PutParameterCommand } from "@aws-sdk/client-ssm";

import {
  createDeploymentParameterWriter,
  type DeploymentParameterInput,
} from "../lib/aws-parameter-writer";

const input: DeploymentParameterInput = {
  Name: "/zoom-gov-contact-center-demo/production/deploy/vercel-token",
  Description: "Test deployment secret.",
  Type: "SecureString",
  Value: "synthetic-provider-secret-value",
  KeyId:
    "arn:aws:kms:ap-northeast-1:123456789012:key/12345678-1234-1234-1234-123456789012",
  Tier: "Standard",
  Overwrite: false,
};

test("parameter writer sends the value in memory and returns the SSM version", async () => {
  let receivedProfile = "";
  let receivedInput: DeploymentParameterInput | undefined;
  let destroyed = false;
  const writer = createDeploymentParameterWriter("splai-prd", (profile) => {
    receivedProfile = profile;
    return {
      async send(command) {
        assert.ok(command instanceof PutParameterCommand);
        receivedInput = command.input as DeploymentParameterInput;
        return { Version: 7, $metadata: {} };
      },
      destroy() {
        destroyed = true;
      },
    };
  });

  assert.equal(await writer.put(input, "SecureString write"), 7);
  assert.equal(receivedProfile, "splai-prd");
  assert.deepEqual(receivedInput, input);
  writer.destroy();
  assert.equal(destroyed, true);
});

test("parameter writer reports only a validated AWS error code", async () => {
  const secretInSdkMessage = input.Value;
  const writer = createDeploymentParameterWriter("splai-prd", () => ({
    async send() {
      throw Object.assign(new Error(secretInSdkMessage), {
        name: "AccessDeniedException",
      });
    },
    destroy() {},
  }));

  await assert.rejects(
    writer.put(input, "SecureString write"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /SecureString write failed \(AccessDeniedException\)/);
      assert.equal(error.message.includes(secretInSdkMessage), false);
      return true;
    },
  );
});

test("parameter writer rejects invalid versions and unsafe error names", async () => {
  const missingVersion = createDeploymentParameterWriter("splai-prd", () => ({
    async send() {
      return { $metadata: {} };
    },
    destroy() {},
  }));
  await assert.rejects(
    missingVersion.put(input, "SecureString write"),
    /did not return a valid version/,
  );

  const unsafeError = createDeploymentParameterWriter("splai-prd", () => ({
    async send() {
      throw { name: "bad code: leaked detail" };
    },
    destroy() {},
  }));
  await assert.rejects(
    unsafeError.put(input, "SecureString write"),
    /failed \(UnknownAwsError\)/,
  );
});
