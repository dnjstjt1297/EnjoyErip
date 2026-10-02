// Deterministic end-to-end coverage for mood → itinerary → visit → passport.
// All external API traffic is intercepted. The developer's config is never read.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const base = process.env.FEATURE_BASE_URL || 'http://127.0.0.1:4176';
const server = process.env.FEATURE_BASE_URL ? null : spawn('python3', ['-m', 'http.server', '4176', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const results = [], requests = [], runtimeErrors = [], consoleErrors = [], failedRequests = [], missingAssets = [];
const regions = [{ code: '11', name: '서울특별시' }, { code: '26', name: '부산광역시' }, { code: '50', name: '제주특별자치도' }];
const categories = [ ['NA', '자연관광'], ['FD', '음식'], ['VE', '문화관광'], ['LS', '레저스포츠'], ['SH', '쇼핑'], ['EV', '축제공연행사'] ].map(([code, name]) => ({ code, name }));
const fixtures = Array.from({ length: 3 }, (_, index) => ({
  contentid: `feature-${index + 1}`, title: `무드 검증 여행지 ${index + 1}`, addr1: '서울특별시 종로구 테스트로',
  lDongRegnCd: '11', contenttypeid: '12', firstimage: '', firstimage2: '',
  mapx: String(126.97 + index * 0.003), mapy: String(37.57 + index * 0.003),
}));
const envelope = (items) => ({ response: { header: { resultCode: '0000', resultMsg: 'OK' }, body: { items: { item: items }, totalCount: items.length } } });
const clean = (value) => String(value).replace(/https?:\/\/[^\s"')]+/g, (url) => { try { const parsed = new URL(url); return parsed.origin + parsed.pathname; } catch { return '[URL]'; } }).slice(0, 500);
let browser, page, emptyResults = false, listDelay = 0;
const visible = (selector) => page.locator(selector).first().waitFor({ state: 'visible' });
const visitRecords = () => page.evaluate(() => JSON.parse(localStorage.getItem('enjoytrip_visits') || '[]'));
const listRequests = () => requests.filter(({ path }) => path === 'areaBasedList2' || path === 'locationBasedList2');

async function check(name, action) {
  try { const evidence = await action(); results.push({ name, status: 'passed', ...(evidence ? { evidence } : {}) }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: 'failed', message: clean(error.message) }); throw error; }
}
async function readyTrip() {
  await page.waitForFunction(() => document.querySelector('#sidoSelect')?.options.length > 1 && document.querySelector('#selectClass1')?.options.length > 1 && window.__mapTest?.maps.length);
}
async function completedSearch(expectedCount = 3) {
  await page.waitForFunction((count) => document.querySelectorAll('.tour-card').length === count && !document.querySelector('#searchButton').disabled, expectedCount);
}
async function searchSeoul() {
  await page.selectOption('#sidoSelect', '11');
  await page.waitForFunction(() => !document.querySelector('#gugunSelect').disabled);
  await page.click('#searchButton'); await completedSearch();
}
async function closeModal(id) {
  await page.locator(`#${id} .btn-close`).click(); await page.locator(`#${id}`).waitFor({ state: 'hidden' });
}
async function saveVisit(button, region = '11') {
  await button.click(); await visible('#visitModal.show');
  await page.selectOption('#visitRegion', region);
  await page.fill('#visitRecordDate', '2026-01-15');
  await page.click('#visitSaveBtn'); await page.locator('#visitModal').waitFor({ state: 'hidden' });
}
async function login(id, create = false) {
  await page.evaluate(async ({ id, create }) => {
    const auth = await import('./js/services/auth-service.js');
    if (create) await auth.registerUser({ id, name: id === 'moodtraveler' ? '여권 여행자' : '다른 여행자', email: `${id}@example.com`, password: 'featurepass123', passwordConfirm: 'featurepass123' });
    await auth.login(id, 'featurepass123');
  }, { id, create });
  await page.locator('#logoutBtn').waitFor({ state: 'attached' });
}

try {
  await mkdir('test-results', { recursive: true });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await delay(50); }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR', geolocation: { latitude: 37.5665, longitude: 126.978 }, permissions: ['geolocation'] });
  await context.route('**/js/config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export const CONFIG = { TOUR_API_SERVICE_KEY: "feature-test-key", KAKAO_JAVASCRIPT_KEY: "feature-test-kakao" };' }));
  const sdk = await readFile('tests/fixtures/kakao-sdk.js', 'utf8');
  await context.route('https://dapi.kakao.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: sdk }));
  await context.route('https://apis.data.go.kr/**', async (route) => {
    const url = new URL(route.request().url()), path = url.pathname.split('/').pop();
    const params = Object.fromEntries(url.searchParams); delete params.serviceKey;
    requests.push({ path, params });
    let items;
    if (path === 'ldongCode2') items = params.lDongRegnCd ? [{ code: '110', name: '테스트 구군' }] : regions;
    else if (path === 'lclsSystmCode2') items = params.lclsSystm2 ? [{ code: `${params.lclsSystm2}01`, name: '소분류 검증' }] : params.lclsSystm1 ? [{ code: `${params.lclsSystm1}01`, name: '중분류 검증' }] : categories;
    else if (path === 'detailCommon2') items = [{ ...fixtures[0], overview: '기능 검증용 상세 응답입니다.' }];
    else {
      if (listDelay) await delay(listDelay);
      items = emptyResults ? [] : fixtures.map((item) => ({ ...item, contenttypeid: params.contentTypeId || '12', lDongRegnCd: params.lDongRegnCd || '11' }));
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope(items)) });
  });
  page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => runtimeErrors.push(clean(error.message)));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(clean(message.text())); });
  page.on('requestfailed', (request) => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') failedRequests.push({ path: clean(request.url()), error: request.failure()?.errorText }); });
  page.on('response', (response) => { if (response.url().startsWith(base) && response.status() >= 400) missingAssets.push(new URL(response.url()).pathname); });
  page.on('dialog', (dialog) => dialog.accept());

  await check('01 무드 선택: 지역 없이 필터만 적용하고 임의 방문 기록을 만들지 않음', async () => {
    await page.goto(`${base}/trip.html`); await readyTrip();
    const before = listRequests().length;
    await page.click('[data-mood="food"]');
    assert.equal(await page.inputValue('#contentTypeSelect'), '39');
    assert.equal(await page.inputValue('#selectClass1'), 'FD');
    assert.equal(await page.locator('[data-mood="food"]').getAttribute('aria-pressed'), 'true');
    assert.ok((await page.locator('#moodDescription').innerText()).trim());
    assert.equal(listRequests().length, before, 'a region must not be invented');
    assert.deepEqual(await visitRecords(), []);
  });
  await check('02 무드 6종 → 실제 검색 조건 연결과 초기화', async () => {
    await page.selectOption('#sidoSelect', '11');
    await page.waitForFunction(() => !document.querySelector('#gugunSelect').disabled);
    for (const [mood, type, major] of [['rest', '12', 'NA'], ['food', '39', 'FD'], ['culture', '14', 'VE'], ['active', '28', 'LS'], ['shopping', '38', 'SH'], ['festival', '15', 'EV']]) {
      const before = listRequests().length;
      await page.click(`[data-mood="${mood}"]`); await completedSearch();
      assert.ok(listRequests().length > before, `${mood} automatically searches`);
      const latest = listRequests().at(-1).params;
      assert.equal(latest.contentTypeId, type); assert.equal(latest.lclsSystm1, major); assert.equal(latest.lDongRegnCd, '11');
      assert.equal(await page.inputValue('#contentTypeSelect'), type); assert.equal(await page.inputValue('#selectClass1'), major);
      assert.equal(await page.locator(`[data-mood="${mood}"]`).getAttribute('aria-pressed'), 'true');
    }
    await page.click('#moodResetBtn');
    assert.equal(await page.inputValue('#contentTypeSelect'), '');
    assert.equal(await page.inputValue('#selectClass1'), '');
    assert.equal(await page.inputValue('#selectClass2'), ''); assert.equal(await page.inputValue('#selectClass3'), '');
    assert.equal(await page.inputValue('#sidoSelect'), '11');
    assert.equal(await page.locator('[data-mood][aria-pressed="true"]').count(), 0);
    await page.click('#searchButton'); await completedSearch();
  });
  await check('03 랜덤 추천은 현재 API 결과에서만 선택하며 빈 결과에 안전함', async () => {
    const titles = await page.locator('.tour-card h2').allTextContents();
    const ids = await page.locator('.tour-card').evaluateAll((cards) => cards.map((card) => card.dataset.id));
    for (let i = 0; i < 8; i++) {
      await page.click('#randomPlaceBtn'); await visible('#randomRecommendation');
      await page.waitForFunction(() => !document.querySelector('#randomPlaceBtn').disabled);
      assert.ok(titles.includes((await page.locator('#randomTitle').innerText()).trim()), 'recommendation is in the current API result');
      assert.ok(ids.includes(await page.locator('.tour-card.is-selected').getAttribute('data-id')), 'recommendation focuses a current marker/card');
    }
    emptyResults = true; listDelay = 500; await page.click('#searchButton');
    await page.locator('.skeleton-card').first().waitFor();
    if (await page.locator('#randomPlaceBtn').isEnabled()) await page.click('#randomPlaceBtn');
    assert.ok(await page.locator('#randomRecommendation').isHidden(), 'search in progress cannot recommend the previous result');
    await completedSearch(0); listDelay = 0;
    if (await page.locator('#randomPlaceBtn').isEnabled()) await page.click('#randomPlaceBtn');
    assert.ok(await page.locator('#randomRecommendation').isHidden(), 'stale recommendation disappears when the result is empty');
    assert.equal(await page.locator('.tour-card').count(), 0); assert.deepEqual(await visitRecords(), []);
    emptyResults = false; await page.click('#searchButton'); await completedSearch();
  });
  await check('04 일정 담기·방문 다이얼로그 열기만으로는 기록하지 않음 / 명시적 저장', async () => {
    await login('moodtraveler', true);
    await page.locator('.tour-card').nth(0).locator('.js-add-plan').click();
    await page.locator('.tour-card').nth(1).locator('.js-add-plan').click();
    assert.deepEqual(await visitRecords(), []);
    await page.locator('.tour-card').first().locator('.js-visit').click(); await visible('#visitModal.show');
    assert.deepEqual(await visitRecords(), []); await closeModal('visitModal');
    await saveVisit(page.locator('.tour-card').first().locator('.js-visit'));
    const records = await visitRecords(); assert.equal(records.length, 1);
    assert.equal(records[0].ownerId, 'moodtraveler'); assert.equal(records[0].source, 'tour');
    assert.equal(records[0].sourceId, fixtures[0].contentid); assert.equal(records[0].regionCode, '11'); assert.equal(records[0].visitedAt, '2026-01-15');
    assert.equal(await page.locator('.tour-card').first().locator('.js-visit').getAttribute('aria-pressed'), 'true');
  });
  await check('05 방문 기록 새로고침 유지·중복 없는 표시·취소·재등록', async () => {
    await page.reload(); await readyTrip(); await searchSeoul();
    const visit = page.locator('.tour-card').first().locator('.js-visit');
    assert.equal(await visit.getAttribute('aria-pressed'), 'true');
    assert.equal((await visitRecords()).length, 1);
    await visit.click(); assert.equal((await visitRecords()).length, 0);
    assert.equal(await visit.getAttribute('aria-pressed'), 'false');
    await saveVisit(visit); assert.equal((await visitRecords()).length, 1);
    await page.reload(); await readyTrip(); await searchSeoul(); assert.equal((await visitRecords()).length, 1);
  });
  await check('06 여행계획의 방문 상태와 검색 방문 기록이 동일하게 연결됨', async () => {
    await page.goto(`${base}/plan.html`); await visible('.itinerary-item');
    assert.equal(await page.locator('.itinerary-item').count(), 2);
    assert.equal(await page.locator('.itinerary-item').first().locator('.js-visit').getAttribute('aria-pressed'), 'true');
    await saveVisit(page.locator('.itinerary-item').nth(1).locator('.js-visit'));
    assert.equal((await visitRecords()).length, 2);
    await page.fill('#planTitle', '방문 기록 검증 일정'); await page.fill('#planDate', '2026-01-15');
    await page.locator('#planForm [type="submit"]').click(); await visible('.saved-plan');
    assert.equal((await visitRecords()).length, 2, 'saving an itinerary does not add visits');
    await page.locator('.saved-plan [data-action="edit"]').click();
    assert.equal(await page.locator('.itinerary-item .js-visit[aria-pressed="true"]').count(), 2);
  });
  await check('07 HotPlace는 나만의 발견으로 구분 / 등록과 방문 완료를 별도로 처리', async () => {
    await page.goto(`${base}/hotplace.html`); await page.click('#newHotplace'); await visible('#hotplaceModal.show');
    await page.fill('#placeName', '내가 찾은 작은 쉼터'); await page.fill('#visitDate', '2026-01-15');
    await page.selectOption('#placeType', '카페'); await page.fill('#placeDescription', '직접 기록한 장소');
    await page.fill('#placeLat', '37.57'); await page.fill('#placeLng', '126.98');
    await page.click('#savePlaceBtn'); await visible('.hotplace-card');
    assert.equal((await visitRecords()).length, 2);
    assert.match(await page.locator('.hotplace-card').innerText(), /나만의 발견/);
    await saveVisit(page.locator('.hotplace-card .js-visit'));
    const records = await visitRecords(); assert.equal(records.length, 3); assert.equal(records.filter((item) => item.source === 'hotplace').length, 1);
    await page.reload(); await visible('.hotplace-card');
    assert.equal(await page.locator('.hotplace-card .js-visit').getAttribute('aria-pressed'), 'true');
  });
  await check('08 여권 지역 스탬프·방문 수·미방문 지역 탐색 연결', async () => {
    await page.goto(`${base}/passport.html`); await visible('#stampGrid'); await visible('#passportStats');
    await page.waitForFunction(() => document.querySelector('#visitList').textContent.includes('내가 찾은 작은 쉼터'));
    assert.equal(await page.locator('#passportPlaceCount').innerText(), '3');
    assert.equal(await page.locator('#passportRegionCount').innerText(), '1');
    assert.match(await page.locator('#passportRegionTotal').innerText(), /3/);
    assert.match(await page.locator('#visitList').innerText(), /나만의 발견/);
    const seoul = page.locator('#stampGrid [data-region="11"], #stampGrid [data-region-code="11"]').first();
    await seoul.waitFor(); assert.match(await seoul.innerText(), /3/);
    const busan = page.locator('#stampGrid a[href*="26"]').first(); await busan.waitFor();
    assert.match(await busan.getAttribute('class'), /is-unvisited/);
    await busan.click(); await readyTrip();
    await page.waitForFunction(() => document.querySelector('#sidoSelect').value === '26');
    assert.equal((await visitRecords()).length, 3);
    await page.click('[data-mood="food"]'); await completedSearch();
    assert.equal(listRequests().at(-1).params.lDongRegnCd, '26'); assert.equal(listRequests().at(-1).params.contentTypeId, '39');
  });
  await check('09 계정별 여권 격리와 로그아웃 후 기록 비노출', async () => {
    await page.goto(`${base}/passport.html`); await visible('#stampGrid');
    await login('othertraveler', true);
    await page.waitForFunction(() => !document.querySelector('#visitList').textContent.includes('내가 찾은 작은 쉼터'));
    assert.ok(!(await page.locator('#visitList').innerText()).includes(fixtures[0].title));
    assert.equal((await visitRecords()).length, 3, 'switching users preserves the original owner records');
    await page.evaluate(async () => (await import('./js/services/auth-service.js')).logout());
    assert.ok(!(await page.locator('#visitList').innerText()).includes(fixtures[0].title));
    await login('moodtraveler');
    await page.waitForFunction(() => document.querySelector('#visitList').textContent.includes('내가 찾은 작은 쉼터'));
  });
  await check('10 홈 무드와 모바일·데스크톱 전체 페이지 가로 넘침·모션 접근성', async () => {
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['index.html', 'trip.html', 'passport.html', 'plan.html', 'hotplace.html', 'mypage.html']) {
        await page.goto(`${base}/${path}`); await page.locator('#logoutBtn').waitFor({ state: 'attached' });
        if (path === 'trip.html') { await readyTrip(); await searchSeoul(); }
        if (path === 'passport.html') await visible('#stampGrid');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path}: horizontal overflow at ${width}px`);
      }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${base}/passport.html`); await visible('#stampGrid');
    assert.ok(await page.locator('#stampGrid').evaluate((grid) => [...grid.querySelectorAll('*')].every((node) => { const style = getComputedStyle(node); return style.animationName === 'none' || style.animationDuration.split(',').every((duration) => parseFloat(duration) <= .01); })));
    await page.goto(base);
    const homeMood = page.locator('a[href*="mood=food"]').first(); await homeMood.waitFor();
    await homeMood.click(); await readyTrip(); assert.equal(await page.inputValue('#contentTypeSelect'), '39');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });
  await check('11 여권에서 기록 취소 시 장소·지역 스탬프 통계 동시 갱신', async () => {
    await page.goto(`${base}/passport.html`); await visible('#visitList');
    while (await page.locator('.js-cancel-visit').count()) await page.locator('.js-cancel-visit').first().click();
    assert.equal(await page.locator('#passportPlaceCount').innerText(), '0');
    assert.equal(await page.locator('#passportRegionCount').innerText(), '0');
    assert.equal(await page.locator('#stampGrid .is-visited').count(), 0);
    assert.equal((await visitRecords()).length, 0);
    await page.reload(); await visible('#stampGrid'); assert.equal(await page.locator('#passportPlaceCount').innerText(), '0');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('enjoytrip_plans')).length), 1, 'canceling a visit preserves the saved itinerary');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('enjoytrip_hotplaces')).length), 1, 'canceling a visit preserves the HotPlace');
  });
  await check('12 런타임·콘솔·실패 요청·누락 로컬 리소스 0', async () => {
    assert.deepEqual(runtimeErrors, []); assert.deepEqual(consoleErrors, []);
    assert.deepEqual(failedRequests, []); assert.deepEqual(missingAssets, []);
    return { runtimeErrors: 0, consoleErrors: 0, failedRequests: 0, missingAssets: 0 };
  });
} catch (error) {
  console.error(clean(error.message));
  if (page) await page.screenshot({ path: 'test-results/features-failure.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile('test-results/features-browser-results.json', JSON.stringify({ externalApis: 'mocked; no real API key used', results, runtimeErrors, consoleErrors, failedRequests, missingAssets }, null, 2));
  await browser?.close(); server?.kill();
}
