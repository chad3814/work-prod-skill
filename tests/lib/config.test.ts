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
