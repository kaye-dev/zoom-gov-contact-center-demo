import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const runnerModulePromise = import(
  pathToFileURL(
    path.resolve(import.meta.dirname, "../.agents/skills/plan/scripts/parity-runner.mjs"),
  ).href,
);
const revisionModulePromise = import(
  pathToFileURL(
    path.resolve(import.meta.dirname, "../.agents/skills/plan/scripts/prototype-revision.mjs"),
  ).href,
);

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function temporaryRepository(context: { after(callback: () => Promise<void>): void }) {
  const temporary = await mkdtemp(path.join(tmpdir(), "parity-runner-security-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const root = await realpath(temporary);
  await mkdir(path.join(root, "plans", "fixture"), { recursive: true });
  return root;
}

async function createCliFixture(
  context: { after(callback: () => Promise<void>): void },
  runId: string,
) {
  const root = await temporaryRepository(context);
  const prototypeRoot = path.join(root, "plans", "fixture", "prototype");
  await mkdir(prototypeRoot);
  await mkdir(path.join(root, "src"));
  await mkdir(path.join(root, ".codex"), { mode: 0o700 });
  await chmod(path.join(root, ".codex"), 0o700);
  await writeFile(path.join(root, "src", "ui.ts"), "export const fixture = true;\n");
  await writeFile(path.join(prototypeRoot, "index.html"), "<!doctype html><main>fixture</main>\n");

  const viewports = [
    ["mobile", "390x844"],
    ["desktop", "1280x800"],
  ];
  const parityMatrix = viewports.flatMap(([breakpoint, viewport]) =>
    ["light", "dark"].map((theme) => ({
      id: `main-default-${breakpoint}-${theme}`,
      targetId: "main",
      entry: "index.html",
      route: "/fixture",
      surface: "page",
      state: "default",
      viewport,
      theme,
      breakpoint,
      expectedInvariantIds: ["inv-shell"],
      intentionalDifferenceIds: [],
    })),
  );
  const contract = {
    version: 1,
    productionBaseline: {
      sources: ["src/ui.ts"],
      runtimeOwner: "fixture-runtime",
      checkout: root,
      commit: "1".repeat(40),
      route: "/fixture",
    },
    comparisonConditions: {
      viewports: viewports.map(([, viewport]) => viewport),
      dpr: 1,
      scroll: { x: 0, y: 0 },
      locale: "ja",
      themes: ["light", "dark"],
      fixture: "fixture-a",
      authorization: "admin",
      query: "theme",
    },
    baselineStateInventory: ["default"],
    themeContract: ["light", "dark"],
    responsiveContract: viewports.map(([id, viewport]) => ({ id, viewport })),
    visualInvariants: [{ id: "inv-shell", description: "same shell" }],
    intentionalDifferences: [],
    stateAndInteraction: ["keyboard", "focus"],
    comparisonTargets: [{ id: "main", entry: "index.html", route: "/fixture", surface: "page" }],
    parityMatrix,
  };
  const spec = {
    version: 2,
    stateSetups: [{
      targetId: "main",
      state: "default",
      production: { query: {}, actions: [] },
      prototype: { query: {}, actions: [] },
    }],
    browserSetups: [{
      targetId: "main",
      production: { type: "query", parameter: "theme" },
      prototype: { type: "query", parameter: "theme" },
    }],
    probes: [{
      id: "dom-main",
      kind: "dom",
      mode: "equal",
      productionSelector: "main",
      prototypeSelector: "main",
      required: true,
      options: {},
    }],
    rowProbeMap: parityMatrix.map(({ id }) => ({ rowId: id, probeIds: ["dom-main"] })),
  };
  const contractText = `${JSON.stringify(contract, null, 2)}\n`;
  const specText = `${JSON.stringify(spec, null, 2)}\n`;
  const goalText = "# CLI security fixture\n";
  await writeFile(path.join(prototypeRoot, "ui-contract.json"), contractText);
  await writeFile(path.join(prototypeRoot, "parity-spec.json"), specText);
  await writeFile(path.join(root, "plans", "fixture", "goal.md"), goalText);

  const [runner, revisionModule] = await Promise.all([runnerModulePromise, revisionModulePromise]);
  const prototypeRevision = await revisionModule.prototypeRevisionInRepository(
    "plans/fixture/prototype",
    root,
  );
  const approval = runner.createApprovalEvidence({
    runId,
    goalSha256: sha256(goalText),
    prototypeRevision,
    validationProfileDigest: sha256(specText),
    invokedAt: "2026-09-01T00:00:00.000Z",
  });
  const approvalPath = await runner.writeRunEvidence({
    repositoryRootPath: root,
    slug: "fixture",
    runId,
    name: "approval.json",
    evidence: approval,
  });
  return { root, runner, approvalPath: path.join(root, approvalPath) };
}

function prepareArguments(runId: string, root: string, owner = "fixture-runtime") {
  return [
    "prepare-run",
    "plans/fixture/prototype",
    "--run-id", runId,
    "--production-url", "http://localhost:3142/",
    "--prototype-url", "http://127.0.0.1:4142/",
    "--runtime-owner", owner,
    "--runtime-checkout", root,
    "--target", "main",
    "--state", "default",
    "--viewport", "390x844",
    "--matrix-scope", "targeted",
  ];
}

test("EVIDENCE-SEC-01 canonical evidence uses exact private modes independent of umask", async (context) => {
  const root = await temporaryRepository(context);
  const runner = await runnerModulePromise;
  const originalUmask = process.umask(0o777);
  let relativePath;
  try {
    relativePath = await runner.writeRunEvidence({
      repositoryRootPath: root,
      slug: "fixture",
      runId: "private-run",
      name: "approval.json",
      evidence: { schemaVersion: 1 },
    });
  } finally {
    process.umask(originalUmask);
  }

  const target = path.join(root, relativePath);
  assert.equal((await stat(path.join(root, "plans", "fixture", "evidence"))).mode & 0o7777, 0o700);
  assert.equal((await stat(path.dirname(target))).mode & 0o7777, 0o700);
  assert.equal((await stat(target)).mode & 0o7777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(target, "utf8")), { schemaVersion: 1 });
});

test("EVIDENCE-SEC-02 existing symlink and permissive evidence paths fail closed", async (context) => {
  const runner = await runnerModulePromise;

  const permissiveRoot = await temporaryRepository(context);
  const evidenceRoot = path.join(permissiveRoot, "plans", "fixture", "evidence");
  await mkdir(evidenceRoot, { mode: 0o755 });
  await chmod(evidenceRoot, 0o755);
  await assert.rejects(
    runner.writeRunEvidence({
      repositoryRootPath: permissiveRoot,
      slug: "fixture",
      runId: "mode-run",
      name: "approval.json",
      evidence: {},
    }),
    /evidence root must have mode 0700/u,
  );

  const symlinkRoot = await temporaryRepository(context);
  const outside = path.join(symlinkRoot, "outside-evidence");
  await mkdir(outside, { mode: 0o700 });
  await symlink(outside, path.join(symlinkRoot, "plans", "fixture", "evidence"));
  await assert.rejects(
    runner.writeRunEvidence({
      repositoryRootPath: symlinkRoot,
      slug: "fixture",
      runId: "symlink-run",
      name: "approval.json",
      evidence: {},
    }),
    /evidence root must be a real directory/u,
  );

  const permissiveRun = await temporaryRepository(context);
  const privateEvidenceRoot = path.join(permissiveRun, "plans", "fixture", "evidence");
  await mkdir(privateEvidenceRoot, { mode: 0o700 });
  await chmod(privateEvidenceRoot, 0o700);
  await mkdir(path.join(privateEvidenceRoot, "mode-run"), { mode: 0o755 });
  await chmod(path.join(privateEvidenceRoot, "mode-run"), 0o755);
  await assert.rejects(
    runner.writeRunEvidence({
      repositoryRootPath: permissiveRun,
      slug: "fixture",
      runId: "mode-run",
      name: "approval.json",
      evidence: {},
    }),
    /run evidence directory must have mode 0700/u,
  );
});

test("EVIDENCE-SEC-03 prepare-run rejects insecure approval and unbound runtime declarations", async (context) => {
  const insecure = await createCliFixture(context, "insecure-approval");
  await chmod(insecure.approvalPath, 0o644);
  await assert.rejects(
    insecure.runner.runCli({
      argv: prepareArguments("insecure-approval", insecure.root),
      repositoryRootPath: insecure.root,
      stdout: { write() { return true; } },
    }),
    /approval\.json must have mode 0600/u,
  );
  await assert.rejects(access(path.join(insecure.root, ".codex", "parity-runs", "insecure-approval")));

  const symlinkApproval = await createCliFixture(context, "symlink-approval");
  const outsideApproval = path.join(symlinkApproval.root, "outside-approval.json");
  await writeFile(outsideApproval, "{}\n", { mode: 0o600 });
  await chmod(outsideApproval, 0o600);
  await rm(symlinkApproval.approvalPath);
  await symlink(outsideApproval, symlinkApproval.approvalPath);
  await assert.rejects(
    symlinkApproval.runner.runCli({
      argv: prepareArguments("symlink-approval", symlinkApproval.root),
      repositoryRootPath: symlinkApproval.root,
      stdout: { write() { return true; } },
    }),
    /approval\.json must be a regular file/u,
  );
  await assert.rejects(access(path.join(symlinkApproval.root, ".codex", "parity-runs", "symlink-approval")));

  const wrongOwner = await createCliFixture(context, "wrong-owner");
  await assert.rejects(
    wrongOwner.runner.runCli({
      argv: prepareArguments("wrong-owner", wrongOwner.root, "self-asserted-owner"),
      repositoryRootPath: wrongOwner.root,
      stdout: { write() { return true; } },
    }),
    /binds externally read-back metadata and is not live runtime verification/u,
  );
  await assert.rejects(access(path.join(wrongOwner.root, ".codex", "parity-runs", "wrong-owner")));

  const wrongCheckout = await createCliFixture(context, "wrong-checkout");
  const otherCheckout = await mkdtemp(path.join(tmpdir(), "parity-runner-other-checkout-"));
  context.after(() => rm(otherCheckout, { recursive: true, force: true }));
  const argumentsWithWrongCheckout = prepareArguments("wrong-checkout", wrongCheckout.root);
  argumentsWithWrongCheckout[argumentsWithWrongCheckout.indexOf("--runtime-checkout") + 1] = otherCheckout;
  await assert.rejects(
    wrongCheckout.runner.runCli({
      argv: argumentsWithWrongCheckout,
      repositoryRootPath: wrongCheckout.root,
      stdout: { write() { return true; } },
    }),
    /must resolve to the current repository checkout/u,
  );
  await assert.rejects(access(path.join(wrongCheckout.root, ".codex", "parity-runs", "wrong-checkout")));
});
