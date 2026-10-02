import { login, registerUser, verifyRecovery, resetPassword } from "../services/auth-service.js";
import { renderNavbar } from "./navbar.js";
import { showMessage } from "./toast.js";
import { initInteractions } from "./interactions.js";

const field = (id, label, type = "text", attrs = "") => `<div class="mb-3">
  <label for="${id}" class="form-label">${label}</label>
  <input id="${id}" name="${id}" class="form-control" type="${type}" ${attrs} required>
</div>`;

function modal(id, title, content, footer) {
  const description = id === "login" ? "저장해 둔 설렘, 이어서 만나볼까요?" : id === "register" ? "나만의 여행 지도에 첫 번째 발자국을 남겨요." : "다시 나만의 여행을 이어갈 수 있도록.";
  return `<div class="modal fade auth-modal" id="${id}Modal" tabindex="-1" aria-labelledby="${id}Heading" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered"><div class="modal-content">
      <form id="${id}Form">
        <div class="modal-header"><div><span class="auth-symbol" aria-hidden="true">↗</span><span class="eyebrow">YOUR JOURNEY STARTS HERE</span><h2 class="modal-title" id="${id}Heading">${title}</h2><p class="text-secondary small mb-0 mt-2">${description}</p></div>
          <button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="닫기"></button></div>
        <div class="modal-body"><div id="${id}Error" class="alert alert-danger d-none form-error" role="alert" tabindex="-1"></div>${content}</div>
        <div class="modal-footer">${footer}</div>
      </form>
    </div></div>
  </div>`;
}

export function openLogin() {
  bootstrap.Modal.getOrCreateInstance(document.getElementById("loginModal")).show();
}

export function initAuth() {
  if (document.getElementById("loginModal")) return;
  initInteractions();
  document.body.insertAdjacentHTML("beforeend", [
    modal("login", "다시 만나 반가워요", field("loginId", "아이디", "text", 'autocomplete="username"')
      + field("loginPassword", "비밀번호", "password", 'autocomplete="current-password"'),
      '<button type="button" class="btn btn-link me-auto" data-bs-toggle="modal" data-bs-target="#recoveryModal">비밀번호 찾기</button><button class="btn btn-primary" type="submit">로그인</button>'),
    modal("register", "여행을 함께 시작해요", field("registerId", "아이디", "text", 'autocomplete="username" minlength="3" maxlength="30" pattern="[a-zA-Z0-9_\\-]{3,30}" aria-describedby="idHelp"')
      + '<p class="form-text" id="idHelp">영문, 숫자, 밑줄, 하이픈 3~30자</p>'
      + field("registerPassword", "비밀번호 (8자 이상)", "password", 'autocomplete="new-password" minlength="8" maxlength="128"')
      + field("registerPasswordConfirm", "비밀번호 확인", "password", 'autocomplete="new-password" minlength="8" maxlength="128"')
      + field("registerName", "이름", "text", 'autocomplete="name" maxlength="40"')
      + field("registerEmail", "이메일", "email", 'autocomplete="email" maxlength="254"')
      + '<p class="form-text mb-0">회원정보와 여행 기록은 이 브라우저에 저장됩니다.</p>',
      '<button class="btn btn-primary" type="submit">가입하기</button>'),
    modal("recovery", "비밀번호 재설정", '<p class="text-secondary">가입한 아이디와 이메일을 확인한 뒤 새 비밀번호를 설정하세요.</p>'
      + field("recoveryId", "아이디", "text", 'autocomplete="username"')
      + field("recoveryEmail", "이메일", "email", 'autocomplete="email"')
      + '<fieldset id="recoveryPasswords" disabled hidden>'
      + field("recoveryPassword", "새 비밀번호 (8자 이상)", "password", 'autocomplete="new-password" minlength="8" maxlength="128"')
      + field("recoveryPasswordConfirm", "새 비밀번호 확인", "password", 'autocomplete="new-password" minlength="8" maxlength="128"') + '</fieldset>',
      '<button class="btn btn-primary" id="recoverySubmit" type="submit">회원 확인</button>'),
  ].join(""));

  const value = (id) => document.getElementById(id).value;
  const hide = (id) => bootstrap.Modal.getInstance(document.getElementById(`${id}Modal`))?.hide();
  let recoveryIdentity = null;

  function resetRecovery() {
    recoveryIdentity = null;
    const fields = document.getElementById("recoveryPasswords");
    fields.hidden = fields.disabled = true;
    document.getElementById("recoveryPassword").value = "";
    document.getElementById("recoveryPasswordConfirm").value = "";
    document.getElementById("recoverySubmit").textContent = "회원 확인";
  }

  function handle(id, action) {
    const form = document.getElementById(`${id}Form`);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      if (submit.disabled) return;
      const errorBox = form.querySelector(".form-error");
      errorBox.classList.add("d-none");
      submit.disabled = true;
      try { await action(form); }
      catch (error) {
        errorBox.textContent = error.message; errorBox.classList.remove("d-none");
        if (id === "login") form.querySelectorAll("input").forEach((input) => {
          input.setAttribute("aria-invalid", "true"); input.setAttribute("aria-describedby", `${id}Error`);
        });
        errorBox.focus();
      }
      finally { submit.disabled = false; }
    });
    document.getElementById(`${id}Modal`).addEventListener("hidden.bs.modal", () => {
      form.reset();
      form.querySelectorAll('[aria-invalid]').forEach((input) => { input.removeAttribute("aria-invalid"); if (id === "login") input.removeAttribute("aria-describedby"); });
      if (id === "login") form.querySelectorAll("input").forEach((input) => input.removeAttribute("aria-describedby"));
      form.querySelector(".form-error").classList.add("d-none");
      if (id === "recovery") resetRecovery();
    });
    document.getElementById(`${id}Modal`).addEventListener("shown.bs.modal", () => form.querySelector("input").focus());
    form.addEventListener("input", () => form.querySelectorAll('[aria-invalid]').forEach((input) => input.removeAttribute("aria-invalid")));
  }

  handle("login", async () => {
    await login(value("loginId"), value("loginPassword"));
    hide("login");
    showMessage("로그인되었습니다.", "success");
  });
  handle("register", async () => {
    await registerUser({ id: value("registerId"), password: value("registerPassword"), passwordConfirm: value("registerPasswordConfirm"), name: value("registerName"), email: value("registerEmail") });
    hide("register");
    showMessage("가입이 완료되었습니다. 로그인해서 여행을 시작하세요.", "success");
  });
  handle("recovery", async () => {
    const identity = { id: value("recoveryId").trim(), email: value("recoveryEmail").trim() };
    if (!recoveryIdentity) {
      verifyRecovery(identity.id, identity.email);
      recoveryIdentity = identity;
      const fields = document.getElementById("recoveryPasswords");
      fields.hidden = fields.disabled = false;
      document.getElementById("recoverySubmit").textContent = "새 비밀번호 저장";
      document.getElementById("recoveryPassword").focus();
      return;
    }
    await resetPassword({ ...identity, password: value("recoveryPassword"), passwordConfirm: value("recoveryPasswordConfirm") });
    hide("recovery");
    showMessage("비밀번호를 변경했습니다. 새 비밀번호로 로그인하세요.", "success");
  });
  for (const id of ["recoveryId", "recoveryEmail"]) document.getElementById(id).addEventListener("input", resetRecovery);

  const refresh = () => { try { renderNavbar(); } catch (error) { showMessage(error.message, "danger"); } };
  window.addEventListener("authchange", refresh);
  window.addEventListener("storage", () => window.dispatchEvent(new Event("authchange")));
  refresh();
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".navbar a").forEach((link) => {
    if (link.getAttribute("href") === `./${path}`) { link.classList.add("active"); link.setAttribute("aria-current", "page"); }
  });
}
