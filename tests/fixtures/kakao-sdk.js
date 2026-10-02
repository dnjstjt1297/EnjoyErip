// Deterministic SDK substitute for browser tests only. Never loaded by the app.
(() => {
  const state = window.__mapTest = { maps: [], markers: [], markerImages: [], routes: [], geocodes: [], bounds: [], geoDelay: 10 };
  const listeners = new WeakMap();
  class LatLng {
    constructor(lat, lng) { this.lat = Number(lat); this.lng = Number(lng); }
    getLat() { return this.lat; }
    getLng() { return this.lng; }
  }
  class Map {
    constructor(container, options) {
      this.container = container; this.center = options.center; this.level = options.level;
      container.style.position = 'relative';
      container.style.background = 'repeating-linear-gradient(0deg, #e8f0e9, #e8f0e9 39px, #d4e1d8 40px)';
      const label = document.createElement('div');
      label.style.cssText = 'padding:14px;color:#4c6959;font-size:13px;';
      label.textContent = '테스트용 모의 지도 · 실제 Kakao 지도 아님';
      container.append(label); state.maps.push(this);
    }
    setCenter(center) { this.center = center; }
    getCenter() { return this.center; }
    setLevel(level) { this.level = level; }
    setBounds(bounds) { this.bounds = bounds; state.bounds.push(bounds.points.length); }
    relayout() { this.relayoutCount = (this.relayoutCount || 0) + 1; }
  }
  class Size {
    constructor(width, height) { this.width = width; this.height = height; }
  }
  class Point {
    constructor(x, y) { this.x = x; this.y = y; }
  }
  class MarkerImage {
    constructor(src, size, options = {}) { this.src = src; this.size = size; this.options = options; state.markerImages.push(this); }
  }
  class Marker {
    constructor(options) {
      this.position = options.position; this.title = options.title;
      this.element = document.createElement('button');
      this.element.type = 'button'; this.element.textContent = '●';
      this.element.setAttribute('aria-label', `모의 마커 ${options.title || ''}`);
      const index = state.markers.length;
      this.element.style.cssText = `position:absolute;left:${12+(index%5)*16}%;top:${20+Math.floor(index%12/5)*24}%;color:#16796f;background:white;border:2px solid #16796f;border-radius:50%;width:32px;height:32px;`;
      this.element.addEventListener('click', () => event.trigger(this, 'click'));
      this.element.addEventListener('mouseenter', () => event.trigger(this, 'mouseover'));
      this.element.addEventListener('mouseleave', () => event.trigger(this, 'mouseout'));
      if (options.image) this.setImage(options.image);
      state.markers.push(this); this.setMap(options.map || null);
    }
    setMap(map) { this.map = map; this.element.remove(); if (map) map.container.append(this.element); }
    setPosition(position) { this.position = position; }
    setZIndex(index) { this.element.style.zIndex = index; }
    setOpacity(opacity) { this.element.style.opacity = opacity; }
    setImage(image) {
      this.image = image;
      this.element.textContent = '';
      this.element.style.background = `url("${image.src}") center / contain no-repeat`;
      this.element.style.border = '0';
      this.element.style.width = `${image.size.width}px`; this.element.style.height = `${image.size.height}px`;
    }
    getImage() { return this.image; }
    getPosition() { return this.position; }
  }
  class LatLngBounds {
    points = [];
    extend(point) { this.points.push(point); }
  }
  class InfoWindow {
    constructor() { this.element = document.createElement('div'); this.element.className = 'mock-info'; this.element.style.cssText = 'position:absolute;right:8px;bottom:8px;background:white;border:1px solid #ccc;z-index:20;border-radius:8px;'; }
    setContent(content) { this.element.replaceChildren(); if (typeof content === 'string') this.element.innerHTML = content; else this.element.append(content); }
    open(map, marker) { this.marker = marker; map.container.append(this.element); }
    close() { this.element.remove(); }
  }
  class Polyline {
    constructor(options) { this.path = options.path; this.map = options.map; state.routes.push(this); }
    setMap(map) { this.map = map; }
  }
  class CustomOverlay {
    constructor(options) { this.element = options.content; this.element.style.cssText = 'position:absolute;left:15%;top:15%;'; this.setMap(options.map); }
    setMap(map) { this.map = map; this.element.remove(); if (map) map.container.append(this.element); }
  }
  class Geocoder {
    addressSearch(address, callback) {
      state.geocodes.push(address);
      setTimeout(() => address.includes('변환 성공') ? callback([{ x: '126.985', y: '37.581' }], 'OK') : callback([], 'ZERO_RESULT'), state.geoDelay);
    }
  }
  const event = {
    addListener(target, type, callback) { const entries = listeners.get(target) || {}; (entries[type] ||= []).push(callback); listeners.set(target, entries); },
    trigger(target, type, value) { for (const callback of listeners.get(target)?.[type] || []) callback(value); },
  };
  window.kakao = { maps: { load: (done) => setTimeout(done, 0), Map, Marker, MarkerImage, Size, Point, LatLng, LatLngBounds, InfoWindow, Polyline, CustomOverlay, event, services: { Geocoder, Status: { OK: 'OK' } } } };
})();
