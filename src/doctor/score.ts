import type { Observations } from './scan.js';

export type Dimension = 'coverage' | 'enforcement' | 'resilience' | 'permissions' | 'context';
export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface DoctorFinding {
  severity: Severity;
  dimension: Dimension;
  message: string;
  fix: string;
}

export interface ScoreResult {
  dimensions: Record<Dimension, number>;
  overall: number;
  grade: string;
  findings: DoctorFinding[];
}

const WEIGHTS: Record<Dimension, number> = {
  coverage: 20, enforcement: 25, resilience: 25, permissions: 20, context: 10,
};
const EXPECTED_EVENTS = ['PreToolUse', 'PostToolUse', 'SessionStart', 'Stop'];
const MAX_CONTEXT_LINES = 200;

export function score(obs: Observations): ScoreResult {
  const findings: DoctorFinding[] = [];
  const dimensions = {} as Record<Dimension, number>;

  const wired = EXPECTED_EVENTS.filter((e) => obs.events.includes(e)).length;
  dimensions.coverage = Math.round((wired / EXPECTED_EVENTS.length) * 100);
  if (wired < EXPECTED_EVENTS.length) findings.push({
    severity: 'medium', dimension: 'coverage',
    message: `${EXPECTED_EVENTS.length - wired} lifecycle event(s) not wired.`,
    fix: 'Add the missing hooks to .claude/settings.json.',
  });

  dimensions.enforcement = obs.totalGates === 0
    ? 0 : Math.round((obs.blockingGates / obs.totalGates) * 100);
  if (dimensions.enforcement < 50) findings.push({
    severity: 'high', dimension: 'enforcement',
    message: 'Gates are warn-only. A harness that never blocks is theater.',
    fix: 'Promote at least the destructive-command gate to a blocking verdict.',
  });

  dimensions.resilience = obs.runtimeResolvable ? 100 : 20;
  if (obs.totalGates === 0) findings.push({
    severity: 'critical', dimension: 'resilience',
    message: 'No hook gates are configured -- nothing is being enforced.',
    fix: 'Wire PreToolUse and PostToolUse hooks in .claude/settings.json.',
  });
  else if (!obs.runtimeResolvable) findings.push({
    severity: 'critical', dimension: 'resilience',
    // Naming the command matters: the operator has to know which gate died,
    // and an unresolvable hook produces no other evidence anywhere.
    message: `Hook command does not resolve, so this gate silently passes: ${obs.unresolvableCommands.join(', ')}`,
    fix: 'Install the runtime locally and point settings.json at node_modules/.bin.',
  });

  const denyScore = Math.min(100, obs.denyRules.length * 25);
  const allowPenalty = obs.broadAllows.length * 30;
  dimensions.permissions = Math.max(0, denyScore - allowPenalty);
  if (obs.broadAllows.length) findings.push({
    severity: 'high', dimension: 'permissions',
    message: `Overly broad allow rule(s): ${obs.broadAllows.join(', ')}`,
    fix: 'Narrow the matcher to the specific commands you actually need.',
  });

  const oversized = Object.entries(obs.contextFileLines).filter(([, n]) => n > MAX_CONTEXT_LINES);
  dimensions.context = oversized.length ? 40 : 100;
  for (const [name, n] of oversized) findings.push({
    severity: 'medium', dimension: 'context',
    message: `${name} is ${n} lines (limit ${MAX_CONTEXT_LINES}).`,
    fix: 'Move detail into @docs/*.md and keep the entry file an index.',
  });

  const overall = Math.round(
    (Object.keys(WEIGHTS) as Dimension[])
      .reduce((sum, d) => sum + dimensions[d] * WEIGHTS[d], 0) / 100);

  const grade = overall >= 90 ? 'A' : overall >= 80 ? 'B' : overall >= 65 ? 'C' : overall >= 50 ? 'D' : 'F';
  return { dimensions, overall, grade, findings };
}
