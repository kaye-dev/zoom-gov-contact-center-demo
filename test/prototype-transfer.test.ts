import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { ESLint } from "eslint";
import { promisify } from "node:util";
import { preparePrototype } from "../scripts/prototype-runtime.mjs";
import { createPrototypeRepository, installTransferFixture, prototypeSourceRoot } from "./helpers/prototype-runtime-fixture";

test("product lint rejects plan, runtime and fixture imports", async () => {
  const eslint = new ESLint({ cwd: prototypeSourceRoot });
  for (const source of ["@/plans/example/prototype/entry", "@/.local/prototype-runtime/example/PrototypeProviders", "@/tools/prototype-runtime/PrototypeProviders", "@/test/fixtures/next-prototype/entry", "@prototype/entry"]) {
    const [result] = await eslint.lintText(`import Entry from ${JSON.stringify(source)};\nvoid Entry;\n`, { filePath: path.join(prototypeSourceRoot, "app/prototype-import-check.tsx") });
    assert.ok(result.messages.some(message => message.ruleId === "no-restricted-imports"), source);
  }
});

const exec = promisify(execFile);
test("adopted TSX transfers unchanged; fixture types fail only its isolated check", { timeout: 60000 }, async context => {
  const { root, directory } = await createPrototypeRepository(context, { realSources: true });
  await installTransferFixture(directory);
  const source = await readFile(path.join(directory, "EditableGroupPanel.tsx"), "utf8");
  assert.equal(await readFile(path.join(directory, "implementation/EditableGroupPanel.tsx"), "utf8"), source);
  assert.doesNotMatch(source, /(?:plans\/|prototype-runtime|fixtures|fetch\()/u);
  const prepared = await preparePrototype(root, "example");
  const args = [path.join(prototypeSourceRoot, "node_modules/typescript/bin/tsc"), "--project", path.join(prepared.runtime, "tsconfig.json")];
  await exec(process.execPath, args, { cwd: root, timeout: 45000, maxBuffer: 1024 * 1024 });
  await writeFile(path.join(directory, "implementation/EditableGroupPanel.tsx"), source.replace("(name: string) => Promise<string>", "(name: number) => Promise<string>"));
  await assert.rejects(exec(process.execPath, args, { cwd: root, timeout: 45000, maxBuffer: 1024 * 1024 }), error => {
    assert.match(String((error as { stdout?: string }).stdout), /not assignable/u);
    return true;
  });
  const rootConfig = JSON.parse(await readFile(path.join(prototypeSourceRoot, "tsconfig.json"), "utf8"));
  for (const name of ["plans/**", ".local/**", "tools/prototype-runtime/**", "test/fixtures/next-prototype/**"]) assert.ok(rootConfig.exclude.includes(name));
});
