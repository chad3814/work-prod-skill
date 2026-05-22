# Top-3 presentation prompt

Given the ranked output from `work-next score`, render the top 3 items.

## Format

```
Top 3 things to work on next

1. <title>
   Source: <source> · score: 0.xx · urgency: 0.xx
   <one-line why-it-matters>

2. <title>
   Source: <source> · score: 0.xx · urgency: 0.xx
   <one-line why-it-matters>

3. <title>
   Source: <source> · score: 0.xx · urgency: 0.xx
   <one-line why-it-matters>

Rationale: <short paragraph; may reference breakdown — "boosted because subagents X and Y both surfaced this", or "deprioritized due to Friday-afternoon ambient penalty">.
```

## Guidance

- Show two decimal places for scores.
- The "why-it-matters" line comes from each entry's `rationale` field — paraphrase tightly, do not just copy verbatim.
- The rationale paragraph should mention any non-zero observation deltas if they affected the order. Skip the paragraph if all deltas were zero — just say "Straight ranking by urgency × weights."
- If `ranked` has fewer than 3 entries, show what's there and add a line: "No further items surfaced from <N> subagents checked."
- If `ranked` is empty: say "Nothing actionable surfaced. Sources checked: <list>. You're probably clear — or a data source is down."
