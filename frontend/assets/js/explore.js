import { initSite } from './site.js';
import { requireLogin } from './auth.js';
import { api, TYPES, compactPlace } from './api.js';
import { TravelMap } from './map.js';
import { currentUser, ownedItems, saveOwned, deleteOwned, addPlanPlace } from './storage.js';
import { $, escapeHTML as e, safeImage, plainText, toast, openDialog } from './ui.js';

initSite();
const map = new TravelMap('#map', { onSelect: (place) => showDetail(place) });
let items = [], page = 1, total = 0, requestVersion = 0, cityVersion = 0, detailVersion = 0;
let searchController;
let lastSearch = { areaCode: '1', sigunguCode: '', contentTypeId: '', keyword: '' };
const savedIds = () => new Set(ownedItems('favorites').map((item) => item.place.contentid));
const favoriteMode = () => $('#favoritesOnly').checked;

async function loadCities() {
  const version = ++cityVersion;
  $('#sigungu').innerHTML = '<option value="">전체</option>';
  if (!$('#area').value) return;
  try {
    const data = await api('tour/areas', { areaCode: $('#area').value });
    if (version !== cityVersion) return;
    $('#sigungu').innerHTML += data.items.map((item) => `<option value="${e(item.code)}">${e(item.name)}</option>`).join('');
  } catch (error) { toast(error.message); }
}
async function search(reset = false) {
  if (reset) {
    page = 1;
    lastSearch = { areaCode: $('#area').value, sigunguCode: $('#sigungu').value, contentTypeId: $('#contentType').value, keyword: $('#keyword').value.trim() };
  }
  const version = ++requestVersion;
  searchController?.abort(); searchController = new AbortController();
  if (favoriteMode()) {
    $('#searchButton').disabled = false;
    items = ownedItems('favorites').map((item) => item.place).filter((place) => (!lastSearch.areaCode || place.areacode === lastSearch.areaCode) && (!lastSearch.sigunguCode || place.sigungucode === lastSearch.sigunguCode) && (!lastSearch.contentTypeId || place.contenttypeid === lastSearch.contentTypeId) && (!lastSearch.keyword || `${place.title} ${place.addr1}`.includes(lastSearch.keyword)));
    total = items.length; page = 1; render(); return;
  }
  $('#results').innerHTML = '<div class="loading-state"><span class="loading-dot"></span><p>한국관광공사의 정보를 불러오고 있어요.</p></div>';
  $('#searchButton').disabled = true;
  $('#resultStatus').textContent = '관광정보 조회 중…';
  try {
    const data = await api('tour/list', { ...lastSearch, pageNo: page, numOfRows: 12 }, { signal: searchController.signal });
    if (version !== requestVersion) return;
    items = data.items.map(compactPlace); total = data.total; render();
  } catch (error) {
    if (error.name === 'AbortError' || version !== requestVersion) return;
    items = []; total = 0;
    $('#results').innerHTML = `<div class="error-state"><strong>정보를 불러오지 못했어요.</strong><p>${e(error.message)}</p><button class="button button-secondary" id="retrySearch">다시 시도</button></div>`;
    $('#retrySearch').onclick = () => search();
    $('#resultStatus').textContent = '조회 실패';
    $('#prevPage').disabled = $('#nextPage').disabled = true;
    map.setPlaces([]);
  } finally { if (version === requestVersion) $('#searchButton').disabled = false; }
}
function render() {
  const saved = savedIds();
  $('#resultStatus').textContent = favoriteMode() ? `검색 조건에 맞는 찜한 장소 ${total.toLocaleString()}곳` : `총 ${total.toLocaleString()}곳 · 한국관광공사 제공`;
  $('#results').innerHTML = items.length ? items.map((place) => {
    const image = safeImage(place.firstimage);
    return `<article class="place-card" data-id="${e(place.contentid)}">${image ? `<img class="place-image" src="${e(image)}" alt="${e(place.title)}" loading="lazy"/>` : '<div class="place-image place-placeholder" aria-hidden="true">⌖</div>'}<div class="place-card-info"><span class="place-category">${e(TYPES[place.contenttypeid] || '여행지')}</span><button class="place-title" data-detail="${e(place.contentid)}">${e(place.title)}</button><p class="place-address">${e(place.addr1 || '주소 정보 없음')}</p><div class="place-actions"><button data-save="${e(place.contentid)}" class="${saved.has(place.contentid) ? 'saved' : ''}" aria-pressed="${saved.has(place.contentid)}">${saved.has(place.contentid) ? '♥ 찜 해제' : '♡ 찜하기'}</button><button data-plan="${e(place.contentid)}">여행에 담기 ＋</button></div></div></article>`;
  }).join('') : '<div class="empty-state">조회된 장소가 없어요.<br />지역이나 검색 조건을 변경해 보세요.</div>';
  $('#results').querySelectorAll('img').forEach((image) => image.onerror = () => { image.style.visibility = 'hidden'; });
  $('#pageLabel').textContent = `${page} / ${Math.max(1, Math.ceil(total / 12))}`;
  $('#prevPage').disabled = favoriteMode() || page <= 1;
  $('#nextPage').disabled = favoriteMode() || page * 12 >= total;
  map.setPlaces(items);
}
function toggleFavorite(place) {
  requireLogin(() => {
    try {
      const existing = ownedItems('favorites').find((item) => item.place.contentid === place.contentid);
      if (existing) { deleteOwned('favorites', existing.id); toast('찜 목록에서 제거했어요.'); }
      else { saveOwned('favorites', { place }); toast('여행지를 찜했어요.'); }
      if (favoriteMode()) search(); else render();
    } catch (error) { toast(error.message); }
  });
}
function addPlace(place) { requireLogin(() => { try { addPlanPlace(place); toast('여행 계획에 담았어요. 여행 계획 메뉴에서 확인하세요.'); } catch (error) { toast(error.message); } }); }
async function showDetail(place) {
  const version = ++detailVersion;
  map.focus(place);
  $('#results').querySelectorAll('.place-card').forEach((card) => card.classList.toggle('selected', card.dataset.id === place.contentid));
  $('#placeDetail').innerHTML = '<div class="loading-state"><span class="loading-dot"></span><p>상세 정보를 불러오고 있어요.</p></div>';
  $('#placeDialog').setAttribute('aria-label', `${place.title} 상세 정보`); openDialog($('#placeDialog'));
  try {
    const data = await api('tour/detail', { contentId: place.contentid, contentTypeId: place.contenttypeid });
    if (version !== detailVersion) return;
    const detail = data.detail || place, intro = data.intro;
    const image = safeImage(detail.firstimage || place.firstimage);
    const info = [['주소', [detail.addr1, detail.addr2].filter(Boolean).join(' ')], ['문의', plainText(detail.tel || intro.infocenter || intro.infocenterfood || intro.infocenterlodging || '')], ['이용 시간', plainText(intro.usetime || intro.opentimefood || intro.usetimeculture || '')], ['휴무', plainText(intro.restdate || intro.restdatefood || intro.restdateculture || '')], ['이용 요금', plainText(intro.usefee || intro.usefeeculture || '')]];
    const link = Number(place.mapx) && Number(place.mapy) ? `https://map.kakao.com/link/to/${encodeURIComponent(place.title)},${place.mapy},${place.mapx}` : `https://map.kakao.com/link/search/${encodeURIComponent(place.title)}`;
    $('#placeDetail').innerHTML = `${image ? `<img src="${e(image)}" class="detail-photo" alt="${e(place.title)}"/>` : ''}<div class="detail-body"><p class="eyebrow">${e(TYPES[place.contenttypeid] || 'ENJOY YOUR JOURNEY')}</p><h2 id="placeTitle">${e(place.title)}</h2><p class="overview">${e(plainText(detail.overview || '상세 소개가 제공되지 않은 장소입니다.'))}</p><dl class="detail-info">${info.filter(([, value]) => value).map(([label, value]) => `<dt>${label}</dt><dd>${e(value)}</dd>`).join('')}</dl><div class="photo-strip">${data.images.map((item) => safeImage(item.originimgurl)).filter(Boolean).map((url) => `<img src="${e(url)}" alt="${e(place.title)} 추가 사진" loading="lazy"/>`).join('')}</div><div class="detail-actions"><button class="button button-primary" id="detailPlan">여행에 담기 ＋</button><button class="button button-secondary" id="detailFavorite">♡ 찜하기 / 해제</button><a class="button button-secondary" href="${e(link)}" target="_blank" rel="noopener">카카오 길찾기 ↗</a></div><p class="small text-secondary mt-4">정보·사진 출처: 한국관광공사. 운영 정보는 방문 전 확인해 주세요.</p></div>`;
    $('#detailPlan').onclick = () => addPlace(place);
    $('#detailFavorite').onclick = () => toggleFavorite(place);
    const hotLink = document.createElement('a');
    hotLink.className = 'button button-secondary';
    hotLink.href = `hotplace.html?contentId=${encodeURIComponent(place.contentid)}`;
    hotLink.textContent = '이 장소 핫플레이스 등록 ↗';
    $('.detail-actions', $('#placeDetail')).append(hotLink);
  } catch (error) { if (version === detailVersion) $('#placeDetail').innerHTML = `<div class="error-state"><h2 id="placeTitle">${e(place.title)}</h2><p>${e(error.message)}</p><button class="button button-primary" id="retryDetail">다시 시도</button></div>`; $('#retryDetail')?.addEventListener('click', () => showDetail(place)); }
}
$('#searchForm').onsubmit = (event) => { event.preventDefault(); search(true); };
$('#area').onchange = loadCities;
$('#favoritesOnly').onchange = () => {
  if (favoriteMode() && !currentUser()) { $('#favoritesOnly').checked = false; requireLogin(() => { $('#favoritesOnly').checked = true; search(true); }); }
  else search(true);
};
$('#prevPage').onclick = () => { page--; search(); $('#results').scrollTop = 0; };
$('#nextPage').onclick = () => { page++; search(); $('#results').scrollTop = 0; };
$('#results').onclick = (event) => {
  const button = event.target.closest('button'); if (!button) return;
  const place = items.find((item) => item.contentid === (button.dataset.detail || button.dataset.save || button.dataset.plan)); if (!place) return;
  if (button.dataset.detail) showDetail(place); else if (button.dataset.save) toggleFavorite(place); else addPlace(place);
};
window.addEventListener('authchange', () => { if (!currentUser()) $('#favoritesOnly').checked = false; search(); });
try {
  const regions = await api('tour/areas');
  $('#area').innerHTML = '<option value="">전국</option>' + regions.items.map((item) => `<option value="${e(item.code)}">${e(item.name)}</option>`).join('');
  const showFavorites = new URLSearchParams(location.search).get('favorites') === '1' && currentUser();
  $('#area').value = showFavorites ? '' : '1';
  $('#favoritesOnly').checked = Boolean(showFavorites);
  await loadCities(); await search(true);
} catch (error) { $('#resultStatus').textContent = error.message; $('#results').innerHTML = '<div class="empty-state">서버 연결을 확인한 후 새로고침해 주세요.</div>'; }
