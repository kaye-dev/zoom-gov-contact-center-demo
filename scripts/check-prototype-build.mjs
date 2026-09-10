import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preparePrototype, prototypeEnvironment, runCommand } from "./prototype-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(path.join(root, ".local"), { recursive: true });
const temporary = await mkdtemp(path.join(root, ".local/prototype-build-"));
const application = path.join(temporary, "application");
try {
  await mkdir(application);
  // No .env, .next, user plans, runtime state or dependency installation is copied.
  for (const name of ["app", "lib", "content", "docs", "public", "prisma", "tools/prototype-runtime"]) {
    await cp(path.join(root, name), path.join(application, name), { recursive: true });
  }
  for (const name of ["package.json", "package-lock.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs", "mdx-components.tsx", "proxy.ts"]) {
    await cp(path.join(root, name), path.join(application, name));
  }
  await writeFile(path.join(application, "next-env.d.ts"), '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n');
  await symlink(path.join(root, "node_modules"), path.join(application, "node_modules"), "dir");
  const directory = path.join(application, "plans/build-fixture/prototype");
  await cp(path.join(root, "test/fixtures/next-prototype"), directory, { recursive: true });
  await mkdir(path.join(directory, "implementation"));
  await cp(path.join(directory, "EditableGroupPanel.tsx"), path.join(directory, "implementation/EditableGroupPanel.tsx"));
  const prepared = await preparePrototype(application, "build-fixture");
  const environment = prototypeEnvironment(process.env, "production");
  const next = path.join(root, "node_modules/next/dist/bin/next");
  console.log("Building isolated prototype host");
  await runCommand(process.execPath, [next, "build", prepared.runtime, "--webpack"], { cwd: application, env: environment });
  // This deliberately invalid authoring file must not enter the product's typecheck/build.
  await cp(path.join(directory, "entry.tsx"), path.join(directory, "ignored-by-product.tsx"));
  await writeFile(path.join(directory, "ignored-by-product.tsx"), 'const invalid: never = "prototype only";\n');
  console.log("Building isolated product application");
  await runCommand(process.execPath, [next, "build", application, "--webpack"], { cwd: application, env: environment });
  const routes = JSON.parse(await readFile(path.join(application, ".next/server/app-paths-manifest.json"), "utf8"));
  if (Object.keys(routes).some(route => /prototype|build-fixture/u.test(route))) throw new Error("Prototype route leaked into the product build");
  console.log("Isolated host and product builds passed; prototype routes/types are excluded.");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
