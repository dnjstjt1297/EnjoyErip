import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM } from './helpers.mjs';

test('여행 경로 정렬, 일차/비용 수정, 저장 후 유지, 장소 삭제', async () => {
  setupDOM('planner');
  const store = await import('../frontend/assets/js/storage.js');
  store.mutateDB((db) => db.users.push({ id: 'a', name: '여행자' })); store.setSession('a');
  store.addPlanPlace({ contentid: '1', title: '첫 번째', addr1: '서울', mapx: 127, mapy: 37 });
  store.addPlanPlace({ contentid: '2', title: '두 번째', addr1: '서울', mapx: 127.1, mapy: 37.1 });
  await import('../frontend/assets/js/planner.js');
  document.querySelector('[data-move="0"][data-direction="1"]').click();
  assert.equal(document.querySelector('.route-item').dataset.id, '2');
  document.getElementById('days').value = '2'; document.getElementById('days').dispatchEvent(new window.Event('input', { bubbles: true })); document.getElementById('days').dispatchEvent(new window.Event('change'));
  const day = document.getElementById('day-0'); day.value = '2'; day.dispatchEvent(new window.Event('input', { bubbles: true }));
  const cost = document.getElementById('cost-0'); cost.value = '5000'; cost.dispatchEvent(new window.Event('input', { bubbles: true }));
  document.getElementById('planName').value = '서울 여행'; document.getElementById('savePlan').click();
  const plan = store.ownedItems('plans')[0]; assert.equal(plan.name, '서울 여행'); assert.equal(plan.places[0].contentid, '2'); assert.equal(plan.places[0].day, 2); assert.equal(plan.places[0].cost, 5000);
  document.querySelector('[data-remove="2"]').click(); document.getElementById('savePlan').click(); assert.equal(store.ownedItems('plans')[0].places.length, 1);
});
