import { describe, expect, it } from 'vitest';
import { resolveCheckTargets } from '@/lib/checkDomain';

describe('resolveCheckTargets', () => {
  it('apex mode uses registrable domain for query host', () => {
    const r = resolveCheckTargets('www.mail.example.com', 'apex');
    expect(r.tab).toBe('www.mail.example.com');
    expect(r.queryHost).toBe(r.orgDomain);
    expect(r.orgDomain).toBe('example.com');
  });

  it('exact mode uses full tab hostname', () => {
    const r = resolveCheckTargets('www.mail.example.com', 'exact');
    expect(r.queryHost).toBe('www.mail.example.com');
    expect(r.orgDomain).toBe('example.com');
  });

  it('apex strips www on simple host', () => {
    const r = resolveCheckTargets('www.EXAMPLE.co.uk', 'apex');
    expect(r.queryHost).toBe('example.co.uk');
  });
});
