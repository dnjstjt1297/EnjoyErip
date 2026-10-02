# 메인 비행기 Hero

원격 체크포인트: `3d07cf6c719c9d5a91f86da656f68645250e19a3` (`origin/ui/trip-map-layout`).

최종 사용자 지시에 따라 기존 메인 화면의 Hero·타이포·배경·섹션을 유지하고, 비행기만 3D 모델로 교체했습니다. [Hubtown](https://hubtown.co.in/)도 참고했지만 새로운 화면 구성은 적용하지 않았고 해당 사이트의 코드·자산을 복사하지 않았습니다.

- 직접 모델링한 GLB 비행기를 가벼운 WebGL 렌더러로 그려 Hero의 중심 시각 요소로 사용합니다. 동체·날개·꼬리·엔진을 실제 3D 메시로 구성하고 조명으로 입체감을 표현합니다. `pointer-events: none`으로 검색 CTA·내비게이션 클릭을 방해하지 않습니다.
- IDLE에서는 느린 타원 경로를 이동하며 기수가 진행 방향을 향합니다.
- 실제 포인터 이동이 들어오면 FOLLOW로 전환합니다. 비행기 위치와 방향은 프레임 시간에 따른 보간으로 따라가며, 포인터가 멈추면 자연스럽게 멈춥니다.
- Hero를 벗어나면 RETURN으로 자동 비행 경로까지 이동한 뒤 IDLE을 재개합니다.
- Hero가 화면 밖이거나 문서가 비활성화되면 애니메이션을 중지합니다. Touch와 reduced motion은 정적 비행기로 표시합니다.
- 모델은 로딩·크기 변경 때 렌더링하며, 비행 경로의 이동은 `requestAnimationFrame`과 transform으로 처리합니다. 새 외부 애니메이션 라이브러리는 추가하지 않습니다.
- WebGL을 사용할 수 없는 환경에서는 SVG 실루엣을 대체 표시하고 기존 링크와 페이지 기능을 유지합니다.
- 기존 3개 소개 카드·무드·로그인·개인 여권 미리보기·CTA를 유지합니다. 다른 페이지와 API·Storage 구조는 변경하지 않습니다.

이 작업은 `feat: add interactive airplane home experience` 커밋으로 분리합니다. 해당 커밋만 `git revert`하면 메인 화면·모션과 관련 검사를 함께 되돌릴 수 있습니다.


최종 모델은 파란 날개·흰 동체·꼬리·쌍발 엔진·창문·조종석을 가진 자체 제작 GLB입니다. 50개 메시, 3,362개 정점이며 파일 크기는 148,584 bytes입니다. `python3 tools/build-airplane-model.py`로 외부 의존성 없이 같은 자산을 재생성할 수 있습니다.

```bash
node tests/airplane-browser.test.mjs
node tests/airplane-model.test.mjs
```

최종 검증은 모션 12개·모델 6개 PASS입니다. WebGL 실제 픽셀·리사이즈·context loss와 복원·미지원 fallback, 비행 경로·추적·정지·복귀·화면 이탈·동작 줄이기·터치를 확인했습니다. 기존 전체 120개와 HotPlace 신규 12개까지 총 150개가 통과했습니다. 실제 TourAPI·Kakao 및 최종 Home 캡처의 runtimeErrors·consoleErrors·failedRequests는 모두 0입니다.

- [기존 Desktop 메인 + 3D 비행기](../screenshots/home-airplane-desktop-final.png)
- [파란 날개 · 포인터 추적](../screenshots/home-airplane-follow-final.png)
- [Mobile 정적 비행기](../screenshots/home-airplane-mobile-final.png)

1920·1440·1024·768·390px에서 가로 넘침이 없었습니다. Chromium에서 검증했으며 WebGL 미지원 환경에서는 파란색 SVG 실루엣으로 대체합니다.
