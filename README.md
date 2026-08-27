# 개인 맞춤형 실시간 정보판 (realtime-info-board)

## 프로젝트 개요
로그인 없는 개인용 실시간 정보 대시보드. 모든 위젯이 값과 함께 출처·원천 시각·조회 시각을 표시하며, T04 확장으로 장애 5종·마지막 정상값·Asia/Seoul 일별 기록·이전 대비 비교를 제공한다.

## 실행 방법
```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 연다. 로스트아크·환율 실데이터는 `.env.example`을 참고해 `.env.local`에 서버 전용 키 두 개만 설정해야 하며, `NEXT_PUBLIC_` 접두사는 사용하지 않는다. 거래장 아이템은 검색창에서 입력하고 환율 통화는 목록에서 선택한다.

## 품질 명령
```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`test:e2e`는 먼저 `npm run build`를 통과한 뒤 실행한다. Chrome headless 검증 스크린샷은 매 실행마다 `docs/검증스크린샷/<실행시각>/`에 새로 누적되어 기존 증거를 덮어쓰지 않는다.

## 문서 색인
- `작업내역_체크리스트.md` — 진행 상황·결정 기록 SSOT (가장 먼저 읽을 파일)
- `계획.md` — 단계별 실행 계획과 결정 이유
- `Codex_작업지시서.md` — 구현 담당자(Codex)용 자기완결형 실행 지시서
- `docs/00_과제_요구사항_매핑.md` — 요구사항 1:1 매핑
- `docs/T04_검증_체크리스트.md` — 카드별 완료 여부·장애표·재검산·시간 기록
- `docs/01_기획.md` — 기술 스택·시스템 구조 개요
- `docs/05_배포.md` — 배포처 비교·절차
- `docs/사용자_사전작업_체크리스트.md` — 다음 AI 전에 사용자가 직접 준비할 계정·API 키·승인 범위
- `docs/검증안내서.md` — 통과 확인 방법
- `docs/트러블슈팅.md` — 문제·시도·해결 기록 (구현 중 누적)
- `docs/AI_3줄.md` — AI 협업 요약
- `docs/포트폴리오_추가용_소개글.md` — 포트폴리오용 소개글 초안
- `docs/검증스크린샷/README.md` — 검증 실행 이력과 보고서용 증거 색인

## 폴더 구조
```text
src/app/                 Next.js 화면과 /api/widgets/* Route Handler
src/components/          Dashboard, WidgetCard, Query Provider
src/lib/providers/       Upbit, GitHub Status, 수출입은행, Lost Ark adapter
src/lib/server/          timeout/retry, TTL cache, dedupe, 오류 응답
src/lib/client/          브라우저 오류 분류·stale/빈 상태 변환
src/lib/history/         날짜별 중복 방지·이전 대비 계산
src/types/               WidgetData<T> 공통 계약
src/fixtures/            상태별 시각 검증 fixture
tests/e2e/               Playwright 브라우저·보안 검증
docs/검증스크린샷/       실행별 누적 스크린샷 증거
```

## 진행 상태
기존 0~5단계는 원본 배포에서 검증됐다. T04 확장은 `realtime-info-board-t04` 복사본에서 구현 중이며, 로컬 최종 검증 후 별도 배포 승인을 받아야 공개 완료로 판정한다.
