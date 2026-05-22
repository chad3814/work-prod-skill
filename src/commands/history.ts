import { existsSync, readFileSync } from 'node:fs';
import { HistoryRowSchema } from '../lib/schema.js';
import { loadWeightsConfig } from '../lib/config.js';
import { historyPath } from '../lib/paths.js';
import { appendRow, shouldCondense, archive, recordPick } from '../lib/history.js';
import { safeParseJson } from '../lib/json.js';
import type { CommandIO, CommandResult } from './types.js';
import type { HistoryRow } from '../lib/schema.js';

function timestampForArchive(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function runHistoryCommand(io: CommandIO): CommandResult {
  const sub = io.argv[0];
  if (sub === undefined) {
    return { exitCode: 2, stdout: '', stderr: 'history: missing subcommand\n' };
  }
  const dir = io.configDir;
  if (dir === undefined) {
    return { exitCode: 2, stdout: '', stderr: 'history: configDir is required\n' };
  }

  if (sub === 'append') {
    const parsedJson = safeParseJson<HistoryRow>(io.stdin);
    if (!parsedJson.ok) {
      return { exitCode: 2, stdout: '', stderr: `invalid JSON: ${parsedJson.error}\n` };
    }
    const valid = HistoryRowSchema.safeParse(parsedJson.value);
    if (!valid.success) {
      return { exitCode: 2, stdout: '', stderr: `invalid row: ${valid.error.message}\n` };
    }
    appendRow(dir, valid.data);
    return { exitCode: 0, stdout: '', stderr: '' };
  }

  if (sub === 'should-condense') {
    const weights = loadWeightsConfig(dir);
    if (!weights.ok) {
      return {
        exitCode: 2,
        stdout: '',
        stderr: `cannot load weights: ${weights.errors.map((e) => e.message).join('; ')}\n`,
      };
    }
    return {
      exitCode: shouldCondense(dir, weights.value) ? 0 : 1,
      stdout: '',
      stderr: '',
    };
  }

  if (sub === 'archive') {
    const result = archive(dir, timestampForArchive());
    if (result === null) {
      return { exitCode: 0, stdout: '', stderr: '' };
    }
    return { exitCode: 0, stdout: `${result}\n`, stderr: '' };
  }

  if (sub === 'record-pick') {
    const rankArg = io.argv[1];
    if (rankArg === undefined) {
      return { exitCode: 2, stdout: '', stderr: 'record-pick: rank required (number or "null")\n' };
    }
    const noteFlag = io.argv.indexOf('--note');
    const note = noteFlag !== -1 ? io.argv[noteFlag + 1] : undefined;
    const rank = rankArg === 'null' ? null : Number.parseInt(rankArg, 10);
    if (rank !== null && Number.isNaN(rank)) {
      return { exitCode: 2, stdout: '', stderr: `record-pick: invalid rank "${rankArg}"\n` };
    }
    try {
      if (rank === null) {
        recordPick(dir, note === undefined ? { rank: null } : { rank: null, note });
      } else if (rank === 1 || rank === 2 || rank === 3) {
        recordPick(dir, note === undefined ? { rank } : { rank, note });
      } else {
        return { exitCode: 2, stdout: '', stderr: `record-pick: rank must be 1, 2, 3, or null (got ${rank})\n` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { exitCode: 1, stdout: '', stderr: `record-pick failed: ${msg}\n` };
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  }

  if (sub === 'show') {
    const filepath = historyPath(dir);
    if (!existsSync(filepath)) {
      return { exitCode: 0, stdout: '', stderr: '' };
    }
    return { exitCode: 0, stdout: readFileSync(filepath, 'utf8'), stderr: '' };
  }

  return { exitCode: 2, stdout: '', stderr: `history: unknown subcommand "${sub}"\n` };
}
