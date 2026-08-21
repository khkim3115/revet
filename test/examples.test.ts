import { describe, it, expect } from 'vitest';
import { scan } from '../src/doctor/scan.js';
import { score } from '../src/doctor/score.js';

describe('examples/bad-harness', () => {
  it('scores D or F with at least one critical finding', () => {
    const r = score(scan('examples/bad-harness'));
    expect(['D', 'F']).toContain(r.grade);
    expect(r.findings.some((f) => f.severity === 'critical')).toBe(true);
  });

  // The fixture exists to demonstrate each failure mode, so it should trip all
  // of them. If a dimension quietly stops being demonstrated, the README
  // screenshot stops matching the tool.
  it('demonstrates a failure in every dimension the tool scores', () => {
    const r = score(scan('examples/bad-harness'));
    const shown = new Set(r.findings.map((f) => f.dimension));
    for (const dim of ['coverage', 'enforcement', 'resilience', 'permissions', 'context']) {
      expect(shown.has(dim as never), `no finding for ${dim}`).toBe(true);
    }
  });
});
