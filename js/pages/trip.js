import { initAuth, openLogin } from "../ui/auth.js";
import { fetchAreaCodes, fetchSigunguCodes, fetchClassificationCodes, fetchLocationBasedList, fetchTourDetail, extractItems, responseBody, CONTENT_TYPE_NAMES } from "../api/tour-api.js";
import { initMap, updateMap, focusMarker, hoverMarker, getMapCenter, moveToLocation, fitAllMarkers } from "../map/kakao-map.js";
import { getCurrentUser } from "../services/auth-service.js";
import { addDraftPlace } from "../services/plan-service.js";
import { escapeHtml, imageMarkup, enableImageFallbacks, validCoordinates, updateSelect } from "../ui/helpers.js";
import { showMessage } from "../ui/toast.js";
import { scrollToElement } from "../ui/interactions.js";
import { TRAVEL_MOODS, moodMarkup, getMoodFilters, pickRandomPlace } from "../ui/travel-moods.js";
import { rememberRegions } from "../services/region-service.js";
import { initVisits, visitButton, toggleVisit } from "../ui/visits.js";

initAuth();
initVisits();
const $ = (id) => document.getElementById(id);
const searchForm = $("searchForm");
const sidoSelect = $("sidoSelect");
const gugunSelect = $("gugunSelect");
const contentTypeSelect = $("contentTypeSelect");
const arrangeSelect = $("arrangeSelect");
const keywordInput = $("keywordInput");
const tourList = $("tourList");
let items = [];
let query = null;
let pageNo = 1;
let totalCount = 0;
let searchRequest;
let areaRequest;
let detailRequest;
let currentLocation = null;
let detailItem = null;
let classifications = [];
let activeMood = "";
let recommendAfterSearch = false;
let recommendedItem = null;
const selectClass1 = $("selectClass1");
const selectClass2 = $("selectClass2");
const selectClass3 = $("selectClass3");
let class2Request;
let class3Request;
const PAGE_SIZE = 12;

// Search input affordances reuse the existing form submission and API flow.
function updateKeywordClear() { $("clearKeywordBtn").hidden = !keywordInput.value; }
keywordInput.addEventListener("input", updateKeywordClear);
$("clearKeywordBtn").addEventListener("click", () => {
  keywordInput.value = "";
  updateKeywordClear();
  keywordInput.focus();
});

$("travelMoodChips").innerHTML = moodMarkup();
function showMood(id = "") {
  activeMood = id;
  const mood = TRAVEL_MOODS.find((item) => item.id === id);
  $("travelMoodChips").querySelectorAll("[data-mood]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.mood === id)));
  $("moodResetBtn").hidden = !id;
  $("moodDescription").textContent = mood ? mood.description : "기분에 맞는 여행을 고르거나, 아래 필터로 직접 찾아보세요.";
  if (mood && id !== "random" && !getMoodFilters(id, classifications).lclsSystm1) $("moodDescription").textContent = `${CONTENT_TYPE_NAMES[mood.contentTypeId]} 유형으로 탐색해요. 상세 분류는 현재 코드 목록에서 선택할 수 있습니다.`;
}
async function applyMood(id) {
  if (!TRAVEL_MOODS.some((mood) => mood.id === id)) return;
  showMood(id);
  recommendAfterSearch = id === "random";
  if (id === "random") {
    if (items.length) { recommendAfterSearch = false; recommendPlace(); }
    else searchForm.requestSubmit();
    return;
  }
  const filters = getMoodFilters(id, classifications);
  class2Request?.abort(); class3Request?.abort();
  invalidateResults();
  contentTypeSelect.value = filters.contentTypeId;
  selectClass1.value = filters.lclsSystm1;
  updateSelect(selectClass2); updateSelect(selectClass3);
  if (filters.lclsSystm1) {
    const request = new AbortController(); class2Request = request;
    fetchClassificationCodes({ lclsSystm1: filters.lclsSystm1 }, { signal: request.signal }).then((data) => {
      if (request === class2Request && !request.signal.aborted) updateSelect(selectClass2, extractItems(data));
    }).catch((error) => { if (error.name !== "AbortError") setStatus(error.message, "warning"); });
  }
  if (sidoSelect.value || keywordInput.value.trim() || arrangeSelect.value === "E") searchForm.requestSubmit();
  else { setStatus("무드를 적용했습니다. 떠나고 싶은 시/도를 선택해 주세요."); sidoSelect.focus(); }
}
$("travelMoodChips").addEventListener("click", (event) => {
  const id = event.target.closest("[data-mood]")?.dataset.mood;
  if (id) applyMood(id);
});
$("moodResetBtn").addEventListener("click", () => {
  class2Request?.abort(); class3Request?.abort();
  showMood(); recommendAfterSearch = false;
  contentTypeSelect.value = ""; selectClass1.value = "";
  updateSelect(selectClass2); updateSelect(selectClass3); invalidateResults();
  if (sidoSelect.value || keywordInput.value.trim() || arrangeSelect.value === "E") searchForm.requestSubmit();
  else setStatus("무드 필터를 초기화했습니다. 지역을 선택해 주세요.");
});
function recommendPlace() {
  if ($("searchButton").disabled) { recommendAfterSearch = true; return; }
  recommendedItem = pickRandomPlace(items);
  if (!recommendedItem) { $("randomRecommendation").hidden = true; showMessage("현재 검색 결과가 없어요. 조건을 바꾸어 여행지를 먼저 찾아보세요.", "info"); return; }
  $("randomTitle").textContent = recommendedItem.title;
  $("randomDescription").textContent = `이번 페이지 ${items.length}곳 중에서 골랐어요. 마음에 든다면 자세히 살펴보세요.`;
  $("randomRecommendation").hidden = false;
  $("randomRecommendation").classList.remove("is-shuffling");
  void $("randomRecommendation").offsetWidth;
  $("randomRecommendation").classList.add("is-shuffling");
  highlight(recommendedItem);
  focusMarker(recommendedItem.contentid);
  const card = [...tourList.querySelectorAll(".tour-card")].find((node) => node.dataset.id === String(recommendedItem.contentid));
  revealResult(card);
}
$("randomPlaceBtn").addEventListener("click", recommendPlace);
$("randomDetailBtn").addEventListener("click", () => { if (recommendedItem) showDetail(recommendedItem); });

contentTypeSelect.innerHTML = '<option value="">전체 유형</option>' + Object.entries(CONTENT_TYPE_NAMES)
  .map(([id, name]) => `<option value="${id}">${name}</option>`).join("");

function setStatus(message, type = "light") {
  $("statusMessage").className = `alert alert-${type} border`;
  // The list heading already shows the total. Keep the repeated success message
  // available to screen readers, while search context and warnings stay visible.
  $("statusMessage").classList.toggle("visually-hidden", type === "success" && /^\d+곳을 불러왔습니다\.$/.test(message));
  $("statusMessage").textContent = message;
}
function setBusy(busy) {
  $("searchButton").disabled = busy;
  $("randomPlaceBtn").disabled = busy;
  $("travelMoodChips").querySelector('[data-mood="random"]').disabled = busy;
  $("searchButton").innerHTML = busy ? '<span class="button-spinner" aria-hidden="true"></span> 검색 중' : '<span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="ui-icon"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span> 검색';
  tourList.setAttribute("aria-busy", String(busy));
  $("mapLoading").hidden = !busy;
  if (busy) {
    $("mapSelection").hidden = true;
    tourList.innerHTML = Array.from({ length: 3 }, () => '<div class="col-12" aria-hidden="true"><div class="skeleton-card"><div class="skeleton-block skeleton-photo"></div><div class="skeleton-copy"><div class="skeleton-block skeleton-line short"></div><div class="skeleton-block skeleton-line medium"></div><div class="skeleton-block skeleton-line"></div></div></div></div>').join("");
  }
  $("prevPage").disabled = busy || pageNo <= 1;
  $("nextPage").disabled = busy || pageNo * PAGE_SIZE >= totalCount;
}
function highlight(item, { source = "card" } = {}) {
  let selected;
  tourList.querySelectorAll(".tour-card").forEach((card) => {
    const match = card.dataset.id === String(item.contentid);
    card.classList.toggle("is-selected", match);
    card.setAttribute("aria-current", String(match));
    if (match) selected = card;
  });
  $("mapSelectionTitle").textContent = item.title;
  $("mapSelection").hidden = false;
  if (source === "marker") revealResult(selected);
}
function revealResult(card) {
  if (!card) return;
  if (!matchMedia("(min-width: 992px)").matches) { scrollToElement(card); return; }
  const listBounds = tourList.getBoundingClientRect();
  const cardBounds = card.getBoundingClientRect();
  const offset = cardBounds.top < listBounds.top ? cardBounds.top - listBounds.top
    : cardBounds.bottom > listBounds.bottom ? cardBounds.bottom - listBounds.bottom : 0;
  if (offset) tourList.scrollBy({ top: offset, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
}
function labelVisitActions() {
  tourList.querySelectorAll(".js-visit").forEach((button) => {
    button.title = button.textContent.trim();
  });
}
window.addEventListener("visitschange", labelVisitActions);
window.addEventListener("authchange", labelVisitActions);
function renderTourList() {
  if (!items.length) {
    tourList.innerHTML = '<div class="empty-state"><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="ui-icon"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span><h2 class="h5">검색 결과가 없어요</h2><p>지역이나 관광 유형을 바꾸어 다시 검색해 보세요.</p></div>';
    return;
  }
  tourList.innerHTML = items.map((item, index) => `<div class="col-12">
    <article class="card tour-card overflow-hidden" tabindex="0" aria-label="${escapeHtml(item.title || "관광지")} 지도에서 보기" aria-describedby="listInteractionHint" aria-current="false" data-index="${index}" data-id="${escapeHtml(item.contentid)}">
      ${imageMarkup(item.firstimage || item.firstimage2, item.title || "관광지")}
      <div class="card-body">
        <div class="tour-meta"><span class="category-tag">${escapeHtml(CONTENT_TYPE_NAMES[item.contenttypeid] || "여행지")}</span>
          ${query?.arrange === "E" && Number.isFinite(Number(item.dist)) ? `<span class="tour-distance small text-secondary">${(Number(item.dist) / 1000).toFixed(1)} km</span>` : ""}</div>
        <h2 class="h5 fw-bold"><button type="button" class="place-title js-detail" title="${escapeHtml(item.title || "이름 없음")} 상세보기">${escapeHtml(item.title || "이름 없음")}</button></h2>
        <p class="tour-address small text-secondary" title="${escapeHtml([item.addr1, item.addr2].filter(Boolean).join(" ") || "주소 정보 없음")}">${escapeHtml([item.addr1, item.addr2].filter(Boolean).join(" ") || "주소 정보 없음")}</p>
        <div class="tour-actions">
          <button class="btn btn-primary btn-sm js-add-plan" type="button">＋ 여행 계획</button>
          ${visitButton("tour", item.contentid)}
        </div>
      </div>
    </article>
  </div>`).join("");
  enableImageFallbacks(tourList);
  labelVisitActions();
}

function invalidateResults() {
  searchRequest?.abort();
  searchRequest = null;
  query = null;
  pageNo = 1;
  totalCount = 0;
  items = [];
  recommendedItem = null;
  $("randomRecommendation").hidden = true;
  updateMap([]);
  $("mapSelection").hidden = true;
  tourList.innerHTML = '<div class="empty-state"><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="ui-icon"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.7"/></svg></span><h2 class="h5">새로운 여행지를 만나볼까요?</h2><p>조건을 선택한 뒤 검색해 주세요.</p></div>';
  $("pagination").hidden = true;
  $("resultCount").textContent = "여행지를 찾아보세요";
  setBusy(false);
}

export async function initEnjoyTrip() {
  updateSelect(sidoSelect);
  updateSelect(selectClass1);
  updateSelect(selectClass2);
  updateSelect(selectClass3);
  updateSelect(gugunSelect);
  // The two initial requests follow the classroom example, but fail independently.
  const results = await Promise.allSettled([fetchAreaCodes(), fetchClassificationCodes()]);
  if (results[0].status === "fulfilled") {
    const regions = extractItems(results[0].value);
    updateSelect(sidoSelect, regions, "시/도 선택");
    try { rememberRegions(regions); } catch (error) { showMessage(error.message, "warning"); }
  }
  if (results[1].status === "fulfilled") { classifications = extractItems(results[1].value); updateSelect(selectClass1, classifications); }
  const errors = results.filter((result) => result.status === "rejected");
  if (errors.length) setStatus(errors[0].reason.message, "warning");
  else setStatus("지역과 관심 있는 관광 유형을 선택해 보세요.");
  const params = new URLSearchParams(location.search);
  keywordInput.value = (params.get("keyword") || "").slice(0, 80);
  updateKeywordClear();
  const region = params.get("region");
  if (region && [...sidoSelect.options].some((option) => option.value === region)) {
    sidoSelect.value = region; sidoSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (TRAVEL_MOODS.some((mood) => mood.id === params.get("mood"))) applyMood(params.get("mood"));
  else if (sidoSelect.value || keywordInput.value.trim()) searchForm.requestSubmit();
}

selectClass1.addEventListener("change", async () => {
  class2Request?.abort();
  class3Request?.abort();
  const request = new AbortController();
  class2Request = request;
  updateSelect(selectClass2);
  updateSelect(selectClass3);
  if (!selectClass1.value) return;
  try {
    const data = await fetchClassificationCodes({ lclsSystm1: selectClass1.value }, { signal: request.signal });
    if (request !== class2Request || request.signal.aborted) return;
    updateSelect(selectClass2, extractItems(data));
  } catch (error) { if (error.name !== "AbortError") setStatus(error.message, "danger"); }
});
selectClass2.addEventListener("change", async () => {
  class3Request?.abort();
  const request = new AbortController();
  class3Request = request;
  updateSelect(selectClass3);
  if (!selectClass2.value) return;
  try {
    const data = await fetchClassificationCodes({ lclsSystm1: selectClass1.value, lclsSystm2: selectClass2.value }, { signal: request.signal });
    if (request !== class3Request || request.signal.aborted) return;
    updateSelect(selectClass3, extractItems(data));
  } catch (error) { if (error.name !== "AbortError") setStatus(error.message, "danger"); }
});

sidoSelect.addEventListener("change", async () => {
  areaRequest?.abort();
  const request = new AbortController();
  areaRequest = request;
  updateSelect(gugunSelect);
  if (!sidoSelect.value) return;
  try {
    const data = await fetchSigunguCodes(sidoSelect.value, { signal: request.signal });
    if (request !== areaRequest || request.signal.aborted) return;
    updateSelect(gugunSelect, extractItems(data));
  } catch (error) { if (error.name !== "AbortError") setStatus(error.message, "danger"); }
});

searchForm.addEventListener("change", (event) => {
  if ([contentTypeSelect, selectClass1, selectClass2, selectClass3].includes(event.target)) { showMood(); recommendAfterSearch = false; }
  invalidateResults();
  $("distanceOptions").hidden = arrangeSelect.value !== "E";
  setStatus("검색 조건이 변경되었습니다. 검색 버튼을 눌러주세요.");
  if (activeMood && [sidoSelect, gugunSelect].includes(event.target) && sidoSelect.value) {
    recommendAfterSearch = activeMood === "random";
    searchForm.requestSubmit();
  }
});

$("useLocationBtn").addEventListener("click", () => {
  if (!navigator.geolocation) { showMessage("현재 위치를 지원하지 않는 브라우저입니다.", "warning"); return; }
  const button = $("useLocationBtn");
  button.disabled = true;
  $("locationStatus").textContent = "현재 위치를 확인하고 있어요…";
  navigator.geolocation.getCurrentPosition((position) => {
    currentLocation = { mapX: position.coords.longitude, mapY: position.coords.latitude };
    $("distanceOrigin").value = "current";
    $("locationStatus").textContent = "현재 위치를 검색 기준으로 설정했습니다.";
    moveToLocation(currentLocation.mapY, currentLocation.mapX, 7);
    invalidateResults();
    button.disabled = false;
  }, () => {
    $("locationStatus").textContent = "위치 권한을 허용하거나 지도 중심을 기준으로 검색하세요.";
    button.disabled = false;
  }, { timeout: 10000, maximumAge: 60000 });
});

$("mapLocationBtn").addEventListener("click", () => {
  if (!navigator.geolocation) { showMessage("현재 위치를 지원하지 않는 브라우저입니다.", "warning"); return; }
  const button = $("mapLocationBtn");
  button.disabled = true;
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    currentLocation = { mapX: coords.longitude, mapY: coords.latitude };
    if (!moveToLocation(coords.latitude, coords.longitude, 6)) showMessage("지도를 불러온 뒤 이용하세요.", "info");
    else showMessage("현재 위치로 이동했습니다.", "success");
    button.disabled = false;
  }, () => { button.disabled = false; showMessage("위치 권한을 허용한 뒤 다시 시도해 주세요.", "warning"); }, { timeout: 10000, maximumAge: 60000 });
});
$("fitMarkersBtn").addEventListener("click", () => {
  if (!fitAllMarkers()) { showMessage("지도에 표시된 여행지가 없습니다. 먼저 검색해 주세요.", "info"); return; }
  tourList.querySelectorAll(".tour-card").forEach((card) => {
    card.classList.remove("is-selected");
    card.setAttribute("aria-current", "false");
  });
  $("mapSelection").hidden = true;
});

async function runSearch(targetPage) {
  searchRequest?.abort();
  const request = new AbortController();
  searchRequest = request;
  setBusy(true);
  items = [];
  recommendedItem = null;
  $("randomRecommendation").hidden = true;
  setStatus("관광 정보를 불러오는 중입니다…", "info");
  try {
    const data = await fetchLocationBasedList({ ...query, numOfRows: PAGE_SIZE, pageNo: targetPage }, { signal: request.signal });
    if (request !== searchRequest || request.signal.aborted) return;
    items = extractItems(data);
    totalCount = Number(responseBody(data).totalCount) || items.length;
    pageNo = targetPage;
    renderTourList();
    const mapped = await updateMap(items, highlight);
    if (request !== searchRequest || request.signal.aborted) return;
    if (mapped) { items = mapped; renderTourList(); }
    $("resultCount").textContent = `총 ${totalCount.toLocaleString()}곳의 여행지`;
    $("pagination").hidden = totalCount <= PAGE_SIZE;
    $("pageInfo").textContent = `${pageNo} / ${Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}`;
    const missing = items.filter((item) => !validCoordinates(item.mapy, item.mapx)).length;
    setStatus(`${items.length}곳을 불러왔습니다.${query.keyword ? ` ‘${query.keyword}’ 검색 결과입니다.` : ""}${missing ? ` 좌표가 없는 ${missing}곳은 목록에서 확인하세요.` : ""}${query.arrange === "E" ? ` 기준 위치 반경 ${query.radius / 1000}km 검색입니다.` : ""}`, "success");
  } catch (error) {
    if (error.name === "AbortError" || request !== searchRequest) return;
    items = [];
    totalCount = 0;
    updateMap([]);
    tourList.innerHTML = '<div class="empty-state">정보를 불러오지 못했어요. 잠시 후 다시 검색해 주세요.</div>';
    $("pagination").hidden = true;
    $("resultCount").textContent = "검색에 실패했습니다";
    setStatus(error.message, "danger");
  } finally {
    if (request === searchRequest) {
      setBusy(false);
      if (recommendAfterSearch) { recommendAfterSearch = false; recommendPlace(); }
    }
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!sidoSelect.value && !keywordInput.value.trim() && arrangeSelect.value !== "E") { setStatus("시/도를 선택하거나 검색어를 입력하세요.", "warning"); return; }
  const origin = $("distanceOrigin").value === "current" ? currentLocation : getMapCenter();
  if (arrangeSelect.value === "E" && !origin) { setStatus("거리순 검색의 기준이 될 지도를 불러오거나 현재 위치를 설정하세요.", "warning"); return; }
  query = { areaCode: sidoSelect.value, sigunguCode: gugunSelect.value, contentTypeId: contentTypeSelect.value, arrange: arrangeSelect.value, keyword: keywordInput.value.trim(),
    lclsSystm1: selectClass1.value, lclsSystm2: selectClass2.value, lclsSystm3: selectClass3.value,
    ...(arrangeSelect.value === "E" ? { ...origin, radius: Number($("searchRadius").value) } : {}) };
  runSearch(1);
});
$("prevPage").addEventListener("click", () => runSearch(pageNo - 1));
$("nextPage").addEventListener("click", () => runSearch(pageNo + 1));

function addToPlan(item, button) {
  try {
    if (!getCurrentUser()) { openLogin(); return; }
    addDraftPlace(item);
    if (button) {
      button.classList.remove("added-feedback");
      void button.offsetWidth;
      button.classList.add("added-feedback");
    }
    showMessage("여행계획에 담았어요. 여행계획 페이지에서 일정을 완성하세요.", "success");
  } catch (error) { showMessage(error.message, "warning"); }
}
tourList.addEventListener("click", (event) => {
  if (event.target.closest("a")) return;
  const card = event.target.closest(".tour-card");
  if (!card) return;
  const item = items[Number(card.dataset.index)];
  if (!item) return;
  if (event.target.closest(".js-visit")) {
    toggleVisit("tour", item).catch((error) => showMessage(error.message, "warning"));
  } else if (event.target.closest(".js-add-plan")) {
    addToPlan(item, event.target.closest("button"));
  } else if (event.target.closest(".js-detail")) showDetail(item);
  else if (!event.target.closest("button")) {
    highlight(item);
    if (focusMarker(item.contentid)) {
      if (matchMedia("(max-width: 991px)").matches) scrollToElement($("map"), "center");
    } else showMessage(validCoordinates(item.mapy, item.mapx) ? "지도를 불러온 뒤 이용하세요." : "위치 정보가 없는 여행지입니다.", "info");
  }
});
tourList.addEventListener("keydown", (event) => {
  if (!event.target.matches(".tour-card") || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  event.target.click();
});

// Preview Wonseok's category pin without moving the map or changing selection.
for (const name of ["pointerover", "pointerout", "focusin", "focusout"]) {
  tourList.addEventListener(name, (event) => {
    const card = event.target.closest(".tour-card");
    if (!card || (event.relatedTarget instanceof Node && card.contains(event.relatedTarget))) return;
    hoverMarker(card.dataset.id, name === "pointerover" || name === "focusin");
  });
}

async function showDetail(item) {
  detailItem = item;
  $("detailHotplaceLink").href = `./hotplace.html?contentId=${encodeURIComponent(item.contentid)}`;
  detailRequest?.abort();
  const request = new AbortController();
  detailRequest = request;
  $("detailTitle").textContent = item.title;
  $("detailBody").innerHTML = '<div role="status"><span class="visually-hidden">상세 정보를 불러오는 중입니다…</span><div class="skeleton-block skeleton-photo"></div><div class="skeleton-copy"><div class="skeleton-block skeleton-line short"></div><div class="skeleton-block skeleton-line"></div><div class="skeleton-block skeleton-line medium"></div></div></div>';
  bootstrap.Modal.getOrCreateInstance($("detailModal")).show();
  try {
    const data = await fetchTourDetail(item.contentid, { signal: request.signal });
    if (request !== detailRequest) return;
    const detail = extractItems(data)[0] ?? item;
    const plainOverview = new DOMParser().parseFromString(String(detail.overview || "상세 설명이 제공되지 않는 여행지입니다.").replace(/<br\s*\/?\s*>/gi, "\n"), "text/html").body.textContent;
    $("detailBody").innerHTML = `${imageMarkup(detail.firstimage || detail.firstimage2 || item.firstimage || item.firstimage2, detail.title || item.title)}
      <span class="category-tag mt-3">${escapeHtml(CONTENT_TYPE_NAMES[item.contenttypeid] || "여행지")}</span>
      <p class="text-secondary mt-3">${escapeHtml([detail.addr1 || item.addr1, detail.addr2].filter(Boolean).join(" ") || "주소 정보 없음")}</p>
      <p class="preserve-lines">${escapeHtml(plainOverview)}</p>${detail.tel ? `<p>문의: ${escapeHtml(detail.tel)}</p>` : ""}
      <p class="small text-secondary mb-0">관광 정보·사진 제공: 한국관광공사 TourAPI</p>`;
    enableImageFallbacks($("detailBody"));
  } catch (error) { if (error.name !== "AbortError") $("detailBody").textContent = error.message; }
}
$("detailModal").addEventListener("hidden.bs.modal", () => detailRequest?.abort());
$("detailMapBtn").addEventListener("click", () => {
  if (!detailItem) return;
  if (!focusMarker(detailItem.contentid)) { showMessage("지도 연결 또는 여행지 좌표를 확인하세요.", "info"); return; }
  $("detailModal").addEventListener("hidden.bs.modal", () => scrollToElement($("map"), "center"), { once: true });
  bootstrap.Modal.getInstance($("detailModal"))?.hide();
});
$("detailPlanBtn").addEventListener("click", () => {
  if (!detailItem) return;
  if (!getCurrentUser()) {
    $("detailModal").addEventListener("hidden.bs.modal", openLogin, { once: true });
    bootstrap.Modal.getInstance($("detailModal"))?.hide();
  } else addToPlan(detailItem, $("detailPlanBtn"));
});

// An unavailable map must not block area loading or tourism search.
initMap().then(async () => {
  const mapped = await updateMap(items, highlight);
  if (mapped?.length) { items = mapped; renderTourList(); }
});
initEnjoyTrip();
