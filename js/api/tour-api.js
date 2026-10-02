import { CONFIG, hasKey } from "../config-loader.js";
import { validCoordinates } from "../ui/helpers.js";

export const CONTENT_TYPES = Object.freeze({
  TOURIST_SPOT: 12,
  CULTURAL: 14,
  FESTIVAL: 15,
  TRAVEL_COURSE: 25,
  LEPORTS: 28,
  ACCOMMODATION: 32,
  SHOPPING: 38,
  RESTAURANT: 39,
});

export const CONTENT_TYPE_NAMES = Object.freeze({
  12: "관광지", 14: "문화시설", 15: "축제/공연/행사", 25: "여행코스",
  28: "레포츠", 32: "숙박", 38: "쇼핑", 39: "음식점",
});

export function buildUrl(path, params = {}) {
  const url = new URL(`${CONFIG.TOUR_API_BASE_URL}/${path}`);

  if (!hasKey(CONFIG.TOUR_API_SERVICE_KEY)) throw new Error("관광 정보를 불러오려면 js/config.js에 TourAPI 인증키를 설정하세요.");
  let key = CONFIG.TOUR_API_SERVICE_KEY.trim();
  try { key = decodeURIComponent(key); } catch { /* already decoded */ }
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("MobileOS", CONFIG.MOBILE_OS);
  url.searchParams.set("MobileApp", CONFIG.MOBILE_APP);
  url.searchParams.set("_type", "json");

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  return url;
}

export function extractItems(data) {
  const item = (data?.response ?? data)?.body?.items?.item;
  if (!item) return [];
  return (Array.isArray(item) ? item : [item]).filter((value) => value && typeof value === "object");
}

export function responseBody(data) { return (data?.response ?? data)?.body; }

async function request(path, params, { signal } = {}) {
  const url = buildUrl(path, params);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 15000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`관광 정보 요청에 실패했습니다. (HTTP ${response.status})`);
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); }
    catch {
      const code = text.match(/<(?:returnReasonCode|resultCode)>([^<]*)</)?.[1];
      throw new Error(`TourAPI 인증 또는 응답 오류${code ? ` (${code})` : ""}. 인증키와 활용신청 상태를 확인하세요.`);
    }
    const root = data.response ?? data;
    const code = String(root.header?.resultCode ?? "");
    if (!["00", "0000", "0"].includes(code)) throw new Error(`TourAPI 오류 (${code || "응답 형식"}). 인증키·호출 한도를 확인하고 다시 시도하세요.`);
    if (!root.body || typeof root.body !== "object") throw new Error("관광 정보 응답 형식이 올바르지 않습니다.");
    return data;
  } catch (error) {
    if (signal?.aborted) throw new DOMException("요청 취소", "AbortError");
    if (controller.signal.aborted) throw new Error("관광 정보 응답 시간이 초과되었습니다. 다시 검색하세요.");
    if (error instanceof TypeError) throw new Error("관광 정보에 연결할 수 없습니다. 네트워크 상태를 확인하세요.");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export async function fetchAreaCodes(options) {
  return request("ldongCode2", {
    numOfRows: 100,
    pageNo: 1,
    lDongListYn: "N",
  }, options);
}

export async function fetchSigunguCodes(areaCode, options) {
  return request("ldongCode2", {
    numOfRows: 100,
    pageNo: 1,
    lDongRegnCd: areaCode,
    lDongListYn: "N",
  }, options);
}

// Same cascading classification request used in the SSAFY enjoytrip.js example.
export function fetchClassificationCodes({ lclsSystm1, lclsSystm2 } = {}, options) {
  return request("lclsSystmCode2", {
    numOfRows: 1000, pageNo: 1, lclsSystmListYn: "N", lclsSystm1,
    lclsSystm2: lclsSystm1 ? lclsSystm2 : undefined,
  }, options);
}

export async function fetchLocationBasedList({
  areaCode,
  sigunguCode,
  contentTypeId,
  arrange = "A",
  numOfRows = 30,
  pageNo = 1,
  mapX,
  mapY,
  radius = 10000,
  lclsSystm1,
  lclsSystm2,
  lclsSystm3,
  keyword = "",
}, options) {
  if (!["A", "C", "D", "E"].includes(arrange)) throw new Error("지원하지 않는 정렬 방식입니다.");
  if (contentTypeId && !Object.values(CONTENT_TYPES).includes(Number(contentTypeId))) throw new Error("관광 유형을 확인하세요.");
  const distance = arrange === "E";
  if (distance && (!validCoordinates(mapY, mapX) || !(radius > 0 && radius <= 20000))) {
    throw new Error("거리순 검색에는 기준 위치와 20km 이내의 반경이 필요합니다.");
  }
  keyword = String(keyword).trim();
  if (keyword.length > 80) throw new Error("검색어는 80자 이내로 입력하세요.");
  const filters = {
    lDongRegnCd: areaCode,
    lDongSignguCd: areaCode ? sigunguCode : undefined,
    contentTypeId,
    lclsSystm1,
    lclsSystm2: lclsSystm1 ? lclsSystm2 : undefined,
    lclsSystm3: lclsSystm1 && lclsSystm2 ? lclsSystm3 : undefined,
  };
  // Wonseok's keyword/area routing, adapted to our existing direct API client.
  // searchKeyword2 does not support E; combine the complete keyword result with
  // distance locally instead of silently dropping either keyword or sorting.
  if (keyword && distance) return keywordDistanceList({ ...filters, keyword }, { mapX, mapY, radius, numOfRows, pageNo }, options);
  return request(keyword ? "searchKeyword2" : distance ? "locationBasedList2" : "areaBasedList2", {
    ...filters,
    numOfRows,
    pageNo,
    arrange,
    keyword: keyword || undefined,
    ...(distance ? { mapX, mapY, radius } : {}),
  }, options);
}

const keywordCache = new Map();
const KEYWORD_DISTANCE_LIMIT = 1000;
export function distanceInMeters(lat1, lng1, lat2, lng2) {
  const radians = (value) => value * Math.PI / 180;
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lng2 - lng1) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

async function keywordDistanceList(filters, { mapX, mapY, radius, numOfRows, pageNo }, options = {}) {
  const key = JSON.stringify(filters);
  const previous = keywordCache.get(key);
  let all = previous && Date.now() - previous.at < 60000 ? previous.items : null;
  if (!all) {
    all = [];
    let total = 1;
    for (let page = 1; all.length < total; page++) {
      const data = await request("searchKeyword2", { ...filters, arrange: "A", numOfRows: 100, pageNo: page }, options);
      const batch = extractItems(data);
      total = Number(responseBody(data).totalCount) || 0;
      if (total > KEYWORD_DISTANCE_LIMIT) throw new Error("거리순으로 비교할 검색 결과가 많아요. 검색어·지역·관광 유형을 좁혀 1,000곳 이하로 다시 검색해 주세요.");
      if (!batch.length && all.length < total) throw new Error("검색 결과를 끝까지 불러오지 못했습니다. 다시 검색해 주세요.");
      all.push(...batch);
      if (!total) break;
    }
    if (options.signal?.aborted) throw new DOMException("요청 취소", "AbortError");
    // A bounded, short-lived cache keeps pagination from refetching every match.
    if (keywordCache.size >= 4) keywordCache.delete(keywordCache.keys().next().value);
    keywordCache.set(key, { items: all, at: Date.now() });
  }
  if (options.signal?.aborted) throw new DOMException("요청 취소", "AbortError");
  const places = all.filter((item) => validCoordinates(item.mapy, item.mapx))
    .map((item) => ({ ...item, dist: distanceInMeters(Number(mapY), Number(mapX), Number(item.mapy), Number(item.mapx)) }))
    .filter((item) => item.dist <= Number(radius))
    .sort((a, b) => a.dist - b.dist || String(a.title).localeCompare(String(b.title), "ko"));
  const start = (Number(pageNo) - 1) * Number(numOfRows);
  return { response: { header: { resultCode: "0000" }, body: {
    items: { item: places.slice(start, start + Number(numOfRows)) }, totalCount: places.length, pageNo, numOfRows,
  } } };
}

export function fetchTourDetail(contentId, options) {
  return request("detailCommon2", { contentId, numOfRows: 1, pageNo: 1 }, options);
}
