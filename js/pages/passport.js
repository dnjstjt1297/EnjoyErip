import { initAuth } from "../ui/auth.js";
import { getCurrentUser } from "../services/auth-service.js";
import { getRegions, loadRegions } from "../services/region-service.js";
import { getVisits, getVisitStats, removeVisit } from "../services/visit-service.js";
import { escapeHtml, imageMarkup, enableImageFallbacks } from "../ui/helpers.js";
import { showMessage } from "../ui/toast.js";

initAuth();
const $ = (id) => document.getElementById(id);
let regions = [];
let regionsLoading = true;
let regionsError = "";
let unvisitedRegions = [];
let renderedOwner = null;
let hasRenderedStamps = false;

function dateLabel(date) {
  return /^\d{4}-\d{2}-\d{2}/.test(date || "") ? date.slice(0, 10).replaceAll("-", ".") : "방문일 미기록";
}

function stampMarkup(region, index, archived = false) {
  const visited = region.count > 0;
  const tag = archived ? "div" : "a";
  const name = escapeHtml(region.name.replace(/(?:특별자치시|특별자치도|광역시|특별시)$/, ""));
  const href = archived ? "" : ` href="./trip.html?region=${encodeURIComponent(region.code)}"`;
  const label = `${region.name}, ${visited ? `${region.count}곳 방문` : "아직 방문하지 않은 지역"}${archived ? "" : ", 여행지 찾기"}`;
  return `<${tag}${href} class="passport-stamp ${visited ? "is-visited" : "is-unvisited"}${!hasRenderedStamps && visited ? " stamp-enter" : ""}" data-region="${escapeHtml(region.code)}" title="${escapeHtml(region.name)}" aria-label="${escapeHtml(label)}" style="--stamp-rotation:${[-6, 3, -2, 5][index % 4]}deg;--stamp-delay:${Math.min(index, 8) * 35}ms">
    <span class="stamp-rim" aria-hidden="true"><span>${visited ? "MEMORY COLLECTED" : "YOUR NEXT JOURNEY"}</span><strong>${name}</strong><span class="stamp-count">${visited ? `✓ ${region.count}곳 방문` : "+ 새로운 여행"}</span><small>${visited ? dateLabel(region.lastVisited) : "ENJOYTRIP · KOREA"}</small></span>
  </${tag}>`;
}

function renderVisits(visits, user) {
  $("passportVisitCount").textContent = String(visits.length);
  if (!visits.length) {
    $("visitList").innerHTML = `<div class="passport-empty"><span class="passport-empty-symbol" aria-hidden="true">↗</span><h3 class="h5">${user ? "첫 여행의 스탬프를 기다리고 있어요" : "당신의 여행을 담을 준비가 됐어요"}</h3><p>${user ? '여행지나 여행계획에서 “다녀왔어요”를 눌러 기록을 남겨보세요.' : "로그인하면 다녀온 장소와 지역을 나만의 여권에 모을 수 있어요."}</p>${user ? '<a class="btn btn-primary" href="./trip.html">여행지 둘러보기 ↗</a>' : '<button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#loginModal">로그인하고 시작하기</button>'}</div>`;
    return;
  }
  $("visitList").innerHTML = [...visits].sort((a, b) => String(b.visitedAt).localeCompare(String(a.visitedAt))).map((visit) => `<article class="passport-visit-card" data-source="${escapeHtml(visit.source)}" data-source-id="${escapeHtml(visit.sourceId)}">
    ${imageMarkup(visit.imageUrl, visit.title)}
    <div class="passport-visit-content"><div class="passport-visit-meta"><span class="passport-source ${visit.source === "hotplace" ? "is-discovery" : ""}">${visit.source === "hotplace" ? "✧ 나만의 발견" : "TourAPI 여행지"}</span><span>${escapeHtml(visit.regionName)}</span></div><h3 class="h6">${escapeHtml(visit.title)}</h3><p class="passport-visit-address">${escapeHtml(visit.addr1 || "등록된 주소가 없어요")}</p><div class="passport-visit-bottom"><time datetime="${escapeHtml(String(visit.visitedAt || "").slice(0, 10))}">${dateLabel(visit.visitedAt)} 방문</time><button type="button" class="btn btn-link btn-sm js-cancel-visit" aria-label="${escapeHtml(visit.title)} 방문 기록 취소">기록 취소</button></div></div>
  </article>`).join("");
  enableImageFallbacks($("visitList"));
}

function renderPassport() {
  try {
    const user = getCurrentUser();
    if (renderedOwner !== (user?.id || null)) {
      renderedOwner = user?.id || null;
      hasRenderedStamps = false;
    }
    const visits = getVisits();
    const stats = getVisitStats(regions);
    $("passportOwner").textContent = user ? `${user.name}님의 여행` : "다음 여행의 주인공";
    $("passportOwnerNote").textContent = user ? "당신이 다녀온 곳, 당신만의 이야기." : "로그인하고 나만의 여권을 채워보세요.";
    $("passportLoginNotice").hidden = Boolean(user);
    $("passportRegionCount").textContent = String(stats.visitedRegions);
    $("passportRegionTotal").textContent = ` / ${regions.length ? stats.totalRegions : "—"}`;
    $("passportPlaceCount").textContent = String(stats.visitedPlaces);
    $("passportMonthCount").textContent = String(stats.thisMonth);
    $("passportTopRegion").textContent = stats.topRegion?.name || "아직 없어요";
    $("passportTopRegion").title = stats.topRegion ? `${stats.topRegion.name} ${stats.topRegion.count}곳` : "";
    $("stampGrid").innerHTML = stats.regions.map((region, index) => stampMarkup(region, index)).join("");
    $("stampGrid").setAttribute("aria-busy", String(regionsLoading));
    const archived = stats.unassignedRegions || [];
    $("passportArchived").hidden = !archived.length;
    $("passportArchivedStamps").innerHTML = archived.map((region, index) => stampMarkup(region, index, true)).join("");
    if (regions.length || archived.length) hasRenderedStamps = true;
    $("passportRegionStatus").textContent = regionsLoading ? "최신 지역 목록을 확인하고 있어요." : regionsError || `${regions.length}개 지역, 다음 여행을 위한 빈 페이지.`;
    $("passportRegionStatus").classList.toggle("text-danger", Boolean(regionsError));
    unvisitedRegions = stats.regions.filter((region) => !region.count);
    $("exploreUnvisitedBtn").disabled = !unvisitedRegions.length;
    $("passportNextCopy").textContent = regions.length && !unvisitedRegions.length ? "모든 지역에 발자국을 남겼네요. 다음 여행도 기대돼요." : "아직 방문하지 않은 지역으로 떠나볼까요?";
    renderVisits(visits, user);
  } catch (error) {
    $("passportRegionStatus").textContent = error.message;
    $("passportRegionStatus").classList.add("text-danger");
    $("stampGrid").setAttribute("aria-busy", "false");
    $("exploreUnvisitedBtn").disabled = true;
  }
}

$("exploreUnvisitedBtn").addEventListener("click", () => {
  if (!unvisitedRegions.length) return;
  const region = unvisitedRegions[Math.floor(Math.random() * unvisitedRegions.length)];
  window.location.href = `./trip.html?region=${encodeURIComponent(region.code)}`;
});

$("visitList").addEventListener("click", (event) => {
  const button = event.target.closest(".js-cancel-visit");
  if (!button) return;
  const card = button.closest(".passport-visit-card");
  try {
    if (removeVisit(card.dataset.source, card.dataset.sourceId)) {
      showMessage("방문 기록을 취소했습니다.", "success");
      // Cancellation removes the activated button. Keep keyboard focus in the records section.
      $("passportRecordTitle").tabIndex = -1;
      $("passportRecordTitle").focus({ preventScroll: true });
    }
  } catch (error) { showMessage(error.message, "danger"); }
});

window.addEventListener("authchange", renderPassport);
window.addEventListener("visitschange", renderPassport);
try { regions = getRegions(); } catch (error) { regionsError = error.message; }
renderPassport();
loadRegions().then((result) => {
  regions = result;
  regionsError = "";
}).catch(() => {
  regionsError = "지역 목록을 불러오지 못했어요. 연결을 확인하고 새로고침해주세요. 저장한 방문 기록은 그대로 남아 있어요.";
}).finally(() => {
  regionsLoading = false;
  renderPassport();
});
