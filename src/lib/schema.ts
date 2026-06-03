import { z } from 'zod';

export const CanarySchema = z.object({
  cmd: z.array(z.string().min(1)).min(1),
  timeoutMs: z.number().int().positive().optional(),
});
export type Canary = z.infer<typeof CanarySchema>;

export const SubagentSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  prompt: z.string().min(1),
  dataSources: z.array(z.string()),
  enabled: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional(),
  canary: CanarySchema.optional(),
});
export type Subagent = z.infer<typeof SubagentSchema>;

export const SubagentsConfigSchema = z.object({
  version: z.literal(1),
  subagents: z.array(SubagentSchema),
});
export type SubagentsConfig = z.infer<typeof SubagentsConfigSchema>;

export const WeightsConfigSchema = z.object({
  version: z.literal(1),
  weights: z.record(z.string(), z.number()),
  observationDeltas: z.object({
    correlationBoost: z.number(),
    runtimeArgsBoost: z.number(),
    ambientPenalty: z.number(),
  }),
  condensation: z.object({
    historyLineThreshold: z.number().int().min(1),
    lastReviewed: z.string().optional(),
  }),
});
export type WeightsConfig = z.infer<typeof WeightsConfigSchema>;

export const SubagentStatusSchema = z.enum(['ok', 'timeout', 'invalid', 'unavailable']);
export type SubagentStatus = z.infer<typeof SubagentStatusSchema>;

export const SubagentItemSchema = z.object({
  title: z.string().min(1),
  source: z.string().min(1),
  ref: z.string().optional(),
});
export type SubagentItem = z.infer<typeof SubagentItemSchema>;

export const SubagentReturnSchema = z.object({
  name: z.string().min(1),
  item: SubagentItemSchema.nullable(),
  urgency: z.number().min(0).max(1),
  rationale: z.string().min(1),
  status: SubagentStatusSchema,
});
export type SubagentReturn = z.infer<typeof SubagentReturnSchema>;

export const FinalRankingEntrySchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  score: z.number(),
  rank: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});
export type FinalRankingEntry = z.infer<typeof FinalRankingEntrySchema>;

export const UserPickSchema = z
  .object({
    rank: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
    note: z.string().optional(),
  })
  .nullable();
export type UserPick = z.infer<typeof UserPickSchema>;

export const HistoryRowSchema = z.object({
  timestamp: z.string(),
  runtimeArgs: z.string().nullable(),
  ambient: z.object({
    dayOfWeek: z.string(),
    localHour: z.number().int().min(0).max(23),
  }),
  subagentReturns: z.array(SubagentReturnSchema),
  finalRanking: z.array(FinalRankingEntrySchema),
  userPick: UserPickSchema,
});
export type HistoryRow = z.infer<typeof HistoryRowSchema>;

export const ScoreInputSchema = z.object({
  subagentReturns: z.array(SubagentReturnSchema),
  weights: WeightsConfigSchema,
  observations: z.object({
    correlations: z.array(
      z.object({
        subagentNames: z.array(z.string()),
        reason: z.string(),
      }),
    ),
    runtimeArgsRelevance: z.record(z.string(), z.number().min(-1).max(1)),
    ambientPenalty: z.number().min(-1).max(1),
  }),
});
export type ScoreInput = z.infer<typeof ScoreInputSchema>;

export const ScoreOutputEntrySchema = z.object({
  subagentName: z.string(),
  item: SubagentItemSchema,
  rationale: z.string(),
  rawUrgency: z.number(),
  score: z.number(),
  breakdown: z.object({
    weight: z.number(),
    correlationBoost: z.number(),
    runtimeArgsDelta: z.number(),
    ambientDelta: z.number(),
  }),
});
export type ScoreOutputEntry = z.infer<typeof ScoreOutputEntrySchema>;

export const ScoreOutputSchema = z.object({
  ranked: z.array(ScoreOutputEntrySchema),
});
export type ScoreOutput = z.infer<typeof ScoreOutputSchema>;
