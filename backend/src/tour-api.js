const fs = require('node:fs');
const path = require('node:path');

const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim();
  }
}
const base = process.env.TOUR_API_BASE || 'https://apis.data.go.kr/B551011/KorService2';
const cache = new Map();
const asList = (item) => !item ? [] : Array.isArray(item) ? item : [item];

async function tourRequest(operation, params = {}) {
  if (!process.env.TOUR_API_KEY) throw new Error('공공데이터 API 키가 설정되지 않았습니다. .env를 확인해 주세요.');
  const url = new URL(`${base}/${operation}`);
  url.search = new URLSearchParams({ serviceKey: process.env.TOUR_API_KEY, MobileOS: 'ETC', MobileApp: 'EnjoyTrip', _type: 'json', ...params });
  const cacheKey = operation + JSON.stringify(params);
  const previous = cache.get(cacheKey);
  if (previous && Date.now() - previous.at < 300_000) return previous.body;
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`관광정보 서버에서 응답하지 않았습니다. (${response.status})`);
  let data;
  try { data = await response.json(); } catch { throw new Error('공공데이터 API 응답을 읽을 수 없습니다. 활용 신청과 키 승인을 확인해 주세요.'); }
  const header = data.response?.header;
  if (!['0000', '00'].includes(header?.resultCode)) throw new Error(`관광정보 조회에 실패했습니다. (${header?.resultCode || '응답 오류'})`);
  const body = data.response.body;
  const normalized = { items: asList(body?.items?.item), total: Number(body?.totalCount || 0), page: Number(body?.pageNo || 1) };
  if (cache.size > 150) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, { at: Date.now(), body: normalized });
  return normalized;
}

function safeParameters(search, names) {
  const result = {};
  for (const name of names) {
    const value = search.get(name);
    if (!value) continue;
    if (!/^\d{1,12}$/.test(value)) throw new Error('검색 조건이 올바르지 않습니다.');
    result[name] = value;
  }
  return result;
}

async function handleTourApi(request, response, url) {
  if (!url.pathname.startsWith('/api/tour/') && url.pathname !== '/api/config') return false;
  const json = (status, data) => {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(data));
  };
  if (request.method !== 'GET') { json(405, { message: 'GET 요청만 지원합니다.' }); return true; }
  try {
    if (url.pathname === '/api/config') {
      json(200, { kakaoMapKey: process.env.KAKAO_MAP_KEY || '', tourConfigured: Boolean(process.env.TOUR_API_KEY) });
    } else if (url.pathname === '/api/tour/areas') {
      json(200, await tourRequest('areaCode2', { numOfRows: '100', pageNo: '1', ...safeParameters(url.searchParams, ['areaCode']) }));
    } else if (url.pathname === '/api/tour/list') {
      const params = safeParameters(url.searchParams, ['areaCode', 'sigunguCode', 'contentTypeId']);
      const page = Math.min(10000, Math.max(1, Number(url.searchParams.get('pageNo')) || 1));
      const count = Math.min(48, Math.max(1, Number(url.searchParams.get('numOfRows')) || 12));
      Object.assign(params, { pageNo: String(Math.floor(page)), numOfRows: String(Math.floor(count)), arrange: 'A' });
      const keyword = (url.searchParams.get('keyword') || '').trim().slice(0, 80);
      if (keyword) params.keyword = keyword;
      json(200, await tourRequest(keyword ? 'searchKeyword2' : 'areaBasedList2', params));
    } else if (url.pathname === '/api/tour/detail') {
      const params = safeParameters(url.searchParams, ['contentId', 'contentTypeId']);
      if (!params.contentId) { json(400, { message: '관광지 번호가 필요합니다.' }); return true; }
      const common = await tourRequest('detailCommon2', { contentId: params.contentId });
      const [intro, images] = await Promise.allSettled([
        params.contentTypeId ? tourRequest('detailIntro2', params) : Promise.resolve({ items: [] }),
        tourRequest('detailImage2', { contentId: params.contentId, imageYN: 'Y', subImageYN: 'Y', numOfRows: '10' }),
      ]);
      json(200, { detail: common.items[0] || null, intro: intro.status === 'fulfilled' ? intro.value.items[0] || {} : {}, images: images.status === 'fulfilled' ? images.value.items : [] });
    } else { json(404, { message: '지원하지 않는 관광정보 요청입니다.' }); }
  } catch (error) {
    const message = error.name === 'TimeoutError' ? '관광정보 조회 시간이 초과되었습니다. 다시 시도해 주세요.' : error.message;
    json(502, { message });
  }
  return true;
}

module.exports = { handleTourApi, tourRequest };
