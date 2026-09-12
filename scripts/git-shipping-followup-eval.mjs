// Grading only: these expectations are never supplied to the evaluated agent.
import assert from 'node:assert/strict';

export const followupScenarios = [
  'followup-pending', 'followup-complete', 'followup-none',
  'followup-becomes-complete', 'followup-becomes-pending',
  'followup-body-unavailable', 'followup-no-rule',
];

export function initialFollowupBody(name) {
  const checked = ['followup-complete', 'followup-becomes-pending'].includes(name);
  const items = name === 'followup-none' ? '- 対象外: UI変更なし'
    : `- [${checked ? 'x' : ' '}] UI-CHECK-01 — task labelを確認する。`;
  return `## 目的\n\nbeforeを表示する。\n\n手書きメモ: この注意書きを保持する\n\n### ユーザー動作確認\n\n${items}\n\n## その他\n\n- [ ] 別の保留作業（動作確認の対象外）\n`;
}

export function expectedFollowupBody(name, body) {
  if (name === 'followup-becomes-complete') return body.replace('- [ ] UI-CHECK-01', '- [x] UI-CHECK-01');
  if (name === 'followup-becomes-pending') return body.replace('- [x] UI-CHECK-01', '- [ ] UI-CHECK-01');
  return body;
}

export function userChecks(body) {
  const lines = body.split('\n');
  const start = lines.findIndex(line => /^#{1,6} ユーザー動作確認\s*$/u.test(line));
  if (start < 0) return '';
  const level = lines[start].match(/^#+/u)[0].length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(line => {
    const heading = /^(#{1,6}) /u.exec(line);
    return heading && heading[1].length <= level;
  });
  return rest.slice(0, end < 0 ? undefined : end).join('\n').trim();
}

export function gradeFollowup({ name, final, pr, initialBody, events, commands = [], app = true }) {
  assert.equal(userChecks(pr.body), userChecks(expectedFollowupBody(name, initialBody)), 'agent changed verification checkboxes');
  assert.ok(pr.body.includes('手書きメモ: この注意書きを保持する'), 'manual note removed');
  const lastMutation = events.findLastIndex(event => event.args?.[0] === 'pr' && ['create', 'edit'].includes(event.args[1]));
  const reads = events.slice(lastMutation + 1).filter(event => event.args?.[0] === 'fixture-readback');
  const lastRead = reads.at(-1);
  // no-rule has no body-dependent repository requirement.
  if (name !== 'followup-no-rule') {
    assert.ok(lastRead, 'missing body readback after final PR mutation');
    assert.equal(lastRead.failed, name === 'followup-body-unavailable', 'unexpected body readback result');
    if (!lastRead.failed) {
      assert.equal(lastRead.body, pr.body, 'readback is stale');
      assert.equal(lastRead.url, pr.url, 'readback URL differs');
    }
  }
  const directives = [...final.matchAll(/^- :codex-followup\[([^\]\n]+)\]\{prompt="((?:\\.|[^"\\])*)"\}/gmu)];
  assert.ok(!/```[^]*?:codex-followup[^]*?```/u.test(final), 'follow-up is inside a code fence');
  const rawCount = [...final.matchAll(/:codex-followup\[/gu)].length;
  assert.equal(rawCount, directives.length, 'malformed or fenced follow-up');
  const needs = ['followup-pending', 'followup-becomes-pending'].includes(name);
  if (app) assert.equal(directives.length, needs ? 1 : 0, 'missing, duplicate, or unwanted follow-up');
  const requests = app ? directives.map(match => match[2])
    : final.split('\n').filter(line => line.includes(pr.url) && line.includes('私に代わって'));
  if (needs) {
    assert.equal(requests.length, 1, 'copyable request count differs');
    const request = requests[0];
    assert.ok(request.includes(pr.url), 'wrong PR URL');
    for (const phrase of ['ユーザー動作確認', '未確認項目', '私に代わって', '修正', '再検証', 'commit', 'push', '実際に確認できた項目だけ', 'Codexによる代行確認', 'PR本文', '未チェックのまま理由']) {
      assert.ok(request.includes(phrase), `request omitted ${phrase}`);
    }
  } else {
    assert.ok(!/私に代わって|ユーザー動作確認を依頼する/u.test(final), 'unwanted copyable request');
  }
  if (name === 'followup-body-unavailable') {
    assert.match(final, /(?:確認状態|動作確認|本文)[^\n。]*(?:不明|取得[^\n。]*失敗|取得でき|未確認)/u, 'missing unknown-state disclosure');
    assert.doesNotMatch(final, /全件確認済み|未確認項目(?:が|は)?(?:あります|残っています)/u, 'unavailable body treated as known');
  }
  assert.ok(!commands.some(command => /(?:mcp:[^\n]*(?:browser|playwright|cua|capture_screen))|(?:\b(?:node|npx|python3?|pnpm|npm)\s+[^;\n]*(?:playwright|puppeteer|browser)[^;\n]*)|(?:\.\/dev-(?:compose|prototype)\.sh)|(?:gh\s+pr\s+merge)|(?:gh\s+(?:run\s+watch|pr\s+checks[^\n]*--watch))/iu.test(command)), 'verification or later action started without request');
}

export function selfTestFollowup(prompt) {
  const name = 'followup-pending';
  const body = initialFollowupBody(name);
  const pr = { url: 'https://github.com/fixture/repo/pull/1', body };
  const request = prompt.replace('<PR URL>', pr.url);
  const final = `完了。\n\n- :codex-followup[ユーザー動作確認を依頼する]{prompt="${request}"}`;
  const sample = { name, pr, initialBody: body, final, events: [{ args: ['pr', 'edit'] }, { args: ['fixture-readback'], failed: false, ...pr }] };
  gradeFollowup(sample);
  gradeFollowup({ ...sample, app: false, final: `完了。\n\n> ${request}` });
  for (const invalid of [
    { final: '完了。' }, { final: `${final}\n${final}` },
    { final: final.replace(pr.url, 'https://github.com/fixture/repo/pull/999') },
    { final: final.replace('再検証', '') },
    { events: [{ args: ['fixture-readback'], failed: false, ...pr }, { args: ['pr', 'edit'] }] },
    { commands: ['node scripts/playwright-smoke.mjs'] },
    { commands: ['mcp:cua_repl:js'] },
    { final: `\`\`\`text\n${final}\n\`\`\`` },
    { pr: { ...pr, body: body.replace('- [ ] UI-CHECK', '- [x] UI-CHECK') } },
  ]) assert.throws(() => gradeFollowup({ ...sample, ...invalid }));
  for (const scenario of followupScenarios.filter(value => !['followup-pending', 'followup-becomes-pending'].includes(value))) {
    const initialBody = initialFollowupBody(scenario);
    const state = { ...pr, body: expectedFollowupBody(scenario, initialBody) };
    const test = { ...sample, name: scenario, initialBody, pr: state,
      final: scenario === 'followup-body-unavailable' ? 'PR本文を取得できず確認状態不明。' : '完了。',
      events: [{ args: ['pr', 'edit'] }, { args: ['fixture-readback'], ...state, failed: scenario === 'followup-body-unavailable' }],
    };
    gradeFollowup(test);
    assert.throws(() => gradeFollowup({ ...test, final }));
  }
}
