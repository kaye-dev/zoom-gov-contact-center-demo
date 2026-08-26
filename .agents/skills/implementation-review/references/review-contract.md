# HTML review contract

The reusable screen reads `review-data.json`. The tracked file is an intentionally invalid placeholder, not example review evidence. Replace the complete object with current task data before serving it; never carry groups, findings, paths, counts, or validations from a previous report.

```json
{
  "title": "実装レビュー",
  "generatedAt": "2026-08-26T12:00:00+09:00",
  "runId": "<UUID>",
  "base": "<40-character Git SHA>",
  "head": "<40-character Git SHA>",
  "remoteBase": { "ref": "origin/main", "oid": "<40-character Git SHA observed before review>" },
  "diffHash": "<SHA-256 of the reviewed diff>",
  "planHash": "<SHA-256 of immutable final plan sections>",
  "assetHashes": { "index.html": "<SHA-256>", "styles.css": "<SHA-256>", "app.js": "<SHA-256>", "review-data-schema.js": "<SHA-256>" },
  "summary": "対象と結論",
  "stats": { "files": 1, "intentGroups": 1, "findings": 1, "validationsPassed": 1 },
  "reviewedPaths": ["path/to/file"],
  "excludedPaths": [],
  "findingResolutions": [],
  "reviewPasses": [
    {
      "source": "blind",
      "role": "blind_diff_reviewer",
      "model": "gpt-5.6-sol",
      "reasoningEffort": "xhigh",
      "inputHashes": { "diff": "<SHA-256>", "context": "<SHA-256>" },
      "outputFile": "blind-review.json",
      "outputHash": "<SHA-256>",
      "evidence": ["差分だけを独立レビュー"]
    },
    {
      "source": "conformance",
      "role": "plan_conformance_reviewer",
      "model": "gpt-5.6-sol",
      "reasoningEffort": "xhigh",
      "inputHashes": { "diff": "<SHA-256>", "context": "<SHA-256>", "plan": "<SHA-256>", "validations": "<SHA-256>", "remoteBase": "<SHA-256>" },
      "outputFile": "plan-conformance-review.json",
      "outputHash": "<SHA-256>",
      "evidence": ["planと差分を照合"]
    }
  ],
  "validations": [
    { "command": "npm test", "status": "passed", "summary": "成功" }
  ],
  "groups": [
    {
      "id": "intent-stable-id",
      "title": "変更意図",
      "summary": "何を、なぜ変えたか",
      "risk": "high",
      "blastRadius": "影響範囲",
      "files": ["path/to/file"],
      "locations": ["path/to/file:1-24"],
      "findings": [
        {
          "source": "blind",
          "severity": "major",
          "title": "指摘",
          "body": "根拠と影響",
          "location": "path/to/file:12",
          "recommendation": "具体的な修正"
        }
      ],
      "planDeviations": [],
      "evidence": ["確認根拠"]
    }
  ]
}
```

Use `critical / high / medium / low / none` for the change's inherent group risk, `blocker / major / minor / note` for finding severity, and `passed / failed / skipped / unverified` for validation status. Every finding keeps its `blind` or `conformance` source. A group may remain high-risk even when both reviewers report no finding; finding presence and change risk are separate signals. A finding still sets a minimum group risk appropriate to its severity.

Every group has at least one repository-relative `locations` entry in `path:line` or `path:start-end` form, even when it has no finding. Use `path@base:line` or `path@base:start-end` for deleted base-side lines; these locations must intersect an actual diff hunk. For a rename, mode-only change, binary change, or empty file with no line hunk, use `path@file`; it is accepted only when Git reports the path changed and no text hunk exists. The browser derives its counters from the groups and validations. Record only commands that actually ran and files that were actually reviewed. Keep raw logs and secrets out of the report. The template must render all untrusted values with `textContent` or equivalent DOM APIs; do not add `innerHTML`, remote scripts, inline handlers, or dynamic code evaluation.

`reviewedPaths` is the sorted task-scoped path manifest and must exactly equal the union of every group's `files`. Every other dirty or untracked path goes in sorted `excludedPaths` with `{ "path", "reason", "snapshotHash" }`; the two manifests together must cover the current repository diff without overlap. The inventory is the union of base-to-working-tree changes, base-to-index changes, and non-ignored untracked files, so an index-only path cannot disappear. The pre-commit snapshot records each path's base blob/mode, Git-filtered planned blob/mode, working-tree size/content hash, and index state/mode/blob/stage. Post-commit validation replaces the planned side with the actual HEAD tree blob/mode while rechecking the clean index and working tree. The exact task paths must therefore be staged before the final strict review; a later index change invalidates `diffHash` or an exclusion snapshot. This prevents staging state, EOL/clean filters, untracked files, and mode handling from silently changing the reviewed result. Normalize reviewer results in memory and run the shared secret detector before saving the fixed, distinct files `blind-review.json` and `plan-conformance-review.json` beside the report. Each uses `{ "runId", "diffHash", "inputHashes", "source", "summary", "findings" }`; the conformance file also carries `planHash`. Every finding has `severity`, `title`, `body`, `location`, and `recommendation`. `planHash` covers the complete final plan except the mutable `status` metadata line, `進捗管理`, and `実行記録`. The conformance input additionally hashes the exact pre-review `validations` array and structured `remoteBase`; changing either after review invalidates the report. The validator resolves the recorded remote ref, requires the recorded OID to be contained in the accepted plan base, and permits only a current remote OID that is its linear descendant. Browser confirmation remains lifecycle evidence in the plan after review rather than an unreviewed success claim inserted into `validations`. `assetHashes` binds every copied UI file to a trusted Git blob: unchanged assets come from the accepted base, changed assets must be reviewed and fully staged and come from the index, and post-commit assets come from the shipping commit. A canonical asset can never be placed in `excludedPaths`. The validator loads the schema from that trusted blob rather than executing a dirty Browser asset from the working tree. Before the first Browser display, run the validator with `--allow-unresolved`; this still verifies every hash and manifest but permits blocker/major findings to be shown. After fixes and fresh review, run it without that flag before G04. Any blocker/major still present then requires a matching `findingResolutions` entry containing the complete finding (`source`, `severity`, `title`, `body`, `location`, `recommendation`), the current `reviewRunId` and `reviewDiffHash`, `decision: "rejected"`, a rationale, evidence, and `userApproved: true`; a Browser-only choice or merely returning the finding is insufficient. The strict command binds the directory and `data.base` to the exact plan ID and `base_commit`, then recomputes plan/UI hashes, the task-scoped snapshot, exclusion snapshots, current HEAD, output hashes, source-specific finding sets, changed locations, and resolution gate. A stale, partial, merged, or unresolved review must fail.

Custom-agent `sandbox_mode` expresses the requested role, but live parent permissions can override it. Before each reviewer starts, capture the current `HEAD`, index-aware snapshot, complete inventory, and hashes of the exact input artifacts. The deterministic inputs are the base-to-index binary diff and the sorted path/index-blob context; conformance also includes the canonical immutable plan artifact used by `planHash`, the exact pre-review validation records, and the structured remote-base evidence. Store these in each pass's `inputHashes` and require the normalized reviewer output to echo the same object. The validator regenerates and compares them. `status`, `進捗管理`, and `実行記録` remain lifecycle evidence outside that immutable artifact, so checking G04/G05 and recording the completed Browser review does not invalidate the reviewed design; changing any other plan section does. Recompute the repository state immediately after that reviewer returns. Any mismatch invalidates the review and must stop without automatically restoring the unexpected change. Record successful pre/post checks before generating the conformance input hash. If the task requires an OS/runtime-enforced read-only boundary instead of tamper evidence, execute the review from a separately launched parent task with read-only permission.

The strict pre-commit gate requires the reviewed HEAD to equal the final plan base; committed task changes are outside this plan-driven HTML shipping contract. For authorized shipping, rerun the same command with `--post-commit` after commit hooks. It requires exactly one direct, clean shipping commit after that reviewed HEAD, screens its message, preserves the canonical snapshot, plan hash, path manifests, findings, and assets, and rejects every `excludedPaths` entry. The final plan base remains the explicit trust boundary; this report does not attest older branch/PR commits. If changes were already committed or older commits are not accepted scope, stop and use an ordinary branch review or create a new workflow from the appropriate earlier base. A base-sync merge or any other additional commit requires a fresh two-pass review before push.
