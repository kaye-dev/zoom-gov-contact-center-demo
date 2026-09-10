import { cp, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";

export const prototypeSourceRoot = path.resolve(import.meta.dirname, "../..");

export async function createPrototypeRepository(context: TestContext, { realSources = false } = {}) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "next-prototype-test-")));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "app/styles"), { recursive: true });
  await mkdir(path.join(root, "lib"));
  await mkdir(path.join(root, "public"));
  await cp(path.join(prototypeSourceRoot, "tools/prototype-runtime"), path.join(root, "tools/prototype-runtime"), { recursive: true });
  if (realSources) {
    for (const name of ["app", "lib", "public"]) await cp(path.join(prototypeSourceRoot, name), path.join(root, name), { recursive: true });
  } else {
    await writeFile(path.join(root, "app/styles/ui-foundation.css"), '@import "tailwindcss" source(none);\n');
    await writeFile(path.join(root, "app/Shared.tsx"), 'export const Shared = () => <div className="w-37">Shared</div>;\n');
    await writeFile(path.join(root, "public/theme-init.js"), '// fixture\n');
  }
  for (const name of ["package.json", "package-lock.json"]) await cp(path.join(prototypeSourceRoot, name), path.join(root, name));
  await symlink(path.join(prototypeSourceRoot, "node_modules"), path.join(root, "node_modules"), "dir");
  const directory = path.join(root, "plans/example/prototype");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "entry.tsx"), '"use client";\nexport default function Entry() { return <div className="h-39">Example</div>; }\n');
  return { root, directory };
}

export async function installTransferFixture(directory: string) {
  await cp(path.join(prototypeSourceRoot, "test/fixtures/next-prototype"), directory, { recursive: true });
  await mkdir(path.join(directory, "implementation"), { recursive: true });
  await cp(path.join(directory, "EditableGroupPanel.tsx"), path.join(directory, "implementation/EditableGroupPanel.tsx"));
}
