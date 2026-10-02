import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as auth from '../js/services/auth-service.js';
import * as plans from '../js/services/plan-service.js';
import * as hotplaces from '../js/services/hotplace-service.js';
import { getRegions, rememberRegions, resolveRegion, loadRegions } from '../js/services/region-service.js';
import { getVisits, getVisit, markVisited, removeVisit, getVisitStats } from '../js/services/visit-service.js';
import { STORAGE_KEYS as K, readArray, writeJson } from '../js/services/storage-service.js';
import { today } from '../js/ui/helpers.js';

class MemoryStorage {
  data = new Map();
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}
const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
  globalThis.window = new EventTarget();
  rememberRegions([
    { code: '11', name: '서울특별시' },
    { code: '26', name: '부산광역시' },
    { code: '36110', name: '세종특별자치시' },
  ]);
});
afterEach(() => { globalThis.fetch = originalFetch; delete globalThis.window; });
async function signedIn(id = 'traveler') {
  await auth.registerUser({ id, name: id, email: `${id}@example.com`, password: 'password123', passwordConfirm: 'password123' });
  await auth.login(id, 'password123');
}
const visit = (sourceId = '1', patch = {}) => ({
  source: 'tour', sourceId, title: '방문한 장소', regionCode: '11',
  regionName: '서울특별시', visitedAt: today(), addr1: '서울특별시 종로구', ...patch,
});

test('지역: 실제 응답 형식과 다섯 자리 코드 유지, 정규화된 주소만 연결', () => {
  assert.equal(getRegions().length, 3);
  assert.deepEqual(resolveRegion({ lDongRegnCd: '36110', addr1: '서울특별시' }), { code: '36110', name: '세종특별자치시' });
  assert.equal(resolveRegion({ addr1: '서울 종로구 사직로' }).code, '11');
  assert.equal(resolveRegion({ addr1: '부산광역시 해운대구' }).code, '26');
  assert.equal(resolveRegion({ areacode: '1', addr1: '알 수 없는 주소' }), null);
  assert.equal(resolveRegion({ lDongRegnCd: '36', addr1: '' }), null);
  assert.equal(resolveRegion({ addr1: '광주광역시' }), null);
});

test('지역: 빈 응답·중복·잘못된 코드로 기존 캐시를 덮어쓰지 않음', () => {
  const before = localStorage.getItem(K.REGIONS);
  for (const input of [[], [{ code: 'A', name: '가짜' }], [{ code: '11', name: '' }], [{ code: '11', name: '서울' }, { code: '11', name: '서울' }]]) {
    assert.throws(() => rememberRegions(input));
    assert.equal(localStorage.getItem(K.REGIONS), before);
  }
  localStorage.setItem(K.REGIONS, 'broken-json');
  assert.throws(() => getRegions(), /읽을 수/);
  assert.equal(localStorage.getItem(K.REGIONS), 'broken-json');
});

test('지역: 네트워크 실패 시 검증된 캐시 사용, 캐시가 없으면 오류 반환', async () => {
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  assert.equal((await loadRegions()).length, 3);
  localStorage.removeItem(K.REGIONS);
  await assert.rejects(loadRegions());
  assert.deepEqual(getRegions(), []);
});

test('방문: 로그인·명시적 장소·실제 지역·방문일 검증', async () => {
  assert.throws(() => markVisited(visit()), /로그인/);
  assert.throws(() => removeVisit('tour', '1'), /로그인/);
  assert.deepEqual(getVisits(), []);
  await signedIn();
  for (const patch of [{ source: 'unknown' }, { sourceId: '' }, { title: '' }, { regionCode: '' }, { regionCode: '99' }, { visitedAt: '2025-02-29' }, { visitedAt: '2999-01-01' }]) {
    assert.throws(() => markVisited(visit('1', patch)));
  }
  assert.equal(getVisits().length, 0);
  const record = markVisited(visit('1', { regionName: '조작된 지역명', imageUrl: 'javascript:alert(1)' }));
  assert.equal(record.regionName, '서울특별시');
  assert.equal(record.imageUrl, '');
});

test('방문: 중복 클릭은 개수와 방문일을 바꾸지 않고 쓰기 이벤트도 한 번만 발생', async () => {
  await signedIn();
  let events = 0;
  window.addEventListener('visitschange', () => events++);
  const first = markVisited(visit('1', { visitedAt: '2025-01-03' }));
  const second = markVisited(visit('1'));
  assert.deepEqual(second, first);
  assert.equal(getVisits().length, 1);
  assert.equal(events, 1);
  assert.equal(getVisit('tour', '1').visitedAt, '2025-01-03');
  // The same numeric identifier in two sources represents different records.
  markVisited(visit('1', { source: 'hotplace' }));
  assert.equal(getVisits().length, 2);
  assert.equal(removeVisit('tour', 'missing'), false);
  assert.equal(events, 2);
  assert.equal(removeVisit('tour', '1'), true);
  assert.equal(getVisit('tour', '1'), undefined);
  assert.ok(getVisit('hotplace', '1'));
  assert.equal(events, 3);
});

test('여행 여권: 실제 방문 수·지역 Stamp·월별 방문·미방문 지역 계산', async () => {
  await signedIn();
  assert.deepEqual(getVisitStats().topRegion, null);
  markVisited(visit('1'));
  markVisited(visit('2', { visitedAt: '2025-01-03' }));
  markVisited(visit('3', { regionCode: '36110' }));
  const stats = getVisitStats();
  assert.equal(stats.visitedPlaces, 3);
  assert.equal(stats.visitedRegions, 2);
  assert.equal(stats.totalRegions, 3);
  assert.equal(stats.thisMonth, 2);
  assert.deepEqual(stats.topRegion, { name: '서울특별시', count: 2 });
  assert.equal(stats.regions.find(item => item.code === '26').count, 0);
  assert.equal(stats.regions.find(item => item.code === '11').lastVisited, today());
  removeVisit('tour', '3');
  assert.equal(getVisitStats().visitedRegions, 1);
});

test('여행 여권: API 지역 목록이 바뀌어도 이전 방문을 삭제하거나 새 지역에 임의 배정하지 않음', async () => {
  await signedIn();
  markVisited(visit('1', { regionCode: '26' }));
  rememberRegions([{ code: '11', name: '서울특별시' }]);
  const stats = getVisitStats();
  assert.equal(stats.visitedPlaces, 1);
  assert.equal(stats.totalRegions, 1);
  assert.equal(stats.visitedRegions, 0);
  assert.equal(stats.unassignedRegions[0].code, '26');
  assert.equal(stats.unassignedRegions[0].count, 1);
  assert.equal(markVisited(visit('1', { regionCode: '26' })).regionName, '부산광역시');
  removeVisit('tour', '1');
  assert.equal(getVisitStats().unassignedRegions.length, 0);
});

test('방문: 회원 간 격리·로그인 유지·계정 삭제 시 본인 기록만 삭제', async () => {
  await signedIn('alpha');
  markVisited(visit('1'));
  await signedIn('bravo');
  assert.equal(getVisits().length, 0);
  assert.equal(removeVisit('tour', '1'), false);
  markVisited(visit('1', { regionCode: '26' }));
  writeJson(K.VISITS, [...readArray(K.VISITS), { source: 'tour', sourceId: 'legacy' }]);
  await auth.login('alpha', 'password123');
  assert.equal(getVisits()[0].regionCode, '11');
  auth.deleteCurrentUser();
  assert.equal(getVisits().length, 0);
  assert.ok(readArray(K.VISITS).some(item => item.ownerId === 'bravo'));
  assert.ok(readArray(K.VISITS).some(item => item.sourceId === 'legacy'));
  assert.ok(!readArray(K.VISITS).some(item => item.ownerId === 'alpha'));
  await auth.login('bravo', 'password123');
  assert.equal(getVisits().length, 1);
  assert.equal(getVisit('tour', '1').regionCode, '26');
});

test('여행계획: 법정동 코드를 보존하고 저장·삭제만으로 방문을 생성하거나 제거하지 않음', async () => {
  await signedIn();
  const place = { contentid: '1', title: '세종 방문지', lDongRegnCd: '36110', lDongSignguCd: '100', addr1: '세종특별자치시' };
  plans.addDraftPlace(place);
  assert.equal(plans.getDraft().places[0].lDongRegnCd, '36110');
  const saved = plans.savePlan({ title: '세종 여행', date: today(), places: plans.getDraft().places });
  assert.equal(saved.places[0].lDongSignguCd, '100');
  assert.equal(getVisits().length, 0);
  markVisited(visit('1', { regionCode: '36110' }));
  plans.deletePlan(saved.id);
  assert.equal(getVisits().length, 1);
});

test('HotPlace: 등록 자체는 방문 처리하지 않고 삭제해도 여권 기록은 별도로 보존', async () => {
  await signedIn();
  const saved = hotplaces.saveHotplace({ name: '내 장소', date: today(), type: '명소', description: '나만의 발견', mapx: 127, mapy: 37 });
  assert.equal(getVisits().length, 0);
  markVisited(visit(saved.id, { source: 'hotplace' }));
  hotplaces.deleteHotplace(saved.id);
  assert.equal(getVisits().length, 1);
});

test('방문: 저장소 손상·할당량 오류 때 기존 기록과 이벤트 상태 보존', async () => {
  await signedIn();
  let events = 0;
  window.addEventListener('visitschange', () => events++);
  localStorage.setItem(K.VISITS, 'broken-json');
  assert.throws(() => markVisited(visit()), /읽을 수/);
  assert.equal(localStorage.getItem(K.VISITS), 'broken-json');
  localStorage.removeItem(K.VISITS);
  localStorage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => markVisited(visit()), /저장 공간/);
  assert.equal(events, 0);
});
