import { initAuth } from "../ui/auth.js";
import { getCurrentUser } from "../services/auth-service.js";
import { getPlans, savePlan, deletePlan, getDraft, updateDraft, clearDraft, removeDraftPlace, moveDraftPlace, editPlan } from "../services/plan-service.js";
import { initMap, renderRoute, focusMarker } from "../map/kakao-map.js";
import { escapeHtml, imageMarkup, enableImageFallbacks } from "../ui/helpers.js";
import { showMessage } from "../ui/toast.js";
import { scrollToElement } from "../ui/interactions.js";
import { initVisits, visitButton, toggleVisit } from "../ui/visits.js";

initAuth();
initVisits();
const $ = (id) => document.getElementById(id);
const form = $("planForm");
const fields = { title: "planTitle", date: "planDate", budget: "planBudget", notes: "planNotes" };
let draggedIndex = null;
const guarded = (action) => { try { return action(); } catch (error) { showMessage(error.message, "danger"); } };

function renderDraft(fillForm = false) {
  const user = getCurrentUser();
  $("planLoginNotice").hidden = Boolean(user);
  $("planEditor").hidden = !user;
  const draft = user ? getDraft() : { places: [] };
  if (fillForm && user) {
    for (const [key, id] of Object.entries(fields)) $(id).value = draft[key] ?? "";
  }
  $("editorTitle").textContent = draft.editingId ? "여행계획 수정" : "새 여행계획";
  $("draftCount").textContent = draft.places.length;
  $("draftPlaces").innerHTML = draft.places.length ? draft.places.map((place, index) => `
    <li class="itinerary-item" draggable="true" data-index="${index}" data-id="${escapeHtml(place.contentid)}">
      <span class="step-number">${index + 1}</span><span class="drag-handle" draggable="true" title="드래그해서 순서 변경" aria-hidden="true">⠿</span><div class="flex-grow-1 min-width-0">
        <button type="button" class="place-title js-focus">${escapeHtml(place.title)}</button><p class="small text-secondary mb-2">${escapeHtml(place.addr1 || "주소 정보 없음")}</p>
        <div class="mb-2">${visitButton("tour", place.contentid)}</div>
        <div class="d-flex gap-1"><button class="btn btn-outline-secondary btn-sm" type="button" data-action="up" aria-label="${escapeHtml(place.title)} 위로" ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="btn btn-outline-secondary btn-sm" type="button" data-action="down" aria-label="${escapeHtml(place.title)} 아래로" ${index === draft.places.length - 1 ? "disabled" : ""}>↓</button>
        <button class="btn btn-outline-danger btn-sm ms-auto" type="button" data-action="remove" aria-label="${escapeHtml(place.title)} 일정에서 삭제">삭제</button></div>
      </div><div class="itinerary-thumb">${imageMarkup(place.firstimage, place.title)}</div></li>`).join("") : '<li class="empty-state"><span aria-hidden="true">↗</span><h3 class="h6">아직 담은 여행지가 없어요</h3><p>마음에 드는 장소를 담아<br>나만의 여행을 시작해보세요.</p><a href="./trip.html" class="btn btn-outline-primary btn-sm">여행지 둘러보기 →</a></li>';
  enableImageFallbacks($("draftPlaces"));
  renderRoute(draft.places, (place, { source } = {}) => {
    const selected = [...$("draftPlaces").children].find((row) => row.dataset.id === String(place.contentid));
    $("draftPlaces").querySelectorAll(".itinerary-item").forEach((row) => row.classList.toggle("is-selected", row === selected));
    if (source === "marker") scrollToElement(selected);
  });
}
function renderPlans() {
  const plans = getPlans();
  $("planList").innerHTML = plans.length ? plans.map((plan) => `<article class="saved-plan border rounded-3 p-3 mb-3" data-id="${escapeHtml(plan.id)}">
    <div class="d-flex justify-content-between gap-3 flex-wrap"><div><h3 class="h6 fw-bold mb-1">${escapeHtml(plan.title)}</h3><p class="small text-secondary">${escapeHtml(plan.date)} · ${plan.places.length}곳 · 예산 ${Number(plan.budget || 0).toLocaleString()}원</p></div>
    <div class="d-flex gap-2 align-items-start"><button type="button" class="btn btn-outline-primary btn-sm" data-action="edit">불러오기 / 수정</button><button type="button" class="btn btn-outline-danger btn-sm" data-action="delete">삭제</button></div></div>
    <div class="saved-visit-places">${plan.places.map((place) => `<div class="saved-visit-place" data-place-id="${escapeHtml(place.contentid)}"><span>${escapeHtml(place.title)}</span>${visitButton("tour", place.contentid)}</div>`).join("")}</div>
    ${plan.notes ? `<p class="small text-secondary preserve-lines mb-0">${escapeHtml(plan.notes)}</p>` : ""}</article>`).join("") : '<p class="empty-state py-4 mb-0">아직 저장된 여행계획이 없습니다.</p>';
}
function refresh() { guarded(() => { renderDraft(true); renderPlans(); }); }
function formValues() { return Object.fromEntries(Object.entries(fields).map(([key, id]) => [key, $(id).value])); }
form.addEventListener("input", () => {
  try { updateDraft(formValues()); $("draftStatus").textContent = "작성 중인 내용을 보관했습니다."; }
  catch (error) { $("draftStatus").textContent = error.message; }
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  guarded(() => {
    const draft = updateDraft(formValues());
    savePlan({ ...draft, id: draft.editingId || undefined });
    clearDraft();
    refresh();
    showMessage("여행계획을 저장했습니다.", "success");
  });
});
$("newPlanBtn").addEventListener("click", () => guarded(() => {
  const draft = getDraft();
  if ((draft.title || draft.places.length || draft.notes || draft.date || draft.budget) && !confirm("작성 중인 내용을 비우고 새 여행계획을 만들까요? 저장된 계획은 유지됩니다.")) return;
  clearDraft(); renderDraft(true);
}));
$("draftPlaces").addEventListener("click", (event) => guarded(() => {
  const row = event.target.closest("[data-index]");
  if (!row) return;
  const action = event.target.closest("[data-action]")?.dataset.action;
  const index = Number(row.dataset.index);
  if (event.target.closest(".js-visit")) {
    toggleVisit("tour", getDraft().places[index]).catch((error) => showMessage(error.message, "warning")); return;
  }
  if (action === "up" || action === "down") moveDraftPlace(index, index + (action === "up" ? -1 : 1));
  else if (action === "remove") removeDraftPlace(row.dataset.id);
  else if (event.target.closest(".js-focus")) {
    if (!focusMarker(row.dataset.id)) showMessage("지도 연결 또는 여행지 좌표를 확인하세요.", "info");
    return;
  } else return;
  renderDraft();
}));
$("draftPlaces").addEventListener("dragstart", (event) => {
  const row = event.target.closest("[data-index]");
  if (!row) return;
  draggedIndex = Number(row.dataset.index);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", row.dataset.id);
  row.classList.add("dragging");
});
$("draftPlaces").addEventListener("dragover", (event) => {
  if (draggedIndex === null) return;
  event.preventDefault();
  const target = event.target.closest("[data-index]");
  $("draftPlaces").querySelectorAll(".itinerary-item").forEach((row) => row.classList.toggle("drop-target", row === target && Number(row.dataset.index) !== draggedIndex));
});
$("draftPlaces").addEventListener("dragleave", (event) => {
  if (!$("draftPlaces").contains(event.relatedTarget)) $("draftPlaces").querySelectorAll(".drop-target").forEach((row) => row.classList.remove("drop-target"));
});
$("draftPlaces").addEventListener("drop", (event) => {
  event.preventDefault();
  const row = event.target.closest("[data-index]");
  if (row && draggedIndex !== null) guarded(() => { moveDraftPlace(draggedIndex, Number(row.dataset.index)); renderDraft(); });
  draggedIndex = null;
});
$("draftPlaces").addEventListener("dragend", () => { draggedIndex = null; document.querySelectorAll(".dragging,.drop-target").forEach((row) => row.classList.remove("dragging", "drop-target")); });
$("planList").addEventListener("click", (event) => guarded(() => {
  const visit = event.target.closest(".js-visit");
  if (visit) {
    const planId = event.target.closest(".saved-plan")?.dataset.id;
    const place = getPlans().find((plan) => plan.id === planId)?.places.find((item) => item.contentid === visit.dataset.visitId);
    if (place) toggleVisit("tour", place).catch((error) => showMessage(error.message, "warning"));
    return;
  }
  const button = event.target.closest("[data-action]");
  const id = event.target.closest("[data-id]")?.dataset.id;
  if (!button || !id) return;
  if (button.dataset.action === "delete") {
    if (!confirm("이 여행계획을 삭제할까요?")) return;
    deletePlan(id);
  } else {
    const draft = getDraft();
    if ((draft.title || draft.places.length || draft.date || draft.notes) && !confirm("작성 중인 내용 대신 저장된 계획을 불러올까요?")) return;
    editPlan(id);
    scrollToElement($("planEditor"), "start");
  }
  refresh();
}));
window.addEventListener("authchange", refresh);
refresh();
initMap().then(() => guarded(() => renderDraft()));
