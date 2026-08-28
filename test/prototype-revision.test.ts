import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceScript = path.join(
  repositoryRoot,
  ".agents/skills/plan/scripts/prototype-revision.mjs",
);

interface RepositoryFixture {
  root: string;
  script: string;
}

type PrototypeEntry = readonly [relative: string, contents: string | Buffer];

const defaultContractObject = {
  version: 1,
  productionBaseline: {
    route: "/fixture",
    sources: ["src/ui.ts"],
    runtimeOwner: "fixture runtime",
    checkout: "fixture checkout",
    commit: "1111111111111111111111111111111111111111",
  },
  comparisonConditions: {
    viewports: ["1280x800", "390x844"],
    dpr: 1,
    scroll: { x: 0, y: 0 },
    locale: "ja",
    themes: ["light", "dark"],
    fixture: "fixture-a",
    authorization: "admin fixture",
    query: "none",
  },
  baselineStateInventory: ["default"],
  themeContract: ["light", "dark"],
  responsiveContract: [
    { id: "desktop", viewport: "1280x800" },
    { id: "mobile", viewport: "390x844" },
  ],
  visualInvariants: [
    { id: "inv-shell", description: "shared shell remains unchanged" },
  ],
  intentionalDifferences: [],
  stateAndInteraction: ["keyboard", "focus"],
  comparisonTargets: [
    { id: "main", entry: "index.html", route: "/fixture", surface: "page" },
  ],
  parityMatrix: ["desktop", "mobile"].flatMap((breakpoint) =>
    ["light", "dark"].map((theme) => ({
      id: `main-default-${breakpoint}-${theme}`,
      targetId: "main",
      entry: "index.html",
      route: "/fixture",
      surface: "page",
      state: "default",
      viewport: breakpoint === "desktop" ? "1280x800" : "390x844",
      theme,
      breakpoint,
      expectedInvariantIds: ["inv-shell"],
      intentionalDifferenceIds: [],
    })),
  ),
};

const defaultUiContract = `${JSON.stringify(defaultContractObject, null, 2)}\n`;

async function createRepositoryFixture(context: test.TestContext): Promise<RepositoryFixture> {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "prototype-revision-"));
  const root = await realpath(temporaryRoot);
  const script = path.join(root, ".agents/skills/plan/scripts/prototype-revision.mjs");
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.dirname(script), { recursive: true });
  await copyFile(sourceScript, script);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src/ui.ts"), "export const ui = true;\n");
  return { root, script };
}

async function createPrototype(
  fixture: RepositoryFixture,
  slug: string,
  entries: readonly PrototypeEntry[],
) {
  const relative = `plans/${slug}/prototype`;
  const absolute = path.join(fixture.root, relative);
  await mkdir(absolute, { recursive: true });
  if (!entries.some(([entry]) => entry === "ui-contract.json")) {
    await writeFile(path.join(absolute, "ui-contract.json"), defaultUiContract);
  }
  for (const [entry, contents] of entries) {
    const target = path.join(absolute, entry);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  return { absolute, relative };
}

function runRevision(
  fixture: RepositoryFixture,
  args: string[],
  cwd = fixture.root,
) {
  return spawnSync(process.execPath, [fixture.script, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 10_000,
  });
}

function revisionFrom(result: ReturnType<typeof runRevision>) {
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^sha256:[0-9a-f]{64}\n$/u);
  assert.equal(result.stderr, "");
  return result.stdout.trim();
}

function assertRejected(result: ReturnType<typeof runRevision>, pattern: RegExp) {
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, pattern);
}

const representativeEntries = [
  ["index.html", "<!doctype html><title>Prototype</title>\n"],
  ["styles.css", "body { color: black; }\n"],
  ["app.js", "document.documentElement.dataset.ready = 'true';\n"],
  ["assets/icon.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n"],
  ["assets/pixel.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])],
] as const satisfies readonly PrototypeEntry[];

test("relative POSIX pathとcontentをframe化しstyles.cssを含むrevisionを決定する", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const prototype = await createPrototype(fixture, "content-change", representativeEntries);
  const otherCwd = await mkdtemp(path.join(tmpdir(), "prototype-revision-cwd-"));
  context.after(() => rm(otherCwd, { recursive: true, force: true }));

  const first = revisionFrom(runRevision(fixture, [prototype.relative], otherCwd));
  assert.equal(
    first,
    "sha256:aeb0a539aea9a1310701227c34537524d401ec1dd8ec16db07b3495272b877c3",
  );
  const repeated = revisionFrom(runRevision(fixture, [prototype.relative]));
  assert.equal(repeated, first);
  const absolute = revisionFrom(runRevision(fixture, [prototype.absolute]));
  assert.equal(absolute, first);

  await writeFile(path.join(prototype.absolute, "styles.css"), "body { color: white; }\n");
  const changed = revisionFrom(runRevision(fixture, [prototype.relative]));
  assert.notEqual(changed, first);
});

test("同じcontentでもrelative file nameが変わればrevisionが変わる", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const prototype = await createPrototype(fixture, "file-name-change", representativeEntries);
  const before = revisionFrom(runRevision(fixture, [prototype.relative]));

  await rename(
    path.join(prototype.absolute, "app.js"),
    path.join(prototype.absolute, "renamed.js"),
  );

  const after = revisionFrom(runRevision(fixture, [prototype.relative]));
  assert.notEqual(after, before);
});

test("directory entryの作成順に依存しない", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const forward = await createPrototype(fixture, "order-forward", representativeEntries);
  const reverse = await createPrototype(fixture, "order-reverse", [...representativeEntries].reverse());

  assert.equal(
    revisionFrom(runRevision(fixture, [forward.relative])),
    revisionFrom(runRevision(fixture, [reverse.relative])),
  );
});

test("approval対象のui-contract.jsonをrevisionへ含める", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const prototype = await createPrototype(fixture, "contract-change", representativeEntries);
  const before = revisionFrom(runRevision(fixture, [prototype.relative]));
  const contract = JSON.parse(defaultUiContract);
  contract.comparisonConditions.scroll = { x: 0, y: 240 };
  await writeFile(
    path.join(prototype.absolute, "ui-contract.json"),
    `${JSON.stringify(contract, null, 2)}\n`,
  );

  const after = revisionFrom(runRevision(fixture, [prototype.relative]));
  assert.notEqual(after, before);
});

test("ui-contract.jsonの欠落、不正schema、evidence混入を拒否する", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const prototype = await createPrototype(fixture, "invalid-contract", [
    ["index.html", "<!doctype html>\n"],
  ]);
  const contractPath = path.join(prototype.absolute, "ui-contract.json");

  await unlink(contractPath);
  assertRejected(runRevision(fixture, [prototype.relative]), /ui-contract\.json/i);

  await writeFile(contractPath, "{not-json}\n");
  assertRejected(runRevision(fixture, [prototype.relative]), /valid JSON/i);

  await writeFile(contractPath, `${JSON.stringify({ version: 1 })}\n`);
  assertRejected(runRevision(fixture, [prototype.relative]), /must contain exactly/i);

  const contract = JSON.parse(defaultUiContract);
  contract.uiApproval = "approved";
  await writeFile(contractPath, `${JSON.stringify(contract)}\n`);
  assertRejected(runRevision(fixture, [prototype.relative]), /must not contain revision or evidence/i);
});

test("ui-contract.jsonの型、参照、matrix coverageを厳密に検証する", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const prototype = await createPrototype(fixture, "contract-schema", [
    ["index.html", "<!doctype html>\n"],
    ["other.html", "<!doctype html>\n"],
  ]);
  const contractPath = path.join(prototype.absolute, "ui-contract.json");
  const baseline = JSON.parse(defaultUiContract);
  const invalidContracts: Array<[unknown, RegExp]> = [
    [
      { ...baseline, productionBaseline: { ...baseline.productionBaseline, evidence: "mutable" } },
      /productionBaseline.*no other keys/i,
    ],
    [
      { ...baseline, productionBaseline: { ...baseline.productionBaseline, commit: "main" } },
      /full lowercase 40-character Git commit SHA/i,
    ],
    [
      {
        ...baseline,
        productionBaseline: {
          source: "src/ui.ts",
          runtimeOwner: baseline.productionBaseline.runtimeOwner,
          checkout: baseline.productionBaseline.checkout,
          commit: baseline.productionBaseline.commit,
          route: baseline.productionBaseline.route,
        },
      },
      /must contain sources, runtimeOwner, checkout, commit, route/i,
    ],
    [
      { ...baseline, productionBaseline: { ...baseline.productionBaseline, sources: [] } },
      /productionBaseline\.sources must be a non-empty array/i,
    ],
    [
      {
        ...baseline,
        productionBaseline: {
          ...baseline.productionBaseline,
          sources: ["src/ui.ts", "src/ui.ts"],
        },
      },
      /productionBaseline\.sources must not contain duplicates/i,
    ],
    [
      {
        ...baseline,
        productionBaseline: {
          ...baseline.productionBaseline,
          sources: ["src/ui.ts", "src/missing.ts"],
        },
      },
      /productionBaseline\.sources\[1\] does not exist: src\/missing\.ts/i,
    ],
    [
      { ...baseline, productionBaseline: { ...baseline.productionBaseline, route: "/a/../fixture" } },
      /canonical origin-relative route/i,
    ],
    [
      {
        ...baseline,
        productionBaseline: {
          ...baseline.productionBaseline,
          url: "https://user:secret@example.test/fixture",
        },
      },
      /absolute HTTP\(S\) URL without credentials/i,
    ],
    [
      {
        ...baseline,
        productionBaseline: {
          ...baseline.productionBaseline,
          url: "https://example.test/different",
        },
      },
      /must match route/i,
    ],
    [{ ...baseline, baselineStateInventory: [] }, /baselineStateInventory.*non-empty array/i],
    [{ ...baseline, themeContract: "light" }, /themeContract.*non-empty array/i],
    [
      {
        ...baseline,
        comparisonConditions: { ...baseline.comparisonConditions, scroll: 0 },
      },
      /scroll must be an object/i,
    ],
    [
      {
        ...baseline,
        comparisonConditions: { ...baseline.comparisonConditions, scroll: { x: 0 } },
      },
      /scroll must contain exactly: x, y/i,
    ],
    [
      {
        ...baseline,
        comparisonConditions: {
          ...baseline.comparisonConditions,
          scroll: { x: 0, y: 0, z: 0 },
        },
      },
      /scroll must contain exactly: x, y/i,
    ],
    [
      {
        ...baseline,
        comparisonConditions: { ...baseline.comparisonConditions, scroll: { x: "0", y: 0 } },
      },
      /scroll\.x.*non-negative finite number/i,
    ],
    [
      {
        ...baseline,
        comparisonConditions: { ...baseline.comparisonConditions, scroll: { x: 0, y: -1 } },
      },
      /scroll\.y.*non-negative finite number/i,
    ],
    [
      {
        ...baseline,
        comparisonConditions: { ...baseline.comparisonConditions, viewports: ["1280×800"] },
      },
      /viewport.*<width>x<height>/i,
    ],
    [
      {
        ...baseline,
        visualInvariants: [{ id: "", description: "empty ID" }],
      },
      /visualInvariants\[0\]\.id.*non-empty/i,
    ],
    [
      {
        ...baseline,
        responsiveContract: [{ id: "desktop", viewport: "800x600" }],
      },
      /viewport is not declared/i,
    ],
    [
      {
        ...baseline,
        parityMatrix: [
          { ...baseline.parityMatrix[0], expectedInvariantIds: ["missing-invariant"] },
        ],
      },
      /unknown invariant ID/i,
    ],
    [
      {
        ...baseline,
        parityMatrix: [
          { ...baseline.parityMatrix[0], intentionalDifferenceIds: ["missing-difference"] },
        ],
      },
      /unknown difference ID/i,
    ],
    [
      {
        ...baseline,
        parityMatrix: [
          { ...baseline.parityMatrix[0], unexpectedResult: "pass" },
        ],
      },
      /parityMatrix\[0\].*exactly/i,
    ],
    [
      {
        ...baseline,
        parityMatrix: [{ ...baseline.parityMatrix[0], entry: "missing.html" }],
      },
      /entry does not exist/i,
    ],
    [
      {
        ...baseline,
        parityMatrix: [{ ...baseline.parityMatrix[0], route: "fixture" }],
      },
      /origin-relative route/i,
    ],
    [
      {
        ...baseline,
        baselineStateInventory: ["default", "focus"],
      },
      /missing target\/state\/breakpoint\/theme coverage/i,
    ],
    [
      {
        ...baseline,
        productionBaseline: { ...baseline.productionBaseline, sources: ["../../outside"] },
      },
      /canonical repository-relative path/i,
    ],
    [
      {
        ...baseline,
        comparisonConditions: {
          ...baseline.comparisonConditions,
          viewports: ["1280x800", "390x844", "0x0"],
        },
      },
      /viewport.*<width>x<height>/i,
    ],
    [
      {
        ...baseline,
        comparisonTargets: [
          { id: "other", entry: "other.html", route: "/fixture", surface: "page" },
        ],
        parityMatrix: baseline.parityMatrix.map((row: Record<string, unknown>) => ({
          ...row,
          targetId: "other",
          entry: "other.html",
        })),
      },
      /must include index\.html/i,
    ],
    [
      {
        ...baseline,
        comparisonTargets: [
          { id: "main", entry: "index.html", route: "//outside.example/path", surface: "page" },
        ],
      },
      /origin-relative route/i,
    ],
    [
      {
        ...baseline,
        productionBaseline: { ...baseline.productionBaseline, route: "/expected" },
      },
      /must match at least one comparison target route/i,
    ],
    [
      {
        ...baseline,
        comparisonConditions: { ...baseline.comparisonConditions, themes: ["light"] },
        themeContract: ["light"],
      },
      /themes must include light and dark/i,
    ],
    [
      {
        ...baseline,
        comparisonConditions: {
          ...baseline.comparisonConditions,
          viewports: ["1280x800"],
        },
        responsiveContract: [{ id: "desktop", viewport: "1280x800" }],
        parityMatrix: baseline.parityMatrix.filter(
          (row: { breakpoint: string }) => row.breakpoint === "desktop",
        ),
      },
      /must include 390x844/i,
    ],
    [
      {
        ...baseline,
        stateAndInteraction: ["keyboard"],
      },
      /must include keyboard and focus/i,
    ],
  ];

  for (const [contract, error] of invalidContracts) {
    await writeFile(contractPath, `${JSON.stringify(contract)}\n`);
    assertRejected(runRevision(fixture, [prototype.relative]), error);
  }
});

test("未対応extensionを拒否する", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const prototype = await createPrototype(fixture, "unsupported-extension", [
    ["index.html", "<!doctype html>\n"],
    ["notes.txt", "not part of the prototype contract\n"],
  ]);

  assertRejected(runRevision(fixture, [prototype.relative]), /unsupported.*notes\.txt/i);
});

test("対応するimage extensionをすべてrevision対象として受け入れる", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const prototype = await createPrototype(fixture, "supported-images", [
    ["index.html", "<!doctype html>\n"],
    ["assets/photo.jpg", Buffer.from([0xff, 0xd8, 0xff])],
    ["assets/photo.jpeg", Buffer.from([0xff, 0xd8, 0xff])],
    ["assets/photo.webp", Buffer.from("RIFFWEBP", "ascii")],
  ]);

  revisionFrom(runRevision(fixture, [prototype.relative]));
});

test("fileとdirectoryのsymlinkを拒否する", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const outsideFile = path.join(fixture.root, "outside.js");
  const outsideDirectory = path.join(fixture.root, "outside-directory");
  await Promise.all([
    writeFile(outsideFile, "external\n"),
    mkdir(outsideDirectory, { recursive: true }),
  ]);
  await writeFile(path.join(outsideDirectory, "outside.html"), "<!doctype html>\n");

  const fileLinkPrototype = await createPrototype(fixture, "file-symlink", [
    ["index.html", "<!doctype html>\n"],
  ]);
  await symlink(outsideFile, path.join(fileLinkPrototype.absolute, "linked.js"));
  assertRejected(runRevision(fixture, [fileLinkPrototype.relative]), /symlink.*linked\.js/i);

  const directoryLinkPrototype = await createPrototype(fixture, "directory-symlink", [
    ["index.html", "<!doctype html>\n"],
  ]);
  await symlink(outsideDirectory, path.join(directoryLinkPrototype.absolute, "linked-assets"));
  assertRejected(
    runRevision(fixture, [directoryLinkPrototype.relative]),
    /symlink.*linked-assets/i,
  );
});

test("収集後にregular fileがsymlinkへ差し替わったsnapshotを拒否する", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const prototype = await createPrototype(fixture, "symlink-race", representativeEntries);
  const outsideFile = path.join(fixture.root, "outside-race.js");
  await writeFile(outsideFile, "external\n");

  const revisionModule = (await import(pathToFileURL(fixture.script).href)) as {
    collectRegularFiles(directory: string): Promise<unknown[]>;
    hashCollectedFiles(files: unknown[], prototypeRealPath: string): Promise<string>;
  };
  const files = await revisionModule.collectRegularFiles(prototype.absolute);
  const appPath = path.join(prototype.absolute, "app.js");
  await unlink(appPath);
  await symlink(outsideFile, appPath);

  await assert.rejects(
    revisionModule.hashCollectedFiles(files, await realpath(prototype.absolute)),
    /symlink|changed while calculating revision/i,
  );
});

test("収集後に同じ長さのfile contentが変わったsnapshotを拒否する", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const prototype = await createPrototype(fixture, "content-race", representativeEntries);
  const revisionModule = (await import(pathToFileURL(fixture.script).href)) as {
    collectRegularFiles(directory: string): Promise<unknown[]>;
    hashCollectedFiles(files: unknown[], prototypeRealPath: string): Promise<string>;
  };
  const files = await revisionModule.collectRegularFiles(prototype.absolute);
  const appPath = path.join(prototype.absolute, "app.js");
  const original = representativeEntries.find(([entry]) => entry === "app.js")?.[1];
  if (typeof original !== "string") throw new Error("representative app.js fixture must be text");
  const changed = original.replace("true", "nope");
  assert.equal(Buffer.byteLength(changed), Buffer.byteLength(original));
  await writeFile(appPath, changed);

  await assert.rejects(
    revisionModule.hashCollectedFiles(files, await realpath(prototype.absolute)),
    /changed while calculating revision/i,
  );
});

test("source再検証中のprototype変更を最終artifact snapshotで拒否する", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const prototype = await createPrototype(fixture, "source-validation-race", representativeEntries);
  const revisionModule = (await import(pathToFileURL(fixture.script).href)) as {
    capturePrototypeHierarchySnapshots(
      repositoryRealPath: string,
      relativeTarget: string,
    ): Promise<unknown[]>;
    collectRegularFiles(directory: string): Promise<unknown[]>;
    assertFinalInputsUnchanged(
      files: unknown[],
      rootSnapshot: unknown,
      sourceSnapshots: unknown[],
      repositoryRealPath: string,
      revalidateRoot: () => Promise<void>,
      revalidateSources: () => Promise<void>,
    ): Promise<void>;
  };
  const files = await revisionModule.collectRegularFiles(prototype.absolute);
  const hierarchySnapshots = await revisionModule.capturePrototypeHierarchySnapshots(
    fixture.root,
    prototype.relative,
  );
  const appPath = path.join(prototype.absolute, "app.js");
  const original = representativeEntries.find(([entry]) => entry === "app.js")?.[1];
  if (typeof original !== "string") throw new Error("representative app.js fixture must be text");
  const changed = original.replace("true", "nope");
  assert.equal(Buffer.byteLength(changed), Buffer.byteLength(original));

  await assert.rejects(
    revisionModule.assertFinalInputsUnchanged(
      files,
      { realPath: await realpath(prototype.absolute), hierarchySnapshots },
      [],
      fixture.root,
      async () => {},
      async () => writeFile(appPath, changed),
    ),
    /changed while calculating revision/i,
  );
});

test("source再検証中のprototype root rename→symlink差し替えを拒否する", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const prototype = await createPrototype(fixture, "root-symlink-race", representativeEntries);
  const revisionModule = (await import(pathToFileURL(fixture.script).href)) as {
    capturePrototypeHierarchySnapshots(
      repositoryRealPath: string,
      relativeTarget: string,
    ): Promise<unknown[]>;
    collectRegularFiles(directory: string): Promise<unknown[]>;
    assertFinalInputsUnchanged(
      files: unknown[],
      rootSnapshot: unknown,
      sourceSnapshots: unknown[],
      repositoryRealPath: string,
      revalidateRoot: () => Promise<void>,
      revalidateSources: () => Promise<void>,
    ): Promise<void>;
  };
  const files = await revisionModule.collectRegularFiles(prototype.absolute);
  const hierarchySnapshots = await revisionModule.capturePrototypeHierarchySnapshots(
    fixture.root,
    prototype.relative,
  );
  const movedPrototype = path.join(path.dirname(prototype.absolute), "prototype-original");

  await assert.rejects(
    revisionModule.assertFinalInputsUnchanged(
      files,
      { realPath: await realpath(prototype.absolute), hierarchySnapshots },
      [],
      fixture.root,
      async () => {},
      async () => {
        await rename(prototype.absolute, movedPrototype);
        await symlink(movedPrototype, prototype.absolute);
      },
    ),
    /prototype (?:changed while calculating revision|hierarchy must not contain symlinks)/i,
  );
});

test("root再検証中の同長prototype変更を最終artifact snapshotで拒否する", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const prototype = await createPrototype(fixture, "root-validation-race", representativeEntries);
  const revisionModule = (await import(pathToFileURL(fixture.script).href)) as {
    capturePrototypeHierarchySnapshots(
      repositoryRealPath: string,
      relativeTarget: string,
    ): Promise<unknown[]>;
    collectRegularFiles(directory: string): Promise<unknown[]>;
    assertFinalInputsUnchanged(
      files: unknown[],
      rootSnapshot: unknown,
      sourceSnapshots: unknown[],
      repositoryRealPath: string,
      revalidateRoot: () => Promise<void>,
      revalidateSources: () => Promise<void>,
    ): Promise<void>;
  };
  const files = await revisionModule.collectRegularFiles(prototype.absolute);
  const hierarchySnapshots = await revisionModule.capturePrototypeHierarchySnapshots(
    fixture.root,
    prototype.relative,
  );
  const appPath = path.join(prototype.absolute, "app.js");
  const original = representativeEntries.find(([entry]) => entry === "app.js")?.[1];
  if (typeof original !== "string") throw new Error("representative app.js fixture must be text");
  const changed = original.replace("true", "nope");
  assert.equal(Buffer.byteLength(changed), Buffer.byteLength(original));

  await assert.rejects(
    revisionModule.assertFinalInputsUnchanged(
      files,
      { realPath: await realpath(prototype.absolute), hierarchySnapshots },
      [],
      fixture.root,
      async () => writeFile(appPath, changed),
      async () => {},
    ),
    /changed while calculating revision/i,
  );
});

test("複数production baseline sourceのsnapshot差し替えを拒否する", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const shellPath = path.join(fixture.root, "src/shell.ts");
  const replacementPath = path.join(fixture.root, "src/replacement.ts");
  await Promise.all([
    writeFile(shellPath, "export const shell = 'original';\n"),
    writeFile(replacementPath, "export const shell = 'replaced';\n"),
  ]);

  const revisionModule = (await import(pathToFileURL(fixture.script).href)) as {
    captureRepositorySourceSnapshots(
      sources: string[],
      repositoryRealPath: string,
    ): Promise<unknown[]>;
    assertRepositorySourceSnapshotsUnchanged(
      snapshots: unknown[],
      repositoryRealPath: string,
    ): Promise<void>;
  };
  const sources = ["src/ui.ts", "src/shell.ts"];
  const snapshots = await revisionModule.captureRepositorySourceSnapshots(sources, fixture.root);
  await revisionModule.assertRepositorySourceSnapshotsUnchanged(snapshots, fixture.root);

  assert.equal(
    Buffer.byteLength(await readFile(shellPath)),
    Buffer.byteLength(await readFile(replacementPath)),
  );
  await rename(replacementPath, shellPath);

  await assert.rejects(
    revisionModule.assertRepositorySourceSnapshotsUnchanged(snapshots, fixture.root),
    /production baseline source changed while calculating revision: src\/shell\.ts/i,
  );
});

test("prototype rootとancestor directoryのsymlinkを拒否する", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const rootTarget = await createPrototype(fixture, "root-target", representativeEntries);
  const rootLinkParent = path.join(fixture.root, "plans/root-link");
  await mkdir(rootLinkParent, { recursive: true });
  await symlink(rootTarget.absolute, path.join(rootLinkParent, "prototype"));
  assertRejected(runRevision(fixture, ["plans/root-link/prototype"]), /symlink/i);

  await symlink(path.dirname(rootTarget.absolute), path.join(fixture.root, "plans/ancestor-link"));
  assertRejected(runRevision(fixture, ["plans/ancestor-link/prototype"]), /symlink/i);
});

test("repository外、予約slug、legacy、階層違い、dot segment、不正slugを拒否する", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const prototype = await createPrototype(fixture, "valid-target", [
    ["index.html", "<!doctype html>\n"],
  ]);
  const outside = await mkdtemp(path.join(tmpdir(), "prototype-revision-outside-"));
  context.after(() => rm(outside, { recursive: true, force: true }));

  const invalidTargets = [
    "plans/tmp/prototype",
    "plans/reviews/prototype",
    `plans/tmp/valid-target/prototype`,
    `plans/${prototype.relative.split("/")[1]}/review`,
    `${prototype.relative}/nested`,
    `plans/valid-target/../valid-target/prototype`,
    "plans/Bad-Slug/prototype",
    "plans/-bad/prototype",
    `${prototype.relative}/`,
    prototype.relative.replaceAll("/", "\\"),
    outside,
  ];

  for (const target of invalidTargets) {
    assertRejected(
      runRevision(fixture, [target]),
      /target|path|slug|canonical|repository/i,
    );
  }
});

test("存在しないdirectoryとindex.html欠落を拒否する", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const withoutIndex = await createPrototype(fixture, "missing-index", [
    ["app.js", "console.log('missing index');\n"],
  ]);

  assertRejected(
    runRevision(fixture, ["plans/missing-directory/prototype"]),
    /directory does not exist/i,
  );
  assertRejected(runRevision(fixture, [withoutIndex.relative]), /index\.html/i);
});

test("引数不足と過剰引数をusage errorとして拒否する", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const prototype = await createPrototype(fixture, "argument-count", [
    ["index.html", "<!doctype html>\n"],
  ]);

  assertRejected(runRevision(fixture, []), /usage:/i);
  assertRejected(runRevision(fixture, [prototype.relative, "unexpected"]), /usage:/i);
});

test("symlink経由のCLI起動でもrevisionを出力する", async (context) => {
  const fixture = await createRepositoryFixture(context);
  const prototype = await createPrototype(fixture, "cli-symlink", representativeEntries);
  const alias = path.join(fixture.root, "revision-alias.mjs");
  await symlink(fixture.script, alias);

  revisionFrom(
    spawnSync(process.execPath, [alias, prototype.relative], {
      cwd: fixture.root,
      encoding: "utf8",
      timeout: 10_000,
    }),
  );
});
