import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, submit, waitFor } from './helpers.mjs';

test('지역·유형 조건 전달, 관광지 상세, 찜/여행 추가, 로그인 정보에 따른 저장', async () => {
  setupDOM('explore');
  const store = await import('../frontend/assets/js/storage.js'); store.mutateDB((db) => db.users.push({ id: 'a', name: '여행자' })); store.setSession('a');
  const requests = [];
  const place = { contentid: '100', contenttypeid: '12', areacode: '1', sigungucode: '1', title: '경복궁', addr1: '서울', mapx: '126.98', mapy: '37.57' };
  globalThis.fetch = async (address) => {
    const url = new URL(address, location.origin); requests.push(url);
    let data;
    if (url.pathname === '/api/config') data = { kakaoMapKey: '' };
    else if (url.pathname === '/api/tour/areas') data = { items: [{ code: '1', name: '서울' }] };
    else if (url.pathname === '/api/tour/detail') data = { detail: { ...place, overview: '<b>고궁 소개</b><script>bad()</script>' }, intro: {}, images: [] };
    else data = { items: [place], total: 1, page: 1 };
    return { ok: true, json: async () => data };
  };
  await import('../frontend/assets/js/explore.js');
  assert.equal(document.querySelector('.place-title').textContent, '경복궁');
  document.getElementById('contentType').value = '12'; submit('searchForm'); await waitFor(() => !document.getElementById('searchButton').disabled);
  assert.ok(requests.some((url) => url.pathname === '/api/tour/list' && url.searchParams.get('contentTypeId') === '12'));
  document.querySelector('[data-save]').click(); assert.equal(store.ownedItems('favorites').length, 1);
  document.querySelector('[data-plan]').click(); assert.equal(store.ownedItems('plans')[0].places[0].title, '경복궁');
  document.querySelector('[data-detail]').click(); await waitFor(() => document.getElementById('placeTitle'));
  assert.equal(document.querySelectorAll('#placeDetail script').length, 0); assert.match(document.querySelector('.overview').textContent, /고궁 소개/);
  document.getElementById('placeDialog').close(); document.querySelector('[data-save]').click(); assert.equal(store.ownedItems('favorites').length, 0);
});
