# EnjoyTrip 구현 지시서

현재 디렉터리는 SSAFY EnjoyTrip Web(Front) 프로젝트의 스타터 구조다.

공식 명세:
- `docs/enjoytrip_spec.pdf`

가장 먼저 해야 할 일:
1. 공식 명세 PDF를 읽는다.
2. 현재 프로젝트 전체 구조와 각 파일을 분석한다.
3. 기존 스타터 코드를 최대한 활용한다.
4. HTML5 + CSS3 + Vanilla JavaScript + Bootstrap 기반으로 구현한다.
5. React/Vue/TypeScript/Next.js 등으로 전환하지 않는다.

---

## 구현 우선순위

### 1순위: 필수 관광 기능
- F101 지역별 관광지 정보 조회
- F102 관광지 / 숙박 / 음식점 조회
- F103 문화시설 / 공연 / 여행코스 / 쇼핑 조회
- TourAPI 연동
- 시도/구군 선택
- 관광 유형 선택
- Kakao Map 마커 표시
- 검색 결과 카드 표시
- 카드 클릭과 지도 마커 연동

### 2순위: 필수 회원 기능
- F107 회원가입 / 수정 / 조회 / 탈퇴
- F108 로그인 / 로그아웃 / 비밀번호 찾기
- Backend가 없으므로 LocalStorage 기반으로 구현

### 3순위: 추가 기능
- F104 여행계획
- 관광지를 일정에 추가
- LocalStorage 저장
- 순서 변경
- 가능하면 지도 Polyline 연동

### 4순위: 추가 기능
- F105 HotPlace 등록
- 사용자 장소 등록
- 지도 위치 선택
- LocalStorage 저장

심화 기능(F106 뉴스, F109/F110 게시판)은 위 기능이 안정적으로 끝난 뒤에만 고려한다.

---

## 기술 제한

사용:
- HTML5
- CSS3
- Vanilla JavaScript
- Bootstrap 5
- ES Modules
- Fetch API
- LocalStorage / SessionStorage
- Kakao Maps JavaScript API
- 한국관광공사 TourAPI

사용하지 않음:
- React
- Vue
- Angular
- TypeScript
- Node 백엔드
- Spring 백엔드
- 불필요한 npm 패키지

---

## 파일 구조 원칙

현재 폴더 구조를 우선 유지한다.

주요 책임:
- `js/api/tour-api.js`: TourAPI 호출
- `js/map/kakao-map.js`: Kakao Map 초기화/마커/인포윈도우
- `js/services/storage-service.js`: localStorage 공통 처리
- `js/services/auth-service.js`: 회원가입/로그인/회원관리
- `js/services/plan-service.js`: 여행계획 저장/조회
- `js/ui/navbar.js`: 로그인 상태에 따른 Navbar 갱신
- `js/ui/toast.js`: 사용자 알림
- `js/pages/*.js`: 각 페이지 DOM 이벤트와 렌더링

기존 파일을 통째로 갈아엎지 말고, 필요한 부분부터 구현한다.

---

## 관광 정보 조회

검색 조건:
- 시/도
- 구/군
- 관광 유형
- 정렬

지원 관광 유형:
- 관광지 12
- 문화시설 14
- 축제/공연/행사 15
- 여행코스 25
- 레포츠 28
- 숙박 32
- 쇼핑 38
- 음식점 39

contentTypeId는 상수 객체로 관리한다.

정렬:
- 제목순
- 수정일순
- 등록일순
- 거리순

TourAPI 실제 명세와 응답을 확인하고 파라미터를 맞춘다.
거리순은 mapX/mapY가 필요한지 반드시 확인한다.

검색 결과 카드:
- 이미지
- 관광지명
- 주소
- 유형
- 상세보기 또는 지도 이동 버튼
- 여행계획 추가 버튼

이미지가 없으면 placeholder UI를 사용한다.

---

## Kakao Map

필수:
- 지도 초기화
- 관광지마다 마커 생성
- 검색할 때 기존 마커 제거
- marker 배열 관리
- 마커 클릭 시 관광지 정보 표시
- 리스트 클릭 시 해당 마커 위치로 지도 이동
- 여러 결과가 있으면 bounds를 이용해 모두 화면에 들어오도록 조정

가능하면:
- 대표 이미지가 포함된 인포윈도우
- 선택 마커 강조
- 여행계획 경로 Polyline

---

## 회원 기능

LocalStorage 기반.

회원 예시:
```js
{
  id,
  password,
  name,
  email
}
```

Validation:
- 아이디 필수
- 아이디 중복 금지
- 비밀번호 최소 길이
- 비밀번호 확인 일치
- 이름 필수
- 이메일 형식 확인

로그인:
- id/password 확인
- 로그인 상태 저장
- 페이지 새로고침 후 로그인 유지
- Navbar 갱신

마이페이지:
- 회원정보 조회
- 이름/이메일/비밀번호 수정
- 회원 탈퇴

비밀번호 찾기:
- 아이디 + 이메일 확인
- 기존 비밀번호 노출 금지
- 일치하면 새 비밀번호 설정 UI 제공

---

## 여행계획

`plan.html`에 구현.

최소 데이터:
- 여행 제목
- 여행 날짜
- 관광지 목록

기능:
- 검색 결과에서 관광지 추가
- 저장
- 삭제
- 순서 변경

가능하면:
- HTML5 Drag & Drop
- 지도 경로 표시

---

## HotPlace

`hotplace.html`에 구현.

입력:
- 장소명
- 날짜
- 장소유형
- 설명
- 이미지 URL 또는 미리보기
- 지도 위치

Backend 없이 LocalStorage 저장.

---

## UI/UX

Bootstrap 기반 반응형.

디자인:
- 흰색 중심
- 여행 서비스 느낌
- 넉넉한 여백
- 카드 UI
- 모바일 대응
- 과한 애니메이션 금지
- 오래된 예제 사이트처럼 보이지 않게 개선

Navbar:
- EnjoyTrip
- 여행지
- 여행계획
- HotPlace
- 로그인/회원가입 또는 사용자명/마이페이지/로그아웃

Hero:
- "어디로 떠나볼까요?"

검색:
- 시/도
- 구/군
- 관광 유형
- 정렬
- 검색 버튼

접근성:
- img alt
- form label
- button type
- semantic HTML

---

## API Key

`js/config.example.js`를 참고해 `js/config.js` 사용.

실제 키는 Git에 올리지 않는다.

Kakao:
- JavaScript Key 사용
- 허용 도메인 설정 확인

TourAPI:
- serviceKey 인코딩/이중 인코딩 문제 확인
- API 응답 구조에 맞게 안전하게 파싱

---

## 테스트

최소 시나리오:
1. index 로딩
2. Navbar 동작
3. trip 페이지 Kakao 지도 표시
4. 시/도 선택
5. 구/군 선택
6. 관광 유형 선택
7. 검색
8. 관광지 카드 출력
9. 마커 출력
10. 카드 클릭 → 지도 이동
11. 재검색 → 기존 마커 제거
12. 회원가입
13. 중복 아이디 차단
14. 로그인 실패
15. 로그인 성공
16. 새로고침 로그인 유지
17. 마이페이지
18. 회원정보 수정
19. 로그아웃
20. 비밀번호 재설정
21. 회원 탈퇴
22. 모바일 레이아웃 확인

가능한 것은 직접 실행해서 검증하고,
문제를 발견하면 보고만 하지 말고 수정한다.

---

## 완료 후 보고 형식

1. 기존 구조 요약
2. 새로 구현한 기능
3. 수정한 파일 목록
4. TourAPI 동작 구조
5. Kakao Map 동작 구조
6. LocalStorage 데이터 구조
7. 테스트 결과
8. 남은 TODO
9. 직접 브라우저에서 확인할 항목
10. 실행 방법

"구현했습니다"라고만 하지 말고 실제 파일을 수정하고 검증한다.
