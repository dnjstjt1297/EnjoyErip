import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, submit } from './helpers.mjs';

test('공유게시판과 공지사항 작성/조회/수정, 검색, 저장 텍스트의 HTML 실행 방지', async () => {
  setupDOM('community');
  const store = await import('../frontend/assets/js/storage.js'); store.mutateDB((db) => db.users.push({ id: 'a', name: '여행자' })); store.setSession('a');
  await import('../frontend/assets/js/community.js');
  document.getElementById('writePost').click(); document.getElementById('postTitle').value = '<img src=x onerror=alert(1)> 여행 후기'; document.getElementById('postBody').value = '<script>attack()</script>'; submit('postForm');
  assert.equal(store.readDB().posts.length, 1); assert.equal(document.querySelectorAll('#postList img').length, 0);
  document.querySelector('[data-post]').click(); assert.equal(store.readDB().posts[0].views, 1); assert.equal(document.querySelectorAll('#postDetail script').length, 0);
  document.getElementById('editPost').click(); document.getElementById('postTitle').value = '수정한 여행 후기'; submit('postForm'); assert.equal(store.readDB().posts[0].title, '수정한 여행 후기');
  document.getElementById('postKeyword').value = '없는 검색어'; submit('postSearch'); assert.equal(document.getElementById('postEmpty').hidden, false);
  document.getElementById('postKeyword').value = ''; submit('postSearch'); document.querySelector('[data-board="notice"]').click(); document.getElementById('writePost').click(); document.getElementById('postTitle').value = '새 공지'; document.getElementById('postBody').value = '공지 내용'; submit('postForm');
  assert.equal(store.readDB().posts.find((post) => post.title === '새 공지').board, 'notice');
});
