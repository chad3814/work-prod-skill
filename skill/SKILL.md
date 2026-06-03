---
name: work-next
description: Use when the user asks what to work on next, what's most urgent, or to prioritize their day. Fans out subagents to evaluate signals (PRs, issues), applies weights and observations, and presents a ranked top-3.
---

# work-next

You help the user decide what to work on next.

## How to run

When invoked (via `/work-next`, the `work-next` CLI, or auto-trigger on phrases like "what should I work on next"), follow these steps in order. Where a step says **shell**, run the exact command via your Bash/shell tool.

### 1. Preflight

**shell:**
```bash
work-next config validate
```

If exit code != 0, the stdout will contain `{"ok": false, "errors": [...]}`. Render the errors as a numbered list to the user and stop.

If exit code == 0, parse the stdout JSON. It has shape:

```json
{
  "ok": true,
  "subagents": [ { "name": "...", "prompt": "...", "timeoutMs": ..., ... }, ... ],
  "unavailable": [ { "name": "...", "reason": "...", "stderr": "..." }, ... ],
  "weights": { ... full WeightsConfig ... },
  "ambient": { "dayOfWeek": "...", "localHour": ... }
}
```

For each entry in `unavailable`, immediately record a `subagentReturns` row with:

```json
{
  "name": "<entry.name>",
  "item": null,
  "urgency": 0,
  "rationale": "<entry.reason>" (optionally append ": " + entry.stderr if non-empty),
  "status": "unavailable"
}
```

Do **not** dispatch a subagent for any entry in `unavailable`. Step 2 fan-out only iterates `subagents`.

### 2. Fan out subagents in parallel

For each entry in `subagents`, spawn a subagent (Task tool in Claude Code, equivalent primitive in codex/other). Give each subagent:

- The `prompt` field from its config entry as the task description.
- The strict return contract below.
- Its `timeoutMs` budget.

**Subagent return contract** (subagents MUST return a JSON object matching this shape):

```json
{
  "item": { "title": "...", "source": "...", "ref": "optional URL or ID" },
  "urgency": 0.0,
  "rationale": "one or two sentences"
}
```

Or, if the subagent's data source is unavailable:

```json
{
  "item": null,
  "urgency": 0,
  "rationale": "data source unavailable: <reason>",
  "status": "unavailable"
}
```

Wait for all subagents to complete or time out. Record results in memory, tagged with `status`:

- `"ok"` if returned a valid item.
- `"timeout"` if the subagent exceeded `timeoutMs`.
- `"invalid"` if the return didn't match the contract (record the first 500 chars of the raw return).
- `"unavailable"` if the subagent returned that status.

### 3. Build observations

Reason over the collected returns to produce an `observations` object:

```json
{
  "correlations": [
    { "subagentNames": ["github-prs", "linear-issues"], "reason": "the PR closes the issue" }
  ],
  "runtimeArgsRelevance": {
    "github-prs": 0.5
  },
  "ambientPenalty": -0.5
}
```

- **correlations**: scan items across subagents for shared entities (PR ↔ Linear issue, etc.).
- **runtimeArgsRelevance**: if the user passed runtime args (e.g. "big demo tomorrow, prioritize Postful"), score each subagent's item on a scale of -1 to +1 for how relevant the item is to those args. Subagents whose item is unrelated to the args stay at 0.
- **ambientPenalty**: heuristics on `ambient.dayOfWeek` and `ambient.localHour`. Examples: Friday after 15:00 → set to -0.5 for items tagged risky/deploy-related; first thing Monday → 0. Default 0 when no signal.

### 4. Score (deterministic)

Build the score input JSON:

```json
{
  "subagentReturns": [ ... your collected returns ... ],
  "weights": { ... from preflight ... },
  "observations": { ... from step 3 ... }
}
```

**shell** (pipe the JSON to stdin):

```bash
echo '<scoreInput-json>' | work-next score
```

Stdout will be the ranked output. Read it.

### 5. Render top-3

Use `prompts/present.md` for the rendering style. Show the user title, source, urgency score, one-line why-it-matters per item, then a short rationale paragraph that may reference the breakdown.

### 6. Append history

Build the history row:

```json
{
  "timestamp": "<ISO 8601 now>",
  "runtimeArgs": "<runtime args string or null>",
  "ambient": { ... },
  "subagentReturns": [ ... ],
  "finalRanking": [ first 3 entries from score output, with rank: 1|2|3 ],
  "userPick": null
}
```

**shell:**

```bash
echo '<historyRow-json>' | work-next history append
```

### 7. Check condensation

**shell:**

```bash
work-next history should-condense
```

Exit 0 ⇒ condensation triggered. Switch to `prompts/condense.md` and run the condensation flow (see that prompt).
Exit 1 ⇒ done.

### 8. Optional follow-up

If the user acts on a recommendation, call:

```bash
work-next history record-pick <rank> [--note "..."]
```

Where `<rank>` is `1`, `2`, `3`, or `null` (if they declined all).
