# work-next Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a portable "what to work on next" skill: TypeScript CLI for deterministic logic (config validation, scoring, history, condensation), plus skill markdown driving a host AI agent to fan out subagents, apply observations, and present a ranked top-3.

**Architecture:** Approach B from the design — skill markdown + TypeScript helpers. The TS package ships a `work-next` CLI binary the skill shells out to for deterministic operations; the LLM-in-host does dispatch, observation reasoning, presentation, and condensation analysis. Pure functions (scoring, schema, history math) are unit-tested with vitest. Runtime data lives at `~/.config/work-next/`. Install symlinks the skill into `~/.claude/skills/` and the CLI into `~/.local/bin/`.

**Tech Stack:** Node ≥ 20, TypeScript 5.x, zod (schema validation), commander (CLI), vitest (tests), ESLint + Prettier (lint/format). Output: `tsc` → `dist/`.

**Reference spec:** `docs/superpowers/specs/2026-05-22-work-next-skill-design.md`

**Project CLAUDE.md note:** Chad requires explicit approval before any git commit. Each "Commit" step below — confirm with the user before running it. Never push without explicit approval. After each task, also confirm `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` all pass.

**Code style note:** 2-space indents, always end lines with semicolons. Never use `any` or `unknown` (use `zod`'s inferred types or named generics).

---

## File Structure (locked in here)

```
package.json                 # Node project + npm scripts
tsconfig.json                # strict TS, target Node 20
vitest.config.ts             # test runner config
eslint.config.mjs            # flat config; bans any/unknown
.prettierrc                  # 2-space, semis
.gitignore
src/
  cli.ts                     # entry: parse argv, dispatch to commands/*
  lib/
    paths.ts                 # resolve config dir, file paths (env-var override for tests)
    schema.ts                # zod schemas: SubagentsConfig, WeightsConfig, HistoryRow, ScoreInput, ScoreOutput
    config.ts                # loadSubagentsConfig, loadWeightsConfig, applyDefaults
    history.ts               # appendRow, lineCount, shouldCondense, archive, escalateThreshold, resetThreshold
    scoring.ts               # score(input) -> ScoreOutput (pure)
  commands/
    score.ts                 # `work-next score` — reads stdin JSON, writes ranked JSON
    config.ts                # `work-next config validate|show`
    history.ts               # `work-next history append|should-condense|archive|record-pick|show`
    weights.ts               # `work-next weights propose|apply`
    run.ts                   # `work-next` (default) — wraps `claude -p` / `codex -p`
tests/
  _helpers.ts                # createTempDir() and fixtures
  lib/
    schema.test.ts
    paths.test.ts
    scoring.test.ts
    config.test.ts
    history.test.ts
  commands/
    score.test.ts
    config.test.ts
    history.test.ts
    weights.test.ts
skill/
  SKILL.md                   # the skill markdown
  prompts/
    subagent.md
    condense.md
    present.md
  defaults/
    subagents.json
    weights.json
install.sh
uninstall.sh
README.md
```

---

## Task 1: Project setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `eslint.config.mjs`
- Create: `.prettierrc`
- Create: `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "work-next",
  "version": "0.1.0",
  "description": "Decide what to work on next: subagent fan-out + weighted ranking.",
  "type": "module",
  "bin": {
    "work-next": "dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "typecheck": "tsc --noEmit",
    "verify": "npm run lint && npm run typecheck && npm run test && npm run build"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
});
```

- [ ] **Step 4: Create `eslint.config.mjs`**

```js
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      'semi': ['error', 'always'],
      'indent': ['error', 2, { SwitchCase: 1 }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSUnknownKeyword',
          message: 'unknown is banned by project policy. Use a named generic or a zod-inferred type instead.',
        },
      ],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
```

- [ ] **Step 5: Create `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
dist/
coverage/
*.log
.DS_Store
```

- [ ] **Step 7: Install dependencies**

Run: `npm install`
Expected: no errors; `node_modules/` and `package-lock.json` created.

- [ ] **Step 8: Verify all scripts wire up**

Run: `npm run typecheck`
Expected: passes (no TS source files yet, so it's a no-op success).

Run: `npm run lint`
Expected: passes (no TS source files to lint yet).

Run: `npm test`
Expected: vitest runs and reports "No test files found" — that's OK, exit 0.

- [ ] **Step 9: Commit** (confirm with user first)

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts eslint.config.mjs .prettierrc .gitignore
git commit -m "chore: initialize TypeScript project with vitest + eslint"
```

---

## Task 2: Schemas (`lib/schema.ts`)

**Files:**
- Create: `tests/_helpers.ts`
- Create: `tests/lib/schema.test.ts`
- Create: `src/lib/schema.ts`

- [ ] **Step 1: Create the test helper**

`tests/_helpers.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'work-next-test-'));
}

export function cleanupTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
```

- [ ] **Step 2: Write the failing schema tests**

`tests/lib/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  SubagentsConfigSchema,
  WeightsConfigSchema,
  HistoryRowSchema,
  ScoreInputSchema,
  ScoreOutputSchema,
} from '../../src/lib/schema.js';

describe('SubagentsConfigSchema', () => {
  it('accepts a valid config', () => {
    const valid = {
      version: 1,
      subagents: [
        {
          name: 'github-prs',
          description: 'PRs awaiting review',
          prompt: 'Find the most urgent PR awaiting your review.',
          dataSources: ['gh CLI'],
        },
      ],
    };
    expect(() => SubagentsConfigSchema.parse(valid)).not.toThrow();
  });

  it('rejects wrong version', () => {
    expect(() =>
      SubagentsConfigSchema.parse({ version: 2, subagents: [] }),
    ).toThrow();
  });

  it('rejects negative timeoutMs', () => {
    expect(() =>
      SubagentsConfigSchema.parse({
        version: 1,
        subagents: [
          {
            name: 'x',
            description: 'd',
            prompt: 'p',
            dataSources: [],
            timeoutMs: -1,
          },
        ],
      }),
    ).toThrow();
  });
});

describe('WeightsConfigSchema', () => {
  it('accepts a valid config', () => {
    const valid = {
      version: 1,
      weights: { 'github-prs': 1.0 },
      observationDeltas: {
        correlationBoost: 0.1,
        runtimeArgsBoost: 0.2,
        ambientPenalty: -0.15,
      },
      condensation: { historyLineThreshold: 200 },
    };
    expect(() => WeightsConfigSchema.parse(valid)).not.toThrow();
  });

  it('rejects threshold below 1', () => {
    const invalid = {
      version: 1,
      weights: {},
      observationDeltas: { correlationBoost: 0, runtimeArgsBoost: 0, ambientPenalty: 0 },
      condensation: { historyLineThreshold: 0 },
    };
    expect(() => WeightsConfigSchema.parse(invalid)).toThrow();
  });
});

describe('HistoryRowSchema', () => {
  it('accepts a row with all subagent statuses', () => {
    const row = {
      timestamp: '2026-05-22T10:00:00Z',
      runtimeArgs: null,
      ambient: { dayOfWeek: 'Friday', localHour: 15 },
      subagentReturns: [
        {
          name: 'a',
          item: { title: 't', source: 's' },
          urgency: 0.5,
          rationale: 'r',
          status: 'ok',
        },
        {
          name: 'b',
          item: null,
          urgency: 0,
          rationale: 'data source unavailable',
          status: 'unavailable',
        },
      ],
      finalRanking: [{ name: 'a', title: 't', score: 0.5, rank: 1 }],
      userPick: null,
    };
    expect(() => HistoryRowSchema.parse(row)).not.toThrow();
  });

  it('rejects urgency outside [0, 1]', () => {
    expect(() =>
      HistoryRowSchema.parse({
        timestamp: '2026-05-22T10:00:00Z',
        runtimeArgs: null,
        ambient: { dayOfWeek: 'Friday', localHour: 15 },
        subagentReturns: [
          { name: 'a', item: null, urgency: 1.5, rationale: 'r', status: 'ok' },
        ],
        finalRanking: [],
        userPick: null,
      }),
    ).toThrow();
  });

  it('rejects finalRanking rank outside 1..3', () => {
    expect(() =>
      HistoryRowSchema.parse({
        timestamp: '2026-05-22T10:00:00Z',
        runtimeArgs: null,
        ambient: { dayOfWeek: 'Friday', localHour: 15 },
        subagentReturns: [],
        finalRanking: [{ name: 'a', title: 't', score: 0.5, rank: 4 }],
        userPick: null,
      }),
    ).toThrow();
  });
});

describe('ScoreInputSchema and ScoreOutputSchema', () => {
  it('accepts minimal ScoreInput', () => {
    const input = {
      subagentReturns: [
        {
          name: 'a',
          item: { title: 't', source: 's' },
          urgency: 0.5,
          rationale: 'r',
          status: 'ok',
        },
      ],
      weights: {
        version: 1,
        weights: { a: 1 },
        observationDeltas: { correlationBoost: 0, runtimeArgsBoost: 0, ambientPenalty: 0 },
        condensation: { historyLineThreshold: 200 },
      },
      observations: {
        correlations: [],
        runtimeArgsRelevance: {},
        ambientPenalty: 0,
      },
    };
    expect(() => ScoreInputSchema.parse(input)).not.toThrow();
  });

  it('accepts a ScoreOutput shape', () => {
    const out = {
      ranked: [
        {
          subagentName: 'a',
          item: { title: 't', source: 's' },
          rationale: 'r',
          rawUrgency: 0.5,
          score: 0.5,
          breakdown: {
            weight: 1,
            correlationBoost: 0,
            runtimeArgsDelta: 0,
            ambientDelta: 0,
          },
        },
      ],
    };
    expect(() => ScoreOutputSchema.parse(out)).not.toThrow();
  });
});
```

- [ ] **Step 3: Run the tests — confirm they fail**

Run: `npm test`
Expected: all schema tests fail because `src/lib/schema.ts` does not exist (module resolution error).

- [ ] **Step 4: Implement `src/lib/schema.ts`**

```ts
import { z } from 'zod';

export const SubagentSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  prompt: z.string(),
  dataSources: z.array(z.string()),
  enabled: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional(),
});
export type Subagent = z.infer<typeof SubagentSchema>;

export const SubagentsConfigSchema = z.object({
  version: z.literal(1),
  subagents: z.array(SubagentSchema),
});
export type SubagentsConfig = z.infer<typeof SubagentsConfigSchema>;

export const WeightsConfigSchema = z.object({
  version: z.literal(1),
  weights: z.record(z.string(), z.number()),
  observationDeltas: z.object({
    correlationBoost: z.number(),
    runtimeArgsBoost: z.number(),
    ambientPenalty: z.number(),
  }),
  condensation: z.object({
    historyLineThreshold: z.number().int().min(1),
    lastReviewed: z.string().optional(),
  }),
});
export type WeightsConfig = z.infer<typeof WeightsConfigSchema>;

export const SubagentStatusSchema = z.enum(['ok', 'timeout', 'invalid', 'unavailable']);
export type SubagentStatus = z.infer<typeof SubagentStatusSchema>;

export const SubagentItemSchema = z.object({
  title: z.string(),
  source: z.string(),
  ref: z.string().optional(),
});
export type SubagentItem = z.infer<typeof SubagentItemSchema>;

export const SubagentReturnSchema = z.object({
  name: z.string(),
  item: SubagentItemSchema.nullable(),
  urgency: z.number().min(0).max(1),
  rationale: z.string(),
  status: SubagentStatusSchema,
});
export type SubagentReturn = z.infer<typeof SubagentReturnSchema>;

export const FinalRankingEntrySchema = z.object({
  name: z.string(),
  title: z.string(),
  score: z.number(),
  rank: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});
export type FinalRankingEntry = z.infer<typeof FinalRankingEntrySchema>;

export const UserPickSchema = z
  .object({
    rank: z.number().int().nullable(),
    note: z.string().optional(),
  })
  .nullable();
export type UserPick = z.infer<typeof UserPickSchema>;

export const HistoryRowSchema = z.object({
  timestamp: z.string(),
  runtimeArgs: z.string().nullable(),
  ambient: z.object({
    dayOfWeek: z.string(),
    localHour: z.number().int().min(0).max(23),
  }),
  subagentReturns: z.array(SubagentReturnSchema),
  finalRanking: z.array(FinalRankingEntrySchema),
  userPick: UserPickSchema,
});
export type HistoryRow = z.infer<typeof HistoryRowSchema>;

export const ScoreInputSchema = z.object({
  subagentReturns: z.array(SubagentReturnSchema),
  weights: WeightsConfigSchema,
  observations: z.object({
    correlations: z.array(
      z.object({
        subagentNames: z.array(z.string()),
        reason: z.string(),
      }),
    ),
    runtimeArgsRelevance: z.record(z.string(), z.number().min(-1).max(1)),
    ambientPenalty: z.number().min(-1).max(1),
  }),
});
export type ScoreInput = z.infer<typeof ScoreInputSchema>;

export const ScoreOutputEntrySchema = z.object({
  subagentName: z.string(),
  item: SubagentItemSchema,
  rationale: z.string(),
  rawUrgency: z.number(),
  score: z.number(),
  breakdown: z.object({
    weight: z.number(),
    correlationBoost: z.number(),
    runtimeArgsDelta: z.number(),
    ambientDelta: z.number(),
  }),
});
export type ScoreOutputEntry = z.infer<typeof ScoreOutputEntrySchema>;

export const ScoreOutputSchema = z.object({
  ranked: z.array(ScoreOutputEntrySchema),
});
export type ScoreOutput = z.infer<typeof ScoreOutputSchema>;
```

- [ ] **Step 5: Run tests — confirm they pass**

Run: `npm test`
Expected: all schema tests pass.

- [ ] **Step 6: Run lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both pass.

- [ ] **Step 7: Commit** (confirm with user first)

```bash
git add src/lib/schema.ts tests/_helpers.ts tests/lib/schema.test.ts
git commit -m "feat(schema): add zod schemas for config, history, scoring I/O"
```

---

## Task 3: Paths helper (`lib/paths.ts`)

**Files:**
- Create: `tests/lib/paths.test.ts`
- Create: `src/lib/paths.ts`

- [ ] **Step 1: Write the failing test**

`tests/lib/paths.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  defaultConfigDir,
  subagentsConfigPath,
  weightsConfigPath,
  historyPath,
  archivePath,
} from '../../src/lib/paths.js';

describe('defaultConfigDir', () => {
  const originalEnv = process.env.WORK_NEXT_CONFIG_DIR;

  beforeEach(() => {
    delete process.env.WORK_NEXT_CONFIG_DIR;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.WORK_NEXT_CONFIG_DIR;
    } else {
      process.env.WORK_NEXT_CONFIG_DIR = originalEnv;
    }
  });

  it('defaults to ~/.config/work-next when env var is unset', () => {
    expect(defaultConfigDir()).toBe(join(homedir(), '.config', 'work-next'));
  });

  it('uses WORK_NEXT_CONFIG_DIR when set', () => {
    process.env.WORK_NEXT_CONFIG_DIR = '/tmp/custom-dir';
    expect(defaultConfigDir()).toBe('/tmp/custom-dir');
  });
});

describe('file path helpers', () => {
  it('builds subagents.json path', () => {
    expect(subagentsConfigPath('/x')).toBe('/x/subagents.json');
  });

  it('builds weights.json path', () => {
    expect(weightsConfigPath('/x')).toBe('/x/weights.json');
  });

  it('builds history.jsonl path', () => {
    expect(historyPath('/x')).toBe('/x/history.jsonl');
  });

  it('builds archive path with timestamp', () => {
    expect(archivePath('/x', '2026-05-22T10-00-00')).toBe(
      '/x/history.archive.2026-05-22T10-00-00.jsonl',
    );
  });
});
```

- [ ] **Step 2: Run test — confirm it fails**

Run: `npm test -- tests/lib/paths.test.ts`
Expected: fails (module not found).

- [ ] **Step 3: Implement `src/lib/paths.ts`**

```ts
import { homedir } from 'node:os';
import { join } from 'node:path';

export function defaultConfigDir(): string {
  return process.env.WORK_NEXT_CONFIG_DIR ?? join(homedir(), '.config', 'work-next');
}

export function subagentsConfigPath(dir: string): string {
  return join(dir, 'subagents.json');
}

export function weightsConfigPath(dir: string): string {
  return join(dir, 'weights.json');
}

export function historyPath(dir: string): string {
  return join(dir, 'history.jsonl');
}

export function archivePath(dir: string, timestamp: string): string {
  return join(dir, `history.archive.${timestamp}.jsonl`);
}
```

- [ ] **Step 4: Run test — confirm it passes**

Run: `npm test -- tests/lib/paths.test.ts`
Expected: all 6 tests pass.

- [ ] **Step 5: Commit** (confirm with user first)

```bash
git add src/lib/paths.ts tests/lib/paths.test.ts
git commit -m "feat(paths): add config dir resolver with env var override"
```

---

## Task 4: Scoring (`lib/scoring.ts`)

The pure scoring function. Most-tested file in the project.

**Files:**
- Create: `tests/lib/scoring.test.ts`
- Create: `src/lib/scoring.ts`

- [ ] **Step 1: Write failing tests covering the formula**

`tests/lib/scoring.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { score } from '../../src/lib/scoring.js';
import type { ScoreInput, WeightsConfig, SubagentReturn } from '../../src/lib/schema.js';

function defaultWeights(overrides: Partial<WeightsConfig> = {}): WeightsConfig {
  return {
    version: 1,
    weights: {},
    observationDeltas: { correlationBoost: 0.1, runtimeArgsBoost: 0.2, ambientPenalty: -0.15 },
    condensation: { historyLineThreshold: 200 },
    ...overrides,
  };
}

function makeReturn(name: string, urgency: number, statusOverride?: SubagentReturn['status']): SubagentReturn {
  return {
    name,
    item: { title: `${name}-item`, source: 'test' },
    urgency,
    rationale: `${name} rationale`,
    status: statusOverride ?? 'ok',
  };
}

describe('score()', () => {
  it('identity: weights all 1, no observations -> score equals rawUrgency', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.5), makeReturn('b', 0.7)],
      weights: defaultWeights({ weights: { a: 1, b: 1 } }),
      observations: { correlations: [], runtimeArgsRelevance: {}, ambientPenalty: 0 },
    };
    const out = score(input);
    expect(out.ranked).toHaveLength(2);
    expect(out.ranked[0]?.subagentName).toBe('b');
    expect(out.ranked[0]?.score).toBeCloseTo(0.7);
    expect(out.ranked[1]?.subagentName).toBe('a');
    expect(out.ranked[1]?.score).toBeCloseTo(0.5);
  });

  it('scales by weight', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.5)],
      weights: defaultWeights({ weights: { a: 1.5 } }),
      observations: { correlations: [], runtimeArgsRelevance: {}, ambientPenalty: 0 },
    };
    expect(score(input).ranked[0]?.score).toBeCloseTo(0.75);
  });

  it('zero weight makes score zero before clamping', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 1)],
      weights: defaultWeights({ weights: { a: 0 } }),
      observations: { correlations: [], runtimeArgsRelevance: {}, ambientPenalty: 0 },
    };
    expect(score(input).ranked[0]?.score).toBeCloseTo(0);
  });

  it('missing weight defaults to 1.0', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.4)],
      weights: defaultWeights({ weights: {} }),
      observations: { correlations: [], runtimeArgsRelevance: {}, ambientPenalty: 0 },
    };
    expect(score(input).ranked[0]?.score).toBeCloseTo(0.4);
  });

  it('applies correlation boost only to listed subagents', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.5), makeReturn('b', 0.5), makeReturn('c', 0.5)],
      weights: defaultWeights({ weights: { a: 1, b: 1, c: 1 } }),
      observations: {
        correlations: [{ subagentNames: ['a', 'b'], reason: 'same PR' }],
        runtimeArgsRelevance: {},
        ambientPenalty: 0,
      },
    };
    const out = score(input);
    const byName = Object.fromEntries(out.ranked.map((r) => [r.subagentName, r.score]));
    expect(byName.a).toBeCloseTo(0.6);
    expect(byName.b).toBeCloseTo(0.6);
    expect(byName.c).toBeCloseTo(0.5);
  });

  it('correlation boost only counts once even if subagent in multiple correlations', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.5)],
      weights: defaultWeights({ weights: { a: 1 } }),
      observations: {
        correlations: [
          { subagentNames: ['a', 'b'], reason: 'r1' },
          { subagentNames: ['a', 'c'], reason: 'r2' },
        ],
        runtimeArgsRelevance: {},
        ambientPenalty: 0,
      },
    };
    expect(score(input).ranked[0]?.score).toBeCloseTo(0.6);
  });

  it('runtime args delta: +1 relevance applies full +runtimeArgsBoost', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.5)],
      weights: defaultWeights({ weights: { a: 1 } }),
      observations: {
        correlations: [],
        runtimeArgsRelevance: { a: 1 },
        ambientPenalty: 0,
      },
    };
    expect(score(input).ranked[0]?.score).toBeCloseTo(0.7);
  });

  it('runtime args delta: -1 relevance applies -runtimeArgsBoost', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.5)],
      weights: defaultWeights({ weights: { a: 1 } }),
      observations: {
        correlations: [],
        runtimeArgsRelevance: { a: -1 },
        ambientPenalty: 0,
      },
    };
    expect(score(input).ranked[0]?.score).toBeCloseTo(0.3);
  });

  it('ambient penalty applies when observations.ambientPenalty is non-zero', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.5)],
      weights: defaultWeights({ weights: { a: 1 } }),
      observations: {
        correlations: [],
        runtimeArgsRelevance: {},
        ambientPenalty: -1,
      },
    };
    expect(score(input).ranked[0]?.score).toBeCloseTo(0.35);
  });

  it('clamps to [0, 1]', () => {
    const high: ScoreInput = {
      subagentReturns: [makeReturn('a', 1)],
      weights: defaultWeights({ weights: { a: 2 } }),
      observations: {
        correlations: [{ subagentNames: ['a'], reason: 'r' }],
        runtimeArgsRelevance: { a: 1 },
        ambientPenalty: 0,
      },
    };
    expect(score(high).ranked[0]?.score).toBe(1);

    const low: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.05)],
      weights: defaultWeights({ weights: { a: 1 } }),
      observations: {
        correlations: [],
        runtimeArgsRelevance: { a: -1 },
        ambientPenalty: -1,
      },
    };
    expect(score(low).ranked[0]?.score).toBe(0);
  });

  it('ties break by subagent name ascending', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('b', 0.5), makeReturn('a', 0.5)],
      weights: defaultWeights({ weights: { a: 1, b: 1 } }),
      observations: { correlations: [], runtimeArgsRelevance: {}, ambientPenalty: 0 },
    };
    const out = score(input);
    expect(out.ranked[0]?.subagentName).toBe('a');
    expect(out.ranked[1]?.subagentName).toBe('b');
  });

  it('filters out status != ok', () => {
    const input: ScoreInput = {
      subagentReturns: [
        makeReturn('a', 0.5),
        makeReturn('b', 0.5, 'timeout'),
        makeReturn('c', 0.5, 'invalid'),
        makeReturn('d', 0.5, 'unavailable'),
      ],
      weights: defaultWeights({ weights: { a: 1, b: 1, c: 1, d: 1 } }),
      observations: { correlations: [], runtimeArgsRelevance: {}, ambientPenalty: 0 },
    };
    const out = score(input);
    expect(out.ranked).toHaveLength(1);
    expect(out.ranked[0]?.subagentName).toBe('a');
  });

  it('filters out urgency == 0', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.5), makeReturn('b', 0)],
      weights: defaultWeights({ weights: { a: 1, b: 1 } }),
      observations: { correlations: [], runtimeArgsRelevance: {}, ambientPenalty: 0 },
    };
    const out = score(input);
    expect(out.ranked).toHaveLength(1);
    expect(out.ranked[0]?.subagentName).toBe('a');
  });

  it('filters out items with null item field', () => {
    const noItem: SubagentReturn = {
      name: 'x',
      item: null,
      urgency: 0.5,
      rationale: 'r',
      status: 'ok',
    };
    const input: ScoreInput = {
      subagentReturns: [noItem],
      weights: defaultWeights({ weights: { x: 1 } }),
      observations: { correlations: [], runtimeArgsRelevance: {}, ambientPenalty: 0 },
    };
    expect(score(input).ranked).toHaveLength(0);
  });

  it('breakdown reflects each contribution', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.5)],
      weights: defaultWeights({ weights: { a: 1.2 } }),
      observations: {
        correlations: [{ subagentNames: ['a'], reason: 'r' }],
        runtimeArgsRelevance: { a: 0.5 },
        ambientPenalty: -0.5,
      },
    };
    const out = score(input).ranked[0];
    expect(out?.breakdown.weight).toBeCloseTo(1.2);
    expect(out?.breakdown.correlationBoost).toBeCloseTo(0.1);
    expect(out?.breakdown.runtimeArgsDelta).toBeCloseTo(0.1);
    expect(out?.breakdown.ambientDelta).toBeCloseTo(-0.075);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

Run: `npm test -- tests/lib/scoring.test.ts`
Expected: fails (`score` not exported).

- [ ] **Step 3: Implement `src/lib/scoring.ts`**

```ts
import type { ScoreInput, ScoreOutput, ScoreOutputEntry, SubagentReturn } from './schema.js';

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function isScorable(r: SubagentReturn): boolean {
  return r.status === 'ok' && r.urgency > 0 && r.item !== null;
}

export function score(input: ScoreInput): ScoreOutput {
  const { subagentReturns, weights, observations } = input;
  const correlatedNames = new Set<string>();
  for (const c of observations.correlations) {
    for (const n of c.subagentNames) correlatedNames.add(n);
  }

  const entries: ScoreOutputEntry[] = subagentReturns
    .filter(isScorable)
    .map((r) => {
      const weight = weights.weights[r.name] ?? 1;
      const correlationBoost = correlatedNames.has(r.name)
        ? weights.observationDeltas.correlationBoost
        : 0;
      const relevance = observations.runtimeArgsRelevance[r.name] ?? 0;
      const runtimeArgsDelta = relevance * weights.observationDeltas.runtimeArgsBoost;
      const ambientDelta = observations.ambientPenalty * weights.observationDeltas.ambientPenalty;
      const composite =
        r.urgency * weight + correlationBoost + runtimeArgsDelta + ambientDelta;
      return {
        subagentName: r.name,
        item: r.item as NonNullable<typeof r.item>,
        rationale: r.rationale,
        rawUrgency: r.urgency,
        score: clamp01(composite),
        breakdown: { weight, correlationBoost, runtimeArgsDelta, ambientDelta },
      };
    });

  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.subagentName.localeCompare(b.subagentName);
  });

  return { ranked: entries };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

Run: `npm test -- tests/lib/scoring.test.ts`
Expected: all 14 tests pass.

- [ ] **Step 5: Run lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both pass.

- [ ] **Step 6: Commit** (confirm with user first)

```bash
git add src/lib/scoring.ts tests/lib/scoring.test.ts
git commit -m "feat(scoring): pure ranking function with weight/observation deltas"
```

---

## Task 5: Config loader (`lib/config.ts`)

**Files:**
- Create: `tests/lib/config.test.ts`
- Create: `src/lib/config.ts`

- [ ] **Step 1: Write failing tests**

`tests/lib/config.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../_helpers.js';
import { loadSubagentsConfig, loadWeightsConfig } from '../../src/lib/config.js';

describe('loadSubagentsConfig', () => {
  let dir: string;
  beforeEach(() => {
    dir = createTempDir();
  });
  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('loads valid file and applies enabled=true default', () => {
    writeFileSync(
      join(dir, 'subagents.json'),
      JSON.stringify({
        version: 1,
        subagents: [{ name: 'a', description: 'd', prompt: 'p', dataSources: [] }],
      }),
    );
    const result = loadSubagentsConfig(dir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.subagents[0]?.enabled).toBe(true);
      expect(result.value.subagents[0]?.timeoutMs).toBe(120000);
    }
  });

  it('returns structured error for invalid file', () => {
    writeFileSync(join(dir, 'subagents.json'), JSON.stringify({ version: 2, subagents: [] }));
    const result = loadSubagentsConfig(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.path).toBeTruthy();
      expect(result.errors[0]?.message).toBeTruthy();
    }
  });

  it('returns error when file missing', () => {
    const result = loadSubagentsConfig(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.path).toBe('subagents.json');
      expect(result.errors[0]?.message).toMatch(/not found/i);
    }
  });
});

describe('loadWeightsConfig', () => {
  let dir: string;
  beforeEach(() => {
    dir = createTempDir();
  });
  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('loads valid file', () => {
    writeFileSync(
      join(dir, 'weights.json'),
      JSON.stringify({
        version: 1,
        weights: { a: 1 },
        observationDeltas: { correlationBoost: 0.1, runtimeArgsBoost: 0.2, ambientPenalty: -0.15 },
        condensation: { historyLineThreshold: 200 },
      }),
    );
    const result = loadWeightsConfig(dir);
    expect(result.ok).toBe(true);
  });

  it('returns structured error for malformed JSON', () => {
    writeFileSync(join(dir, 'weights.json'), '{ not valid json');
    const result = loadWeightsConfig(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.message).toMatch(/json/i);
    }
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

Run: `npm test -- tests/lib/config.test.ts`
Expected: fails (module not found).

- [ ] **Step 3: Implement `src/lib/config.ts`**

Key idea: inline `JSON.parse` inside `schema.safeParse(...)` so the intermediate value is never named with a type in our code. Use explicit `ReturnType<typeof ...>` annotations where we need to declare a `let` variable for the safeParse result.

```ts
import { readFileSync, existsSync } from 'node:fs';
import type { ZodError } from 'zod';
import { SubagentsConfigSchema, WeightsConfigSchema } from './schema.js';
import type { SubagentsConfig, WeightsConfig } from './schema.js';
import { subagentsConfigPath, weightsConfigPath } from './paths.js';

export type ConfigError = { path: string; message: string };
export type LoadResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ConfigError[] };

const DEFAULT_TIMEOUT_MS = 120000;

function zodToErrors(err: ZodError, displayName: string): ConfigError[] {
  return err.issues.map((i) => ({
    path: `${displayName}.${i.path.join('.')}`,
    message: i.message,
  }));
}

export function loadSubagentsConfig(dir: string): LoadResult<SubagentsConfig> {
  const filepath = subagentsConfigPath(dir);
  const displayName = 'subagents.json';
  if (!existsSync(filepath)) {
    return { ok: false, errors: [{ path: displayName, message: `file not found at ${filepath}` }] };
  }
  let raw: string;
  try {
    raw = readFileSync(filepath, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, errors: [{ path: displayName, message: `read error: ${msg}` }] };
  }
  let parsed: ReturnType<typeof SubagentsConfigSchema.safeParse>;
  try {
    parsed = SubagentsConfigSchema.safeParse(JSON.parse(raw));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, errors: [{ path: displayName, message: `invalid JSON: ${msg}` }] };
  }
  if (!parsed.success) {
    return { ok: false, errors: zodToErrors(parsed.error, displayName) };
  }
  return {
    ok: true,
    value: {
      version: parsed.data.version,
      subagents: parsed.data.subagents.map((s) => ({
        ...s,
        enabled: s.enabled ?? true,
        timeoutMs: s.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      })),
    },
  };
}

export function loadWeightsConfig(dir: string): LoadResult<WeightsConfig> {
  const filepath = weightsConfigPath(dir);
  const displayName = 'weights.json';
  if (!existsSync(filepath)) {
    return { ok: false, errors: [{ path: displayName, message: `file not found at ${filepath}` }] };
  }
  let raw: string;
  try {
    raw = readFileSync(filepath, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, errors: [{ path: displayName, message: `read error: ${msg}` }] };
  }
  let parsed: ReturnType<typeof WeightsConfigSchema.safeParse>;
  try {
    parsed = WeightsConfigSchema.safeParse(JSON.parse(raw));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, errors: [{ path: displayName, message: `invalid JSON: ${msg}` }] };
  }
  if (!parsed.success) {
    return { ok: false, errors: zodToErrors(parsed.error, displayName) };
  }
  return { ok: true, value: parsed.data };
}
```

The two functions share structure but differ in default-application — keeping them separate is clearer than abstracting. No `unknown` keyword used anywhere in our written code; type inference (`ReturnType<typeof ...>`) carries the safeParse result type.

- [ ] **Step 4: Run tests — confirm they pass**

Run: `npm test -- tests/lib/config.test.ts`
Expected: all 5 tests pass.

- [ ] **Step 5: Run lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both pass. If lint flags `unknown` in the internal helper, refactor per the note above.

- [ ] **Step 6: Commit** (confirm with user first)

```bash
git add src/lib/config.ts tests/lib/config.test.ts
git commit -m "feat(config): load and validate subagents.json + weights.json"
```

---

## Task 6: History core (`lib/history.ts`)

**Files:**
- Create: `tests/lib/history.test.ts`
- Create: `src/lib/history.ts`

- [ ] **Step 1: Write failing tests**

`tests/lib/history.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../_helpers.js';
import {
  appendRow,
  lineCount,
  shouldCondense,
  archive,
  escalateThreshold,
  resetThreshold,
  recordPick,
} from '../../src/lib/history.js';
import type { HistoryRow, WeightsConfig } from '../../src/lib/schema.js';

function fixtureRow(overrides: Partial<HistoryRow> = {}): HistoryRow {
  return {
    timestamp: '2026-05-22T10:00:00Z',
    runtimeArgs: null,
    ambient: { dayOfWeek: 'Friday', localHour: 15 },
    subagentReturns: [],
    finalRanking: [],
    userPick: null,
    ...overrides,
  };
}

function fixtureWeights(threshold: number): WeightsConfig {
  return {
    version: 1,
    weights: {},
    observationDeltas: { correlationBoost: 0.1, runtimeArgsBoost: 0.2, ambientPenalty: -0.15 },
    condensation: { historyLineThreshold: threshold },
  };
}

describe('appendRow', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir(); });
  afterEach(() => { cleanupTempDir(dir); });

  it('writes a single JSONL line', () => {
    appendRow(dir, fixtureRow());
    const content = readFileSync(join(dir, 'history.jsonl'), 'utf8');
    expect(content.split('\n').filter(Boolean)).toHaveLength(1);
    const parsed = JSON.parse(content.trim()) as HistoryRow;
    expect(parsed.timestamp).toBe('2026-05-22T10:00:00Z');
  });

  it('appends to existing file', () => {
    appendRow(dir, fixtureRow());
    appendRow(dir, fixtureRow({ timestamp: '2026-05-22T11:00:00Z' }));
    const lines = readFileSync(join(dir, 'history.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean);
    expect(lines).toHaveLength(2);
  });
});

describe('lineCount', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir(); });
  afterEach(() => { cleanupTempDir(dir); });

  it('returns 0 when file does not exist', () => {
    expect(lineCount(dir)).toBe(0);
  });

  it('counts JSONL lines', () => {
    appendRow(dir, fixtureRow());
    appendRow(dir, fixtureRow());
    appendRow(dir, fixtureRow());
    expect(lineCount(dir)).toBe(3);
  });
});

describe('shouldCondense', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir(); });
  afterEach(() => { cleanupTempDir(dir); });

  it('false when count < threshold', () => {
    for (let i = 0; i < 199; i++) appendRow(dir, fixtureRow());
    expect(shouldCondense(dir, fixtureWeights(200))).toBe(false);
  });

  it('true when count >= threshold', () => {
    for (let i = 0; i < 200; i++) appendRow(dir, fixtureRow());
    expect(shouldCondense(dir, fixtureWeights(200))).toBe(true);
  });

  it('false when no history', () => {
    expect(shouldCondense(dir, fixtureWeights(200))).toBe(false);
  });
});

describe('archive', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir(); });
  afterEach(() => { cleanupTempDir(dir); });

  it('renames history.jsonl to archive file', () => {
    appendRow(dir, fixtureRow());
    const archivePath = archive(dir, '2026-05-22T10-00-00');
    expect(existsSync(join(dir, 'history.jsonl'))).toBe(false);
    expect(existsSync(archivePath)).toBe(true);
    expect(archivePath).toMatch(/history\.archive\.2026-05-22T10-00-00\.jsonl$/);
  });

  it('no-op when no history file', () => {
    const result = archive(dir, '2026-05-22T10-00-00');
    expect(result).toBeNull();
  });
});

describe('escalateThreshold', () => {
  it('doubles up to cap of 2000', () => {
    expect(escalateThreshold(200)).toBe(400);
    expect(escalateThreshold(400)).toBe(800);
    expect(escalateThreshold(800)).toBe(1600);
    expect(escalateThreshold(1600)).toBe(2000);
    expect(escalateThreshold(2000)).toBe(2000);
  });
});

describe('resetThreshold', () => {
  it('returns 200', () => {
    expect(resetThreshold()).toBe(200);
  });
});

describe('recordPick', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir(); });
  afterEach(() => { cleanupTempDir(dir); });

  it('updates last row userPick', () => {
    appendRow(dir, fixtureRow());
    appendRow(dir, fixtureRow({ timestamp: '2026-05-22T11:00:00Z' }));
    recordPick(dir, { rank: 1, note: 'opened PR' });
    const lines = readFileSync(join(dir, 'history.jsonl'), 'utf8').split('\n').filter(Boolean);
    const last = JSON.parse(lines[lines.length - 1] ?? '{}') as HistoryRow;
    expect(last.userPick?.rank).toBe(1);
    expect(last.userPick?.note).toBe('opened PR');
    const first = JSON.parse(lines[0] ?? '{}') as HistoryRow;
    expect(first.userPick).toBeNull();
  });

  it('throws when no history exists', () => {
    expect(() => recordPick(dir, { rank: 1 })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

Run: `npm test -- tests/lib/history.test.ts`
Expected: fails (module not found).

- [ ] **Step 3: Implement `src/lib/history.ts`**

```ts
import {
  appendFileSync,
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { historyPath, archivePath } from './paths.js';
import { HistoryRowSchema } from './schema.js';
import type { HistoryRow, UserPick, WeightsConfig } from './schema.js';

const DEFAULT_THRESHOLD = 200;
const MAX_THRESHOLD = 2000;

export function appendRow(dir: string, row: HistoryRow): void {
  HistoryRowSchema.parse(row);
  appendFileSync(historyPath(dir), `${JSON.stringify(row)}\n`, { flag: 'a' });
}

export function lineCount(dir: string): number {
  const filepath = historyPath(dir);
  if (!existsSync(filepath)) return 0;
  const content = readFileSync(filepath, 'utf8');
  if (content.length === 0) return 0;
  return content.split('\n').filter((l) => l.length > 0).length;
}

export function shouldCondense(dir: string, weights: WeightsConfig): boolean {
  return lineCount(dir) >= weights.condensation.historyLineThreshold;
}

export function archive(dir: string, timestamp: string): string | null {
  const filepath = historyPath(dir);
  if (!existsSync(filepath)) return null;
  const target = archivePath(dir, timestamp);
  renameSync(filepath, target);
  return target;
}

export function escalateThreshold(current: number): number {
  return Math.min(current * 2, MAX_THRESHOLD);
}

export function resetThreshold(): number {
  return DEFAULT_THRESHOLD;
}

export function recordPick(dir: string, pick: NonNullable<UserPick>): void {
  const filepath = historyPath(dir);
  if (!existsSync(filepath)) {
    throw new Error(`no history file at ${filepath}`);
  }
  const content = readFileSync(filepath, 'utf8');
  const lines = content.split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new Error('history file is empty');
  }
  const lastLine = lines[lines.length - 1];
  if (lastLine === undefined) throw new Error('unreachable: lines.length > 0');
  const lastRow = JSON.parse(lastLine) as HistoryRow;
  lastRow.userPick = pick;
  HistoryRowSchema.parse(lastRow);
  lines[lines.length - 1] = JSON.stringify(lastRow);
  const tmp = `${filepath}.tmp`;
  writeFileSync(tmp, `${lines.join('\n')}\n`);
  renameSync(tmp, filepath);
}
```

- [ ] **Step 4: Run tests — confirm they pass**

Run: `npm test -- tests/lib/history.test.ts`
Expected: all 11 tests pass.

- [ ] **Step 5: Run lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both pass.

- [ ] **Step 6: Commit** (confirm with user first)

```bash
git add src/lib/history.ts tests/lib/history.test.ts
git commit -m "feat(history): JSONL append, condense check, archive, threshold logic"
```

---

## Task 7: Score command (`commands/score.ts`)

Pattern for all command modules: each exports a pure function `run(io: CommandIO): CommandResult` taking stdin string + argv + configDir. CLI wires them to real I/O.

**Files:**
- Create: `tests/commands/score.test.ts`
- Create: `src/commands/score.ts`

- [ ] **Step 1: Write failing test**

`tests/commands/score.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runScoreCommand } from '../../src/commands/score.js';

describe('runScoreCommand', () => {
  it('returns ranked JSON on stdout for valid input', () => {
    const input = {
      subagentReturns: [
        { name: 'a', item: { title: 't', source: 's' }, urgency: 0.5, rationale: 'r', status: 'ok' },
      ],
      weights: {
        version: 1,
        weights: { a: 1 },
        observationDeltas: { correlationBoost: 0, runtimeArgsBoost: 0, ambientPenalty: 0 },
        condensation: { historyLineThreshold: 200 },
      },
      observations: { correlations: [], runtimeArgsRelevance: {}, ambientPenalty: 0 },
    };
    const result = runScoreCommand({ stdin: JSON.stringify(input), argv: [] });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { ranked: Array<{ subagentName: string }> };
    expect(parsed.ranked[0]?.subagentName).toBe('a');
  });

  it('returns non-zero exit and structured error on invalid input', () => {
    const result = runScoreCommand({ stdin: '{ not json', argv: [] });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/json|parse/i);
  });

  it('returns non-zero exit on schema violation', () => {
    const result = runScoreCommand({
      stdin: JSON.stringify({ subagentReturns: 'not-an-array' }),
      argv: [],
    });
    expect(result.exitCode).not.toBe(0);
  });
});
```

- [ ] **Step 2: Run test — confirm it fails**

Run: `npm test -- tests/commands/score.test.ts`
Expected: fails (module not found).

- [ ] **Step 3: Implement `src/commands/score.ts`**

```ts
import { ScoreInputSchema } from '../lib/schema.js';
import { score } from '../lib/scoring.js';

export type CommandIO = { stdin: string; argv: string[]; configDir?: string };
export type CommandResult = { exitCode: number; stdout: string; stderr: string };

export function runScoreCommand(io: CommandIO): CommandResult {
  let raw: unknown;
  try {
    raw = JSON.parse(io.stdin);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { exitCode: 2, stdout: '', stderr: `invalid JSON on stdin: ${msg}\n` };
  }
  const parsed = ScoreInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: `schema validation failed: ${parsed.error.message}\n`,
    };
  }
  const result = score(parsed.data);
  return { exitCode: 0, stdout: `${JSON.stringify(result)}\n`, stderr: '' };
}
```

Note on `unknown` lint rule: `JSON.parse` returns `any` in TS by default; the assignment widens to `unknown`. Refactor: use a typed wrapper.

```ts
function safeParseJson<T = never>(s: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(s) as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
```

Place this helper in `src/lib/json.ts` and reuse from all command modules to keep the ban on `unknown` clean. Plan executor: add `src/lib/json.ts` with the helper above and a corresponding test in `tests/lib/json.test.ts` (round-trip valid and malformed JSON).

- [ ] **Step 4: Add `src/lib/json.ts` and tests**

`tests/lib/json.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { safeParseJson } from '../../src/lib/json.js';

type Foo = { a: number };

describe('safeParseJson', () => {
  it('parses valid JSON', () => {
    const r = safeParseJson<Foo>('{"a":1}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.a).toBe(1);
  });

  it('returns error for malformed JSON', () => {
    const r = safeParseJson<Foo>('{ bad');
    expect(r.ok).toBe(false);
  });
});
```

`src/lib/json.ts`:

```ts
export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function safeParseJson<T = never>(s: string): ParseResult<T> {
  try {
    return { ok: true, value: JSON.parse(s) as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 5: Refactor `score.ts` to use `safeParseJson`**

```ts
import { ScoreInputSchema } from '../lib/schema.js';
import { score } from '../lib/scoring.js';
import { safeParseJson } from '../lib/json.js';

export type CommandIO = { stdin: string; argv: string[]; configDir?: string };
export type CommandResult = { exitCode: number; stdout: string; stderr: string };

export function runScoreCommand(io: CommandIO): CommandResult {
  const parsedJson = safeParseJson(io.stdin);
  if (!parsedJson.ok) {
    return { exitCode: 2, stdout: '', stderr: `invalid JSON on stdin: ${parsedJson.error}\n` };
  }
  const parsed = ScoreInputSchema.safeParse(parsedJson.value);
  if (!parsed.success) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: `schema validation failed: ${parsed.error.message}\n`,
    };
  }
  const result = score(parsed.data);
  return { exitCode: 0, stdout: `${JSON.stringify(result)}\n`, stderr: '' };
}
```

- [ ] **Step 6: Run tests — confirm pass**

Run: `npm test -- tests/commands/score.test.ts tests/lib/json.test.ts`
Expected: all 5 tests pass.

- [ ] **Step 7: Run lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both pass.

- [ ] **Step 8: Commit** (confirm with user first)

```bash
git add src/lib/json.ts src/commands/score.ts tests/lib/json.test.ts tests/commands/score.test.ts
git commit -m "feat(cli): add score command + safeParseJson helper"
```

---

## Task 8: Config command (`commands/config.ts`)

**Files:**
- Create: `tests/commands/config.test.ts`
- Create: `src/commands/config.ts`

- [ ] **Step 1: Write failing tests**

`tests/commands/config.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../_helpers.js';
import { runConfigCommand } from '../../src/commands/config.js';

function seedValid(dir: string): void {
  writeFileSync(
    join(dir, 'subagents.json'),
    JSON.stringify({
      version: 1,
      subagents: [{ name: 'a', description: 'd', prompt: 'p', dataSources: [] }],
    }),
  );
  writeFileSync(
    join(dir, 'weights.json'),
    JSON.stringify({
      version: 1,
      weights: { a: 1 },
      observationDeltas: { correlationBoost: 0.1, runtimeArgsBoost: 0.2, ambientPenalty: -0.15 },
      condensation: { historyLineThreshold: 200 },
    }),
  );
}

describe('runConfigCommand validate', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir(); });
  afterEach(() => { cleanupTempDir(dir); });

  it('returns ok JSON on stdout when both files valid', () => {
    seedValid(dir);
    const result = runConfigCommand({ stdin: '', argv: ['validate'], configDir: dir });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { ok: boolean; subagents: unknown[]; weights: object; ambient: { dayOfWeek: string; localHour: number } };
    expect(parsed.ok).toBe(true);
    expect(parsed.subagents).toHaveLength(1);
    expect(typeof parsed.ambient.dayOfWeek).toBe('string');
    expect(typeof parsed.ambient.localHour).toBe('number');
  });

  it('filters out disabled subagents', () => {
    writeFileSync(
      join(dir, 'subagents.json'),
      JSON.stringify({
        version: 1,
        subagents: [
          { name: 'a', description: 'd', prompt: 'p', dataSources: [], enabled: true },
          { name: 'b', description: 'd', prompt: 'p', dataSources: [], enabled: false },
        ],
      }),
    );
    writeFileSync(
      join(dir, 'weights.json'),
      JSON.stringify({
        version: 1,
        weights: {},
        observationDeltas: { correlationBoost: 0, runtimeArgsBoost: 0, ambientPenalty: 0 },
        condensation: { historyLineThreshold: 200 },
      }),
    );
    const result = runConfigCommand({ stdin: '', argv: ['validate'], configDir: dir });
    const parsed = JSON.parse(result.stdout) as { subagents: Array<{ name: string }> };
    expect(parsed.subagents).toHaveLength(1);
    expect(parsed.subagents[0]?.name).toBe('a');
  });

  it('returns non-zero with structured errors on bad config', () => {
    writeFileSync(join(dir, 'subagents.json'), JSON.stringify({ version: 99 }));
    writeFileSync(
      join(dir, 'weights.json'),
      JSON.stringify({
        version: 1,
        weights: {},
        observationDeltas: { correlationBoost: 0, runtimeArgsBoost: 0, ambientPenalty: 0 },
        condensation: { historyLineThreshold: 200 },
      }),
    );
    const result = runConfigCommand({ stdin: '', argv: ['validate'], configDir: dir });
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout) as { ok: boolean; errors: Array<{ path: string; message: string }> };
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it('show subcommand prints both configs as JSON', () => {
    seedValid(dir);
    const result = runConfigCommand({ stdin: '', argv: ['show'], configDir: dir });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { subagents: object; weights: object };
    expect(parsed.subagents).toBeDefined();
    expect(parsed.weights).toBeDefined();
  });

  it('errors when subcommand missing', () => {
    const result = runConfigCommand({ stdin: '', argv: [], configDir: dir });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/subcommand/i);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

Run: `npm test -- tests/commands/config.test.ts`
Expected: fails (module not found).

- [ ] **Step 3: Implement `src/commands/config.ts`**

```ts
import { loadSubagentsConfig, loadWeightsConfig } from '../lib/config.js';
import type { CommandIO, CommandResult } from './score.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ambient(): { dayOfWeek: string; localHour: number } {
  const now = new Date();
  const day = DAY_NAMES[now.getDay()];
  if (day === undefined) throw new Error('unreachable: invalid day index');
  return { dayOfWeek: day, localHour: now.getHours() };
}

export function runConfigCommand(io: CommandIO): CommandResult {
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
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({ ok: true, subagents: enabled, weights: weights.value, ambient: ambient() })}\n`,
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

Reuse `CommandIO`/`CommandResult` from score.ts. (Plan executor: extract these into `src/commands/types.ts` if you'd like a cleaner home — both are stable.)

- [ ] **Step 4: Extract shared command types into `src/commands/types.ts`**

`src/commands/types.ts`:

```ts
export type CommandIO = { stdin: string; argv: string[]; configDir?: string };
export type CommandResult = { exitCode: number; stdout: string; stderr: string };
```

Update `src/commands/score.ts` and `src/commands/config.ts` to import from `./types.js` instead.

- [ ] **Step 5: Run tests — confirm they pass**

Run: `npm test -- tests/commands/config.test.ts tests/commands/score.test.ts`
Expected: all pass (5 + 3).

- [ ] **Step 6: Run lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both pass.

- [ ] **Step 7: Commit** (confirm with user first)

```bash
git add src/commands/types.ts src/commands/score.ts src/commands/config.ts tests/commands/config.test.ts
git commit -m "feat(cli): add config validate/show command + shared CommandIO type"
```

---

## Task 9: History command (`commands/history.ts`)

**Files:**
- Create: `tests/commands/history.test.ts`
- Create: `src/commands/history.ts`

- [ ] **Step 1: Write failing tests**

`tests/commands/history.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../_helpers.js';
import { runHistoryCommand } from '../../src/commands/history.js';
import type { HistoryRow } from '../../src/lib/schema.js';

function validRow(): HistoryRow {
  return {
    timestamp: '2026-05-22T10:00:00Z',
    runtimeArgs: null,
    ambient: { dayOfWeek: 'Friday', localHour: 15 },
    subagentReturns: [],
    finalRanking: [],
    userPick: null,
  };
}

function seedWeights(dir: string, threshold = 200): void {
  writeFileSync(
    join(dir, 'weights.json'),
    JSON.stringify({
      version: 1,
      weights: {},
      observationDeltas: { correlationBoost: 0, runtimeArgsBoost: 0, ambientPenalty: 0 },
      condensation: { historyLineThreshold: threshold },
    }),
  );
}

describe('history append', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir(); });
  afterEach(() => { cleanupTempDir(dir); });

  it('appends valid row from stdin', () => {
    seedWeights(dir);
    const result = runHistoryCommand({
      stdin: JSON.stringify(validRow()),
      argv: ['append'],
      configDir: dir,
    });
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(dir, 'history.jsonl'))).toBe(true);
  });

  it('errors on invalid row', () => {
    seedWeights(dir);
    const result = runHistoryCommand({
      stdin: JSON.stringify({ bogus: true }),
      argv: ['append'],
      configDir: dir,
    });
    expect(result.exitCode).not.toBe(0);
  });
});

describe('history should-condense', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir(); });
  afterEach(() => { cleanupTempDir(dir); });

  it('exits 0 when threshold met', () => {
    seedWeights(dir, 2);
    for (let i = 0; i < 2; i++) {
      runHistoryCommand({ stdin: JSON.stringify(validRow()), argv: ['append'], configDir: dir });
    }
    const result = runHistoryCommand({ stdin: '', argv: ['should-condense'], configDir: dir });
    expect(result.exitCode).toBe(0);
  });

  it('exits 1 when threshold not met', () => {
    seedWeights(dir, 200);
    const result = runHistoryCommand({ stdin: '', argv: ['should-condense'], configDir: dir });
    expect(result.exitCode).toBe(1);
  });
});

describe('history archive', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir(); });
  afterEach(() => { cleanupTempDir(dir); });

  it('renames and reports new path', () => {
    seedWeights(dir);
    runHistoryCommand({ stdin: JSON.stringify(validRow()), argv: ['append'], configDir: dir });
    const result = runHistoryCommand({ stdin: '', argv: ['archive'], configDir: dir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/history\.archive\./);
    expect(existsSync(join(dir, 'history.jsonl'))).toBe(false);
  });
});

describe('history record-pick', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir(); });
  afterEach(() => { cleanupTempDir(dir); });

  it('updates last row userPick', () => {
    seedWeights(dir);
    runHistoryCommand({ stdin: JSON.stringify(validRow()), argv: ['append'], configDir: dir });
    const result = runHistoryCommand({
      stdin: '',
      argv: ['record-pick', '1', '--note', 'opened it'],
      configDir: dir,
    });
    expect(result.exitCode).toBe(0);
    const last = readFileSync(join(dir, 'history.jsonl'), 'utf8').trim();
    const parsed = JSON.parse(last) as HistoryRow;
    expect(parsed.userPick?.rank).toBe(1);
    expect(parsed.userPick?.note).toBe('opened it');
  });

  it('accepts rank=null', () => {
    seedWeights(dir);
    runHistoryCommand({ stdin: JSON.stringify(validRow()), argv: ['append'], configDir: dir });
    const result = runHistoryCommand({
      stdin: '',
      argv: ['record-pick', 'null'],
      configDir: dir,
    });
    expect(result.exitCode).toBe(0);
    const last = readFileSync(join(dir, 'history.jsonl'), 'utf8').trim();
    const parsed = JSON.parse(last) as HistoryRow;
    expect(parsed.userPick?.rank).toBeNull();
  });
});

describe('history show', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir(); });
  afterEach(() => { cleanupTempDir(dir); });

  it('prints the JSONL content to stdout', () => {
    seedWeights(dir);
    runHistoryCommand({ stdin: JSON.stringify(validRow()), argv: ['append'], configDir: dir });
    const result = runHistoryCommand({ stdin: '', argv: ['show'], configDir: dir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('2026-05-22T10:00:00Z');
  });

  it('show prints nothing when no history', () => {
    const result = runHistoryCommand({ stdin: '', argv: ['show'], configDir: dir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

Run: `npm test -- tests/commands/history.test.ts`
Expected: fails.

- [ ] **Step 3: Implement `src/commands/history.ts`**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { HistoryRowSchema } from '../lib/schema.js';
import { loadWeightsConfig } from '../lib/config.js';
import { historyPath } from '../lib/paths.js';
import { appendRow, shouldCondense, archive, recordPick } from '../lib/history.js';
import { safeParseJson } from '../lib/json.js';
import type { CommandIO, CommandResult } from './types.js';
import type { HistoryRow } from '../lib/schema.js';

function timestampForArchive(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function runHistoryCommand(io: CommandIO): CommandResult {
  const sub = io.argv[0];
  if (sub === undefined) {
    return { exitCode: 2, stdout: '', stderr: 'history: missing subcommand\n' };
  }
  const dir = io.configDir;
  if (dir === undefined) {
    return { exitCode: 2, stdout: '', stderr: 'history: configDir is required\n' };
  }

  if (sub === 'append') {
    const parsedJson = safeParseJson<HistoryRow>(io.stdin);
    if (!parsedJson.ok) {
      return { exitCode: 2, stdout: '', stderr: `invalid JSON: ${parsedJson.error}\n` };
    }
    const valid = HistoryRowSchema.safeParse(parsedJson.value);
    if (!valid.success) {
      return { exitCode: 2, stdout: '', stderr: `invalid row: ${valid.error.message}\n` };
    }
    appendRow(dir, valid.data);
    return { exitCode: 0, stdout: '', stderr: '' };
  }

  if (sub === 'should-condense') {
    const weights = loadWeightsConfig(dir);
    if (!weights.ok) {
      return {
        exitCode: 2,
        stdout: '',
        stderr: `cannot load weights: ${weights.errors.map((e) => e.message).join('; ')}\n`,
      };
    }
    return {
      exitCode: shouldCondense(dir, weights.value) ? 0 : 1,
      stdout: '',
      stderr: '',
    };
  }

  if (sub === 'archive') {
    const result = archive(dir, timestampForArchive());
    if (result === null) {
      return { exitCode: 0, stdout: '', stderr: '' };
    }
    return { exitCode: 0, stdout: `${result}\n`, stderr: '' };
  }

  if (sub === 'record-pick') {
    const rankArg = io.argv[1];
    if (rankArg === undefined) {
      return { exitCode: 2, stdout: '', stderr: 'record-pick: rank required (number or "null")\n' };
    }
    const noteFlag = io.argv.indexOf('--note');
    const note = noteFlag !== -1 ? io.argv[noteFlag + 1] : undefined;
    const rank = rankArg === 'null' ? null : Number.parseInt(rankArg, 10);
    if (rank !== null && Number.isNaN(rank)) {
      return { exitCode: 2, stdout: '', stderr: `record-pick: invalid rank "${rankArg}"\n` };
    }
    try {
      recordPick(dir, note === undefined ? { rank } : { rank, note });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { exitCode: 1, stdout: '', stderr: `record-pick failed: ${msg}\n` };
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  }

  if (sub === 'show') {
    const filepath = historyPath(dir);
    if (!existsSync(filepath)) {
      return { exitCode: 0, stdout: '', stderr: '' };
    }
    return { exitCode: 0, stdout: readFileSync(filepath, 'utf8'), stderr: '' };
  }

  return { exitCode: 2, stdout: '', stderr: `history: unknown subcommand "${sub}"\n` };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

Run: `npm test -- tests/commands/history.test.ts`
Expected: all 9 tests pass.

- [ ] **Step 5: Run lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both pass.

- [ ] **Step 6: Commit** (confirm with user first)

```bash
git add src/commands/history.ts tests/commands/history.test.ts
git commit -m "feat(cli): add history append/should-condense/archive/record-pick/show"
```

---

## Task 10: Weights command (`commands/weights.ts`)

**Files:**
- Create: `tests/commands/weights.test.ts`
- Create: `src/commands/weights.ts`

The weights command supports two operations: `propose` (validates a diff and prints a unified preview) and `apply` (atomically writes a new `weights.json`).

A "diff" here is the **full proposed `weights.json`** — simpler than computing a delta. The LLM emits the new config; `apply` writes it atomically.

- [ ] **Step 1: Write failing tests**

`tests/commands/weights.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../_helpers.js';
import { runWeightsCommand } from '../../src/commands/weights.js';
import type { WeightsConfig } from '../../src/lib/schema.js';

function validWeights(overrides: Partial<WeightsConfig> = {}): WeightsConfig {
  return {
    version: 1,
    weights: { a: 1 },
    observationDeltas: { correlationBoost: 0.1, runtimeArgsBoost: 0.2, ambientPenalty: -0.15 },
    condensation: { historyLineThreshold: 200 },
    ...overrides,
  };
}

describe('weights propose', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir(); });
  afterEach(() => { cleanupTempDir(dir); });

  it('prints unified diff vs current weights', () => {
    writeFileSync(join(dir, 'weights.json'), JSON.stringify(validWeights()));
    const proposed = validWeights({ weights: { a: 1.2 } });
    const result = runWeightsCommand({
      stdin: JSON.stringify(proposed),
      argv: ['propose'],
      configDir: dir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('a');
    expect(result.stdout).toMatch(/1\.2/);
  });

  it('rejects invalid proposed config', () => {
    writeFileSync(join(dir, 'weights.json'), JSON.stringify(validWeights()));
    const result = runWeightsCommand({
      stdin: JSON.stringify({ bogus: true }),
      argv: ['propose'],
      configDir: dir,
    });
    expect(result.exitCode).not.toBe(0);
  });
});

describe('weights apply', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir(); });
  afterEach(() => { cleanupTempDir(dir); });

  it('atomically writes new weights.json', () => {
    writeFileSync(join(dir, 'weights.json'), JSON.stringify(validWeights()));
    const proposed = validWeights({ weights: { a: 1.5 } });
    const result = runWeightsCommand({
      stdin: JSON.stringify(proposed),
      argv: ['apply'],
      configDir: dir,
    });
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(dir, 'weights.json.tmp'))).toBe(false);
    const after = JSON.parse(readFileSync(join(dir, 'weights.json'), 'utf8')) as WeightsConfig;
    expect(after.weights.a).toBe(1.5);
  });

  it('rejects invalid stdin', () => {
    const result = runWeightsCommand({ stdin: 'not json', argv: ['apply'], configDir: dir });
    expect(result.exitCode).not.toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

Run: `npm test -- tests/commands/weights.test.ts`
Expected: fails.

- [ ] **Step 3: Implement `src/commands/weights.ts`**

```ts
import { renameSync, writeFileSync } from 'node:fs';
import { WeightsConfigSchema } from '../lib/schema.js';
import { weightsConfigPath } from '../lib/paths.js';
import { loadWeightsConfig } from '../lib/config.js';
import { safeParseJson } from '../lib/json.js';
import type { CommandIO, CommandResult } from './types.js';
import type { WeightsConfig } from '../lib/schema.js';

function diffLines(current: WeightsConfig, proposed: WeightsConfig): string[] {
  const out: string[] = [];
  const allKeys = new Set([...Object.keys(current.weights), ...Object.keys(proposed.weights)]);
  for (const k of [...allKeys].sort()) {
    const before = current.weights[k];
    const after = proposed.weights[k];
    if (before !== after) {
      out.push(`weights.${k}: ${before ?? '(absent)'} -> ${after ?? '(absent)'}`);
    }
  }
  const deltaKeys = ['correlationBoost', 'runtimeArgsBoost', 'ambientPenalty'] as const;
  for (const k of deltaKeys) {
    if (current.observationDeltas[k] !== proposed.observationDeltas[k]) {
      out.push(
        `observationDeltas.${k}: ${current.observationDeltas[k]} -> ${proposed.observationDeltas[k]}`,
      );
    }
  }
  if (current.condensation.historyLineThreshold !== proposed.condensation.historyLineThreshold) {
    out.push(
      `condensation.historyLineThreshold: ${current.condensation.historyLineThreshold} -> ${proposed.condensation.historyLineThreshold}`,
    );
  }
  return out;
}

export function runWeightsCommand(io: CommandIO): CommandResult {
  const sub = io.argv[0];
  if (sub === undefined) {
    return { exitCode: 2, stdout: '', stderr: 'weights: missing subcommand (propose|apply)\n' };
  }
  const dir = io.configDir;
  if (dir === undefined) {
    return { exitCode: 2, stdout: '', stderr: 'weights: configDir is required\n' };
  }

  const parsedJson = safeParseJson<WeightsConfig>(io.stdin);
  if (!parsedJson.ok) {
    return { exitCode: 2, stdout: '', stderr: `invalid JSON: ${parsedJson.error}\n` };
  }
  const proposed = WeightsConfigSchema.safeParse(parsedJson.value);
  if (!proposed.success) {
    return { exitCode: 2, stdout: '', stderr: `invalid weights: ${proposed.error.message}\n` };
  }

  if (sub === 'propose') {
    const current = loadWeightsConfig(dir);
    if (!current.ok) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `cannot load current weights: ${current.errors.map((e) => e.message).join('; ')}\n`,
      };
    }
    const lines = diffLines(current.value, proposed.data);
    if (lines.length === 0) {
      return { exitCode: 0, stdout: '(no changes)\n', stderr: '' };
    }
    return { exitCode: 0, stdout: `${lines.join('\n')}\n`, stderr: '' };
  }

  if (sub === 'apply') {
    const target = weightsConfigPath(dir);
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(proposed.data, null, 2)}\n`);
    renameSync(tmp, target);
    return { exitCode: 0, stdout: '', stderr: '' };
  }

  return { exitCode: 2, stdout: '', stderr: `weights: unknown subcommand "${sub}"\n` };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

Run: `npm test -- tests/commands/weights.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 5: Run lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both pass.

- [ ] **Step 6: Commit** (confirm with user first)

```bash
git add src/commands/weights.ts tests/commands/weights.test.ts
git commit -m "feat(cli): add weights propose/apply with atomic file write"
```

---

## Task 11: CLI entry + routing (`cli.ts`)

**Files:**
- Create: `src/cli.ts`

CLI entry reads stdin, parses argv, dispatches to the right command module. No new tests — the per-command tests already cover behavior; this file is glue.

- [ ] **Step 1: Implement `src/cli.ts`**

```ts
#!/usr/bin/env node
import { runScoreCommand } from './commands/score.js';
import { runConfigCommand } from './commands/config.js';
import { runHistoryCommand } from './commands/history.js';
import { runWeightsCommand } from './commands/weights.js';
import { runDefaultCommand, runCondenseCommand } from './commands/run.js';
import { defaultConfigDir } from './lib/paths.js';
import type { CommandIO, CommandResult } from './commands/types.js';

function readStdinSync(): string {
  if (process.stdin.isTTY) return '';
  try {
    return require('node:fs').readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

async function main(): Promise<void> {
  const [, , topCmd, ...rest] = process.argv;
  const stdin = readStdinSync();
  const io: CommandIO = {
    stdin,
    argv: rest,
    configDir: defaultConfigDir(),
  };

  let result: CommandResult;
  switch (topCmd) {
    case 'score':
      result = runScoreCommand(io);
      break;
    case 'config':
      result = runConfigCommand(io);
      break;
    case 'history':
      result = runHistoryCommand(io);
      break;
    case 'weights':
      result = runWeightsCommand(io);
      break;
    case 'condense':
      result = await runCondenseCommand(io);
      break;
    case undefined:
    case 'run':
      result = await runDefaultCommand(io);
      break;
    default:
      result = {
        exitCode: 2,
        stdout: '',
        stderr: `unknown command: ${topCmd}\n`,
      };
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}

main().catch((err: Error | { message?: string } | string) => {
  const msg =
    err instanceof Error
      ? err.stack ?? err.message
      : typeof err === 'string'
        ? err
        : err.message ?? JSON.stringify(err);
  process.stderr.write(`fatal: ${msg}\n`);
  process.exit(1);
});
```

Note: the `require` for `node:fs` is intentional — synchronous stdin in ESM with strict types is awkward. Alternative: use `import { readFileSync } from 'node:fs'` at top and call `readFileSync(0, 'utf8')` directly. Plan executor: use the `import` form; drop the `require`.

Revised stdin reader:

```ts
import { readFileSync } from 'node:fs';

function readStdinSync(): string {
  if (process.stdin.isTTY) return '';
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}
```

Use this version.

- [ ] **Step 2: Add `chmod +x` step to build**

Update `package.json` `build` script:

```json
"build": "tsc && chmod +x dist/cli.js"
```

- [ ] **Step 3: Build and smoke-test**

Run: `npm run build`
Expected: `dist/cli.js` exists and is executable.

Run: `WORK_NEXT_CONFIG_DIR=/tmp/wn-smoke node dist/cli.js config validate`
Expected: exit code 1 with structured error JSON about missing files (since `/tmp/wn-smoke` has no configs).

Run: `echo '{"subagentReturns":[],"weights":{"version":1,"weights":{},"observationDeltas":{"correlationBoost":0,"runtimeArgsBoost":0,"ambientPenalty":0},"condensation":{"historyLineThreshold":200}},"observations":{"correlations":[],"runtimeArgsRelevance":{},"ambientPenalty":0}}' | node dist/cli.js score`
Expected: prints `{"ranked":[]}` and exits 0.

- [ ] **Step 4: Commit** (confirm with user first)

```bash
git add src/cli.ts package.json
git commit -m "feat(cli): add entry point with subcommand routing"
```

---

## Task 12: Run command (`commands/run.ts`)

The default command — what `work-next` (no args) invokes when called as a standalone CLI. It detects whether `claude` or `codex` is available and shells out, passing the skill content via the host's prompt-input mechanism. The skill markdown does the actual orchestration once invoked.

**Files:**
- Create: `tests/commands/run.test.ts`
- Create: `src/commands/run.ts`

- [ ] **Step 1: Write failing tests** (mock-based, don't actually spawn `claude`)

`tests/commands/run.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runDefaultCommand } from '../../src/commands/run.js';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from 'node:child_process';

describe('runDefaultCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects claude when available and invokes it', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'which' || cmd === 'command') {
        return {
          status: 0,
          stdout: Buffer.from('/usr/local/bin/claude\n'),
          stderr: Buffer.from(''),
          signal: null,
          pid: 1,
          output: [],
        };
      }
      if (cmd === 'claude') {
        return {
          status: 0,
          stdout: Buffer.from('ok'),
          stderr: Buffer.from(''),
          signal: null,
          pid: 2,
          output: [],
        };
      }
      return { status: 1, stdout: Buffer.from(''), stderr: Buffer.from('not found'), signal: null, pid: 0, output: [] };
    });

    const result = await runDefaultCommand({ stdin: '', argv: [], configDir: '/tmp' });
    expect(result.exitCode).toBe(0);
    const calls = vi.mocked(spawnSync).mock.calls;
    expect(calls.some((c) => c[0] === 'claude')).toBe(true);
  });

  it('falls back to codex when claude not found', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string, args?: ReadonlyArray<string>) => {
      if ((cmd === 'which' || cmd === 'command') && args?.includes('claude')) {
        return { status: 1, stdout: Buffer.from(''), stderr: Buffer.from(''), signal: null, pid: 0, output: [] };
      }
      if ((cmd === 'which' || cmd === 'command') && args?.includes('codex')) {
        return { status: 0, stdout: Buffer.from('/usr/local/bin/codex\n'), stderr: Buffer.from(''), signal: null, pid: 1, output: [] };
      }
      if (cmd === 'codex') {
        return { status: 0, stdout: Buffer.from('ok'), stderr: Buffer.from(''), signal: null, pid: 2, output: [] };
      }
      return { status: 1, stdout: Buffer.from(''), stderr: Buffer.from('not found'), signal: null, pid: 0, output: [] };
    });

    const result = await runDefaultCommand({ stdin: '', argv: [], configDir: '/tmp' });
    expect(result.exitCode).toBe(0);
    const calls = vi.mocked(spawnSync).mock.calls;
    expect(calls.some((c) => c[0] === 'codex')).toBe(true);
  });

  it('errors when no host CLI is available', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      signal: null,
      pid: 0,
      output: [],
    });
    const result = await runDefaultCommand({ stdin: '', argv: [], configDir: '/tmp' });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/neither.*claude.*codex/i);
  });

  it('runCondenseCommand sends a condense-only prompt', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'which') {
        return {
          status: 0,
          stdout: Buffer.from('/usr/local/bin/claude\n'),
          stderr: Buffer.from(''),
          signal: null,
          pid: 1,
          output: [],
        };
      }
      return {
        status: 0,
        stdout: Buffer.from('ok'),
        stderr: Buffer.from(''),
        signal: null,
        pid: 2,
        output: [],
      };
    });
    const { runCondenseCommand } = await import('../../src/commands/run.js');
    const result = await runCondenseCommand({ stdin: '', argv: [], configDir: '/tmp' });
    expect(result.exitCode).toBe(0);
    const claudeCall = vi.mocked(spawnSync).mock.calls.find((c) => c[0] === 'claude');
    const promptArg = claudeCall?.[1]?.[1] ?? '';
    expect(promptArg).toMatch(/condense-only/i);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

Run: `npm test -- tests/commands/run.test.ts`
Expected: fails.

- [ ] **Step 3: Implement `src/commands/run.ts`**

```ts
import { spawnSync } from 'node:child_process';
import type { CommandIO, CommandResult } from './types.js';

function which(cmd: string): boolean {
  const r = spawnSync('which', [cmd], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim().length > 0;
}

function buildInvocation(runtimeArgs: string): string {
  const args = runtimeArgs.trim();
  const base = 'Run the work-next skill';
  return args.length > 0 ? `${base} with these runtime notes: ${args}` : base;
}

function shellToHost(prompt: string): CommandResult {
  if (which('claude')) {
    const r = spawnSync('claude', ['-p', prompt], { stdio: 'inherit', encoding: 'utf8' });
    return { exitCode: r.status ?? 1, stdout: '', stderr: '' };
  }
  if (which('codex')) {
    const r = spawnSync('codex', ['-p', prompt], { stdio: 'inherit', encoding: 'utf8' });
    return { exitCode: r.status ?? 1, stdout: '', stderr: '' };
  }
  return {
    exitCode: 127,
    stdout: '',
    stderr: 'work-next: neither `claude` nor `codex` is on PATH; install one of them.\n',
  };
}

export async function runDefaultCommand(io: CommandIO): Promise<CommandResult> {
  const runtimeArgs = io.argv.join(' ');
  return shellToHost(buildInvocation(runtimeArgs));
}

export async function runCondenseCommand(_io: CommandIO): Promise<CommandResult> {
  return shellToHost(
    'Run the work-next skill in condense-only mode. Skip the normal subagent fan-out. Instead: load ~/.config/work-next/history.jsonl and the current weights, analyze acceptance patterns, propose weight changes per the condensation prompt, and present them to the user for approval.',
  );
}
```

**Note for plan executor:** The `-p` flag for codex is assumed to be parity with `claude -p` (one-shot prompt mode). If codex uses a different flag (e.g. `--prompt`, positional arg, or stdin), update the `codex` branch in `shellToHost` accordingly. Verify by running `codex --help` before completing this task. If codex isn't installed locally, leave the `-p` assumption and add a TODO comment with a fallback verification step in the README dev section.

- [ ] **Step 4: Run tests — confirm they pass**

Run: `npm test -- tests/commands/run.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 5: Run lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both pass.

- [ ] **Step 6: Commit** (confirm with user first)

```bash
git add src/commands/run.ts tests/commands/run.test.ts
git commit -m "feat(cli): add default run command that shells to claude/codex"
```

---

## Task 13: Skill markdown + prompts

**Files:**
- Create: `skill/SKILL.md`
- Create: `skill/prompts/subagent.md`
- Create: `skill/prompts/condense.md`
- Create: `skill/prompts/present.md`

No tests — these are LLM prompts. Verification is manual.

- [ ] **Step 1: Create `skill/SKILL.md`**

```markdown
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
  "weights": { ... full WeightsConfig ... },
  "ambient": { "dayOfWeek": "...", "localHour": ... }
}
```

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
```

- [ ] **Step 2: Create `skill/prompts/subagent.md`**

```markdown
# Subagent prompt template

You are a subagent in the work-next skill. Your job: evaluate the data source described below and return your single highest-priority item plus an urgency score.

**Task (from config):**
{{prompt}}

**Strict return format.** Reply with ONLY a JSON object (no commentary, no markdown fences). Schema:

```json
{
  "item": { "title": "string", "source": "string", "ref": "optional string" },
  "urgency": 0.0,
  "rationale": "one to two sentences explaining urgency"
}
```

- `urgency` is in `[0, 1]`. 1 = drop everything. 0.5 = should look at today. 0 = nothing here / skip.
- If your data source is unavailable, return: `{"item": null, "urgency": 0, "rationale": "data source unavailable: <reason>", "status": "unavailable"}`.
- Pick ONE item. If nothing qualifies, return urgency 0.

Do not include any other text in your response.
```

- [ ] **Step 3: Create `skill/prompts/condense.md`**

```markdown
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
```

- [ ] **Step 4: Create `skill/prompts/present.md`**

```markdown
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
```

- [ ] **Step 5: Commit** (confirm with user first)

```bash
git add skill/
git commit -m "feat(skill): add SKILL.md and prompt templates"
```

---

## Task 14: Default seed configs

**Files:**
- Create: `skill/defaults/subagents.json`
- Create: `skill/defaults/weights.json`

- [ ] **Step 1: Create `skill/defaults/subagents.json`**

```json
{
  "version": 1,
  "subagents": [
    {
      "name": "github-prs",
      "description": "GitHub PRs awaiting your action (review requested, comments to address, failing CI on your PRs)",
      "prompt": "Use the `gh` CLI (or GitHub MCP if available) to identify the single most urgent GitHub PR the user should act on. Consider: PRs where the user is requested as a reviewer (especially older ones), the user's own PRs with new comments or failing CI, and PRs blocking other work. Pick the single highest-priority one. Rationale should be 1-2 sentences. Set urgency in [0, 1]: 1 = blocking someone right now, 0.7 = stale review request > 2 days, 0.4 = recent review request, 0.2 = own PR with minor comments, 0 = nothing actionable.",
      "dataSources": ["gh CLI", "GitHub MCP"],
      "enabled": true,
      "timeoutMs": 120000
    },
    {
      "name": "linear-issues",
      "description": "Linear issues assigned to you, blocking, or due soon",
      "prompt": "Use the Linear MCP to identify the single most urgent Linear issue the user should pick up. Consider: issues assigned to the user that are In Progress (resume), Todo with high priority or due date approaching, issues blocking other team members, and recent mentions. Pick one. Rationale should be 1-2 sentences. Set urgency in [0, 1]: 1 = due today / blocking someone, 0.7 = due this week, 0.4 = high priority assigned with no due date, 0.2 = low priority, 0 = nothing actionable.",
      "dataSources": ["Linear MCP"],
      "enabled": true,
      "timeoutMs": 120000
    }
  ]
}
```

- [ ] **Step 2: Create `skill/defaults/weights.json`**

```json
{
  "version": 1,
  "weights": {
    "github-prs": 1.0,
    "linear-issues": 1.0
  },
  "observationDeltas": {
    "correlationBoost": 0.1,
    "runtimeArgsBoost": 0.2,
    "ambientPenalty": -0.15
  },
  "condensation": {
    "historyLineThreshold": 200
  }
}
```

- [ ] **Step 3: Verify defaults pass validation**

Run from repo root:

```bash
mkdir -p /tmp/wn-defaults-check
cp skill/defaults/* /tmp/wn-defaults-check/
WORK_NEXT_CONFIG_DIR=/tmp/wn-defaults-check node dist/cli.js config validate
```

Expected: exit code 0; stdout JSON with `ok: true`, the two subagents listed, and `ambient`.

- [ ] **Step 4: Commit** (confirm with user first)

```bash
git add skill/defaults/
git commit -m "feat(skill): add default seed configs for github-prs + linear-issues"
```

---

## Task 15: Install / uninstall scripts

**Files:**
- Create: `install.sh`
- Create: `uninstall.sh`

- [ ] **Step 1: Create `install.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${WORK_NEXT_CONFIG_DIR:-$HOME/.config/work-next}"
SKILLS_DIR="$HOME/.claude/skills"
BIN_DIR="$HOME/.local/bin"

require_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "error: node not found on PATH" >&2
    exit 1
  fi
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$major" -lt 20 ]; then
    echo "error: node >= 20 required (found v$(node -v))" >&2
    exit 1
  fi
}

build() {
  cd "$REPO_ROOT"
  npm install
  npm run build
}

seed_config() {
  mkdir -p "$CONFIG_DIR"
  if [ ! -f "$CONFIG_DIR/subagents.json" ]; then
    cp "$REPO_ROOT/skill/defaults/subagents.json" "$CONFIG_DIR/subagents.json"
    echo "seeded $CONFIG_DIR/subagents.json"
  else
    echo "preserved existing $CONFIG_DIR/subagents.json"
  fi
  if [ ! -f "$CONFIG_DIR/weights.json" ]; then
    cp "$REPO_ROOT/skill/defaults/weights.json" "$CONFIG_DIR/weights.json"
    echo "seeded $CONFIG_DIR/weights.json"
  else
    echo "preserved existing $CONFIG_DIR/weights.json"
  fi
}

link_skill() {
  mkdir -p "$SKILLS_DIR"
  local target="$SKILLS_DIR/work-next"
  if [ -L "$target" ]; then
    rm "$target"
  elif [ -e "$target" ]; then
    echo "error: $target exists and is not a symlink; refusing to overwrite" >&2
    exit 1
  fi
  ln -s "$REPO_ROOT/skill" "$target"
  echo "linked $target -> $REPO_ROOT/skill"
}

link_cli() {
  mkdir -p "$BIN_DIR"
  local target="$BIN_DIR/work-next"
  if [ -L "$target" ] || [ -e "$target" ]; then
    rm "$target"
  fi
  ln -s "$REPO_ROOT/dist/cli.js" "$target"
  echo "linked $target -> $REPO_ROOT/dist/cli.js"
}

summary() {
  cat <<EOF

work-next installed.

  Skill:        $SKILLS_DIR/work-next  -> $REPO_ROOT/skill
  CLI binary:   $BIN_DIR/work-next     -> $REPO_ROOT/dist/cli.js
  Config dir:   $CONFIG_DIR

Make sure $BIN_DIR is on your PATH.

Try it:
  work-next config validate
  work-next                       # invokes claude or codex
  /work-next                      # inside a Claude Code session

EOF
}

require_node
build
seed_config
link_skill
link_cli
summary
```

- [ ] **Step 2: Create `uninstall.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

SKILLS_DIR="$HOME/.claude/skills"
BIN_DIR="$HOME/.local/bin"

remove_symlink() {
  local target="$1"
  if [ -L "$target" ]; then
    rm "$target"
    echo "removed $target"
  elif [ -e "$target" ]; then
    echo "warning: $target exists but is not a symlink — leaving in place" >&2
  fi
}

remove_symlink "$SKILLS_DIR/work-next"
remove_symlink "$BIN_DIR/work-next"

cat <<EOF

work-next uninstalled.

Your config and history at \${WORK_NEXT_CONFIG_DIR:-\$HOME/.config/work-next} are preserved.
Remove them manually if you want a clean slate.

EOF
```

- [ ] **Step 3: Mark scripts executable**

Run: `chmod +x install.sh uninstall.sh`

- [ ] **Step 4: Smoke test install/uninstall in a sandbox**

```bash
WORK_NEXT_CONFIG_DIR=/tmp/wn-install-test HOME=/tmp/wn-install-home ./install.sh
ls -la /tmp/wn-install-home/.claude/skills/work-next
ls -la /tmp/wn-install-home/.local/bin/work-next
ls /tmp/wn-install-test/
WORK_NEXT_CONFIG_DIR=/tmp/wn-install-test HOME=/tmp/wn-install-home ./uninstall.sh
```

Expected: install creates two symlinks and seeds two config files; uninstall removes the symlinks; config files remain.

- [ ] **Step 5: Commit** (confirm with user first)

```bash
git add install.sh uninstall.sh
git commit -m "feat(install): add install/uninstall scripts that symlink skill + CLI"
```

---

## Task 16: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

````markdown
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
````

- [ ] **Step 2: Run final verification across the whole project**

Run: `npm run verify`
Expected: lint passes, typecheck passes, all tests pass, build succeeds.

- [ ] **Step 3: Commit** (confirm with user first)

```bash
git add README.md
git commit -m "docs: add README with install, usage, dev instructions"
```

---

## Done criteria

- [ ] All 16 tasks above complete with their commits.
- [ ] `npm run verify` passes cleanly.
- [ ] `./install.sh` runs end-to-end in a sandbox (Task 15 Step 4).
- [ ] At least one manual smoke test from a clean shell:
  - `work-next config validate` → succeeds with defaults seeded.
  - `echo '<minimal-score-input>' | work-next score` → returns ranked JSON.
- [ ] Skill is loadable: `/work-next` appears in a Claude Code session's slash-command list after install.

The skill is shippable when all of the above are green.
