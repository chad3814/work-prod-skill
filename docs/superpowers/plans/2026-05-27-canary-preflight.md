# Canary Preflight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-subagent health-check canaries to the `work-next config validate` preflight so dead data sources (e.g. Linear's removed SSE transport) are detected before the host LLM dispatches subagents against them.

**Architecture:** Each subagent in `subagents.json` gets an optional `canary` field with a shell command (argv array) and timeout. The CLI's preflight spawns each canary with `child_process.spawn` and a wall-clock budget via `AbortSignal.timeout`; results partition subagents into healthy (`subagents`) vs failed (`unavailable`) in the JSON output. The skill's SKILL.md is updated so the host LLM pre-populates `subagentReturns` with `status: "unavailable"` rows for canary failures and skips dispatch for those subagents.

**Tech Stack:** Node ≥ 20 (for `AbortSignal.timeout` on `spawn`), TypeScript 5.x, zod, vitest. No new runtime dependencies.

**Reference spec:** `docs/superpowers/specs/2026-05-27-canary-preflight-design.md`

**Project CLAUDE.md notes:**
- Confirm with the user before each `git commit` step.
- All commits use `--no-gpg-sign`.
- 2-space indents, semicolons, NO `any` or `unknown` in TS code.
- After each task confirm `npm run verify` passes (lint + typecheck + tests + build).

---

## File Structure (locked in here)

```
src/lib/
  schema.ts                  # ADD CanarySchema, ADD canary?: optional on SubagentSchema
  canary.ts                  # NEW: runCanary(cmd, timeoutMs) -> Promise<CanaryResult>
src/commands/
  config.ts                  # CHANGE: async; call runCanary; emit {subagents, unavailable, ...}
src/cli.ts                   # CHANGE: await runConfigCommand
tests/lib/
  schema.test.ts             # ADD tests for canary field
  canary.test.ts             # NEW: full coverage of runCanary
tests/commands/
  config.test.ts             # CHANGE: await calls; ADD canary-partition tests
skill/
  SKILL.md                   # CHANGE: step 1 instructs handling of unavailable[]
  defaults/subagents.json    # ADD canary to github-prs entry
```

---

## Task 1: Schema additions for `canary` field

**Files:**
- Modify: `src/lib/schema.ts`
- Modify: `tests/lib/schema.test.ts`

- [ ] **Step 1: Write failing tests in `tests/lib/schema.test.ts`**

Add these tests inside the existing `describe('SubagentsConfigSchema', ...)` block:

```ts
it('accepts subagent with canary field', () => {
  const valid = {
    version: 1,
    subagents: [
      {
        name: 'x',
        description: 'd',
        prompt: 'p',
        dataSources: [],
        canary: { cmd: ['gh', 'auth', 'status'], timeoutMs: 5000 },
      },
    ],
  };
  expect(() => SubagentsConfigSchema.parse(valid)).not.toThrow();
});

it('accepts subagent without canary (backward compatible)', () => {
  const valid = {
    version: 1,
    subagents: [{ name: 'x', description: 'd', prompt: 'p', dataSources: [] }],
  };
  const parsed = SubagentsConfigSchema.parse(valid);
  expect(parsed.subagents[0]?.canary).toBeUndefined();
});

it('rejects canary with empty cmd array', () => {
  expect(() =>
    SubagentsConfigSchema.parse({
      version: 1,
      subagents: [
        {
          name: 'x',
          description: 'd',
          prompt: 'p',
          dataSources: [],
          canary: { cmd: [], timeoutMs: 5000 },
        },
      ],
    }),
  ).toThrow();
});

it('rejects canary with zero or negative timeoutMs', () => {
  expect(() =>
    SubagentsConfigSchema.parse({
      version: 1,
      subagents: [
        {
          name: 'x',
          description: 'd',
          prompt: 'p',
          dataSources: [],
          canary: { cmd: ['gh'], timeoutMs: 0 },
        },
      ],
    }),
  ).toThrow();
});

it('canary timeoutMs is optional (has default applied at runtime by config loader)', () => {
  const valid = {
    version: 1,
    subagents: [
      {
        name: 'x',
        description: 'd',
        prompt: 'p',
        dataSources: [],
        canary: { cmd: ['gh', 'auth', 'status'] },
      },
    ],
  };
  expect(() => SubagentsConfigSchema.parse(valid)).not.toThrow();
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npm test -- tests/lib/schema.test.ts`
Expected: 5 new tests fail because `CanarySchema` and the `canary` field don't exist.

- [ ] **Step 3: Add CanarySchema and field in `src/lib/schema.ts`**

Find the `SubagentSchema` declaration. Above it (before `SubagentSchema`), add:

```ts
export const CanarySchema = z.object({
  cmd: z.array(z.string().min(1)).min(1),
  timeoutMs: z.number().int().positive().optional(),
});
export type Canary = z.infer<typeof CanarySchema>;
```

Then modify `SubagentSchema` to include the new optional field:

```ts
export const SubagentSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  prompt: z.string().min(1),
  dataSources: z.array(z.string()),
  enabled: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional(),
  canary: CanarySchema.optional(),
});
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm test -- tests/lib/schema.test.ts`
Expected: all schema tests pass (21 total — 16 existing + 5 new).

- [ ] **Step 5: Run full verify**

Run: `npm run verify`
Expected: all green (lint + typecheck + tests + build).

- [ ] **Step 6: Commit** (confirm with user first)

```bash
git add src/lib/schema.ts tests/lib/schema.test.ts
git commit --no-gpg-sign -m "feat(schema): add optional canary field to SubagentSchema"
```

---

## Task 2: `runCanary` helper

**Files:**
- Create: `src/lib/canary.ts`
- Create: `tests/lib/canary.test.ts`

- [ ] **Step 1: Write failing tests at `tests/lib/canary.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { runCanary } from '../../src/lib/canary.js';

describe('runCanary', () => {
  it('returns ok when command exits 0', async () => {
    const result = await runCanary(['node', '-e', 'process.exit(0)'], 5000);
    expect(result.ok).toBe(true);
  });

  it('returns failure when command exits non-zero', async () => {
    const result = await runCanary(['node', '-e', 'process.exit(2)'], 5000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/exited.*2/i);
    }
  });

  it('returns failure when command times out', async () => {
    const result = await runCanary(
      ['node', '-e', 'setTimeout(() => {}, 10000)'],
      100,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/timed out.*100/i);
    }
  });

  it('captures stderr from failed canary', async () => {
    const result = await runCanary(
      ['node', '-e', "process.stderr.write('boom'); process.exit(1)"],
      5000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stderr).toBe('boom');
    }
  });

  it('caps stderr at 500 chars', async () => {
    const result = await runCanary(
      [
        'node',
        '-e',
        "process.stderr.write('x'.repeat(2000)); process.exit(1)",
      ],
      5000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stderr.length).toBe(500);
      expect(result.stderr).toBe('x'.repeat(500));
    }
  });

  it('returns "not found" when command does not exist', async () => {
    const result = await runCanary(['this-binary-does-not-exist-xyz'], 5000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/not found/i);
    }
  });

  it('returns failure when cmd is empty', async () => {
    const result = await runCanary([], 5000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/empty/i);
    }
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npm test -- tests/lib/canary.test.ts`
Expected: all 7 tests fail (module not found).

- [ ] **Step 3: Implement `src/lib/canary.ts`**

```ts
import { spawn } from 'node:child_process';

export type CanaryResult = { ok: true } | { ok: false; reason: string; stderr: string };

const STDERR_CAP = 500;

export function runCanary(cmd: string[], timeoutMs: number): Promise<CanaryResult> {
  return new Promise((resolve) => {
    const [binary, ...args] = cmd;
    if (binary === undefined) {
      resolve({ ok: false, reason: 'canary cmd is empty', stderr: '' });
      return;
    }

    let resolved = false;
    const finish = (result: CanaryResult): void => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    const signal = AbortSignal.timeout(timeoutMs);
    let stderr = '';

    let child;
    try {
      child = spawn(binary, args, { signal });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      finish({ ok: false, reason: `canary spawn failed: ${msg}`, stderr: '' });
      return;
    }

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length >= STDERR_CAP) return;
      const remaining = STDERR_CAP - stderr.length;
      stderr += chunk.toString('utf8').slice(0, remaining);
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        finish({ ok: false, reason: `canary command not found: ${binary}`, stderr });
        return;
      }
      if (signal.aborted) {
        finish({ ok: false, reason: `canary timed out after ${timeoutMs}ms`, stderr });
        return;
      }
      finish({ ok: false, reason: `canary error: ${err.message}`, stderr });
    });

    child.on('close', (code) => {
      if (signal.aborted) {
        finish({ ok: false, reason: `canary timed out after ${timeoutMs}ms`, stderr });
        return;
      }
      if (code === 0) {
        finish({ ok: true });
        return;
      }
      finish({ ok: false, reason: `canary exited with code ${code}`, stderr });
    });
  });
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm test -- tests/lib/canary.test.ts`
Expected: all 7 tests pass.

- [ ] **Step 5: Run full verify**

Run: `npm run verify`
Expected: all green.

- [ ] **Step 6: Commit** (confirm with user first)

```bash
git add src/lib/canary.ts tests/lib/canary.test.ts
git commit --no-gpg-sign -m "feat(canary): add runCanary helper with timeout + stderr capture"
```

---

## Task 3: Config command integration + CLI await

This is the largest task. Three changes happen together because they cross a sync→async boundary:
1. `runConfigCommand` becomes async.
2. `src/cli.ts` awaits the config command.
3. Existing config tests get `await`; new canary-partition tests added.

**Files:**
- Modify: `src/commands/config.ts`
- Modify: `src/cli.ts`
- Modify: `tests/commands/config.test.ts`

- [ ] **Step 1: Update existing tests to await + add new canary-partition tests**

Edit `tests/commands/config.test.ts`. The existing 5 tests call `runConfigCommand({...})` synchronously and expect a `CommandResult`. They must be changed to `await runConfigCommand({...})`, and the test functions become `async`.

Apply this transformation to all 5 existing tests:

Before:
```ts
it('returns ok JSON on stdout when both files valid', () => {
  seedValid(dir);
  const result = runConfigCommand({ stdin: '', argv: ['validate'], configDir: dir });
  // ...
});
```

After:
```ts
it('returns ok JSON on stdout when both files valid', async () => {
  seedValid(dir);
  const result = await runConfigCommand({ stdin: '', argv: ['validate'], configDir: dir });
  // ...
});
```

Repeat for all 5 existing tests (`returns ok...`, `filters out disabled...`, `returns non-zero with structured errors...`, `show subcommand...`, `errors when subcommand missing`).

Then add a new `describe` block at the bottom of the file:

```ts
describe('runConfigCommand validate with canary', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir(); });
  afterEach(() => { cleanupTempDir(dir); });

  function seedWeights(): void {
    writeFileSync(
      join(dir, 'weights.json'),
      JSON.stringify({
        version: 1,
        weights: {},
        observationDeltas: { correlationBoost: 0, runtimeArgsBoost: 0, ambientPenalty: 0 },
        condensation: { historyLineThreshold: 200 },
      }),
    );
  }

  it('keeps subagent in subagents[] when canary passes', async () => {
    seedWeights();
    writeFileSync(
      join(dir, 'subagents.json'),
      JSON.stringify({
        version: 1,
        subagents: [
          {
            name: 'healthy',
            description: 'd',
            prompt: 'p',
            dataSources: [],
            canary: { cmd: ['node', '-e', 'process.exit(0)'], timeoutMs: 5000 },
          },
        ],
      }),
    );
    const result = await runConfigCommand({ stdin: '', argv: ['validate'], configDir: dir });
    expect(result.exitCode).toBe(0);
    type Parsed = { subagents: Array<{ name: string }>; unavailable: Array<{ name: string }> };
    const parsed = JSON.parse(result.stdout) as Parsed;
    expect(parsed.subagents.map((s) => s.name)).toEqual(['healthy']);
    expect(parsed.unavailable).toEqual([]);
  });

  it('moves subagent to unavailable[] when canary exits non-zero', async () => {
    seedWeights();
    writeFileSync(
      join(dir, 'subagents.json'),
      JSON.stringify({
        version: 1,
        subagents: [
          {
            name: 'broken',
            description: 'd',
            prompt: 'p',
            dataSources: [],
            canary: { cmd: ['node', '-e', 'process.exit(1)'], timeoutMs: 5000 },
          },
        ],
      }),
    );
    const result = await runConfigCommand({ stdin: '', argv: ['validate'], configDir: dir });
    expect(result.exitCode).toBe(0);
    type Parsed = {
      subagents: Array<{ name: string }>;
      unavailable: Array<{ name: string; reason: string; stderr: string }>;
    };
    const parsed = JSON.parse(result.stdout) as Parsed;
    expect(parsed.subagents).toEqual([]);
    expect(parsed.unavailable).toHaveLength(1);
    expect(parsed.unavailable[0]?.name).toBe('broken');
    expect(parsed.unavailable[0]?.reason).toMatch(/exited.*1/i);
  });

  it('subagent without canary stays in subagents[] (no probe run)', async () => {
    seedWeights();
    writeFileSync(
      join(dir, 'subagents.json'),
      JSON.stringify({
        version: 1,
        subagents: [
          { name: 'no-canary', description: 'd', prompt: 'p', dataSources: [] },
        ],
      }),
    );
    const result = await runConfigCommand({ stdin: '', argv: ['validate'], configDir: dir });
    type Parsed = { subagents: Array<{ name: string }>; unavailable: Array<unknown> };
    const parsed = JSON.parse(result.stdout) as Parsed;
    expect(parsed.subagents.map((s) => s.name)).toEqual(['no-canary']);
    expect(parsed.unavailable).toEqual([]);
  });

  it('partitions mixed: one healthy, one failed', async () => {
    seedWeights();
    writeFileSync(
      join(dir, 'subagents.json'),
      JSON.stringify({
        version: 1,
        subagents: [
          {
            name: 'ok-one',
            description: 'd',
            prompt: 'p',
            dataSources: [],
            canary: { cmd: ['node', '-e', 'process.exit(0)'], timeoutMs: 5000 },
          },
          {
            name: 'bad-one',
            description: 'd',
            prompt: 'p',
            dataSources: [],
            canary: { cmd: ['node', '-e', 'process.exit(7)'], timeoutMs: 5000 },
          },
        ],
      }),
    );
    const result = await runConfigCommand({ stdin: '', argv: ['validate'], configDir: dir });
    type Parsed = {
      subagents: Array<{ name: string }>;
      unavailable: Array<{ name: string }>;
    };
    const parsed = JSON.parse(result.stdout) as Parsed;
    expect(parsed.subagents.map((s) => s.name)).toEqual(['ok-one']);
    expect(parsed.unavailable.map((u) => u.name)).toEqual(['bad-one']);
  });

  it('disabled subagent is never probed (not in subagents nor unavailable)', async () => {
    seedWeights();
    writeFileSync(
      join(dir, 'subagents.json'),
      JSON.stringify({
        version: 1,
        subagents: [
          {
            name: 'disabled',
            description: 'd',
            prompt: 'p',
            dataSources: [],
            enabled: false,
            canary: { cmd: ['node', '-e', 'process.exit(1)'], timeoutMs: 5000 },
          },
        ],
      }),
    );
    const result = await runConfigCommand({ stdin: '', argv: ['validate'], configDir: dir });
    type Parsed = { subagents: Array<unknown>; unavailable: Array<unknown> };
    const parsed = JSON.parse(result.stdout) as Parsed;
    expect(parsed.subagents).toEqual([]);
    expect(parsed.unavailable).toEqual([]);
  });

  it('canary timeout moves subagent to unavailable[]', async () => {
    seedWeights();
    writeFileSync(
      join(dir, 'subagents.json'),
      JSON.stringify({
        version: 1,
        subagents: [
          {
            name: 'slow',
            description: 'd',
            prompt: 'p',
            dataSources: [],
            canary: {
              cmd: ['node', '-e', 'setTimeout(() => {}, 10000)'],
              timeoutMs: 200,
            },
          },
        ],
      }),
    );
    const result = await runConfigCommand({ stdin: '', argv: ['validate'], configDir: dir });
    type Parsed = {
      subagents: Array<unknown>;
      unavailable: Array<{ name: string; reason: string }>;
    };
    const parsed = JSON.parse(result.stdout) as Parsed;
    expect(parsed.subagents).toEqual([]);
    expect(parsed.unavailable[0]?.name).toBe('slow');
    expect(parsed.unavailable[0]?.reason).toMatch(/timed out/i);
  });
});
```

- [ ] **Step 2: Run tests, confirm failures**

Run: `npm test -- tests/commands/config.test.ts`
Expected: existing tests fail because `await` on a sync function returns a Promise wrapping the sync result, which won't have `.exitCode` etc. New canary tests also fail (no canary partition logic exists).

Note: depending on TS strict mode, the `await` on a sync return may resolve to the same value; the test failures will be on `unavailable` being undefined for new tests, and possibly other side effects. Either way, tests should fail and confirm the need for implementation.

- [ ] **Step 3: Update `src/commands/config.ts` to async + canary integration**

Replace the entire contents of `src/commands/config.ts` with:

```ts
import { loadSubagentsConfig, loadWeightsConfig } from '../lib/config.js';
import { runCanary } from '../lib/canary.js';
import type { Subagent } from '../lib/schema.js';
import type { CommandIO, CommandResult } from './types.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_CANARY_TIMEOUT_MS = 5000;

type UnavailableEntry = { name: string; reason: string; stderr: string };

function ambient(): { dayOfWeek: string; localHour: number } {
  const now = new Date();
  const day = DAY_NAMES[now.getDay()];
  if (day === undefined) throw new Error('unreachable: invalid day index');
  return { dayOfWeek: day, localHour: now.getHours() };
}

async function partitionByCanary(
  enabled: Subagent[],
): Promise<{ healthy: Subagent[]; unavailable: UnavailableEntry[] }> {
  const probes = enabled.map(async (s): Promise<{ subagent: Subagent; unavailable: UnavailableEntry | null }> => {
    if (s.canary === undefined) {
      return { subagent: s, unavailable: null };
    }
    const timeoutMs = s.canary.timeoutMs ?? DEFAULT_CANARY_TIMEOUT_MS;
    const result = await runCanary(s.canary.cmd, timeoutMs);
    if (result.ok) {
      return { subagent: s, unavailable: null };
    }
    return {
      subagent: s,
      unavailable: { name: s.name, reason: result.reason, stderr: result.stderr },
    };
  });
  const results = await Promise.all(probes);
  const healthy: Subagent[] = [];
  const unavailable: UnavailableEntry[] = [];
  for (const r of results) {
    if (r.unavailable === null) {
      healthy.push(r.subagent);
    } else {
      unavailable.push(r.unavailable);
    }
  }
  return { healthy, unavailable };
}

export async function runConfigCommand(io: CommandIO): Promise<CommandResult> {
  const sub = io.argv[0];
  if (sub === undefined) {
    return { exitCode: 2, stdout: '', stderr: 'config: missing subcommand (validate|show)\n' };
  }
  const dir = io.configDir;
  if (dir === undefined) {
    return { exitCode: 2, stdout: '', stderr: 'config: configDir is required\n' };
  }
  if (sub === 'validate') {
    const subs = loadSubagentsConfig(dir);
    const weights = loadWeightsConfig(dir);
    if (!subs.ok || !weights.ok) {
      const errors = [...(subs.ok ? [] : subs.errors), ...(weights.ok ? [] : weights.errors)];
      return {
        exitCode: 1,
        stdout: `${JSON.stringify({ ok: false, errors })}\n`,
        stderr: '',
      };
    }
    const enabled = subs.value.subagents.filter((s) => s.enabled);
    const { healthy, unavailable } = await partitionByCanary(enabled);
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({
        ok: true,
        subagents: healthy,
        unavailable,
        weights: weights.value,
        ambient: ambient(),
      })}\n`,
      stderr: '',
    };
  }
  if (sub === 'show') {
    const subs = loadSubagentsConfig(dir);
    const weights = loadWeightsConfig(dir);
    if (!subs.ok || !weights.ok) {
      const errors = [...(subs.ok ? [] : subs.errors), ...(weights.ok ? [] : weights.errors)];
      return { exitCode: 1, stdout: `${JSON.stringify({ ok: false, errors })}\n`, stderr: '' };
    }
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({ subagents: subs.value, weights: weights.value })}\n`,
      stderr: '',
    };
  }
  return { exitCode: 2, stdout: '', stderr: `config: unknown subcommand "${sub}"\n` };
}
```

- [ ] **Step 4: Update `src/cli.ts` to await config command**

Find the switch case for `config`:

```ts
    case 'config':
      result = runConfigCommand(io);
      break;
```

Change to:

```ts
    case 'config':
      result = await runConfigCommand(io);
      break;
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npm test -- tests/commands/config.test.ts`
Expected: all 11 tests pass (5 existing + 6 new canary).

- [ ] **Step 6: Run full verify**

Run: `npm run verify`
Expected: all green. Watch for TypeScript errors around the sync→async transition.

- [ ] **Step 7: Smoke test against the installed CLI**

Run: `WORK_NEXT_CONFIG_DIR=/tmp/wn-canary-smoke mkdir -p /tmp/wn-canary-smoke`
Run: `cp skill/defaults/* /tmp/wn-canary-smoke/`

Edit `/tmp/wn-canary-smoke/subagents.json` to add an intentionally-failing canary to one entry (e.g. github-prs:`{"cmd": ["false"], "timeoutMs": 1000}`), then:

Run: `WORK_NEXT_CONFIG_DIR=/tmp/wn-canary-smoke node dist/cli.js config validate`
Expected: exit 0; stdout contains an `unavailable` array with the github-prs entry.

Restore the file or remove the temp dir afterwards.

- [ ] **Step 8: Commit** (confirm with user first)

```bash
git add src/commands/config.ts src/cli.ts tests/commands/config.test.ts
git commit --no-gpg-sign -m "feat(config): run canary probes during preflight and partition subagents"
```

---

## Task 4: SKILL.md update

**Files:**
- Modify: `skill/SKILL.md`

No tests — this is documentation that drives LLM behavior. Verification is by reading.

- [ ] **Step 1: Update SKILL.md step 1**

Open `skill/SKILL.md`. Find the section that begins with `### 1. Preflight`.

The current contents describe parsing `{ok, subagents, weights, ambient}`. Replace that section with:

```markdown
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
```

- [ ] **Step 2: Verify the rest of SKILL.md still flows**

Read through the file from top to bottom. Confirm:
- Step 2 says "For each entry in `subagents`" — should still be correct.
- The contract for subagent return is unchanged.
- Step 6 (append history) still describes building the row from all returns — the pre-populated unavailable rows go into `subagentReturns` along with the dispatched returns.

No code change needed beyond Step 1.

- [ ] **Step 3: Run full verify** (no tests changed but check nothing broke)

Run: `npm run verify`
Expected: all green.

- [ ] **Step 4: Commit** (confirm with user first)

```bash
git add skill/SKILL.md
git commit --no-gpg-sign -m "docs(skill): instruct host to handle unavailable[] from canary preflight"
```

---

## Task 5: Seed config — add canary to github-prs

**Files:**
- Modify: `skill/defaults/subagents.json`

- [ ] **Step 1: Update `skill/defaults/subagents.json`**

Locate the `github-prs` entry. Add a `canary` field. The full entry becomes:

```json
{
  "name": "github-prs",
  "description": "GitHub PRs awaiting your action (review requested, comments to address, failing CI on your PRs)",
  "prompt": "Use the `gh` CLI (or GitHub MCP if available) to identify the single most urgent GitHub PR the user should act on. Consider: PRs where the user is requested as a reviewer (especially older ones), the user's own PRs with new comments or failing CI, and PRs blocking other work. Pick the single highest-priority one. Rationale should be 1-2 sentences. Set urgency in [0, 1]: 1 = blocking someone right now, 0.7 = stale review request > 2 days, 0.4 = recent review request, 0.2 = own PR with minor comments, 0 = nothing actionable.",
  "dataSources": ["gh CLI", "GitHub MCP"],
  "enabled": true,
  "timeoutMs": 120000,
  "canary": {
    "cmd": ["gh", "auth", "status"],
    "timeoutMs": 5000
  }
}
```

Leave the `linear-issues` entry as-is (no canary — see spec rationale).

- [ ] **Step 2: Validate the seed against current schema**

Run: `mkdir -p /tmp/wn-canary-defaults && cp skill/defaults/*.json /tmp/wn-canary-defaults/`
Run: `WORK_NEXT_CONFIG_DIR=/tmp/wn-canary-defaults node dist/cli.js config validate`

Expected:
- exit 0
- stdout JSON contains `"ok": true`.
- If you have `gh` installed and authed locally, `github-prs` should appear in `subagents`; otherwise it appears in `unavailable` with a relevant reason.
- `linear-issues` appears in `subagents` (no canary, never probed).

Clean up: `rm -rf /tmp/wn-canary-defaults`.

- [ ] **Step 3: Run full verify**

Run: `npm run verify`
Expected: all green.

- [ ] **Step 4: Commit** (confirm with user first)

```bash
git add skill/defaults/subagents.json
git commit --no-gpg-sign -m "feat(skill): add gh auth status canary to github-prs default"
```

---

## Done criteria

- [ ] All 5 tasks complete with commits.
- [ ] `npm run verify` passes (lint + typecheck + 90+ tests + build).
- [ ] Manual smoke from a clean shell:
  - `WORK_NEXT_CONFIG_DIR=/tmp/foo work-next config validate` against a `subagents.json` with one failing canary entry surfaces it in `unavailable`.
- [ ] `skill/SKILL.md` instructs the host LLM on handling `unavailable[]` entries.

The canary preflight is shippable when all of the above are green.
