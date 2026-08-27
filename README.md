# 오늘의 진짜 정보판 — 데이터가 안 올 때

실제로 변하는 공개 데이터를 매일 기록하고, 값이 늦거나 실패해도 마지막 정상값과 현재 상태를 정직하게 보여주는 정보판입니다.

현재 데이터 항목은 **Upbit BTC/KRW 일봉**입니다. 화면에는 값, 단위(KRW), 원자료 링크, 원자료 관측 시각, 조회 시각, 기준 시간대(Asia/Seoul), 일별 기록과 어제 대비 변화가 함께 표시됩니다.

## 빠른 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 열고, 장애 재현 화면은 `http://localhost:3000/verification`에서 확인합니다.

## T04 검증 상태

| 항목 | 상태 |
|---|---|
| 공개 원자료·값·단위·출처·두 시각·KST | 로컬 검증 완료 |
| timeout·401/403·호출 제한·오프라인·형식 변경 | 합성 fixture 5종 검증 완료 |
| 마지막 정상값·오래된 데이터·빈 상태·다시 시도 | 로컬 E2E 검증 완료 |
| 같은 날짜 중복 방지 | 검증 완료 |
| 실제 서로 다른 KST 날짜 2건 대조 | 2026-08-25 / 2026-08-26 기록 보존 |
| 공개 배포 URL | <https://realtime-info-board-t04.vercel.app/> |
| 다음 실제 날짜 재실행 | 별도 확인 필요 |

장애 fixture는 시험용 합성 응답이며 실제 날짜 기록을 대신하지 않습니다. 공개 asset 패키지가 제공되지 않아 asset SHA-256 검증은 보류 상태입니다.

## 검증 명령

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

최근 로컬 결과: lint, typecheck, Vitest 41개, production build, Playwright E2E 9개 통과.

## 문서와 증거

- [C01–C28 요구사항 매핑](docs/00_과제_요구사항_매핑.md)
- [T04 검증 체크리스트](docs/T04_검증_체크리스트.md)
- [짧은 검증 안내서](docs/검증안내서.md)
- [AI와 나의 판단 3줄](docs/AI_3줄.md)
- [스크린샷 증거 색인](docs/검증스크린샷/README.md)
- [최신 전체 E2E 증거](docs/검증스크린샷/2026-08-27T05-19-10-578Z/)
- [발표자료](docs/T04_발표자료.md)
- [프로젝트 전체 기록 Markdown](docs/T04_프로젝트_전체기록.md)
- [발표용 PPT](docs/T04_발표자료_2026-08-27.pptx)
- [제출자료 원고 Markdown](docs/T04_제출자료_원고.md)
- [제출용 PPTX](docs/T04_제출자료_2026-08-27.pptx)
- [최종 제출 PDF](docs/T04_제출자료_2026-08-27.pdf)
- [지정 문서 기반 제출 원고 v2](docs/T04_제출자료_원고_v2.md)
- [지정 문서 기반 제출용 PPTX v2](docs/T04_제출자료_v2_2026-08-27.pptx)
- [지정 문서 기반 최종 PDF v2](docs/T04_제출자료_v2_2026-08-27.pdf)
- [최종 과제 제출 보고서 원고 v3](docs/T04_제출자료_원고_v3.md)
- [최종 과제 제출 보고서 PPTX v3](docs/T04_과제_제출_보고서_v3_2026-08-27.pptx)
- [최종 과제 제출 보고서 PDF v3](docs/T04_과제_제출_보고서_v3_2026-08-27.pdf)

## 안전한 호출 경로

외부 원자료 호출은 Next.js Route Handler를 통해 서버에서 수행합니다. 브라우저 코드와 공개 파일에는 비밀키를 넣지 않으며, 저장소·네트워크·빌드 산출물의 비밀값 검색 결과는 0건입니다.

## 프로젝트 구조

```text
src/app/api/widgets/       공개 데이터 Route Handler
src/app/api/verification/  합성 장애 검증 API
src/components/            대시보드·일별 기록·장애 검증 UI
src/lib/providers/         외부 데이터 adapter
src/lib/history/            KST 일별 중복 방지·변화 계산
tests/e2e/                  Playwright 검증
docs/검증스크린샷/           덮어쓰기 방지 증거 폴더
```

이 저장소는 원본 프로젝트의 백업을 보존하기 위해 만든 T04 작업 복사본입니다.
