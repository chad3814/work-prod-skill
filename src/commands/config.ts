import { loadSubagentsConfig, loadWeightsConfig } from '../lib/config.js';
import type { CommandIO, CommandResult } from './types.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ambient(): { dayOfWeek: string; localHour: number } {
  const now = new Date();
  const day = DAY_NAMES[now.getDay()];
  if (day === undefined) throw new Error('unreachable: invalid day index');
  return { dayOfWeek: day, localHour: now.getHours() };
}

export function runConfigCommand(io: CommandIO): CommandResult {
  const sub = io.argv[0];
  if (sub === undefined) {
    return { exitCode: 2, stdout: '', stderr: 'config: missing subcommand (validate|show)\n' };
  }
  const dir = io.configDir;
  if (dir === undefined) {
    return { exitCode: 2, stdout: '', stderr: 'config: configDir is required\n' };
  }
  if (sub === 'validate') {
    const subs = loadSubagentsConfig(dir);
    const weights = loadWeightsConfig(dir);
    if (!subs.ok || !weights.ok) {
      const errors = [...(subs.ok ? [] : subs.errors), ...(weights.ok ? [] : weights.errors)];
      return {
        exitCode: 1,
        stdout: `${JSON.stringify({ ok: false, errors })}\n`,
        stderr: '',
      };
    }
    const enabled = subs.value.subagents.filter((s) => s.enabled);
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({ ok: true, subagents: enabled, weights: weights.value, ambient: ambient() })}\n`,
      stderr: '',
    };
  }
  if (sub === 'show') {
    const subs = loadSubagentsConfig(dir);
    const weights = loadWeightsConfig(dir);
    if (!subs.ok || !weights.ok) {
      const errors = [...(subs.ok ? [] : subs.errors), ...(weights.ok ? [] : weights.errors)];
      return { exitCode: 1, stdout: `${JSON.stringify({ ok: false, errors })}\n`, stderr: '' };
    }
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({ subagents: subs.value, weights: weights.value })}\n`,
      stderr: '',
    };
  }
  return { exitCode: 2, stdout: '', stderr: `config: unknown subcommand "${sub}"\n` };
}
