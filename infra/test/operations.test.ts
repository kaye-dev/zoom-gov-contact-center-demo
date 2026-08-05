import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyMigrationStatus,
  parseOperationEvent,
} from "../functions/operations";

describe("operations Lambda contract", () => {
  it("accepts the three explicit actions", () => {
    for (const action of [
      "migration-status",
      "migration-deploy",
      "seed-admin",
    ]) {
      assert.equal(parseOperationEvent({ action }).action, action);
    }
  });

  it("rejects unknown actions", () => {
    assert.throws(() => parseOperationEvent({ action: "reset" }), /action must be one of/);
  });

  it("classifies only a confirmed pending migration as deployable", () => {
    assert.deepEqual(
      classifyMigrationStatus({
        exitCode: 1,
        stderr: "",
        stdout:
          "Following migration have not yet been applied:\n20260805040000_split_phone_and_chat_settings\n",
      }),
      {
        pendingMigrations: [
          "20260805040000_split_phone_and_chat_settings",
        ],
        status: "pending",
      },
    );
  });

  it("fails closed when pending output has no verifiable migration identifier", () => {
    assert.throws(
      () =>
        classifyMigrationStatus({
          exitCode: 1,
          stdout: "Pending migrations were detected, but the format changed.",
          stderr: "",
        }),
      /no migration identifiers could be verified/,
    );
  });

  it("stops on drift even if output also mentions pending migrations", () => {
    assert.throws(
      () =>
        classifyMigrationStatus({
          exitCode: 1,
          stderr: "Drift detected. A migration has not yet been applied.",
          stdout: "",
        }),
      /Unsafe migration state detected/,
    );
  });

  it("treats zero exit status as up to date", () => {
    assert.deepEqual(
      classifyMigrationStatus({ exitCode: 0, stderr: "", stdout: "" }),
      { pendingMigrations: [], status: "up-to-date" },
    );
  });
});
