# HTML review contract

Copy every file from `assets/review-report/` to `plans/<slug>/review/`, then replace `review-data.json` completely. Do not persist raw reviewer responses, hashes, release gates, model routing, or additional review JSON files.

## Data shape

```json
{
  "title": "変更の実装レビュー",
  "generatedAt": "2026-08-27T12:00:00+09:00",
  "planPath": "plans/example-change/goal.md",
  "base": "HEAD",
  "head": "working tree",
  "summary": "レビュー対象の要約",
  "reviewedPaths": ["path/to/file.ts"],
  "excludedPaths": [
    { "path": "unrelated/file.ts", "reason": "別作業の変更" }
  ],
  "validations": [
    { "command": "npm test", "status": "passed", "summary": "全テスト成功" }
  ],
  "groups": [
    {
      "id": "intent-slug",
      "title": "変更意図",
      "summary": "なぜこの変更が必要か",
      "risk": "medium",
      "blastRadius": "影響する利用者・処理・互換性",
      "files": ["path/to/file.ts"],
      "locations": ["path/to/file.ts:10-24"],
      "findings": [
        {
          "source": "blind",
          "severity": "minor",
          "title": "指摘の要約",
          "body": "根拠と影響",
          "location": "path/to/file.ts:18",
          "recommendation": "推奨する対応"
        }
      ],
      "planDeviations": [],
      "evidence": ["確認した根拠"]
    }
  ]
}
```

## Rules

- `planPath` is the selected `plans/<slug>/goal.md`.
- `base` and `head` describe the reviewed range. Use `HEAD` and `working tree` for the default uncommitted review; use explicit revisions for committed changes.
- `reviewedPaths` and `excludedPaths` are sorted, disjoint, and together explain all relevant staged, unstaged, deleted, and non-ignored untracked paths.
- Findings remain individually source-labelled as `blind` or `conformance`; never merge away one pass's result.
- Risk is `critical`, `high`, `medium`, `low`, or `none`. Severity is `blocker`, `major`, `minor`, or `note`.
- A group describes one intent, not one file. Rename/import follow-ups and similar mechanical edits belong with their purpose. `files` across all groups exactly equals `reviewedPaths`.
- Locations use `path:line`, `path:start-end`, or `path@file`. If the intent cannot be explained, set the group summary to `要改善: 変更意図を説明できない` and assign an appropriate risk.
- Validation status is `passed`, `failed`, `skipped`, or `unverified`, and records commands actually run or a reused command whose scope, passed status, and validated diff digest exactly match the reviewed snapshot.
- For current UI evidence, use separate validation entries for automated state/viewport/theme coverage, risk rows, anchor rows, cleanup, human visual approval, and full parity. Never collapse `automationCoverageStatus`, `humanVisualApprovalStatus`, and `fullParityStatus` into one pass/fail statement.
- Evidence lists may reference representative screenshot/URL and compact artifact records. Do not copy raw screenshot bytes, raw DOM, accessibility trees, workspace fragments, or large runner JSON into `review-data.json`.
- Screen all strings before writing. Never include credentials, tokens, environment values, private keys, cookies, or raw reviewer transcripts.
- Replace every `UNREPLACED_TEMPLATE` value. `normalizeData` deliberately rejects a copied placeholder or malformed shape.

The report uses only local files, `fetch("review-data.json")`, and DOM text APIs. Keep its Content Security Policy effective: no external network, inline scripts, `eval`, or `innerHTML`.
