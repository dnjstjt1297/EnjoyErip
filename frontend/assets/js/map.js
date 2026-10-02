import { api } from './api.js';
import { escapeHTML } from './ui.js';
import { MARKER_CATEGORIES, markerCategory } from './marker-categories.js';
let sdkPromise;

function loadSDK() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = api('config').then(({ kakaoMapKey }) => new Promise((resolve, reject) => {
    if (!kakaoMapKey) { reject(new Error('카카오 지도 키가 설정되지 않았습니다.')); return; }
    const script = document.createElement('script');
    const timer = setTimeout(() => reject(new Error('카카오 지도 연결 시간이 초과되었습니다.')), 15000);
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(kakaoMapKey)}&autoload=false&libraries=services`;
    script.onload = () => {
      if (!window.kakao?.maps?.load) { clearTimeout(timer); reject(new Error('카카오 지도 SDK를 불러올 수 없습니다.')); return; }
      window.kakao.maps.load(() => { clearTimeout(timer); resolve(window.kakao.maps); });
    };
    script.onerror = () => { clearTimeout(timer); reject(new Error('카카오 지도 인증에 실패했습니다. JavaScript 키와 등록 도메인을 확인해 주세요.')); };
    document.head.append(script);
  }));
  return sdkPromise;
}
export class TravelMap {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.options = options; this.markers = []; this.places = []; this.ready = this.initialize();
    this.markerImages = new Map();
  }
  async initialize() {
    try {
      const maps = await loadSDK(); this.maps = maps;
      this.container.replaceChildren();
      this.map = new maps.Map(this.container, { center: new maps.LatLng(36.35, 127.8), level: 13 });
      this.info = new maps.InfoWindow({ removable: true, zIndex: 5 });
      this.map.addControl(new maps.ZoomControl(), maps.ControlPosition.RIGHT);
      if (this.options.onClick) maps.event.addListener(this.map, 'click', (event) => this.options.onClick({ mapy: event.latLng.getLat(), mapx: event.latLng.getLng() }));
      if ('ResizeObserver' in window) new ResizeObserver(() => this.map.relayout()).observe(this.container);
      return true;
    } catch (error) {
      this.container.innerHTML = `<div class="map-fallback"><span>⌖</span><strong>지도를 연결하지 못했어요.</strong><p>${escapeHTML(error.message)}</p><p>카카오 개발자 콘솔에서 이 주소를 등록해 주세요.<br /><code>${escapeHTML(location.origin)}</code></p><a href="https://developers.kakao.com/console/app" target="_blank" rel="noopener">카카오 개발자 콘솔 ↗</a></div>`;
      return false;
    }
  }
  async setPlaces(places, { route = false } = {}) {
    const version = this.version = (this.version || 0) + 1;
    this.places = places;
    if (!await this.ready || version !== this.version) return;
    this.markers.forEach((marker) => marker.setMap(null)); this.markers = [];
    this.line?.setMap(null); this.info.close();
    const bounds = new this.maps.LatLngBounds();
    const path = [];
    const categories = new Set();
    places.forEach((place, index) => {
      const lat = Number(place.mapy), lng = Number(place.mapx);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 30 || lat > 40 || lng < 123 || lng > 133) return;
      const position = new this.maps.LatLng(lat, lng); path.push(position); bounds.extend(position);
      const category = markerCategory(place); categories.add(category);
      if (!this.markerImages.has(category)) {
        this.markerImages.set(category, new this.maps.MarkerImage(`/assets/images/markers/${category}.svg`, new this.maps.Size(40, 48), { offset: new this.maps.Point(20, 45) }));
      }
      const marker = new this.maps.Marker({ position, map: this.map, image: this.markerImages.get(category), title: `${route ? index + 1 + '. ' : ''}${place.title} · ${MARKER_CATEGORIES[category].label}` });
      this.maps.event.addListener(marker, 'click', () => { this.focus(place); this.options.onSelect?.(place); });
      this.markers.push(marker);
    });
    this.updateLegend(categories);
    if (path.length === 1) { this.map.setCenter(path[0]); this.map.setLevel(5); }
    else if (path.length) this.map.setBounds(bounds);
    if (route && path.length > 1) this.line = new this.maps.Polyline({ map: this.map, path, strokeWeight: 4, strokeColor: '#087f91', strokeOpacity: .8, strokeStyle: 'shortdash' });
  }
  updateLegend(categories) {
    if (!this.legend) {
      this.legend = document.createElement('div');
      this.legend.className = 'map-legend';
      this.legend.setAttribute('aria-label', '지도 마커 카테고리');
      this.container.after(this.legend);
    }
    this.legend.hidden = !categories.size;
    this.legend.replaceChildren(...[...categories].map((id) => {
      const item = document.createElement('span');
      const icon = document.createElement('img');
      icon.src = `/assets/images/markers/${id}.svg`; icon.alt = ''; icon.width = 20; icon.height = 24;
      item.append(icon, document.createTextNode(MARKER_CATEGORIES[id].label));
      return item;
    }));
  }
  async focus(place) {
    if (!await this.ready) return;
    if (!Number(place.mapy) || !Number(place.mapx)) return;
    const position = new this.maps.LatLng(Number(place.mapy), Number(place.mapx));
    this.map.panTo(position);
    const content = `<div class="map-info"><strong>${escapeHTML(place.title)}</strong><span>${escapeHTML(place.addr1 || '')}</span></div>`;
    this.info.setContent(content); this.info.setPosition(position); this.info.open(this.map);
  }
  async searchAddress(address) {
    if (!await this.ready) throw new Error('지도가 연결되지 않았습니다. 좌표를 직접 입력해 주세요.');
    return new Promise((resolve, reject) => new this.maps.services.Geocoder().addressSearch(address, (result, status) => {
      if (status !== this.maps.services.Status.OK || !result.length) reject(new Error('주소를 찾을 수 없습니다. 도로명 주소를 확인해 주세요.'));
      else resolve({ mapx: Number(result[0].x), mapy: Number(result[0].y) });
    }));
  }
}
