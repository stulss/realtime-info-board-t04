# Codex 작업 지시서 — 개인 맞춤형 실시간 정보판

> 이 문서는 Codex(구현 담당자)가 별도 설명 없이 바로 착수할 수 있도록 작성한 자기완결형 지시서다.
> 배경 근거와 결정 이유의 전체 맥락은 같은 폴더의 `계획.md`에 있다. 막히는 판단이 있으면 그 문서를 먼저 참고할 것.

## 0. 프로젝트 한 줄 요약

로그인 없는 개인용 웹 대시보드. 5개의 실시간 정보 위젯(아래 확정 목록)을 카드로 보여주되, **모든 카드가 항상 "실제 값 + 출처 + 원천/조회 시각"을 함께 표시**해야 한다. 이 투명성 규칙이 이 프로젝트의 핵심 요구사항이다.

## 1. 작업 위치

- 새 프로젝트 루트: `C:\Users\stuls\Desktop\Agent\realtime-info-board`
- 이 폴더 밖의 다른 프로젝트(`dashboard`, `today-status-board`, `card-news-maker` 등)는 참고하지 않는다. 코드 재사용·패턴 차용 금지.

## 2. 기술 스택 (고정)

- Next.js + TypeScript + Tailwind CSS
- TanStack Query (SWR 사용 금지 — 하나만 채택)
- 배포: Vercel

이 스택을 쓰는 이유는 로스트아크·기상청 등 키가 필요한 외부 API 키를 브라우저에 노출하지 않고 Next.js Route Handler(서버)에서만 다뤄야 하기 때문이다. 다른 프레임워크로 임의 변경하지 말 것.

## 3. 확정된 위젯 5개

| # | 위젯 | 공급자 | 인증 | 원천 시각 제공 | 권장 갱신 주기 |
|---|---|---|---|---|---|
| 1 | 로스트아크 공지 | Lost Ark OpenAPI `/news/notices` | 필요 (bearer JWT) | 없음 → `API 미제공` 표기 | 10~15분 |
| 2 | 로스트아크 거래장 시세 | Lost Ark OpenAPI `/markets/options`(캐시) + `/markets/items` | 필요 (bearer JWT) | 없음 → `API 미제공` 표기 | 2~5분 |
| 3 | 암호화폐 시세 | Upbit 티커 REST | 불필요 | 있음 | 10~30초 |
| 4 | 고시 환율 | 한국수출입은행 환율정보 (신규 `oapi`) | 필요 (`serviceKey`) | 확인 후 없으면 `API 미제공` | 서버 1시간 캐시 (최대 24회/일, 일환율 11시 전후 갱신 반영) |
| 5 | 서비스 상태 | GitHub/Discord/Cloudflare 중 1개 `summary.json` | 불필요 | 있음 | 2~5분 |

## 4. 공통 데이터 계약 (모든 위젯 API가 이 타입으로 응답할 것)

```ts
export type WidgetData<T> = {
  value: T
  status: 'ok' | 'refreshing' | 'stale' | 'maintenance' | 'rate_limited' | 'error'
  source: {
    provider: string
    docsUrl: string
    endpointTemplate: string // 토큰, serviceKey, 개인 값 반드시 제거
    attribution?: string
  }
  sourceTimestamp?: string // 공급자가 제공한 시각. 없으면 필드 자체를 비우고 UI에서 "API 미제공" 표시
  fetchedAt: string        // 서버가 성공적으로 조회한 시각
  nextRefreshAt?: string
  cacheAgeMs: number
  warning?: string
  lastError?: { code?: number; message: string; occurredAt: string }
}
```

### 상태 배지 문구 (그대로 사용)

| status | 배지 텍스트 |
|---|---|
| ok | 정상 |
| refreshing | 갱신 중 |
| stale | 오래된 데이터 |
| maintenance | 점검 중 |
| rate_limited | 호출 제한 |
| error | 조회 실패 |

색상만으로 상태를 구분하지 말 것 — 색상 + 아이콘 + 텍스트를 항상 함께 표시.

### 로스트아크 전용: 점검 상태 이원화

- `/news/notices`에 점검 공지가 있으면 → `점검 공지 확인` (별도 배지, maintenance 아님)
- OpenAPI가 503을 반환하면 → `OpenAPI 접근 불가` (status: `maintenance` 또는 `error`)
- 이 둘을 하나로 합쳐서 "게임 서버 점검"이라고 과장 표시하지 말 것. 503은 게임 서버 장애를 보장하지 않는다.

## 5. 보안 규칙 (위반 시 반드시 수정 후 다음 단계 진행)

- 비밀 키(로스트아크 JWT, 수출입은행 serviceKey 등)는 서버 환경변수에만 저장. `NEXT_PUBLIC_` 접두사 사용 금지.
- `.env.local`은 Git에 커밋하지 않는다.
- 브라우저는 외부 공급자 API를 직접 호출하지 않는다 — 반드시 자체 `/api/widgets/*` Route Handler를 거친다.
- 화면과 클라이언트 번들 어디에도 실제 키·토큰이 노출되면 안 된다. API URL은 키를 제거한 템플릿만 표시.
- 서버 로그에 Authorization 헤더나 전체 비밀 URL을 남기지 않는다.

## 6. 단계별 작업 순서 (반드시 이 순서대로, 각 단계 완료 후 동작 확인)

### 0단계 — 프로젝트 초기화
- `realtime-info-board`에 Next.js(App Router) + TypeScript + Tailwind CSS 스캐폴드
- TanStack Query Provider 설정

### 1단계 — 공통 데이터 계약 + 정적 UI
- `src/types/widget.ts`에 `WidgetData<T>` 타입 작성
- `WidgetCard` 컴포넌트: 아이콘/이름/상태배지 → 핵심 값 → 보조정보 → 출처+문서링크 → API 템플릿 → 원천시각/조회시각(Day.js RelativeTime, 절대시각은 title/hover에) → 다음 갱신 시각
- fixture JSON 5종(ok/stale/maintenance/rate_limited/error)으로 5개 위젯 카드가 모두 정상 렌더링되는지 확인
- 반응형 그리드, 다크모드 지원

### 2단계 — 무인증 API 연동
- `/api/widgets/upbit-ticker` (Upbit 티커, KRW-BTC)
- `/api/widgets/status` (GitHub/Discord/Cloudflare 중 택1 `summary.json`)
- 브라우저는 이 두 엔드포인트만 fetch. 외부 도메인 직접 호출 금지.

### 3단계 — 키 기반 API 연동
- Vercel 환경변수: `LOSTARK_API_KEY`, 수출입은행 `EXIM_SERVICE_KEY` 등록
- `/api/widgets/exchange-rate` 구현
- 공급자별 adapter를 별도 파일로 분리 (`src/lib/providers/lostark.ts`, `.../exim.ts` 등 — 하나로 합치지 말 것)
- 공통 timeout/retry(지수 백오프)/429·503 분기 유틸 작성 후 모든 adapter가 공유

### 4단계 — 로스트아크 기능
- `/api/widgets/lostark-notices` (`/news/notices`)
- `/api/widgets/lostark-market`: 서버에서 `/markets/options`를 24시간 캐시 → `/markets/items` POST 검색에 사용
- 로스트아크 인증 헤더 형식 주의: `Authorization: bearer {JWT}` — `bearer`와 토큰 사이 공백 필수
- 분당 100 요청 제한 준수, 429 발생 시 즉시 재시도 금지(리셋 시각 이후 재시도)
- 점검 상태 이원화 규칙(위 4항) 적용

### 5단계 — 운영 품질
- 위젯별 서버 캐시 TTL 적용 (위 표의 갱신 주기 기준)
- 동일 파라미터 동시 요청은 하나의 promise로 공유 (dedupe)
- 외부 API 실패 시에도 마지막 성공 데이터 유지 + `오래된 데이터` 배지
- 새로고침 UX: 전체 새로고침(모든 쿼리 무효화), 개별 새로고침(카드 단위), 쿨다운 중 남은 시간 표시, 백그라운드 탭 폴링 축소

### 6단계 — 배포 및 검증
- Vercel 배포
- 배포 후 브라우저 Network 탭에서 Authorization/serviceKey/토큰이 응답이나 요청 URL에 보이지 않는지 직접 확인
- 아래 "완료 체크리스트" 전체 통과 확인

## 7. 완료 전 체크리스트

- [ ] `.env.local`이 Git에 포함되지 않음
- [ ] 모든 비밀 값에 `NEXT_PUBLIC_` 접두사 없음
- [ ] Network 탭에 Authorization/serviceKey 없음
- [ ] 화면 API URL에 토큰/키 없음
- [ ] 5개 위젯 모두 공급자명·문서링크·API 템플릿·조회시각 표시
- [ ] 원천 시각이 없는 위젯은 `API 미제공`으로 명시 (시각을 임의로 만들어내지 않음)
- [ ] 429/503/네트워크 실패가 서로 다른 배지로 구분됨
- [ ] 오류 시에도 마지막 성공값이 화면에 남아있음
- [ ] 로스트아크 "점검 공지"와 "OpenAPI 접근 불가"가 분리 표시됨

## 8. 핵심 참고 링크

- Lost Ark OpenAPI: https://developer-lostark.game.onstove.com/ (FAQ: /faq)
- Upbit API: https://docs.upbit.com/kr/
- 한국수출입은행 환율정보: https://www.data.go.kr/data/3068846/openapi.do
- GitHub Status API: https://www.githubstatus.com/api/v2/summary.json
- TanStack Query 폴링 옵션: https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults

## 9. 작업 완료 후 보고 형식

이 워크스페이스 규칙(`CLAUDE.md`)에 따라 아래 항목으로 보고할 것: Role, Task, Changed, Created, Tests, Result, Problems, Next Agent. 작업 중 원본 전략 문서와 다르게 판단해서 구현을 바꾼 부분이 있으면 반드시 이유와 함께 `계획.md`에도 추가로 기록할 것.

## 10. 구현 결과 (2026-08-26)

- [x] 0~1단계: Next.js/TypeScript/Tailwind/TanStack Query 초기화, 공통 계약과 5상태 UI
- [x] 2단계: Upbit·GitHub Status 공개 API 연동
- [x] 3~4단계: 수출입은행·Lost Ark adapter, 공통 오류 처리, 거래장 options 캐시
- [x] 5단계: 위젯 TTL, in-flight dedupe, stale fallback, 전체/개별 갱신과 쿨다운
- [x] 6단계 로컬: lint, typecheck, 19개 단위 테스트, production build, 5개 E2E, 누적 스크린샷
- [ ] 6단계 배포: 실제 API 키 등록, Vercel 배포, 배포 URL Network 탭 최종 확인

검증 증거와 실행 이력은 `docs/검증스크린샷/README.md`, 상세 인수인계는 `작업내역_체크리스트.md`를 기준으로 한다.
