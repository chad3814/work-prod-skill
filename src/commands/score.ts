import { ScoreInputSchema } from '../lib/schema.js';
import { score } from '../lib/scoring.js';
import { safeParseJson } from '../lib/json.js';

export type CommandIO = { stdin: string; argv: string[]; configDir?: string };
export type CommandResult = { exitCode: number; stdout: string; stderr: string };

export function runScoreCommand(io: CommandIO): CommandResult {
  const parsedJson = safeParseJson(io.stdin);
  if (!parsedJson.ok) {
    return { exitCode: 2, stdout: '', stderr: `invalid JSON on stdin: ${parsedJson.error}\n` };
  }
  const parsed = ScoreInputSchema.safeParse(parsedJson.value);
  if (!parsed.success) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: `schema validation failed: ${parsed.error.message}\n`,
    };
  }
  const result = score(parsed.data);
  return { exitCode: 0, stdout: `${JSON.stringify(result)}\n`, stderr: '' };
}
