import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4175';
const server = process.env.TEST_BASE_URL ? null : spawn('python3', ['-m', 'http.server', '4175', '--bind', '127.0.0.1'], { stdio: 'ignore' });
let browser;
const results = [];
let page;
async function check(name, action) {
  try { await action(); results.push({ name, status: 'passed' }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: 'failed', message: error.message }); throw error; }
}
const assertVisible = async (selector) => { await page.locator(selector).first().waitFor({ state: 'visible' }); };
async function closeModal(id) {
  await page.locator(`#${id} .btn-close`).click();
  await page.locator(`#${id}`).waitFor({ state: 'hidden' });
}
const envelope = (items, totalCount = Array.isArray(items) ? items.length : items ? 1 : 0) => ({ response: { header: { resultCode: '0000', resultMsg: 'OK' }, body: { items: items === '' ? '' : { item: items }, totalCount } } });
const tours = Array.from({ length: 13 }, (_, i) => ({
  contentid: String(i + 1), title: ['경복궁 (테스트)', '북촌 (테스트)', '주소 변환 여행지 (테스트)', '좌표 없는 여행지 (테스트)'][i] || `여행지 ${i + 1} (테스트)`,
  addr1: i === 2 ? '서울 주소 변환 성공' : i === 3 ? '변환 불가 주소' : '서울특별시 종로구',
  contenttypeid: '12', firstimage: '', mapx: i === 2 || i === 3 ? '' : String(126.97 + i * .001), mapy: i === 2 || i === 3 ? '' : String(37.57 + i * .001), dist: String(100 + i * 150),
}));
let mode = 'normal';
let listDelay = 0;
const requests = [];
const pageErrors = [];
const badAssets = [];
async function screenshot(path, fullPage = true) {
  // Settle font metrics before calculating scroll positions (parallel CI can
  // otherwise load the font between two scroll steps and skip a section).
  await page.evaluate(() => document.fonts.ready);
  // Reveal below-the-fold sections just as a visitor scrolling the page would.
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * .8) {
      window.scrollTo({ top: y, behavior: 'instant' }); await new Promise((resolve) => setTimeout(resolve, 80));
    }
  });
  await page.evaluate(() => {
    document.activeElement?.blur();
    document.querySelectorAll('.app-toast').forEach((element) => element.remove());
    document.getElementById('tourList')?.scrollTo({ top: 0, behavior: 'instant' });
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.evaluate(() => document.fonts.ready);
  await delay(120);
  await page.screenshot({ path, fullPage, animations: 'disabled' });
}
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await delay(50); }
  await mkdir('screenshots', { recursive: true });
  await mkdir('test-results', { recursive: true });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR', geolocation: { latitude: 37.5665, longitude: 126.978 }, permissions: ['geolocation'] });
  // Missing-key behavior stays deterministic even when the developer has real keys.
  const emptyConfig = (route) => route.fulfill({ contentType: 'text/javascript', body: 'export const CONFIG = { TOUR_API_SERVICE_KEY: "", KAKAO_JAVASCRIPT_KEY: "" };' });
  await context.route('**/js/config.js', emptyConfig);
  page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => { if (response.url().startsWith(base) && response.status() >= 400 && !response.url().endsWith('favicon.ico')) badAssets.push(new URL(response.url()).pathname); });
  page.on('dialog', (dialog) => dialog.accept());

  await check('01 기본 설정: 홈·5개 페이지·API 키 누락 안내·모바일 메뉴', async () => {
    await page.goto(base);
    await assertVisible('#authNav button');
    assert.match(await page.locator('h1').innerText(), /어디로/);
    await screenshot('screenshots/home.png');
    assert.equal(await page.locator('.reveal-pending').count(), 0, 'scroll reveals every home section');
    for (const path of ['trip.html', 'plan.html', 'hotplace.html', 'mypage.html']) {
      await page.goto(`${base}/${path}`); await assertVisible('#authNav button');
      if (path !== 'mypage.html') await assertVisible('.map-unavailable');
      assert.equal(await page.locator('#loginModal').count(), 1);
    }
    await page.goto(base);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.navbar-toggler').click();
    await assertVisible('#mainNavbar.show');
    await page.locator('.navbar-toggler').click();
    await page.locator('#mainNavbar').waitFor({ state: 'hidden' });
    await screenshot('screenshots/home-mobile.png');
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await check('02 회원가입 확인 불일치·성공·중복 아이디 차단', async () => {
    await page.locator('#authNav [data-bs-target="#registerModal"]').click();
    await page.fill('#registerId', 'tester'); await page.fill('#registerPassword', 'password123');
    await page.fill('#registerPasswordConfirm', 'different123'); await page.fill('#registerName', '테스트 여행자'); await page.fill('#registerEmail', 'tester@example.com');
    await page.locator('#registerForm [type="submit"]').click();
    await assertVisible('#registerForm .form-error:not(.d-none)');
    assert.match(await page.locator('#registerForm .form-error').innerText(), /일치/);
    await page.fill('#registerPasswordConfirm', 'password123');
    await page.locator('#registerForm [type="submit"]').click();
    await page.locator('#registerModal').waitFor({ state: 'hidden' });
    await page.locator('#authNav [data-bs-target="#registerModal"]').click();
    for (const [id, value] of Object.entries({ registerId: 'tester', registerPassword: 'password123', registerPasswordConfirm: 'password123', registerName: '중복', registerEmail: 'tester@example.com' })) await page.fill(`#${id}`, value);
    await page.locator('#registerForm [type="submit"]').click();
    await assertVisible('#registerForm .form-error:not(.d-none)');
    assert.match(await page.locator('#registerForm .form-error').innerText(), /이미 사용/);
    await closeModal('registerModal');
    assert.equal(await page.evaluate(() => localStorage.getItem('enjoytrip_users').includes('password123')), false);
  });
  await check('03 로그인 실패·성공·새로고침 유지', async () => {
    await page.locator('#authNav [data-bs-target="#loginModal"]').click();
    await screenshot('screenshots/login-modal.png', false);
    await page.fill('#loginId', 'tester'); await page.fill('#loginPassword', 'incorrect');
    await page.locator('#loginForm [type="submit"]').click();
    await assertVisible('#loginForm .form-error:not(.d-none)');
    await page.fill('#loginPassword', 'password123'); await page.locator('#loginForm [type="submit"]').click();
    await page.locator('#loginModal').waitFor({ state: 'hidden' });
    await page.reload(); await assertVisible('#logoutBtn');
    assert.match(await page.locator('#authNav').innerText(), /테스트 여행자/);
  });
  await check('04 회원 조회·정보 및 비밀번호 수정', async () => {
    await page.goto(`${base}/mypage.html`); await assertVisible('#profileCard');
    assert.equal(await page.inputValue('#profileId'), 'tester');
    await page.fill('#profileName', '수정한 여행자'); await page.fill('#profileEmail', 'changed@example.com');
    await page.fill('#profileCurrentPassword', 'password123'); await page.fill('#profilePassword', 'changed123'); await page.fill('#profilePasswordConfirm', 'changed123');
    await page.locator('#profileForm [type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('#authNav').textContent.includes('수정한 여행자'));
    await page.reload(); assert.equal(await page.inputValue('#profileEmail'), 'changed@example.com');
  });

  // Only test routes receive synthetic keys. The real js/config.js is never changed.
  await context.unroute('**/js/config.js', emptyConfig);
  await context.route('**/js/config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export const CONFIG = { TOUR_API_SERVICE_KEY: "test%2Bkey%2Fvalue%3D", KAKAO_JAVASCRIPT_KEY: "test-kakao-key" };' }));
  const sdk = await readFile('tests/fixtures/kakao-sdk.js', 'utf8');
  await context.route('https://dapi.kakao.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: sdk }));
  await context.route('https://apis.data.go.kr/**', async (route) => {
    const url = new URL(route.request().url());
    const params = Object.fromEntries(url.searchParams); const path = url.pathname.split('/').pop();
    // Keep captured assertions free of even synthetic key strings.
    assert.equal(params.serviceKey, 'test+key/value='); delete params.serviceKey;
    requests.push({ path, params });
    let payload;
    if (path === 'ldongCode2') {
      if (params.lDongRegnCd === '11') { await delay(30); payload = envelope([{ code: '110', name: '종로구' }, { code: '140', name: '중구' }]); }
      else if (params.lDongRegnCd) payload = envelope([{ code: '260', name: '부산 구군' }]);
      else payload = envelope([{ code: '11', name: '서울특별시' }, { code: '26', name: '부산광역시' }]);
    } else if (path === 'lclsSystmCode2') {
      payload = envelope(params.lclsSystm2 ? [{ code: 'NA010100', name: '자연 명소' }] : params.lclsSystm1 ? [{ code: 'NA01', name: '자연 관광' }] : [{ code: 'NA', name: '자연' }, { code: 'CU', name: '문화' }]);
    } else if (path === 'detailCommon2') {
      payload = envelope({ ...tours[0], overview: '테스트 상세 설명<br>두 번째 줄<script>window.__xss=true</script>', tel: '02-0000-0000' });
    } else {
      if (listDelay) await delay(listDelay);
      if (mode === 'xml') { await route.fulfill({ contentType: 'text/xml', body: '<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>' }); return; }
      if (mode === 'http') { await route.fulfill({ status: 503, body: 'Unavailable' }); return; }
      if (mode === 'api-error') payload = { response: { header: { resultCode: '22', resultMsg: 'LIMITED' } } };
      else if (mode === 'empty') payload = envelope('', 0);
      else if (mode === 'single') payload = envelope({ ...tours[0], firstimage: 'javascript:window.__xss=true', title: '<img src=x onerror="window.__xss=true">' }, 1);
      else payload = envelope(tours.slice((Number(params.pageNo) - 1) * 12, Number(params.pageNo) * 12).map((item) => ({ ...item, contenttypeid: params.contentTypeId || item.contenttypeid })), 13);
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
  });
  await check('05 수업 패턴: 초기 분류·지역 조회와 연쇄 Select, 올바른 요청 파라미터', async () => {
    await page.goto(`${base}/trip.html`);
    await page.waitForFunction(() => document.querySelector('#sidoSelect').options.length === 3);
    await page.locator('#classificationFilters summary').click();
    await page.selectOption('#selectClass1', 'NA');
    await page.waitForFunction(() => !document.querySelector('#selectClass2').disabled);
    await page.selectOption('#selectClass2', 'NA01');
    await page.waitForFunction(() => !document.querySelector('#selectClass3').disabled);
    await page.selectOption('#selectClass3', 'NA010100');
    await page.selectOption('#sidoSelect', '11');
    await page.waitForFunction(() => !document.querySelector('#gugunSelect').disabled);
    await page.selectOption('#gugunSelect', '110'); await page.selectOption('#contentTypeSelect', '12');
    await page.click('#searchButton'); await page.waitForFunction(() => document.querySelectorAll('.tour-card').length === 12 && !document.querySelector('#searchButton').disabled);
    const request = requests.filter(x => x.path === 'areaBasedList2').at(-1);
    for (const [key, value] of Object.entries({ lDongRegnCd: '11', lDongSignguCd: '110', lclsSystm1: 'NA', lclsSystm2: 'NA01', lclsSystm3: 'NA010100', contentTypeId: '12', arrange: 'A' })) assert.equal(request.params[key], value);
    assert.equal(request.params.areaCode, undefined);
    assert.equal(await page.evaluate(() => window.__mapTest.markers.filter(x => x.map).length), 11);
    assert.equal(await page.evaluate(() => window.__mapTest.bounds.at(-1)), 11);
    assert.ok(await page.evaluate(() => window.__mapTest.geocodes.includes('서울 주소 변환 성공')));
    await screenshot('screenshots/trip-mock.png');
  });
  await check('06 카드→마커·마커→카드 선택, 상세보기 안전한 렌더링', async () => {
    await page.locator('.tour-card').first().locator('.place-media').click();
    await assertVisible('.mock-info');
    assert.equal(await page.locator('.tour-card.is-selected').getAttribute('data-id'), '1');
    await page.evaluate(() => window.kakao.maps.event.trigger(window.__mapTest.markers.filter(x => x.map)[1], 'click'));
    assert.equal(await page.locator('.tour-card.is-selected').getAttribute('data-id'), '2');
    await page.locator('.tour-card').first().locator('.js-detail').click();
    await page.waitForFunction(() => document.querySelector('#detailBody').textContent.includes('테스트 상세 설명'));
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    await closeModal('detailModal');
  });
  await check('07 페이지 이동과 재검색 시 기존 마커·인포윈도우 제거', async () => {
    await page.click('#nextPage');
    await page.waitForFunction(() => document.querySelectorAll('.tour-card').length === 1 && !document.querySelector('#searchButton').disabled);
    assert.equal(await page.evaluate(() => window.__mapTest.markers.filter(x => x.map).length), 1);
    assert.equal(await page.locator('.mock-info').count(), 0);
    await page.click('#prevPage');
    await page.waitForFunction(() => document.querySelectorAll('.tour-card').length === 12 && !document.querySelector('#searchButton').disabled);
  });
  await check('08 여행지 담기·중복 차단·주소 변환 좌표 보존', async () => {
    await page.locator('.tour-card').nth(0).locator('.js-add-plan').click();
    await page.locator('.tour-card').nth(0).locator('.js-add-plan').click();
    assert.match(await page.locator('.app-toast').innerText(), /이미/);
    await page.locator('.tour-card').nth(1).locator('.js-add-plan').click();
    await page.locator('.tour-card').nth(2).locator('.js-add-plan').click();
    const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('enjoytrip_plan_drafts'))[0]);
    assert.equal(draft.places.length, 3); assert.equal(draft.places[2].mapx, '126.985');
  });
  await check('09 모든 관광 유형 및 수정일·등록일·거리순 검색', async () => {
    for (const value of ['12', '14', '15', '25', '28', '32', '38', '39']) {
      await page.selectOption('#contentTypeSelect', value); await page.click('#searchButton');
      await page.waitForFunction(() => document.querySelectorAll('.tour-card').length === 12 && !document.querySelector('#searchButton').disabled);
      assert.equal(requests.filter(x => x.path === 'areaBasedList2').at(-1).params.contentTypeId, value);
    }
    for (const value of ['C', 'D']) {
      await page.selectOption('#arrangeSelect', value); await page.click('#searchButton');
      await page.waitForFunction(() => !document.querySelector('#searchButton').disabled);
      assert.equal(requests.filter(x => x.path === 'areaBasedList2').at(-1).params.arrange, value);
    }
    await page.selectOption('#arrangeSelect', 'E'); await page.click('#useLocationBtn');
    await page.waitForFunction(() => document.querySelector('#distanceOrigin').value === 'current');
    await page.selectOption('#searchRadius', '20000'); await page.click('#searchButton');
    await page.waitForFunction(() => document.querySelectorAll('.tour-card').length === 12 && !document.querySelector('#searchButton').disabled);
    const req = requests.filter(x => x.path === 'locationBasedList2').at(-1);
    assert.equal(req.params.mapX, '126.978'); assert.equal(req.params.mapY, '37.5665'); assert.equal(req.params.radius, '20000'); assert.equal(req.params.arrange, 'E');
  });
  await check('10 상위 선택 변경 시 하위 분류·구군 초기화', async () => {
    await page.selectOption('#selectClass1', 'CU');
    assert.equal(await page.inputValue('#selectClass3'), ''); assert.ok(await page.locator('#selectClass3').isDisabled());
    await page.selectOption('#sidoSelect', '26'); await page.selectOption('#sidoSelect', '11');
    await page.waitForFunction(() => document.querySelector('#gugunSelect').options[1]?.textContent === '종로구');
    assert.equal(await page.inputValue('#gugunSelect'), '');
  });
  await check('11 빈 결과·단일 객체 응답·HTML 주입 방어·API/XML/HTTP 오류와 복구', async () => {
    mode = 'empty'; await page.click('#searchButton');
    await page.waitForFunction(() => document.querySelector('#tourList').textContent.includes('검색 결과가 없어요'));
    assert.equal(await page.evaluate(() => window.__mapTest.markers.filter(x => x.map).length), 0);
    mode = 'single'; await page.click('#searchButton');
    await page.waitForFunction(() => document.querySelectorAll('.tour-card').length === 1 && !document.querySelector('#searchButton').disabled);
    assert.equal(await page.locator('.tour-card img').count(), 0); assert.equal(await page.evaluate(() => window.__xss), undefined);
    for (const value of ['api-error', 'xml', 'http']) {
      mode = value; await page.click('#searchButton');
      await page.waitForFunction(() => document.querySelector('#statusMessage').classList.contains('alert-danger'));
      assert.equal(await page.locator('.tour-card').count(), 0);
    }
    mode = 'normal'; await page.click('#searchButton');
    await page.waitForFunction(() => document.querySelectorAll('.tour-card').length === 12 && !document.querySelector('#searchButton').disabled);
  });
  await check('12 검색 취소·늦은 Geocoder 응답이 새 검색을 덮어쓰지 않음', async () => {
    listDelay = 200; await page.click('#searchButton'); await page.selectOption('#contentTypeSelect', '14');
    await delay(250); assert.equal(await page.locator('.tour-card').count(), 0); listDelay = 0;
    const active = await page.evaluate(async () => {
      const api = await import('./js/map/kakao-map.js');
      window.__mapTest.geoDelay = 120;
      const pending = api.updateMap([{ contentid: 'old', title: 'stale', addr1: '새 주소 변환 성공' }]);
      await api.updateMap([]); await pending;
      window.__mapTest.geoDelay = 10;
      return api.markers.length;
    });
    assert.equal(active, 0);
  });
  await check('13 여행계획: 임시 저장·새로고침·버튼 및 드래그 순서·경로·저장·수정', async () => {
    await page.goto(`${base}/plan.html`); await page.waitForFunction(() => document.querySelectorAll('.itinerary-item').length === 3);
    await page.fill('#planTitle', '서울 하루 여행'); await page.fill('#planDate', '2026-10-10'); await page.fill('#planBudget', '70000'); await page.fill('#planNotes', '오전에는 궁궐, 오후에는 산책');
    await page.reload(); assert.equal(await page.inputValue('#planTitle'), '서울 하루 여행');
    await page.locator('.itinerary-item').first().locator('[data-action="down"]').click();
    assert.equal(await page.locator('.itinerary-item').first().getAttribute('data-id'), '2');
    const grip = page.locator('.itinerary-item').first().locator('.drag-handle');
    const drop = page.locator('.itinerary-item').last().locator('.step-number');
    await grip.scrollIntoViewIfNeeded(); await drop.scrollIntoViewIfNeeded();
    const start = await grip.boundingBox(), end = await drop.boundingBox();
    // Move through the browser's native drag threshold, then onto the drop target.
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 + 10, { steps: 5 });
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 10 });
    await page.mouse.up();
    assert.equal(await page.locator('.itinerary-item').last().getAttribute('data-id'), '2');
    await page.waitForFunction(() => window.__mapTest.routes.some(x => x.map && x.path.length === 3));
    await screenshot('screenshots/plan-mock.png');
    await page.locator('#planForm [type="submit"]').click(); await assertVisible('.saved-plan');
    assert.equal(await page.locator('.itinerary-item').count(), 0);
    await page.locator('.saved-plan [data-action="edit"]').click();
    await page.fill('#planTitle', '수정한 서울 여행'); await page.locator('#planForm [type="submit"]').click();
    assert.equal(await page.locator('.saved-plan').count(), 1); assert.match(await page.locator('.saved-plan').innerText(), /수정한 서울/);
  });
  await check('14 HotPlace: 지도 위치 선택·등록·조회·새로고침·수정·사진 오류 대체', async () => {
    await page.goto(`${base}/hotplace.html`); await page.waitForFunction(() => window.__mapTest?.maps.length);
    await page.click('#newHotplace'); await assertVisible('#hotplaceModal.show');
    await page.waitForFunction(() => window.__mapTest.maps.some(map => map.container.id === 'pickMap'));
    await page.fill('#placeName', '골목 카페'); await page.fill('#visitDate', '2026-01-01'); await page.selectOption('#placeType', '카페'); await page.fill('#placeDescription', '햇살이 좋은 자리');
    await page.evaluate(() => window.kakao.maps.event.trigger(window.__mapTest.maps.find(map => map.container.id === 'pickMap'), 'click', { latLng: new window.kakao.maps.LatLng(37.57, 126.98) }));
    assert.equal(Number(await page.inputValue('#placeLat')), 37.57);
    await page.fill('#placeImage', `${base}/missing-test-photo.jpg`); await page.locator('#placeImage').blur();
    await page.locator('#imagePreview .image-placeholder').waitFor();
    await page.fill('#placeImage', ''); await page.click('#savePlaceBtn'); await assertVisible('.hotplace-card');
    await page.reload(); await assertVisible('.hotplace-card');
    await page.locator('.hotplace-card [data-action="edit"]').click(); await page.fill('#placeName', '다시 찾고 싶은 카페'); await page.click('#savePlaceBtn');
    assert.match(await page.locator('.hotplace-card').innerText(), /다시 찾고/);
    await screenshot('screenshots/hotplace-mock.png');
  });
  await check('15 1920·1440·1024·768·390px / 5개 페이지 가로 넘침·메뉴·폼 확인', async () => {
    for (const width of [1920, 1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['index.html', 'trip.html', 'plan.html', 'hotplace.html', 'mypage.html']) {
        await page.goto(`${base}/${path}`); await page.locator('#authNav a').waitFor({ state: 'attached' });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} ${width}px horizontal overflow`);
      }
    }
    await page.goto(`${base}/trip.html`); await page.waitForFunction(() => document.querySelector('#sidoSelect').options.length === 3);
    await page.selectOption('#sidoSelect', '11'); await page.click('#searchButton');
    await page.waitForFunction(() => document.querySelectorAll('.tour-card').length === 12 && !document.querySelector('#searchButton').disabled);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '390px populated trip overflow');
    await screenshot('screenshots/trip-mobile-mock.png');
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await check('16 로그아웃 시 보호 화면 전환·비밀번호 재설정·새 비밀번호 로그인', async () => {
    await page.goto(`${base}/mypage.html`); await page.click('#logoutBtn'); await assertVisible('#profileLoginNotice');
    await page.locator('#authNav [data-bs-target="#loginModal"]').click();
    await page.locator('#loginModal [data-bs-target="#recoveryModal"]').click(); await assertVisible('#recoveryModal.show');
    await page.fill('#recoveryId', 'tester'); await page.fill('#recoveryEmail', 'wrong@example.com'); await page.click('#recoverySubmit'); await assertVisible('#recoveryForm .form-error:not(.d-none)');
    assert.ok(await page.locator('#recoveryPasswords').isHidden());
    await page.fill('#recoveryEmail', 'changed@example.com'); await page.click('#recoverySubmit'); await assertVisible('#recoveryPasswords');
    await page.fill('#recoveryPassword', 'resetpass123'); await page.fill('#recoveryPasswordConfirm', 'resetpass123'); await page.click('#recoverySubmit');
    await page.locator('#recoveryModal').waitFor({ state: 'hidden' });
    await page.locator('#authNav [data-bs-target="#loginModal"]').click(); await page.fill('#loginId', 'tester'); await page.fill('#loginPassword', 'changed123'); await page.locator('#loginForm [type="submit"]').click(); await assertVisible('#loginForm .form-error:not(.d-none)');
    await page.fill('#loginPassword', 'resetpass123'); await page.locator('#loginForm [type="submit"]').click(); await page.locator('#loginModal').waitFor({ state: 'hidden' }); await assertVisible('#profileCard');
  });
  await check('17 저장된 여행계획·HotPlace 삭제, 회원 탈퇴', async () => {
    await page.goto(`${base}/plan.html`); await page.locator('.saved-plan [data-action="delete"]').click(); assert.equal(await page.locator('.saved-plan').count(), 0);
    await page.goto(`${base}/hotplace.html`); await page.locator('.hotplace-card [data-action="delete"]').click(); assert.equal(await page.locator('.hotplace-card').count(), 0);
    await page.goto(`${base}/mypage.html`); await page.click('#deleteAccountBtn'); await assertVisible('#profileLoginNotice');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('enjoytrip_users')).length), 0);
  });
  await check('18 런타임 오류·누락된 로컬 리소스 없음', async () => {
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(badAssets.filter(path => path !== '/missing-test-photo.jpg'), []);
  });
  await check('19 검색 스켈레톤·지도 로딩·선택·전체 보기·현재 위치 컨트롤', async () => {
    // Force secondary-image selection through the real card rendering path.
    tours[1].firstimage2 = `${base}/secondary-test-photo.webp`;
    await context.route('**/secondary-test-photo.webp', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#e6f1ed"/></svg>' }));
    await page.goto(`${base}/trip.html`);
    await page.waitForFunction(() => document.querySelector('#sidoSelect').options.length === 3);
    await page.selectOption('#sidoSelect', '11'); listDelay = 500;
    await page.click('#searchButton'); await assertVisible('.skeleton-card'); await assertVisible('#mapLoading');
    assert.equal(await page.locator('#tourList').getAttribute('aria-busy'), 'true');
    await page.waitForFunction(() => document.querySelectorAll('.tour-card').length === 12 && !document.querySelector('#searchButton').disabled); listDelay = 0;
    assert.ok(await page.locator('#mapLoading').isHidden());
    assert.ok((await page.locator('.tour-card').nth(1).locator('img').getAttribute('src')).endsWith('secondary-test-photo.webp'));
    await page.locator('.tour-card').first().locator('.place-media').click(); await assertVisible('#mapSelection');
    const boundsBefore = await page.evaluate(() => window.__mapTest.bounds.length);
    await page.click('#fitMarkersBtn'); assert.ok(await page.evaluate(() => window.__mapTest.bounds.length) > boundsBefore);
    await page.click('#mapLocationBtn'); await page.waitForFunction(() => !document.querySelector('#mapLocationBtn').disabled);
    assert.equal(await page.evaluate(() => window.__mapTest.maps[0].center.getLng()), 126.978);
    await page.locator('.tour-card').first().locator('.js-detail').click(); await assertVisible('#detailMapBtn');
    await page.click('#detailMapBtn'); await page.locator('#detailModal').waitFor({ state: 'hidden' });
    await page.locator('.tour-card').first().locator('.js-detail').click(); await page.click('#detailPlanBtn');
    await page.locator('#detailModal').waitFor({ state: 'hidden' }); await assertVisible('#loginModal.show'); await closeModal('loginModal');
  });
  await check('20 이미지 fallback·로딩 종료·모션 접근성', async () => {
    const image = await readFile('assets/images/seoul-gyeongbokgung.webp');
    await context.route('**/test-media.webp', (route) => route.fulfill({ contentType: 'image/webp', body: image }));
    await page.evaluate(async () => {
      const { imageMarkup, enableImageFallbacks } = await import('./js/ui/helpers.js');
      const root = document.createElement('div'); root.id = 'mediaCheck';
      root.innerHTML = imageMarkup('/not-absolute', 'invalid') + imageMarkup(location.origin + '/test-media.webp', '로드 테스트');
      document.body.append(root); enableImageFallbacks(root);
    });
    await page.locator('#mediaCheck img').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('#mediaCheck img')?.complete && !document.querySelector('#mediaCheck .is-loading'));
    assert.equal(await page.locator('#mediaCheck .image-placeholder').count(), 1);
    await page.evaluate(() => document.querySelector('#mediaCheck').remove());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(base); await assertVisible('.hero h1');
    const layers = page.locator('.hero-art .art-layer');
    assert.ok(await layers.count(), 'the current travel collage is present');
    assert.ok(await layers.evaluateAll((nodes) => nodes.every((node) => {
      const style = getComputedStyle(node);
      return style.animationName === 'none' && style.transform === 'none' && style.translate === 'none';
    })), 'every collage layer disables animation and transforms in reduced motion');
    const hero = await page.locator('.hero').boundingBox();
    await page.mouse.move(hero.x + hero.width * .15, hero.y + Math.min(hero.height * .3, 200));
    await page.mouse.move(hero.x + hero.width * .85, hero.y + Math.min(hero.height * .7, 400), { steps: 8 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.deepEqual(await page.locator('.hero-art').evaluate((node) => {
      const style = getComputedStyle(node);
      return [style.getPropertyValue('--travel-x').trim(), style.getPropertyValue('--travel-y').trim()];
    }), ['0px', '0px'], 'pointer movement cannot enable reduced-motion parallax');
    assert.equal(await page.locator('.journey-card').first().evaluate((node) => getComputedStyle(node.parentElement).opacity), '1');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    assert.deepEqual(pageErrors, []);
  });
} catch (error) {
  console.error(error);
  if (page) await page.screenshot({ path: 'test-results/failure.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile('test-results/browser-results.json', JSON.stringify({ externalApis: 'mocked; no real API key used', results }, null, 2));
  await browser?.close(); server?.kill();
}
