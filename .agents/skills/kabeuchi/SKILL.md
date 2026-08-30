---
name: kabeuchi
description: "Challenge a product or engineering decision with a read-only senior PdM and SWE advisor. Use only when explicitly invoked as $kabeuchi; do not use for planning, implementation, or Git operations."
---

# Kabeuchi

Use one independent advisor to pressure-test a product or engineering decision without changing the repository or external state.

## Prepare and delegate

1. Resolve the current question, confirmed user decisions, constraints, and the minimum repository or authoritative evidence needed to evaluate it.
2. Start exactly one fresh no-history `product_advisor` custom agent. Do not pass a model or reasoning override. Give it only the current question, confirmed decisions, and necessary evidence; omit unrelated conversation, raw logs, and hidden context.
3. Wait for the advisor result. If the custom agent or its configured model is unavailable, stop and report that the kabeuchi was not run. Do not silently substitute another agent or model.

## Return advice

Validate the advice against the available evidence instead of adopting it automatically. Return the recommended direction, material tradeoffs, unresolved facts, and the next decision. Preserve meaningful disagreement between the advisor and repository evidence.

This skill is read-only. Do not edit files, create or revise a plan, implement changes, mutate Git state, or perform external writes. If the user wants one of those actions, finish the advice and direct them to the corresponding explicit workflow.
