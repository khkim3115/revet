import type { EventName, Verdict } from '../types.js';
import type { Finding } from './matcher.js';

// Every constant below is pinned by docs/hook-contract.md, which records what
// the agent runtime was measured doing -- not what its documentation implies.
//
// The measurement that matters: on PreToolUse there is NO exit code that both
// lets the tool call proceed and shows the message to the agent. Exit 0 and
// exit 1 discard stderr in silence; exit 2 blocks. So `warn` cannot be an exit
// code at all. It is delivered as JSON on stdout instead, and the process
// exits 0.
const WARN_EXIT = 0;
const BLOCK_EXIT = 2;

const VENDOR_EVENT: Record<EventName, 'PreToolUse' | 'PostToolUse'> = {
  'pre-bash': 'PreToolUse',
  'pre-edit': 'PreToolUse',
  'post-edit': 'PostToolUse',
};

const RANK: Record<Verdict, number> = { pass: 0, warn: 1, block: 2 };

export interface Resolution { verdict: Verdict; exitCode: number; stderr: string }
export interface HookResponse extends Resolution { stdout: string }

export function resolve(findings: Finding[]): Resolution {
  if (findings.length === 0) return { verdict: 'pass', exitCode: 0, stderr: '' };

  const verdict = findings.reduce<Verdict>(
    (acc, f) => (RANK[f.rule.verdict] > RANK[acc] ? f.rule.verdict : acc), 'pass');

  const stderr = findings.map((f) => {
    const lines = [`[revet] ${f.rule.id}: ${f.rule.message}`];
    if (f.rule.why) lines.push(`  why: ${f.rule.why.trim()}`);
    if (f.rule.fix) lines.push(`  fix: ${f.rule.fix}`);
    return lines.join('\n');
  }).join('\n\n');

  return { verdict, exitCode: verdict === 'block' ? BLOCK_EXIT : WARN_EXIT, stderr };
}

/**
 * Turns findings into the exact bytes the hook process should emit.
 *
 * `warn` rides the `additionalContext` channel because it is the only measured
 * way to reach the agent without blocking the call. The payload deliberately
 * omits `permissionDecision`: emitting `"allow"` there would grant the call
 * outright, overriding whatever the user's own permission rules would have
 * decided. A guardrail must never widen permissions as a side effect of
 * warning about something.
 */
export function respond(findings: Finding[], event: EventName): HookResponse {
  const resolution = resolve(findings);
  if (resolution.verdict !== 'warn') return { ...resolution, stdout: '' };

  const payload = {
    hookSpecificOutput: {
      hookEventName: VENDOR_EVENT[event],
      additionalContext: resolution.stderr,
    },
  };
  return { ...resolution, stdout: `${JSON.stringify(payload)}\n` };
}
