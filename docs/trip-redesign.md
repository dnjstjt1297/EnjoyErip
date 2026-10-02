# 여행지 Explorer 정리

이번 작업의 원격 체크포인트는 `3d07cf6c719c9d5a91f86da656f68645250e19a3`이며, `origin/ui/trip-map-layout`에 push했습니다. 작업 전 변경사항이 없어 같은 파일 상태를 가리키는 checkpoint commit으로 남겼습니다.

체크포인트에는 이전 작업의 30:70 여행지 레이아웃이 이미 들어 있습니다. 기존 구현을 초기화하지 않고 이어서 다듬었습니다. 따라서 이번 `style: redesign destination map explorer` 커밋만 revert하면 체크포인트의 여행지 화면으로 돌아갑니다.

- 하나의 목록·지도 공간, 134px 행과 96px 사진, 독립 스크롤·하단 페이지 이동을 유지합니다.
- 제목은 기존 상세보기, 행은 지도 선택, `＋ 여행 계획`은 기존 초안 저장으로 연결합니다.
- 검색어·지역·분류·유형·정렬·무드와 원석 스타일 카테고리 핀은 그대로 사용합니다.
- 일반 검색 성공의 반복 메시지는 스크린리더에만 전달하고, 화면에서는 목록 헤더의 전체 결과 수를 표시합니다. 검색어·거리·좌표 누락 설명과 오류 안내는 계속 보입니다.
- 대표 이미지·보조 이미지·실패 fallback의 처리 흐름은 유지합니다. 목록의 placeholder만 작은 아이콘과 `사진 없음`으로 표시하고 사진·스켈레톤 모서리를 12px로 통일합니다.
- 모바일은 검색 → 지도 → 목록 순서입니다.

검증 명령은 기존 `npm test`, `test:browser`, `test:features`, `test:integration`, `test:hotplace`, `test:trip-layout`, `test:live`입니다. 실연동 캡처에는 `LIVE_SCREENSHOT_DIR=test-results/redesign-trip-live`를 사용해 다른 화면의 이전 캡처를 보존합니다.

이번 화면 변경은 `js/api/`, `js/map/`, `js/services/`, 설정 및 LocalStorage 구조를 수정하지 않습니다. 새 Home·HotPlace 작업은 별도 커밋으로 관리합니다.

최종 회귀 결과: 서비스 39, Browser 20, Features 12, Integration 16, HotPlace 11, Trip layout 9, 실제 API·Kakao 13 — 총 120개 모두 PASS. 실제 연동의 runtimeErrors / consoleErrors / failedRequests는 0 / 0 / 0입니다. Chromium에서 1920·1440·1024·768·390px 가로 넘침 없이 확인했고, 실제 응답 캡처 3개를 `screenshots/trip-workspace-*-final.png`에 갱신했습니다.
