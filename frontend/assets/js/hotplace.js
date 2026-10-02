import { initSite } from './site.js';
import { requireLogin } from './auth.js';
import { currentUser, readDB, saveOwned, deleteOwned } from './storage.js';
import { TravelMap } from './map.js';
import { api, TYPES, compactPlace } from './api.js';
import { $, escapeHTML as e, safeImage, toast, openDialog, formatDate, confirmAction } from './ui.js';

initSite();
const map = new TravelMap('#map', { onSelect: (place) => showDetail(place.id) });
let picker, photo = '', photoBusy = false, photoVersion = 0;
let selectedPlace = null, tourItems = [], tourPage = 1, tourTotal = 0, tourVersion = 0, tourController;
let tourRegionsLoaded = false, tourRegionsLoading = false;
let tourSearch = { areaCode: '', contentTypeId: '12', keyword: '' };
const validPhoto = (value) => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value || '') ? value : '';
const asPlace = (item) => ({ ...item, title: item.name, addr1: item.address, contentid: item.id });

function render() {
  const user = currentUser();
  const db = readDB();
  const list = db.hotplaces.filter((item) => $('#hotFilter').value !== 'mine' || item.userId === user?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  $('#hotList').innerHTML = list.length ? list.map((item) => `<article class="col-sm-6"><div class="hot-card">${validPhoto(item.photo) ? `<img class="hot-photo" src="${item.photo}" alt="${e(item.name)}" loading="lazy"/>` : '<div class="hot-photo place-placeholder" aria-hidden="true">⌖</div>'}<div class="hot-card-body"><span class="place-category">${e(item.type)}</span><h2>${e(item.name)}</h2><p>${e(item.address)}</p><p>${e(db.users.find((person) => person.id === item.userId)?.name || '여행자')} · ${e(item.visitDate)}</p><button data-detail="${e(item.id)}">장소 이야기 보기 ↗</button></div></div></article>`).join('') : '<div class="col-12 empty-state">아직 등록된 장소가 없어요.<br />나만의 핫플레이스를 소개해 보세요.</div>';
  map.setPlaces(list.map(asPlace));
}
function setLocation(point) {
  $('#hotLat').value = Number(point.mapy).toFixed(7); $('#hotLng').value = Number(point.mapx).toFixed(7);
  picker?.setPlaces([{ ...point, type: $('#hotType').value, title: $('#hotName').value || '선택한 위치' }]);
}
function cancelTourSearch() {
  ++tourVersion; tourController?.abort();
  $('#hotTourSearch').disabled = false;
}
function displaySelection() {
  $('#hotTourSelected').hidden = !selectedPlace;
  $('#hotTourSelectedLabel').textContent = selectedPlace ? `선택한 관광지: ${selectedPlace.title}` : '';
}
function clearSelection() {
  selectedPlace = null; displaySelection();
  $('#hotTourResults').querySelectorAll('[data-tour-select]').forEach((button) => { button.setAttribute('aria-pressed', 'false'); button.textContent = '선택'; });
}
async function loadTourRegions() {
  if (tourRegionsLoaded || tourRegionsLoading) return;
  tourRegionsLoading = true;
  try {
    const { items } = await api('tour/areas');
    $('#hotTourArea').innerHTML = '<option value="">전국</option>' + items.map((item) => `<option value="${e(item.code)}">${e(item.name)}</option>`).join('');
    tourRegionsLoaded = true;
  } catch (error) { $('#hotTourStatus').textContent = error.message; }
  finally { tourRegionsLoading = false; }
}
function selectTourPlace(place) {
  selectedPlace = compactPlace(place);
  $('#hotName').value = selectedPlace.title;
  $('#hotAddress').value = selectedPlace.addr1;
  const types = { 12: '관광지', 14: '문화시설', 15: '문화시설', 25: '관광지', 28: '자연', 32: '숙박', 38: '쇼핑', 39: '카페·음식점' };
  $('#hotType').value = types[selectedPlace.contenttypeid] || '기타';
  const located = selectedPlace.mapy >= 30 && selectedPlace.mapy <= 40 && selectedPlace.mapx >= 123 && selectedPlace.mapx <= 133;
  if (located) setLocation(selectedPlace);
  else { $('#hotLat').value = ''; $('#hotLng').value = ''; picker?.setPlaces([]); }
  displaySelection();
  $('#hotTourStatus').textContent = located ? `${selectedPlace.title}의 이름, 주소, 위치를 채웠어요. 방문일과 사진, 소개를 작성해 주세요.` : '이 관광지는 좌표 정보가 없습니다. 주소 검색이나 지도 클릭으로 위치를 지정해 주세요.';
  $('#hotTourResults').querySelectorAll('[data-tour-select]').forEach((button) => {
    const selected = button.dataset.tourSelect === selectedPlace.contentid;
    button.setAttribute('aria-pressed', String(selected)); button.textContent = selected ? '선택됨 ✓' : '선택';
  });
}
async function searchTourPlaces(reset = false) {
  if (reset) {
    tourPage = 1;
    tourSearch = { areaCode: $('#hotTourArea').value, contentTypeId: $('#hotTourType').value, keyword: $('#hotTourKeyword').value.trim() };
  }
  cancelTourSearch(); const version = tourVersion;
  tourController = new AbortController();
  $('#hotTourSearch').disabled = true;
  $('#hotTourStatus').textContent = '관광지를 검색하고 있어요…';
  $('#hotTourResults').innerHTML = '<div class="loading-state"><span class="loading-dot"></span></div>';
  $('#hotTourPagination').hidden = true;
  try {
    const data = await api('tour/list', { ...tourSearch, pageNo: tourPage, numOfRows: 6 }, { signal: tourController.signal });
    if (version !== tourVersion) return;
    tourItems = data.items.map(compactPlace); tourTotal = data.total;
    $('#hotTourStatus').textContent = tourItems.length ? `총 ${tourTotal.toLocaleString()}곳 · 등록할 장소의 선택 버튼을 눌러 주세요.` : '검색된 관광지가 없어요. 지역이나 검색어를 바꾸어 보세요.';
    $('#hotTourResults').innerHTML = tourItems.map((place) => {
      const image = safeImage(place.firstimage), selected = selectedPlace?.contentid === place.contentid;
      return `<article class="hot-tour-result">${image ? `<img src="${e(image)}" alt="" loading="lazy"/>` : '<span class="hot-tour-placeholder" aria-hidden="true">⌖</span>'}<div><span class="place-category">${e(TYPES[place.contenttypeid] || '여행지')}</span><strong>${e(place.title)}</strong><p>${e(place.addr1 || '주소 정보 없음')}</p></div><button type="button" class="button button-secondary" data-tour-select="${e(place.contentid)}" aria-label="${e(place.title)} 선택" aria-pressed="${selected}">${selected ? '선택됨 ✓' : '선택'}</button></article>`;
    }).join('');
    $('#hotTourResults').querySelectorAll('img').forEach((image) => image.onerror = () => { image.style.visibility = 'hidden'; });
    $('#hotTourPagination').hidden = !tourItems.length;
    $('#hotTourPage').textContent = `${tourPage} / ${Math.max(1, Math.ceil(tourTotal / 6))}`;
    $('#hotTourPrev').disabled = tourPage <= 1; $('#hotTourNext').disabled = tourPage * 6 >= tourTotal;
  } catch (error) {
    if (error.name === 'AbortError' || version !== tourVersion) return;
    $('#hotTourStatus').textContent = error.message; $('#hotTourResults').replaceChildren();
  } finally { if (version === tourVersion) $('#hotTourSearch').disabled = false; }
}
function editor(id) {
  const item = id ? readDB().hotplaces.find((entry) => entry.id === id) : null;
  if (item && item.userId !== currentUser()?.id) { toast('작성자만 수정할 수 있어요.'); return; }
  $('#hotForm').reset(); $('#hotId').value = id || '';
  cancelTourSearch(); tourItems = []; tourPage = 1;
  selectedPlace = item?.touristPlace || null; displaySelection();
  $('#hotTourResults').replaceChildren(); $('#hotTourPagination').hidden = true;
  $('#hotTourStatus').textContent = '지역과 검색어로 관광지를 찾아보세요. 직접 장소를 입력할 수도 있어요.';
  $('#hotTitle').textContent = item ? '핫플레이스 수정' : '핫플레이스 등록';
  $('#hotName').value = item?.name || ''; $('#hotAddress').value = item?.address || '';
  $('#hotDate').value = item?.visitDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  $('#hotType').value = item?.type || '관광지'; $('#hotDescription').value = item?.description || '';
  $('#hotLat').value = item?.mapy || ''; $('#hotLng').value = item?.mapx || '';
  photo = validPhoto(item?.photo); photoBusy = false; ++photoVersion;
  $('#photoPreview').hidden = !photo; if (photo) $('#photoPreview').src = photo;
  $('#hotError').hidden = true; openDialog($('#hotDialog'));
  if (!picker) picker = new TravelMap('#pickMap', { onClick: (point) => { clearSelection(); setLocation(point); } });
  if (item) picker.setPlaces([asPlace(item)]); else picker.setPlaces([]);
  loadTourRegions();
}
async function compressPhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPEG, PNG, WebP 사진만 등록할 수 있어요.');
  if (file.size > 5 * 1024 * 1024) throw new Error('사진은 5MB 이하로 선택해 주세요.');
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
  const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const result = canvas.toDataURL('image/jpeg', .76);
  if (result.length > 700_000) throw new Error('사진을 압축한 뒤 다시 선택해 주세요. 저장 가능한 크기를 초과했습니다.');
  return result;
}
function showDetail(id) {
  const db = readDB(), item = db.hotplaces.find((entry) => entry.id === id); if (!item) return;
  const own = item.userId === currentUser()?.id;
  map.focus(asPlace(item));
  $('#hotDetail').innerHTML = `${validPhoto(item.photo) ? `<img class="detail-photo" src="${item.photo}" alt="${e(item.name)}"/>` : ''}<div class="detail-body"><p class="eyebrow">${e(item.type)}</p><h2 id="hotDetailTitle">${e(item.name)}</h2><p class="post-meta">${e(db.users.find((person) => person.id === item.userId)?.name || '여행자')} · 방문 ${e(item.visitDate)} · 등록 ${formatDate(item.createdAt)}</p><p class="overview">${e(item.description)}</p><dl class="detail-info"><dt>주소</dt><dd>${e(item.address)}</dd></dl><div class="detail-actions"><a class="button button-secondary" href="https://map.kakao.com/link/to/${encodeURIComponent(item.name)},${Number(item.mapy)},${Number(item.mapx)}" target="_blank" rel="noopener">카카오 길찾기 ↗</a>${own ? '<button class="button button-secondary" id="editHot">수정</button><button class="button button-danger" id="deleteHot">삭제</button>' : ''}</div></div>`;
  openDialog($('#hotDetailDialog'));
  $('#editHot')?.addEventListener('click', () => editor(id));
  $('#deleteHot')?.addEventListener('click', async () => {
    if (!await confirmAction('핫플레이스를 삭제할까요?', '장소 소개와 저장한 사진을 삭제합니다.')) return;
    try { deleteOwned('hotplaces', id); render(); toast('핫플레이스를 삭제했어요.'); } catch (error) { toast(error.message); }
  });
}
$('#newHotplace').onclick = () => requireLogin(() => editor());
$('#hotTourSearch').onclick = () => searchTourPlaces(true);
$('#hotTourKeyword').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); searchTourPlaces(true); } });
$('#hotTourPrev').onclick = () => { if (tourPage > 1) { tourPage--; searchTourPlaces(); } };
$('#hotTourNext').onclick = () => { if (tourPage * 6 < tourTotal) { tourPage++; searchTourPlaces(); } };
$('#hotTourResults').onclick = (event) => {
  const button = event.target.closest('[data-tour-select]'); if (!button) return;
  const place = tourItems.find((item) => item.contentid === button.dataset.tourSelect);
  if (place) selectTourPlace(place);
};
$('#clearTourSelection').onclick = () => { clearSelection(); $('#hotTourStatus').textContent = '직접 입력 모드입니다. 장소 정보는 자유롭게 수정할 수 있어요.'; };
['hotAddress', 'hotLat', 'hotLng'].forEach((id) => $('#' + id).addEventListener('input', clearSelection));
$('#hotDialog').addEventListener('close', cancelTourSearch);
$('#hotFilter').onchange = render;
$('#hotList').onclick = (event) => { const button = event.target.closest('[data-detail]'); if (button) showDetail(button.dataset.detail); };
$('#findAddress').onclick = async () => {
  const address = $('#hotAddress').value.trim(); if (!address) { toast('검색할 주소를 입력해 주세요.'); return; }
  $('#findAddress').disabled = true;
  try { const point = await picker.searchAddress(address); clearSelection(); setLocation(point); toast('주소에 해당하는 위치를 선택했어요.'); } catch (error) { toast(error.message); }
  finally { $('#findAddress').disabled = false; }
};
$('#hotPhoto').onchange = async (event) => {
  const file = event.target.files[0]; if (!file) return;
  const version = ++photoVersion; photoBusy = true;
  try { const image = await compressPhoto(file); if (version !== photoVersion) return; photo = image; $('#photoPreview').src = photo; $('#photoPreview').hidden = false; }
  catch (error) { toast(error.message); event.target.value = ''; }
  finally { if (version === photoVersion) photoBusy = false; }
};
$('#hotForm').onsubmit = (event) => {
  event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
  const value = { id: $('#hotId').value || undefined, name: $('#hotName').value.trim(), address: $('#hotAddress').value.trim(), visitDate: $('#hotDate').value, type: $('#hotType').value, mapx: Number($('#hotLng').value), mapy: Number($('#hotLat').value), description: $('#hotDescription').value.trim(), photo, touristPlace: selectedPlace ? { ...selectedPlace } : null };
  try {
    if (photoBusy) throw new Error('사진을 처리 중입니다. 잠시 후 저장해 주세요.');
    if (!value.name || !value.address || !value.description) throw new Error('장소 이름, 주소, 소개를 입력해 주세요.');
    if (!photo) throw new Error('직접 찍은 사진을 한 장 등록해 주세요.');
    if (!(value.mapy >= 30 && value.mapy <= 40 && value.mapx >= 123 && value.mapx <= 133)) throw new Error('대한민국 지역의 위도·경도를 지정해 주세요.');
    saveOwned('hotplaces', value); $('#hotDialog').close(); render(); toast('핫플레이스를 저장했어요.');
  } catch (error) { $('#hotError').textContent = error.message; $('#hotError').hidden = false; }
};
window.addEventListener('authchange', render); render();
const linkedId = new URLSearchParams(location.search).get('contentId');
if (linkedId && /^\d{1,12}$/.test(linkedId)) requireLogin(async () => {
  editor();
  const version = tourVersion;
  $('#hotTourStatus').textContent = '선택한 관광지를 불러오고 있어요…';
  try {
    const data = await api('tour/detail', { contentId: linkedId });
    if (version !== tourVersion || !$('#hotDialog').open) return;
    if (!data.detail) throw new Error('선택한 관광지를 찾을 수 없습니다. 등록 창에서 검색해 주세요.');
    selectTourPlace(data.detail);
  } catch (error) { if (version === tourVersion) $('#hotTourStatus').textContent = error.message; }
});
