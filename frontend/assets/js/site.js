import { initAuth } from './auth.js';
import { setSession } from './storage.js';
import { $, wireDialogs, toast } from './ui.js';

export function initSite() {
  const navigation = `<a href="explore.html">관광지 탐색</a><a href="planner.html">여행 계획</a><a href="hotplace.html">핫플레이스</a><a href="community.html">커뮤니티</a>`;
  const header = $('#siteHeader');
  if (header) header.innerHTML = `<a class="brand" href="index.html"><img src="assets/images/favicon.svg" alt="" width="33" height="33"/>enjoytrip<span class="brand-period">.</span></a><button class="menu-toggle" id="menuToggle" aria-label="메뉴 열기" aria-expanded="false">☰</button><nav class="service-nav" id="serviceNav" aria-label="주 메뉴">${navigation}</nav><button class="login-button" id="loginButton"><span data-login-label>로그인</span> ↗</button>`;
  const homeNav = $('#homeNav');
  if (homeNav) homeNav.innerHTML = navigation;
  const page = location.pathname.split('/').pop();
  document.querySelectorAll('.service-nav a').forEach((link) => { if (link.getAttribute('href') === page) { link.classList.add('active'); link.setAttribute('aria-current', 'page'); } });
  $('#menuToggle')?.addEventListener('click', (event) => {
    const opened = $('#serviceNav').classList.toggle('open'); event.currentTarget.setAttribute('aria-expanded', String(opened));
  });
  $('#siteFooter')?.insertAdjacentHTML('beforeend', `<a class="brand" href="index.html">enjoytrip<span class="brand-period">.</span></a><span>당신의 다음 여행을 함께 만들어 갑니다.</span><small>관광정보·사진 출처: 한국관광공사 TourAPI</small>`);
  document.querySelector('[data-logout]')?.addEventListener('click', () => { setSession(null); toast('로그아웃했어요.'); location.href = 'index.html'; });
  wireDialogs(); initAuth();
  window.addEventListener('unhandledrejection', (event) => { if (event.reason?.name !== 'AbortError') toast(event.reason?.message || '처리 중 오류가 발생했습니다.'); });
}
