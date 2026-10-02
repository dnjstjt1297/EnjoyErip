import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerUser, login, deleteCurrentUser } from '../js/services/auth-service.js';
import { getHotplaces, saveHotplace, deleteHotplace } from '../js/services/hotplace-service.js';
import { getVisits } from '../js/services/visit-service.js';
import { STORAGE_KEYS as K, writeJson, readArray } from '../js/services/storage-service.js';
import { safePhotoData, photoMarkup, compressPhoto } from '../js/ui/hotplace-photo.js';
import { safeImageUrl } from '../js/ui/helpers.js';

class MemoryStorage {
  data = new Map();
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}
beforeEach(() => { globalThis.localStorage = new MemoryStorage(); });
async function signedIn(id = 'traveler') {
  await registerUser({ id, name: id, email: `${id}@example.com`, password: 'password123', passwordConfirm: 'password123' });
  await login(id, 'password123');
}
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const place = (patch = {}) => ({ name: '기억할 장소', date: '2026-01-01', type: '카페', description: '나의 여행 기록', mapx: 126.98, mapy: 37.57, ...patch });
const tour = { contentid: '12345', title: '선택한 관광지', addr1: '서울특별시 종로구', contenttypeid: '12', mapx: '126.98', mapy: '37.57', lDongRegnCd: '11', lDongSignguCd: '110', lclsSystm1: 'HS', firstimage2: 'https://example.com/place.jpg' };

test('기존 HotPlace: date/imageUrl/id/ownerId 유지, 읽기만으로 기존 저장소를 변경하지 않음', async () => {
  await signedIn();
  const legacy = { id: 'existing', ownerId: 'traveler', ...place(), imageUrl: 'https://example.com/old.jpg', createdAt: '2025-01-01T00:00:00.000Z' };
  writeJson(K.HOTPLACES, [legacy, { id: 'unowned', name: '소유자 없는 예전 기록' }]);
  const before = localStorage.getItem(K.HOTPLACES);
  assert.equal(getHotplaces().length, 1);
  assert.equal(localStorage.getItem(K.HOTPLACES), before);
  const updated = saveHotplace({ ...legacy, name: '수정한 기존 장소' });
  assert.equal(updated.id, legacy.id);
  assert.equal(updated.ownerId, legacy.ownerId);
  assert.equal(updated.date, legacy.date);
  assert.equal(updated.imageUrl, legacy.imageUrl);
  assert.equal(updated.createdAt, legacy.createdAt);
  assert.equal(updated.photo, '');
  assert.equal(updated.address, '');
  assert.equal(updated.touristPlace, null);
  assert.ok(readArray(K.HOTPLACES).some(item => item.id === 'unowned'));
});

test('사진 URL·사진 없는 기록과 원석 사진 업로드가 같은 canonical 저장소에서 공존', async () => {
  await signedIn();
  saveHotplace(place({ name: '사진 없음' }));
  saveHotplace(place({ name: 'URL 사진', imageUrl: 'https://example.com/photo.jpg' }));
  const uploaded = saveHotplace(place({ name: '직접 촬영', photo: pixel, address: '서울특별시 종로구' }));
  assert.equal(getHotplaces().length, 3);
  assert.equal(uploaded.photo, pixel);
  assert.equal(uploaded.imageUrl, '');
  assert.equal(uploaded.address, '서울특별시 종로구');
  assert.equal(localStorage.getItem('enjoytrip.db.v1'), null);
  assert.equal(localStorage.getItem('enjoytrip.session.v1'), null);
  assert.equal(getVisits().length, 0);
});

test('연결 관광지: 법정동 및 사진 fallback 보존, 수정 후 선택 해제 가능', async () => {
  await signedIn();
  const saved = saveHotplace(place({ photo: pixel, address: tour.addr1, touristPlace: tour }));
  assert.equal(saved.touristPlace.contentid, tour.contentid);
  assert.equal(saved.touristPlace.lDongRegnCd, '11');
  assert.equal(saved.touristPlace.lDongSignguCd, '110');
  assert.equal(saved.touristPlace.firstimage, tour.firstimage2);
  const updated = saveHotplace({ ...saved, name: '이름 수정' });
  assert.equal(updated.touristPlace.contentid, tour.contentid);
  assert.equal(updated.photo, pixel);
  const cleared = saveHotplace({ ...updated, touristPlace: null, photo: '' });
  assert.equal(cleared.touristPlace, null);
  assert.equal(cleared.photo, '');
  assert.equal(cleared.address, tour.addr1);
  assert.equal(getVisits().length, 0, '관광지 연결과 사진 저장은 방문 기록을 만들지 않음');
});

test('업로드 사진은 작은 raster data URL만 허용하며 일반 이미지 URL 검증은 약화하지 않음', async () => {
  assert.equal(safePhotoData(pixel), pixel);
  assert.equal(safeImageUrl(pixel), '');
  for (const photo of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,YQ==', 'javascript:alert(1)', 'data:image/png;base64,<script>', `data:image/jpeg;base64,${'A'.repeat(700001)}`]) {
    assert.equal(safePhotoData(photo), '');
  }
  await assert.rejects(compressPhoto({ type: 'image/svg+xml', size: 30 }), /JPEG/);
  await assert.rejects(compressPhoto({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }), /5MB/);
  assert.ok(photoMarkup(pixel, '', '<script>bad()</script>').includes('&lt;script&gt;'));
  assert.ok(!photoMarkup('data:image/svg+xml;base64,YQ==', '', '대체').includes('src='));
  await signedIn();
  assert.throws(() => saveHotplace(place({ photo: 'data:image/svg+xml;base64,YQ==' })), /압축된 사진/);
  assert.equal(getHotplaces().length, 0);
});

test('새 필드도 검증: 주소 길이·잘못된 관광지 연결로 기존 기록을 덮어쓰지 않음', async () => {
  await signedIn();
  const saved = saveHotplace(place({ touristPlace: tour, photo: pixel }));
  const before = localStorage.getItem(K.HOTPLACES);
  assert.throws(() => saveHotplace({ ...saved, address: '가'.repeat(151) }), /150자/);
  assert.throws(() => saveHotplace({ ...saved, touristPlace: { title: 'ID 없음' } }), /관광지 정보/);
  assert.equal(localStorage.getItem(K.HOTPLACES), before);
});

test('다른 회원의 원석 확장 기록 조회·수정·삭제 금지 및 탈퇴 정리', async () => {
  await signedIn('alpha');
  const saved = saveHotplace(place({ photo: pixel, address: tour.addr1, touristPlace: tour }));
  await signedIn('bravo');
  assert.deepEqual(getHotplaces(), []);
  assert.throws(() => saveHotplace({ ...saved, name: '변조' }), /찾을 수/);
  assert.throws(() => deleteHotplace(saved.id), /찾을 수/);
  saveHotplace(place({ name: '다른 회원 기록' }));
  await login('alpha', 'password123'); deleteCurrentUser();
  assert.ok(!readArray(K.HOTPLACES).some(item => item.ownerId === 'alpha'));
  assert.ok(readArray(K.HOTPLACES).some(item => item.ownerId === 'bravo'));
});

test('업로드 사진으로 용량을 초과해도 기존 장소 기록을 유지', async () => {
  await signedIn();
  saveHotplace(place());
  const before = localStorage.getItem(K.HOTPLACES);
  localStorage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => saveHotplace(place({ photo: pixel })), /저장 공간/);
  assert.equal(localStorage.getItem(K.HOTPLACES), before);
});
