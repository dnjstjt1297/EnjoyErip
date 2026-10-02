import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, submit, waitFor } from './helpers.mjs';

test('핫플레이스 사진 검증, 등록/조회/수정, 회원 소유권', async () => {
  setupDOM('hotplace');
  const store = await import('../frontend/assets/js/storage.js'); store.mutateDB((db) => db.users.push({ id: 'a', name: '여행자' })); store.setSession('a');
  await import('../frontend/assets/js/hotplace.js');
  document.getElementById('newHotplace').click();
  const photo = document.getElementById('hotPhoto'); Object.defineProperty(photo, 'files', { configurable: true, value: [new window.File(['<svg/>'], 'bad.svg', { type: 'image/svg+xml' })] }); photo.dispatchEvent(new window.Event('change'));
  await waitFor(() => document.getElementById('toast').textContent.includes('JPEG'));
  const saved = store.saveOwned('hotplaces', { name: '나만의 카페', address: '서울', type: '카페·음식점', mapx: 127, mapy: 37, visitDate: '2026-10-02', description: '<script>unsafe()</script>', photo: 'data:image/jpeg;base64,YQ==' });
  window.dispatchEvent(new CustomEvent('authchange')); assert.ok(document.getElementById('hotList').textContent.includes('나만의 카페'));
  document.querySelector('[data-detail]').click(); assert.equal(document.querySelectorAll('#hotDetail script').length, 0);
  document.getElementById('editHot').click(); document.getElementById('hotName').value = '수정한 카페'; submit('hotForm'); assert.equal(store.readDB().hotplaces[0].name, '수정한 카페'); assert.equal(store.readDB().hotplaces[0].id, saved.id);
  globalThis.fetch = async (address) => {
    const url = new URL(address, location.origin);
    const data = url.pathname.endsWith('/areas') ? { items: [{ code: '1', name: '서울' }] } : { items: [{ contentid: '123', contenttypeid: '12', title: '경복궁', addr1: '서울 종로구 사직로 161', mapx: '126.9769', mapy: '37.5796', areacode: '1' }], total: 1 };
    return { ok: true, json: async () => data };
  };
  document.querySelector('[data-detail]').click(); document.getElementById('editHot').click();
  document.getElementById('hotTourKeyword').value = '경복궁'; document.getElementById('hotTourSearch').click();
  await waitFor(() => document.querySelector('[data-tour-select]'));
  document.querySelector('[data-tour-select]').click();
  assert.equal(document.getElementById('hotName').value, '경복궁');
  assert.equal(document.getElementById('hotAddress').value, '서울 종로구 사직로 161');
  assert.equal(Number(document.getElementById('hotLat').value), 37.5796);
  assert.equal(Number(document.getElementById('hotLng').value), 126.9769);
  assert.equal(document.getElementById('hotTourSelected').hidden, false);
  submit('hotForm'); assert.equal(store.readDB().hotplaces[0].touristPlace.contentid, '123');
  document.querySelector('[data-detail]').click(); document.getElementById('editHot').click();
  assert.match(document.getElementById('hotTourSelectedLabel').textContent, /경복궁/);
  document.getElementById('clearTourSelection').click(); submit('hotForm'); assert.equal(store.readDB().hotplaces[0].touristPlace, null);
});
