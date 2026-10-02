import { getCurrentUser } from "../services/auth-service.js";
import { getVisit, markVisited, removeVisit } from "../services/visit-service.js";
import { getRegions, loadRegions, resolveRegion } from "../services/region-service.js";
import { escapeHtml, today } from "./helpers.js";
import { openLogin } from "./auth.js";
import { showMessage } from "./toast.js";

let pendingPlace = null;
let dialogVersion = 0;
const $ = (id) => document.getElementById(id);

export function visitButton(source, sourceId) {
  const visited = Boolean(getVisit(source, String(sourceId)));
  return `<button type="button" class="visit-button js-visit ${visited ? "is-visited" : ""}" data-visit-source="${escapeHtml(source)}" data-visit-id="${escapeHtml(sourceId)}" aria-pressed="${visited}">${visited ? "✓ 다녀온 곳 · 취소" : "✓ 다녀왔어요"}</button>`;
}

export function refreshVisitButtons(root = document) {
  root.querySelectorAll(".js-visit").forEach((button) => {
    const visited = Boolean(getVisit(button.dataset.visitSource, button.dataset.visitId));
    button.classList.toggle("is-visited", visited);
    button.setAttribute("aria-pressed", String(visited));
    button.textContent = visited ? "✓ 다녀온 곳 · 취소" : "✓ 다녀왔어요";
  });
}

function initVisitDialog() {
  if ($("visitModal")) return;
  document.body.insertAdjacentHTML("beforeend", `<div class="modal fade visit-modal" id="visitModal" tabindex="-1" aria-labelledby="visitHeading" aria-hidden="true"><div class="modal-dialog modal-dialog-centered"><div class="modal-content"><form id="visitForm">
    <div class="modal-header"><div><span class="eyebrow">COLLECT YOUR MEMORY</span><h2 class="modal-title h4" id="visitHeading">여행 여권에 남기기</h2></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="닫기"></button></div>
    <div class="modal-body"><div class="visit-ticket"><span aria-hidden="true">✓</span><div><small id="visitSourceLabel"></small><strong id="visitPlaceTitle"></strong></div></div>
    <p class="small text-secondary mt-3">실제로 다녀온 지역과 날짜를 확인해 주세요. 같은 장소는 한 번만 기록됩니다.</p>
    <div class="mb-3"><label class="form-label" for="visitRegion">다녀온 지역</label><select id="visitRegion" class="form-select" required><option value="">지역을 불러오는 중…</option></select></div>
    <div class="mb-3"><label class="form-label" for="visitRecordDate">다녀온 날</label><input id="visitRecordDate" class="form-control" type="date" required></div>
    <div id="visitError" class="alert alert-warning d-none" role="alert"></div></div>
    <div class="modal-footer"><button type="button" class="btn btn-light" data-bs-dismiss="modal">나중에</button><button id="visitSaveBtn" type="submit" class="btn btn-primary">방문 기록 남기기</button></div>
  </form></div></div></div>`);
  $("visitForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!pendingPlace) return;
    try {
      if (getCurrentUser()?.id !== pendingPlace.ownerId) throw new Error("로그인 계정이 변경되었습니다. 다시 기록해 주세요.");
      const region = getRegions().find((item) => item.code === $("visitRegion").value);
      if (!region) throw new Error("다녀온 지역을 선택하세요.");
      markVisited({ ...pendingPlace, regionCode: region.code, regionName: region.name, visitedAt: $("visitRecordDate").value });
      bootstrap.Modal.getInstance($("visitModal"))?.hide();
      showMessage(`${region.name} 여행 여권에 기록했어요.`, "success");
    } catch (error) {
      $("visitError").textContent = error.message; $("visitError").classList.remove("d-none");
    }
  });
  $("visitModal").addEventListener("hidden.bs.modal", () => { dialogVersion++; pendingPlace = null; });
  window.addEventListener("visitschange", () => refreshVisitButtons());
  window.addEventListener("authchange", () => {
    refreshVisitButtons();
    if (pendingPlace && getCurrentUser()?.id !== pendingPlace.ownerId) bootstrap.Modal.getInstance($("visitModal"))?.hide();
  });
}

export function initVisits() { initVisitDialog(); }

export async function toggleVisit(source, place) {
  initVisitDialog();
  const user = getCurrentUser();
  if (!user) { openLogin(); return; }
  const sourceId = String(source === "tour" ? place.contentid : place.id);
  if (getVisit(source, sourceId)) {
    removeVisit(source, sourceId);
    showMessage("방문 기록을 취소했습니다.", "info"); return;
  }
  const version = ++dialogVersion;
  pendingPlace = { ownerId: user.id, source, sourceId, title: place.title || place.name,
    addr1: place.addr1 || "", imageUrl: place.firstimage || place.firstimage2 || place.imageUrl || "" };
  $("visitPlaceTitle").textContent = pendingPlace.title;
  $("visitSourceLabel").textContent = source === "tour" ? "한국관광공사 관광지" : "나만의 발견 · 직접 기록한 장소";
  $("visitRecordDate").max = today();
  $("visitRecordDate").value = source === "hotplace" ? place.date : today();
  $("visitRegion").replaceChildren(new Option("지역을 불러오는 중…", ""));
  $("visitSaveBtn").disabled = true;
  $("visitError").classList.add("d-none");
  bootstrap.Modal.getOrCreateInstance($("visitModal")).show();
  try {
    const regions = getRegions().length ? getRegions() : await loadRegions();
    if (version !== dialogVersion || !pendingPlace) return;
    $("visitRegion").replaceChildren(new Option("다녀온 지역 선택", ""), ...regions.map((region) => new Option(region.name, region.code)));
    $("visitRegion").value = resolveRegion(place, regions)?.code || "";
    $("visitSaveBtn").disabled = false;
    $("visitRegion").focus();
  } catch (error) {
    if (version !== dialogVersion) return;
    $("visitError").textContent = error.message; $("visitError").classList.remove("d-none");
  }
}
