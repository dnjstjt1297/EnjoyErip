export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export function escapeHTML(value = '') { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
export function plainText(html = '') { return new DOMParser().parseFromString(String(html), 'text/html').body.textContent || ''; }
export function safeImage(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href.replace(/^http:/, 'https:') : ''; } catch { return ''; }
}
let toastTimer;
export function toast(message) {
  let node = $('#toast');
  if (!node) { node = document.createElement('div'); node.id = 'toast'; node.className = 'toast'; node.setAttribute('role', 'status'); document.body.append(node); }
  node.textContent = message; node.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 4000);
}
export function openDialog(dialog) {
  $$('dialog[open]').forEach((other) => { if (other !== dialog) other.close(); });
  if (!dialog.open) dialog.showModal();
  document.body.classList.add('modal-open');
}
export function wireDialogs() {
  $$('dialog').forEach((dialog) => {
    if (dialog.dataset.wired) return;
    dialog.dataset.wired = 'true';
    dialog.addEventListener('close', () => document.body.classList.toggle('modal-open', Boolean($('dialog[open]'))));
    dialog.addEventListener('click', (event) => {
      if (event.target.closest('[data-close]')) dialog.close();
      if (event.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
      }
    });
  });
}
export function confirmAction(title, description) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog'); dialog.className = 'dialog confirm-dialog';
    dialog.innerHTML = `<h2>${escapeHTML(title)}</h2><p class="dialog-intro">${escapeHTML(description)}</p><div class="d-flex gap-2"><button class="button button-primary" data-confirm>확인</button><button class="button button-secondary" data-close>취소</button></div>`;
    document.body.append(dialog); wireDialogs();
    let confirmed = false;
    $('[data-confirm]', dialog).onclick = () => { confirmed = true; dialog.close(); };
    dialog.addEventListener('close', () => { resolve(confirmed); dialog.remove(); }, { once: true });
    openDialog(dialog);
  });
}
export function downloadJSON(name, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const formatDate = (value) => value ? new Date(value).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-';
export const money = (value) => Number(value || 0).toLocaleString('ko-KR') + '원';
