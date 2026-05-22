import type { ScoreInput, ScoreOutput, ScoreOutputEntry, SubagentReturn } from './schema.js';

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function isScorable(r: SubagentReturn): boolean {
  return r.status === 'ok' && r.urgency > 0 && r.item !== null;
}

export function score(input: ScoreInput): ScoreOutput {
  const { subagentReturns, weights, observations } = input;
  const correlatedNames = new Set<string>();
  for (const c of observations.correlations) {
    for (const n of c.subagentNames) correlatedNames.add(n);
  }

  const entries: ScoreOutputEntry[] = subagentReturns
    .filter(isScorable)
    .map((r) => {
      const weight = weights.weights[r.name] ?? 1;
      const correlationBoost = correlatedNames.has(r.name)
        ? weights.observationDeltas.correlationBoost
        : 0;
      const relevance = observations.runtimeArgsRelevance[r.name] ?? 0;
      const runtimeArgsDelta = relevance * weights.observationDeltas.runtimeArgsBoost;
      const ambientDelta = observations.ambientPenalty * Math.abs(weights.observationDeltas.ambientPenalty);
      const composite =
        r.urgency * weight + correlationBoost + runtimeArgsDelta + ambientDelta;
      return {
        subagentName: r.name,
        item: r.item as NonNullable<typeof r.item>,
        rationale: r.rationale,
        rawUrgency: r.urgency,
        score: clamp01(composite),
        breakdown: { weight, correlationBoost, runtimeArgsDelta, ambientDelta },
      };
    });

  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.subagentName.localeCompare(b.subagentName);
  });

  return { ranked: entries };
}
