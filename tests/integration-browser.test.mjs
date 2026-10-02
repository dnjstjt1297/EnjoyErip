// Wonseok UI integration against controlled TourAPI and Kakao responses.
// The genuine config and external API keys are never read or changed.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const base = process.env.INTEGRATION_BASE_URL || 'http://127.0.0.1:4177';
const server = process.env.INTEGRATION_BASE_URL ? null : spawn('python3', ['-m', 'http.server', '4177', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const results = [], requests = [], runtimeErrors = [], consoleErrors = [], failedRequests = [], missingAssets = [];
let expectedAborts = 0, browser, page;
const contentTypes = ['12', '14', '15', '25', '28', '32', '38', '39'];
const samplePlaces = Array.from({ length: 13 }, (_, index) => ({
  contentid: `integration-${index + 1}`, title: `통합 테스트 장소 ${index + 1}`,
  addr1: '서울특별시 종로구 검증 주소', lDongRegnCd: '11', contenttypeid: contentTypes[index % contentTypes.length],
  firstimage: '', firstimage2: '', mapx: String(126.978 + index * .001), mapy: String(37.5665 + index * .001),
}));
// Reverse distance order, 15 near + 90 far + 3 missing-coordinate records.
// The second API page matters: only reading a first page cannot prove completeness.
const distancePlaces = Array.from({ length: 108 }, (_, index) => ({
  ...samplePlaces[index % samplePlaces.length], contentid: `distance-${index + 1}`, title: `거리 검증 장소 ${index + 1}`,
  mapx: index >= 105 ? '' : '126.978',
  mapy: index >= 105 ? '' : String(index < 15 ? 37.5665 + (15 - index) * .001 : 38.8 + index * .001),
}));
const envelope = (items, total = items.length) => ({ response: { header: { resultCode: '0000', resultMsg: 'OK' }, body: { items: { item: items }, totalCount: total } } });
const clean = (text) => String(text).replace(/https?:\/\/[^\s"')]+/g, (value) => { try { const url = new URL(value); return url.origin + url.pathname; } catch { return '[URL]'; } }).slice(0, 600);
const listing = () => requests.filter(({ path }) => ['areaBasedList2', 'searchKeyword2', 'locationBasedList2'].includes(path));
const latest = () => listing().at(-1);

async function check(name, action) {
  try { const evidence = await action(); results.push({ name, status: 'passed', ...(evidence ? { evidence } : {}) }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: 'failed', message: clean(error.message) }); throw error; }
}
async function ready() {
  await page.waitForFunction(() => document.querySelector('#sidoSelect')?.options.length > 1 && document.querySelector('#selectClass1')?.options.length > 1 && window.__mapTest?.maps.length);
}
async function fresh() { await page.goto(`${base}/trip.html`); await ready(); }
async function region(code = '11', district = '') {
  await page.selectOption('#sidoSelect', code);
  if (code) await page.waitForFunction(() => !document.querySelector('#gugunSelect').disabled);
  if (district) await page.selectOption('#gugunSelect', district);
}
async function keyword(value) { await page.fill('#keywordInput', value); await page.locator('#keywordInput').blur(); }
async function done(success = true) {
  await page.waitForFunction(() => !document.querySelector('#searchButton').disabled);
  const className = await page.locator('#statusMessage').getAttribute('class');
  assert.equal(className.includes('alert-danger'), !success, await page.locator('#statusMessage').innerText());
}
async function search(success = true) { await page.click('#searchButton'); await done(success); }
async function closeModal(id) { await page.locator(`#${id} .btn-close`).click(); await page.locator(`#${id}`).waitFor({ state: 'hidden' }); }
async function currentLocation() {
  await page.click('#useLocationBtn');
  await page.waitForFunction(() => document.querySelector('#distanceOrigin').value === 'current' && !document.querySelector('#useLocationBtn').disabled);
}

try {
  await mkdir('test-results', { recursive: true });
  for (let n = 0; n < 100; n++) { try { if ((await fetch(base)).ok) break; } catch {} await delay(50); }
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR', geolocation: { latitude: 37.5665, longitude: 126.978 }, permissions: ['geolocation'] });
  await context.route('**/js/config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export const CONFIG = { TOUR_API_SERVICE_KEY: "integration-test-key", KAKAO_JAVASCRIPT_KEY: "integration-kakao" };' }));
  // CDN availability is covered by the live suite, not this deterministic suite.
  await context.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
  const sdk = await readFile('tests/fixtures/kakao-sdk.js', 'utf8');
  await context.route('https://dapi.kakao.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: sdk }));
  await context.route('https://apis.data.go.kr/**', async (route) => {
    const url = new URL(route.request().url()), path = url.pathname.split('/').pop();
    const params = Object.fromEntries(url.searchParams); delete params.serviceKey;
    requests.push({ path, params });
    let payload;
    if (path === 'ldongCode2') payload = envelope(params.lDongRegnCd ? [{ code: '110', name: '종로구' }] : [{ code: '11', name: '서울특별시' }, { code: '26', name: '부산광역시' }]);
    else if (path === 'lclsSystmCode2') payload = envelope(params.lclsSystm2 ? [{ code: `${params.lclsSystm2}01`, name: '소분류' }] : params.lclsSystm1 ? [{ code: `${params.lclsSystm1}01`, name: '중분류' }] : ['NA', 'FD', 'VE', 'LS', 'SH', 'EV'].map((code) => ({ code, name: `${code} 분류` })));
    else if (path === 'detailCommon2') payload = envelope([{ ...(samplePlaces.find((item) => item.contentid === params.contentId) || samplePlaces[0]), overview: '키워드 검색에서 연결한 실제 상세 응답 흐름 검증입니다.' }]);
    else {
      const pageNo = Number(params.pageNo || 1), count = Number(params.numOfRows || 12);
      if (params.keyword === '취소 검증') await delay(500);
      const all = (params.keyword === '거리 검증' || params.keyword === '불완전 검증' ? distancePlaces : samplePlaces)
        .map((item) => ({ ...item, contenttypeid: params.contentTypeId || item.contenttypeid }));
      payload = envelope(all.slice((pageNo - 1) * count, pageNo * count), all.length);
      if (params.keyword === '빈 결과') payload = envelope([], 0);
      if (params.keyword === '광범위 검증') payload = envelope(all.slice(0, 1), 1001);
      if (params.keyword === '불완전 검증' && pageNo > 1) payload = envelope([], 108);
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
  });
  page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => runtimeErrors.push(clean(error.message)));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(clean(message.text())); });
  page.on('requestfailed', (request) => {
    if (request.failure()?.errorText === 'net::ERR_ABORTED') expectedAborts++;
    else failedRequests.push({ path: clean(request.url()), error: request.failure()?.errorText });
  });
  page.on('response', (response) => { if (response.url().startsWith(base) && response.status() >= 400) missingAssets.push(new URL(response.url()).pathname); });
  page.on('dialog', (dialog) => dialog.accept());

  await check('01 지역 단독 검색은 기존 법정동 API·페이지 크기를 유지', async () => {
    await fresh(); await region(); await search();
    assert.equal(latest().path, 'areaBasedList2'); assert.equal(latest().params.lDongRegnCd, '11');
    assert.equal(latest().params.areaCode, undefined); assert.equal(latest().params.numOfRows, '12');
    assert.equal(await page.locator('.tour-card').count(), 12);
  });
  await check('02 지역·구군·관광유형의 기존 필터 조합', async () => {
    await page.selectOption('#gugunSelect', '110'); await page.selectOption('#contentTypeSelect', '14'); await search();
    assert.equal(latest().params.lDongSignguCd, '110'); assert.equal(latest().params.contentTypeId, '14');
    assert.equal(await page.locator('#mapLegend [data-category="14"]').count(), 1);
  });
  await check('03 검색어 단독 전국 검색은 searchKeyword2를 사용', async () => {
    await fresh(); await keyword('  궁궐 산책  '); await search();
    assert.equal(latest().path, 'searchKeyword2'); assert.equal(latest().params.keyword, '궁궐 산책');
    assert.equal(latest().params.lDongRegnCd, undefined); assert.equal(await page.locator('.tour-card').count(), 12);
  });
  await check('04 지역·검색어·구군·유형·대중소분류를 함께 보존', async () => {
    await region('11', '110'); await page.selectOption('#contentTypeSelect', '14');
    await page.locator('#classificationFilters summary').click();
    await page.selectOption('#selectClass1', 'VE'); await page.waitForFunction(() => !document.querySelector('#selectClass2').disabled);
    await page.selectOption('#selectClass2', 'VE01'); await page.waitForFunction(() => !document.querySelector('#selectClass3').disabled);
    await page.selectOption('#selectClass3', 'VE0101'); await search();
    for (const [key, value] of Object.entries({ keyword: '궁궐 산책', lDongRegnCd: '11', lDongSignguCd: '110', contentTypeId: '14', lclsSystm1: 'VE', lclsSystm2: 'VE01', lclsSystm3: 'VE0101' })) assert.equal(latest().params[key], value);
  });
  await check('05 무드·검색어 검색과 무드 초기화는 검색어를 보존', async () => {
    await fresh(); await keyword('먹거리'); await page.click('[data-mood="food"]'); await done();
    assert.equal(latest().path, 'searchKeyword2'); assert.equal(latest().params.keyword, '먹거리');
    assert.equal(latest().params.contentTypeId, '39'); assert.equal(latest().params.lclsSystm1, 'FD');
    await page.click('#moodResetBtn'); await done();
    assert.equal(await page.inputValue('#keywordInput'), '먹거리'); assert.equal(latest().params.contentTypeId, undefined);
  });
  await check('06 무드·지역·구군과 검색어 조합이 함께 반영', async () => {
    await region('11', '110'); await page.click('[data-mood="culture"]'); await done();
    for (const [key, value] of Object.entries({ keyword: '먹거리', lDongRegnCd: '11', lDongSignguCd: '110', contentTypeId: '14', lclsSystm1: 'VE' })) assert.equal(latest().params[key], value);
    await keyword(''); await page.click('[data-mood="rest"]'); await done();
    assert.equal(latest().path, 'areaBasedList2'); assert.equal(latest().params.lclsSystm1, 'NA');
  });
  await check('07 키워드 A/C/D/E 정렬·전체 수집·거리·페이지·캐시·상한·취소', async () => {
    await fresh(); await keyword('거리 검증');
    for (const arrange of ['A', 'C', 'D']) {
      await page.selectOption('#arrangeSelect', arrange); await search();
      assert.equal(latest().path, 'searchKeyword2'); assert.equal(latest().params.arrange, arrange);
    }
    await page.selectOption('#arrangeSelect', 'E'); await currentLocation(); await page.selectOption('#searchRadius', '5000');
    const before = listing().length; await search();
    const collected = listing().slice(before); assert.equal(collected.length, 2);
    assert.ok(collected.every(({ path, params }) => path === 'searchKeyword2' && params.arrange === 'A' && params.numOfRows === '100'));
    assert.deepEqual(collected.map(({ params }) => params.pageNo), ['1', '2']);
    assert.match(await page.locator('#resultCount').innerText(), /15/);
    assert.equal(await page.locator('.tour-card').first().getAttribute('data-id'), 'distance-15');
    const firstIds = await page.locator('.tour-card').evaluateAll((cards) => cards.map((card) => card.dataset.id));
    assert.deepEqual(firstIds, Array.from({ length: 12 }, (_, index) => `distance-${15 - index}`));
    const after = listing().length; await page.click('#nextPage'); await done();
    assert.equal(listing().length, after, 'distance pagination reuses the complete keyword response');
    assert.deepEqual(await page.locator('.tour-card').evaluateAll((cards) => cards.map((card) => card.dataset.id)), ['distance-3', 'distance-2', 'distance-1']);
    await page.selectOption('#searchRadius', '1000'); await search();
    assert.match(await page.locator('#resultCount').innerText(), /8/); assert.equal(await page.locator('.tour-card').count(), 8);
    assert.equal(listing().length, after, 'a changed radius recomputes distance from complete cached data');
    await keyword('광범위 검증'); await search(false); assert.match(await page.locator('#statusMessage').innerText(), /1,000/); assert.equal(await page.locator('.tour-card').count(), 0);
    await keyword('불완전 검증'); await search(false); assert.match(await page.locator('#statusMessage').innerText(), /끝까지/); assert.equal(await page.locator('.tour-card').count(), 0);
    await keyword('취소 검증'); await page.click('#searchButton'); await page.locator('.skeleton-card').first().waitFor();
    await page.selectOption('#contentTypeSelect', '14'); await delay(600);
    assert.equal(await page.locator('.tour-card').count(), 0, 'aborted keyword request cannot restore old cards');
    assert.equal(await page.evaluate(async () => (await import('./js/map/kakao-map.js')).markers.length), 0);
    return { completeKeywordRecords: 108, within5km: 15, within1km: 8, paginationRequests: 0 };
  });
  await check('08 무드 선택 후 A/C/D/E 정렬에서도 분류와 유형을 유지', async () => {
    await fresh(); await region(); await page.click('[data-mood="food"]'); await done();
    for (const arrange of ['A', 'C', 'D', 'E']) {
      await page.selectOption('#arrangeSelect', arrange);
      if (arrange === 'E') await currentLocation();
      await search(); assert.equal(latest().params.contentTypeId, '39'); assert.equal(latest().params.lclsSystm1, 'FD');
      assert.equal(latest().params.arrange, arrange); assert.equal(latest().path, arrange === 'E' ? 'locationBasedList2' : 'areaBasedList2');
    }
  });
  await check('09 검색 결과마다 관광 유형 아이콘·색상·범례·이미지 캐시 반영', async () => {
    await fresh(); await region(); await search();
    assert.equal(await page.locator('#mapLegend [data-category]').count(), 8);
    const data = await page.evaluate(async () => {
      const { markers } = await import('./js/map/kakao-map.js');
      return { count: markers.length, sources: new Set(markers.map((marker) => marker.getImage().src)).size, sharedImage: markers[0].getImage() === markers[8].getImage() };
    });
    assert.deepEqual(data, { count: 12, sources: 8, sharedImage: true });
  });
  await check('10 지도 핀 클릭은 정확한 관광지 카드·정보창을 선택', async () => {
    await page.evaluate(async () => { const { markers } = await import('./js/map/kakao-map.js'); kakao.maps.event.trigger(markers[2], 'click'); });
    assert.equal(await page.locator('.tour-card.is-selected').getAttribute('data-id'), 'integration-3');
    assert.match(await page.locator('.mock-info').innerText(), /통합 테스트 장소 3/);
    assert.equal(await page.evaluate(async () => (await import('./js/map/kakao-map.js')).markers[2].getImage().size.width), 46);
  });
  await check('11 카드 클릭·호버 핀 상태와 선택 복원이 서로 연결', async () => {
    await page.locator('.tour-card').first().locator('.place-media').click();
    assert.equal(await page.locator('.tour-card.is-selected').getAttribute('data-id'), 'integration-1');
    await page.locator('.tour-card').nth(1).hover();
    const hover = await page.evaluate(async () => { const { markers } = await import('./js/map/kakao-map.js'); return [markers[0].getImage().size.width, markers[1].getImage().size.width]; });
    assert.deepEqual(hover, [46, 44]);
    await page.locator('h1').hover();
    assert.equal(await page.evaluate(async () => (await import('./js/map/kakao-map.js')).markers[1].getImage().size.width), 40);
    await page.click('#fitMarkersBtn');
    assert.ok(await page.evaluate(async () => (await import('./js/map/kakao-map.js')).markers.every((marker) => marker.getImage().size.width === 40)));
  });
  await check('12 재검색은 이전 핀·정보창을 제거하고 빈 결과의 범례도 정리', async () => {
    await page.evaluate(async () => { window.__previousMarkers = [...(await import('./js/map/kakao-map.js')).markers]; });
    await page.selectOption('#contentTypeSelect', '39'); await search();
    assert.ok(await page.evaluate(() => window.__previousMarkers.every((marker) => !marker.map)));
    assert.equal(await page.locator('.mock-info').count(), 0); assert.equal(await page.locator('#mapLegend [data-category]').count(), 1);
    await keyword('빈 결과'); await search(); assert.equal(await page.locator('.tour-card').count(), 0);
    assert.ok(await page.locator('#mapLegend').isHidden());
  });
  await check('13 키워드 페이지 이동은 검색 조건과 핀 개수를 유지', async () => {
    await fresh(); await region('11', '110'); await keyword('페이지 검증'); await page.selectOption('#contentTypeSelect', '12'); await search();
    await page.click('#nextPage'); await done();
    assert.equal(await page.locator('.tour-card').count(), 1);
    for (const [key, value] of Object.entries({ keyword: '페이지 검증', pageNo: '2', lDongRegnCd: '11', lDongSignguCd: '110', contentTypeId: '12' })) assert.equal(latest().params[key], value);
    assert.equal(await page.evaluate(async () => (await import('./js/map/kakao-map.js')).markers.length), 1);
    await page.click('#prevPage'); await done(); assert.equal(await page.locator('.tour-card').count(), 12);
  });
  await check('14 키워드 결과의 상세보기와 지도 이동을 유지', async () => {
    await page.locator('.tour-card').first().locator('.js-detail').click();
    await page.waitForFunction(() => document.querySelector('#detailBody').textContent.includes('실제 상세 응답 흐름'));
    assert.ok(requests.some(({ path, params }) => path === 'detailCommon2' && params.contentId === 'integration-1'));
    await page.click('#detailMapBtn'); await page.locator('#detailModal').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.tour-card.is-selected').getAttribute('data-id'), 'integration-1');
  });
  await check('15 키워드 결과를 여행계획에 담으면 동일 장소·좌표·유형이 보존', async () => {
    await page.evaluate(async () => {
      const auth = await import('./js/services/auth-service.js');
      await auth.registerUser({ id: 'integrationuser', name: '통합 여행자', email: 'integration@example.com', password: 'testpass123', passwordConfirm: 'testpass123' });
      await auth.login('integrationuser', 'testpass123');
    });
    await page.locator('.tour-card').first().locator('.js-add-plan').click();
    const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('enjoytrip_plan_drafts'))[0]);
    assert.equal(draft.places[0].contentid, 'integration-1'); assert.equal(draft.places[0].contenttypeid, '12'); assert.equal(draft.places[0].mapx, '126.978');
    await page.goto(`${base}/plan.html`); await page.locator('.itinerary-item').waitFor();
    assert.match(await page.locator('.itinerary-item').innerText(), /통합 테스트 장소 1/);
    assert.equal(await page.locator('.route-pin').count(), 1);
  });
  await check('16 모바일 검색어·무드·지도·범례 넘침과 브라우저 오류 없음', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/trip.html?region=11&keyword=${encodeURIComponent('모바일 검증')}&mood=culture`); await ready(); await done();
    await page.locator('.tour-card').first().waitFor(); assert.equal(latest().params.keyword, '모바일 검증'); assert.equal(latest().params.contentTypeId, '14');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(runtimeErrors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(failedRequests, []); assert.deepEqual(missingAssets, []);
    return { runtimeErrors: 0, consoleErrors: 0, failedRequests: 0, missingAssets: 0 };
  });
} catch (error) {
  console.error(clean(error.message));
  await page?.screenshot({ path: 'test-results/integration-failure.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile('test-results/integration-browser-results.json', JSON.stringify({ externalApis: 'mocked; no real API keys read', results, runtimeErrors, consoleErrors, failedRequests, missingAssets, expectedAborts }, null, 2));
  await browser?.close(); server?.kill();
}
