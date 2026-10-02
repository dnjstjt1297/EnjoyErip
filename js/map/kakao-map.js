import { CONFIG, hasKey } from "../config-loader.js";
import { escapeHtml, imageMarkup, enableImageFallbacks, validCoordinates } from "../ui/helpers.js";
import { MARKER_CATEGORIES, markerCategory, markerImageUrl, markerSpec } from "./marker-categories.js";

export let map = null;
export const markers = [];
export let geocoder = null;
let infoWindow = null;
let sdkPromise;
let route = null;
const markerById = new Map();
let selectHandler = null;
let updateVersion = 0;
const geocodeCache = new Map();
let lastBounds = null;
const routeLabels = [];
const markerImages = new Map();
let selectedMarkerId = null;
let hoveredMarkerId = null;
let legend = null;
let mapResizeObserver = null;

function observeMapSize(container) {
  let width = container.clientWidth, height = container.clientHeight;
  let frame = 0;
  const relayout = () => {
    const nextWidth = container.clientWidth, nextHeight = container.clientHeight;
    if (!nextWidth || !nextHeight || (width === nextWidth && height === nextHeight)) return;
    width = nextWidth; height = nextHeight;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const selected = markerById.get(selectedMarkerId);
      const center = selected?.marker.getPosition() ?? map.getCenter();
      map.relayout();
      map.setCenter(center);
      // Reopening also lets Kakao keep the information window inside a narrow map.
      if (selected) {
        infoWindow.close();
        infoWindow.open(map, selected.marker);
      }
    });
  };
  if (typeof ResizeObserver === "function") {
    mapResizeObserver = new ResizeObserver(relayout);
    mapResizeObserver.observe(container);
  } else window.addEventListener("resize", relayout, { passive: true });
}

function categoryImage(category, state = "normal") {
  const key = `${category}:${state}`;
  if (!markerImages.has(key)) {
    const { width, height, offsetX, offsetY } = markerSpec(state);
    markerImages.set(key, new kakao.maps.MarkerImage(markerImageUrl(category, state), new kakao.maps.Size(width, height), {
      offset: new kakao.maps.Point(offsetX, offsetY),
    }));
  }
  return markerImages.get(key);
}

function updateLegend(categories = []) {
  if (!legend) return;
  legend.replaceChildren(...[...categories].map((category) => {
    const item = document.createElement("span");
    item.dataset.category = category; item.setAttribute("role", "listitem");
    const icon = document.createElement("img");
    icon.src = markerImageUrl(category); icon.alt = ""; icon.width = 20; icon.height = 24;
    item.append(icon, document.createTextNode(MARKER_CATEGORIES[category].label));
    return item;
  }));
  legend.hidden = !legend.childElementCount;
}

function refreshMarkerStyles() {
  markerById.forEach(({ marker, category }, id) => {
    const selected = id === selectedMarkerId;
    const hovered = id === hoveredMarkerId;
    marker.setImage(categoryImage(category, selected ? "selected" : hovered ? "hover" : "normal"));
    marker.setZIndex(selected ? 5 : hovered ? 4 : 1);
    marker.setOpacity(!selectedMarkerId || selected || hovered ? 1 : .65);
  });
}

// Pointer/focus previews never pan the map, open details or change selection.
export function hoverMarker(id, active = true) {
  const key = String(id);
  if (!markerById.has(key)) return false;
  if (active) hoveredMarkerId = key;
  else if (hoveredMarkerId === key) hoveredMarkerId = null;
  refreshMarkerStyles();
  return true;
}

export function loadKakaoMap() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("지도를 불러오지 못했습니다. Kakao 키와 허용 도메인을 확인하세요.")), 12000);
    const done = () => { clearTimeout(timer); resolve(); };
    const failed = () => { clearTimeout(timer); reject(new Error("지도에 연결할 수 없습니다. Kakao 키와 허용 도메인을 확인하세요.")); };
    if (window.kakao?.maps) {
      window.kakao.maps.load(done);
      return;
    }
    if (!hasKey(CONFIG.KAKAO_JAVASCRIPT_KEY)) {
      clearTimeout(timer);
      reject(new Error("지도를 이용하려면 js/config.js에 Kakao JavaScript 키를 설정하세요."));
      return;
    }

    const script = document.createElement("script");
    script.dataset.kakaoSdk = "true";
    script.async = true;
    script.src =
      `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(CONFIG.KAKAO_JAVASCRIPT_KEY)}&autoload=false&libraries=services`;
    script.addEventListener("load", () => window.kakao?.maps ? window.kakao.maps.load(done) : failed(), { once: true });
    script.addEventListener("error", failed, { once: true });
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export async function initMap(containerId = "map") {
  if (map) return map;
  const container = document.getElementById(containerId);
  if (!container) return null;
  container.innerHTML = '<div class="empty-state" role="status">지도를 불러오는 중입니다…</div>';
  try { await loadKakaoMap(); }
  catch (error) {
    container.innerHTML = `<div class="map-unavailable" role="status"><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="ui-icon"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.7"/></svg></span><strong>지도 연결이 필요해요</strong><p>${escapeHtml(error.message)}</p></div>`;
    return null;
  }
  container.replaceChildren();

  map = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(37.5665, 126.9780),
    level: 8,
  });

  infoWindow = new kakao.maps.InfoWindow({ zIndex: 3 });
  geocoder = new kakao.maps.services.Geocoder();
  legend = document.createElement("div");
  legend.id = "mapLegend"; legend.className = "map-legend"; legend.hidden = true;
  legend.setAttribute("role", "list"); legend.setAttribute("aria-label", "지도 마커 유형");
  container.after(legend);
  observeMapSize(container);

  return map;
}

export function clearMarkers() {
  updateVersion += 1;
  infoWindow?.close();
  markers.forEach((marker) => marker.setMap(null));
  markers.length = 0;
  markerById.clear();
  selectedMarkerId = null;
  hoveredMarkerId = null;
  updateLegend();
  lastBounds = null;
  routeLabels.forEach((label) => label.setMap(null));
  routeLabels.length = 0;
}

function drawMarkers(items = [], onSelect = null) {
  selectHandler = onSelect;
  const bounds = new kakao.maps.LatLngBounds();
  const categories = new Set();

  items.forEach((item) => {
    if (!validCoordinates(item.mapy, item.mapx)) return;

    const position = new kakao.maps.LatLng(Number(item.mapy), Number(item.mapx));
    const category = markerCategory(item);
    const id = String(item.contentid ?? item.id);
    const marker = new kakao.maps.Marker({
      map,
      position,
      title: `${item.title ?? "장소"} · ${MARKER_CATEGORIES[category].label}`,
      image: categoryImage(category),
    });

    kakao.maps.event.addListener(marker, "click", () => {
      focusMarker(item.contentid ?? item.id, "marker");
    });
    kakao.maps.event.addListener(marker, "mouseover", () => hoverMarker(id));
    kakao.maps.event.addListener(marker, "mouseout", () => hoverMarker(id, false));

    markers.push(marker);
    markerById.set(id, { marker, item, category });
    categories.add(category);
    bounds.extend(position);
  });
  updateLegend(categories);

  if (markers.length > 0) {
    lastBounds = bounds;
    map.setBounds(bounds);
  }
}

function findCoordinates(address) {
  if (!address || !geocoder) return Promise.resolve(null);
  if (geocodeCache.has(address)) return Promise.resolve(geocodeCache.get(address));
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (value) geocodeCache.set(address, value);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 5000);
    try {
      geocoder.addressSearch(address, (result, status) => {
        const point = result?.[0];
        finish(status === kakao.maps.services.Status.OK && validCoordinates(point?.y, point?.x)
          ? { mapx: point.x, mapy: point.y } : null);
      });
    } catch { finish(null); }
  });
}

// SSAFY flow: clear existing markers → geocode missing positions → bounds → redraw.
// The version check prevents an older geocoder callback from restoring stale markers.
export async function updateMap(infos = [], onSelect = null) {
  clearMarkers();
  route?.setMap(null);
  route = null;
  if (!map) return null;
  const version = updateVersion;
  const resolved = await Promise.all(infos.map(async (info) => {
    const item = { ...info, mapx: info.mapx ?? info.x, mapy: info.mapy ?? info.y,
      title: info.title ?? info.label, addr1: info.addr1 ?? info.address };
    if (!validCoordinates(item.mapy, item.mapx)) {
      const point = await findCoordinates(item.addr1);
      if (point) Object.assign(item, point);
    }
    return item;
  }));
  if (version !== updateVersion) return null;
  drawMarkers(resolved, onSelect);
  return resolved;
}

// Preserve the starter module's public name for existing callers.
export const renderMarkers = updateMap;

export function moveToLocation(lat, lng, level = 4) {
  if (!map || !validCoordinates(lat, lng)) return false;

  const position = new kakao.maps.LatLng(Number(lat), Number(lng));
  map.setCenter(position);
  map.setLevel(level);
  return true;
}

export function focusMarker(id, source = "card") {
  const entry = markerById.get(String(id));
  if (!entry) return false;
  const { marker, item, category } = entry;
  selectedMarkerId = String(id);
  refreshMarkerStyles();
  moveToLocation(item.mapy, item.mapx);
  const content = document.createElement("div");
  content.className = "map-info";
  content.innerHTML = `${imageMarkup(item.firstimage || item.firstimage2, item.title)}
    <span class="map-info-category" style="--marker-color:${MARKER_CATEGORIES[category].color}">${escapeHtml(MARKER_CATEGORIES[category].label)}</span>
    <strong>${escapeHtml(item.title || "관광지")}</strong><p>${escapeHtml(item.addr1 || "주소 정보 없음")}</p>`;
  enableImageFallbacks(content);
  infoWindow.setContent(content);
  infoWindow.open(map, marker);
  selectHandler?.(item, { source });
  return true;
}

export function fitAllMarkers() {
  if (!map || !lastBounds) return false;
  infoWindow?.close();
  selectedMarkerId = null; hoveredMarkerId = null;
  refreshMarkerStyles();
  map.setBounds(lastBounds);
  return true;
}

export function getMapCenter() {
  if (!map) return null;
  const center = map.getCenter();
  return { mapX: center.getLng(), mapY: center.getLat() };
}

export async function renderRoute(items = [], onSelect = null) {
  const resolved = await updateMap(items, onSelect);
  if (!resolved) return;
  const path = resolved.filter((item) => validCoordinates(item.mapy, item.mapx))
    .map((item) => new kakao.maps.LatLng(Number(item.mapy), Number(item.mapx)));
  if (path.length > 1) route = new kakao.maps.Polyline({ map, path, strokeWeight: 4, strokeColor: "#16796f", strokeOpacity: 0.85, strokeStyle: "shortdash", endArrow: true });
  // Keep the itinerary index even when a preceding place has no coordinates.
  resolved.forEach((item, index) => {
    if (!validCoordinates(item.mapy, item.mapx)) return;
    const label = document.createElement("span");
    label.className = "route-pin"; label.textContent = index + 1;
    label.setAttribute("aria-label", `${index + 1}번째 방문지: ${item.title}`);
    routeLabels.push(new kakao.maps.CustomOverlay({ map, position: new kakao.maps.LatLng(Number(item.mapy), Number(item.mapx)), content: label, yAnchor: 2, zIndex: 2 }));
  });
}

// Modal editors need a second map. Reuse the SDK and category images while
// keeping its map, marker and geocoder independent from the results/route map.
export async function createLocationPicker(containerId = "pickMap", { onSelect } = {}) {
  const container = typeof containerId === "string" ? document.getElementById(containerId) : containerId;
  if (!container) throw new Error("위치를 선택할 지도 영역을 찾을 수 없습니다.");
  await loadKakaoMap();
  container.replaceChildren();
  const pickerMap = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(37.5665, 126.978), level: 7,
  });
  const pickerGeocoder = new kakao.maps.services.Geocoder();
  let marker = null;
  function setLocation(lat, lng, { pan = true } = {}) {
    if (!validCoordinates(lat, lng)) return false;
    const position = new kakao.maps.LatLng(Number(lat), Number(lng));
    if (!marker) marker = new kakao.maps.Marker({ position, image: categoryImage("other", "selected"), title: "선택한 장소", zIndex: 10 });
    marker.setPosition(position); marker.setMap(pickerMap);
    if (pan) { pickerMap.setCenter(position); pickerMap.setLevel(4); }
    return true;
  }
  kakao.maps.event.addListener(pickerMap, "click", (event) => {
    const lat = event.latLng.getLat(), lng = event.latLng.getLng();
    setLocation(lat, lng, { pan: false });
    onSelect?.({ lat, lng });
  });
  return {
    map: pickerMap,
    setLocation,
    clear() { marker?.setMap(null); },
    relayout() {
      const center = pickerMap.getCenter();
      pickerMap.relayout(); pickerMap.setCenter(center);
    },
    searchAddress(address) {
      const text = String(address ?? "").trim();
      if (!text) return Promise.reject(new Error("찾을 주소를 입력하세요."));
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (point) => {
          if (settled) return;
          settled = true; clearTimeout(timer);
          if (point) resolve(point);
          else reject(new Error("주소를 찾을 수 없습니다. 도로명 주소를 확인하거나 지도에서 직접 선택하세요."));
        };
        const timer = setTimeout(() => finish(null), 8000);
        try {
          pickerGeocoder.addressSearch(text, (result, status) => {
            const point = result?.[0];
            finish(status === kakao.maps.services.Status.OK && validCoordinates(point?.y, point?.x)
              ? { mapx: Number(point.x), mapy: Number(point.y) } : null);
          });
        } catch { finish(null); }
      });
    },
  };
}
