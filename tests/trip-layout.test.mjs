// Trip workspace layout and interaction contracts. All tourism/maps are mocked.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const base = process.env.TRIP_LAYOUT_BASE_URL || 'http://127.0.0.1:4179';
const server = process.env.TRIP_LAYOUT_BASE_URL ? null : spawn('python3', ['-m', 'http.server', '4179', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const results = [], requests = [], runtimeErrors = [], consoleErrors = [], failedRequests = [], missingAssets = [];
const types = ['12', '14', '15', '25', '28', '32', '38', '39'];
const places = Array.from({ length: 13 }, (_, i) => ({
  contentid: `layout-${i + 1}`, title: i === 1 ? '긴 이름도 두 줄 안에서 읽을 수 있는 여행지 레이아웃 검증 장소' : `여행지 화면 검증 ${i + 1}`,
  addr1: i === 1 ? '서울특별시 종로구 긴 주소와 추가 지역명이 있는 검증 주소 123' : '서울특별시 종로구 검증 주소',
  contenttypeid: types[i % types.length], lDongRegnCd: '11', mapx: String(126.978 + i * .001), mapy: String(37.5665 + i * .001),
  firstimage: i === 0 ? `${base}/layout-photo.svg` : i === 2 ? `${base}/layout-broken.jpg` : '',
  firstimage2: i === 3 ? `${base}/layout-photo.svg` : '', dist: String(100 + i * 100),
}));
const envelope = (items, total = items.length) => ({ response: { header: { resultCode: '0000' }, body: { items: { item: items }, totalCount: total } } });
const listings = () => requests.filter(({ path }) => ['areaBasedList2', 'searchKeyword2', 'locationBasedList2'].includes(path));
let browser, page, listDelay = 0;
const clean = (value) => String(value).replace(/https?:\/\/[^\s"')]+/g, (text) => { try { const url = new URL(text); return url.origin + url.pathname; } catch { return '[URL]'; } });
async function check(name, action) {
  try { const evidence = await action(); results.push({ name, status: 'passed', ...(evidence ? { evidence } : {}) }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: 'failed', message: clean(error.message) }); throw error; }
}
async function settledRows() {
  await page.waitForFunction(() => !document.querySelector('#searchButton').disabled && document.querySelectorAll('.tour-card').length > 0);
  await page.locator('.tour-card').evaluateAll(async (rows) => { await Promise.all(rows.flatMap((row) => row.getAnimations()).map((animation) => animation.finished.catch(() => {}))); });
}
async function search() { await page.click('#searchButton'); await settledRows(); }
async function closeModal(id) { await page.locator(`#${id} .btn-close`).click(); await page.locator(`#${id}`).waitFor({ state: 'hidden' }); }
const selectedId = () => page.locator('.tour-card.is-selected').getAttribute('data-id');
async function resetListScroll() { await page.locator('#tourList').evaluate((list) => list.scrollTo({ top: 0, behavior: 'instant' })); }
async function geometry() {
  return page.evaluate(() => {
    const list = document.querySelector('#tourList'), result = document.querySelector('.trip-results-panel').getBoundingClientRect();
    const mapPanel = document.querySelector('.trip-map-panel').getBoundingClientRect(), map = document.querySelector('#map').getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const rows = [...list.querySelectorAll('.tour-card')].map((row) => row.getBoundingClientRect());
    const media = [...list.querySelectorAll('.tour-card > .place-media')].map((item) => item.getBoundingClientRect());
    return { width: innerWidth, resultRatio: result.width / (result.width + mapPanel.width), mapHeight: map.height,
      rowsVisible: rows.filter((row) => row.top >= listRect.top - 1 && row.bottom <= listRect.bottom + 1).length,
      rowHeights: rows.map((row) => row.height), photoHeights: media.map((item) => item.height), photoWidths: media.map((item) => item.width),
      listHeight: listRect.height, listScrollable: list.scrollHeight > list.clientHeight,
      overflow: document.documentElement.scrollWidth > innerWidth };
  });
}

try {
  await mkdir('test-results', { recursive: true });
  for (let n = 0; n < 100; n++) { try { if ((await fetch(base)).ok) break; } catch {} await delay(50); }
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR' });
  await context.route('**/js/config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export const CONFIG={TOUR_API_SERVICE_KEY:"layout-test",KAKAO_JAVASCRIPT_KEY:"layout-map"};' }));
  await context.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
  const sdk = await readFile('tests/fixtures/kakao-sdk.js', 'utf8');
  await context.route('https://dapi.kakao.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: sdk }));
  await context.route('**/layout-photo.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#d1e9e7"/><path d="M0 240 120 70 200 180 270 95 320 240" fill="#70a9a1"/></svg>' }));
  await context.route('**/layout-broken.jpg', (route) => route.fulfill({ contentType: 'image/jpeg', body: 'invalid image contents for fallback verification' }));
  await context.route('https://apis.data.go.kr/**', async (route) => {
    const url = new URL(route.request().url()), path = url.pathname.split('/').pop();
    const params = Object.fromEntries(url.searchParams); delete params.serviceKey; requests.push({ path, params });
    let data;
    if (path === 'ldongCode2') data = envelope(params.lDongRegnCd ? [{ code: '110', name: '종로구' }] : [{ code: '11', name: '서울특별시' }, { code: '26', name: '부산광역시' }]);
    else if (path === 'lclsSystmCode2') data = envelope(params.lclsSystm2 ? [{ code: `${params.lclsSystm2}01`, name: '소분류' }] : params.lclsSystm1 ? [{ code: `${params.lclsSystm1}01`, name: '중분류' }] : ['NA', 'FD', 'VE', 'LS', 'SH', 'EV'].map((code) => ({ code, name: `${code} 분류` })));
    else if (path === 'detailCommon2') data = envelope([{ ...(places.find((item) => item.contentid === params.contentId) || places[0]), overview: '제목 버튼으로 연결한 상세 정보 검증' }]);
    else {
      if (listDelay) await delay(listDelay);
      const from = (Number(params.pageNo || 1) - 1) * Number(params.numOfRows || 12);
      data = envelope(places.slice(from, from + Number(params.numOfRows || 12)), places.length);
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => runtimeErrors.push(clean(error.message)));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(clean(message.text())); });
  page.on('requestfailed', (request) => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') failedRequests.push(clean(request.url())); });
  page.on('response', (response) => { if (response.url().startsWith(base) && response.status() >= 400) missingAssets.push(new URL(response.url()).pathname); });

  await check('01 키워드 Enter 검색·삭제 버튼·기존 상세 필터 유지', async () => {
    await page.goto(`${base}/trip.html`);
    await page.waitForFunction(() => document.querySelector('#sidoSelect').options.length > 1 && window.__mapTest?.maps.length);
    await page.fill('#keywordInput', '화면 검증'); await page.locator('#keywordInput').press('Enter'); await settledRows();
    assert.equal(listings().at(-1).path, 'searchKeyword2'); assert.equal(listings().at(-1).params.keyword, '화면 검증');
    const beforeClear = listings().length; await page.click('#clearKeywordBtn');
    assert.equal(await page.inputValue('#keywordInput'), ''); assert.ok(await page.locator('#keywordInput').evaluate((input) => document.activeElement === input));
    assert.equal(listings().length, beforeClear, 'clearing text does not invent a new API request');
    await page.selectOption('#sidoSelect', '11'); await page.waitForFunction(() => !document.querySelector('#gugunSelect').disabled);
    await page.locator('#classificationFilters summary').click();
    await page.selectOption('#selectClass1', 'NA'); await page.waitForFunction(() => !document.querySelector('#selectClass2').disabled);
    await page.selectOption('#selectClass2', 'NA01'); await page.waitForFunction(() => !document.querySelector('#selectClass3').disabled);
    await page.selectOption('#selectClass3', 'NA0101'); await search();
    assert.equal(listings().at(-1).params.lclsSystm3, 'NA0101');
    await page.locator('#classificationFilters summary').click();
    assert.equal(await page.inputValue('#selectClass3'), 'NA0101', 'closing advanced filters preserves their values');
    assert.ok((await page.locator('#statusMessage').boundingBox()).height <= 80, 'search feedback stays compact');
  });
  await check('02 1440·1920px 30/70 작업 영역·600px 지도·한 번에 4–6개 행', async () => {
    const evidence = [];
    for (const width of [1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 }); await resetListScroll();
      const data = await geometry(); evidence.push(data);
      assert.ok(Math.abs(data.resultRatio - .30) <= .04, `list ratio ${data.resultRatio} at ${width}px`);
      assert.ok(data.mapHeight >= 600, `map height ${data.mapHeight} at ${width}px`);
      assert.ok(data.rowsVisible >= 4 && data.rowsVisible <= 6, `${data.rowsVisible} rows fully visible at ${width}px`);
      assert.ok(data.listScrollable, 'results have their own scrollport'); assert.equal(data.overflow, false);
      assert.ok(data.rowHeights.every((height) => height >= 120 && height <= 150), `compact row heights: ${data.rowHeights}`);
      assert.ok(data.photoWidths.every((width) => width >= 80 && width <= 112), 'thumbnail width stays compact');
    }
    await page.setViewportSize({ width: 1440, height: 1000 }); return evidence;
  });
  await check('03 사진·이미지 없음·로드 실패·보조 사진이 같은 행 높이를 유지', async () => {
    await resetListScroll(); await page.locator('.tour-card').first().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('.tour-card img')?.naturalWidth > 0);
    await page.locator('.tour-card').nth(2).locator('.image-placeholder').waitFor();
    await page.locator('.tour-card').nth(3).scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelectorAll('.tour-card')[3]?.querySelector('img')?.naturalWidth > 0);
    const data = await geometry();
    assert.ok(Math.max(...data.rowHeights) - Math.min(...data.rowHeights) <= 1, 'fallback and long text cannot expand compact rows');
    assert.ok(Math.max(...data.photoHeights) - Math.min(...data.photoHeights) <= 1, 'all media slots have the same reserved height');
    assert.equal(await page.locator('.tour-card').nth(1).locator('.image-placeholder').count(), 1);
    assert.ok((await page.locator('.tour-card').nth(3).locator('img').getAttribute('src')).endsWith('layout-photo.svg'));
  });
  await check('04 목록만 스크롤해도 지도·페이지 버튼 위치가 고정되고 핀이 행으로 연결', async () => {
    await resetListScroll();
    await page.evaluate(() => scrollTo({ top: document.querySelector('.trip-workspace').getBoundingClientRect().top + scrollY - 90, behavior: 'instant' }));
    const position = () => page.evaluate(() => ({ pageY: scrollY, mapY: document.querySelector('#map').getBoundingClientRect().top, pageButtonsY: document.querySelector('#pagination').getBoundingClientRect().top }));
    const before = await position();
    await page.locator('#tourList').evaluate((list) => list.scrollTo({ top: 350, behavior: 'instant' }));
    const after = await position();
    assert.equal(after.pageY, before.pageY); assert.ok(Math.abs(after.mapY - before.mapY) <= 1); assert.ok(Math.abs(after.pageButtonsY - before.pageButtonsY) <= 1);
    await page.evaluate(async () => { const { markers } = await import('./js/map/kakao-map.js'); kakao.maps.event.trigger(markers.at(-1), 'click'); });
    await page.waitForFunction(() => {
      const list = document.querySelector('#tourList').getBoundingClientRect(), row = document.querySelector('.tour-card.is-selected')?.getBoundingClientRect();
      return row && row.top >= list.top - 1 && row.bottom <= list.bottom + 1;
    });
    assert.equal(await selectedId(), 'layout-12');
    assert.equal(await page.locator('.tour-card.is-selected').getAttribute('aria-current'), 'true');
    await page.click('#fitMarkersBtn');
    assert.equal(await page.locator('.tour-card.is-selected').count(), 0, 'show all clears the visual row selection');
    assert.equal(await page.locator('.tour-card[aria-current="true"]').count(), 0, 'show all clears the accessible row selection');
    assert.ok(await page.locator('#mapSelection').isHidden());
    assert.ok(await page.evaluate(async () => (await import('./js/map/kakao-map.js')).markers.every((marker) => marker.getImage().size.width === 40 && marker.element.style.opacity === '1')), 'show all restores every pin to its normal style');
  });
  await check('05 행 클릭·Enter·Space는 지도 선택, 제목 클릭·Enter는 상세보기', async () => {
    const first = page.locator('.tour-card').first();
    await first.locator('.place-media').click(); assert.equal(await selectedId(), 'layout-1');
    const second = page.locator('.tour-card').nth(1); await second.focus(); await second.press('Enter'); assert.equal(await selectedId(), 'layout-2');
    const third = page.locator('.tour-card').nth(2); await third.focus(); await third.press('Space'); assert.equal(await selectedId(), 'layout-3');
    assert.ok(await page.locator('#detailModal').isHidden(), 'row activation does not open the detail modal');
    assert.equal(await page.locator('.tour-card .js-move-map').count(), 0, 'redundant map action is removed from rows');
    assert.equal(await first.locator('.js-detail').count(), 1); assert.equal(await first.locator('h2 .js-detail').count(), 1);
    await first.locator('.js-detail').click(); await page.locator('#detailModal.show').waitFor();
    assert.equal(await page.locator('#detailTitle').innerText(), places[0].title); await closeModal('detailModal');
    await second.locator('.js-detail').focus(); await second.locator('.js-detail').press('Enter'); await page.locator('#detailModal.show').waitFor();
    assert.equal(await page.locator('#detailTitle').innerText(), places[1].title); await closeModal('detailModal');
  });
  await check('06 일정·방문 버튼은 행 선택으로 전파되지 않고 기존 저장 계약을 유지', async () => {
    await page.evaluate(async () => {
      const auth = await import('./js/services/auth-service.js');
      await auth.registerUser({ id: 'layoutuser', name: '화면 여행자', email: 'layout@example.com', password: 'layoutpass123', passwordConfirm: 'layoutpass123' });
      await auth.login('layoutuser', 'layoutpass123');
    });
    await page.locator('.tour-card').first().locator('.place-media').click();
    const second = page.locator('.tour-card').nth(1); await second.locator('.js-add-plan').click();
    assert.equal(await selectedId(), 'layout-1');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('enjoytrip_plan_drafts'))[0].places[0].contentid), 'layout-2');
    const thirdAdd = page.locator('.tour-card').nth(2).locator('.js-add-plan'); await thirdAdd.focus(); await thirdAdd.press('Enter');
    assert.equal(await selectedId(), 'layout-1', 'a nested button Enter must not activate the row');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('enjoytrip_plan_drafts'))[0].places.length), 2);
    await second.locator('.js-visit').focus(); await second.locator('.js-visit').press('Enter'); await page.locator('#visitModal.show').waitFor(); assert.equal(await selectedId(), 'layout-1');
    await page.selectOption('#visitRegion', '11'); await page.fill('#visitRecordDate', '2026-01-15'); await page.click('#visitSaveBtn'); await page.locator('#visitModal').waitFor({ state: 'hidden' });
    assert.equal(await second.locator('.js-visit').getAttribute('aria-pressed'), 'true');
    assert.match(await second.locator('.js-visit').getAttribute('aria-label') || await second.locator('.js-visit').innerText(), /다녀|방문|취소/);
    assert.equal(await selectedId(), 'layout-1');
  });
  await check('07 재검색 스켈레톤·페이지 이동·지도의 기존 마커 제거', async () => {
    await page.evaluate(async () => { window.__oldLayoutMarkers = [...(await import('./js/map/kakao-map.js')).markers]; });
    listDelay = 300; await page.click('#searchButton'); await page.locator('.skeleton-card').first().waitFor(); await page.locator('#mapLoading').waitFor();
    await settledRows(); listDelay = 0;
    assert.ok(await page.evaluate(() => window.__oldLayoutMarkers.every((marker) => !marker.map)));
    await page.click('#nextPage'); await settledRows(); assert.equal(await page.locator('.tour-card').count(), 1);
    assert.equal(await page.evaluate(async () => (await import('./js/map/kakao-map.js')).markers.length), 1);
    await page.click('#prevPage'); await settledRows(); assert.equal(await page.locator('.tour-card').count(), 12);
  });
  await check('08 1024·768·390px 가로 넘침·모바일 지도 우선·내비게이션', async () => {
    for (const width of [1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px horizontal overflow`);
      if (width <= 991) {
        const layout = await page.evaluate(() => ({ mapTop: document.querySelector('.trip-map-panel').getBoundingClientRect().top, resultTop: document.querySelector('.trip-results-panel').getBoundingClientRect().top }));
        assert.ok(layout.mapTop < layout.resultTop, `${width}px map appears above the list`);
      }
    }
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.locator('.navbar-toggler').click(); await page.locator('#mainNavbar.show').waitFor();
    assert.equal(await page.locator('#mainNavbar a[href="./trip.html"]').getAttribute('aria-current'), 'page');
    await page.locator('.navbar-toggler').click(); await page.locator('#mainNavbar').waitFor({ state: 'hidden' });
    await page.locator('.tour-card').first().locator('.js-detail').click(); await page.locator('#detailModal.show').waitFor();
    assert.ok(await page.locator('#detailModal').evaluate((modal) => modal.scrollWidth <= innerWidth)); await closeModal('detailModal');
  });
  await check('09 키보드·모바일 변경 후 런타임·콘솔·실패 요청·누락 리소스 0', async () => {
    assert.deepEqual(runtimeErrors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(failedRequests, []); assert.deepEqual(missingAssets, []);
    return { runtimeErrors: 0, consoleErrors: 0, failedRequests: 0, missingAssets: 0 };
  });
} catch (error) {
  console.error(clean(error.message));
  await page?.screenshot({ path: 'test-results/trip-layout-failure.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile('test-results/trip-layout-results.json', JSON.stringify({ externalApis: 'mocked; no real keys read', results, runtimeErrors, consoleErrors, failedRequests, missingAssets }, null, 2));
  await browser?.close(); server?.kill();
}
