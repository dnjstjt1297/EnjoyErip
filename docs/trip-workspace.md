# Trip 지도 중심 화면 작업 기록

이번 작업은 기존 EnjoyTrip의 관광 검색 화면만 정리합니다. TourAPI 요청, Kakao 지도 모듈, 회원·저장소와 다른 페이지의 동작은 기존 구현을 사용합니다.

## 작업 전 체크포인트

- 기준 커밋: `fd1040c702ffe6543114ec74f821a9eb3ede3d5b`
- 기준 브랜치: `checkpoint/before-trip-map-layout`
- 작업 브랜치: `ui/trip-map-layout`
- 로컬 파일 스냅샷: `/home/ssafy/Dev/EnjoyTrip-checkpoint-20261002-165041`
- 스냅샷 목록: 위 디렉터리의 `checkpoint.json`에 75개 파일 기록

Git 체크포인트와 외부 파일 스냅샷은 화면 변경 전에 만들었습니다. 비공개 `js/config.js`, 수업 키가 있는 참고자료, node_modules와 테스트 산출물은 게시용 Git 이력에 포함하지 않습니다. 이번 외부 스냅샷에도 실제 설정 파일은 포함하지 않았습니다.

## 변경 범위

| 구분 | 파일 |
| --- | --- |
| Trip 화면과 행 상호작용 | `trip.html`, `js/pages/trip.js` |
| Trip 전용 스타일 | `assets/css/trip.css` — 신규 |
| 기존 화면 테스트의 선택자 조정 | `tests/browser.test.mjs`, `tests/integration-browser.test.mjs`, `tests/live-browser.test.mjs` |
| 새 레이아웃 회귀 테스트 | `tests/trip-layout.test.mjs` — 신규 |
| 새 테스트 실행 명령 | `package.json`의 `test:trip-layout` |
| 화면·작업·복원 설명 | `README.md`, `docs/trip-workspace.md` |
| 실제 응답으로 캡처한 Trip 화면 | `screenshots/trip-workspace-desktop-final.png`, `screenshots/trip-workspace-map-final.png`, `screenshots/trip-workspace-mobile-final.png` — 신규 |

실연동 회귀 캡처는 `LIVE_SCREENSHOT_DIR=test-results/trip-layout-live`로 별도 보관했습니다. 기존 다른 페이지 스크린샷을 덮어쓰지 않고, 실제 TourAPI·Kakao 응답으로 확인한 Trip 화면 3개를 위 경로에 추가했습니다.

다음 파일은 이번 화면 작업의 수정 대상이 아닙니다.

- `js/config.js`, `js/config-loader.js`, `js/config.example.js`
- `js/api/`, `js/map/`, `js/services/`, `js/ui/`
- `index.html`, `hotplace.html`, `mypage.html`, `plan.html`, `passport.html`과 각 페이지 JavaScript
- 기존 공통 CSS, HotPlace·여권 CSS, 공통 이미지와 Bootstrap

기존 상세 필터·무드·정렬·페이지 이동·상세보기·지도 선택·여행계획 추가·방문 기록은 유지합니다. 지도는 기존 공통 모듈을 그대로 사용하고, 행 선택·키보드 조작·목록 스크롤은 Trip 페이지 안에서 처리합니다.

## 검증 상태

| 확인 항목 | 상태 |
| --- | --- |
| 보호 대상 41개 파일과 Git 체크포인트 비교 | 최종 SHA-256 비교에서 모두 동일 |
| 보호 대상 41개 파일과 외부 스냅샷 비교 | 최종 SHA-256 비교에서 모두 동일 |
| 실제 API 설정 보존 | 이전 로컬 백업과 최종 SHA-256 동일; 키 값과 해시는 공개하지 않음 |
| 서비스 | 39 PASS |
| 기존 Browser | 20 PASS |
| Travel Mood·여권 Features Browser | 12 PASS |
| 통합 Integration Browser | 16 PASS |
| HotPlace Browser | 11 PASS |
| 새 Trip 레이아웃·키보드·상호작용 | 9 PASS |
| 실제 TourAPI·Kakao Live Browser | 13 PASS |
| 전체 검사 | **120 PASS, 실패 0** |
| 실제 API·지도 실행의 runtimeErrors / consoleErrors / failedRequests | **0 / 0 / 0** |
| 실제 화면의 누락된 로컬 리소스 | **0** |

실제 API에서 지역 16개, 대분류 10개, 서울 구군 25개를 확인했습니다. 검색 결과 카드 12개와 지도 마커 12개가 연결되며, A·C·D·E 정렬, 6종 Travel Mood, Kakao 주소 변환이 모두 통과했습니다. 실패 요청 집계는 페이지 전환·조건 변경에 따른 의도적인 `net::ERR_ABORTED`를 제외합니다.

실제 응답으로 측정한 화면 결과는 다음과 같습니다. Desktop에서는 목록만 독립적으로 스크롤하며, Mobile에서는 지도와 목록을 세로로 배치합니다.

| 화면 폭 | 목록 비율 / 배치 | 지도 높이 | 관광지 행 높이 | 사진 크기 | 가로 넘침 |
| --- | --- | --- | --- | --- | --- |
| 1920px | 약 29.9% / 지도와 나란히 | 619.5px | 134px | 96×96px | 없음 |
| 1440px | 약 29.9% / 지도와 나란히 | 619.5px | 134px | 96×96px | 없음 |
| 1024px | 약 34.2% / 지도와 나란히 | 619.5px | 134px | 90×96px | 없음 |
| 768px | 지도 위·목록 아래 | 400px | 142px | 100×100px | 없음 |
| 390px | 지도 위·목록 아래 | 360px | 142px | 90×100px | 없음 |

높이 1000px의 1920·1440·1024px 화면에서는 첫 화면에 완전히 보이는 관광지 행이 4개였습니다. 측정 결과는 `test-results/trip-workspace-visual.json`에 보관했습니다.

- [Desktop 전체 화면](../screenshots/trip-workspace-desktop-final.png)
- [검색 결과와 지도](../screenshots/trip-workspace-map-final.png)
- [Mobile 화면](../screenshots/trip-workspace-mobile-final.png)

새 레이아웃 검사 결과는 `test-results/trip-layout-results.json`에 생성됐습니다. 이후 실행에서 실패할 경우 캡처 경로는 `test-results/trip-layout-failure.png`입니다. 테스트 결과 파일은 실행 산출물이며 Git에서 제외합니다. 모의 응답 검사와 실제 외부 API 검사는 구분해서 기록합니다.

```bash
npm test
npm run test:browser
npm run test:features
npm run test:integration
npm run test:hotplace
npm run test:trip-layout
LIVE_SCREENSHOT_DIR=test-results/trip-layout-live npm run test:live
```

실연동 검사는 본인의 로컬 설정과 허용된 localhost 도메인에서 실행합니다. 환경에 필요한 Chromium 설치·실행 안내는 README를 따릅니다.

## Trip 변경만 되돌리는 방법

검증을 마친 Trip 화면·테스트·문서·해당 스크린샷은 `ui/trip-map-layout` 브랜치의 단일 로컬 커밋으로 보관합니다. 커밋 해시는 최종 완료 보고에서 확인합니다. 원격 push는 이번 화면 작업에 포함하지 않습니다.

아래는 복원이 필요할 때 사용자가 실행할 절차입니다. 자동 실행하지 않습니다. 먼저 현재 변경 내용을 확인하고, 이후에 만든 작업이 섞여 있으면 별도로 보관합니다.

### UI 커밋 이후: 이력을 보존하는 복원

체크포인트 이후의 UI 커밋을 확인합니다.

```bash
git status --short
git log --oneline checkpoint/before-trip-map-layout..ui/trip-map-layout
```

아래 `UI_COMMIT_HASH`를 위에서 확인한 단일 UI 커밋 해시로 바꿉니다. 먼저 변경 파일 목록을 확인하고 그 커밋만 되돌립니다.

```bash
git show --stat UI_COMMIT_HASH
git revert UI_COMMIT_HASH
```

`git revert`는 해당 화면 변경을 취소하는 새 로컬 커밋을 만듭니다. 이전 이력과 이후 다른 작업을 유지하며 원격 push를 실행하지 않습니다. 이 방법은 같은 UI 커밋에 들어간 새 CSS·테스트·문서·Trip 스크린샷도 함께 처리하므로, 아래 개별 삭제 명령을 추가 실행할 필요가 없습니다.

### UI 커밋 이전: 지정한 파일만 복원

아직 커밋하지 않은 작업은 다음 경로만 확인합니다.

```bash
git status --short
git diff -- trip.html js/pages/trip.js package.json tests/browser.test.mjs tests/integration-browser.test.mjs tests/live-browser.test.mjs README.md
```

기준 브랜치에 이미 있던 Trip 화면과 관련 테스트 파일만 복원합니다.

```bash
git restore --source=checkpoint/before-trip-map-layout --worktree -- trip.html js/pages/trip.js package.json tests/browser.test.mjs tests/integration-browser.test.mjs tests/live-browser.test.mjs README.md
```

이번에 새로 만든 파일은 체크포인트에 없으므로, 내용을 확인한 뒤 필요한 경로만 명시해서 삭제합니다.

```bash
rm -- assets/css/trip.css tests/trip-layout.test.mjs
rm -- screenshots/trip-workspace-desktop-final.png screenshots/trip-workspace-map-final.png screenshots/trip-workspace-mobile-final.png
```

이 작업 기록도 제거하려면 마지막에 별도로 실행합니다.

```bash
rm -- docs/trip-workspace.md
```

위 경로는 이번 작업의 실제 변경 목록입니다. 이후 같은 파일에 다른 변경을 했다면 먼저 보관합니다. Home·MyPage·Plan·HotPlace·Passport 이미지와 기존 Trip 스크린샷을 일괄 복원하거나 삭제하지 않습니다.

`git reset --hard`, 전체 디렉터리 덮어쓰기, `git clean`으로 다른 작업이나 로컬 설정을 함께 지우지 않습니다. 위 절차는 `js/config.js`, 회원·계획·방문 데이터가 저장된 브라우저 LocalStorage, 다른 페이지와 공통 API·지도 코드를 변경하지 않습니다. 개별 파일 복원은 커밋을 만들지 않으며, 어느 복원 방법도 원격 push를 실행하지 않습니다.
