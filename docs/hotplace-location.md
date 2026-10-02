# HotPlace 위치 입력

원격 체크포인트: `3d07cf6c719c9d5a91f86da656f68645250e19a3` (`origin/ui/trip-map-layout`).

위도·경도를 사용자가 직접 입력하는 화면을 없애고, 기존 위치 선택 기능에 연결합니다.

1. 지도를 클릭하면 클릭한 위치를 사용합니다.
2. 실제 TourAPI 관광지를 선택하면 해당 관광지의 좌표를 사용합니다.
3. 주소를 검색하면 Kakao Geocoder로 위치를 찾습니다. 주소만 입력하고 저장할 때도 위치 확인을 먼저 시도합니다.

`placeLat`·`placeLng`는 내부 hidden 필드이며 저장되는 `mapy`·`mapx` 구조는 동일합니다. 저장 서비스가 유효한 좌표를 필수로 검증하므로 그 계약은 유지합니다. 위치를 찾을 수 없을 때는 주소를 다시 검색하거나 지도·관광지로 선택하도록 안내하며, 임의의 좌표를 넣지 않습니다.

주소 변경으로 기존 위치가 낡은 정보가 되면 다시 확인합니다. 비동기 주소 검색 중 모달 닫기·회원 전환·입력 변경·중복 저장을 방어합니다. 기존 사진·수정·삭제·회원별 저장 방식은 그대로 사용합니다.

이 작업은 `fix: simplify HotPlace location input` 커밋으로 분리합니다. 해당 커밋만 `git revert`하면 HotPlace 위치 입력 UI와 관련 검사만 되돌릴 수 있습니다.

검증: 신규 위치 UX 12개, 기존 HotPlace 11개, 무드·여권 연계 12개 모두 PASS. 실제 Kakao Geocoder로 주소만 입력한 저장과 새로고침 유지도 확인했고 runtimeErrors·consoleErrors·failedRequests는 모두 0입니다. 1440·1024·768·390px 등록창에서 가로 넘침과 위경도 숫자 노출이 없었습니다.

```bash
node tests/hotplace-location-browser.test.mjs
npm run test:hotplace
npm run test:features
```

실제 캡처: [Desktop 위치 선택](../screenshots/hotplace-location-final.png), [Mobile 위치 선택](../screenshots/hotplace-location-mobile-final.png). 캡처의 장소는 격리된 QA 브라우저에서 실제 주소로 등록한 개인 기록입니다.
