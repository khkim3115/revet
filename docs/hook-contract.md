# Measured hook contract

Everything below was **observed**, not inferred from documentation. The
verdict-to-exit-code mapping in `src/hook/verdict.ts` is derived from this file;
if the vendor contract changes, re-run the probes and update both together.

## How this was measured

Thirteen headless agent sessions, each with a probe hook that dumped its stdin
payload to a log, wrote a unique marker to stderr and stdout, and exited with a
code under test. Delivery was judged by two independent signals:

1. the `tool_result` content in `--output-format stream-json --include-hook-events`
2. whether the agent reproduced the unique marker verbatim in its own reply

| | |
|---|---|
| Agent runtime | Claude Code CLI 2.1.238 |
| Model | `claude-sonnet-5` |
| Host | Node 22.13.0, Windows 11 |
| Date | 2026-08-21 |
| Session flags | `-p --output-format stream-json --verbose --include-hook-events --permission-mode bypassPermissions --setting-sources project` |

Hooks fired normally under `bypassPermissions`, confirming that hook gates are
independent of the permission system rather than layered on top of it.

## stdin payload

Every event delivers a single JSON object on stdin. Keys common to all events:

`session_id` · `transcript_path` · `cwd` · `prompt_id` · `permission_mode` ·
`effort` · `hook_event_name` · `tool_name` · `tool_input` · `tool_use_id`

Event-specific shapes:

| revet event | vendor event | matcher | `tool_input` keys | extra |
|---|---|---|---|---|
| `pre-bash` | `PreToolUse` | `Bash` | `command`, `description` | — |
| `pre-edit` | `PreToolUse` | `Write` | `file_path`, `content` | — |
| `pre-edit` | `PreToolUse` | `Edit` | `file_path`, `old_string`, `new_string`, `replace_all` | — |
| `post-edit` | `PostToolUse` | `Write` | `file_path`, `content` | `tool_response`, `duration_ms` |
| `post-edit` | `PostToolUse` | `Edit` | `file_path`, `old_string`, `new_string`, `replace_all` | `tool_response`, `duration_ms` |

`tool_input.command` and `tool_input.file_path` are the only keys the adapter
depends on, so the adapter survives additive changes to the rest.

On `PostToolUse` the payload also carries `tool_response.structuredPatch`: a real
unified-diff hunk list with `+`/`-` prefixed lines. That is a strictly better
source for added-line matching than diffing `old_string` against `new_string`,
which cannot see an added line that duplicates an existing one. v0.1 does not
use it; recorded here so the improvement is not rediscovered later.

## Exit codes

| event | exit | tool runs? | does the agent read stderr? |
|---|---|---|---|
| `PreToolUse` | 0 | yes | **no** — silently discarded |
| `PreToolUse` | 1 | yes | **no** — reported as `outcome: error`, still discarded |
| `PreToolUse` | 2 | **no, blocked** | yes — arrives as an `is_error` tool result, and the call is recorded in `permission_denials` |
| `PostToolUse` | 0 | already ran | **no** |
| `PostToolUse` | 1 | already ran | **no** |
| `PostToolUse` | 2 | already ran | yes — appended to the tool result as a hook error |

**There is no exit code that lets a `PreToolUse` tool call proceed *and* shows
the message to the agent.** A warning implemented as a non-zero, non-blocking
exit code is discarded in silence. That failure mode is invisible from inside
the session, which is precisely what makes it dangerous.

## JSON on stdout

A hook may instead write a JSON object to stdout and exit 0.

| shape | tool runs? | agent reads it? | delivered as |
|---|---|---|---|
| `hookSpecificOutput.additionalContext` | **yes** | **yes** | `<event>:<tool> hook additional context: MSG` |
| `hookSpecificOutput.permissionDecision: "allow"` + `permissionDecisionReason` | yes | **no** | reason discarded |
| `hookSpecificOutput.permissionDecision: "deny"` + `permissionDecisionReason` | no, blocked | yes | reason becomes the entire tool result, with no wrapper |
| `decision: "block"` + `reason` (PostToolUse) | already ran | yes | `hook blocking error from command: "..."` |

`additionalContext` is the only channel that is both non-blocking and visible.
It is how `warn` is implemented.

Note that the object omits `permissionDecision` entirely. Emitting
`permissionDecision: "allow"` would *grant* the call, overriding whatever the
user's own `permissions` rules would have decided. A guardrail must never widen
permissions as a side effect of warning, so revet never emits that field.

## Fail-open is the default

A hook whose command cannot be resolved at all is not an error the session
surfaces:

```
command: "revet-does-not-exist hook pre-bash"
-> hook exit_code 127, stderr "command not found"
-> tool ran anyway, tool_result "HELLO_FROM_BASH", is_error false
-> agent reported: "No errors or extra markers."
```

Every gate passes, nothing is logged where the agent or the operator can see it,
and the harness looks healthy from the inside. This is why `revet hook` exits 2
on any internal failure rather than 0, and why `doctor` grades an unresolvable
runtime as CRITICAL instead of merely reducing a score.

## Auditability caveat

Feedback delivered to the agent through the hook channel — both the
`PostToolUse` exit-2 text and `additionalContext` — is injected into the model
request but is **not** written to the session transcript file. It can be
observed live via `--include-hook-events`, but a transcript recorded without
that flag will not show that a warning was ever delivered. Do not treat
transcript absence as evidence that a gate did not fire.

## Decided mapping

```
pass   -> exit 0, no output
warn   -> exit 0, stdout {"hookSpecificOutput":{"hookEventName":<vendor>,"additionalContext":MSG}}
          (MSG is also written to stderr for operator visibility; the agent
           does not see stderr on exit 0)
block  -> exit 2, MSG on stderr
```

`<vendor>` is `PreToolUse` for `pre-bash` and `pre-edit`, `PostToolUse` for
`post-edit`.

Rationale, per row:

- `warn` uses `additionalContext` because it is the only measured channel that
  is non-blocking and visible. Exit 1 was rejected: measured silent on both
  events.
- `block` uses exit 2 because it is measured blocking on `PreToolUse` and is the
  loudest available signal on `PostToolUse`, where nothing can be prevented
  because the tool has already run. A `block` on `post-edit` is therefore an
  after-the-fact correction demand, not a prevention.
