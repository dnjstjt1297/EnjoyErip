import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as auth from '../js/services/auth-service.js';
import * as plans from '../js/services/plan-service.js';
import * as hotplaces from '../js/services/hotplace-service.js';
import { STORAGE_KEYS as K, readJson, writeJson, readArray } from '../js/services/storage-service.js';
import { escapeHtml, safeImageUrl, validCoordinates, validDate } from '../js/ui/helpers.js';

class MemoryStorage {
  data = new Map();
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}
beforeEach(() => { globalThis.localStorage = new MemoryStorage(); });
const user = (id = 'traveler') => ({ id, password: 'password123', passwordConfirm: 'password123', name: '여행자', email: `${id}@example.com` });
async function signedIn(id = 'traveler') { await auth.registerUser(user(id)); return auth.login(id, 'password123'); }
const place = (id = '1') => ({ contentid: id, title: `여행지 ${id}`, addr1: '서울', mapx: '126.9', mapy: '37.5', contenttypeid: '12' });
const hotplace = () => ({ name: '나의 카페', date: '2026-01-01', type: '카페', description: '조용한 곳', mapx: 127, mapy: 37.5 });

test('회원가입: 필수 값, 아이디, 비밀번호 확인, 이메일 검증', async () => {
  for (const patch of [{ id: '' }, { id: '<script>' }, { password: 'short', passwordConfirm: 'short' }, { passwordConfirm: 'different' }, { name: ' ' }, { email: 'bad-address' }]) {
    await assert.rejects(auth.registerUser({ ...user(), ...patch }));
  }
  assert.equal(auth.getUsers().length, 0);
});
test('회원가입: 중복과 동시에 들어오는 중복 요청 차단', async () => {
  const result = await Promise.allSettled([auth.registerUser(user()), auth.registerUser(user())]);
  assert.equal(result.filter(x => x.status === 'fulfilled').length, 1);
  await assert.rejects(auth.registerUser(user()), /이미 사용/);
});
test('비밀번호: 평문 저장 없이 사용자별 salt와 해시 저장', async () => {
  await auth.registerUser(user('alpha'));
  await auth.registerUser(user('bravo'));
  const [a, b] = auth.getUsers();
  assert.ok(a.passwordHash && a.passwordSalt);
  assert.notEqual(a.passwordHash, b.passwordHash);
  assert.equal(a.password, undefined);
  assert.ok(!localStorage.getItem(K.USERS).includes('password123'));
});
test('로그인 실패·성공, 세션 유지 및 공개 정보만 반환', async () => {
  await auth.registerUser(user());
  await assert.rejects(auth.login('traveler', 'incorrect'), /올바르지/);
  assert.equal(auth.getCurrentUser(), null);
  const result = await auth.login('traveler', 'password123');
  assert.deepEqual(Object.keys(result).sort(), ['email', 'id', 'name']);
  assert.deepEqual(readJson(K.CURRENT_USER), { id: 'traveler' });
  assert.equal(auth.getCurrentUser().id, 'traveler');
  auth.logout();
  assert.equal(auth.getCurrentUser(), null);
});
test('스타터의 평문 회원 데이터는 로그인 시 해시로 이전', async () => {
  writeJson(K.USERS, [{ id: 'legacy', password: '1234', name: '기존회원', email: 'old@example.com' }]);
  await auth.login('legacy', '1234');
  const record = auth.getUsers()[0];
  assert.equal(record.password, undefined);
  assert.ok(record.passwordHash);
});
test('회원 수정은 이름·이메일만 허용하고 비밀번호 변경 시 현재 비밀번호 확인', async () => {
  await signedIn();
  await auth.updateCurrentUser({ name: '새 이름', email: 'NEW@example.com', id: 'hijack' });
  assert.equal(auth.getCurrentUser().id, 'traveler');
  assert.equal(auth.getCurrentUser().email, 'new@example.com');
  const patch = { name: '새 이름', email: 'new@example.com', password: 'updated123', passwordConfirm: 'updated123' };
  await assert.rejects(auth.updateCurrentUser({ ...patch, currentPassword: 'wrong' }), /현재 비밀번호/);
  await auth.updateCurrentUser({ ...patch, currentPassword: 'password123' });
  auth.logout();
  await assert.rejects(auth.login('traveler', 'password123'));
  await auth.login('traveler', 'updated123');
});
test('비밀번호 찾기: 아이디+이메일 확인, 재설정 후 기존 비밀번호 무효', async () => {
  await signedIn();
  assert.throws(() => auth.verifyRecovery('traveler', 'wrong@example.com'));
  assert.equal(auth.verifyRecovery('traveler', 'traveler@example.com'), true);
  await assert.rejects(auth.resetPassword({ id: 'traveler', email: 'wrong@example.com', password: 'changed123', passwordConfirm: 'changed123' }));
  await auth.resetPassword({ id: 'traveler', email: 'traveler@example.com', password: 'changed123', passwordConfirm: 'changed123' });
  assert.equal(auth.getCurrentUser(), null);
  await assert.rejects(auth.login('traveler', 'password123'));
  await auth.login('traveler', 'changed123');
});
test('로그인 없이 여행계획·HotPlace 쓰기 차단', () => {
  assert.throws(() => plans.addDraftPlace(place()), /로그인/);
  assert.throws(() => plans.savePlan({}), /로그인/);
  assert.throws(() => hotplaces.saveHotplace(hotplace()), /로그인/);
});
test('여행 초안: 중복 추가 차단, 순서 변경, 삭제, 임시 저장', async () => {
  await signedIn();
  plans.addDraftPlace(place('1')); plans.addDraftPlace({ ...place('2'), firstimage: '', firstimage2: 'https://example.com/secondary.jpg' });
  assert.throws(() => plans.addDraftPlace(place('1')), /이미/);
  plans.moveDraftPlace(1, 0);
  plans.updateDraft({ title: '봄 여행', date: '2026-04-01', notes: '메모' });
  assert.deepEqual(plans.getDraft().places.map(x => x.contentid), ['2', '1']);
  plans.removeDraftPlace('1');
  assert.equal(plans.getDraft().places.length, 1);
  assert.equal(plans.getDraft().notes, '메모');
  assert.equal(plans.getDraft().places[0].firstimage, 'https://example.com/secondary.jpg');
});
test('여행계획: 저장, 불러오기, 수정, 경비와 날짜 검증, 삭제', async () => {
  await signedIn();
  const data = { title: '서울 여행', date: '2026-10-10', places: [place()], budget: 100000, notes: '지하철 이용' };
  for (const patch of [{ title: '' }, { date: '2026-02-30' }, { places: [] }, { budget: -1 }]) assert.throws(() => plans.savePlan({ ...data, ...patch }));
  const saved = plans.savePlan(data);
  plans.editPlan(saved.id);
  assert.equal(plans.getDraft().editingId, saved.id);
  plans.savePlan({ ...data, id: saved.id, title: '수정한 여행' });
  assert.equal(plans.getPlans().length, 1);
  assert.equal(plans.getPlans()[0].title, '수정한 여행');
  plans.deletePlan(saved.id);
  assert.equal(plans.getPlans().length, 0);
  assert.equal(plans.getDraft().places.length, 0);
});
test('회원 간 여행계획·임시 저장·HotPlace 격리와 변경 권한', async () => {
  await signedIn('alpha');
  plans.addDraftPlace(place());
  const plan = plans.savePlan({ title: '개인 여행', date: '2026-01-01', places: [place()] });
  const hot = hotplaces.saveHotplace(hotplace());
  await signedIn('bravo');
  assert.equal(plans.getPlans().length, 0);
  assert.equal(plans.getDraft().places.length, 0);
  assert.equal(hotplaces.getHotplaces().length, 0);
  assert.throws(() => plans.deletePlan(plan.id));
  assert.throws(() => plans.savePlan({ ...plan, title: '변조' }));
  assert.throws(() => hotplaces.deleteHotplace(hot.id));
  assert.throws(() => hotplaces.saveHotplace({ ...hot, name: '변조' }));
});
test('HotPlace: 필수 값·방문일·좌표·이미지 URL 검증과 CRUD', async () => {
  await signedIn();
  for (const patch of [{ name: '' }, { type: '' }, { description: '' }, { date: '2999-01-01' }, { mapx: '' }, { mapy: 200 }, { imageUrl: 'javascript:alert(1)' }]) assert.throws(() => hotplaces.saveHotplace({ ...hotplace(), ...patch }));
  const saved = hotplaces.saveHotplace(hotplace());
  hotplaces.saveHotplace({ ...saved, name: '수정한 카페' });
  assert.equal(hotplaces.getHotplaces()[0].name, '수정한 카페');
  hotplaces.deleteHotplace(saved.id);
  assert.equal(hotplaces.getHotplaces().length, 0);
});
test('회원 탈퇴: 본인 기록 삭제, 다른 회원과 소유자 없는 기존 데이터 보존', async () => {
  await signedIn('alpha');
  plans.addDraftPlace(place());
  plans.savePlan({ title: 'alpha', date: '2026-01-01', places: [place()] });
  hotplaces.saveHotplace(hotplace());
  await signedIn('bravo');
  plans.savePlan({ title: 'bravo', date: '2026-01-01', places: [place()] });
  writeJson(K.PLANS, [...readArray(K.PLANS), { id: 'old-plan', title: '스타터' }]);
  await auth.login('alpha', 'password123');
  auth.deleteCurrentUser();
  assert.equal(auth.getCurrentUser(), null);
  assert.ok(readArray(K.PLANS).some(x => x.ownerId === 'bravo'));
  assert.ok(readArray(K.PLANS).some(x => x.id === 'old-plan'));
  for (const key of [K.PLANS, K.DRAFTS, K.HOTPLACES]) assert.ok(!readArray(key).some(x => x.ownerId === 'alpha'));
  await assert.rejects(auth.login('alpha', 'password123'));
});
test('손상된 저장소를 조용히 덮어쓰지 않고 오류 표시', async () => {
  localStorage.setItem(K.USERS, 'not-json');
  await assert.rejects(auth.registerUser(user()), /읽을 수/);
  assert.equal(localStorage.getItem(K.USERS), 'not-json');
  writeJson(K.USERS, { invalid: true });
  assert.throws(() => auth.getUsers(), /형식/);
});
test('저장소 할당량 오류는 사용자에게 설명 가능한 오류로 변환', () => {
  localStorage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => writeJson(K.USERS, []), /저장 공간/);
});
test('외부 문자열 escaping, 이미지 프로토콜 제한, 날짜·좌표 검증', () => {
  assert.equal(escapeHtml('<img src="x" onerror=\'run()\'>'), '&lt;img src=&quot;x&quot; onerror=&#039;run()&#039;&gt;');
  assert.equal(safeImageUrl('javascript:alert(1)'), '');
  assert.equal(safeImageUrl('data:text/html,<script>'), '');
  assert.ok(validDate('2024-02-29')); assert.ok(!validDate('2025-02-29'));
  assert.ok(validCoordinates('37.5', '127')); assert.ok(!validCoordinates('', '127'));
  assert.ok(!validCoordinates('0', '0')); assert.ok(!validCoordinates('NaN', '127'));
});
