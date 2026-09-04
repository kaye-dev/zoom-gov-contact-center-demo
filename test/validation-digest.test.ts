import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const digestModulePromise = import(pathToFileURL(path.resolve(import.meta.dirname, "../scripts/validation-digest.mjs")).href);
const stateChangedCode = "VALIDATION_DIGEST_STATE_CHANGED";
const limitExceededCode = "VALIDATION_DIGEST_LIMIT_EXCEEDED";

async function assertStateChanged(operation: Promise<unknown>) {
  await assert.rejects(operation, (error: unknown) =>
    error instanceof Error &&
    error.message === stateChangedCode &&
    (error as Error & { code?: string }).code === stateChangedCode);
}

async function assertLimitExceeded(operation: Promise<unknown>) {
  await assert.rejects(operation, (error: unknown) =>
    error instanceof Error &&
    error.message === limitExceededCode &&
    (error as Error & { code?: string }).code === limitExceededCode);
}

async function initializeRepository(root: string) {
  await execFileAsync("git", ["init", "-q", root]);
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src", "tracked.ts"), "export const value = 1;\n");
  await execFileAsync("git", ["-C", root, "add", "."]);
  await execFileAsync("git", [
    "-C", root,
    "-c", "user.name=Test",
    "-c", "user.email=test@example.com",
    "commit", "-qm", "initial",
  ]);
}

test("validated diff digestはindex遷移では変わらず内容変更とscope変更だけで変わる", async (context) => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "validation-digest-")));
  context.after(() => rm(root, { recursive: true, force: true }));
  await execFileAsync("git", ["init", "-q", root]);
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src", "tracked.ts"), "export const value = 1;\n");
  await writeFile(path.join(root, "unrelated.ts"), "export const unrelated = 1;\n");
  await execFileAsync("git", ["-C", root, "add", "src/tracked.ts", "unrelated.ts"]);
  await execFileAsync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]);
  await writeFile(path.join(root, "src", "tracked.ts"), "export const value = 2;\n");
  await writeFile(path.join(root, "src", "new.ts"), "export const added = true;\n");
  await writeFile(path.join(root, "unrelated.ts"), "export const unrelated = 2;\n");
  const { createValidationDigest } = await digestModulePromise;
  const beforeStage = await createValidationDigest({ repository: root, scopes: ["src"] });
  await execFileAsync("git", ["-C", root, "add", "--", "src/tracked.ts", "src/new.ts"]);
  const afterStage = await createValidationDigest({ repository: root, scopes: ["src"] });
  assert.equal(afterStage.validatedDiffDigest, beforeStage.validatedDiffDigest);
  assert.notEqual(afterStage.stagedPatchDigest, beforeStage.stagedPatchDigest);
  assert.deepEqual(afterStage.mixedPaths, []);
  assert.deepEqual(afterStage.changedPaths, ["src/new.ts", "src/tracked.ts"]);

  await writeFile(path.join(root, "src", "tracked.ts"), "export const value = 3;\n");
  const afterEdit = await createValidationDigest({ repository: root, scopes: ["src"] });
  assert.notEqual(afterEdit.validatedDiffDigest, afterStage.validatedDiffDigest);
  assert.equal(afterEdit.scopeDigest, afterStage.scopeDigest);
  assert.doesNotMatch(JSON.stringify(afterEdit), /unrelated\.ts/u);

  await writeFile(path.join(root, "src", "tracked.ts"), "export const value = 1;\n");
  const stagedV2 = await createValidationDigest({ repository: root, scopes: ["src"] });
  assert.deepEqual(stagedV2.mixedPaths, ["src/tracked.ts"]);
  await writeFile(path.join(root, "src", "tracked.ts"), "export const value = 3;\n");
  await execFileAsync("git", ["-C", root, "add", "--", "src/tracked.ts"]);
  await writeFile(path.join(root, "src", "tracked.ts"), "export const value = 1;\n");
  const stagedV3 = await createValidationDigest({ repository: root, scopes: ["src"] });
  assert.deepEqual(stagedV3.changedPaths, stagedV2.changedPaths);
  assert.deepEqual(stagedV3.mixedPaths, stagedV2.mixedPaths);
  assert.notEqual(stagedV3.mixedStagedPatchDigest, stagedV2.mixedStagedPatchDigest);
  assert.notEqual(stagedV3.validatedDiffDigest, stagedV2.validatedDiffDigest);
});

test("Git状態がsnapshot作成中にedit、stage、commitで変化した場合はfail-closedになる", async (context) => {
  const { createValidationDigest } = await digestModulePromise;
  for (const mutation of ["edit", "stage", "commit"] as const) {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), `validation-digest-${mutation}-`)));
    context.after(() => rm(root, { recursive: true, force: true }));
    await initializeRepository(root);
    await writeFile(path.join(root, "src", "tracked.ts"), "export const value = 2;\n");
    if (mutation === "commit") await execFileAsync("git", ["-C", root, "add", "src/tracked.ts"]);

    await assertStateChanged(createValidationDigest({
      repository: root,
      scopes: ["src"],
      testHooks: {
        afterInitialGitState: async () => {
          if (mutation === "edit") {
            await writeFile(path.join(root, "src", "tracked.ts"), "export const value = 3;\n");
          } else if (mutation === "stage") {
            await execFileAsync("git", ["-C", root, "add", "src/tracked.ts"]);
          } else {
            await execFileAsync("git", [
              "-C", root,
              "-c", "user.name=Test",
              "-c", "user.email=test@example.com",
              "commit", "-qm", "concurrent commit",
            ]);
          }
        },
      },
    }));
  }
});

test("最初のpath再検証後にedit、stage、commitが発生してもfinal Git snapshotで拒否する", async (context) => {
  const { createValidationDigest } = await digestModulePromise;
  for (const mutation of ["edit", "stage", "commit"] as const) {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), `validation-digest-final-${mutation}-`)));
    context.after(() => rm(root, { recursive: true, force: true }));
    await initializeRepository(root);
    await writeFile(path.join(root, "src", "tracked.ts"), "export const value = 2;\n");
    if (mutation === "commit") await execFileAsync("git", ["-C", root, "add", "src/tracked.ts"]);

    await assertStateChanged(createValidationDigest({
      repository: root,
      scopes: ["src"],
      testHooks: {
        afterFirstPathRevalidation: async () => {
          if (mutation === "edit") {
            await writeFile(path.join(root, "src", "tracked.ts"), "export const value = 3;\n");
          } else if (mutation === "stage") {
            await execFileAsync("git", ["-C", root, "add", "src/tracked.ts"]);
          } else {
            await execFileAsync("git", [
              "-C", root,
              "-c", "user.name=Test",
              "-c", "user.email=test@example.com",
              "commit", "-qm", "concurrent final commit",
            ]);
          }
        },
      },
    }));
  }
});

test("file内容がFD読取り中に変化した場合はfail-closedになる", async (context) => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "validation-digest-file-race-")));
  context.after(() => rm(root, { recursive: true, force: true }));
  await initializeRepository(root);
  await writeFile(path.join(root, "src", "tracked.ts"), "export const value = 2;\n");
  const { createValidationDigest } = await digestModulePromise;
  let mutated = false;

  await assertStateChanged(createValidationDigest({
    repository: root,
    scopes: ["src"],
    testHooks: {
      afterPathContentRead: async ({ path: changedPath, type }: { path: string; type: string }) => {
        if (!mutated && changedPath === "src/tracked.ts" && type === "file") {
          mutated = true;
          await writeFile(path.join(root, changedPath), "export const value = 3;\n");
        }
      },
    },
  }));
});

test("symlinkのリンク文字列が読取り中に置換された場合はfail-closedになる", async (context) => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "validation-digest-symlink-race-")));
  context.after(() => rm(root, { recursive: true, force: true }));
  await initializeRepository(root);
  const linkPath = path.join(root, "src", "link.ts");
  await symlink("target-a", linkPath);
  await execFileAsync("git", ["-C", root, "add", "src/link.ts"]);
  await execFileAsync("git", [
    "-C", root,
    "-c", "user.name=Test",
    "-c", "user.email=test@example.com",
    "commit", "-qm", "add symlink",
  ]);
  await unlink(linkPath);
  await symlink("target-b", linkPath);
  const { createValidationDigest } = await digestModulePromise;

  await assertStateChanged(createValidationDigest({
    repository: root,
    scopes: ["src"],
    testHooks: {
      afterPathContentRead: async ({ path: changedPath, type }: { path: string; type: string }) => {
        if (changedPath === "src/link.ts" && type === "symlink") {
          await unlink(linkPath);
          await symlink("target-c", linkPath);
        }
      },
    },
  }));
});

test("untracked fileが最初のpath再検証後に変化した場合も二度目のpath再検証でfail-closedになる", async (context) => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "validation-digest-untracked-race-")));
  context.after(() => rm(root, { recursive: true, force: true }));
  await initializeRepository(root);
  const untrackedPath = path.join(root, "src", "untracked.ts");
  await writeFile(untrackedPath, "export const value = 1;\n");
  const { createValidationDigest } = await digestModulePromise;

  await assertStateChanged(createValidationDigest({
    repository: root,
    scopes: ["src"],
    testHooks: {
      afterFirstPathRevalidation: async () => {
        await writeFile(untrackedPath, "export const value = 2;\n");
      },
    },
  }));
});

test("chunk hashingは境界をまたぐ内容変更をdigestへ反映する", async (context) => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "validation-digest-chunked-")));
  context.after(() => rm(root, { recursive: true, force: true }));
  await initializeRepository(root);
  const untrackedPath = path.join(root, "src", "chunked.bin");
  const beforeContent = Buffer.alloc(70 * 1024, 0x61);
  await writeFile(untrackedPath, beforeContent);
  const { createValidationDigest } = await digestModulePromise;
  const before = await createValidationDigest({ repository: root, scopes: ["src"] });
  beforeContent[beforeContent.length - 1] = 0x62;
  await writeFile(untrackedPath, beforeContent);
  const after = await createValidationDigest({ repository: root, scopes: ["src"] });

  assert.notEqual(after.untrackedDigest, before.untrackedDigest);
  assert.notEqual(after.validatedDiffDigest, before.validatedDiffDigest);
});

test("file数、単一file、合計byteのsnapshot budget超過をstable codeで拒否する", async (context) => {
  const { createValidationDigest } = await digestModulePromise;

  await context.test("単一の巨大untracked file", async (subcontext) => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "validation-digest-file-limit-")));
    subcontext.after(() => rm(root, { recursive: true, force: true }));
    await initializeRepository(root);
    await writeFile(path.join(root, "src", "large.bin"), Buffer.alloc(17, 0x61));
    await assertLimitExceeded(createValidationDigest({
      repository: root,
      scopes: ["src"],
      testHooks: { snapshotLimits: { maxFiles: 10, maxFileBytes: 16, maxTotalBytes: 32 } },
    }));
  });

  await context.test("多数のchanged file", async (subcontext) => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "validation-digest-count-limit-")));
    subcontext.after(() => rm(root, { recursive: true, force: true }));
    await initializeRepository(root);
    await Promise.all(["a", "b", "c"].map((name) =>
      writeFile(path.join(root, "src", `${name}.txt`), name)));
    await assertLimitExceeded(createValidationDigest({
      repository: root,
      scopes: ["src"],
      testHooks: { snapshotLimits: { maxFiles: 2, maxFileBytes: 16, maxTotalBytes: 32 } },
    }));
  });

  await context.test("複数fileの合計byte", async (subcontext) => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "validation-digest-total-limit-")));
    subcontext.after(() => rm(root, { recursive: true, force: true }));
    await initializeRepository(root);
    await writeFile(path.join(root, "src", "a.txt"), Buffer.alloc(12, 0x61));
    await writeFile(path.join(root, "src", "b.txt"), Buffer.alloc(12, 0x62));
    await assertLimitExceeded(createValidationDigest({
      repository: root,
      scopes: ["src"],
      testHooks: { snapshotLimits: { maxFiles: 10, maxFileBytes: 16, maxTotalBytes: 20 } },
    }));
  });
});
