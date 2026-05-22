import { readFileSync, existsSync } from 'node:fs';
import type { ZodError } from 'zod';
import { SubagentsConfigSchema, WeightsConfigSchema } from './schema.js';
import type { SubagentsConfig, WeightsConfig } from './schema.js';
import { subagentsConfigPath, weightsConfigPath } from './paths.js';

export type ConfigError = { path: string; message: string };
export type LoadResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ConfigError[] };

const DEFAULT_TIMEOUT_MS = 120000;

function zodToErrors(err: ZodError, displayName: string): ConfigError[] {
  return err.issues.map((i) => ({
    path: `${displayName}.${i.path.join('.')}`,
    message: i.message,
  }));
}

export function loadSubagentsConfig(dir: string): LoadResult<SubagentsConfig> {
  const filepath = subagentsConfigPath(dir);
  const displayName = 'subagents.json';
  if (!existsSync(filepath)) {
    return { ok: false, errors: [{ path: displayName, message: `file not found at ${filepath}` }] };
  }
  let raw: string;
  try {
    raw = readFileSync(filepath, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, errors: [{ path: displayName, message: `read error: ${msg}` }] };
  }
  let parsed: ReturnType<typeof SubagentsConfigSchema.safeParse>;
  try {
    parsed = SubagentsConfigSchema.safeParse(JSON.parse(raw));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, errors: [{ path: displayName, message: `invalid JSON: ${msg}` }] };
  }
  if (!parsed.success) {
    return { ok: false, errors: zodToErrors(parsed.error, displayName) };
  }
  return {
    ok: true,
    value: {
      version: parsed.data.version,
      subagents: parsed.data.subagents.map((s) => {
        const enabled = s.enabled ?? true;
        const timeoutMs = s.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        return { ...s, enabled, timeoutMs };
      }),
    },
  };
}

export function loadWeightsConfig(dir: string): LoadResult<WeightsConfig> {
  const filepath = weightsConfigPath(dir);
  const displayName = 'weights.json';
  if (!existsSync(filepath)) {
    return { ok: false, errors: [{ path: displayName, message: `file not found at ${filepath}` }] };
  }
  let raw: string;
  try {
    raw = readFileSync(filepath, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, errors: [{ path: displayName, message: `read error: ${msg}` }] };
  }
  let parsed: ReturnType<typeof WeightsConfigSchema.safeParse>;
  try {
    parsed = WeightsConfigSchema.safeParse(JSON.parse(raw));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, errors: [{ path: displayName, message: `invalid JSON: ${msg}` }] };
  }
  if (!parsed.success) {
    return { ok: false, errors: zodToErrors(parsed.error, displayName) };
  }
  return { ok: true, value: parsed.data };
}
