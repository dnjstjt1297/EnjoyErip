import { getCurrentUser, logout } from "../services/auth-service.js";
import { escapeHtml } from "./helpers.js";
import { showMessage } from "./toast.js";

export function renderNavbar() {
  document.querySelectorAll(".navbar-brand").forEach((brand) => {
    brand.classList.remove("text-primary");
    brand.innerHTML = '<img class="brand-mark" src="./assets/images/favicon.svg" width="37" height="37" alt=""><span>enjoytrip<span class="brand-dot">.</span></span>';
    brand.setAttribute("aria-label", "enjoytrip 홈");
  });
  document.querySelectorAll(".footer-brand").forEach((brand) => {
    brand.innerHTML = 'enjoytrip<span class="brand-dot">.</span>';
  });
  const container = document.getElementById("authNav");
  if (!container) return;

  const user = getCurrentUser();

  if (!user) {
    container.innerHTML = `
      <button class="btn btn-outline-primary btn-sm" type="button" data-bs-toggle="modal" data-bs-target="#loginModal">
        로그인
      </button>
      <button class="btn btn-primary btn-sm" type="button" data-bs-toggle="modal" data-bs-target="#registerModal">
        회원가입
      </button>
    `;
    return;
  }

  container.innerHTML = `
    <a class="btn btn-outline-secondary btn-sm" href="./mypage.html"><span class="nav-avatar" aria-hidden="true">${escapeHtml(user.name.slice(0, 1))}</span>${escapeHtml(user.name)}님 · 마이페이지</a>
    <button id="logoutBtn" class="btn btn-primary btn-sm" type="button">로그아웃</button>
  `;

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    try { logout(); showMessage("로그아웃되었습니다.", "success"); }
    catch (error) { showMessage(error.message, "danger"); }
  });
}
