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
