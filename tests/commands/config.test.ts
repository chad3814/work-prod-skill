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

  it('returns ok JSON on stdout when both files valid', async () => {
    seedValid(dir);
    const result = await runConfigCommand({ stdin: '', argv: ['validate'], configDir: dir });
    expect(result.exitCode).toBe(0);
    type Parsed = { ok: boolean; subagents: Array<{ name: string }>; weights: object; ambient: { dayOfWeek: string; localHour: number } };
    const parsed = JSON.parse(result.stdout) as Parsed;
    expect(parsed.ok).toBe(true);
    expect(parsed.subagents).toHaveLength(1);
    expect(typeof parsed.ambient.dayOfWeek).toBe('string');
    expect(typeof parsed.ambient.localHour).toBe('number');
  });

  it('filters out disabled subagents', async () => {
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
    const result = await runConfigCommand({ stdin: '', argv: ['validate'], configDir: dir });
    type Parsed = { subagents: Array<{ name: string }> };
    const parsed = JSON.parse(result.stdout) as Parsed;
    expect(parsed.subagents).toHaveLength(1);
    expect(parsed.subagents[0]?.name).toBe('a');
  });

  it('returns non-zero with structured errors on bad config', async () => {
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
    const result = await runConfigCommand({ stdin: '', argv: ['validate'], configDir: dir });
    expect(result.exitCode).toBe(1);
    type Parsed = { ok: boolean; errors: Array<{ path: string; message: string }> };
    const parsed = JSON.parse(result.stdout) as Parsed;
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it('show subcommand prints both configs as JSON', async () => {
    seedValid(dir);
    const result = await runConfigCommand({ stdin: '', argv: ['show'], configDir: dir });
    expect(result.exitCode).toBe(0);
    type Parsed = { subagents: object; weights: object };
    const parsed = JSON.parse(result.stdout) as Parsed;
    expect(parsed.subagents).toBeDefined();
    expect(parsed.weights).toBeDefined();
  });

  it('errors when subcommand missing', async () => {
    const result = await runConfigCommand({ stdin: '', argv: [], configDir: dir });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/subcommand/i);
  });
});

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
    type Parsed = { subagents: Array<{ name: string }>; unavailable: Array<{ name: string }> };
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
    type Parsed = { subagents: Array<{ name: string }>; unavailable: Array<{ name: string }> };
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
      subagents: Array<{ name: string }>;
      unavailable: Array<{ name: string; reason: string }>;
    };
    const parsed = JSON.parse(result.stdout) as Parsed;
    expect(parsed.subagents).toEqual([]);
    expect(parsed.unavailable[0]?.name).toBe('slow');
    expect(parsed.unavailable[0]?.reason).toMatch(/timed out/i);
  });
});
