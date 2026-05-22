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
