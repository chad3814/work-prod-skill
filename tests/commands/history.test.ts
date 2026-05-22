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
