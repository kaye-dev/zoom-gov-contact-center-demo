import assert from "node:assert/strict";
import test from "node:test";

import { invalidPlanArtifacts, verifyPlanArtifacts } from "../scripts/verify-plan-artifacts.mjs";

test("plans/template.mdだけを追跡可能なplan pathとして受け入れる", () => {
  const tracked = ["README.md", "plans/template.md", "src/example.ts"];
  assert.deepEqual(invalidPlanArtifacts(tracked), []);
  assert.deepEqual(verifyPlanArtifacts(tracked), []);
});

test("template以外のplans生成物と単数形plan pathを削除対象として拒否する", () => {
  const tracked = [
    "plan/example/goal.md",
    "plans/example/prototype/index.html",
    "plans/example/goal.md",
  ];
  assert.deepEqual(invalidPlanArtifacts(tracked), tracked);
  assert.throws(
    () => verifyPlanArtifacts(tracked),
    /Delete these plan artifacts:[\s\S]*plan\/example\/goal\.md[\s\S]*plans\/example\/prototype\/index\.html[\s\S]*plans\/example\/goal\.md/,
  );
});
