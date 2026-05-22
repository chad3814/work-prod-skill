import { homedir } from 'node:os';
import { join } from 'node:path';

export function defaultConfigDir(): string {
  return process.env.WORK_NEXT_CONFIG_DIR ?? join(homedir(), '.config', 'work-next');
}

export function subagentsConfigPath(dir: string): string {
  return join(dir, 'subagents.json');
}

export function weightsConfigPath(dir: string): string {
  return join(dir, 'weights.json');
}

export function historyPath(dir: string): string {
  return join(dir, 'history.jsonl');
}

export function archivePath(dir: string, timestamp: string): string {
  return join(dir, `history.archive.${timestamp}.jsonl`);
}
