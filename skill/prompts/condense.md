# Condensation prompt

The history file `~/.config/work-next/history.jsonl` has reached the size threshold. Analyze it and propose weight adjustments.

## Step 1: Load current state

**shell:**

```bash
work-next config show
work-next history show
```

## Step 2: Analyze

Compute, per-subagent across all history rows:

- **Acceptance rate as #1**: of runs where this subagent's item was rank 1, how often did the user pick rank 1? Skip rows where `userPick` is null.
- **Offered vs picked**: how often this subagent's item appeared at all vs was picked at any rank.
- **Score-vs-pick correlation**: do high-scoring items from this subagent get picked, or do users tend to skip them?
- **Runtime args themes**: are there recurring terms in `runtimeArgs` that consistently correlate with picks from specific subagents?
- **Ambient calibration**: are scores on Friday afternoons / late evenings predictive of actual picks?

Note: if fewer than 20% of rows have `userPick` set, treat the signal as weak — propose smaller deltas (or only structural changes).

## Step 3: Propose a diff

Output a proposed full `weights.json` (not a partial). Show a unified diff to the user using:

```bash
echo '<proposed-weights-json>' | work-next weights propose
```

Format the user-facing message:

```
Proposed weight changes (based on N runs, U userPicks):

<diff lines from `weights propose`>

Reasoning: <one short paragraph>

Approve all? (yes / partial / no)
```

## Step 4: Approval gate

Wait for user response.

- **yes** (approve all):
  ```bash
  echo '<proposed-weights-json>' | work-next weights apply
  work-next history archive
  ```
  Also, since the user engaged, the threshold should reset. Build a new `weights.json` with `condensation.historyLineThreshold: 200` (default) and apply via `work-next weights apply`. (Use the version of the proposed config that already has any other approved changes.)

- **partial**: ask user to specify which lines to apply. Build a partial weights.json that merges current + approved changes, then `work-next weights apply` followed by `work-next history archive`. Reset threshold to 200 as above.

- **no**: do not change weights, but archive history anyway: `work-next history archive`. Build a new weights.json where `condensation.historyLineThreshold` is `min(current * 2, 2000)` and `condensation.lastReviewed` is the current ISO timestamp. Apply with `work-next weights apply`.

Confirm to the user what happened in 1-2 sentences.
