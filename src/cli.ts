import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { adapt } from './hook/adapter.js';
import { match } from './hook/matcher.js';
import { respond } from './hook/verdict.js';
import { loadRules } from './packs/loader.js';
import { loadConfig } from './config.js';
import { scan } from './doctor/scan.js';
import { score } from './doctor/score.js';
import { compare, type Diff } from './doctor/baseline.js';
import { render, countBySeverity } from './doctor/report.js';
import type { EventName } from './types.js';

const EVENTS: EventName[] = ['pre-bash', 'pre-edit', 'post-edit'];

const USAGE = `revet - guardrails for AI coding agents on legacy codebases

  revet doctor [--json] [--baseline <file>]   score this repository's harness
  revet explain <rule-id>                     show why a rule exists
  revet hook <event>                          called by .claude/settings.json
                                              events: ${EVENTS.join(', ')}
`;

// Fail closed. docs/hook-contract.md records the measurement that makes this
// non-negotiable: a hook command that cannot even be resolved exits 127, and
// the agent runtime runs the tool anyway with is_error false. Nothing in the
// session shows that the gate was skipped. Exiting 2 on our own failures is
// the only way a broken revet is louder than a missing one.
function fail(msg: string): never {
  process.stderr.write(`[revet] ${msg}\n`);
  process.exit(2);
}

function readStdin(): string {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    fail('could not read hook payload from stdin');
  }
}

async function cmdHook(eventArg: string): Promise<void> {
  if (!EVENTS.includes(eventArg as EventName)) fail(`unknown hook event: ${eventArg}`);

  let raw: unknown;
  try {
    raw = JSON.parse(readStdin());
  } catch {
    fail('hook payload was not valid JSON');
  }

  const event = eventArg as EventName;
  const rules = loadRules(await loadConfig(process.cwd()));
  const { exitCode, stderr, stdout } = respond(match(adapt(event, raw), rules), event);

  // stdout carries the agent-visible channel and must stay parseable as JSON,
  // so nothing else is ever written there.
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(`${stderr}\n`);
  process.exit(exitCode);
}

function cmdDoctor(args: string[]): void {
  const result = score(scan(process.cwd()));
  const current = { overall: result.overall, findingCounts: countBySeverity(result.findings) };

  const bIdx = args.indexOf('--baseline');
  let diff: Diff | undefined;
  if (bIdx !== -1 && args[bIdx + 1]) {
    const file = args[bIdx + 1] as string;
    if (existsSync(file)) {
      try {
        diff = compare(JSON.parse(readFileSync(file, 'utf8')), current);
      } catch {
        process.stderr.write(`[revet] baseline at ${file} is unreadable; comparing nothing\n`);
      }
    }
    writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`);
  }

  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ ...result, diff }, null, 2)}\n`);
  } else {
    process.stdout.write(render(result, diff));
  }

  // A critical finding means at least one gate is not running at all, which is
  // a broken harness rather than an imperfect one. Exit non-zero so CI notices.
  process.exit(result.findings.some((f) => f.severity === 'critical') ? 1 : 0);
}

async function cmdExplain(ruleId: string): Promise<void> {
  const rule = loadRules(await loadConfig(process.cwd())).find((r) => r.id === ruleId);
  if (!rule) fail(`unknown rule: ${ruleId}`);
  process.stdout.write(
    `\n  ${rule.id}  [${rule.verdict}]\n\n  ${rule.message}\n\n` +
    (rule.why ? `  why:\n    ${rule.why.trim().split('\n').join('\n    ')}\n\n` : '') +
    (rule.fix ? `  fix:\n    ${rule.fix}\n\n` : ''));
  process.exit(0);
}

const [cmd, arg, ...rest] = process.argv.slice(2);
if (cmd === 'hook') void cmdHook(arg ?? '');
else if (cmd === 'doctor') cmdDoctor([arg, ...rest].filter(Boolean) as string[]);
else if (cmd === 'explain') void cmdExplain(arg ?? '');
else if (cmd === '--help' || cmd === '-h' || cmd === 'help') process.stdout.write(USAGE);
else fail(`unknown command: ${cmd ?? '(none)'}\n\n${USAGE}`);
