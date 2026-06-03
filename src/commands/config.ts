import { loadSubagentsConfig, loadWeightsConfig } from '../lib/config.js';
import { runCanary } from '../lib/canary.js';
import type { Subagent } from '../lib/schema.js';
import type { CommandIO, CommandResult } from './types.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_CANARY_TIMEOUT_MS = 5000;

type UnavailableEntry = { name: string; reason: string; stderr: string };

function ambient(): { dayOfWeek: string; localHour: number } {
  const now = new Date();
  const day = DAY_NAMES[now.getDay()];
  if (day === undefined) throw new Error('unreachable: invalid day index');
  return { dayOfWeek: day, localHour: now.getHours() };
}

async function partitionByCanary(
  enabled: Subagent[],
): Promise<{ healthy: Subagent[]; unavailable: UnavailableEntry[] }> {
  const probes = enabled.map(async (s): Promise<{ subagent: Subagent; unavailable: UnavailableEntry | null }> => {
    if (s.canary === undefined) {
      return { subagent: s, unavailable: null };
    }
    const timeoutMs = s.canary.timeoutMs ?? DEFAULT_CANARY_TIMEOUT_MS;
    const result = await runCanary(s.canary.cmd, timeoutMs);
    if (result.ok) {
      return { subagent: s, unavailable: null };
    }
    return {
      subagent: s,
      unavailable: { name: s.name, reason: result.reason, stderr: result.stderr },
    };
  });
  const results = await Promise.all(probes);
  const healthy: Subagent[] = [];
  const unavailable: UnavailableEntry[] = [];
  for (const r of results) {
    if (r.unavailable === null) {
      healthy.push(r.subagent);
    } else {
      unavailable.push(r.unavailable);
    }
  }
  return { healthy, unavailable };
}

export async function runConfigCommand(io: CommandIO): Promise<CommandResult> {
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
    const { healthy, unavailable } = await partitionByCanary(enabled);
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({
        ok: true,
        subagents: healthy,
        unavailable,
        weights: weights.value,
        ambient: ambient(),
      })}\n`,
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
