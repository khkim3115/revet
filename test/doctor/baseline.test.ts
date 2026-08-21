import { describe, it, expect } from 'vitest';
import { compare } from '../../src/doctor/baseline.js';

const b = (overall: number, total: number) => ({
  overall, findingCounts: { critical: 0, high: 0, medium: total, low: 0 },
});

describe('compare', () => {
  it('labels a score drop with MORE findings as "surfaced", not "regressed"', () => {
    const r = compare(b(86, 3), b(71, 10));
    expect(r.label).toBe('surfaced');
    expect(r.scoreDelta).toBe(-15);
    expect(r.findingDelta).toBe(7);
  });

  it('labels a score drop with FEWER findings as a real regression', () => {
    expect(compare(b(86, 10), b(71, 4)).label).toBe('regressed');
  });

  it('labels a score rise with fewer findings as improved', () => {
    expect(compare(b(71, 10), b(91, 2)).label).toBe('improved');
  });

  it('never reports improvement when findings increased', () => {
    expect(compare(b(71, 2), b(75, 9)).label).not.toBe('improved');
  });

  it('labels no change as unchanged', () => {
    expect(compare(b(80, 5), b(80, 5)).label).toBe('unchanged');
  });
});

// A baseline written by an older version, or by hand, must not be able to make
// the tool lie or crash. It is read from disk in the user's repository.
describe('compare tolerates untrusted baselines', () => {
  it('treats an absent severity bucket as zero rather than NaN', () => {
    const r = compare({ overall: 80, findingCounts: {} }, b(70, 3));
    expect(r.findingDelta).toBe(3);
    expect(Number.isNaN(r.scoreDelta)).toBe(false);
  });

  it('counts every severity bucket, not just one', () => {
    const prev = { overall: 90, findingCounts: { critical: 1, high: 1 } };
    const now = { overall: 90, findingCounts: { critical: 1, high: 1, low: 1 } };
    expect(compare(prev, now).findingDelta).toBe(1);
  });
});
