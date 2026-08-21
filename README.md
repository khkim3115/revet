# revet

**Guardrails for AI coding agents on legacy codebases.**

Two commands. `revet hook` gates what an agent is about to do, from declarative
YAML rules. `revet doctor` reads your `.claude/` directory and tells you whether
the gates you think you have are actually running.

```
$ revet doctor

  revet doctor

  coverage        ########..   75
  enforcement     ###.......   33
  resilience      ##........   20
  permissions     ..........    0
  context         ####......   40

  F / 32        findings: 1 critical - 2 high - 2 medium

  [critical] resilience: Hook command is not resolvable -- every gate silently passes.
      fix: Install the runtime locally and point settings.json at node_modules/.bin.
  [high] enforcement: Gates are warn-only. A harness that never blocks is theater.
      fix: Promote at least the destructive-command gate to a blocking verdict.
  [high] permissions: Overly broad allow rule(s): Bash(python *)
      fix: Narrow the matcher to the specific commands you actually need.
  [medium] coverage: 1 lifecycle event(s) not wired.
      fix: Add the missing hooks to .claude/settings.json.
  [medium] context: CLAUDE.md is 222 lines (limit 200).
      fix: Move detail into @docs/*.md and keep the entry file an index.
```

That is `examples/bad-harness` in this repository. Run it yourself.

revet gates its own repository with its own `core` pack, and scores `A / 90`
against its own scanner. The single finding it reports on itself is that
`SessionStart` and `Stop` are unwired, which is accurate: briefing hooks are a
v0.2 feature.

## Why this exists

Agent hooks get written per project, as shell scripts, from scratch. On a legacy
codebase there are a lot of them -- forbidden syntax, encoding, destructive
commands, layering -- so they get copied between repositories and then drift
apart.

The worse problem is that **a hook that has stopped working looks exactly like a
hook that is working.** This is measured, not asserted. Point a hook at a command
that does not exist:

```
command: "revet-does-not-exist hook pre-bash"

-> hook exits 127, "command not found"
-> the tool call runs anyway, tool_result is_error: false
-> the agent reports: "No errors or extra markers."
```

Every gate passes. Nothing surfaces. From inside the session the harness looks
healthy, and it will keep looking healthy for as long as you leave it that way.
Full measurements are in [docs/hook-contract.md](docs/hook-contract.md).

Most published harness repositories assume a greenfield TypeScript project.
Java 6, PHP 5, mixed encodings, no tests, no CI is an empty space.

## The three-layer model

| layer | mechanism | what it can do |
|---|---|---|
| **declare** | `CLAUDE.md` / `AGENTS.md` | states intent. The agent may or may not follow it. |
| **guide** | subagents, skills | shapes the approach before work starts. |
| **enforce** | hooks | the only layer that can actually stop something. |

Most setups have the first layer, some have the second, and almost none can
prove the third is running. `revet doctor` scores all three, weighted toward the
one that can fail silently.

## Install

```bash
npm install --save-dev revet
```

Then in `.claude/settings.json` -- no hook scripts in your repository, the
settings file calls the runtime directly:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "node_modules/.bin/revet hook pre-bash" }] },
      { "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "node_modules/.bin/revet hook pre-edit" }] }
    ],
    "PostToolUse": [
      { "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "node_modules/.bin/revet hook post-edit" }] }
    ]
  }
}
```

Point it at `node_modules/.bin`, not `npx`. `npx` re-resolves the package on
every single Bash call.

Then check it:

```bash
npx revet doctor
```

## Honest scoring, and why your score often DROPS on the second run

Most audit tools inflate. This one is built to do the opposite, because a score
that only ever goes up is a score nobody can act on.

A second run frequently scores *lower* than the first. Usually nothing got
worse: the first run had not looked hard enough yet, and problems that were
already there became visible. Reporting that as a regression teaches people to
stop running the tool.

So `revet doctor` never reports a bare number:

- score, **plus** finding counts by severity, **plus** the delta against a baseline
- a score rise is never labelled `improved` while the finding count is rising
- `--baseline` makes measure-fix-remeasure a first-class loop

```bash
revet doctor --baseline .revet/baseline.json
```

```
  B / 84        findings: 1 high - 1 medium
  vs baseline:  score -6,  findings +1  (surfaced, not regressed -- the drop is new findings, not new scoring)
```

`surfaced` stops deliberately short of claiming the new findings were latent.
Score and counts cannot distinguish a newly *detected* problem from a newly
*introduced* one. What they can establish is that the score fell because
findings rose rather than because the scoring moved, and that is all the label
claims. The findings themselves tell you which kind it was.

## Writing rules

Rules are data, not code, so they can be read and reviewed by people who will
never open the source:

```yaml
pack: core
version: 1
rules:
  - id: core/destructive-rm
    event: pre-bash
    match:
      command: '\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\b'
    verdict: block
    message: "Recursive force delete blocked."
    why: >
      settings.json permissions.deny cannot see runtime-composed commands
      (pipes, subshells, variable expansion, globbing). This is the second line.
    fix: "If intentional, run it outside the agent session."
```

`why` is the field that matters. With it, this is a tool that teaches; without
it, it is a linter that nags. `revet explain core/destructive-rm` prints it.

| event | matcher keys |
|---|---|
| `pre-bash` | `command` (regex) |
| `pre-edit`, `post-edit` | `path` (glob), `content` (regex), `added` (regex, **added lines only**) |

`added` is the important one. On a legacy codebase, matching `content` flags
every pre-existing violation in the file and drowns the signal. Gate what is
being added, not what is already there.

Select packs and override verdicts in `.claude/revet.yaml`:

```yaml
packs: [core, legacy-php5]
overrides:
  core/destructive-rm: warn        # downgrade
  legacy-php5/short-ternary: off   # disable
custom:
  - id: local/no-todo-in-src
    event: post-edit
    match: { path: "src/**", added: "TODO" }
    verdict: warn
    message: "New TODO added under src/."
```

Overrides are a first-class feature, not an escape hatch. Every legacy project
has a different local standard, and if downgrading one rule is hard, people turn
the whole tool off instead.

Bundled packs: `core` (destructive commands, history rewrites, path string
comparison) and `legacy-php5` (PHP 5 syntax limits).

One honest limitation: `command` patterns match the command line as a whole,
including text inside quoted arguments, so a command that merely *mentions* a
recursive delete is blocked alongside one that performs it. That is the
deliberate trade -- a matcher narrow enough never to false-positive is also
narrow enough to miss a delete assembled from variables at runtime -- and it is
why per-rule `overrides` are a first-class feature rather than an afterthought.

## Design notes

**The `warn` verdict is not an exit code.** On `PreToolUse` there is no exit
code that both lets the call through and shows the message to the agent: exit 0
and exit 1 discard stderr silently, exit 2 blocks. `warn` therefore rides the
JSON `additionalContext` channel on stdout, and never emits
`permissionDecision` -- emitting `"allow"` there would *grant* the call and
override the user's own permission rules. A guardrail must not widen
permissions as a side effect of warning about something. All of this is
measured; see [docs/hook-contract.md](docs/hook-contract.md).

**Fail closed.** Any internal failure -- unparseable payload, unknown event,
missing rule pack -- exits 2 rather than 0. A broken revet has to be louder
than an absent one, because an absent one is silent.

**Every gate is audited, not just revet's own.** `doctor` resolves the actual
executable behind each hook command, and follows `node`, `python`, `sh` and
friends through to the script they were told to run -- resolving `node` proves
nothing when the script beside it has been deleted. A hook pointing at a shell
script that no longer exists dies exactly the way revet would, and it is far
likelier to be the one nobody notices.

**Never compare paths as strings.** Separator and case differences make string
path comparison silently wrong on some platforms, and a gate built on it can
look active while never firing once. It is an internal invariant here and a rule
in the `core` pack.

**~5ms of overhead.** `pre-bash` runs in front of every Bash call the agent
makes. Rule packs are precompiled to JSON at build time, the YAML parser is
never loaded unless a `revet.yaml` actually exists, and the bundle is a single
dependency-free CommonJS file. Measured overhead above a bare `node` start is
about 5ms, enforced by `test/perf.bench.ts` in CI.

**No network, no telemetry, zero runtime dependencies.** `doctor` reads other
people's `.claude/` directories, so it is offline, read-only, and never executes
a hook.

## Roadmap

- `revet init` scaffolding
- briefing hooks (`SessionStart`, `Stop`) -- context injection rather than gating
- more packs: `legacy-java6`, `vue-migration`
- a `js:` escape hatch for rules regex cannot express
- a Go rewrite if cold start ever needs to go below the Node floor

## Documentation

- [docs/methodology.md](docs/methodology.md) -- the three-layer model and the failure modes
- [docs/hook-contract.md](docs/hook-contract.md) -- measured hook behavior
- [README.ko.md](README.ko.md) -- Korean

## License

MIT
