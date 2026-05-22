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
