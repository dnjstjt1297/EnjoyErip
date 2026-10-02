import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, submit, waitFor } from './helpers.mjs';

test('회원 조회/수정 및 탈퇴 시 해당 회원 데이터만 삭제', async () => {
  setupDOM('mypage');
  const store = await import('../frontend/assets/js/storage.js');
  const salt = 'test-salt', passwordHash = await store.hashSecret('Member123!', salt);
  store.mutateDB((db) => {
    db.users.push({ id: 'a', username: 'membera', name: '기존 이름', email: 'a@example.com', salt, passwordHash, createdAt: new Date().toISOString() }, { id: 'b', name: '다른 회원', email: 'b@example.com' });
    db.posts.push({ id: 'post-a', userId: 'a' }, { id: 'post-b', userId: 'b' });
  });
  store.setSession('a'); store.addPlanPlace({ contentid: '1', title: '장소' });
  await import('../frontend/assets/js/mypage.js'); assert.equal(document.getElementById('profileName').value, '기존 이름');
  document.getElementById('profileName').value = '새 이름'; document.getElementById('currentPassword').value = 'Member123!'; submit('profileForm');
  await waitFor(() => store.currentUser().name === '새 이름');
  document.getElementById('deletePassword').value = '틀린 비밀번호'; document.getElementById('deleteAccount').click(); await waitFor(() => document.getElementById('toast').textContent.includes('비밀번호')); assert.equal(store.readDB().users.length, 2);
  document.getElementById('deletePassword').value = 'Member123!'; document.getElementById('deleteAccount').click(); await waitFor(() => document.querySelector('.confirm-dialog[open]'));
  document.querySelector('[data-confirm]').click(); await waitFor(() => store.currentUser() === null);
  assert.equal(store.readDB().users.length, 1); assert.equal(store.readDB().users[0].id, 'b'); assert.equal(store.readDB().plans.length, 0); assert.deepEqual(store.readDB().posts.map((post) => post.id), ['post-b']);
});
