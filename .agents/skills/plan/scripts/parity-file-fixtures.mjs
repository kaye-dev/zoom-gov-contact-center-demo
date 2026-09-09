import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

/** Filesystem boundary; the Browser adapter itself remains platform-neutral ESM. */
export function createParityFixtureReader(fixtureRoot) {
  if (typeof fixtureRoot !== "string" || !path.isAbsolute(fixtureRoot)) throw new Error("fixture root must be absolute");
  return async (file) => {
    if (typeof file !== "string" || file.length > 512 || !/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/u.test(file)) throw new Error("invalid fixture path");
    const root = await realpath(fixtureRoot), fixturePath = await realpath(path.resolve(root, file));
    const relative = path.relative(root, fixturePath);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) throw new Error("fixture outside root");
    const info = await stat(fixturePath);
    if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new Error("invalid fixture size");
    const bytes = await readFile(fixturePath);
    if (bytes.byteLength > 2 * 1024 * 1024) throw new Error("fixture size changed");
    return { path: fixturePath, bytes };
  };
}
