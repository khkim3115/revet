# Methodology

How to think about an agent harness, and the failure modes it is built against.
This document is deliberately general: every claim here should hold for any
codebase, and nothing in it is derived from a specific one.

## 1. Three layers, one of which can actually stop something

| layer | mechanism | strength | failure mode |
|---|---|---|---|
| **declare** | `CLAUDE.md`, `AGENTS.md` | cheap, readable, sets intent | advisory. An agent under pressure to finish will route around it. |
| **guide** | subagents, skills, prompts | shapes the approach before work starts | still advisory, and much harder to audit. |
| **enforce** | hooks | the only layer that can refuse | invisible when broken. |

The layers are not alternatives. Declaration explains *why*, guidance shapes
*how*, enforcement decides *whether*. A harness with only the first two has no
floor; a harness with only the third teaches nobody anything and gets disabled.

The asymmetry that matters: the first two layers fail loudly -- you can read the
file and see it is wrong. The third fails silently.

## 2. The event lifecycle

Hook events split into two kinds, and merging them into one abstraction makes
both awkward:

| kind | events | question it answers | output |
|---|---|---|---|
| **gates** | `PreToolUse`, `PostToolUse` | should this be allowed? | a verdict |
| **briefing** | `SessionStart`, `Stop` | what should the agent know? | text into context |

revet v0.1 implements gates only.

Within gates, timing changes what is possible:

- **`PreToolUse`** runs before the call. It is the only place anything can be
  prevented.
- **`PostToolUse`** runs after. Nothing can be prevented; the file is already
  written. All it can do is demand a correction on the next turn.

A `block` on a post event is therefore not prevention. It is an after-the-fact
correction demand, and it should be worded as one.

## 3. The verdict contract

| verdict | intent | mechanism |
|---|---|---|
| `pass` | nothing to say | exit 0, silence |
| `warn` | do not undo it, but make sure the agent reads this | JSON `additionalContext` on stdout, exit 0 |
| `block` | refuse the call | exit 2, message on stderr |

The `warn` row is the one that is easy to get wrong, and getting it wrong is
invisible. The intuitive implementation -- exit with some non-zero code that is
not the blocking one -- does not work: on `PreToolUse`, exit 1 lets the call
through and discards the message. The warning is never delivered, no error is
reported, and the harness has quietly become decorative.

The measurements behind that are in [hook-contract.md](hook-contract.md). The
general lesson is more durable than the specific exit codes: **a feedback
channel you have not observed end-to-end is a channel you should assume is not
connected.**

## 4. Failure modes

These are stated generally on purpose. Each is a shape, not an incident.

### 4.1 The silent no-op

A gate that cannot run at all is indistinguishable, from inside a session, from
a gate that runs and approves. Unresolvable command, missing runtime, wrong
working directory, a typo in a matcher -- all produce the same observable
result, which is nothing.

*Countermeasure:* fail closed, and audit statically from outside the session.
Checking that a hook command *exists* is not the same as checking that it
*succeeds*, and neither is the same as checking that its verdict was *delivered*.

Two details decide whether such an audit is worth anything. Audit **every**
gate, not only the ones belonging to the tool doing the auditing -- the gate
that dies unnoticed is usually somebody's one-off script, not the vendored one.
And resolve the command properly: an interpreter is always installed, so
`node gate.mjs` resolves perfectly while `gate.mjs` no longer exists. Follow
the interpreter through to its script, or the check passes on exactly the
repositories it was written to catch.

### 4.2 Path-normalization asymmetry

A gate matches paths one way; the runtime supplies them another -- different
separator, different case, absolute where the rule assumed relative. The gate
never fires. It has full coverage on paper and zero in practice, and because
"no findings" is the expected output of a healthy gate, nothing looks wrong.

*Countermeasure:* never compare paths as strings. Normalize through a path
library first. Then test the gate with a path in the *other* convention, so a
regression shows up as a failing test rather than as silence.

### 4.3 Enforcement theater

Every gate is set to warn. The dashboard is green, the hooks all fire, and
nothing has ever been stopped. This is often a deliberate early choice -- start
with warnings, promote later -- that simply never got promoted.

*Countermeasure:* score the *ratio* of blocking gates to total gates, not the
count of gates. A harness that has never refused anything should not be able to
score well.

### 4.4 Score inflation and the second-run drop

An audit tool that reports a single number will be tuned, consciously or not,
until the number goes up. Then the number stops meaning anything.

The specific trap: run 2 scores lower than run 1, and it gets reported as a
regression. Usually nothing regressed -- the first run had not looked hard
enough, and existing problems became visible. Labelling that a regression
teaches operators to stop re-running the tool, which is the opposite of what an
audit tool is for.

*Countermeasure:* never report a score alone. Always report score, plus finding
counts by severity, plus the delta against a stored baseline. Weight the
dimensions so that a rise in findings cannot coincide with a rise in score.

A caveat worth stating plainly, because the alternative is the same inflation in
a new costume: score and counts **cannot** distinguish a newly detected problem
from a newly introduced one. `surfaced` means the score fell because findings
rose rather than because the scoring moved. Which kind of finding it was is a
question only the findings themselves answer.

### 4.5 Context sprawl

The entry file grows one reasonable paragraph at a time until it is long enough
that it is skimmed rather than read. The rules that matter now compete for
attention with rules that mattered once.

*Countermeasure:* a hard line limit on the entry file, with detail moved into
linked documents. The limit is arbitrary; having one is not.

### 4.6 Over-broad permissions

One wildcard allow rule silently re-permits most of what the deny list was
written to prevent. `Bash(python *)` runs anything.

*Countermeasure:* score allow breadth against deny coverage, and treat a broad
allow as an active penalty rather than a missing bonus.

## 5. Rules as data

Rules are YAML, not code, and the reason is social rather than technical. A rule
written as data can be read, reviewed, and contributed by somebody who will
never open the implementation. A catalogue of failure modes and a set of
executable rules become the same artifact.

Each rule carries `why` alongside `message` and `fix`. Without `why`, a blocked
call teaches nothing and the agent -- or the person reading the log -- learns
only that something was forbidden. With it, the block is an explanation.

The cost is that regular expressions cannot express everything. That is accepted
for v0.1. An escape hatch is a v2 question, and it should stay closed for as
long as possible, because the moment rules become code they stop being reviewable
by the people the format exists for.

## 6. Overrides are not an escape hatch

Every legacy project has a different local standard, and some of them are
correct. A short open tag can be the house convention. A pattern the pack calls
dangerous can be the codebase's oldest working idiom.

If downgrading or disabling a single rule is difficult, people do not carefully
disable that rule -- they turn the entire tool off. Per-rule `warn` / `off`
overrides are therefore a first-class feature, and the fact that a project has
overridden a rule is normal rather than a finding.
