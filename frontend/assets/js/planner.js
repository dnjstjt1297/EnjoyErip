import { initSite } from './site.js';
import { requireLogin } from './auth.js';
import { currentUser, ownedItems, saveOwned, deleteOwned, mutateDB, uid } from './storage.js';
import { TravelMap } from './map.js';
import { $, escapeHTML as e, toast, money, downloadJSON, confirmAction } from './ui.js';

initSite();
const map = new TravelMap('#map');
let plan, dirty = false, draggedId;
function createPlan() { return { id: uid(), name: '나의 새로운 여행', startDate: '', days: 1, budget: 0, note: '', places: [], draft: true }; }
function activate() {
  const user = currentUser();
  $('#loginGate').hidden = Boolean(user); $('#plannerContent').hidden = !user;
  if (!user) return;
  const plans = ownedItems('plans');
  plan = structuredClone(plans.find((item) => item.id === plan?.id) || plans.find((item) => item.draft) || plans[0] || createPlan());
  dirty = false; render();
}
function render() {
  const plans = ownedItems('plans');
  const options = plans.some((item) => item.id === plan.id) ? plans : [...plans, plan];
  $('#planSelect').innerHTML = options.map((item) => `<option value="${e(item.id)}">${e(item.name)}</option>`).join('');
  $('#planSelect').value = plan.id;
  $('#planName').value = plan.name; $('#startDate').value = plan.startDate;
  $('#days').value = plan.days; $('#budget').value = plan.budget; $('#planNote').value = plan.note;
  renderRoute();
}
function renderRoute() {
  $('#routeList').innerHTML = plan.places.length ? plan.places.map((place, index) => `<li class="route-item" draggable="true" data-id="${e(place.contentid)}"><div class="route-item-head"><span class="route-number">${index + 1}</span><div class="route-item-title"><strong>${e(place.title)}</strong><small>${e(place.addr1)}</small></div><div class="route-controls"><button data-move="${index}" data-direction="-1" ${index === 0 ? 'disabled' : ''} aria-label="${e(place.title)} 위로 이동">↑</button><button data-move="${index}" data-direction="1" ${index === plan.places.length - 1 ? 'disabled' : ''} aria-label="${e(place.title)} 아래로 이동">↓</button><button data-remove="${e(place.contentid)}" aria-label="${e(place.title)} 삭제">×</button></div></div><div class="route-fields row g-2"><div class="col-4"><label class="form-label" for="day-${index}">일차</label><select id="day-${index}" class="form-select" data-field="day" data-index="${index}">${Array.from({ length: Number(plan.days) }, (_, day) => `<option value="${day + 1}" ${Number(place.day) === day + 1 ? 'selected' : ''}>${day + 1}일차</option>`).join('')}</select></div><div class="col-4"><label class="form-label" for="time-${index}">방문 시간</label><input id="time-${index}" type="time" class="form-control" data-field="time" data-index="${index}" value="${e(place.time)}"/></div><div class="col-4"><label class="form-label" for="cost-${index}">예상 비용</label><input id="cost-${index}" type="number" min="0" max="1000000000" step="1" class="form-control" data-field="cost" data-index="${index}" value="${Number(place.cost || 0)}"/></div><div class="col-12"><label class="visually-hidden" for="note-${index}">장소 메모</label><input id="note-${index}" class="form-control" data-field="note" data-index="${index}" maxlength="500" placeholder="이 장소에서 하고 싶은 일" value="${e(place.note)}"/></div><div class="col-12"><a class="text-link" target="_blank" rel="noopener" href="https://map.kakao.com/link/to/${encodeURIComponent(place.title)},${Number(place.mapy)},${Number(place.mapx)}">카카오 길찾기 ↗</a></div></div></li>`).join('') : '<li class="empty-state">아직 비어 있는 여행이에요.<br />관광지 탐색에서 마음에 드는 장소를 담아보세요.<br /><a href="explore.html" class="text-link">관광지 둘러보기 ↗</a></li>';
  renderBudget(); map.setPlaces(plan.places, { route: true });
  $('#deletePlan').disabled = !ownedItems('plans').some((item) => item.id === plan.id);
}
function renderBudget() {
  const cost = plan.places.reduce((sum, place) => sum + Number(place.cost || 0), 0);
  $('#budgetSummary').innerHTML = `총 ${plan.places.length}개 장소 · 예상 경비 <strong>${money(cost)}</strong><br />총 예산 ${money(plan.budget)} · ${cost > Number(plan.budget) ? `<span class="text-danger">${money(cost - Number(plan.budget))} 초과</span>` : `남은 예산 ${money(Number(plan.budget) - cost)}`}`;
}
function collect() {
  plan.name = $('#planName').value.trim(); plan.startDate = $('#startDate').value;
  plan.days = Number($('#days').value); plan.budget = Number($('#budget').value || 0); plan.note = $('#planNote').value.trim();
}
function save() {
  if (!$('#planForm').reportValidity()) return false;
  collect();
  if (!plan.name) { toast('여행 이름을 입력해 주세요.'); return false; }
  const invalid = plan.places.some((place) => !Number.isFinite(Number(place.cost)) || Number(place.cost) < 0 || Number(place.cost) > 1e9);
  if (invalid) { toast('장소별 비용은 0~10억 원 사이로 입력해 주세요.'); return false; }
  try {
    const user = currentUser();
    const stored = saveOwned('plans', { ...plan, draft: true });
    mutateDB((db) => db.plans.forEach((item) => { if (item.userId === user.id) item.draft = item.id === stored.id; }));
    plan = structuredClone(stored); dirty = false; render(); toast('여행 계획을 저장했어요.'); return true;
  } catch (error) { toast(error.message); return false; }
}
async function canLeave() {
  if (!dirty) return true;
  return confirmAction('저장하지 않은 변경이 있어요.', '변경을 버리고 다른 여행을 열까요?');
}
$('#planLogin').onclick = () => requireLogin(activate);
$('#savePlan').onclick = save;
$('#planForm').onsubmit = (event) => { event.preventDefault(); save(); };
$('#planForm').addEventListener('input', () => { collect(); dirty = true; renderBudget(); });
$('#days').addEventListener('change', () => { plan.places.forEach((place) => place.day = Math.min(Number(place.day), plan.days)); renderRoute(); });
$('#newPlan').onclick = async () => { if (await canLeave()) { plan = createPlan(); dirty = true; render(); } };
$('#planSelect').onchange = async () => {
  const id = $('#planSelect').value;
  if (!await canLeave()) { $('#planSelect').value = plan.id; return; }
  plan = structuredClone(ownedItems('plans').find((item) => item.id === id)); dirty = false; render();
};
$('#routeList').onclick = (event) => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.remove) plan.places = plan.places.filter((item) => item.contentid !== button.dataset.remove);
  else if (button.dataset.move !== undefined) {
    const from = Number(button.dataset.move), to = from + Number(button.dataset.direction);
    if (to < 0 || to >= plan.places.length) return;
    [plan.places[from], plan.places[to]] = [plan.places[to], plan.places[from]];
  }
  dirty = true; renderRoute();
};
$('#routeList').addEventListener('input', (event) => {
  const { field, index } = event.target.dataset; if (!field) return;
  plan.places[index][field] = ['day', 'cost'].includes(field) ? Number(event.target.value) : event.target.value;
  dirty = true; renderBudget();
});
$('#routeList').addEventListener('dragstart', (event) => {
  const card = event.target.closest('.route-item'); if (!card || event.target.closest('input,select,button')) { event.preventDefault(); return; }
  draggedId = card.dataset.id; event.dataTransfer.setData('text/plain', draggedId); event.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging');
});
$('#routeList').addEventListener('dragover', (event) => { if (draggedId && event.target.closest('.route-item')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } });
$('#routeList').addEventListener('drop', (event) => {
  event.preventDefault(); const target = event.target.closest('.route-item'); if (!target || !draggedId) return;
  const from = plan.places.findIndex((place) => place.contentid === draggedId), to = plan.places.findIndex((place) => place.contentid === target.dataset.id);
  if (from < 0 || to < 0 || from === to) return;
  const [item] = plan.places.splice(from, 1); plan.places.splice(to, 0, item); draggedId = null; dirty = true; renderRoute();
});
$('#routeList').addEventListener('dragend', () => { draggedId = null; document.querySelectorAll('.dragging').forEach((card) => card.classList.remove('dragging')); });
$('#deletePlan').onclick = async () => {
  if (!await confirmAction('이 여행을 삭제할까요?', '저장한 여행 계획과 방문 순서가 삭제됩니다.')) return;
  try { deleteOwned('plans', plan.id); plan = null; activate(); toast('여행 계획을 삭제했어요.'); } catch (error) { toast(error.message); }
};
$('#exportPlan').onclick = () => { collect(); downloadJSON('enjoytrip-plan.json', plan); };
window.addEventListener('authchange', activate);
window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
activate();
