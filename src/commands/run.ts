import { spawnSync } from 'node:child_process';
import type { CommandIO, CommandResult } from './types.js';

function which(cmd: string): boolean {
  const r = spawnSync('which', [cmd], { encoding: 'utf8' });
  return r.status === 0 && String(r.stdout).trim().length > 0;
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
