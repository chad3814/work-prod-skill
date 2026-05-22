# work-next

Decide what to work on next.

Subagents fan out to inspect your signal sources (PRs, Linear issues, etc.), each returns its single highest-priority item with an urgency score, and the main agent weighs them against your personal config plus runtime context to surface a ranked top-3.

## Install

```bash
git clone <repo-url> work-next
cd work-next
./install.sh
```

Requires Node 20+ and one of `claude` or `codex` on `$PATH` for the standalone CLI mode.

## Usage

Three invocation paths, same skill:

```bash
# Standalone CLI
work-next
work-next "big demo tomorrow, prioritize Postful"

# Inside Claude Code or codex session
/work-next
/work-next "big demo tomorrow"

# Auto-trigger: just ask
> What should I work on next?
```

## Configure

Configs live at `~/.config/work-next/` (override with `$WORK_NEXT_CONFIG_DIR`).

- `subagents.json` — which signal sources to evaluate; each has a `name`, `prompt`, `dataSources`, optional `enabled`/`timeoutMs`.
- `weights.json` — per-subagent multipliers and observation delta tuning knobs.

Validate:

```bash
work-next config validate
```

Show current config:

```bash
work-next config show
```

## How self-tuning works

Every run appends to `~/.config/work-next/history.jsonl`. Once the file reaches `condensation.historyLineThreshold` lines (default 200), the next invocation enters condensation mode: the main agent analyzes acceptance patterns and proposes weight changes. You approve all, approve some, or reject. On approval the new weights apply and history archives. On rejection, the threshold doubles (capped at 2000) so it doesn't pester you.

Force a condensation:

```bash
work-next condense
```

## Development

```bash
npm install
npm test                    # vitest
npm run lint
npm run typecheck
npm run build
npm run verify              # all of the above
```

Project layout:

- `src/lib/` — pure functions (schemas, scoring, history math)
- `src/commands/` — CLI subcommand handlers
- `src/cli.ts` — entry point with subcommand routing
- `skill/` — the markdown skill + prompts + defaults
- `tests/` — vitest unit tests mirroring `src/`

## Spec

See `docs/superpowers/specs/2026-05-22-work-next-skill-design.md` for the full design.
