#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runScoreCommand } from './commands/score.js';
import { runConfigCommand } from './commands/config.js';
import { runHistoryCommand } from './commands/history.js';
import { runWeightsCommand } from './commands/weights.js';
import { runDefaultCommand, runCondenseCommand } from './commands/run.js';
import { defaultConfigDir } from './lib/paths.js';
import type { CommandIO, CommandResult } from './commands/types.js';

function readStdinSync(): string {
  if (process.stdin.isTTY) return '';
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

async function main(): Promise<void> {
  const [, , topCmd, ...rest] = process.argv;
  const stdin = readStdinSync();
  const io: CommandIO = {
    stdin,
    argv: rest,
    configDir: defaultConfigDir(),
  };

  let result: CommandResult;
  switch (topCmd) {
    case 'score':
      result = runScoreCommand(io);
      break;
    case 'config':
      result = runConfigCommand(io);
      break;
    case 'history':
      result = runHistoryCommand(io);
      break;
    case 'weights':
      result = runWeightsCommand(io);
      break;
    case 'condense':
      result = await runCondenseCommand(io);
      break;
    case undefined:
    case 'run':
      result = await runDefaultCommand(io);
      break;
    default:
      result = {
        exitCode: 2,
        stdout: '',
        stderr: `unknown command: ${topCmd}\n`,
      };
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}

main().catch((err: Error | { message?: string } | string) => {
  let msg: string;
  if (err instanceof Error) {
    msg = err.stack ?? err.message;
  } else if (typeof err === 'string') {
    msg = err;
  } else {
    msg = err.message ?? JSON.stringify(err);
  }
  process.stderr.write(`fatal: ${msg}\n`);
  process.exit(1);
});
