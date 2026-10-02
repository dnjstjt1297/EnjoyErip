# EnjoyTrip

**여행을 찾고, 기록을 남기다 — Discover Korea, Collect Memories.**

EnjoyTrip은 여행 취향으로 관광지를 찾고, 지도에서 일정을 구성한 뒤, 직접 다녀온 장소를 여행 여권에 모으는 국내 여행 서비스입니다. SSAFY Web(Front) 명세를 바탕으로 실제 한국관광공사 TourAPI와 Kakao Maps를 연결합니다.

HTML5 · CSS3 · Vanilla JavaScript ES Modules · Bootstrap 5.3.3 · Fetch · LocalStorage를 사용합니다. 현재 프로젝트의 검증된 기능을 유지하면서 원석 프로젝트의 UI와 일부 기능을 선택적으로 통합했습니다. React/Vue나 별도 백엔드는 사용하지 않습니다. npm 패키지는 브라우저 테스트용 Playwright만 사용하며, 사이트 실행에는 npm 설치가 필요 없습니다.

## 실행

1. `js/config.js`가 없다면 `js/config.example.js`를 복사합니다. **이미 있는 설정 파일은 덮어쓰지 않습니다.**
2. `js/config.js`에 **본인의** Kakao JavaScript 키와 TourAPI 서비스 키를 입력합니다.
3. 프로젝트 루트에서 정적 서버를 실행합니다.

```bash
python3 -m http.server 5500 --bind 127.0.0.1
```

4. 브라우저에서 `http://localhost:5500`으로 접속합니다. 현재 실연동을 검증한 주소입니다. VS Code Live Server가 이 포트에서 이미 실행 중이면 해당 서버를 그대로 사용합니다.
5. Kakao Developers에서 사용하는 사이트 도메인(예: `http://localhost:5500`)을 등록하고 Kakao Maps 사용 설정을 확인합니다. 다른 호스트나 포트를 사용하면 해당 주소도 등록합니다.
6. TourAPI의 **한국관광공사_국문 관광정보 서비스_GW** 활용신청이 승인되어 있어야 합니다.

`file://` 대신 localhost 또는 HTTPS에서 실행하세요. ES Modules·Fetch와 비밀번호 해시에 사용하는 Web Crypto가 필요합니다. 키가 없어도 홈과 회원·기존 로컬 기록 조회는 실행되고, 관광 검색·지도에는 설정 안내가 표시됩니다. 새 방문 기록에는 실제 API 또는 이전에 보관한 지역 목록이 필요합니다. 실제 API 실패를 임의의 샘플 관광지로 대체하지 않습니다.

`js/config.js`와 `references/ssafy-kakao/`는 `.gitignore`에 포함되어 있습니다. 참고자료에는 HTML에 직접 포함된 수업 키도 있어 폴더 전체를 제외했습니다. 앱은 참고자료를 import하지 않으며, 수업 키를 복사하지 않았습니다.

## 두 프로젝트의 선택적 통합

원석 코드 출처는 [dnjstjt1297/EnjoyErip](https://github.com/dnjstjt1297/EnjoyErip)이며, 비교 기준은 [커밋 a4440cd](https://github.com/dnjstjt1297/EnjoyErip/commit/a4440cd4f994761036eb4c4173ac2369d8d7e0e8)입니다. 현재 미르 프로젝트를 초기화하지 않고, 원석의 `frontend/` 화면과 실제 구현을 대조해 필요한 부분만 옮겼습니다.

| 페이지·기능 | 최종 선택 | 통합 방식 |
| --- | --- | --- |
| 공통 디자인·Navbar | 원석 우선 | 연한 paper 배경, ink 텍스트, 청록 강조, slate CTA·pill 버튼·로고를 기존 공통 CSS와 Navbar에 반영 |
| Main | 원석 Hero + 미르 기능 | 중앙 제목, 지구·비행기·도시 SVG 콜라주, pointer parallax. 기존 Travel Mood·여권 미리보기 유지 |
| MyPage | 원석 배치 + 미르 회원 | 좌측 회원정보 / 우측 프로필·실제 통계·백업·탈퇴. 현재 회원 ID·검증·암호 저장 서비스 사용 |
| HotPlace | 원석 화면·등록 흐름 | 장소 카드·지도, 등록/수정 모달, 관광지 검색·선택, 주소, 파일 사진·이야기 보기. 기존 회원별 CRUD·방문 기록과 연결 |
| 관광 검색 | 원석 키워드 + 미르 필터 | `searchKeyword2` 추가. 시도·구군, 대·중·소분류, 무드, 유형·정렬·페이지 이동 유지 |
| 지도 마커 | 원석 유형 표현 + 미르 지도 | 색상·아이콘별 MarkerImage와 범례. 기존 로더·Geocoder·bounds·선택·번호 경로 유지 |
| 여행계획 | 미르 유지 | 초안 자동 저장·날짜·예산·메모·순서·드래그·CRUD·방문 완료를 그대로 사용 |
| 여행 여권·Travel Mood | 미르 유지 | 지역 스탬프·명시적 방문·통계·랜덤·미방문 지역 연결 유지 |
| 회원·LocalStorage | 미르 유지 | 기존 키·회원·소유자·해시를 보존하며 필요한 HotPlace 필드만 확장 |
| 원석 백엔드·별도 회원 DB | 도입하지 않음 | 새로운 서버나 병렬 저장소 없이 기존 실행·서비스 구조 유지 |

원석은 Node 기반 API 프록시(`/api/tour/*`, `/api/config`)와 통합 저장소 `enjoytrip.db.v1`·`enjoytrip.session.v1`을 사용합니다. 현재 앱은 **브라우저에서 TourAPI를 직접 호출**하고, `enjoytrip_users`·`enjoytrip_plans` 등 기존 개별 저장소를 사용합니다. 원석의 `username`/UUID·보안 질문 회원 모델을 가져오지 않았으며, 원석 서버·환경변수·키를 복사하지 않았습니다.

최종 앱에는 API(`js/api/tour-api.js`), 지도(`js/map/kakao-map.js`), 회원(`js/services/auth-service.js`), 저장소(`js/services/storage-service.js`)가 각각 하나의 공통 구현으로 남습니다. 원석의 기능을 현재 모듈에 연결했으며 별도 앱이나 중복 로그인·SDK 로더를 추가하지 않았습니다.

## 우리 EnjoyTrip의 차별점

### 여행 무드 기반 탐색

복잡한 필터를 고르기 전에 “오늘 어떤 여행이 끌리나요?”에 답해보세요. 홈의 무드 링크는 검색 화면으로 이어지고, 검색 화면의 무드 칩은 **기존 TourAPI 필터**를 실제로 변경합니다. 지역·검색어 또는 거리 기준이 있으면 결과를 갱신하고, 조건이 없으면 먼저 지역이나 검색어를 정하도록 안내합니다.

| 무드 | 관광 유형 `contentTypeId` | 대분류 `lclsSystm1` |
| --- | --- | --- |
| 쉬어가기 | 관광지 `12` | 자연관광 `NA` |
| 먹으러 가기 | 음식점 `39` | 음식 `FD` |
| 문화 즐기기 | 문화시설 `14` | 문화관광 `VE` |
| 활동적으로 | 레포츠 `28` | 레저스포츠 `LS` |
| 구경하고 쇼핑 | 쇼핑 `38` | 쇼핑 `SH` |
| 축제 즐기기 | 축제·공연·행사 `15` | 축제공연행사 `EV` |

대분류는 해당 요청에서 받은 실제 코드 목록에 존재할 때만 적용합니다. 코드가 없으면 관광 유형만 적용하고 안내합니다. 기존 시도·구군, 대·중·소분류, 유형·정렬 필터는 그대로 사용할 수 있습니다. 무드 초기화는 유형·분류를 비우고 지역 조건을 유지합니다. 행사 결과가 현재 개최 중임을 보장하지 않으므로 상세 일정 확인이 필요합니다.

**오늘 어디 가지?**는 현재 검색 결과 페이지의 실제 관광지 중 한 곳을 골라 카드와 마커를 함께 강조합니다. 검색 전에는 현재 조건으로 조회를 시도하며, 결과가 없으면 안내합니다. 전국 전체에서의 추천이나 취향 추론 알고리즘으로 표현하지 않습니다.

### 여행 여권

짙은 에메랄드 표지와 지역별 스탬프로 대한민국 여행 기록을 모읍니다. 방문 지역, 다녀온 장소, 이번 달 방문 수, 가장 많이 방문한 지역은 현재 회원의 저장된 기록만 계산합니다. 지역 목록은 실제 `ldongCode2` 응답을 사용하며, 재개 시점에는 **16개 지역**이 반환되었습니다. 분모를 17로 고정하지 않습니다.

지역 스탬프를 누르면 `trip.html?region=코드`로 이동하고 해당 지역이 선택됩니다. “새로운 지역 만나기”는 실제 목록 중 미방문 지역을 고릅니다. 현재 지역 목록에서 사라진 지역명으로 남긴 기록은 별도로 표시해 보존합니다. 홈에서는 로그인한 회원의 여권 미리보기를 제공합니다.

### 검색 → 일정 → 방문 → 여행 여권

1. 무드 또는 상세 필터로 여행지를 찾고 지도에서 확인합니다.
2. 마음에 드는 관광지를 여행계획에 담고 순서·날짜·예산·메모를 정합니다.
3. 실제 다녀온 뒤 관광지 카드나 여행계획에서 **다녀왔어요**를 누릅니다.
4. 공통 모달에서 지역과 방문일을 확인하고 저장하면 여행 여권에 반영됩니다.
5. 직접 등록한 HotPlace도 별도로 방문을 남길 수 있으며, **나만의 발견**으로 공식 관광 정보와 구분합니다.

**검색, 여행계획 저장, HotPlace 등록만으로는 방문 기록이 생기지 않습니다.** 방문 기록은 회원 + 출처 + 장소 ID 기준으로 한 번만 저장됩니다. 같은 관광지를 여러 일정에 담아도 스탬프 수가 늘지 않습니다. 방문 취소는 카드 또는 여행 여권에서 가능하며, 해당 방문 기록만 삭제합니다. 계획이나 HotPlace를 삭제해도 이미 남긴 방문 기록은 유지됩니다. 탈퇴하면 본인의 방문 기록도 삭제됩니다.

## 기존 구조와 유지한 부분

스타터의 5개 HTML 페이지를 보존하고 여행 여권 `passport.html`을 추가했습니다. 기존 `assets/css/style.css`, `api / map / services / ui / pages` 책임 분리를 유지했습니다. 기존 관광 유형 상수, API URL 구성, 지도 마커 배열·bounds, 회원 서비스 함수, 저장소 키, Bootstrap Navbar·폼을 확장했습니다.

스타터에서는 로그인/회원가입 모달이 5개 페이지에 반복되어 있었고, 비밀번호 확인·재설정, 여행지 담기·일정 편집, HotPlace 조회·지도 선택이 빠져 있었습니다. 반복 모달은 `js/ui/auth.js`로 옮기고 페이지 파일에는 해당 페이지 동작만 남겼습니다.

작업 디렉터리에 `.git`이 없어 `git status`와 `git diff`는 사용할 수 없었습니다. 기존 파일을 초기화하지 않고 현재 파일을 수정했습니다.

## 명세와 수업 예제 반영

공식 명세 `docs/enjoytrip_spec.pdf` 16쪽과 `CODEX_PROMPT.md`, `references/ssafy-kakao/`의 모든 파일을 확인했습니다.

| 참고자료 | 반영한 내용 |
| --- | --- |
| `01_kakao_basic.html`, `03_kakao_marker.html` | Map·LatLng·Marker 생성 |
| `02_kakao_geo.html` | `services.Geocoder.addressSearch` 주소 → 좌표 변환 |
| `04_kakao_marker2.html` | `markers` 배열, `setMap(null)`, `markers.length = 0`, `LatLngBounds` |
| `05_openapi_map.html` | 지도 초기화와 관광 검색 연결 |
| `js/common.js` | `updateSelect()`와 URLSearchParams 패턴. 옵션은 안전한 DOM `Option`으로 생성 |
| `js/enjoytrip.js` | `initEnjoyTrip()`, 대·중·소분류, 시도·구군, 지역/위치 기반 API 흐름 |
| `js/kakao.js` | `loadKakaoMap() → initMap() → updateMap()`, 좌표 누락 보완과 마커 갱신 |
| `js/keys.js` | 키를 별도 파일로 관리하는 방식만 참고. 실제 값은 미사용 |

최종 판단은 **공식 PDF → 실제 수업 예제 → 기존 구현 → 제공기관 API 명세** 순서로 대조했습니다. 수업 예제와 같은 KorService2·법정동 코드·분류체계 코드를 채택했습니다. 이는 새로운 프레임워크나 아키텍처로 전환한 것이 아닙니다. 기존 `contentTypeId` 필터도 F102/F103 및 CODEX_PROMPT의 8개 관광 유형을 위해 유지했습니다.

제공기관의 [TourAPI 활용명세](https://www.data.go.kr/data/15101578/openapi.do)에 포함된 Swagger에서 파라미터와 응답 구조를 확인했습니다. [Kakao 공식 문서](https://apis.map.kakao.com/web/documentation/)의 Marker·InfoWindow·Polyline·서비스 구조도 대조했습니다. 프로젝트의 기존 개인 설정으로 실제 지역·분류·관광지 응답과 Kakao SDK·지도 타일·마커·주변 검색을 검증했습니다. 수업 참고자료의 키는 사용하지 않습니다.

## 구현 범위

| 명세 | 상태 | 기능 |
| --- | --- | --- |
| F101 | 구현 | 시도·구군 조회, 관광지 목록·지도, 페이지 이동 |
| F102/F103 | 구현 | 관광지·숙박·음식점·문화시설·행사·여행코스·레포츠·쇼핑, 분류체계 필터 |
| F107 | 구현 | 가입, 중복/입력 검증, 회원 조회·수정·탈퇴 |
| F108 | 구현 | 로그인·로그아웃·새로고침 유지, 비밀번호 재설정 |
| F104 | 구현 | 여행지 담기, 자동 초안 보관, 날짜·예산·메모, 순서 변경, 저장·수정·삭제, 경로 |
| F105 | 구현 | 장소·방문일·유형·설명·사진 URL·지도 좌표, 미리보기, 등록·수정·조회·삭제 |
| F106/F109/F110 | 범위 제외 | 선택 심화인 뉴스 크롤링·공지사항·공유 게시판 |

## 관광 검색 흐름

```text
initEnjoyTrip()
 ├─ lclsSystmCode2 → 대분류
 │    └─ 대분류 변경 → 중분류 → 소분류
 └─ ldongCode2 → 시도
      └─ 시도 변경 → 구군

검색어 있음 → searchKeyword2
검색어 없음 → areaBasedList2 또는 locationBasedList2
         → 응답 확인 → 관광지 카드 → updateMap()
         → 카드/마커 선택 연동 → 여행계획에 담기
```

API 호출은 `js/api/tour-api.js`, DOM 이벤트와 화면 갱신은 `js/pages/trip.js`에 있습니다.

| API | 용도 | 주요 파라미터 |
| --- | --- | --- |
| `lclsSystmCode2` | 대·중·소분류 코드 | `lclsSystmListYn=N`, `lclsSystm1`, `lclsSystm2` |
| `ldongCode2` | 시도·구군 코드 | `lDongListYn=N`, `lDongRegnCd` |
| `areaBasedList2` | 지역별 관광 목록 | `lDongRegnCd`, `lDongSignguCd`, `contentTypeId`, `lclsSystm1/2/3`, `arrange` |
| `locationBasedList2` | 거리순·주변 관광 목록 | 위 필터와 `mapX`, `mapY`, `radius`, `arrange=E` |
| `searchKeyword2` | 관광지 이름 검색 | `keyword`, `lDongRegnCd`, `lDongSignguCd`, `contentTypeId`, `lclsSystm1/2/3`, `arrange=A/C/D` |
| `detailCommon2` | 선택한 관광지 상세 | `contentId` |

- 기본 URL: `https://apis.data.go.kr/B551011/KorService2`.
- 공통: `serviceKey`, `MobileOS=WEB`, `MobileApp=EnjoyTrip`, `_type=json`.
- 분류와 지역은 **수업 예제와 같은 법정동/분류체계 코드**입니다. 기존 `areaCode2`, 요청 파라미터 `areaCode`·`sigunguCode`를 사용하지 않습니다. 기존 함수 인자의 `areaCode` 이름은 법정동 시도 값을 받아 `lDongRegnCd`로 변환합니다.
- 관광 유형: 12, 14, 15, 25, 28, 32, 38, 39. `CONTENT_TYPES`, `CONTENT_TYPE_NAMES` 상수로 관리합니다.
- 제목순 A, 수정일순 C, 등록일순 D는 검색어가 없으면 지역 기반 API, 검색어가 있으면 `searchKeyword2`를 사용합니다. 검색어만으로 전국을 찾거나 기존 지역·분류·관광 유형과 함께 좁힐 수 있습니다.
- 검색어 없는 거리순 E는 지도 중심 또는 사용자가 설정한 현재 위치를 기준으로 위치 기반 API를 사용합니다. 경도=`mapX`, 위도=`mapY`, 반경=1/5/10/20km이며 최대 20,000m입니다. 페이지 이동 시 검색 시점의 좌표를 유지합니다.
- **검색어 + 거리순 E:** `searchKeyword2`의 공식 정렬에 E가 없어, 필터를 적용한 키워드 결과를 끝까지 조회한 뒤 좌표가 있는 장소의 직선 거리를 Haversine으로 계산합니다. 반경 필터 → 거리 정렬 → 페이지 분할 순서입니다. 전체 결과가 1,000곳을 넘거나 끝까지 조회하지 못하면 조건을 좁히도록 안내하며, 첫 페이지만으로 전체 거리순인 것처럼 표시하지 않습니다. 완전하게 받은 결과는 최대 4조건·60초 동안 메모리에 캐시합니다. 거리 계산 기준 좌표는 검색 시점에 고정합니다.
- 관광 유형과 대·중·소분류를 함께 지정하면 교집합을 검색합니다. 상위 선택이 바뀌면 하위 선택과 기존 결과를 초기화합니다.
- 서비스 키는 한 번 URL 디코딩 후 `URLSearchParams`로 인코딩합니다. 인코딩된 키와 원본 키를 처리하고 이중 인코딩을 방지합니다.
- `response.header.resultCode`를 확인하고 HTTP 오류, XML 인증 오류, 네트워크 실패, 15초 타임아웃을 안내합니다.
- 목록이 배열·단일 객체·빈 문자열로 오는 경우를 정규화합니다. 페이지당 12개이며 `totalCount`로 이동 버튼을 갱신합니다.
- `AbortController`와 요청 식별로 오래된 지역/분류/검색 응답이 현재 선택을 덮어쓰지 않게 했습니다.
- API 텍스트를 그대로 HTML로 실행하지 않습니다. 이미지 URL은 HTTP(S)만 허용하고 누락·실패 시 placeholder를 표시합니다.

## Kakao Map 흐름

`js/map/kakao-map.js`는 수업 예제의 함수명과 배열 관리 방식을 사용합니다.

1. `loadKakaoMap()`이 `autoload=false&libraries=services` SDK를 비동기로 로드합니다. 한 번 만든 Promise를 공유합니다.
2. `initMap()`이 지도, InfoWindow, Geocoder를 생성합니다. 지도 연결 실패는 검색·회원 기능을 중단시키지 않습니다.
3. `updateMap()`이 기존 마커에 `setMap(null)`을 호출하고 `markers.length = 0`으로 비웁니다. 이전 인포윈도우와 경로도 제거합니다.
4. `mapx/mapy`가 없거나 잘못된 관광지는 주소로 Geocoder를 호출합니다. 성공한 좌표는 카드 데이터와 여행계획에도 반영합니다. 실패한 장소는 목록에 남습니다.
5. 실제 관광 유형에 맞는 색상·아이콘의 MarkerImage를 사용합니다. 관광지·문화시설·축제·코스·레포츠·숙박·쇼핑·음식점과 HotPlace의 명시적 유형을 구분하며, 장소 이름으로 유형을 추측하지 않습니다. 기본·hover·선택 상태에서도 핀 끝의 좌표를 유지하고 표시 중인 유형만 범례에 노출합니다. 유효한 좌표의 Marker를 만들고 `LatLngBounds.extend()` → `map.setBounds()`로 결과 전체를 표시합니다. 마커가 없으면 bounds를 적용하지 않습니다.
6. 카드 선택과 마커 클릭은 `focusMarker()`를 통해 같은 InfoWindow와 카드 강조 상태를 사용합니다. 마커에서 목록으로 스크롤하고, 모바일에서는 카드에서 지도로 이동합니다. 전체 보기와 현재 위치 컨트롤도 제공합니다.
7. `renderRoute()`는 방문 순서대로 번호 마커와 Polyline을 만듭니다. **실제 도로 경로·길찾기가 아닌 직선 연결**입니다.
8. HotPlace에서는 지도 클릭으로 위치를 정하고, 좌표 입력으로도 위치를 지정할 수 있습니다.

지도 컨테이너 크기가 바뀌면 `ResizeObserver`가 `map.relayout()`을 호출합니다. 선택한 마커를 중심에 두고 InfoWindow를 다시 열어, Desktop에서 Mobile로 전환할 때 정보창이 지도 밖으로 잘리지 않도록 합니다.

수업 예제보다 보완한 부분은 SDK 실패/시간 초과, Geocoder 시간 초과·캐시, 빈 결과, 잘못된 좌표, 늦게 도착한 주소 변환 응답의 무시입니다. 기존 `renderMarkers` export도 `updateMap` 별칭으로 유지합니다.

## 회원 기능

- 공통 Bootstrap 모달: 로그인·가입·비밀번호 재설정. 모든 페이지에서 사용할 수 있습니다.
- 아이디: 영문/숫자/밑줄/하이픈 3~30자, 중복 금지.
- 비밀번호: 8~128자, 확인 값 일치. 이름 1~40자, 이메일 형식 검사.
- 비밀번호는 랜덤 salt와 PBKDF2-SHA-256(120,000회) 해시로 저장하며, 세션에는 회원 ID만 저장합니다. 스타터의 평문 회원은 다음 정상 로그인 때 해시로 이전합니다.
- 회원정보 수정 시 이름·이메일만 반영하고, 비밀번호 변경은 현재 비밀번호 확인을 요구합니다.
- 비밀번호 찾기는 아이디+이메일 확인 후 새 비밀번호 입력란을 표시합니다. 기존 비밀번호를 보여주지 않습니다.
- 로그아웃·회원 변경 시 Navbar와 보호 화면을 갱신하며 다른 탭의 저장소 변경도 반영합니다.
- MyPage 통계는 현재 회원의 계획·방문·HotPlace 수를 읽습니다. JSON 백업에는 본인의 공개 프로필(`id/name/email`)·계획·초안·HotPlace·방문 기록만 담고 비밀번호·salt·해시는 제외합니다.
- 탈퇴하면 본인의 회원정보·여행계획·초안·HotPlace·방문 기록을 삭제합니다. 다른 회원의 데이터와 공용 지역 목록은 유지합니다.

백엔드 없는 과제용 로컬 회원 기능입니다. 이메일 인증 메일이나 서버 세션은 없으며, 브라우저 저장소를 직접 수정하는 사용자를 차단하는 서버 보안 모델은 아닙니다. 실제 개인정보 대신 과제용 정보를 사용하세요.

## 여행계획과 HotPlace

**여행계획:** 검색 결과의 `＋ 여행계획`으로 현재 회원의 초안에 담습니다. 중복은 차단하고 최대 50곳까지 담습니다. 제목·날짜·예산·메모와 여행지 순서는 자동 보관됩니다. 위/아래 버튼 또는 HTML5 Drag & Drop으로 순서를 변경하고 개별 장소를 삭제할 수 있습니다. 저장한 계획을 다시 불러와 수정하거나 삭제할 수 있습니다. 날짜와 최소 한 곳의 장소가 있어야 저장됩니다.

**HotPlace:** 장소 카드와 지도를 함께 보고, 등록·수정 모달에서 장소명·방문일·유형·설명·주소·위치를 기록합니다. 관광지를 이름으로 검색해 고르면 주소·좌표와 공식 관광지 스냅샷을 채웁니다. 개인 기록 사진은 URL 또는 업로드로 별도 선택하며, 직접 위치를 고르는 흐름도 유지합니다. “나만의 발견”과 연결한 TourAPI 관광지는 UI에서 구분합니다.

사진 URL 또는 JPEG·PNG·WebP 파일을 선택할 수 있습니다. 파일은 서버로 올리지 않고 브라우저에서 긴 변 1,000px 이내·JPEG 품질 0.76으로 압축해 저장합니다. 원본은 5MB 이하이며, 압축 결과도 저장 상한을 검사합니다. 전용 사진 검증만 제한된 이미지 data URL을 허용하고 일반 관광지 URL 검증은 HTTP(S)만 허용합니다. 고정 높이 미리보기와 실패 placeholder를 유지합니다. 카드의 이야기 보기·지도 이동·수정·삭제, 로그인 변경 시 개인 데이터 숨김도 지원합니다.

두 기능 모두 회원별로 분리됩니다. 스타터에 이미 저장돼 있던 **소유자 없는** 여행계획/HotPlace는 임의로 특정 계정에 배정하거나 삭제하지 않으며, 원본 저장소에는 보존하되 개인 목록에는 표시하지 않습니다.

## 디자인과 사용 경험

원석 `frontend/assets/css/style.css`, `service.css`의 색상·간격·컴포넌트와 `index.html`, `mypage.html`, `assets/js/app.js`의 화면·인터랙션을 현재 구조에 맞게 적용했습니다. 대표 토큰은 paper `#f5f7ff`, ink `#252c40`, 청록 `#087f91`, CTA gradient `#34445c → #202b40`입니다. Pretendard와 시스템 한글 fallback을 사용합니다.

- **Main:** 중앙 Hero, 원석의 지구·비행기·도시 SVG와 티켓 요소, 부드러운 pointer parallax. 기존 Mood·여권 미리보기는 아래 흐름으로 연결합니다.
- **검색:** 검색어·검색 버튼과 기존 필터를 그리드로 배치하고, Desktop 카드는 왼쪽 120px 사진 / 오른쪽 정보 구조로 정리했습니다. 모바일 사진 카드는 세로형입니다.
- **지도:** 큰 지도, 현재 위치·전체 보기, 유형 핀·범례, 카드↔마커 강조를 제공합니다.
- **사진:** TourAPI의 `firstimage → firstimage2 → 자체 placeholder` 순서를 유지하고, 로딩 중 shimmer·실패 시 대체 화면을 표시합니다.
- **HotPlace·MyPage:** 원석의 카드/모달 및 7:5 프로필 대시보드 배치를 채택하고, 기존 서비스 함수와 Bootstrap 모달에 연결했습니다.
- **인터랙션·접근성:** skeleton·loading overlay·toast·카드 hover·SVG 무드 아이콘·여권 스탬프를 유지합니다. Parallax는 정밀 포인터에서만 움직이고 화면 이탈·비활성화 시 정리합니다. `prefers-reduced-motion`, focus-visible, label·alt·ARIA를 지원합니다.

원석 SVG 자산 `favicon.svg`, `globe.svg`, `plane.svg`, `city.svg`를 재사용했습니다. 이전 경복궁 사진 Hero는 현재 화면에서 제거했습니다. `seoul-gyeongbokgung.webp`는 기존 이미지 회귀 테스트에서도 사용하므로 파일은 보존했습니다. Pretendard v1.3.9는 [공식 프로젝트](https://github.com/orioncactus/pretendard)의 SIL Open Font License를 따르며, Bootstrap 5.3.3은 MIT 라이선스 헤더를 유지한 로컬 파일입니다.

## LocalStorage 구조

기존 키와 데이터를 유지하며, 회원별 초안·방문 기록과 공용 지역 목록 캐시를 별도 키로 관리합니다.

| 키 | 데이터 |
| --- | --- |
| `enjoytrip_users` | `[{id, name, email, passwordSalt, passwordHash}]` |
| `enjoytrip_current_user` | `{id}` 또는 없음 |
| `enjoytrip_plans` | `[{id, ownerId, title, date, budget, notes, places, createdAt, updatedAt}]` |
| `enjoytrip_plan_drafts` | `[{ownerId, title, date, budget, notes, places, editingId}]` |
| `enjoytrip_hotplaces` | `[{id, ownerId, name, date, type, description, imageUrl, address?, photo?, touristPlace?, mapx, mapy, createdAt, updatedAt?}]` |
| `enjoytrip_regions` | `[{code, name}]` — 실제 `ldongCode2` 지역 목록의 공용 캐시 |
| `enjoytrip_visits` | `[{ownerId, source, sourceId, title, regionCode, regionName, visitedAt, addr1, imageUrl, createdAt}]` |

HotPlace의 `address`·`photo`·`touristPlace`는 선택적 확장 필드입니다. 이전 레코드에 없어도 읽을 수 있으며, 기존 사진 URL·ID·소유자를 유지합니다. `photo`는 압축된 로컬 이미지, `touristPlace`는 연결한 TourAPI 장소의 제한된 스냅샷입니다. 새 필드 때문에 기존 자료를 일괄 변환하거나 덮어쓰지 않습니다.

`places`에는 `contentid`, `title`, `addr1`, `contenttypeid`, `mapx`, `mapy`, `firstimage`, `lDongRegnCd`, `lDongSignguCd`를 저장합니다. 방문의 `source`는 `tour` 또는 `hotplace`, `sourceId`는 관광지 `contentid` 또는 HotPlace ID이며, `visitedAt`은 사용자가 확인한 방문일(`YYYY-MM-DD`)입니다. 저장소가 손상되었거나 공간이 부족하면 오류를 안내하고, 손상된 데이터를 빈 배열로 덮어쓰지 않습니다. 브라우저·호스트·포트가 다르면 별도의 저장소입니다.

## 수정·추가한 파일과 보존한 코드

이번 원석 통합에서 변경한 앱 코드는 다음과 같습니다.

| 상태 | 영역 | 파일 |
| --- | --- | --- |
| 수정 | Main·공통 테마 | `index.html`, `assets/css/style.css`, `assets/css/memories.css`, `js/pages/home.js`, `js/ui/navbar.js` |
| 추가 | 원석 SVG | `assets/images/favicon.svg`, `globe.svg`, `plane.svg`, `city.svg` |
| 수정 | MyPage·개인 백업 | `mypage.html`, `js/pages/mypage.js` |
| 수정 | HotPlace | `hotplace.html`, `js/pages/hotplace.js`, `js/services/hotplace-service.js` |
| 추가 | HotPlace UI·사진 처리 | `assets/css/hotplace.css`, `js/ui/hotplace-photo.js` |
| 수정 | 키워드 검색 | `trip.html`, `js/pages/trip.js`, `js/api/tour-api.js` |
| 수정 | 지도·여권 테마 | `js/map/kakao-map.js`, `assets/css/passport.css` |
| 추가 | 유형 마커 | `js/map/marker-categories.js` |
| 추가 | 통합 검사 | `tests/markers.test.mjs`, `hotplace-port.test.mjs`, `integration-browser.test.mjs`, `hotplace-browser.test.mjs` |
| 수정 | 기존 검사·실행·문서 | `tests/browser.test.mjs`, `features-browser.test.mjs`, `live-browser.test.mjs`, `fixtures/kakao-sdk.js`, `package.json`, `README.md`, `START_HERE.txt` |
| 생성·갱신 | 실제 화면 | `screenshots/*-final.png` 15개 및 회귀 검사 캡처 |

**보존한 기능 코드:** `plan.html`·`js/pages/plan.js`, `passport.html`·`js/pages/passport.js`, 기존 회원·저장소·계획·지역·방문 서비스는 이번 통합에서 다시 작성하지 않았습니다. 공통 회원 모달·방문 UI·Travel Mood도 기존 동작을 사용합니다. 여권에서는 `assets/css/passport.css`의 색상만 공통 테마에 맞췄습니다. 기존 `tests/services.test.mjs`, `tests/visits.test.mjs`도 유지해 회귀를 확인합니다.

이전 사진 Hero의 DOM·CSS, floating-note·discovery-strip 잔여 규칙, 중복된 검색 필터 폭 규칙을 정리했습니다. 공통 스타일을 통째로 덧붙여 두 테마를 동시에 유지하지 않았습니다. 새 HotPlace 스타일은 해당 페이지 범위로 분리했습니다. 계획·여권·회원·저장소는 다시 만들지 않고 현재 공통 모듈을 재사용합니다.

지도에서는 사용처가 없는 이전 `setPickerLocation`·`clearPickerLocation`·`onMapClick` export와 전용 전역 마커를 제거했습니다. 현재 HotPlace의 독립적인 지도 선택기는 유지하며, `renderMarkers`는 `updateMap` 별칭으로 호환성을 유지합니다.

`js/config.js`의 기존 개인 키는 변경하거나 문서·로그·스크린샷에 복사하지 않습니다. 참고자료·공식 PDF·원석 원본 체크아웃도 수정하지 않습니다. `.git` 없는 현재 작업 폴더에서는 Git 변경 목록 대신 실제 파일과 실행 결과를 확인했습니다.

## 테스트 실행

Node.js 20.19 이상(검증 환경: Node.js 24.21.0), Python 3가 필요합니다. 사이트 실행 자체에는 npm 설치가 필요하지 않습니다.

```bash
npm ci
npx playwright install chromium
npm test
npm run test:browser
npm run test:features
npm run test:integration
npm run test:hotplace
```

- `npm test`: 기존 회원·계획·방문 서비스와 유형 마커·사진·HotPlace 호환성 검증.
- `npm run test:browser`: 기존 화면과 검색·지도·회원·계획·HotPlace·로딩 UX 회귀 검사. 테스트 서버는 `127.0.0.1:4175`에서 시작해 종료 시 정리합니다.
- `npm run test:features`: 무드 → 일정 → 명시적 방문 → 여권 흐름, 초기화·중복·취소·계정 격리·반응형 검사. 테스트 서버는 `127.0.0.1:4176`을 사용합니다.
- `npm run test:integration`: 키워드·기존 필터 조합, 완전한 키워드 거리 계산, 유형 핀·선택·범례 등 통합 회귀 검사. 기본 서버는 `127.0.0.1:4177`입니다.
- `npm run test:hotplace`: 등록/수정 모달·관광지 연결·사진·CRUD·회원 격리와 MyPage 통계·개인 백업 검사. 기본 서버는 `127.0.0.1:4178`입니다.

실연동 검사를 제외한 브라우저 회귀는 모의 TourAPI·Kakao SDK로 실패 응답과 경계 조건까지 재현합니다. 테스트 키는 요청 가로채기에서만 주입하고 개인 `js/config.js`는 덮어쓰지 않습니다. 기존 서버를 쓰려면 각각 `TEST_BASE_URL`, `FEATURE_BASE_URL`, `INTEGRATION_BASE_URL`, `HOTPLACE_BASE_URL`을 설정할 수 있습니다. 브라우저 검사는 순서대로 실행하는 편이 화면 캡처의 자원 경쟁을 줄입니다.

**실제 연동 검사**는 기존 개인 키·승인된 API·Kakao 허용 도메인이 필요합니다. `http://localhost:5500` 서버를 먼저 실행한 뒤:

```bash
LIVE_BASE_URL=http://localhost:5500 npm run test:live
```

이 검사는 실제 TourAPI와 Kakao SDK·타일을 요청합니다. `localhost`와 `127.0.0.1`, 포트 변경은 서로 다른 도메인 설정과 저장소로 취급합니다. 이번 환경의 `localhost:8000` 지도 실패는 미등록 도메인 차이였으며, 등록된 `localhost:5500`에서 검증했습니다.

Linux에서 브라우저 시스템 라이브러리가 없다면 환경에 맞게 Playwright 의존성을 설치해야 합니다(`npx playwright install-deps chromium`). 이번 작업 환경은 관리자 설치 없이 `/tmp/enjoytrip-runtime`에 의존 라이브러리와 한글 폰트를 보관했습니다. 해당 경로가 남아 있는 동일 환경에서는:

```bash
export LD_LIBRARY_PATH=/tmp/enjoytrip-runtime/usr/lib/x86_64-linux-gnu
export FONTCONFIG_FILE=/tmp/enjoytrip-fonts.conf
export PLAYWRIGHT_BROWSERS_PATH=/tmp/enjoytrip-browsers
npm test
npm run test:browser
npm run test:features
npm run test:integration
npm run test:hotplace
LIVE_BASE_URL=http://localhost:5500 npm run test:live
```

### 검증 기록

2026-10-02 원석 통합 전 기준선은 서비스 **27**, 기존 브라우저 **20**, 무드·여권 **12**, 실제 API·Kakao **11**개 PASS였습니다. 첫 병렬 회귀에서 스크롤 위치 검사 1건이 간헐적으로 실패했으나 단독 실행 20개는 통과했습니다. 캡처·스크롤 검사 전에 `document.fonts.ready`를 기다리도록 테스트를 보완했습니다.

최종 통합 회귀는 아래 명령을 모두 다시 실행해 통과했습니다. 이전 작업의 16/20/9 결과는 그보다 앞선 재개 시점 기록이며, 현재 통합 전 기준선과 구분합니다.

| 검사 | 원석 통합 전 기준선 | 최종 통합 결과 |
| --- | --- | --- |
| 서비스 `npm test` | 27 PASS | **39 / 39 PASS** |
| 기존 브라우저 `npm run test:browser` | 20 PASS | **20 / 20 PASS** |
| 무드·여권 `npm run test:features` | 12 PASS | **12 / 12 PASS** |
| 통합 기능 `npm run test:integration` | 신규 | **16 / 16 PASS** |
| HotPlace `npm run test:hotplace` | 신규 | **11 / 11 PASS** |
| 실제 API·지도 `npm run test:live` | 11 PASS | **13 / 13 PASS** |

통합 검사는 원래 동작하던 회원·계획·방문·여권을 포함해 키워드 A/C/D/E, 상세 필터·Mood 조합, 페이지 이동, 유형 마커·범례·선택·초기화, 개인 백업과 HotPlace 모달·사진·관광지 연결을 다룹니다. 실제 검사에서는 TourAPI·Kakao 요청을 가로채지 않습니다.

실제 연동 13개에서는 기존 무드·방문·여권 흐름에 더해 키워드·지역·관광 유형·정렬 조합과 HotPlace 관광지 선택·주소 검색·Kakao 지도 연결을 검증했습니다. 해당 실행의 **runtimeErrors = 0, consoleErrors = 0, failedRequests = 0**입니다. MyPage 통계와 본인 데이터만 포함하는 백업·암호 정보 제외 검사는 `test:hotplace`의 09번 시나리오입니다.

화면도 실제 렌더링으로 확인했습니다. Desktop의 Home·Trip·검색 결과·지도·계획·여권·HotPlace·로그인·MyPage와 Mobile의 Home·Trip·지도·여권을 검수했고, 지정한 반응형 폭에서 가로 넘침을 검사했습니다.

선택한 정보창을 연 상태에서 실제 Kakao SDK의 화면 폭을 1,440 → 390 → 768 → 1,440px로 바꾸어 가로·세로 모두 지도 안에 유지되는지 확인했습니다. 가로 넘침과 런타임 오류는 0건이었으며, 실제 연동 검사에도 정보창 경계 검증(`resizedInfoWindowVisible`)을 추가했습니다. 이 수정 뒤 전체 회귀와 실제 연동 13개를 다시 실행해 통과했습니다.

결과 파일은 `test-results/` 아래 `services-results.txt`, `browser-results.json`, `features-browser-results.json`, `integration-browser-results.json`, `hotplace-results.json`, `live-results.json`입니다. `failedRequests`는 조건 변경·페이지 이동에 따른 의도적인 `net::ERR_ABORTED`를 제외합니다. **모의 응답 회귀와 실제 외부 API 결과를 구분합니다.** 인증·허용 도메인·한도·응답 지연은 로컬 앱 오류와 별도로 확인합니다.

### 최종 실행 화면

아래 15개 이미지는 실제 통합 검증에서 저장한 최신 화면입니다. 관광지와 지도는 실제 TourAPI·Kakao 응답이며, 캡처 속 회원·방문 기록·여행계획·HotPlace는 격리된 QA 브라우저에서 만든 검증용 예시입니다. 일반 사용자에게 미리 채워 넣는 데이터가 아닙니다.

| 화면 | 캡처 |
| --- | --- |
| 홈 · Travel Mood | [Home Desktop](screenshots/home-final.png) |
| 여행지 검색 | [Trip Desktop](screenshots/trip-final.png) |
| 검색 결과 · Kakao Map | [Trip + Map](screenshots/trip-map-final.png) |
| 키워드 검색 · 유형 핀 | [Keyword Search](screenshots/trip-keyword-final.png) |
| 여행 여권 · 지역 스탬프 | [Passport](screenshots/passport-final.png) |
| 여행계획 · 번호 경로 | [Plan](screenshots/plan-final.png) |
| 나만의 발견 · HotPlace | [HotPlace](screenshots/hotplace-final.png) |
| HotPlace 등록 상단 · 관광지 연결 | [HotPlace Editor](screenshots/hotplace-editor-final.png) |
| HotPlace 등록 하단 · 사진 입력 | [HotPlace Photo](screenshots/hotplace-photo-final.png) |
| HotPlace 이야기 | [HotPlace Detail](screenshots/hotplace-detail-final.png) |
| 로그인 모달 | [Login](screenshots/login-final.png) |
| 마이페이지 | [MyPage](screenshots/mypage-final.png) |
| 모바일 홈 | [Mobile Home](screenshots/mobile-home-final.png) |
| 모바일 검색 · 지도 | [Mobile Trip](screenshots/mobile-trip-final.png) |
| 모바일 여행 여권 | [Mobile Passport](screenshots/mobile-passport-final.png) |

`*-mock.png`는 모의 API 회귀 검사의 별도 캡처이며 실제 지도 검증 증거가 아닙니다.

## 범위와 남은 확인

- Frontend-only이므로 회원·여행계획·방문 기록은 현재 브라우저 저장소에 남습니다. 다른 기기 동기화나 사용자 간 공유, 이메일 인증·서버 세션은 제공하지 않습니다.
- 여행 경로와 키워드 거리 비교는 좌표의 직선 거리를 사용하며 실제 도로 길찾기가 아닙니다. 검색어+거리순은 완전 조회할 수 있는 1,000곳 이하로 제한합니다.
- 뉴스 크롤링과 DB 저장(F106), 공지사항(F109), 공유 게시판(F110)은 이번 범위에 포함하지 않았습니다. 무드·여권 기능으로 해당 심화 요구를 대체했다고 주장하지 않습니다.
- Chromium과 지정한 화면 폭을 검증합니다. Safari·Firefox와 실제 휴대기기 터치·위치 권한 동작은 별도 확인 대상입니다.
- 지역·행사·사진은 외부 API의 현재 응답에 따릅니다. 실제 API 장애나 사진 누락은 안내·placeholder로 처리하며 가짜 관광지로 대체하지 않습니다.
