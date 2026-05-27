# Subagent Preflight Canary — Design

**Status:** Approved for implementation planning
**Date:** 2026-05-27
**Owner:** Chad Walker
**Builds on:** `docs/superpowers/specs/2026-05-22-work-next-skill-design.md`

## Summary

The `work-next` skill dispatches subagents that may call tools (CLI commands, MCP servers) which can hang indefinitely against dead endpoints — observed when Linear's SSE MCP transport was sunset and tool calls never returned, hanging a run for 20+ hours. Subagent dispatch in Claude Code is not a shell process we can `kill`, so a generic "watchdog after-the-fact" doesn't help. The fix is to detect dead data sources **before dispatch**: each subagent declares a cheap shell-command health check (canary) that the CLI's preflight runs with a tight wall-clock timeout. Failed canaries cause the subagent to be skipped — the LLM never spawns it — and the dispatch result is recorded as `status: "unavailable"` directly.

## Goals

- Prevent the skill from dispatching subagents against known-dead data sources.
- Canary logic lives in the CLI (deterministic, unit-testable) — not in LLM context.
- Per-subagent probe definition lives in `subagents.json` — users own their probe choices.
- Failure rationale (stderr or timeout message) flows through to the `subagentReturns` history row, so condensation analysis can see how often each subagent's source was unavailable.
- Backward compatible — existing configs without a `canary` field continue to work.

## Non-Goals (v1)

- Runtime kill / watchdog on a subagent that's already dispatched. Subagent runtime in Claude Code can't be externally killed; that's a separate problem.
- Built-in probe types (e.g. typed `mcp-http`, `cli-exec`). Users specify their own shell command for maximum flexibility.
- MCP-aware probe helpers. We can't issue MCP tool calls from a CLI process — users probe MCP transports with `curl` or similar if they want.
- Retry / circuit-breaker state across runs. Each run probes from scratch.
- Configurable disable flag for the canary check. Add later if needed.

## Config Change — `subagents.json`

New optional `canary` field on each subagent:

```ts
type Subagent = {
  // ... existing fields ...
  canary?: {
    cmd: string[];          // argv (no shell, no interpolation)
    timeoutMs?: number;     // wall-clock budget; default 5000
  };
};
```

- `cmd` is an argv array passed directly to `child_process.spawn` — no shell interpretation, no injection surface.
- `timeoutMs` default: `5000`.
- Absent `canary` → the subagent is treated as healthy (no probe runs).

Zod schema in `src/lib/schema.ts` adds a `CanarySchema` object; `SubagentSchema` adds `canary: CanarySchema.optional()`.

## CLI Behavior — `work-next config validate`

### Current output

```json
{ "ok": true, "subagents": [...], "weights": {...}, "ambient": {...} }
```

### New output

```json
{
  "ok": true,
  "subagents": [ /* healthy, enabled subagents */ ],
  "unavailable": [
    {
      "name": "linear-issues",
      "reason": "canary timed out after 5000ms",
      "stderr": ""
    }
  ],
  "weights": {...},
  "ambient": {...}
}
```

For each enabled subagent with a `canary`:

1. Spawn `cmd[0]` with `cmd.slice(1)` as args via `child_process.spawn`.
2. Apply wall-clock timeout via `AbortSignal.timeout(timeoutMs)`.
3. Wait for exit. Capture stderr (truncate to ~500 chars).
4. Classify:
   - Exit 0 → healthy. Keep in `subagents`.
   - Exit non-zero → unavailable. Move to `unavailable` with `reason: "canary exited with code N"` and captured stderr.
   - Timeout → unavailable with `reason: "canary timed out after Nms"`.

Subagents without a `canary` field skip the probe entirely and remain in `subagents`.

If **every** subagent is unavailable, the CLI still exits 0 (a valid empty preflight result; the LLM presents the "no actionable items, sources checked" message per existing flow). Config-validation errors (bad JSON, missing file, schema violation) still exit non-zero per existing behavior.

## SKILL.md Update

Step 1 (preflight) currently says: "Parse the stdout JSON. It has shape `{ok, subagents, weights, ambient}`. If exit code != 0, render errors and stop."

Updated step 1 adds: "Parse `unavailable` as well. For each entry, create a `subagentReturns` row at orchestration time with `status: 'unavailable'`, `item: null`, `urgency: 0`, and `rationale` set to the canary's reason (and stderr if present). Do NOT dispatch a subagent for any entry in `unavailable` — go straight to step 2 for `subagents` only."

The downstream flow (observations, score, history append) is unchanged — those already handle `status: 'unavailable'` entries correctly because of the work already done in Tasks 4–6.

## Seed Config Update

`skill/defaults/subagents.json`:

- `github-prs` gets `canary: { cmd: ["gh", "auth", "status"], timeoutMs: 5000 }`. This catches the common case of `gh` not being installed or auth being expired.
- `linear-issues` gets **no** canary by default. The CLI can't reliably probe a Linear MCP endpoint without knowing the user's `~/.claude.json` config, and an authentication-failed-but-transport-up endpoint would falsely pass a curl probe. Users add their own canary command if they want one.

## Architecture

New file: `src/lib/canary.ts`.

```ts
export type CanaryResult =
  | { ok: true }
  | { ok: false; reason: string; stderr: string };

export async function runCanary(
  cmd: string[],
  timeoutMs: number,
): Promise<CanaryResult>;
```

Uses `child_process.spawn` + `AbortSignal.timeout(timeoutMs)`. Captures stderr to a bounded buffer (cap 500 chars), waits for `close` event, returns based on exit code or abort signal.

`src/commands/config.ts` is updated:

1. Loads configs (unchanged).
2. After filtering enabled subagents, iterates them concurrently and runs `runCanary` for each that has a `canary` field.
3. Partitions into `subagents` (healthy) and `unavailable` (failed).
4. Emits the new JSON shape.

## Data Flow

1. Skill runs `work-next config validate`.
2. CLI loads configs, filters enabled, runs canaries in parallel.
3. CLI emits `{ok, subagents, unavailable, weights, ambient}`.
4. Skill parses output. For each entry in `unavailable`, pre-populates a `subagentReturns` row with `status: "unavailable"`.
5. Skill dispatches subagents in `subagents` (only).
6. Skill merges dispatched returns with the pre-populated unavailable rows.
7. Score / history / present flow proceed unchanged.

## Error Handling

- **Canary command not found** (`ENOENT` from spawn) → unavailable with `reason: "canary command not found: <cmd[0]>"`.
- **Spawn permission denied** → unavailable with the OS error message in `reason`.
- **Canary command writes massive output** → stderr capped at 500 chars; subsequent output is dropped.
- **Canary exits 0 but writes to stderr** → still considered healthy. Exit code is the contract; stderr is informational only.
- **Disabled subagents** → still filtered out before canary runs. No probe wasted on disabled subagents.

## Testing

### New `tests/lib/canary.test.ts`

- Success: canary cmd `node -e "process.exit(0)"` returns `{ok: true}`.
- Non-zero exit: `node -e "process.exit(2)"` returns `{ok: false, reason: matches /exited.*2/}`.
- Timeout: `node -e "setTimeout(() => {}, 10000)"` with `timeoutMs: 100` returns `{ok: false, reason: matches /timed out/}`.
- Captures stderr: `node -e "process.stderr.write('boom'); process.exit(1)"` returns `stderr: "boom"`.
- Stderr cap: ensures stderr is truncated to 500 chars (test with a long stderr writer).
- Command not found: `cmd: ["nonexistent-binary"]` returns `{ok: false, reason: matches /not found/i}`.

### `tests/lib/schema.test.ts` additions

- Accepts subagent with `canary: {cmd: ["gh"], timeoutMs: 5000}`.
- Accepts subagent without `canary` (backward compatible).
- Rejects `canary: {cmd: []}` (empty cmd is invalid — needs at least one element).
- Rejects `canary: {cmd: ["x"], timeoutMs: 0}` (positive int required).

### `tests/commands/config.test.ts` updates

- Healthy canary → subagent appears in `subagents`, NOT in `unavailable`.
- Failed canary → subagent in `unavailable` with the failure reason, NOT in `subagents`.
- Missing canary → subagent in `subagents` (healthy by default).
- Mixed: one healthy, one failed → correct partitioning, both appear in correct list.
- Disabled subagent with a (would-fail) canary → never probed, not in either list.

Canary in command tests is invoked via real `runCanary` against trivial commands like `node -e "..."` — no mocking. Keeps tests honest.

## Backward Compatibility

- Existing `subagents.json` files without `canary` fields continue to work (no probe runs).
- Existing skills consuming preflight output already iterate the `subagents` field — they see only healthy subagents, same as before. The new `unavailable` field is additive; consumers that don't read it lose only the explanatory message about why subagents are missing.
- The SKILL.md update is the only change needed for the host LLM to take advantage of the new field. Without that update, the LLM dispatches only healthy subagents but doesn't record `status: "unavailable"` entries for the canary-failed ones — slightly degraded condensation signal but no functional break.

## Open Questions for Implementation Plan

- Exact JSON shape of stderr truncation indicator. (Suggest: append `"…[truncated]"` if cut, or just hard-truncate. Decide during implementation.)
- Whether `runCanary` should also capture stdout for logging/debugging, or only stderr. (Suggest: stderr only — stdout from a health check is rarely useful and we're capping bytes anyway.)
- Whether to expose a `work-next canary <subagent-name>` debug subcommand for users to test their canary commands. (Suggest: defer — `work-next config validate` already prints the result.)
