import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

const exec = promisify(execFile);
const evaluator = new URL('../scripts/eval-git-commit-push-pr.mjs', import.meta.url).pathname;

test('shipping CI preflight covers pre-commit success, minor repair and bounded stops with negative controls', { timeout: 180_000 }, async () => {
  const { stdout: inventory } = await exec(process.execPath, [evaluator, '--list']);
  for (const scenario of ['ci-precommit-success', 'ci-minor-repair', 'ci-major-stop', 'ci-unavailable-stop']) {
    assert.ok(inventory.trim().split('\n').includes(scenario), scenario);
  }
  const { stdout } = await exec(process.execPath, [evaluator, '--self-test'], {
    timeout: 170_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.match(stdout, /self-test passed: \d+ scenarios and grader negative controls/);
});
