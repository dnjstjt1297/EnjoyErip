// Location UX regressions only. The SDK and TourAPI use deterministic test data.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const base = process.env.HOTPLACE_LOCATION_BASE_URL || 'http://127.0.0.1:4181';
const server = process.env.HOTPLACE_LOCATION_BASE_URL ? null : spawn('python3', ['-m', 'http.server', '4181', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const results = [], runtimeErrors = [], consoleErrors = [], failedRequests = [], missingAssets = [];
const sdk = await readFile('tests/fixtures/kakao-sdk.js', 'utf8');
const places = [
  { contentid: '900', title: '위치가 있는 검증 공원', addr1: '서울특별시 종로구 검증 주소', contenttypeid: '12', lDongRegnCd: '11', mapx: '126.978', mapy: '37.5665', firstimage: '' },
  { contentid: '901', title: '주소로 찾는 검증 공원', addr1: '서울특별시 변환 성공 공원', contenttypeid: '12', lDongRegnCd: '11', mapx: '', mapy: '', firstimage: '' },
];
const envelope = (items) => ({ response: { header: { resultCode: '0000' }, body: { items: { item: items }, totalCount: items.length } } });
const clean = (text) => String(text).replace(/https?:\/\/[^\s"')]+/g, (url) => { try { return new URL(url).pathname; } catch { return '[URL]'; } });
let browser, page;

async function check(name, action) {
  try { await action(); results.push({ name, status: 'passed' }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: 'failed', message: clean(error.message) }); throw error; }
}
async function makePage({ missingSdk = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR' });
  await context.route('**/js/config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export const CONFIG={TOUR_API_SERVICE_KEY:"location-test",KAKAO_JAVASCRIPT_KEY:"location-map"};' }));
  await context.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
  await context.route('https://dapi.kakao.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: missingSdk ? '/* SDK unavailable for this scenario */' : sdk }));
  await context.route('https://apis.data.go.kr/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope(path.endsWith('ldongCode2') ? [{ code: '11', name: '서울특별시' }] : places)) });
  });
  const next = await context.newPage(); next.setDefaultTimeout(12000);
  next.on('pageerror', (error) => runtimeErrors.push(clean(error.message)));
  next.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(clean(message.text())); });
  next.on('requestfailed', (request) => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') failedRequests.push(clean(request.url())); });
  next.on('response', (response) => { if (response.url().startsWith(base) && response.status() >= 400) missingAssets.push(new URL(response.url()).pathname); });
  next.on('dialog', (dialog) => dialog.accept());
  return next;
}
const records = () => page.evaluate(() => JSON.parse(localStorage.getItem('enjoytrip_hotplaces') || '[]'));
async function login(id, register = false) {
  await page.evaluate(async ({ id, register }) => {
    const auth = await import('./js/services/auth-service.js');
    if (register) await auth.registerUser({ id, name: id, email: `${id}@example.com`, password: 'location-test123', passwordConfirm: 'location-test123' });
    await auth.login(id, 'location-test123');
  }, { id, register });
}
async function open() {
  await page.click('#newHotplace'); await page.locator('#hotplaceModal.show').waitFor();
  await page.waitForFunction(() => window.__mapTest.maps.some((map) => map.container.id === 'pickMap'));
}
async function close() {
  await page.locator('#hotplaceModal .btn-close').click();
  await page.locator('#hotplaceModal').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => !document.querySelector('.modal-backdrop'));
}
async function fillInfo(name) {
  await page.fill('#placeName', name); await page.fill('#visitDate', '2026-01-15');
  await page.fill('#placeDescription', '위치 선택 방식만 바꾸어도 보존되는 나의 여행 기록');
}
async function clickMap(lat, lng) {
  await page.evaluate(({ lat, lng }) => {
    const picker = window.__mapTest.maps.find((map) => map.container.id === 'pickMap');
    kakao.maps.event.trigger(picker, 'click', { latLng: new kakao.maps.LatLng(lat, lng) });
  }, { lat, lng });
}
async function saved() { await page.locator('#hotplaceModal').waitFor({ state: 'hidden' }); }
async function slowSave(address) {
  await page.evaluate(() => { window.__mapTest.geoDelay = 550; });
  await page.fill('#placeAddress', address); await page.click('#savePlaceBtn');
  await page.waitForFunction(() => document.querySelector('#selectedLocation').dataset.state === 'loading');
}

try {
  await mkdir('test-results', { recursive: true });
  let ready = false;
  for (let n = 0; n < 100; n++) { try { if ((await fetch(base)).ok) { ready = true; break; } } catch {} await delay(50); }
  assert.ok(ready, 'local test server started');
  browser = await chromium.launch(); page = await makePage();
  await page.goto(`${base}/hotplace.html`); await login('locationtraveler', true);

  await check('01 숫자 입력 제거·숨겨진 저장 필드·위치 필수 안내', async () => {
    await open(); await fillInfo('위치 선택 전 기록');
    for (const id of ['placeLat', 'placeLng']) {
      assert.equal(await page.locator(`#${id}`).getAttribute('type'), 'hidden');
      assert.equal(await page.locator(`#${id}`).getAttribute('required'), null);
      assert.equal(await page.locator(`label[for="${id}"]`).count(), 0);
    }
    await page.click('#savePlaceBtn');
    assert.match(await page.locator('#hotError').innerText(), /장소의 위치가 필요/);
    assert.equal((await records()).length, 0);
    assert.doesNotMatch(await page.locator('#hotplaceModal').innerText(), /위도|경도|37\.5665|126\.978/);
  });
  await check('02 지도 클릭 저장·숫자 비노출·새로고침·편집 취소 보존', async () => {
    await clickMap(37.57, 126.98);
    assert.match(await page.locator('#selectedLocation').innerText(), /지도에서 위치를 선택/);
    await page.click('#savePlaceBtn'); await saved();
    const original = (await records())[0];
    assert.equal(original.mapy, 37.57); assert.equal(original.mapx, 126.98); assert.equal(original.address, '');
    await page.reload(); await page.locator('.hotplace-card').waitFor();
    await page.locator('.hotplace-card [data-action="edit"]').click(); await page.locator('#hotplaceModal.show').waitFor();
    assert.match(await page.locator('#selectedLocation').innerText(), /저장된 장소/);
    await page.fill('#placeAddress', '취소할 주소'); assert.equal(await page.inputValue('#placeLat'), '');
    await close(); assert.deepEqual((await records())[0], original);
  });
  await check('03 주소 수정은 이전 위치 무효화·저장할 때 자동 주소 변환', async () => {
    const originalId = (await records())[0].id;
    await page.locator('.hotplace-card [data-action="edit"]').click(); await page.locator('#hotplaceModal.show').waitFor();
    await page.fill('#placeAddress', '서울특별시 변환 성공 새 주소');
    assert.equal(await page.inputValue('#placeLng'), '');
    await page.click('#savePlaceBtn'); await saved();
    const changed = (await records())[0];
    assert.equal(changed.id, originalId); assert.equal(changed.mapy, 37.581); assert.equal(changed.mapx, 126.985);
    assert.equal(changed.address, '서울특별시 변환 성공 새 주소');
    assert.equal(changed.ownerId, 'locationtraveler');
  });
  await check('04 찾을 수 없는 주소는 저장 차단·재시도 가능·기존 데이터 보존', async () => {
    const previous = await records();
    await open(); await fillInfo('없는 주소 기록'); await page.fill('#placeAddress', '찾을 수 없는 주소');
    await page.click('#savePlaceBtn'); await page.locator('#hotError:not([hidden])').waitFor();
    assert.match(await page.locator('#hotError').innerText(), /주소를 찾을 수 없습니다/);
    assert.equal(await page.locator('#savePlaceBtn').isDisabled(), false);
    assert.equal(await page.locator('#findAddress').isDisabled(), false);
    assert.deepEqual(await records(), previous); await close();
  });
  await check('05 저장 중 모달 취소·재진입에 늦은 주소 응답 적용하지 않음', async () => {
    const count = (await records()).length;
    await open(); await fillInfo('취소할 자동 변환'); await slowSave('서울 변환 성공 취소 주소');
    await close(); await open(); await delay(650);
    assert.equal(await page.inputValue('#placeLat'), '');
    assert.equal(await page.inputValue('#placeName'), '');
    assert.equal(await page.locator('#savePlaceBtn').isDisabled(), false);
    assert.equal(await page.locator('#findAddress').isDisabled(), false);
    assert.equal((await records()).length, count); await close();
  });
  await check('06 저장 중 주소 변경은 이전 응답·자동 저장 차단', async () => {
    const count = (await records()).length;
    await open(); await fillInfo('변경한 주소 기록'); await slowSave('서울 변환 성공 이전 주소');
    await page.fill('#placeAddress', '서울 변환 성공 최신 주소'); await delay(650);
    assert.equal(await page.inputValue('#placeLat'), ''); assert.equal((await records()).length, count);
    assert.equal(await page.locator('#savePlaceBtn').isDisabled(), false);
    await page.click('#savePlaceBtn'); await saved();
    assert.equal((await records()).at(-1).address, '서울 변환 성공 최신 주소');
  });
  await check('07 늦은 주소 변환보다 최근 지도 클릭 우선·명시적으로 다시 저장', async () => {
    const count = (await records()).length;
    await open(); await fillInfo('지도에서 고른 최신 위치'); await slowSave('서울 변환 성공 지도 선택 이전');
    await clickMap(37.592, 126.992); await delay(650);
    assert.equal(Number(await page.inputValue('#placeLat')), 37.592);
    assert.equal((await records()).length, count);
    await page.click('#savePlaceBtn'); await saved();
    assert.equal((await records()).at(-1).mapy, 37.592); assert.equal((await records()).at(-1).mapx, 126.992);
  });
  await check('08 주소 확인 중 사진 초기화·계정 전환은 저장 권한을 우회하지 않음', async () => {
    const before = await records();
    await open(); await fillInfo('계정 변경 전에 입력한 기록'); await slowSave('서울 변환 성공 계정 전환');
    await page.click('#clearPlacePhoto'); assert.equal(await page.locator('#savePlaceBtn').isDisabled(), true);
    await login('locationother', true); await page.locator('#hotplaceModal').waitFor({ state: 'hidden' }); await delay(650);
    assert.deepEqual(await records(), before); assert.equal(await page.inputValue('#placeLat'), '');
    assert.equal(await page.locator('.hotplace-card').count(), 0); await login('locationtraveler');
  });
  await check('09 관광지 위치 자동 선택·선택 해제는 위치 보존·주소 보완은 관광지 연결 보존', async () => {
    await page.evaluate(() => { window.__mapTest.geoDelay = 10; });
    await open(); await page.click('#hotTourSearch'); await page.locator('[data-tour-select="900"]').waitFor();
    await page.locator('[data-tour-select="900"]').click();
    assert.match(await page.locator('#selectedLocation').innerText(), /관광지의 위치/);
    await page.click('#clearTourSelection'); assert.equal(Number(await page.inputValue('#placeLat')), 37.5665);
    await page.locator('[data-tour-select="900"]').click(); await page.fill('#placeDescription', '관광지에서 자동으로 위치를 채운 기록');
    await page.click('#savePlaceBtn'); await saved(); assert.equal((await records()).at(-1).touristPlace.contentid, '900');
    await open(); await page.click('#hotTourSearch'); await page.locator('[data-tour-select="901"]').click();
    assert.equal(await page.inputValue('#placeLat'), ''); await page.fill('#placeDescription', '관광지 주소로 지도 위치를 보완한 기록');
    await page.click('#savePlaceBtn'); await saved();
    assert.equal((await records()).at(-1).touristPlace.contentid, '901'); assert.equal((await records()).at(-1).mapy, 37.581);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('enjoytrip_visits') || '[]').length), 0);
  });
  await check('10 Desktop·Mobile 등록창에 숫자 좌표 노출·가로 넘침 없음', async () => {
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 }); await open(); await clickMap(37.59, 126.99);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.locator('#hotplaceModal').evaluate((modal) => modal.scrollWidth > innerWidth), false);
      assert.doesNotMatch(await page.locator('#hotplaceModal').innerText(), /위도|경도|37\.590|126\.990/); await close();
    }
  });
  await check('11 SDK 실패에도 관광지 위치로 저장 가능·직접 숫자 입력 안내 없음', async () => {
    const previousPage = page; page = await makePage({ missingSdk: true });
    await page.goto(`${base}/hotplace.html`); await login('locationoffline', true);
    await page.click('#newHotplace'); await page.locator('#pickMap .map-unavailable').waitFor();
    assert.doesNotMatch(await page.locator('#pickMap').innerText(), /위도|경도|직접 입력/);
    await page.click('#hotTourSearch'); await page.locator('[data-tour-select="900"]').click();
    await page.fill('#placeDescription', '지도 연결 없이 관광지 위치로 남긴 기록');
    await page.click('#savePlaceBtn'); await saved();
    assert.equal((await records())[0].mapy, 37.5665); assert.equal((await records())[0].touristPlace.contentid, '900');
    await page.context().close(); page = previousPage;
  });
  await check('12 런타임·콘솔·네트워크·로컬 리소스 오류 0', async () => {
    assert.deepEqual(runtimeErrors, []); assert.deepEqual(consoleErrors, []);
    assert.deepEqual(failedRequests, []); assert.deepEqual(missingAssets, []);
  });
} catch (error) {
  console.error(clean(error.message)); process.exitCode = 1;
  await page?.screenshot({ path: 'test-results/hotplace-location-failure.png', fullPage: true }).catch(() => {});
} finally {
  await writeFile('test-results/hotplace-location-results.json', JSON.stringify({ externalApis: 'mocked', results, runtimeErrors, consoleErrors, failedRequests, missingAssets }, null, 2));
  await browser?.close(); server?.kill();
}
