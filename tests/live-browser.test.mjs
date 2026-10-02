// Opt-in: real API requests using the developer's existing config. Never logs keys/URLs.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.LIVE_BASE_URL || 'http://localhost:5500';
const screenshotDir = process.env.LIVE_SCREENSHOT_DIR || 'screenshots';
const results = [], pageErrors = [], consoleErrors = [], requestFailures = [];
let browser, page;
const clean = (text) => String(text).replace(/https?:\/\/[^\s"')]+/g, (url) => { try { return new URL(url).origin + new URL(url).pathname; } catch { return '[URL]'; } }).slice(0, 400);
async function check(name, action) {
  try { const evidence = await action(); results.push({ name, status: 'passed', evidence }); console.log(`PASS ${name}${evidence ? ' '+JSON.stringify(evidence) : ''}`); }
  catch (error) { results.push({ name, status: 'failed', message: clean(error.message) }); throw error; }
}
async function snap(name, fullPage = true) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * .8) {
      scrollTo({ top: y, behavior: 'instant' }); await new Promise(resolve => setTimeout(resolve, 75));
    }
    document.querySelectorAll('.app-toast').forEach(el => el.remove());
    document.getElementById('tourList')?.scrollTo({ top: 0, behavior: 'instant' });
    document.activeElement?.blur(); scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage, animations: 'disabled' });
}
async function search() {
  await page.click('#searchButton');
  await page.waitForFunction(() => !document.querySelector('#searchButton').disabled, {}, { timeout: 25000 });
  assert.ok(!(await page.locator('#statusMessage').getAttribute('class')).includes('alert-danger'), 'TourAPI response failed');
}
async function imageReady() {
  await page.locator('.tour-card').first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => { const img = document.querySelector('.tour-card img'); return !img || img.complete; }, {}, { timeout: 20000 });
}
try {
  await mkdir('test-results', { recursive: true }); await mkdir(screenshotDir, { recursive: true });
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR', geolocation: { latitude: 37.5796, longitude: 126.977 }, permissions: ['geolocation'] });
  // Live Server otherwise reloads the page when a screenshot/report is written.
  // Only its local reload socket is intercepted; all TourAPI/Kakao traffic stays real.
  await context.routeWebSocket(/\/ws$/, () => {});
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => pageErrors.push(clean(error.message)));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(clean(message.text())); });
  page.on('requestfailed', request => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') requestFailures.push({ path: new URL(request.url()).origin + new URL(request.url()).pathname, error: request.failure()?.errorText }); });
  page.on('dialog', dialog => dialog.accept());
  await check('01 홈·폰트·로그인 모달·모바일 홈', async () => {
    await page.goto(base); await page.locator('#authNav button').first().waitFor(); await snap('home');
    await page.locator('[data-bs-target="#loginModal"]').click(); await page.locator('#loginModal.show').waitFor();
    await snap('login-modal', false); await page.locator('#loginModal .btn-close').click(); await page.locator('#loginModal').waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 390, height: 844 }); await snap('home-mobile'); await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await check('02 실제 지역·분류 코드와 Kakao SDK', async () => {
    await page.goto(`${base}/trip.html`);
    await page.waitForFunction(async () => document.querySelector('#sidoSelect').options.length > 1 && document.querySelector('#selectClass1').options.length > 1 && !!(await import('./js/map/kakao-map.js')).map);
    await snap('trip-desktop');
    return page.evaluate(() => ({ regions: document.querySelector('#sidoSelect').options.length-1, categories: document.querySelector('#selectClass1').options.length-1, sdk: !!window.kakao.maps }));
  });
  await check('03 실제 시도→구군, 대→중→소분류', async () => {
    await page.selectOption('#sidoSelect', '11');
    await page.waitForFunction(() => document.querySelector('#gugunSelect').options.length > 1);
    await page.locator('#classificationFilters summary').click();
    const first = await page.locator('#selectClass1 option').nth(1).getAttribute('value');
    await page.selectOption('#selectClass1', first); await page.waitForFunction(() => document.querySelector('#selectClass2').options.length > 1);
    const second = await page.locator('#selectClass2 option').nth(1).getAttribute('value');
    await page.selectOption('#selectClass2', second); await page.waitForFunction(() => document.querySelector('#selectClass3').options.length > 1);
    const third = await page.locator('#selectClass3 option').nth(1).getAttribute('value'); await page.selectOption('#selectClass3', third);
    const counts = await page.evaluate(() => ({ districts: document.querySelector('#gugunSelect').options.length-1, middle: document.querySelector('#selectClass2').options.length-1, small: document.querySelector('#selectClass3').options.length-1 }));
    await search(); // A valid intersection may be empty, but the real API must accept the hierarchy.
    await page.selectOption('#selectClass1', ''); await page.locator('#classificationFilters summary').click(); return counts;
  });
  await check('04 실데이터 카드·사진·마커·상세·페이지 이동', async () => {
    await page.selectOption('#contentTypeSelect', '12'); await search(); await imageReady();
    assert.equal(await page.locator('.tour-card').count(), 12);
    const evidence = await page.evaluate(async () => ({ cards: document.querySelectorAll('.tour-card').length, markers: (await import('./js/map/kakao-map.js')).markers.length, imageLoaded: !!document.querySelector('.tour-card img')?.naturalWidth }));
    assert.ok(evidence.markers > 0); assert.ok(evidence.imageLoaded);
    await page.locator('.tour-card').first().locator('.place-media').click();
    await page.locator('.tour-card.is-selected').waitFor(); await page.locator('#mapSelection').waitFor();
    await page.evaluate(async () => { const { markers } = await import('./js/map/kakao-map.js'); kakao.maps.event.trigger(markers[1], 'click'); });
    assert.equal(await page.locator('.tour-card.is-selected').count(), 1);
    await page.click('#fitMarkersBtn'); await snap('trip-live');
    await page.locator('.tour-card').first().locator('.js-detail').click(); await page.locator('#detailBody .preserve-lines').waitFor();
    assert.ok((await page.locator('#detailBody .preserve-lines').innerText()).length > 5);
    await page.click('#detailMapBtn'); await page.locator('#detailModal').waitFor({ state: 'hidden' });
    const firstTitle = await page.locator('.tour-card h2').first().innerText();
    await page.click('#nextPage'); await page.waitForFunction(() => !document.querySelector('#searchButton').disabled);
    assert.notEqual(await page.locator('.tour-card h2').first().innerText(), firstTitle);
    await page.click('#prevPage'); await page.waitForFunction(() => !document.querySelector('#searchButton').disabled);
    return evidence;
  });
  await check('05 실제 수정일·등록일·현재 위치 주변 검색', async () => {
    for (const sort of ['C', 'D']) { await page.selectOption('#arrangeSelect', sort); await search(); }
    await page.selectOption('#arrangeSelect', 'E'); await page.click('#useLocationBtn');
    await page.waitForFunction(() => document.querySelector('#distanceOrigin').value === 'current'); await search();
    assert.ok(await page.locator('.tour-card').count());
    const around = await page.locator('#statusMessage').innerText();
    await page.click('#mapLocationBtn'); await page.waitForFunction(() => !document.querySelector('#mapLocationBtn').disabled);
    await page.selectOption('#arrangeSelect', 'A'); await search(); return { around };
  });
  await check('06 실제 Geocoder 주소→좌표·마커 정리', async () => {
    const count = await page.evaluate(async () => {
      const api = await import('./js/map/kakao-map.js');
      const items = await api.updateMap([{ contentid: 'geocoder-check', title: '경복궁 주소 확인', addr1: '서울특별시 종로구 사직로 161', mapx: '', mapy: '' }]);
      const result = { latitude: Number(items[0].mapy), longitude: Number(items[0].mapx), markers: api.markers.length };
      await api.updateMap([]); result.afterClear = api.markers.length; return result;
    });
    assert.ok(count.latitude > 37 && count.longitude > 126); assert.equal(count.markers, 1); assert.equal(count.afterClear, 0);
    await search(); return count;
  });
  await check('07 실제 관광지로 회원·일정·번호 경로·HotPlace 화면', async () => {
    // Isolated Playwright profile only; does not touch the user's browser or account.
    await page.evaluate(async () => {
      const auth = await import('./js/services/auth-service.js');
      await auth.registerUser({ id: 'live_traveler', password: 'localtest123', passwordConfirm: 'localtest123', name: '여행자', email: 'traveler@example.com' });
      await auth.login('live_traveler', 'localtest123');
    });
    for (let i = 0; i < 3; i++) await page.locator('.tour-card').nth(i).locator('.js-add-plan').click();
    const places = await page.evaluate(async () => (await import('./js/services/plan-service.js')).getDraft().places);
    await page.goto(`${base}/plan.html`); await page.locator('.itinerary-item').first().waitFor();
    await page.fill('#planTitle', '서울, 천천히 걷는 하루'); await page.fill('#planDate', '2026-10-10'); await page.fill('#planBudget', '80000'); await page.fill('#planNotes', '도심에서 잠시 벗어나, 마음이 머무는 곳을 걸어요.');
    await page.waitForFunction(() => document.querySelectorAll('.route-pin').length === 3);
    await snap('plan-live');
    await page.locator('#planForm [type="submit"]').click(); await page.locator('.saved-plan').waitFor(); await page.reload(); await page.locator('.saved-plan').waitFor();
    await page.goto(`${base}/hotplace.html`); await page.waitForFunction(async () => !!(await import('./js/map/kakao-map.js')).map);
    await page.click('#newHotplace'); await page.locator('#hotplaceModal.show').waitFor();
    const place = places[0];
    await page.fill('#placeName', place.title); await page.fill('#visitDate', '2026-10-01'); await page.selectOption('#placeType', '명소');
    await page.fill('#placeDescription', '골목을 걷다가 만난 서울의 또 다른 모습. 다음 여행에도 다시 들르고 싶은 곳.');
    await page.fill('#placeImage', place.firstimage);
    assert.ok(place.addr1, 'the selected real attraction provides an address');
    await page.fill('#placeAddress', place.addr1); await page.click('#findAddress');
    await page.waitForFunction(() => !document.querySelector('#findAddress').disabled);
    const selectedPosition = { lat: Number(await page.inputValue('#placeLat')), lng: Number(await page.inputValue('#placeLng')) };
    assert.ok(selectedPosition.lat > 33 && selectedPosition.lat < 39 && selectedPosition.lng > 124 && selectedPosition.lng < 132, 'real address search supplies Korean map coordinates');
    await page.click('#savePlaceBtn'); await page.locator('.hotplace-card').waitFor(); await page.waitForTimeout(1000); await snap('hotplace-live');
    const storedPlace = await page.evaluate(() => JSON.parse(localStorage.getItem('enjoytrip_hotplaces'))[0]);
    assert.equal(Number(storedPlace.mapy), selectedPosition.lat); assert.equal(Number(storedPlace.mapx), selectedPosition.lng);
    await page.goto(`${base}/mypage.html`); await page.locator('#profileCard').waitFor(); await snap('mypage');
    return { persistedPlan: true, numberedRoute: 3, hotplace: true };
  });
  await check('08 모바일 실데이터·지도·가로 넘침', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${base}/trip.html`);
    await page.waitForFunction(() => document.querySelector('#sidoSelect').options.length > 1);
    await page.selectOption('#sidoSelect', '11'); await page.selectOption('#contentTypeSelect', '12'); await search(); await imageReady();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await snap('trip-mobile-live');
  });
  await check('09 실제 Travel Mood 6종 검색·응답 분류·랜덤 추천', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/trip.html`);
    await page.waitForFunction(() => document.querySelector('#sidoSelect').options.length > 1 && document.querySelector('#selectClass1').options.length > 1);
    await snap('trip-final');
    await page.selectOption('#sidoSelect', '11');
    const verified = [];
    for (const [mood, type, major] of [['rest','12','NA'], ['food','39','FD'], ['culture','14','VE'], ['active','28','LS'], ['shopping','38','SH'], ['festival','15','EV']]) {
      const responsePromise = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname.endsWith('/areaBasedList2') && url.searchParams.get('contentTypeId') === type && url.searchParams.get('lclsSystm1') === major;
      });
      await page.click(`[data-mood="${mood}"]`);
      const response = await responsePromise, json = await response.json();
      await page.waitForFunction(() => !document.querySelector('#searchButton').disabled);
      const sample = json.response.body.items.item[0];
      assert.equal(sample.contenttypeid, type); assert.equal(sample.lclsSystm1, major);
      verified.push({ mood, type, major });
    }
    await page.click('[data-mood="rest"]'); await page.waitForFunction(() => !document.querySelector('#searchButton').disabled);
    await imageReady();
    const titles = await page.locator('.tour-card h2').allTextContents();
    await page.click('#randomPlaceBtn');
    assert.ok(titles.includes(await page.locator('#randomTitle').innerText()));
    await snap('trip-map-final');
    return { verifiedMoods: verified, randomFromDisplayedResults: true };
  });
  await check('10 실데이터 방문 완료 → 여권 → 미방문 지역·최종 화면', async () => {
    const mark = async (selector) => {
      await page.locator(selector).first().click();
      await page.locator('#visitModal.show').waitFor();
      await page.waitForFunction(() => !document.querySelector('#visitSaveBtn').disabled);
      assert.ok(await page.inputValue('#visitRegion'));
      await page.click('#visitSaveBtn');
      await page.locator('#visitModal').waitFor({ state: 'hidden' });
    };
    await mark('.tour-card .js-visit');
    await page.setViewportSize({ width: 390, height: 844 }); await snap('mobile-trip-final');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.selectOption('#sidoSelect', '26');
    await page.waitForFunction(() => document.querySelectorAll('.tour-card').length > 0 && !document.querySelector('#searchButton').disabled);
    await mark('.tour-card .js-visit');
    await page.goto(`${base}/passport.html`);
    await page.waitForFunction(() => document.querySelectorAll('#stampGrid .passport-stamp').length > 0 && document.querySelector('#passportPlaceCount').textContent === '2');
    assert.equal(await page.locator('#passportRegionCount').innerText(), '2');
    await snap('passport-final');
    await page.reload(); await page.locator('.passport-visit-card').first().waitFor();
    assert.equal(await page.locator('.passport-visit-card').count(), 2);
    await page.setViewportSize({ width: 390, height: 844 }); await snap('mobile-passport-final');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 1440, height: 1000 });
    const firstUnvisited = page.locator('#stampGrid .is-unvisited').first();
    const targetRegion = await firstUnvisited.getAttribute('data-region');
    await firstUnvisited.click();
    await page.waitForFunction((code) => document.querySelector('#sidoSelect')?.value === code && !document.querySelector('#searchButton').disabled, targetRegion);
    await page.goto(`${base}/plan.html`); await page.locator('.saved-plan [data-action="edit"]').click();
    await page.waitForFunction(() => document.querySelectorAll('.route-pin').length === 3);
    await snap('plan-final');
    await page.goto(`${base}/hotplace.html`); await page.locator('.hotplace-card').waitFor(); await snap('hotplace-final');
    await page.goto(`${base}/mypage.html`); await page.locator('#profileCard').waitFor(); await snap('mypage-final');
    await page.goto(base); await page.locator('#homePassportPreview').waitFor(); await snap('home-final');
    await page.setViewportSize({ width: 390, height: 844 }); await snap('mobile-home-final');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.click('#logoutBtn'); await page.locator('#authNav [data-bs-target="#loginModal"]').click();
    await page.locator('#loginModal.show').waitFor(); await snap('login-final', false);
    return { visitedPlaces: 2, regions: 2, persistedAfterReload: true, unvisitedRegionLink: true };
  });
  await check('11 원석 키워드 + 미르 무드·분류·지역·A/C/D/E 정렬 실연동', async () => {
    await page.goto(`${base}/trip.html?keyword=${encodeURIComponent('경복궁')}`);
    await page.waitForFunction(() => document.querySelectorAll('.tour-card').length > 0 && !document.querySelector('#searchButton').disabled);
    assert.equal(await page.inputValue('#sidoSelect'), '', 'keyword-only searches nationwide');
    assert.ok((await page.locator('.tour-card h2').allTextContents()).some(title => title.includes('경복궁')));
    await page.fill('#keywordInput', '공원'); await page.selectOption('#sidoSelect', '11');
    await page.click('[data-mood="rest"]');
    await page.waitForFunction(() => document.querySelectorAll('.tour-card').length > 0 && !document.querySelector('#searchButton').disabled);
    const verified = [];
    for (const arrange of ['A', 'C', 'D']) {
      await page.selectOption('#arrangeSelect', arrange);
      const responsePromise = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname.endsWith('/searchKeyword2') && url.searchParams.get('arrange') === arrange;
      });
      await search();
      const data = await (await responsePromise).json();
      const items = data.response.body.items.item;
      assert.ok(items.length);
      assert.ok(items.every(item => item.lDongRegnCd === '11' && item.contenttypeid === '12' && item.lclsSystm1 === 'NA'));
      verified.push(arrange);
    }
    await page.selectOption('#arrangeSelect', 'E'); await page.click('#useLocationBtn');
    await page.waitForFunction(() => document.querySelector('#distanceOrigin').value === 'current'); await search();
    assert.ok(await page.locator('.tour-card').count());
    assert.match(await page.locator('#statusMessage').innerText(), /공원.*10km/);
    const distances = await page.locator('.tour-card .tour-distance').allTextContents();
    assert.ok(distances.length);
    assert.ok(distances.every((text, index) => !index || parseFloat(text) >= parseFloat(distances[index - 1])));
    await page.locator('.tour-card .place-media').first().click();
    assert.ok(await page.evaluate(async () => {
      const { markers } = await import('./js/map/kakao-map.js');
      return markers.length > 0 && markers.every(marker => marker.getImage() instanceof kakao.maps.MarkerImage);
    }));
    await page.locator('#mapLegend').waitFor();
    await snap('trip-keyword-final');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      const info = document.querySelector('#map .map-info')?.getBoundingClientRect();
      const map = document.getElementById('map').getBoundingClientRect();
      return info && info.left >= map.left && info.right <= map.right;
    });
    await snap('mobile-trip-final');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 1440, height: 1000 });
    return { keywordOnly: true, combinedFilters: true, verifiedSorts: [...verified, 'E'], categoryPins: true, resizedInfoWindowVisible: true };
  });
  await check('12 HotPlace 실관광지 검색·선택·주소 검색·지도 클릭·새로고침', async () => {
    await page.evaluate(async () => (await import('./js/services/auth-service.js')).login('live_traveler', 'localtest123'));
    await page.goto(`${base}/hotplace.html`); await page.click('#newHotplace');
    await page.locator('#hotplaceModal.show').waitFor();
    await page.waitForFunction(() => document.querySelector('#hotTourArea').options.length > 1);
    await page.selectOption('#hotTourArea', '11'); await page.fill('#hotTourKeyword', '경복궁');
    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/searchKeyword2'));
    await page.click('#hotTourSearch');
    const actual = (await (await responsePromise).json()).response.body.items.item[0];
    await page.locator('[data-tour-select]').first().click();
    assert.equal(await page.inputValue('#placeName'), actual.title);
    assert.equal(await page.inputValue('#placeAddress'), actual.addr1);
    await page.fill('#placeAddress', '서울특별시 종로구 사직로 161'); await page.click('#findAddress');
    await page.waitForFunction(() => !document.querySelector('#findAddress').disabled);
    assert.ok(Number(await page.inputValue('#placeLat')) > 37);
    const before = await page.inputValue('#placeLat');
    await page.locator('#pickMap').click({ position: { x: 110, y: 90 } });
    await page.waitForFunction(lat => document.querySelector('#placeLat').value !== lat, before);
    // Re-select the official place after verifying the independent picker.
    await page.locator('[data-tour-select]').first().click();
    await page.fill('#placeImage', actual.firstimage || actual.firstimage2 || ''); await page.locator('#placeImage').blur();
    await page.fill('#placeDescription', '고즈넉한 궁궐을 천천히 둘러본 하루. 다음에는 다른 계절의 풍경도 만나보고 싶어요.');
    await snap('hotplace-photo-final', false);
    await page.locator('#hotplaceModal').evaluate(modal => modal.scrollTo({ top: 0, behavior: 'instant' }));
    await snap('hotplace-editor-final', false);
    await page.click('#savePlaceBtn'); await page.locator('#hotplaceModal').waitFor({ state: 'hidden' });
    await page.reload(); await page.locator('.hotplace-card').first().waitFor();
    assert.ok((await page.locator('.hotplace-card').allTextContents()).some(text => text.includes(actual.title)));
    const stored = await page.evaluate(async () => (await import('./js/services/hotplace-service.js')).getHotplaces());
    assert.ok(stored.some(place => place.touristPlace?.contentid === String(actual.contentid) && place.address === actual.addr1));
    await snap('hotplace-final');
    await page.locator('.hotplace-card [data-action="detail"]').first().click();
    await page.locator('#hotplaceDetailModal.show').waitFor(); await snap('hotplace-detail-final', false);
    return { actualTourSelection: true, geocoder: true, pickerClick: true, canonicalStorage: true, persisted: true };
  });
  await check('13 브라우저 콘솔·런타임·외부 요청 오류', async () => {
    assert.deepEqual(pageErrors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(requestFailures, []);
    return { runtimeErrors: pageErrors.length, consoleErrors: consoleErrors.length, failedRequests: requestFailures.length };
  });
} catch (error) {
  console.error(clean(error.message));
  await page?.screenshot({ path: 'test-results/live-failure.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile('test-results/live-results.json', JSON.stringify({ date: new Date().toISOString(), origin: base, results, pageErrors, consoleErrors, requestFailures }, null, 2));
  await browser?.close();
}
