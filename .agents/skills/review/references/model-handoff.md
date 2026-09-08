# Review model handoff

The user wants a manual cost-control boundary before independent review. The trial target for the parent task is `gpt-6-astra` with reasoning `low`. Review locally by default under AGENTS.md. When independent reviewers are necessary, keep their configured `terra/high` and report that distinction. Do not claim an exact cost saving from API prices or assume a smaller model is adequate without evaluation.

## Observe the current turn

Use trusted current-turn metadata when available. A repository/global `config.toml`, model availability list, previous turn, or assistant self-description is not evidence of the model executing this turn. In the desktop environment, obtain the current task ID from `CODEX_THREAD_ID` or trusted task metadata, obtain the active turn ID from a read-only task lookup if available, and inspect only that task's matching `turn_context` metadata in its local session rollout. Resumed tasks may have several rollout files; match the active turn ID rather than using the first filename. Extract only timestamp, turn ID, model and effort; do not print transcripts or credentials. If current-turn identity cannot be established, report model/effort as unverified instead of inferring it from an old record.

## Stop before review, not during implementation verification

Apply this boundary when entering an explicitly requested independent review, including a direct `$review` invocation, before its deterministic audit, reviewer spawning or HTML report work. `$implement` must finish its required CLI, runtime, Browser, conformance, visual and cleanup checks first; its internal diff inspection is not this independent-review phase. Do not use model switching to defer a required implementation check or claim incomplete implementation is ready for review. A normal implementation finish can offer the handoff for optional review without executing or requiring `$review` automatically. Shipping-only validation does not become an independent review by implication.

- If current model and effort already match the target, continue the authorized review without another pause.
- If they differ or cannot be verified, end the turn before review. State the observed model/effort and source (or unverified), target `gpt-6-astra / low`, completed checks, remaining review scope, and the user-requested model-switch reason. Ask the user to select the model and effort in the Codex composer, then send the populated continuation prompt below in the same task.
- Do not change configuration, send a message to the task, spawn a cheaper proxy, or claim to switch the running model yourself. No new task is required. Do not start review while waiting for the user's reply.
- On continuation, recheck current-turn metadata once. If unavailable, the user's explicit statement that they selected the target is sufficient to proceed, labelled user-confirmed rather than measured. A verified mismatch should be reported, with the switch prompt again, unless the user explicitly opts to proceed with the current model. A mere elapsed wait is not confirmation. Do not loop on an unobservable model after an explicit user confirmation.

## Copyable continuation prompt

Fill actual absolute paths, scope, digest/evidence references, and known task link; use `対象goal: なし（非plan作業）` when applicable. Do not invent a goal or include unrelated dirty changes. If the source ID is unknown, leave only `前タスクのディープリンク: ［ユーザーが入力］`. Model selection is an app action; prompt text alone does not change it.

```text
Codexのモデルを gpt-6-astra、reasoningを low に切り替えました。
前タスクのディープリンク: （取得した現在タスクのcodex://threads/リンク）
作業ディレクトリ: （絶対path）
対象goal・検証記録: （実際の絶対path、または該当なし）
レビュー対象: （対象pathと変更目的、差分基準、除外する既存変更）
完了済み検証: （実行結果とscope/digest・証跡）
未実施: （独立レビューの具体的対象・懸念）
現在ターンのモデルを確認可能な範囲で確認し、上記スコープのレビューから継続してください。
goalがある場合は $review を使用してください。goalなしの限定変更はread-onlyの差分レビューとしてください。
有効な検証結果を再利用し、goal・prototypeへの適合と回帰を確認してください。独立レビュー担当の既定設定は維持してください。
レビュー結果を報告してください。修正やcommit/push/PRは、このプロンプトでは追加で依頼していません。
```
