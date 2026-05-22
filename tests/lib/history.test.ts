import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
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
    expect(archivePath).not.toBeNull();
    if (archivePath !== null) {
      expect(existsSync(archivePath)).toBe(true);
      expect(archivePath).toMatch(/history\.archive\.2026-05-22T10-00-00\.jsonl$/);
    }
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
