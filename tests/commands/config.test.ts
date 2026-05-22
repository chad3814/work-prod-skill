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
    type Parsed = { ok: boolean; subagents: Array<{ name: string }>; weights: object; ambient: { dayOfWeek: string; localHour: number } };
    const parsed = JSON.parse(result.stdout) as Parsed;
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
    type Parsed = { subagents: Array<{ name: string }> };
    const parsed = JSON.parse(result.stdout) as Parsed;
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
    type Parsed = { ok: boolean; errors: Array<{ path: string; message: string }> };
    const parsed = JSON.parse(result.stdout) as Parsed;
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it('show subcommand prints both configs as JSON', () => {
    seedValid(dir);
    const result = runConfigCommand({ stdin: '', argv: ['show'], configDir: dir });
    expect(result.exitCode).toBe(0);
    type Parsed = { subagents: object; weights: object };
    const parsed = JSON.parse(result.stdout) as Parsed;
    expect(parsed.subagents).toBeDefined();
    expect(parsed.weights).toBeDefined();
  });

  it('errors when subcommand missing', () => {
    const result = runConfigCommand({ stdin: '', argv: [], configDir: dir });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/subcommand/i);
  });
});
