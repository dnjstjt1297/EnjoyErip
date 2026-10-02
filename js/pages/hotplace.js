import { initAuth, openLogin } from "../ui/auth.js";
import { getCurrentUser } from "../services/auth-service.js";
import { getHotplaces, saveHotplace, deleteHotplace } from "../services/hotplace-service.js";
import { initMap, renderMarkers, focusMarker, fitAllMarkers, createLocationPicker } from "../map/kakao-map.js";
import { fetchLocationBasedList, fetchTourDetail, extractItems, responseBody, CONTENT_TYPE_NAMES } from "../api/tour-api.js";
import { getRegions, loadRegions } from "../services/region-service.js";
import { escapeHtml as e, imageMarkup, enableImageFallbacks, validCoordinates, today } from "../ui/helpers.js";
import { photoMarkup, compressPhoto, safePhotoData } from "../ui/hotplace-photo.js";
import { showMessage } from "../ui/toast.js";
import { scrollToElement } from "../ui/interactions.js";
import { initVisits, visitButton, toggleVisit } from "../ui/visits.js";

// Wonseok's list → story → editor flow, using the existing local services.
initAuth(); initVisits();
const $ = (id) => document.getElementById(id);
const form = $("hotplaceForm");
let editingId = "", editorOwner = "", editorOpen = false, editorVersion = 0;
let detailOwner = "";
let picker, pickerPromise, photo = "", photoBusy = false, photoVersion = 0;
let selectedPlace = null, tourItems = [], tourPage = 1, tourTotal = 0, tourVersion = 0;
let tourRequest, linkedRequest, addressVersion = 0;
let tourSearch = { areaCode: "", contentTypeId: "12", keyword: "" };
const guarded = (action) => { try { return action(); } catch (error) { showMessage(error.message, "danger"); } };
const currentEditor = (version, owner) => editorOpen && version === editorVersion && getCurrentUser()?.id === owner;
const editorModal = () => bootstrap.Modal.getOrCreateInstance($("hotplaceModal"));
const detailModal = () => bootstrap.Modal.getOrCreateInstance($("hotplaceDetailModal"));
const asVisitPlace = (place) => ({ ...place, addr1: place.address || "", lDongRegnCd: place.touristPlace?.lDongRegnCd || "" });
$("visitDate").max = today();

function showError(message = "") { $("hotError").textContent = message; $("hotError").hidden = !message; }
function previewImage() {
  $("imagePreview").hidden = false;
  $("imagePreview").innerHTML = photoMarkup(photo, $("placeImage").value.trim(), "등록할 장소 사진 미리보기");
  enableImageFallbacks($("imagePreview"));
}
function displaySelection() {
  $("hotTourSelected").hidden = !selectedPlace;
  $("hotTourSelectedLabel").textContent = selectedPlace ? `선택한 관광지: ${selectedPlace.title}` : "";
  $("hotTourResults").querySelectorAll("[data-tour-select]").forEach((button) => {
    const selected = button.dataset.tourSelect === String(selectedPlace?.contentid);
    button.setAttribute("aria-pressed", String(selected)); button.textContent = selected ? "선택됨 ✓" : "선택";
  });
}
function clearSelection() { selectedPlace = null; displaySelection(); }
function cancelTourSearch() {
  tourVersion++; tourRequest?.abort(); linkedRequest?.abort();
  $("hotTourSearch").disabled = false;
}
function resetTourSearch() {
  cancelTourSearch(); tourItems = []; tourPage = 1; tourTotal = 0;
  $("hotTourResults").replaceChildren(); $("hotTourPagination").hidden = true;
  $("hotTourStatus").textContent = "지역이나 이름으로 찾아보세요. 실제 TourAPI 관광지를 조회합니다.";
}
function updateLocation({ pan = true } = {}) {
  const lat = $("placeLat").value, lng = $("placeLng").value;
  if (validCoordinates(lat, lng)) {
    picker?.setLocation(lat, lng, { pan });
    $("selectedLocation").textContent = `선택한 위치: 위도 ${Number(lat).toFixed(6)}, 경도 ${Number(lng).toFixed(6)}`;
  } else {
    picker?.clear();
    $("selectedLocation").textContent = "지도를 클릭하거나 주소 검색으로 위치를 지정해 주세요.";
  }
}
function setLocation(point) {
  $("placeLat").value = Number(point.mapy).toFixed(7);
  $("placeLng").value = Number(point.mapx).toFixed(7);
  updateLocation();
}
async function ensurePicker() {
  if (!pickerPromise) {
    pickerPromise = createLocationPicker("pickMap", { onSelect: ({ lat, lng }) => {
      if (!editorOpen || editorOwner !== getCurrentUser()?.id) return;
      addressVersion++; clearSelection();
      setLocation({ mapy: lat, mapx: lng });
    } }).then((result) => { picker = result; return result; }).catch((error) => {
      $("pickMap").innerHTML = `<div class="map-unavailable" role="status"><strong>지도 연결이 필요해요</strong><p>${e(error.message)}</p><p>위도·경도를 직접 입력해도 기록할 수 있어요.</p></div>`;
      throw error;
    });
  }
  return pickerPromise;
}
async function loadTourRegions(version, owner) {
  try {
    const regions = getRegions().length ? getRegions() : await loadRegions();
    if (!currentEditor(version, owner)) return;
    const selected = $("hotTourArea").value;
    $("hotTourArea").replaceChildren(new Option("전국", ""), ...regions.map((region) => new Option(region.name, region.code)));
    if (regions.some((region) => region.code === selected)) $("hotTourArea").value = selected;
  } catch (error) { if (currentEditor(version, owner)) $("hotTourStatus").textContent = error.message; }
}
function openEditor(id = "") {
  const user = getCurrentUser();
  if (!user) { loginThen(() => openEditor(id)); return; }
  const item = id ? getHotplaces().find((entry) => entry.id === id) : null;
  if (id && !item) { showMessage("수정할 장소를 찾을 수 없습니다.", "warning"); return; }
  editorVersion++; addressVersion++; photoVersion++;
  editorOwner = user.id; editorOpen = true; editingId = item?.id || "";
  form.reset(); resetTourSearch(); showError();
  selectedPlace = item?.touristPlace || null; displaySelection();
  $("hotplaceEditorTitle").textContent = item ? "핫플레이스 수정" : "핫플레이스 등록";
  $("savePlaceBtn").textContent = item ? "수정 저장" : "핫플레이스 저장";
  $("savePlaceBtn").disabled = false;
  $("findAddress").disabled = false;
  for (const [key, field] of Object.entries({ name: "placeName", date: "visitDate", type: "placeType", description: "placeDescription", address: "placeAddress", imageUrl: "placeImage", mapy: "placeLat", mapx: "placeLng" })) $(field).value = item?.[key] ?? "";
  if (!item) { $("visitDate").value = today(); $("placeType").value = "관광지"; }
  if (item?.type && !$("placeType").value) { $("placeType").add(new Option(item.type, item.type)); $("placeType").value = item.type; }
  photo = safePhotoData(item?.photo); photoBusy = false;
  $("photoStatus").textContent = photo ? "업로드한 사진을 보관하고 있어요." : "사진 없이도 기록할 수 있어요.";
  previewImage(); updateLocation(); editorModal().show();
  loadTourRegions(editorVersion, editorOwner);
}
function loginThen(action) {
  if (getCurrentUser()) { action(); return; }
  openLogin();
  $("loginModal").addEventListener("hidden.bs.modal", () => { if (getCurrentUser()) guarded(action); }, { once: true });
}
function afterDetailClosed(action) {
  const owner = getCurrentUser()?.id;
  const run = () => {
    // A cross-tab account switch can happen while Bootstrap is fading out.
    // Never pass the previous member's place to the newly signed-in member.
    if (owner && getCurrentUser()?.id === owner) guarded(action);
  };
  if ($("hotplaceDetailModal").classList.contains("show")) {
    $("hotplaceDetailModal").addEventListener("hidden.bs.modal", run, { once: true });
    detailModal().hide();
  } else run();
}
$("hotplaceDetailModal").addEventListener("hidden.bs.modal", () => {
  detailOwner = "";
  $("hotDetail").replaceChildren();
  delete $("hotDetail").dataset.id;
});
$("hotplaceDetailModal").addEventListener("shown.bs.modal", () => {
  // Bootstrap ignores hide() during its opening transition. Recheck here too.
  if (!detailOwner || detailOwner !== getCurrentUser()?.id) detailModal().hide();
});
$("hotplaceModal").addEventListener("shown.bs.modal", async () => {
  if (!editorOpen || editorOwner !== getCurrentUser()?.id) { editorModal().hide(); return; }
  const version = editorVersion, owner = editorOwner;
  try {
    const instance = await ensurePicker();
    if (!currentEditor(version, owner)) return;
    instance.relayout(); updateLocation();
  } catch { /* The picker explains fallback; text and coordinate fields remain usable. */ }
});
$("hotplaceModal").addEventListener("hide.bs.modal", () => {
  editorOpen = false; editorVersion++; photoVersion++; addressVersion++;
  cancelTourSearch(); photoBusy = false;
});

function renderHotplaces() {
  const user = getCurrentUser();
  $("hotplaceLoginNotice").hidden = Boolean(user);
  const filter = $("hotFilter").value;
  const places = getHotplaces().filter((place) => filter === "all" || (filter === "tour" ? place.touristPlace : !place.touristPlace))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  $("hotplaceCount").textContent = `${places.length}곳`;
  $("hotplaceList").innerHTML = places.length ? places.map((place) => `<div class="col-sm-6"><article class="card hotplace-card h-100 overflow-hidden" data-id="${e(place.id)}">
    ${photoMarkup(place.photo, place.imageUrl, place.name)}<div class="card-body"><div class="hotplace-card-tags"><span class="category-tag">${e(place.type)}</span><span class="discovery-badge">나만의 발견</span></div><h2 class="h5">${e(place.name)}</h2><p class="hotplace-card-address">${e(place.address || "지도에 기록한 장소")}</p><p class="hotplace-card-meta">${e(user?.name || "여행자")} · ${e(place.date)}</p>
    <button type="button" class="hotplace-story-link" data-action="detail">장소 이야기 보기 ↗</button><div class="hotplace-card-bottom">${visitButton("hotplace", place.id)}<div class="d-flex flex-wrap gap-2"><button type="button" class="btn btn-outline-primary btn-sm" data-action="map">지도</button><button type="button" class="btn btn-outline-secondary btn-sm" data-action="edit">수정</button><button type="button" class="btn btn-outline-danger btn-sm" data-action="delete">삭제</button></div></div></div></article></div>`).join("")
    : '<div class="col-12"><div class="empty-state"><span aria-hidden="true">↗</span><h2 class="h5">아직 발견하지 못한 이야기</h2><p>다시 가고 싶은 카페, 오래 기억할 풍경.<br>첫 번째 핫플레이스를 남겨보세요.</p><button type="button" class="btn btn-outline-primary" data-new-hotplace>내 장소 기록하기</button></div></div>';
  enableImageFallbacks($("hotplaceList"));
  renderMarkers(places.map((place) => ({ ...place, title: place.name, firstimage: place.imageUrl, addr1: place.address || `${place.type} · ${place.date}` })), (place, { source } = {}) => {
    $("hotplaceList").querySelectorAll(".hotplace-card").forEach((card) => card.classList.toggle("is-selected", card.dataset.id === place.id));
    if (source === "marker") showDetail(place.id, false);
  });
}
function showDetail(id, focus = true) {
  const place = getHotplaces().find((item) => item.id === id);
  if (!place) { showMessage("장소를 찾을 수 없습니다.", "warning"); return; }
  detailOwner = getCurrentUser()?.id || "";
  if (focus) focusMarker(id);
  $("hotDetail").dataset.id = place.id;
  $("hotDetail").innerHTML = `${photoMarkup(place.photo, place.imageUrl, place.name)}<div class="hotplace-detail-copy"><div class="hotplace-card-tags"><span class="category-tag">${e(place.type)}</span><span class="discovery-badge">나만의 발견</span></div><h2 id="hotDetailTitle">${e(place.name)}</h2><p class="hotplace-detail-meta">${e(getCurrentUser()?.name || "여행자")} · 방문 ${e(place.date)}${place.createdAt ? ` · 등록 ${e(place.createdAt.slice(0, 10))}` : ""}</p><p class="preserve-lines">${e(place.description)}</p><dl><dt>주소</dt><dd>${e(place.address || "등록된 주소가 없어요. 지도에서 위치를 확인해 주세요.")}</dd></dl>${place.touristPlace ? `<p class="hotplace-tour-source">관광지 연결 · ${e(place.touristPlace.title)}<br><small>장소 소개와 사진은 내가 남긴 기록입니다.</small></p>` : ""}<div class="mb-3">${visitButton("hotplace", place.id)}</div><div class="d-flex flex-wrap gap-2"><a class="btn btn-outline-primary" href="https://map.kakao.com/link/to/${encodeURIComponent(place.name)},${Number(place.mapy)},${Number(place.mapx)}" target="_blank" rel="noopener noreferrer">카카오 길찾기 ↗</a><button type="button" class="btn btn-outline-secondary" data-action="edit">수정</button><button type="button" class="btn btn-outline-danger" data-action="delete">삭제</button></div></div>`;
  enableImageFallbacks($("hotDetail")); detailModal().show();
}
function deletePlace(id) {
  if (!confirm("이 장소 소개와 사진을 삭제할까요? 이미 남긴 여행 여권의 방문 기록은 유지됩니다.")) return;
  deleteHotplace(id);
  if ($("hotplaceDetailModal").classList.contains("show")) detailModal().hide();
  renderHotplaces(); showMessage("장소를 삭제했습니다.", "success");
}
function handlePlaceAction(event) {
  if (event.target.closest("[data-new-hotplace]")) { openEditor(); return; }
  const card = event.target.closest("[data-id]");
  if (!card) return;
  const place = getHotplaces().find((item) => item.id === card.dataset.id);
  if (!place) return;
  if (event.target.closest(".js-visit")) {
    afterDetailClosed(() => toggleVisit("hotplace", asVisitPlace(place)).catch((error) => showMessage(error.message, "warning")));
    return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "detail") showDetail(place.id);
  else if (action === "edit") afterDetailClosed(() => openEditor(place.id));
  else if (action === "delete") deletePlace(place.id);
  else if (action === "map") {
    if (focusMarker(place.id)) scrollToElement($("map"), "center");
    else showMessage("지도를 불러온 뒤 이용하세요.", "info");
  }
}
$("hotplaceList").addEventListener("click", (event) => guarded(() => handlePlaceAction(event)));
$("hotDetail").addEventListener("click", (event) => guarded(() => handlePlaceAction(event)));
$("newHotplace").addEventListener("click", () => guarded(() => openEditor()));
$("hotFilter").addEventListener("change", () => guarded(renderHotplaces));
$("hotFitMarkers").addEventListener("click", () => { if (!fitAllMarkers()) showMessage("지도에 표시할 장소가 없어요.", "info"); });

function selectTourPlace(place) {
  selectedPlace = { ...place, contentid: String(place.contentid) };
  $("placeName").value = place.title || ""; $("placeAddress").value = place.addr1 || "";
  $("placeType").value = ({ 12: "관광지", 14: "문화시설", 15: "축제·공연", 25: "여행코스", 28: "레포츠", 32: "숙박", 38: "쇼핑", 39: "카페·음식점" })[place.contenttypeid] || "기타";
  addressVersion++;
  if (validCoordinates(place.mapy, place.mapx)) setLocation(place);
  else { $("placeLat").value = ""; $("placeLng").value = ""; updateLocation(); }
  displaySelection();
  $("hotTourStatus").textContent = validCoordinates(place.mapy, place.mapx)
    ? `${place.title}의 이름, 주소, 위치를 채웠어요. 나만의 방문 이야기와 사진을 남겨보세요.`
    : "이 관광지는 좌표가 없어요. 주소 검색이나 지도 클릭으로 위치를 지정해 주세요.";
}
async function searchTourPlaces(reset = false) {
  if (!editorOpen || editorOwner !== getCurrentUser()?.id) return;
  if (reset) {
    tourPage = 1;
    tourSearch = { areaCode: $("hotTourArea").value, contentTypeId: $("hotTourType").value, keyword: $("hotTourKeyword").value.trim() };
  }
  cancelTourSearch(); const version = tourVersion, editor = editorVersion, owner = editorOwner;
  tourRequest = new AbortController();
  $("hotTourSearch").disabled = true; $("hotTourPrev").disabled = true; $("hotTourNext").disabled = true;
  $("hotTourStatus").textContent = "관광지를 검색하고 있어요…";
  $("hotTourResults").innerHTML = '<div class="hot-tour-loading" role="status"><span class="button-spinner" aria-hidden="true"></span> 관광 정보 불러오는 중</div>';
  $("hotTourPagination").hidden = true;
  try {
    const data = await fetchLocationBasedList({ ...tourSearch, arrange: "A", pageNo: tourPage, numOfRows: 6 }, { signal: tourRequest.signal });
    if (version !== tourVersion || !currentEditor(editor, owner)) return;
    tourItems = extractItems(data); tourTotal = Number(responseBody(data).totalCount) || tourItems.length;
    $("hotTourStatus").textContent = tourItems.length ? `총 ${tourTotal.toLocaleString()}곳 · 등록할 장소의 선택 버튼을 눌러 주세요.` : "검색된 관광지가 없어요. 지역이나 검색어를 바꾸어 보세요.";
    $("hotTourResults").innerHTML = tourItems.map((place) => `<article class="hot-tour-result">${imageMarkup(place.firstimage || place.firstimage2, place.title)}<div><span class="category-tag">${e(CONTENT_TYPE_NAMES[place.contenttypeid] || "여행지")}</span><strong>${e(place.title)}</strong><p>${e(place.addr1 || "주소 정보 없음")}</p></div><button type="button" class="btn btn-outline-primary btn-sm" data-tour-select="${e(place.contentid)}" aria-label="${e(place.title)} 선택" aria-pressed="false">선택</button></article>`).join("");
    displaySelection(); enableImageFallbacks($("hotTourResults"));
    $("hotTourPagination").hidden = !tourItems.length;
    $("hotTourPage").textContent = `${tourPage} / ${Math.max(1, Math.ceil(tourTotal / 6))}`;
    $("hotTourPrev").disabled = tourPage <= 1; $("hotTourNext").disabled = tourPage * 6 >= tourTotal;
  } catch (error) {
    if (error.name === "AbortError" || version !== tourVersion || !currentEditor(editor, owner)) return;
    $("hotTourStatus").textContent = error.message; $("hotTourResults").replaceChildren();
  } finally { if (version === tourVersion) $("hotTourSearch").disabled = false; }
}
$("hotTourSearch").addEventListener("click", () => searchTourPlaces(true));
$("hotTourKeyword").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); searchTourPlaces(true); } });
for (const id of ["hotTourArea", "hotTourType", "hotTourKeyword"]) $(id).addEventListener("input", resetTourSearch);
$("hotTourPrev").addEventListener("click", () => { if (tourPage > 1) { tourPage--; searchTourPlaces(); } });
$("hotTourNext").addEventListener("click", () => { if (tourPage * 6 < tourTotal) { tourPage++; searchTourPlaces(); } });
$("hotTourResults").addEventListener("click", (event) => {
  const button = event.target.closest("[data-tour-select]");
  const place = tourItems.find((item) => String(item.contentid) === button?.dataset.tourSelect);
  if (place) selectTourPlace(place);
});
$("clearTourSelection").addEventListener("click", () => { clearSelection(); $("hotTourStatus").textContent = "직접 입력 모드입니다. 장소 정보를 자유롭게 수정해 보세요."; });
for (const id of ["placeAddress", "placeLat", "placeLng"]) $(id).addEventListener("input", () => { addressVersion++; clearSelection(); if (id !== "placeAddress") updateLocation({ pan: false }); });
$("findAddress").addEventListener("click", async () => {
  const address = $("placeAddress").value.trim();
  if (!address) { showMessage("검색할 주소를 입력해 주세요.", "warning"); return; }
  const version = ++addressVersion, editor = editorVersion, owner = editorOwner;
  $("findAddress").disabled = true;
  try {
    const instance = await ensurePicker(); const point = await instance.searchAddress(address);
    if (version !== addressVersion || !currentEditor(editor, owner)) return;
    clearSelection(); setLocation(point); showMessage("주소에 해당하는 위치를 선택했어요.", "success");
  } catch (error) { if (version === addressVersion && currentEditor(editor, owner)) showMessage(error.message, "warning"); }
  finally { if (editor === editorVersion) $("findAddress").disabled = false; }
});
$("placeImage").addEventListener("change", previewImage);
$("placePhoto").addEventListener("change", async (event) => {
  const file = event.target.files?.[0]; if (!file) return;
  const version = ++photoVersion, editor = editorVersion, owner = editorOwner;
  photoBusy = true; $("savePlaceBtn").disabled = true; $("photoStatus").textContent = "사진을 작게 압축하고 있어요…";
  try {
    const result = await compressPhoto(file);
    if (version !== photoVersion || !currentEditor(editor, owner)) return;
    photo = result; previewImage(); $("photoStatus").textContent = "사진이 준비됐어요. 이 브라우저에 함께 저장됩니다.";
  } catch (error) {
    if (version !== photoVersion || !currentEditor(editor, owner)) return;
    $("placePhoto").value = ""; $("photoStatus").textContent = error.message; showMessage(error.message, "warning");
  } finally { if (version === photoVersion && currentEditor(editor, owner)) { photoBusy = false; $("savePlaceBtn").disabled = false; } }
});
$("clearPlacePhoto").addEventListener("click", () => {
  photoVersion++; photo = ""; photoBusy = false; $("savePlaceBtn").disabled = false;
  $("placePhoto").value = ""; $("placeImage").value = ""; $("photoStatus").textContent = "사진 없이도 기록할 수 있어요."; previewImage();
});
$("cancelPlaceEdit").addEventListener("click", () => { if (confirm("입력한 내용을 비우고 새 장소를 기록할까요? 저장된 장소는 유지됩니다.")) openEditor(); });
form.addEventListener("submit", (event) => {
  event.preventDefault(); showError();
  try {
    if (!editorOpen || editorOwner !== getCurrentUser()?.id) throw new Error("로그인 계정이 변경되었습니다. 등록 창을 다시 열어 주세요.");
    if (photoBusy) throw new Error("사진을 처리 중입니다. 잠시 후 저장해 주세요.");
    saveHotplace({ id: editingId || undefined, name: $("placeName").value, date: $("visitDate").value,
      type: $("placeType").value, description: $("placeDescription").value, address: $("placeAddress").value,
      imageUrl: $("placeImage").value.trim(), photo, touristPlace: selectedPlace,
      mapy: $("placeLat").value, mapx: $("placeLng").value });
    editorModal().hide(); renderHotplaces(); showMessage("장소를 저장했습니다.", "success");
  } catch (error) { showError(error.message); }
});
window.addEventListener("authchange", () => guarded(() => {
  const owner = getCurrentUser()?.id;
  if (editorOpen && editorOwner !== owner) {
    editorOpen = false; editorVersion++; photoVersion++; addressVersion++;
    resetTourSearch(); selectedPlace = null; displaySelection();
    photo = ""; photoBusy = false; form.reset(); previewImage();
    editorModal().hide();
  }
  if (detailOwner && detailOwner !== owner) {
    detailOwner = "";
    $("hotDetail").replaceChildren(); delete $("hotDetail").dataset.id;
    detailModal().hide();
  }
  renderHotplaces();
}));
guarded(renderHotplaces);
initMap().then(() => guarded(renderHotplaces));
const linkedId = new URLSearchParams(location.search).get("contentId");
if (linkedId && /^\d{1,12}$/.test(linkedId)) loginThen(async () => {
  openEditor(); const editor = editorVersion, owner = editorOwner, version = tourVersion;
  linkedRequest = new AbortController(); $("hotTourStatus").textContent = "선택한 관광지를 불러오고 있어요…";
  try {
    const data = await fetchTourDetail(linkedId, { signal: linkedRequest.signal });
    if (version !== tourVersion || !currentEditor(editor, owner)) return;
    const place = extractItems(data)[0];
    if (!place?.contentid) throw new Error("선택한 관광지를 찾을 수 없습니다. 등록 창에서 검색해 주세요.");
    selectTourPlace(place);
  } catch (error) { if (error.name !== "AbortError" && currentEditor(editor, owner)) $("hotTourStatus").textContent = error.message; }
});
