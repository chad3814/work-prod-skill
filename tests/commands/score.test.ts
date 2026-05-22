import { describe, it, expect } from 'vitest';
import { runScoreCommand } from '../../src/commands/score.js';

describe('runScoreCommand', () => {
  it('returns ranked JSON on stdout for valid input', () => {
    const input = {
      subagentReturns: [
        { name: 'a', item: { title: 't', source: 's' }, urgency: 0.5, rationale: 'r', status: 'ok' },
      ],
      weights: {
        version: 1,
        weights: { a: 1 },
        observationDeltas: { correlationBoost: 0, runtimeArgsBoost: 0, ambientPenalty: 0 },
        condensation: { historyLineThreshold: 200 },
      },
      observations: { correlations: [], runtimeArgsRelevance: {}, ambientPenalty: 0 },
    };
    const result = runScoreCommand({ stdin: JSON.stringify(input), argv: [] });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { ranked: Array<{ subagentName: string }> };
    expect(parsed.ranked[0]?.subagentName).toBe('a');
  });

  it('returns non-zero exit and structured error on invalid input', () => {
    const result = runScoreCommand({ stdin: '{ not json', argv: [] });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/json|parse/i);
  });

  it('returns non-zero exit on schema violation', () => {
    const result = runScoreCommand({
      stdin: JSON.stringify({ subagentReturns: 'not-an-array' }),
      argv: [],
    });
    expect(result.exitCode).not.toBe(0);
  });
});
