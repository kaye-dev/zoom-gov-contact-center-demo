import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { createHash } from "node:crypto";
const approvedHashes: Record<string, string> = {
  univ: "0b1f435bca8eeef143bc4c743255f56650fcffeac6eff4c6a1f62748baee4914",
  lg: "380efa03d7a397094824924c4c81350c661d67a898772c3e58c2739a54877c11",
};
test("FAVICON-SVG: existing university and municipal marks are self-contained SVGs", () => {
  for (const key of ["univ", "lg"]) {
    const svg = readFileSync(`public/favicons/${key}.svg`, "utf8");
    assert.match(svg, /<svg[^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.match(svg, /viewBox=/);
    assert.doesNotMatch(
      svg,
      /<script|<foreignObject|https?:\/\/(?!www\.w3\.org\/2000\/svg)/,
    );
    assert.equal(
      createHash("sha256").update(svg).digest("hex"),
      approvedHashes[key],
    );
  }
});
test("FAVICON-HOST/METADATA: Host determines the icon and ICO cannot override it", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /getRequestTenant\(\)/);
  assert.match(layout, /favicons\/\$\{tenant\.key\}\.svg/);
  assert.match(layout, /type: "image\/svg\+xml"/);
  assert.match(layout, /sizes: "any"/);
  assert.equal(existsSync("app/favicon.ico"), false);
});
