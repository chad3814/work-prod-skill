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

describe('weights unknown subcommand', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir(); });
  afterEach(() => { cleanupTempDir(dir); });

  it('returns "unknown subcommand" error without parsing stdin', () => {
    const result = runWeightsCommand({
      stdin: 'not even json',
      argv: ['bogus'],
      configDir: dir,
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/unknown subcommand/i);
    expect(result.stderr).not.toMatch(/json/i);
  });
});
