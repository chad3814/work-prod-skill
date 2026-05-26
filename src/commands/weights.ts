import { renameSync, writeFileSync } from 'node:fs';
import { WeightsConfigSchema } from '../lib/schema.js';
import { weightsConfigPath } from '../lib/paths.js';
import { loadWeightsConfig } from '../lib/config.js';
import { safeParseJson } from '../lib/json.js';
import type { CommandIO, CommandResult } from './types.js';
import type { WeightsConfig } from '../lib/schema.js';

function diffLines(current: WeightsConfig, proposed: WeightsConfig): string[] {
  const out: string[] = [];
  const allKeys = new Set([...Object.keys(current.weights), ...Object.keys(proposed.weights)]);
  for (const k of [...allKeys].sort()) {
    const before = current.weights[k];
    const after = proposed.weights[k];
    if (before !== after) {
      out.push(`weights.${k}: ${before ?? '(absent)'} -> ${after ?? '(absent)'}`);
    }
  }
  const deltaKeys = ['correlationBoost', 'runtimeArgsBoost', 'ambientPenalty'] as const;
  for (const k of deltaKeys) {
    if (current.observationDeltas[k] !== proposed.observationDeltas[k]) {
      out.push(
        `observationDeltas.${k}: ${current.observationDeltas[k]} -> ${proposed.observationDeltas[k]}`,
      );
    }
  }
  if (current.condensation.historyLineThreshold !== proposed.condensation.historyLineThreshold) {
    out.push(
      `condensation.historyLineThreshold: ${current.condensation.historyLineThreshold} -> ${proposed.condensation.historyLineThreshold}`,
    );
  }
  return out;
}

export function runWeightsCommand(io: CommandIO): CommandResult {
  const sub = io.argv[0];
  if (sub === undefined) {
    return { exitCode: 2, stdout: '', stderr: 'weights: missing subcommand (propose|apply)\n' };
  }
  const dir = io.configDir;
  if (dir === undefined) {
    return { exitCode: 2, stdout: '', stderr: 'weights: configDir is required\n' };
  }
  if (sub !== 'propose' && sub !== 'apply') {
    return { exitCode: 2, stdout: '', stderr: `weights: unknown subcommand "${sub}"\n` };
  }

  const parsedJson = safeParseJson<WeightsConfig>(io.stdin);
  if (!parsedJson.ok) {
    return { exitCode: 2, stdout: '', stderr: `invalid JSON: ${parsedJson.error}\n` };
  }
  const proposed = WeightsConfigSchema.safeParse(parsedJson.value);
  if (!proposed.success) {
    return { exitCode: 2, stdout: '', stderr: `invalid weights: ${proposed.error.message}\n` };
  }

  if (sub === 'propose') {
    const current = loadWeightsConfig(dir);
    if (!current.ok) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `cannot load current weights: ${current.errors.map((e) => e.message).join('; ')}\n`,
      };
    }
    const lines = diffLines(current.value, proposed.data);
    if (lines.length === 0) {
      return { exitCode: 0, stdout: '(no changes)\n', stderr: '' };
    }
    return { exitCode: 0, stdout: `${lines.join('\n')}\n`, stderr: '' };
  }

  // sub === 'apply'
  const target = weightsConfigPath(dir);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(proposed.data, null, 2)}\n`);
  renameSync(tmp, target);
  return { exitCode: 0, stdout: '', stderr: '' };
}
