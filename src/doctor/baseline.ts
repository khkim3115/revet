export interface Baseline { overall: number; findingCounts: Record<string, number> }
export type DiffLabel = 'improved' | 'surfaced' | 'regressed' | 'unchanged';
export interface Diff { scoreDelta: number; findingDelta: number; label: DiffLabel }

const total = (b: Baseline) =>
  Object.values(b.findingCounts ?? {}).reduce((a, n) => a + (Number(n) || 0), 0);

/**
 * The one rule this whole tool is arguing for.
 *
 * A second run commonly scores LOWER than the first, and almost always because
 * the first run had not yet looked hard enough -- latent problems became
 * visible, they did not appear. Calling that a regression trains operators to
 * stop running the tool, so a score drop that comes with MORE findings is
 * reported as `surfaced`, and a score rise is never reported as `improved`
 * while the finding count is going up.
 */
export function compare(prev: Baseline, now: Baseline): Diff {
  const scoreDelta = now.overall - prev.overall;
  const findingDelta = total(now) - total(prev);

  let label: DiffLabel;
  if (scoreDelta === 0 && findingDelta === 0) label = 'unchanged';
  else if (findingDelta > 0) label = 'surfaced';       // more findings: never "improved"
  else if (scoreDelta < 0) label = 'regressed';
  else label = 'improved';

  return { scoreDelta, findingDelta, label };
}
