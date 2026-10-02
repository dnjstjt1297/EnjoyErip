import { initSite } from './site.js';
import { requireLogin } from './auth.js';
import { currentUser, readDB, mutateDB, hashSecret, setSession } from './storage.js';
import { $, escapeHTML as e, formatDate, toast, confirmAction, downloadJSON } from './ui.js';

initSite();
function render() {
  const user = currentUser(); $('#accountGate').hidden = Boolean(user); $('#accountContent').hidden = !user;
  if (!user) return;
  const db = readDB();
  $('#profileUsername').value = user.username; $('#profileName').value = user.name; $('#profileEmail').value = user.email;
  $('#profileGreeting').textContent = `${user.name}님, 반가워요.`; $('#memberSince').textContent = `${formatDate(user.createdAt)}부터 함께한 여행자`;
  $('#accountStats').innerHTML = [['여행 계획', 'plans', 'planner.html'], ['찜한 장소', 'favorites', 'explore.html?favorites=1'], ['핫플레이스', 'hotplaces', 'hotplace.html']].map(([title, key, href]) => `<a href="${href}"><strong>${db[key].filter((item) => item.userId === user.id).length}</strong>${e(title)}</a>`).join('');
}
$('#accountLogin').onclick = () => requireLogin(render);
$('#profileForm').onsubmit = async (event) => {
  event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
  const button = $('button[type=submit]', event.currentTarget); button.disabled = true; $('#profileError').hidden = true;
  try {
    const user = currentUser(); if (!user) throw new Error('다시 로그인해 주세요.');
    if (await hashSecret($('#currentPassword').value, user.salt) !== user.passwordHash) throw new Error('현재 비밀번호가 일치하지 않습니다.');
    const name = $('#profileName').value.trim(), email = $('#profileEmail').value.trim().toLowerCase(), password = $('#newPassword').value;
    if (!name) throw new Error('이름을 입력해 주세요.');
    if (password !== $('#newPasswordConfirm').value) throw new Error('새 비밀번호 확인이 일치하지 않습니다.');
    const passwordHash = password ? await hashSecret(password, user.salt) : user.passwordHash;
    mutateDB((db) => {
      if (db.users.some((item) => item.id !== user.id && item.email === email)) throw new Error('이미 사용 중인 이메일입니다.');
      const target = db.users.find((item) => item.id === user.id); if (!target) throw new Error('회원 정보를 찾을 수 없습니다.');
      Object.assign(target, { name, email, passwordHash });
    });
    $('#currentPassword').value = $('#newPassword').value = $('#newPasswordConfirm').value = '';
    window.dispatchEvent(new CustomEvent('authchange')); toast('회원 정보를 수정했어요.');
  } catch (error) { $('#profileError').textContent = error.message; $('#profileError').hidden = false; }
  finally { button.disabled = false; }
};
$('#deleteAccount').onclick = async () => {
  try {
    const user = currentUser(); if (!user) return;
    if (await hashSecret($('#deletePassword').value, user.salt) !== user.passwordHash) throw new Error('탈퇴할 계정의 비밀번호를 확인해 주세요.');
    if (!await confirmAction('정말 탈퇴하시겠어요?', '회원 정보와 이 계정이 작성한 여행 계획, 찜, 핫플레이스, 게시글을 모두 삭제합니다.')) return;
    mutateDB((db) => {
      db.users = db.users.filter((item) => item.id !== user.id);
      for (const collection of ['plans', 'favorites', 'hotplaces', 'posts']) db[collection] = db[collection].filter((item) => item.userId !== user.id);
    });
    setSession(null); toast('회원 탈퇴를 완료했어요.'); render();
  } catch (error) { toast(error.message); }
};
$('#exportData').onclick = () => {
  const user = currentUser(); if (!user) return;
  const db = readDB();
  const backup = { version: 1, exportedAt: new Date().toISOString(), profile: { username: user.username, name: user.name, email: user.email } };
  for (const collection of ['plans', 'favorites', 'hotplaces', 'posts']) backup[collection] = db[collection].filter((item) => item.userId === user.id);
  downloadJSON('enjoytrip-my-data.json', backup); toast('내 여행 데이터를 백업했어요.');
};
window.addEventListener('authchange', render); render();
