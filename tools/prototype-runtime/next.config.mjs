import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const paths = JSON.parse(readFileSync(new URL("./runtime-paths.json", import.meta.url), "utf8"));
const runtime = path.dirname(fileURLToPath(import.meta.url));
const relative = (file) => `./${path.relative(runtime, file)}`;

const config = {
  distDir: ".next",
  devIndicators: false,
  poweredByHeader: false,
  experimental: { turbopackFileSystemCacheForDev: true },
  turbopack: {
    root: paths.repository,
    resolveAlias: { "@/*": `${relative(paths.shared)}/*`, "@prototype/entry": relative(paths.entry) },
  },
  webpack(config) {
    config.resolve.alias["@"] = paths.shared;
    config.resolve.alias["@prototype/entry"] = paths.entry;
    return config;
  },
};

export default config;
