import { describe, it, expect } from 'vitest';
import { safeParseJson } from '../../src/lib/json.js';

type Foo = { a: number };

describe('safeParseJson', () => {
  it('parses valid JSON', () => {
    const r = safeParseJson<Foo>('{"a":1}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.a).toBe(1);
  });

  it('returns error for malformed JSON', () => {
    const r = safeParseJson<Foo>('{ bad');
    expect(r.ok).toBe(false);
  });
});
