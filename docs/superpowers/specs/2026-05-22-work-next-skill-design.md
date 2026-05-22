# work-next Skill — Design

**Status:** Approved for implementation planning
**Date:** 2026-05-22
**Owner:** Chad Walker

## Summary

A portable skill that helps the user decide what to work on next. The host AI agent (Claude Code, codex, or equivalent) fans out a configurable set of subagents in parallel, each evaluating a slice of signal (PRs, issues, etc.) and returning its single highest-priority item plus an urgency rating in `[0, 1]`. The main agent then applies personal weightings from config, layers in "outside observations" (cross-subagent correlations, runtime args, ambient context like day/time), and presents a ranked top-3 list with rationale.

The skill self-tunes over time: every run appends to a history log, and when the log exceeds a size threshold, the main agent proposes weight adjustments based on observed acceptance patterns. The user approves or rejects, history archives, and the loop continues.

## Goals

- One ranked top-3 list per invocation, with title, source, urgency score, and one-line rationale per item.
- Subagents defined in config (not hardcoded) so adding/removing a signal source is a config edit.
- Skill is host-agnostic: the markdown describes what to do; Claude Code, codex, etc. each use their native primitive to fan out.
- Three invocation paths share one skill: slash command (`/work-next`), CLI binary (`work-next`), and auto-trigger via skill description.
- Deterministic logic (config validation, scoring, history I/O, condensation triggers) lives in TypeScript and is unit-tested.
- Self-tuning: history → AI-proposed weight diff → user approval → updated config + archived history.

## Non-Goals (v1)

- Slack, Gmail, Calendar, Sentry, and local-git-state signals. These are deferred — v1 scope is PRs + issue trackers only.
- Fully automated condensation. v1 always gates weight changes on user approval.
- Plugin packaging. Directory structure is plugin-shaped, but no `plugin.json` ships in v1.
- LLM-driven scoring. The math is deterministic TypeScript; the LLM only handles dispatch, observation reasoning, presentation, and condensation analysis.

## Repo Layout

```
skill/
  SKILL.md                 # skill markdown (frontmatter + instructions)
  prompts/
    subagent.md            # template prompt fed to each subagent
    condense.md            # prompt used when condensing history → weights
    present.md             # prompt for final top-3 rendering
  defaults/
    subagents.json         # seed config: PRs + Linear subagents
    weights.json           # seed weights (all 1.0, default deltas/threshold)
src/
  cli.ts                   # `work-next` CLI entry point
  commands/
    config.ts              # `work-next config validate|show`
    history.ts             # `work-next history append|should-condense|archive|record-pick|show`
    score.ts               # `work-next score` (pure scoring, also exposed via CLI)
    weights.ts             # `work-next weights propose|apply`
    run.ts                 # `work-next` (default) — preps context, shells to claude/codex
  lib/
    config.ts              # load/validate subagents.json, weights.json
    history.ts             # JSONL append, size check, archive
    scoring.ts             # pure scoring function
    schema.ts              # zod schemas for all shapes
tests/
  *.test.ts                # vitest unit tests
package.json
tsconfig.json
install.sh                 # symlinks skill/ and CLI; seeds defaults
uninstall.sh               # removes symlinks; preserves user data
README.md
```

Runtime data lives outside the repo at `~/.config/work-next/`:

- `subagents.json` — list of subagent definitions
- `weights.json` — multipliers + tuning knobs
- `history.jsonl` — append-only log; archives to `history.archive.<timestamp>.jsonl`

## Components

1. **Skill (markdown + prompts)** — drives the LLM-in-host. Tells it how to fan out subagents, ask each one for its top item, assemble results, call CLI helpers, and present output.
2. **CLI (`work-next`)** — TypeScript binary. Two roles:
   - Deterministic utilities the skill shells out to (`config validate`, `score`, `history append`, `history should-condense`, `weights apply`).
   - Standalone entry point that wraps a `claude -p` / `codex -p` invocation pointed at the skill so the CLI and slash command share one source of truth.
3. **Config + history files** — user-owned under `~/.config/work-next/`. Skill and CLI both read/write.
4. **Installer** — symlinks `skill/` into `~/.claude/skills/` and the CLI binary into `$PATH`. Seeds defaults on first run.

## Data Shapes

`zod` schemas in `src/lib/schema.ts` mirror these at runtime.

### `subagents.json`

```ts
type SubagentsConfig = {
  version: 1;
  subagents: Subagent[];
};

type Subagent = {
  name: string;              // unique slug, e.g. "github-prs"
  description: string;       // one-line; shown in --list output
  prompt: string;            // task description fed to the subagent
  dataSources: string[];     // human-readable, e.g. ["GitHub MCP", "gh CLI"]
  enabled?: boolean;         // default true
  timeoutMs?: number;        // default 120000
};
```

### `weights.json`

```ts
type WeightsConfig = {
  version: 1;
  weights: Record<string, number>;   // subagentName -> multiplier (default 1.0)
  observationDeltas: {
    correlationBoost: number;        // default +0.10
    runtimeArgsBoost: number;        // default +0.20
    ambientPenalty: number;          // default -0.15
  };
  condensation: {
    historyLineThreshold: number;    // default 200
    lastReviewed?: string;           // ISO 8601 timestamp of last condensation review
  };
};
```

### `history.jsonl`

One JSON object per line, append-only:

```ts
type HistoryRow = {
  timestamp: string;                 // ISO 8601
  runtimeArgs: string | null;
  ambient: {
    dayOfWeek: string;
    localHour: number;
  };
  subagentReturns: Array<{
    name: string;
    item: { title: string; source: string; ref?: string } | null;
    urgency: number;                 // 0..1, raw from subagent
    rationale: string;
    status: "ok" | "timeout" | "invalid" | "unavailable";
  }>;
  finalRanking: Array<{
    name: string;
    title: string;
    score: number;                   // post-weight, post-observation
    rank: 1 | 2 | 3;
  }>;
  userPick: {
    rank: number | null;             // which one they chose (or null if none)
    note?: string;
  } | null;
};
```

### Score I/O

```ts
type ScoreInput = {
  subagentReturns: HistoryRow["subagentReturns"];
  weights: WeightsConfig;
  observations: {
    correlations: Array<{ subagentNames: string[]; reason: string }>;
    runtimeArgsRelevance: Record<string, number>;  // subagentName -> -1..1
    ambientPenalty: number;                         // -1..1
  };
};

type ScoreOutput = {
  ranked: Array<{
    subagentName: string;
    item: NonNullable<HistoryRow["subagentReturns"][number]["item"]>;
    rationale: string;
    rawUrgency: number;
    score: number;                   // final composite
    breakdown: {
      weight: number;
      correlationBoost: number;
      runtimeArgsDelta: number;
      ambientDelta: number;
    };
  }>;                                // sorted desc by score
};
```

### Scoring Formula (pure, testable)

```
score = clamp01(
  (rawUrgency * weights[subagentName])
  + (subagent in any correlation ? correlationBoost : 0)
  + ((runtimeArgsRelevance[subagentName] ?? 0) * runtimeArgsBoost)
  + (ambientApplies(subagentName) ? ambientPenalty : 0)
)
```

- `clamp01` clamps to `[0, 1]`.
- Ties break by subagent `name` ascending (deterministic).
- Subagent returns with `status != "ok"` or `urgency == 0` are filtered out before ranking.

## Data Flow — A Single Run

1. **Pre-flight (Bash, deterministic).** Skill runs `work-next config validate`. It loads both config files, validates against zod schemas, and emits a normalized JSON blob: `{subagents: [...enabled only], weights, ambient: {dayOfWeek, localHour}}`. On validation failure: non-zero exit with a structured error; skill stops and surfaces the errors to the user.
2. **Fan-out.** Skill iterates the normalized subagent list and spawns one parallel subagent per entry using the host's native primitive (Task tool in Claude Code, equivalent in codex). Each subagent receives its `prompt` plus the strict return contract: JSON matching `{item, urgency, rationale, status?}`. The subagent only sets `status` itself when reporting `"unavailable"` (data source down); for normal returns it omits `status` and the main agent records `"ok"`. The main agent assigns `"timeout"` or `"invalid"` based on its own observation of the subagent. Each subagent enforces its own `timeoutMs`.
3. **Collect returns.** Main agent waits for all subagents. Failed/timed-out subagents are logged with `status` ≠ `"ok"` but don't block the rest.
4. **Build observations.** Main agent reasons over collected returns to produce the `observations` object:
   - **Correlations:** items referencing the same entity across subagents (e.g. a PR mentioned in a Linear issue) → `{subagentNames, reason}` entries.
   - **Runtime args relevance:** if the user passed runtime args (e.g. `"big demo tomorrow, prioritize Postful"`), main agent scores each subagent's item from -1 to +1 for relevance.
   - **Ambient:** day-of-week + hour heuristics (e.g. Friday after 3pm → `ambientPenalty` applies to items tagged "deploy" / "risky").
5. **Score (Bash, deterministic).** Skill pipes returns + weights + observations into `work-next score`. Pure function. Returns ranked output. No LLM in the math.
6. **Render top-3.** Main agent uses `prompts/present.md` to render: title, source, urgency score, one-line why-it-matters, plus a short rationale paragraph that may reference the breakdown ("boosted because subagents A and B both surfaced this").
7. **Append history (Bash).** Skill runs `work-next history append < row.json`. One JSONL line written.
8. **Check condensation (Bash).** Skill runs `work-next history should-condense`. Exit 0 ⇒ trigger fired ⇒ enter condensation flow.
9. **Optional follow-up.** If the user acts on the output, skill calls `work-next history record-pick <rank> [--note "..."]` to update the last row's `userPick` field.

**Concurrency:** subagents run in parallel; CLI calls run sequentially (each <100ms).
**Time-of-day:** ambient is captured at preflight and frozen for the run.

## Condensation Flow

Triggered when step 8 in the run flow returns exit 0 (`history.jsonl` line count >= `weights.condensation.historyLineThreshold`).

1. **Load prompt.** Skill loads `prompts/condense.md`, feeds it the full `history.jsonl` plus current `weights.json`.
2. **Analyze patterns.** Main agent computes:
   - Per-subagent acceptance rate: how often `userPick.rank == 1` vs offered. Rows where `userPick` is `null` count toward neither.
   - Per-subagent score-vs-pick correlation: do high-scoring items from this subagent get picked?
   - Recurring `runtimeArgs` themes: terms appearing repeatedly and the subagents they consistently boost.
   - Ambient calibration: are Friday-afternoon scores well-calibrated against actual picks?
3. **Propose a diff.** Main agent outputs an explicit diff against current `weights.json` with reasoning, e.g.:
   ```
   github-prs:      1.0  →  1.2   (picked 45% of the time as #1; baseline 33%)
   linear-issues:   1.0  →  0.85  (offered 180×, picked 6%)
   observationDeltas.correlationBoost: 0.10 → 0.15 (correlated items picked 2× more often)
   ```
4. **Approval gate.** Three outcomes:
   - **Approve all** → main agent writes new `weights.json` via `work-next weights apply`, then runs `work-next history archive`.
   - **Approve some** → user picks specific lines; skill applies only those; archive happens.
   - **Reject** → no weight changes, but archive still happens, and `weights.condensation.lastReviewed` is stamped to "now" so we don't re-propose the same analysis on the next run.
5. **Bookkeeping (CLI).** Deterministic, unit-testable:
   - `work-next weights propose < diff.json` — validates a proposed diff, prints unified preview.
   - `work-next weights apply < approved-diff.json` — writes new `weights.json` atomically.
   - `work-next history archive` — renames `history.jsonl` → `history.archive.<timestamp>.jsonl`.

**Edge cases:**

- **Low signal (`userPick` set on < 20% of rows):** condensation prompt notes low signal and suggests smaller deltas.
- **Stalled condensation (user rejects):** on rejection, `historyLineThreshold` doubles before the next archive (200 → 400 → 800, capped at 2000) to avoid pestering. On **approve all** or **approve some**, the threshold resets to the default 200 — engagement is signal that the cadence is welcome.
- **Manual condensation:** `work-next condense` ignores threshold and forces the flow. Useful during tuning sessions.

## Error Handling

**Subagent failures.** Three failure modes, all recorded in history:

- **Timeout** — `{name, status: "timeout"}` recorded; subagent excluded from ranking.
- **Invalid JSON return** — `{name, status: "invalid", raw: <first 500 chars of return>}` recorded; subagent excluded. Skill does NOT retry the same prompt (signal that the subagent prompt may need tuning — surfaces in condensation).
- **Data source unavailable** (e.g. Linear MCP disconnected) — subagent itself must detect and return `{item: null, urgency: 0, rationale: "data source unavailable: <reason>", status: "unavailable"}`. Treated as "skip, don't rank".

If **all** subagents fail or return urgency 0, the skill produces a plain message: "No actionable items surfaced. Sources checked: [...]. You're probably clear — or a data source is down."

**Config errors.** `work-next config validate` is the gatekeeper. Structured error output:

```json
{ "ok": false, "errors": [{ "path": "subagents[2].timeoutMs", "message": "must be a positive integer" }] }
```

Skill renders these as a numbered list and stops. No partial runs with broken config.

**CLI atomicity.** All deterministic commands are idempotent or atomic:

- `history append` opens with `O_APPEND` semantics — concurrent runs don't interleave.
- `weights apply` writes to `weights.json.tmp` then renames — no half-written config.
- `history archive` is rename-based, instant.

**LLM hallucination of scores.** Scoring is pure TypeScript — the LLM never invents the ranking. If presentation prose phrases scores loosely, that's acceptable; the history row records the *computed* scores from `work-next score`, which is the ground truth for condensation.

## Testing

Per CLAUDE.md, all new features require unit tests. Tooling: `vitest`.

**Unit test coverage:**

- `lib/schema.ts` — round-trip every shape; reject malformed inputs (missing fields, wrong types, urgency outside `[0, 1]`).
- `lib/config.ts` — load valid configs; surface structured errors for invalid ones; verify default value application (`enabled`, `timeoutMs`, `observationDeltas`).
- `lib/scoring.ts` — parametric coverage:
  - Identity: all weights 1.0, no observations → `score == rawUrgency`.
  - Weight scaling at boundaries (0, 1, >1).
  - Correlation boost applies only to listed subagents.
  - Runtime-args delta math (-1 → -boost, +1 → +boost, 0 → 0).
  - Ambient penalty applies only to subagents flagged.
  - Clamping at both ends of `[0, 1]`.
  - Tie-break by name ascending is deterministic.
  - Filter: `status != "ok"` and `urgency == 0` excluded from ranking.
- `lib/history.ts` — `append` produces valid JSONL; `should-condense` returns correct boolean at boundary (199 lines = false, 200 = true); `archive` renames atomically; threshold escalation on rejection (200 → 400 → 800; cap at 2000); threshold reset to 200 on approval.
- `commands/*.ts` — argument parsing, exit codes, stdout/stderr separation, atomic file writes.

**Not unit-tested** (LLM-driven, prompts not code): subagent fan-out, observation building, presentation, condensation analysis. These are verified manually during development with fixture histories.

**CI checks** per CLAUDE.md "not done until verified" rule: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` must all pass before any task is marked complete.

## Install and Distribution

`install.sh`:

1. Verifies Node ≥ 20.
2. Runs `npm install && npm run build` → produces `dist/cli.js`.
3. Creates `~/.config/work-next/` if absent; seeds `subagents.json` + `weights.json` from `skill/defaults/`.
4. Symlinks `skill/` → `~/.claude/skills/work-next/`.
5. Symlinks `dist/cli.js` → `~/.local/bin/work-next` (with `#!/usr/bin/env node` shebang).
6. Prints post-install summary: invocation paths, config locations, history location.

`uninstall.sh` removes symlinks; leaves `~/.config/work-next/` intact (user data).

Plugin packaging is deferred. Directory layout is plugin-shaped, so wrapping in a `plugin.json` manifest later is straightforward.

## Open Questions for Implementation Plan

- Seed `subagents.json`: exact prompt text for the v1 PR and Linear subagents.
- Seed `weights.json`: confirm default `correlationBoost`/`runtimeArgsBoost`/`ambientPenalty` values match intent.
- Auto-trigger behavior: precise wording in skill description that activates on phrases like "what should I work on next" without false positives.
- Codex invocation: confirm the exact CLI flags for `codex -p` parity with `claude -p`.
