# AGENTS.md — 개인 맞춤형 실시간 정보판 (OpenAI Codex 진입 지침)

> 세션을 시작하면 가장 먼저 이 폴더의 `작업내역_체크리스트.md`를 읽고, 그 안의 지침을 따른다.
> 이 워크스페이스 전체 규칙은 `C:\Users\stuls\Desktop\Agent\law.md`에 있다. 이 파일과 law.md가 충돌하면 law.md가 우선한다.
> law.md 기준 이 프로젝트에서 Codex의 역할은 **Primary Implementer**(구현·리팩터링·테스트·버그 수정·결과 보고)다.

## 1. 세션 시작 시 가장 먼저 할 일
1. `작업내역_체크리스트.md` 한 파일만 먼저 읽는다 (폴더 전체를 훑지 않는다).
2. `Codex_작업지시서.md`를 읽고 0단계부터 순서대로 구현한다.
3. 판단이 갈리는 부분은 `계획.md`(결정 이유)를 참고한다.

## 2. 절대 통째로 읽지 말 것
| 경로 | 이유 |
|---|---|
| node_modules/, .next/, dist/, build/ | 의존성·빌드 산출물 |
| .git/ | Git 내부 데이터 |
| public/ 대용량 이미지 | 필요해도 개별 파일 1~2개만 |

## 3. 작업 유형별로 문서 하나만 읽기
| 하려는 작업 | 읽을 문서 |
|---|---|
| 구현 작업 지시 확인 | `Codex_작업지시서.md` |
| 설계/결정 이유 확인 | `계획.md`, `docs/01_기획.md` |
| 배포 방법 | `docs/05_배포.md` |
| 과거 문제 해결 사례 | `docs/트러블슈팅.md` |
| 진행 상황·다음 할 일 | `작업내역_체크리스트.md` |
| 요구사항 전체 목록 | `docs/00_과제_요구사항_매핑.md` |

## 4. 코드 작성 시 필수 규칙
- `Codex_작업지시서.md` 5절 보안 규칙(키는 서버 환경변수에만, `NEXT_PUBLIC_` 금지, 브라우저는 `/api/widgets/*`만 호출)을 반드시 지킨다.
- 파일을 통째로 다시 쓰지 않는다 — 필요한 부분만 수정한다.
- 코드를 고쳤으면 아직 끝난 게 아니다: `작업내역_체크리스트.md`의 작업 로그·진행 상황에 반영하고, 구조·배포가 바뀌면 관련 문서도 같이 갱신한다.
- 원본 전략 문서와 다르게 구현했다면 이유를 `계획.md`에도 추가로 기록한다.

## 5. 완료 보고
law.md 10장 표준 템플릿을 그대로 사용한다:

```text
Role: OpenAI Codex — Primary Implementer
Task:
Changed:
Created:
Tests:
Result:
Problems:
Next Agent:
Git:
```

보고 후 `작업내역_체크리스트.md`의 "다음 작업자에게" 섹션도 동일하게 갱신한다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
