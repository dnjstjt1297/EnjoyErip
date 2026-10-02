import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM } from './helpers.mjs';

test('회원별 데이터 격리, 작성자 권한, 중복 관광지 방지, 저장 오류 시 데이터 보존', async () => {
  setupDOM();
  const store = await import('../frontend/assets/js/storage.js');
  store.mutateDB((db) => db.users.push({ id: 'user-a' }, { id: 'user-b' })); store.setSession('user-a');
  const place = { contentid: '123', title: '관광지', mapx: 127, mapy: 37 };
  const post = store.saveOwned('posts', { title: '<script>attack</script>', body: '소개', board: 'share' });
  store.saveOwned('favorites', { place });
  store.addPlanPlace(place); assert.throws(() => store.addPlanPlace(place), /이미/);
  store.setSession('user-b'); assert.equal(store.ownedItems('plans').length, 0); assert.equal(store.ownedItems('favorites').length, 0);
  assert.throws(() => store.saveOwned('posts', { ...post, title: '변조' }), /작성자/);
  assert.throws(() => store.deleteOwned('posts', post.id), /작성자/);
  assert.equal(store.readDB().posts[0].title, post.title);
  const snapshot = localStorage.getItem(store.DB_KEY);
  localStorage.setItem(store.DB_KEY, 'broken json');
  assert.throws(() => store.readDB(), /읽을 수/); assert.equal(localStorage.getItem(store.DB_KEY), 'broken json');
  localStorage.setItem(store.DB_KEY, snapshot);
  const original = window.Storage.prototype.setItem;
  window.Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => store.saveOwned('posts', { title: '저장 실패', body: '본문' }), /저장 공간/);
  window.Storage.prototype.setItem = original;
  assert.equal(store.readDB().posts.length, 1);
});
