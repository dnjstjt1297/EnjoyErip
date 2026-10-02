import { initSite } from './site.js';
import { requireLogin } from './auth.js';
import { currentUser, readDB, saveOwned, deleteOwned, mutateDB } from './storage.js';
import { $, escapeHTML as e, formatDate, openDialog, confirmAction, toast } from './ui.js';

initSite();
let board = 'share', keyword = '', page = 1;
const PAGE_SIZE = 10;
function render() {
  const db = readDB();
  const list = db.posts.filter((post) => post.board === board && (!keyword || `${post.title} ${post.body} ${db.users.find((user) => user.id === post.userId)?.name || ''}`.toLowerCase().includes(keyword.toLowerCase()))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const count = Math.max(1, Math.ceil(list.length / PAGE_SIZE)); page = Math.min(page, count);
  $('#postList').innerHTML = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((post, index) => `<tr><td>${list.length - ((page - 1) * PAGE_SIZE + index)}</td><td><button class="post-title-link" data-post="${e(post.id)}">${e(post.title)}</button></td><td>${e(db.users.find((user) => user.id === post.userId)?.name || '탈퇴한 회원')}</td><td>${formatDate(post.createdAt)}</td><td>${Number(post.views || 0)}</td></tr>`).join('');
  $('#postEmpty').hidden = list.length > 0; $('#postPage').textContent = `${page} / ${count}`;
  $('#postPrev').disabled = page === 1; $('#postNext').disabled = page === count;
  document.querySelectorAll('[data-board]').forEach((button) => { const active = button.dataset.board === board; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
}
function editor(id) {
  const post = id ? readDB().posts.find((item) => item.id === id) : null;
  if (post && post.userId !== currentUser()?.id) { toast('작성자만 수정할 수 있어요.'); return; }
  $('#postId').value = post?.id || ''; $('#postTitle').value = post?.title || ''; $('#postBody').value = post?.body || '';
  $('#postEditTitle').textContent = `${post ? '이야기 수정' : '새 이야기 작성'} · ${board === 'notice' ? '공지사항' : '공유게시판'}`;
  $('#postError').hidden = true; openDialog($('#postEditDialog'));
}
function showPost(id) {
  mutateDB((db) => { const post = db.posts.find((item) => item.id === id); if (post) post.views = Number(post.views || 0) + 1; });
  const db = readDB(), post = db.posts.find((item) => item.id === id); if (!post) return;
  const own = post.userId === currentUser()?.id;
  $('#postDetail').innerHTML = `<p class="eyebrow">${post.board === 'notice' ? 'NOTICE' : 'TRAVEL STORIES'}</p><h2 id="postDetailTitle">${e(post.title)}</h2><p class="post-meta">${e(db.users.find((user) => user.id === post.userId)?.name || '여행자')} · ${formatDate(post.createdAt)} · 조회 ${Number(post.views)}${post.updatedAt !== post.createdAt ? ` · 수정 ${formatDate(post.updatedAt)}` : ''}</p><div class="post-body">${e(post.body)}</div>${own ? '<div class="post-edit-actions"><button class="button button-secondary" id="editPost">수정</button><button class="button button-danger" id="deletePost">삭제</button></div>' : ''}`;
  openDialog($('#postDetailDialog')); render();
  $('#editPost')?.addEventListener('click', () => editor(id));
  $('#deletePost')?.addEventListener('click', async () => {
    if (!await confirmAction('게시글을 삭제할까요?', '작성한 제목과 내용을 삭제합니다.')) return;
    try { deleteOwned('posts', id); render(); toast('게시글을 삭제했어요.'); } catch (error) { toast(error.message); }
  });
}
$('#writePost').onclick = () => requireLogin(() => editor());
document.querySelectorAll('[data-board]').forEach((button) => button.onclick = () => { board = button.dataset.board; page = 1; render(); });
$('#postSearch').onsubmit = (event) => { event.preventDefault(); keyword = $('#postKeyword').value.trim(); page = 1; render(); };
$('#postPrev').onclick = () => { page--; render(); }; $('#postNext').onclick = () => { page++; render(); };
$('#postList').onclick = (event) => { const button = event.target.closest('[data-post]'); if (button) showPost(button.dataset.post); };
$('#postForm').onsubmit = (event) => {
  event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
  try {
    const title = $('#postTitle').value.trim(), body = $('#postBody').value.trim();
    if (!title || !body) throw new Error('제목과 내용을 입력해 주세요.');
    const existing = readDB().posts.find((item) => item.id === $('#postId').value);
    saveOwned('posts', { id: existing?.id, board: existing?.board || board, title, body, views: existing?.views || 0 });
    $('#postEditDialog').close(); render(); toast('이야기를 저장했어요.');
  } catch (error) { $('#postError').textContent = error.message; $('#postError').hidden = false; }
};
window.addEventListener('authchange', render); render();
