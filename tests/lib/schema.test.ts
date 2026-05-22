import { describe, it, expect } from 'vitest';
import {
  SubagentsConfigSchema,
  WeightsConfigSchema,
  HistoryRowSchema,
  ScoreInputSchema,
  ScoreOutputSchema,
} from '../../src/lib/schema.js';

describe('SubagentsConfigSchema', () => {
  it('accepts a valid config', () => {
    const valid = {
      version: 1,
      subagents: [
        {
          name: 'github-prs',
          description: 'PRs awaiting review',
          prompt: 'Find the most urgent PR awaiting your review.',
          dataSources: ['gh CLI'],
        },
      ],
    };
    expect(() => SubagentsConfigSchema.parse(valid)).not.toThrow();
  });

  it('rejects wrong version', () => {
    expect(() =>
      SubagentsConfigSchema.parse({ version: 2, subagents: [] }),
    ).toThrow();
  });

  it('rejects negative timeoutMs', () => {
    expect(() =>
      SubagentsConfigSchema.parse({
        version: 1,
        subagents: [
          {
            name: 'x',
            description: 'd',
            prompt: 'p',
            dataSources: [],
            timeoutMs: -1,
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects empty prompt', () => {
    expect(() => SubagentsConfigSchema.parse({
      version: 1,
      subagents: [{ name: 'x', description: 'd', prompt: '', dataSources: [] }],
    })).toThrow();
  });

  it('rejects empty description', () => {
    expect(() => SubagentsConfigSchema.parse({
      version: 1,
      subagents: [{ name: 'x', description: '', prompt: 'p', dataSources: [] }],
    })).toThrow();
  });
});

describe('WeightsConfigSchema', () => {
  it('accepts a valid config', () => {
    const valid = {
      version: 1,
      weights: { 'github-prs': 1.0 },
      observationDeltas: {
        correlationBoost: 0.1,
        runtimeArgsBoost: 0.2,
        ambientPenalty: -0.15,
      },
      condensation: { historyLineThreshold: 200 },
    };
    expect(() => WeightsConfigSchema.parse(valid)).not.toThrow();
  });

  it('rejects threshold below 1', () => {
    const invalid = {
      version: 1,
      weights: {},
      observationDeltas: { correlationBoost: 0, runtimeArgsBoost: 0, ambientPenalty: 0 },
      condensation: { historyLineThreshold: 0 },
    };
    expect(() => WeightsConfigSchema.parse(invalid)).toThrow();
  });
});

describe('HistoryRowSchema', () => {
  it('accepts a row with all subagent statuses', () => {
    const row = {
      timestamp: '2026-05-22T10:00:00Z',
      runtimeArgs: null,
      ambient: { dayOfWeek: 'Friday', localHour: 15 },
      subagentReturns: [
        {
          name: 'a',
          item: { title: 't', source: 's' },
          urgency: 0.5,
          rationale: 'r',
          status: 'ok',
        },
        {
          name: 'b',
          item: null,
          urgency: 0,
          rationale: 'data source unavailable',
          status: 'unavailable',
        },
      ],
      finalRanking: [{ name: 'a', title: 't', score: 0.5, rank: 1 }],
      userPick: null,
    };
    expect(() => HistoryRowSchema.parse(row)).not.toThrow();
  });

  it('rejects urgency outside [0, 1]', () => {
    expect(() =>
      HistoryRowSchema.parse({
        timestamp: '2026-05-22T10:00:00Z',
        runtimeArgs: null,
        ambient: { dayOfWeek: 'Friday', localHour: 15 },
        subagentReturns: [
          { name: 'a', item: null, urgency: 1.5, rationale: 'r', status: 'ok' },
        ],
        finalRanking: [],
        userPick: null,
      }),
    ).toThrow();
  });

  it('rejects finalRanking rank outside 1..3', () => {
    expect(() =>
      HistoryRowSchema.parse({
        timestamp: '2026-05-22T10:00:00Z',
        runtimeArgs: null,
        ambient: { dayOfWeek: 'Friday', localHour: 15 },
        subagentReturns: [],
        finalRanking: [{ name: 'a', title: 't', score: 0.5, rank: 4 }],
        userPick: null,
      }),
    ).toThrow();
  });

  it('accepts userPick with rank 1', () => {
    const row = {
      timestamp: '2026-05-22T10:00:00Z',
      runtimeArgs: null,
      ambient: { dayOfWeek: 'Friday', localHour: 15 },
      subagentReturns: [],
      finalRanking: [],
      userPick: { rank: 1, note: 'opened it' },
    };
    expect(() => HistoryRowSchema.parse(row)).not.toThrow();
  });

  it('accepts userPick with rank null (declined)', () => {
    const row = {
      timestamp: '2026-05-22T10:00:00Z',
      runtimeArgs: null,
      ambient: { dayOfWeek: 'Friday', localHour: 15 },
      subagentReturns: [],
      finalRanking: [],
      userPick: { rank: null },
    };
    expect(() => HistoryRowSchema.parse(row)).not.toThrow();
  });

  it('rejects userPick with rank 5', () => {
    const row = {
      timestamp: '2026-05-22T10:00:00Z',
      runtimeArgs: null,
      ambient: { dayOfWeek: 'Friday', localHour: 15 },
      subagentReturns: [],
      finalRanking: [],
      userPick: { rank: 5 },
    };
    expect(() => HistoryRowSchema.parse(row)).toThrow();
  });

  it('rejects empty subagentReturn name', () => {
    expect(() =>
      HistoryRowSchema.parse({
        timestamp: '2026-05-22T10:00:00Z',
        runtimeArgs: null,
        ambient: { dayOfWeek: 'Friday', localHour: 15 },
        subagentReturns: [
          { name: '', item: null, urgency: 0.5, rationale: 'r', status: 'ok' },
        ],
        finalRanking: [],
        userPick: null,
      }),
    ).toThrow();
  });
});

describe('ScoreInputSchema and ScoreOutputSchema', () => {
  it('accepts minimal ScoreInput', () => {
    const input = {
      subagentReturns: [
        {
          name: 'a',
          item: { title: 't', source: 's' },
          urgency: 0.5,
          rationale: 'r',
          status: 'ok',
        },
      ],
      weights: {
        version: 1,
        weights: { a: 1 },
        observationDeltas: { correlationBoost: 0, runtimeArgsBoost: 0, ambientPenalty: 0 },
        condensation: { historyLineThreshold: 200 },
      },
      observations: {
        correlations: [],
        runtimeArgsRelevance: {},
        ambientPenalty: 0,
      },
    };
    expect(() => ScoreInputSchema.parse(input)).not.toThrow();
  });

  it('accepts a ScoreOutput shape', () => {
    const out = {
      ranked: [
        {
          subagentName: 'a',
          item: { title: 't', source: 's' },
          rationale: 'r',
          rawUrgency: 0.5,
          score: 0.5,
          breakdown: {
            weight: 1,
            correlationBoost: 0,
            runtimeArgsDelta: 0,
            ambientDelta: 0,
          },
        },
      ],
    };
    expect(() => ScoreOutputSchema.parse(out)).not.toThrow();
  });
});
