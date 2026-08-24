# revet

**레거시 코드베이스에서 AI 코딩 에이전트를 안전하게 굴리기 위한 가드레일.**

> 영문 정본은 [README.md](README.md) 이다. 이 문서는 미러이며, 내용이 갈리면 영문을 따른다.

명령은 둘이다. `revet hook` 은 선언적 YAML 규칙으로 에이전트가 하려는 일을 판정한다.
`revet doctor` 는 `.claude/` 를 읽고 **당신이 있다고 믿는 게이트가 실제로 돌고 있는지**
알려준다.

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
```

이 레포의 `examples/bad-harness` 를 그대로 돌린 결과다.

revet 은 자기 자신의 `core` 팩으로 자기 레포를 게이팅하고, 자기 스캐너로 `A / 90` 을 받는다.
스스로에게 남기는 유일한 finding 은 «`SessionStart`·`Stop` 이 배선되지 않았다» 이고,
이건 사실이다 — briefing 훅은 v0.2 기능이다.

## 왜 만들었나

에이전트 훅은 프로젝트마다 셸 스크립트로 새로 쓰인다. 레거시 코드베이스는 그런 규칙이
많아서 — 금지 문법, 인코딩, 파괴 명령, 계층 위반 — 레포 사이로 복사되고 곧 서로 드리프트한다.

더 나쁜 문제는 이것이다. **작동을 멈춘 훅은 잘 작동하는 훅과 겉모습이 완전히 같다.**
이건 주장이 아니라 실측이다. 존재하지 않는 명령을 훅으로 걸어보면:

```
command: "revet-does-not-exist hook pre-bash"

-> 훅이 exit 127 로 죽음 ("command not found")
-> 그런데 도구 호출은 그대로 실행됨, tool_result 의 is_error 는 false
-> 에이전트의 보고: "No errors or extra markers."
```

모든 게이트가 통과한다. 아무것도 표면에 드러나지 않는다. 세션 안에서 보면 하네스는 건강해
보이고, 방치하는 한 계속 건강해 보인다. 전체 실측은
[docs/hook-contract.md](docs/hook-contract.md) 에 있다.

공개된 하네스 레포는 거의 전부 그린필드 TypeScript 를 가정한다. Java 6 / PHP 5 /
혼재 인코딩 / 테스트 없음 / CI 없음 환경은 빈자리다.

## 3층 방어

| 층 | 수단 | 할 수 있는 것 |
|---|---|---|
| **declare** | `CLAUDE.md` / `AGENTS.md` | 의도를 선언한다. 따를 수도, 안 따를 수도 있다. |
| **guide** | 서브에이전트, 스킬 | 작업 시작 전에 접근 방식을 잡아준다. |
| **enforce** | 훅 | **실제로 막을 수 있는 유일한 층.** |

대부분의 설정은 1층까지 있고, 일부는 2층까지 있고, 3층이 진짜 돌고 있는지 증명할 수 있는
곳은 거의 없다. `revet doctor` 는 셋을 모두 채점하되 **조용히 죽을 수 있는 층**에
가중치를 둔다.

## 설치

```bash
npm install --save-dev @khkim3115/revet
```

패키지는 스코프가 붙지만 **설치되는 명령어는 `revet` 그대로**다. npm 이 무스코프
`revet` 을 기존 패키지(`ret`·`raven`·`leven` 등)와 너무 비슷하다며 거부해서, 그 부담을
직접 타이핑하는 CLI 가 아니라 스코프 쪽으로 넘겼다.

`.claude/settings.json` — 레포에 훅 스크립트 파일은 0개다. settings 가 런타임을 직접 부른다:

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

`npx` 가 아니라 `node_modules/.bin` 을 가리켜라. `npx` 는 Bash 호출마다 패키지를 다시 해석한다.

## 정직한 점수 — 왜 2회차에 점수가 «떨어지는가»

대부분의 감사 도구는 점수를 부풀린다. 이 도구는 반대로 설계됐다. 오르기만 하는 점수는
아무도 행동에 옮길 수 없기 때문이다.

2회차는 1회차보다 점수가 **낮게** 나오는 일이 흔하다. 대개 나빠진 게 아니다. 1회차가
아직 충분히 깊게 보지 않았을 뿐이고, 원래 있던 문제가 **드러난** 것이다. 이걸 퇴행으로
보고하면 사람들은 도구를 다시 돌리지 않게 된다.

그래서 `revet doctor` 는 숫자 하나만 내놓지 않는다:

- 점수 **+** 심각도별 finding 수 **+** baseline 대비 delta
- finding 이 늘고 있는데 점수가 올랐다고 `improved` 라고 부르는 일은 없다
- `--baseline` 으로 measure-fix-remeasure 루프를 1급 기능으로 만든다

```
  B / 84        findings: 1 high - 1 medium
  vs baseline:  score -6,  findings +1  (surfaced, not regressed -- the drop is new findings, not new scoring)
```

`surfaced` 는 «새 finding 이 원래 잠자고 있던 것» 이라고까지는 **주장하지 않는다.**
점수와 개수만으로는 «새로 발견된 문제» 와 «새로 만들어진 문제» 를 구분할 수 없다.
확실히 말할 수 있는 건, 점수가 떨어진 이유가 채점 기준이 바뀌어서가 아니라 finding 이
늘어서라는 것뿐이고, 라벨은 딱 거기까지만 말한다. 어느 쪽이었는지는 finding 자체를 봐야 한다.

## 규칙 쓰기

규칙은 코드가 아니라 데이터다. 소스를 한 번도 열지 않을 사람도 읽고 리뷰할 수 있어야 하기 때문이다.

```yaml
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

핵심 필드는 `why` 다. 이게 있으면 **가르치는 도구**가 되고, 없으면 잔소리하는 린터가 된다.
`revet explain core/destructive-rm` 로 볼 수 있다.

| event | 매처 키 |
|---|---|
| `pre-bash` | `command` (정규식) |
| `pre-edit`, `post-edit` | `path` (glob), `content` (정규식), `added` (정규식, **추가된 줄만**) |

중요한 건 `added` 다. 레거시 코드베이스에서 `content` 로 전체를 보면 기존 위반이 전부
걸려 신호가 묻힌다. **이미 있는 것이 아니라 새로 들어오는 것**을 막아야 한다.

`.claude/revet.yaml` 에서 팩 선택과 오버라이드를 한다:

```yaml
packs: [core, legacy-php5]
overrides:
  core/destructive-rm: warn        # 강등
  legacy-php5/short-ternary: off   # 비활성
custom:
  - id: local/no-todo-in-src
    event: post-edit
    match: { path: "src/**", added: "TODO" }
    verdict: warn
    message: "New TODO added under src/."
```

오버라이드는 도망갈 구멍이 아니라 **1급 시민**이다. 레거시 프로젝트마다 «표준»이 다르고
그중 일부는 옳다. 규칙 하나 강등하기가 어려우면 사람들은 그 규칙만 끄는 게 아니라
도구를 통째로 끈다.

솔직한 한계 하나: `command` 패턴은 **인용부호 안 텍스트까지 포함해 명령줄 전체**를 매칭한다.
재귀 삭제를 *언급만* 하는 명령도 실제로 수행하는 명령과 똑같이 차단된다. 이건 의도된
맞교환이다 — 절대 오탐하지 않을 만큼 좁은 매처는 런타임에 변수로 조립된 삭제를 놓칠 만큼도
좁다. 규칙별 `overrides` 가 곁다리가 아니라 1급 기능인 이유가 이것이다.

## 설계 노트

**`warn` 은 exit code 가 아니다.** `PreToolUse` 에는 «호출은 통과시키면서 메시지는
에이전트에게 보여주는» exit code 가 **존재하지 않는다.** exit 0 과 exit 1 은 stderr 를
조용히 버리고, exit 2 는 차단한다. 그래서 `warn` 은 stdout 의 JSON `additionalContext`
채널로 전달되며, `permissionDecision` 은 **절대 내보내지 않는다** — 거기에 `"allow"` 를
쓰면 호출을 *승인*해버려서 사용자 자신의 권한 규칙을 덮어쓴다. 가드레일이 경고하는
부수 효과로 권한을 넓히면 안 된다. 전부 실측이다.

**Fail closed.** 페이로드 파싱 실패, 미지의 이벤트, 없는 규칙팩 등 내부 실패는 전부
exit 0 이 아니라 exit 2 다. 없는 revet 이 조용하므로, 고장난 revet 은 그보다 시끄러워야 한다.

**revet 자기 게이트만이 아니라 모든 게이트를 감사한다.** `doctor` 는 각 훅 명령의 실제
실행 파일을 해석하고, `node`·`python`·`sh` 같은 인터프리터는 **그것이 실행하라고 받은
스크립트까지 따라간다** — 옆에 있던 스크립트가 지워졌는데 `node` 가 해석된다는 사실은
아무것도 증명하지 않기 때문이다. 사라진 셸 스크립트를 가리키는 훅은 revet 이 죽는 것과
똑같은 방식으로 죽고, **아무도 눈치채지 못하는 쪽은 대개 그쪽이다.**

**경로를 문자열로 비교하지 않는다.** 구분자와 대소문자 차이 때문에 문자열 경로 비교는
어떤 플랫폼에서 조용히 틀리고, 그 위에 세운 게이트는 **한 번도 발동하지 않으면서 살아
있는 것처럼 보인다.** 이 레포의 내부 불변식이자 `core` 팩의 규칙이다.

**오버헤드 ~5ms.** `pre-bash` 는 모든 Bash 호출 앞에 붙는다. 규칙팩은 빌드 시 JSON 으로
선컴파일되고, `revet.yaml` 이 없으면 YAML 파서는 아예 로드되지 않으며, 산출물은 의존성
0의 단일 CommonJS 파일이다. 맨 `node` 기동 대비 실측 오버헤드는 약 5ms 이고
`test/perf.bench.ts` 가 CI 에서 강제한다.

**네트워크 0 · 텔레메트리 0 · 런타임 의존성 0.** `doctor` 는 남의 `.claude/` 를 읽는
도구이므로 오프라인·읽기전용이고 훅을 실행하지 않는다.

## 로드맵

`revet init` · briefing 훅(`SessionStart`/`Stop`) · `legacy-java6`·`vue-migration` 팩 ·
정규식으로 표현 못 하는 규칙을 위한 `js:` 탈출구 · 콜드스타트가 Node 하한 아래로
내려가야 할 때의 Go 재작성.

## 문서

- [docs/methodology.ko.md](docs/methodology.ko.md) — 3층 방어와 실패 유형
- [docs/hook-contract.md](docs/hook-contract.md) — 실측한 훅 계약 (영문)

## 라이선스

MIT
