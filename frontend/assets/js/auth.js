import { currentUser, readDB, mutateDB, uid, hashSecret, setSession } from './storage.js';
import { $, escapeHTML, openDialog, wireDialogs, toast } from './ui.js';

const questions = ['가장 기억에 남는 여행지는?', '어릴 때 좋아했던 음식은?', '나만 알고 있는 별명은?'];
let dialog;
let mode = 'login';
let afterLogin;
const field = (label, name, type = 'text', extra = '') => `<label class="form-label" for="auth-${name}">${label}</label><input class="form-control" id="auth-${name}" name="${name}" type="${type}" ${extra} required/>`;

export function initAuth() {
  if (dialog) return;
  dialog = document.createElement('dialog'); dialog.id = 'authDialog'; dialog.className = 'dialog auth-dialog';
  document.body.append(dialog); wireDialogs();
  $('#loginButton')?.addEventListener('click', () => { if (currentUser()) location.href = 'mypage.html'; else showAuth('login'); });
  window.addEventListener('authchange', updateAccount);
  window.addEventListener('storage', updateAccount);
  updateAccount();
}
function updateAccount() {
  try {
    const user = currentUser();
    const button = $('#loginButton');
    const label = $('[data-login-label]', button || document);
    if (label) label.textContent = user ? `${user.name}님` : '로그인';
    button?.setAttribute('aria-label', user ? '마이페이지 열기' : '로그인');
    $('[data-logout]')?.toggleAttribute('hidden', !user);
  } catch (error) { toast(error.message); }
}
export function requireLogin(callback) {
  if (currentUser()) { callback?.(); return true; }
  afterLogin = callback;
  showAuth('login');
  return false;
}
export function showAuth(nextMode = 'login') {
  initAuth(); mode = nextMode;
  const titles = { login: '다음 여행도, 함께.', register: '새로운 여행의 시작.', recover: '비밀번호를 재설정해요.' };
  let fields = field('아이디', 'username', 'text', 'autocomplete="username" minlength="4" maxlength="20" pattern="[A-Za-z][A-Za-z0-9_]{3,19}"');
  if (mode === 'register') fields += field('이름', 'name', 'text', 'maxlength="30" autocomplete="name"') + field('이메일', 'email', 'email', 'maxlength="100" autocomplete="email"');
  if (mode === 'recover') fields += field('가입한 이메일', 'email', 'email', 'autocomplete="email" maxlength="100"') + `<p id="recoveryQuestion" class="small text-secondary mt-3">아이디와 이메일을 입력한 후 보안 질문을 확인해 주세요.</p><button class="text-button" type="button" id="lookupQuestion">보안 질문 확인 →</button>`;
  if (mode !== 'login') {
    if (mode === 'register') fields += `<label for="auth-question" class="form-label">비밀번호 찾기용 보안 질문</label><select class="form-select" name="question" id="auth-question">${questions.map((q) => `<option>${q}</option>`).join('')}</select>`;
    fields += field('보안 질문 답변', 'answer', 'text', 'maxlength="100" autocomplete="off"');
  }
  fields += field(mode === 'recover' ? '새 비밀번호' : '비밀번호', 'password', 'password', `minlength="8" maxlength="72" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"`);
  if (mode !== 'login') fields += field('비밀번호 확인', 'confirm', 'password', 'minlength="8" maxlength="72" autocomplete="new-password"');
  dialog.innerHTML = `<button type="button" class="dialog-close" data-close aria-label="회원 창 닫기">×</button><p class="eyebrow">HELLO, TRAVELER.</p><h2 id="authTitle">${titles[mode]}</h2><p class="dialog-intro">${mode === 'register' ? '아이디는 영문으로 시작하는 4~20자입니다. 가입 정보는 이 브라우저에 저장됩니다.' : mode === 'recover' ? '가입 시 등록한 이메일과 보안 질문 답변으로 확인합니다.' : '아이디와 비밀번호로 로그인해 주세요.'}</p><form id="authForm">${fields}<p id="authError" class="form-error" role="alert" hidden></p><button class="button button-primary w-100 mt-4" type="submit">${mode === 'login' ? '로그인' : mode === 'register' ? '회원가입' : '비밀번호 재설정'}</button></form><div class="auth-links"><button type="button" data-mode="${mode === 'login' ? 'register' : 'login'}">${mode === 'login' ? '회원가입' : '로그인으로 돌아가기'}</button>${mode === 'login' ? '<button type="button" data-mode="recover">비밀번호 찾기</button>' : ''}</div>`;
  dialog.setAttribute('aria-labelledby', 'authTitle');
  dialog.querySelectorAll('[data-mode]').forEach((button) => button.onclick = () => showAuth(button.dataset.mode));
  $('#lookupQuestion', dialog)?.addEventListener('click', () => {
    const values = new FormData($('#authForm'));
    const user = readDB().users.find((item) => item.username === values.get('username').trim().toLowerCase() && item.email === values.get('email').trim().toLowerCase());
    $('#recoveryQuestion').textContent = user ? user.question : '일치하는 회원이 없습니다. 아이디와 이메일을 확인해 주세요.';
  });
  $('#authForm').onsubmit = submitAuth;
  openDialog(dialog);
}
async function submitAuth(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  const username = data.username.trim().toLowerCase();
  const button = $('button[type=submit]', form); button.disabled = true;
  $('#authError').hidden = true;
  try {
    const db = readDB();
    const user = db.users.find((item) => item.username === username);
    if (mode !== 'login' && data.password !== data.confirm) throw new Error('비밀번호 확인이 일치하지 않습니다.');
    if (mode === 'register') {
      if (!data.name.trim() || !data.answer.trim()) throw new Error('이름과 보안 질문 답변을 입력해 주세요.');
      if (user) throw new Error('이미 사용 중인 아이디입니다.');
      const email = data.email.trim().toLowerCase();
      if (db.users.some((item) => item.email === email)) throw new Error('이미 가입한 이메일입니다.');
      const salt = uid();
      const [passwordHash, answerHash] = await Promise.all([hashSecret(data.password, salt), hashSecret(data.answer.trim().toLowerCase(), salt)]);
      const record = { id: uid(), username, name: data.name.trim(), email, question: data.question, salt, passwordHash, answerHash, createdAt: new Date().toISOString() };
      mutateDB((latest) => {
        if (latest.users.some((item) => item.username === username || item.email === email)) throw new Error('이미 가입된 아이디 또는 이메일입니다.');
        latest.users.push(record);
      });
      setSession(record.id); toast('회원가입을 완료했어요. 새로운 여행을 시작해 보세요.');
    } else if (mode === 'login') {
      if (!user || await hashSecret(data.password, user.salt) !== user.passwordHash) throw new Error('아이디 또는 비밀번호를 확인해 주세요.');
      setSession(user.id); toast(`${user.name}님, 반가워요.`);
    } else {
      if (!user || user.email !== data.email.trim().toLowerCase() || await hashSecret(data.answer.trim().toLowerCase(), user.salt) !== user.answerHash) throw new Error('아이디, 이메일 또는 보안 질문 답변이 일치하지 않습니다.');
      const passwordHash = await hashSecret(data.password, user.salt);
      mutateDB((latest) => { latest.users.find((item) => item.id === user.id).passwordHash = passwordHash; });
      if (currentUser()?.id === user.id) setSession(null);
      toast('비밀번호를 변경했어요. 새 비밀번호로 로그인해 주세요.');
      showAuth('login'); return;
    }
    dialog.close();
    const callback = afterLogin; afterLogin = null; callback?.();
  } catch (error) { $('#authError').textContent = error.message; $('#authError').hidden = false; }
  finally { button.disabled = false; }
}
