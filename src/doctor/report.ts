import type { Dimension, DoctorFinding, ScoreResult } from './score.js';
import type { Diff, DiffLabel } from './baseline.js';

const BAR = (n: number) => '#'.repeat(Math.round(n / 10)).padEnd(10, '.');

// `surfaced` deliberately stops short of claiming the new findings were
// latent. Score and counts alone cannot tell a newly detected problem from a
// newly introduced one. What they can tell you is that the score fell because
// findings rose rather than because the scoring moved, and that is all this
// says. See docs/methodology.md.
const LABELS: Record<DiffLabel, string> = {
  improved: 'improved',
  surfaced: 'surfaced, not regressed -- the drop is new findings, not new scoring',
  regressed: 'REGRESSED',
  unchanged: 'unchanged',
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'] as const;

export function countBySeverity(findings: DoctorFinding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  return counts;
}

export function render(result: ScoreResult, diff?: Diff): string {
  const lines: string[] = ['', '  revet doctor', ''];

  for (const [dim, value] of Object.entries(result.dimensions) as [Dimension, number][]) {
    lines.push(`  ${dim.padEnd(16)}${BAR(value)}  ${String(value).padStart(3)}`);
  }

  const counts = countBySeverity(result.findings);
  const summary = SEVERITY_ORDER
    .filter((s) => counts[s])
    .map((s) => `${counts[s]} ${s}`)
    .join(' - ') || 'none';
  lines.push('', `  ${result.grade} / ${result.overall}        findings: ${summary}`);

  if (diff) {
    const sign = diff.scoreDelta >= 0 ? '+' : '';
    const fsign = diff.findingDelta >= 0 ? '+' : '';
    lines.push(
      `  vs baseline:  score ${sign}${diff.scoreDelta},  ` +
      `findings ${fsign}${diff.findingDelta}  (${LABELS[diff.label]})`);
  }

  lines.push('');
  // Most severe first, so the thing that matters is not buried under nits.
  const ordered = [...result.findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  for (const f of ordered) {
    lines.push(`  [${f.severity}] ${f.dimension}: ${f.message}`);
    lines.push(`      fix: ${f.fix}`);
  }
  lines.push('');
  return lines.join('\n');
}
