import { describe, it, expect } from 'vitest';
import { score } from '../../src/lib/scoring.js';
import type { ScoreInput, WeightsConfig, SubagentReturn } from '../../src/lib/schema.js';

function defaultWeights(overrides: Partial<WeightsConfig> = {}): WeightsConfig {
  return {
    version: 1,
    weights: {},
    observationDeltas: { correlationBoost: 0.1, runtimeArgsBoost: 0.2, ambientPenalty: -0.15 },
    condensation: { historyLineThreshold: 200 },
    ...overrides,
  };
}

function makeReturn(name: string, urgency: number, statusOverride?: SubagentReturn['status']): SubagentReturn {
  return {
    name,
    item: { title: `${name}-item`, source: 'test' },
    urgency,
    rationale: `${name} rationale`,
    status: statusOverride ?? 'ok',
  };
}

describe('score()', () => {
  it('identity: weights all 1, no observations -> score equals rawUrgency', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.5), makeReturn('b', 0.7)],
      weights: defaultWeights({ weights: { a: 1, b: 1 } }),
      observations: { correlations: [], runtimeArgsRelevance: {}, ambientPenalty: 0 },
    };
    const out = score(input);
    expect(out.ranked).toHaveLength(2);
    expect(out.ranked[0]?.subagentName).toBe('b');
    expect(out.ranked[0]?.score).toBeCloseTo(0.7);
    expect(out.ranked[1]?.subagentName).toBe('a');
    expect(out.ranked[1]?.score).toBeCloseTo(0.5);
  });

  it('scales by weight', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.5)],
      weights: defaultWeights({ weights: { a: 1.5 } }),
      observations: { correlations: [], runtimeArgsRelevance: {}, ambientPenalty: 0 },
    };
    expect(score(input).ranked[0]?.score).toBeCloseTo(0.75);
  });

  it('zero weight makes score zero before clamping', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 1)],
      weights: defaultWeights({ weights: { a: 0 } }),
      observations: { correlations: [], runtimeArgsRelevance: {}, ambientPenalty: 0 },
    };
    expect(score(input).ranked[0]?.score).toBeCloseTo(0);
  });

  it('missing weight defaults to 1.0', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.4)],
      weights: defaultWeights({ weights: {} }),
      observations: { correlations: [], runtimeArgsRelevance: {}, ambientPenalty: 0 },
    };
    expect(score(input).ranked[0]?.score).toBeCloseTo(0.4);
  });

  it('applies correlation boost only to listed subagents', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.5), makeReturn('b', 0.5), makeReturn('c', 0.5)],
      weights: defaultWeights({ weights: { a: 1, b: 1, c: 1 } }),
      observations: {
        correlations: [{ subagentNames: ['a', 'b'], reason: 'same PR' }],
        runtimeArgsRelevance: {},
        ambientPenalty: 0,
      },
    };
    const out = score(input);
    const byName = Object.fromEntries(out.ranked.map((r) => [r.subagentName, r.score]));
    expect(byName.a).toBeCloseTo(0.6);
    expect(byName.b).toBeCloseTo(0.6);
    expect(byName.c).toBeCloseTo(0.5);
  });

  it('correlation boost only counts once even if subagent in multiple correlations', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.5)],
      weights: defaultWeights({ weights: { a: 1 } }),
      observations: {
        correlations: [
          { subagentNames: ['a', 'b'], reason: 'r1' },
          { subagentNames: ['a', 'c'], reason: 'r2' },
        ],
        runtimeArgsRelevance: {},
        ambientPenalty: 0,
      },
    };
    expect(score(input).ranked[0]?.score).toBeCloseTo(0.6);
  });

  it('runtime args delta: +1 relevance applies full +runtimeArgsBoost', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.5)],
      weights: defaultWeights({ weights: { a: 1 } }),
      observations: {
        correlations: [],
        runtimeArgsRelevance: { a: 1 },
        ambientPenalty: 0,
      },
    };
    expect(score(input).ranked[0]?.score).toBeCloseTo(0.7);
  });

  it('runtime args delta: -1 relevance applies -runtimeArgsBoost', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.5)],
      weights: defaultWeights({ weights: { a: 1 } }),
      observations: {
        correlations: [],
        runtimeArgsRelevance: { a: -1 },
        ambientPenalty: 0,
      },
    };
    expect(score(input).ranked[0]?.score).toBeCloseTo(0.3);
  });

  it('ambient penalty applies when observations.ambientPenalty is non-zero', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.5)],
      weights: defaultWeights({ weights: { a: 1 } }),
      observations: {
        correlations: [],
        runtimeArgsRelevance: {},
        ambientPenalty: -1,
      },
    };
    expect(score(input).ranked[0]?.score).toBeCloseTo(0.35);
  });

  it('clamps to [0, 1]', () => {
    const high: ScoreInput = {
      subagentReturns: [makeReturn('a', 1)],
      weights: defaultWeights({ weights: { a: 2 } }),
      observations: {
        correlations: [{ subagentNames: ['a'], reason: 'r' }],
        runtimeArgsRelevance: { a: 1 },
        ambientPenalty: 0,
      },
    };
    expect(score(high).ranked[0]?.score).toBe(1);

    const low: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.05)],
      weights: defaultWeights({ weights: { a: 1 } }),
      observations: {
        correlations: [],
        runtimeArgsRelevance: { a: -1 },
        ambientPenalty: -1,
      },
    };
    expect(score(low).ranked[0]?.score).toBe(0);
  });

  it('ties break by subagent name ascending', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('b', 0.5), makeReturn('a', 0.5)],
      weights: defaultWeights({ weights: { a: 1, b: 1 } }),
      observations: { correlations: [], runtimeArgsRelevance: {}, ambientPenalty: 0 },
    };
    const out = score(input);
    expect(out.ranked[0]?.subagentName).toBe('a');
    expect(out.ranked[1]?.subagentName).toBe('b');
  });

  it('filters out status != ok', () => {
    const input: ScoreInput = {
      subagentReturns: [
        makeReturn('a', 0.5),
        makeReturn('b', 0.5, 'timeout'),
        makeReturn('c', 0.5, 'invalid'),
        makeReturn('d', 0.5, 'unavailable'),
      ],
      weights: defaultWeights({ weights: { a: 1, b: 1, c: 1, d: 1 } }),
      observations: { correlations: [], runtimeArgsRelevance: {}, ambientPenalty: 0 },
    };
    const out = score(input);
    expect(out.ranked).toHaveLength(1);
    expect(out.ranked[0]?.subagentName).toBe('a');
  });

  it('filters out urgency == 0', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.5), makeReturn('b', 0)],
      weights: defaultWeights({ weights: { a: 1, b: 1 } }),
      observations: { correlations: [], runtimeArgsRelevance: {}, ambientPenalty: 0 },
    };
    const out = score(input);
    expect(out.ranked).toHaveLength(1);
    expect(out.ranked[0]?.subagentName).toBe('a');
  });

  it('filters out items with null item field', () => {
    const noItem: SubagentReturn = {
      name: 'x',
      item: null,
      urgency: 0.5,
      rationale: 'r',
      status: 'ok',
    };
    const input: ScoreInput = {
      subagentReturns: [noItem],
      weights: defaultWeights({ weights: { x: 1 } }),
      observations: { correlations: [], runtimeArgsRelevance: {}, ambientPenalty: 0 },
    };
    expect(score(input).ranked).toHaveLength(0);
  });

  it('breakdown reflects each contribution', () => {
    const input: ScoreInput = {
      subagentReturns: [makeReturn('a', 0.5)],
      weights: defaultWeights({ weights: { a: 1.2 } }),
      observations: {
        correlations: [{ subagentNames: ['a'], reason: 'r' }],
        runtimeArgsRelevance: { a: 0.5 },
        ambientPenalty: -0.5,
      },
    };
    const out = score(input).ranked[0];
    expect(out?.breakdown.weight).toBeCloseTo(1.2);
    expect(out?.breakdown.correlationBoost).toBeCloseTo(0.1);
    expect(out?.breakdown.runtimeArgsDelta).toBeCloseTo(0.1);
    expect(out?.breakdown.ambientDelta).toBeCloseTo(-0.075);
  });
});
