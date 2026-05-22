import {
  appendFileSync,
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { historyPath, archivePath } from './paths.js';
import { HistoryRowSchema } from './schema.js';
import type { HistoryRow, UserPick, WeightsConfig } from './schema.js';

const DEFAULT_THRESHOLD = 200;
const MAX_THRESHOLD = 2000;

export function appendRow(dir: string, row: HistoryRow): void {
  HistoryRowSchema.parse(row);
  appendFileSync(historyPath(dir), `${JSON.stringify(row)}\n`, { flag: 'a' });
}

export function lineCount(dir: string): number {
  const filepath = historyPath(dir);
  if (!existsSync(filepath)) return 0;
  const content = readFileSync(filepath, 'utf8');
  if (content.length === 0) return 0;
  return content.split('\n').filter((l) => l.length > 0).length;
}

export function shouldCondense(dir: string, weights: WeightsConfig): boolean {
  return lineCount(dir) >= weights.condensation.historyLineThreshold;
}

export function archive(dir: string, timestamp: string): string | null {
  const filepath = historyPath(dir);
  if (!existsSync(filepath)) return null;
  const target = archivePath(dir, timestamp);
  renameSync(filepath, target);
  return target;
}

export function escalateThreshold(current: number): number {
  return Math.min(current * 2, MAX_THRESHOLD);
}

export function resetThreshold(): number {
  return DEFAULT_THRESHOLD;
}

export function recordPick(dir: string, pick: NonNullable<UserPick>): void {
  const filepath = historyPath(dir);
  if (!existsSync(filepath)) {
    throw new Error(`no history file at ${filepath}`);
  }
  const content = readFileSync(filepath, 'utf8');
  const lines = content.split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new Error('history file is empty');
  }
  const lastLine = lines[lines.length - 1];
  if (lastLine === undefined) throw new Error('unreachable: lines.length > 0');
  const lastRow = JSON.parse(lastLine) as HistoryRow;
  lastRow.userPick = pick;
  HistoryRowSchema.parse(lastRow);
  lines[lines.length - 1] = JSON.stringify(lastRow);
  const tmp = `${filepath}.tmp`;
  writeFileSync(tmp, `${lines.join('\n')}\n`);
  renameSync(tmp, filepath);
}
